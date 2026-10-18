import { describe, it, expect } from 'vitest';
import {
  assessArtifact,
  checkBuildConfig,
  checkOutputDir,
  createBuildInfo,
  resolveApiRuntime,
  validateApiBaseUrl,
  E2E_MODE,
} from '../deployment';

// Sprint 8 / B4 (explicit API base URL) and B5 (no deployable mock-API build).

describe('validateApiBaseUrl', () => {
  it.each([
    ['/api', '/api'],
    ['/api/', '/api'],
    ['  /backend/api  ', '/backend/api'],
    ['https://api.example.com/api', 'https://api.example.com/api'],
    ['https://api.example.com/api/', 'https://api.example.com/api'],
    ['https://api.example.com', 'https://api.example.com'],
    ['http://localhost:5000/api', 'http://localhost:5000/api'],
    ['http://127.0.0.1:5000/api', 'http://127.0.0.1:5000/api'],
  ])('accepts %s', (raw, normalized) => {
    expect(validateApiBaseUrl(raw)).toEqual({ ok: true, value: normalized });
  });

  it.each([
    [undefined, /must be set/],
    ['', /must be set/],
    ['   ', /must be set/],
    ['/', /must be a path/],
    ['/api?x=1', /must be a path/],
    ['//evil.example/api', /neither/],
    ['http://api.example.com/api', /https/],
    ['ftp://api.example.com', /https/],
    ['javascript:alert(1)', /https/],
    ['api.example.com', /neither/],
    ['https://user:pass@api.example.com/api', /credentials/],
    ['https://api.example.com/api?token=1', /query/],
  ])('rejects %s', (raw, message) => {
    const result = validateApiBaseUrl(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });
});

describe('checkBuildConfig (vite build)', () => {
  const build = (mode: string, env: Record<string, string | undefined>) => checkBuildConfig({ command: 'build', mode, env });

  it('accepts a production build with an explicit API base URL and no mock', () => {
    expect(build('production', { VITE_API_BASE_URL: 'https://api.example.com/api' })).toEqual([]);
    expect(build('production', { VITE_API_BASE_URL: '/api', VITE_USE_MOCK_API: 'false' })).toEqual([]);
  });

  it.each(['production', 'staging', 'development', 'anything'])('fails a %s-mode build with the mock API enabled', mode => {
    const errors = build(mode, { VITE_USE_MOCK_API: 'true', VITE_API_BASE_URL: '/api' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/VITE_USE_MOCK_API=true is not allowed/);
  });

  it('fails a deployable build without an API base URL (no implicit dev-proxy path)', () => {
    expect(build('production', {})[0]).toMatch(/VITE_API_BASE_URL must be set/);
  });

  // Found in Sprint 8: the server's NODE_ENV=development in the root .env made every local `vite build` a dev bundle
  it('fails a deployable build whose effective NODE_ENV is not production', () => {
    const env = { VITE_API_BASE_URL: '/api' };
    expect(checkBuildConfig({ command: 'build', mode: 'production', env, nodeEnv: 'development' })[0])
      .toMatch(/NODE_ENV=development would produce a development bundle/);
    expect(checkBuildConfig({ command: 'build', mode: 'production', env, nodeEnv: 'production' })).toEqual([]);
    expect(checkBuildConfig({ command: 'build', mode: 'production', env, nodeEnv: undefined })).toEqual([]);
  });

  it('reports every problem at once', () => {
    expect(build('production', { VITE_USE_MOCK_API: 'true' })).toHaveLength(2);
  });

  it('allows the mock API only in the e2e mode used by Playwright', () => {
    expect(build(E2E_MODE, { VITE_USE_MOCK_API: 'true' })).toEqual([]);
  });

  it('never blocks the dev server', () => {
    expect(checkBuildConfig({ command: 'serve', mode: 'development', env: { VITE_USE_MOCK_API: 'true' } })).toEqual([]);
  });
});

describe('resolveApiRuntime (defence in depth inside the bundle)', () => {
  it('refuses to start a deployable bundle that has the mock API compiled in', () => {
    expect(() => resolveApiRuntime({ PROD: true, MODE: 'production', VITE_USE_MOCK_API: 'true', VITE_API_BASE_URL: '/api' }))
      .toThrow(/mock API enabled/);
  });

  it('refuses to start a deployable bundle without an API base URL', () => {
    expect(() => resolveApiRuntime({ PROD: true, MODE: 'production' })).toThrow(/VITE_API_BASE_URL/);
  });

  it('uses the configured API base URL in a deployed bundle', () => {
    expect(resolveApiRuntime({ PROD: true, MODE: 'production', VITE_API_BASE_URL: 'https://api.example.com/api/' }))
      .toEqual({ useMock: false, baseUrl: 'https://api.example.com/api' });
  });

  it('defaults to the dev-proxy path in development, tests and e2e', () => {
    expect(resolveApiRuntime({ PROD: false, MODE: 'development' })).toEqual({ useMock: false, baseUrl: '/api' });
    expect(resolveApiRuntime({ PROD: false, MODE: 'test', VITE_USE_MOCK_API: 'true' })).toEqual({ useMock: true, baseUrl: '/api' });
    expect(resolveApiRuntime({ PROD: true, MODE: E2E_MODE, VITE_USE_MOCK_API: 'true' })).toEqual({ useMock: true, baseUrl: '/api' });
  });

  it('only the exact string "true" enables the mock', () => {
    for (const value of ['TRUE', '1', 'yes', '']) {
      expect(resolveApiRuntime({ PROD: false, MODE: 'development', VITE_USE_MOCK_API: value }).useMock).toBe(false);
    }
  });
});

// Hardening F3: an e2e (mock API) build can never be mistaken for, or deployed as, a production artifact.
describe('e2e builds are confined to the Playwright suite', () => {
  it('requires the mock API in e2e mode (an e2e build exists only for Playwright)', () => {
    expect(checkBuildConfig({ command: 'build', mode: E2E_MODE, env: {} })[0]).toMatch(/require VITE_USE_MOCK_API=true/);
    expect(checkBuildConfig({ command: 'build', mode: E2E_MODE, env: { VITE_USE_MOCK_API: 'true' } })).toEqual([]);
  });

  it.each([
    ['dist-e2e', E2E_MODE, []],
    ['D:\\AlgoFlow\\dist-e2e', E2E_MODE, []],
    ['/tmp/x/dist-e2e/', E2E_MODE, []],
    ['dist', E2E_MODE, [/may only be written to dist-e2e/]],
    ['D:\\deploy\\public', E2E_MODE, [/may only be written to dist-e2e/]],
    ['dist-e2e-copy', E2E_MODE, [/may only be written to dist-e2e/]],
    ['dist', 'production', []],
    ['C:/out/dist-e2e', 'production', [/reserved for --mode e2e/]],
  ] as Array<[string, string, RegExp[]]>)('outDir %s in mode %s', (outDir, mode, expected) => {
    const errors = checkOutputDir({ mode, outDir });
    expect(errors).toHaveLength(expected.length);
    expected.forEach((pattern, i) => expect(errors[i]).toMatch(pattern));
  });

  it('records what each build is in build-info.json', () => {
    expect(createBuildInfo('production', { VITE_API_BASE_URL: '/api' })).toEqual({ app: 'algoflow', mode: 'production', mockApi: false, deployable: true });
    expect(createBuildInfo(E2E_MODE, { VITE_USE_MOCK_API: 'true' })).toEqual({ app: 'algoflow', mode: 'e2e', mockApi: true, deployable: false });
  });
});

describe('assessArtifact (npm run verify:artifact)', () => {
  // Fragments in the exact minified form Vite emitted for real builds during the hardening pass
  const PROD_BUNDLE = 'var No=Mo({BASE_URL:`/`,DEV:!1,MODE:`production`,PROD:!0,SSR:!1,VITE_API_BASE_URL:`/api`});';
  const E2E_BUNDLE = 'var No=Mo({BASE_URL:`/`,DEV:!1,MODE:`e2e`,PROD:!0,SSR:!1,VITE_USE_MOCK_API:`true`});';
  const DEV_BUNDLE = 'var No=Mo({BASE_URL:`/`,DEV:!0,MODE:`production`,PROD:!1,SSR:!1});';
  const prodInfo = { app: 'algoflow', mode: 'production', mockApi: false, deployable: true };
  const e2eInfo = { app: 'algoflow', mode: 'e2e', mockApi: true, deployable: false };

  it('accepts a production build', () => {
    expect(assessArtifact({ buildInfo: prodInfo, bundles: [PROD_BUNDLE] })).toEqual([]);
  });

  it('rejects an e2e build for every reason it has', () => {
    const errors = assessArtifact({ buildInfo: e2eInfo, bundles: [E2E_BUNDLE] });
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/built with --mode e2e \(Playwright only\)/),
      expect.stringMatching(/mock API is enabled/),
      expect.stringMatching(/not marked deployable/),
      expect.stringMatching(/mock API compiled in/),
      expect.stringMatching(/bundle was built with --mode e2e/),
    ]));
  });

  it('still rejects an e2e bundle whose build-info.json was edited or deleted (bundle backstop)', () => {
    expect(assessArtifact({ buildInfo: prodInfo, bundles: [E2E_BUNDLE] })).toHaveLength(2);
    const noInfo = assessArtifact({ buildInfo: null, bundles: [E2E_BUNDLE] });
    expect(noInfo[0]).toMatch(/missing or not an AlgoFlow build record/);
    expect(noInfo).toHaveLength(3);
  });

  it('rejects a development bundle and a directory with no bundle', () => {
    expect(assessArtifact({ buildInfo: prodInfo, bundles: [DEV_BUNDLE] })).toEqual([expect.stringMatching(/development build/)]);
    expect(assessArtifact({ buildInfo: prodInfo, bundles: [] })).toEqual([expect.stringMatching(/No JavaScript bundle/)]);
  });

  it('does not flag the guard\'s own error text, which is compiled into production bundles', () => {
    const guardText = '"VITE_USE_MOCK_API=true is not allowed in a deployable build" `--mode e2e`';
    expect(assessArtifact({ buildInfo: prodInfo, bundles: [PROD_BUNDLE, guardText] })).toEqual([]);
  });
});
