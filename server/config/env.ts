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
const MIN_SECRET_LENGTH = 32;

// An empty value (`JWT_SECRET=`) counts as unset.
const optionalString = z.preprocess(v => (v === '' ? undefined : v), z.string().optional());
const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

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

    if (!strict) return;

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
    HOST: data.HOST ?? (data.NODE_ENV === 'development' ? DEV_HOST : DEPLOYED_HOST),
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
