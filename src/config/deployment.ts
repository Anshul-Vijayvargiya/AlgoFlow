/**
 * Deployment rules for the front end, shared by vite.config.ts (build time) and src/api (runtime).
 * Pure functions with no imports, so both the Node config project and the app project can use them.
 *
 * - VITE_USE_MOCK_API=true swaps the backend for an in-browser mock that signs every visitor in as a demo user.
 *   It is allowed only in `--mode e2e` builds (Playwright) and in the dev server.
 * - Every other build must name its API explicitly with VITE_API_BASE_URL: either a root-relative path such as
 *   `/api` (front end and API behind one origin) or an absolute https URL such as `https://api.example.com/api`.
 * - E2E builds must go to `dist-e2e/` and nothing else may; every build writes `build-info.json`, and
 *   `npm run verify:artifact -- <dir>` (assessArtifact below) accepts only deployable production bundles.
 */
export const E2E_MODE = 'e2e';
export const E2E_OUT_DIR = 'dist-e2e';
export const BUILD_INFO_FILE = 'build-info.json';
const DEV_API_BASE = '/api';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

type Result = { ok: true; value: string } | { ok: false; error: string };

export function validateApiBaseUrl(raw: string | undefined): Result {
  const value = raw?.trim();
  if (!value) {
    return {
      ok: false,
      error:
        'VITE_API_BASE_URL must be set for deployed builds: "/api" when the API is served from the same origin, ' +
        'or an absolute https URL such as "https://api.example.com/api".',
    };
  }

  if (value.startsWith('/') && !value.startsWith('//')) {
    const path = value.replace(/\/+$/, '');
    if (!path || /[?#]/.test(path)) return { ok: false, error: `VITE_API_BASE_URL "${value}" must be a path such as /api.` };
    return { ok: true, value: path };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: `VITE_API_BASE_URL "${value}" is neither a root-relative path nor an absolute URL.` };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { ok: false, error: 'VITE_API_BASE_URL must not contain credentials, a query string or a fragment.' };
  }
  const isLocalHttp = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    return { ok: false, error: 'VITE_API_BASE_URL must use https:// (plain http is accepted only for localhost).' };
  }
  return { ok: true, value: `${url.origin}${url.pathname.replace(/\/+$/, '')}` };
}

export interface BuildCheckInput {
  command: 'build' | 'serve';
  mode: string;
  /** VITE_* variables as Vite will expose them to the bundle */
  env: Record<string, string | undefined>;
  /** Effective NODE_ENV for the build (env files + process environment); undefined lets Vite use production */
  nodeEnv?: string;
}

/** Errors that must stop `vite build`; empty when the build is safe. The dev server is never blocked. */
export function checkBuildConfig({ command, mode, env, nodeEnv }: BuildCheckInput): string[] {
  if (command !== 'build') return [];
  if (mode === E2E_MODE) {
    // An e2e build exists only for the Playwright suite, which runs on the mock API
    return env.VITE_USE_MOCK_API === 'true'
      ? []
      : [`--mode ${E2E_MODE} builds are only for the Playwright suite and require VITE_USE_MOCK_API=true.`];
  }

  const errors: string[] = [];
  if (nodeEnv !== undefined && nodeEnv !== 'production') {
    // Vite then emits a development bundle: import.meta.env.DEV=true (dev-only UI such as the demo-credentials
    // button ships), the development React runtime, and PROD=false (which disables resolveApiRuntime's mock check).
    errors.push(`NODE_ENV=${nodeEnv} would produce a development bundle. Unset it (or set NODE_ENV=production) for builds.`);
  }
  if (env.VITE_USE_MOCK_API === 'true') {
    errors.push(
      'VITE_USE_MOCK_API=true is not allowed in a deployable build: the mock API signs every visitor in as a demo ' +
        `user. Mock builds are only allowed with --mode ${E2E_MODE} (the Playwright suite).`
    );
  }
  const api = validateApiBaseUrl(env.VITE_API_BASE_URL);
  if (!api.ok) errors.push(api.error);
  return errors;
}

export interface RuntimeEnv {
  PROD: boolean;
  MODE: string;
  VITE_USE_MOCK_API?: string;
  VITE_API_BASE_URL?: string;
}

/** Runtime counterpart of checkBuildConfig: refuses to start a mis-built bundle instead of silently faking auth. */
export function resolveApiRuntime(env: RuntimeEnv): { useMock: boolean; baseUrl: string } {
  const useMock = env.VITE_USE_MOCK_API === 'true';
  const deployable = env.PROD && env.MODE !== E2E_MODE;
  if (useMock && deployable) {
    throw new Error('This build was made with the mock API enabled and must not be deployed.');
  }
  if (!env.VITE_API_BASE_URL && !deployable) return { useMock, baseUrl: DEV_API_BASE };

  const api = validateApiBaseUrl(env.VITE_API_BASE_URL);
  if (!api.ok) throw new Error(api.error);
  return { useMock, baseUrl: api.value };
}

/** Last path segment of an output directory, for either path separator. */
function lastSegment(dir: string): string {
  return dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
}

/**
 * Checked against Vite's resolved `build.outDir` (the CLI --outDir is not visible to the config function): an e2e
 * (mock API) bundle can only be written to dist-e2e, and dist-e2e only ever holds e2e bundles.
 */
export function checkOutputDir({ mode, outDir }: { mode: string; outDir: string }): string[] {
  const isE2eDir = lastSegment(outDir) === E2E_OUT_DIR;
  if (mode === E2E_MODE && !isE2eDir) {
    return [`--mode ${E2E_MODE} (mock API) builds may only be written to ${E2E_OUT_DIR}/, not "${outDir}".`];
  }
  if (mode !== E2E_MODE && isE2eDir) {
    return [`${E2E_OUT_DIR}/ is reserved for --mode ${E2E_MODE} builds; write "${mode}" builds elsewhere (e.g. dist/).`];
  }
  return [];
}

export interface BuildInfo {
  app: 'algoflow';
  mode: string;
  mockApi: boolean;
  deployable: boolean;
}

/** Written into every build as build-info.json. Contains no secrets. */
export function createBuildInfo(mode: string, env: Record<string, string | undefined>): BuildInfo {
  const mockApi = env.VITE_USE_MOCK_API === 'true';
  return { app: 'algoflow', mode, mockApi, deployable: mode !== E2E_MODE && !mockApi };
}

// Backstop markers in the compiled bundle, in case build-info.json was copied, edited or lost
const BUNDLE_MARKERS: Array<[RegExp, string]> = [
  [/VITE_USE_MOCK_API\s*:\s*[`"']true[`"']/, 'the bundle has the mock API compiled in (VITE_USE_MOCK_API=true)'],
  [/\bMODE\s*:\s*[`"']e2e[`"']/, `the bundle was built with --mode ${E2E_MODE}`],
  [/\bDEV\s*:\s*(?:!0|true)\b/, 'the bundle is a development build (import.meta.env.DEV is true)'],
];

/** Errors that make a build directory unfit to deploy; empty means deployable. */
export function assessArtifact({ buildInfo, bundles }: { buildInfo: unknown; bundles: string[] }): string[] {
  const errors: string[] = [];
  const info = buildInfo as Partial<BuildInfo> | null | undefined;
  if (!info || typeof info !== 'object' || info.app !== 'algoflow') {
    errors.push(`${BUILD_INFO_FILE} is missing or not an AlgoFlow build record.`);
  } else {
    if (info.mode === E2E_MODE) errors.push(`${BUILD_INFO_FILE}: built with --mode ${E2E_MODE} (Playwright only).`);
    if (info.mockApi !== false) errors.push(`${BUILD_INFO_FILE}: the mock API is enabled.`);
    if (info.deployable !== true) errors.push(`${BUILD_INFO_FILE}: not marked deployable.`);
  }
  if (bundles.length === 0) errors.push('No JavaScript bundle found to inspect.');
  for (const [pattern, message] of BUNDLE_MARKERS) {
    if (bundles.some(code => pattern.test(code))) errors.push(message);
  }
  return errors;
}
