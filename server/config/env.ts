import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import dotenv from 'dotenv';
import { PUBLIC_SECRETS } from './publicSecrets';

dotenv.config();

// Re-exported for existing imports (tests); the list lives in publicSecrets.ts so tools can use it without loading env.
export {
  PUBLIC_SECRETS,
  KNOWN_DEV_FALLBACK_JWT,
  KNOWN_DEV_FALLBACK_COOKIE,
  ENV_EXAMPLE_PLACEHOLDER_JWT,
  ENV_EXAMPLE_PLACEHOLDER_COOKIE,
} from './publicSecrets';

export const NODE_ENVS = ['development', 'test', 'staging', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/**
 * Staging and production are "strict": real secrets, https CLIENT_URL, explicit MONGODB_URI, Secure cookies,
 * masked errors, no seeding. Anything that is not explicitly development or test is treated as strict.
 */
export function isStrictEnvironment(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'development' && nodeEnv !== 'test';
}

const DEV_CLIENT_URL = 'http://localhost:5173';
// Development listens on loopback only (set HOST=0.0.0.0 to opt in to LAN access); deployed servers usually sit
// behind a proxy or in a container, so strict modes listen on all interfaces unless HOST is set.
const DEV_HOST = '127.0.0.1';
const DEPLOYED_HOST = '0.0.0.0';
const DEV_MONGODB_URI = 'mongodb://127.0.0.1:27017/algoflow';

/** the address the server listens on: HOST, or the default for the environment (see server/index.ts) */
export const resolveHost = (nodeEnv: string | undefined, host: string | undefined): string => host ?? (nodeEnv === 'development' ? DEV_HOST : DEPLOYED_HOST);

/**
 * Whether listening on `host` keeps the server on this machine: an IPv4 loopback address (127.x.x.x) or ::1. Host
 * names (even "localhost") are not accepted: they can resolve to other addresses, and the check must fail closed.
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().replace(/^\[(.*)\]$/, '$1');
  if (h === '::1') return true;
  const parts = h.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** why EXECUTION_PROVIDER=local may not run with this configuration, or null when it may */
export function localProviderProblem(nodeEnv: string | undefined, host: string | undefined): string | null {
  if (isStrictEnvironment(nodeEnv)) return `In ${nodeEnv}, EXECUTION_PROVIDER cannot be 'local' (it is for development only and does not isolate untrusted code).`;
  const listen = resolveHost(nodeEnv, host);
  if (!isLoopbackHost(listen)) {
    return `EXECUTION_PROVIDER=local runs code on this machine, so the server must listen on loopback only, but HOST is ${listen}${host === undefined ? ` (the ${nodeEnv} default)` : ''}. Set HOST=127.0.0.1 (or ::1).`;
  }
  return null;
}
const MIN_SECRET_LENGTH = 32;

// An empty value (`JWT_SECRET=`) counts as unset.
const optionalString = z.preprocess(v => (v === '' ? undefined : v), z.string().optional());
const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);
/** a Gemini model id (it becomes part of the request path) */
export const GEMINI_MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVS, {
      error: 'NODE_ENV must be explicitly set to one of: development, test, staging, production.',
    }),
    PORT: z.string().default('5000'),
    HOST: optionalString,
    CLIENT_URL: optionalString,
    MONGODB_URI: optionalString,
    JWT_SECRET: optionalString,
    COOKIE_SECRET: optionalString,
    TRUST_PROXY: z.string().default('false'),
    RATE_LIMIT_WINDOW_MS: positiveInt(900000),
    RATE_LIMIT_MAX_AUTH: positiveInt(10),
    RATE_LIMIT_MAX_API: positiveInt(100),
    // Development only: also seed the fixed-password ADMIN and SUPER_ADMIN accounts.
    SEED_DEV_ADMINS: z.enum(['true', 'false']).default('false'),
    // Code execution (Playground). 'disabled' until configured; 'fake' is for automated tests only (never strict);
    // 'local' runs Python on this machine, for development only (never strict: it is not a sandbox for untrusted code).
    EXECUTION_PROVIDER: z.enum(['disabled', 'judge0', 'fake', 'local']).default('disabled'),
    // EXECUTION_PROVIDER=local: the Python 3.8+ interpreter to use (a command on PATH or a full path; default "python")
    LOCAL_PYTHON_PATH: optionalString,
    // Judge0 (hosted or self-hosted): base URL, key and how the key is sent. Never exposed to the browser.
    JUDGE0_API_URL: optionalString,
    JUDGE0_API_KEY: optionalString,
    JUDGE0_AUTH: z.enum(['rapidapi', 'x-auth-token', 'none']).default('rapidapi'),
    // Optional JSON overriding the language ids / labels, e.g. {"cpp":{"id":54,"label":"C++ (GCC 9.2.0)"}}
    JUDGE0_LANGUAGES: optionalString,
    // Abuse protection and cost control
    EXECUTION_RATE_LIMIT_PER_MINUTE: positiveInt(10),
    EXECUTION_DAILY_LIMIT_PER_USER: positiveInt(100),
    // all users together, per UTC day; keep it below the provider plan's daily allowance to avoid paid overage
    EXECUTION_DAILY_LIMIT_GLOBAL: positiveInt(1800),
    // AI Tutor. 'disabled' (default) unless set explicitly: the presence of GEMINI_API_KEY alone never enables it.
    // 'fake' is for automated tests only and is refused in staging/production.
    AI_PROVIDER: z.enum(['disabled', 'gemini', 'fake']).default('disabled'),
    // Google Gemini (server-side only; never a VITE_ variable, never logged or sent to the browser)
    GEMINI_API_KEY: optionalString,
    // a model id such as gemini-3.5-flash-lite: no default, it must be chosen after checking availability in AI Studio
    // (Google limits the 2.5 models to projects that used them before). The chosen model may think by default (3.5
    // Flash-Lite at a minimal level); thinking tokens count against the provider's output limit.
    GEMINI_MODEL: z.preprocess(
      v => (v === '' ? undefined : v),
      z.string().regex(GEMINI_MODEL_PATTERN, 'GEMINI_MODEL must be a model id such as gemini-3.5-flash-lite').optional()
    ),
    // per user per minute, and all users together per minute (keep the latter below the project's per-minute request
    // limit shown in AI Studio). Both are counted in this process's memory: each server instance has its own.
    TUTOR_RATE_LIMIT_PER_MINUTE: positiveInt(10),
    TUTOR_GLOBAL_RATE_LIMIT_PER_MINUTE: positiveInt(5),
    // daily limits count by Pacific Time day (Google's daily limits reset at midnight Pacific), in MongoDB: shared by
    // every instance that uses the same database
    TUTOR_DAILY_LIMIT_PER_USER: positiveInt(30),
    // all users together: keep it below the project's free daily request limit shown in AI Studio
    TUTOR_DAILY_LIMIT_GLOBAL: positiveInt(200),
  })
  .superRefine((data, ctx) => {
    const strict = isStrictEnvironment(data.NODE_ENV);
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    for (const key of ['JWT_SECRET', 'COOKIE_SECRET'] as const) {
      const value = data[key];
      if (!value) {
        // Tests get random per-process secrets (see below); every other mode must configure them.
        if (data.NODE_ENV !== 'test') issue(key, `${key} must be set (there is no built-in fallback).`);
        continue;
      }
      if (data.NODE_ENV === 'test') continue;
      // Development too: anyone with the repository could sign tokens for a server using a published value
      if (PUBLIC_SECRETS.has(value)) {
        issue(key, `In ${data.NODE_ENV}, ${key} cannot use the development fallback key or the .env.example placeholder. Run \`npm run env:secrets\`.`);
      } else if (strict && value.length < MIN_SECRET_LENGTH) {
        issue(key, `In ${data.NODE_ENV}, ${key} must be at least ${MIN_SECRET_LENGTH} characters long.`);
      }
    }

    if (data.EXECUTION_PROVIDER === 'judge0') {
      if (!data.JUDGE0_API_URL) issue('JUDGE0_API_URL', 'JUDGE0_API_URL must be set when EXECUTION_PROVIDER=judge0.');
      if (data.JUDGE0_AUTH !== 'none' && !data.JUDGE0_API_KEY) {
        issue('JUDGE0_API_KEY', `JUDGE0_API_KEY must be set when EXECUTION_PROVIDER=judge0 and JUDGE0_AUTH=${data.JUDGE0_AUTH}.`);
      }
    }

    // the local provider is not a sandbox: it may only run where nothing but this machine can reach the server
    if (data.EXECUTION_PROVIDER === 'local') {
      const problem = localProviderProblem(data.NODE_ENV, data.HOST);
      if (problem) issue(isStrictEnvironment(data.NODE_ENV) ? 'EXECUTION_PROVIDER' : 'HOST', problem);
    }

    if (data.AI_PROVIDER === 'gemini') {
      if (!data.GEMINI_API_KEY) issue('GEMINI_API_KEY', 'GEMINI_API_KEY must be set when AI_PROVIDER=gemini.');
      if (!data.GEMINI_MODEL) issue('GEMINI_MODEL', 'GEMINI_MODEL must be set when AI_PROVIDER=gemini (there is no default model).');
    }

    if (!strict) return;

    if (data.AI_PROVIDER === 'fake') {
      issue('AI_PROVIDER', `In ${data.NODE_ENV}, AI_PROVIDER cannot be 'fake' (it does not answer questions).`);
    }

    if (data.EXECUTION_PROVIDER === 'fake') {
      issue('EXECUTION_PROVIDER', `In ${data.NODE_ENV}, EXECUTION_PROVIDER cannot be 'fake' (it does not run code).`);
    }
    if (data.EXECUTION_PROVIDER === 'judge0' && data.JUDGE0_API_URL && !data.JUDGE0_API_URL.startsWith('https://')) {
      issue('JUDGE0_API_URL', `In ${data.NODE_ENV}, JUDGE0_API_URL must use https://.`);
    }

    if (data.JWT_SECRET && data.JWT_SECRET === data.COOKIE_SECRET) {
      issue('COOKIE_SECRET', `In ${data.NODE_ENV}, COOKIE_SECRET must differ from JWT_SECRET.`);
    }

    if (!data.CLIENT_URL || data.CLIENT_URL === DEV_CLIENT_URL) {
      issue('CLIENT_URL', `In ${data.NODE_ENV}, CLIENT_URL must be explicitly configured to your deployed front-end origin (https://...).`);
    } else {
      let url: URL | null = null;
      try {
        url = new URL(data.CLIENT_URL);
      } catch {
        issue('CLIENT_URL', `In ${data.NODE_ENV}, CLIENT_URL must be a valid URL.`);
      }
      if (url && url.protocol !== 'https:') {
        issue('CLIENT_URL', `In ${data.NODE_ENV}, CLIENT_URL must use the secure https:// protocol.`);
      } else if (url && url.origin !== data.CLIENT_URL) {
        // CORS and the Origin check compare against the exact origin, so a path or trailing slash breaks every request.
        issue('CLIENT_URL', `In ${data.NODE_ENV}, CLIENT_URL must be an origin only (e.g. https://app.example.com, no path or trailing slash).`);
      }
    }

    if (!data.MONGODB_URI) {
      issue('MONGODB_URI', `In ${data.NODE_ENV}, MONGODB_URI must be explicitly set.`);
    }
  })
  .transform(data => ({
    ...data,
    isStrict: isStrictEnvironment(data.NODE_ENV),
    HOST: resolveHost(data.NODE_ENV, data.HOST),
    CLIENT_URL: data.CLIENT_URL ?? DEV_CLIENT_URL,
    MONGODB_URI: data.MONGODB_URI ?? DEV_MONGODB_URI,
    // Only reachable in test mode (refinement above): random, so no predictable signing key exists anywhere.
    JWT_SECRET: data.JWT_SECRET ?? randomBytes(48).toString('hex'),
    COOKIE_SECRET: data.COOKIE_SECRET ?? randomBytes(48).toString('hex'),
  }));

export type Env = z.output<typeof envSchema>;

export function validateEnv(customEnv: Record<string, unknown> = process.env) {
  return envSchema.safeParse(customEnv);
}

const parsed = validateEnv(process.env);

if (!parsed.success) {
  // Field names and messages only: never print the values.
  const problems = parsed.error.issues.map(i => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
  console.error(`❌ Environment variable validation failed:\n${problems}`);
  throw new Error('Invalid environment variables.');
}

export const env = parsed.data;
