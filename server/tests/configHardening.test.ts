import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateEnv,
  isStrictEnvironment,
  KNOWN_DEV_FALLBACK_JWT,
  KNOWN_DEV_FALLBACK_COOKIE,
  ENV_EXAMPLE_PLACEHOLDER_JWT,
  ENV_EXAMPLE_PLACEHOLDER_COOKIE,
} from '../config/env';
import { errorHandler } from '../middleware/errorHandler';

// Sprint 8 / B1: fail-closed configuration, staging = production security, no seeded privileged accounts.

const STRONG_JWT = 'j'.repeat(24) + '-strong-jwt-secret-value';
const STRONG_COOKIE = 'c'.repeat(24) + '-strong-cookie-secret-value';

function strictEnv(nodeEnv: 'staging' | 'production', overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: nodeEnv,
    CLIENT_URL: 'https://staging.algoflow.example',
    MONGODB_URI: 'mongodb://db.internal:27017/algoflow',
    JWT_SECRET: STRONG_JWT,
    COOKIE_SECRET: STRONG_COOKIE,
    ...overrides,
  };
}

function fieldErrors(result: ReturnType<typeof validateEnv>, field: string): string[] {
  return result.success ? [] : result.error.issues.filter(i => i.path[0] === field).map(i => i.message);
}

describe('Environment validation fails closed', () => {
  it('rejects a missing NODE_ENV instead of defaulting to development', () => {
    const result = validateEnv({ JWT_SECRET: STRONG_JWT, COOKIE_SECRET: STRONG_COOKIE });
    expect(result.success).toBe(false);
    expect(fieldErrors(result, 'NODE_ENV')[0]).toMatch(/must be explicitly set/i);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(validateEnv({ ...strictEnv('staging'), NODE_ENV: 'prod' }).success).toBe(false);
  });

  it('treats any mode other than development and test as strict', () => {
    expect(isStrictEnvironment('production')).toBe(true);
    expect(isStrictEnvironment('staging')).toBe(true);
    expect(isStrictEnvironment(undefined)).toBe(true);
    expect(isStrictEnvironment('anything-else')).toBe(true);
    expect(isStrictEnvironment('development')).toBe(false);
    expect(isStrictEnvironment('test')).toBe(false);
  });

  it('has no built-in signing secret in development', () => {
    const result = validateEnv({ NODE_ENV: 'development' });
    expect(result.success).toBe(false);
    expect(fieldErrors(result, 'JWT_SECRET')[0]).toMatch(/must be set/i);
    expect(fieldErrors(result, 'COOKIE_SECRET')[0]).toMatch(/must be set/i);
  });

  // Hardening F1: published values are refused in development as well (anyone with the repository could sign tokens)
  it.each([
    ['JWT_SECRET', KNOWN_DEV_FALLBACK_JWT],
    ['JWT_SECRET', ENV_EXAMPLE_PLACEHOLDER_JWT],
    ['COOKIE_SECRET', KNOWN_DEV_FALLBACK_COOKIE],
    ['COOKIE_SECRET', ENV_EXAMPLE_PLACEHOLDER_COOKIE],
  ])('rejects the public value of %s in development too', (field, value) => {
    const result = validateEnv({ NODE_ENV: 'development', JWT_SECRET: STRONG_JWT, COOKIE_SECRET: STRONG_COOKIE, [field]: value });
    expect(result.success).toBe(false);
    expect(fieldErrors(result, field)[0]).toMatch(/cannot use the development fallback key.*npm run env:secrets/i);
  });

  it('keeps development convenient: short private secrets are accepted (the 32-character rule is strict-only)', () => {
    expect(validateEnv({ NODE_ENV: 'development', JWT_SECRET: 'my-local-jwt', COOKIE_SECRET: 'my-local-cookie' }).success).toBe(true);
  });

  it('test mode still accepts any secret (fixtures)', () => {
    expect(validateEnv({ NODE_ENV: 'test', JWT_SECRET: KNOWN_DEV_FALLBACK_JWT, COOKIE_SECRET: KNOWN_DEV_FALLBACK_COOKIE }).success).toBe(true);
  });

  describe('HOST (listen address)', () => {
    it('defaults to loopback only in development', () => {
      expect(validateEnv({ NODE_ENV: 'development', JWT_SECRET: 'a', COOKIE_SECRET: 'b' }).data!.HOST).toBe('127.0.0.1');
    });

    it.each(['staging', 'production'] as const)('defaults to all interfaces in %s (behind a proxy or container)', nodeEnv => {
      expect(validateEnv(strictEnv(nodeEnv)).data!.HOST).toBe('0.0.0.0');
    });

    it('honours an explicit HOST, and treats an empty one as unset', () => {
      expect(validateEnv({ NODE_ENV: 'development', JWT_SECRET: 'a', COOKIE_SECRET: 'b', HOST: '0.0.0.0' }).data!.HOST).toBe('0.0.0.0');
      expect(validateEnv(strictEnv('production', { HOST: '10.0.0.5' })).data!.HOST).toBe('10.0.0.5');
      expect(validateEnv({ NODE_ENV: 'development', JWT_SECRET: 'a', COOKIE_SECRET: 'b', HOST: '' }).data!.HOST).toBe('127.0.0.1');
    });
  });

  it('treats an empty secret as unset', () => {
    const result = validateEnv({ NODE_ENV: 'development', JWT_SECRET: '', COOKIE_SECRET: STRONG_COOKIE });
    expect(fieldErrors(result, 'JWT_SECRET')[0]).toMatch(/must be set/i);
  });

  it('generates random, unpredictable secrets in test mode when none are configured', () => {
    const a = validateEnv({ NODE_ENV: 'test' });
    const b = validateEnv({ NODE_ENV: 'test' });
    expect(a.success && b.success).toBe(true);
    expect(a.data!.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(a.data!.JWT_SECRET).not.toBe(b.data!.JWT_SECRET);
    expect(a.data!.JWT_SECRET).not.toBe(a.data!.COOKIE_SECRET);
    expect([KNOWN_DEV_FALLBACK_JWT, ENV_EXAMPLE_PLACEHOLDER_JWT]).not.toContain(a.data!.JWT_SECRET);
  });

  it('parses the rate-limit settings as numbers and rejects garbage', () => {
    const ok = validateEnv({ NODE_ENV: 'test' });
    expect(ok.data!.RATE_LIMIT_WINDOW_MS).toBe(900000);
    expect(ok.data!.RATE_LIMIT_MAX_AUTH).toBe(10);
    expect(validateEnv({ NODE_ENV: 'test', RATE_LIMIT_MAX_AUTH: '25' }).data!.RATE_LIMIT_MAX_AUTH).toBe(25);
    expect(validateEnv({ NODE_ENV: 'test', RATE_LIMIT_MAX_AUTH: 'lots' }).success).toBe(false);
    expect(validateEnv({ NODE_ENV: 'test', RATE_LIMIT_WINDOW_MS: '0' }).success).toBe(false);
  });

  describe.each(['staging', 'production'] as const)('%s uses the production security profile', nodeEnv => {
    it('accepts a complete, safe configuration and marks it strict', () => {
      const result = validateEnv(strictEnv(nodeEnv));
      expect(result.success).toBe(true);
      expect(result.data!.isStrict).toBe(true);
    });

    it.each([
      ['JWT_SECRET', KNOWN_DEV_FALLBACK_JWT],
      ['JWT_SECRET', ENV_EXAMPLE_PLACEHOLDER_JWT],
      ['COOKIE_SECRET', KNOWN_DEV_FALLBACK_COOKIE],
      ['COOKIE_SECRET', ENV_EXAMPLE_PLACEHOLDER_COOKIE],
    ])('rejects the public value of %s', (field, value) => {
      const result = validateEnv(strictEnv(nodeEnv, { [field]: value }));
      expect(result.success).toBe(false);
      expect(fieldErrors(result, field)[0]).toMatch(/cannot use the development fallback key/i);
    });

    it.each(['JWT_SECRET', 'COOKIE_SECRET'])('rejects a missing or short %s', field => {
      expect(fieldErrors(validateEnv(strictEnv(nodeEnv, { [field]: undefined })), field)[0]).toMatch(/must be set/i);
      expect(fieldErrors(validateEnv(strictEnv(nodeEnv, { [field]: 'short' })), field)[0]).toMatch(/at least 32/i);
    });

    it('rejects reusing one secret for both JWT and cookie signing', () => {
      const result = validateEnv(strictEnv(nodeEnv, { COOKIE_SECRET: STRONG_JWT }));
      expect(fieldErrors(result, 'COOKIE_SECRET')[0]).toMatch(/must differ/i);
    });

    it.each([
      [undefined, /explicitly configured/i],
      ['http://localhost:5173', /explicitly configured/i],
      ['http://staging.algoflow.example', /https/i],
      ['not a url', /valid URL/i],
      ['https://staging.algoflow.example/', /origin only/i],
      ['https://staging.algoflow.example/app', /origin only/i],
    ])('rejects CLIENT_URL %s', (value, message) => {
      const result = validateEnv(strictEnv(nodeEnv, { CLIENT_URL: value }));
      expect(result.success).toBe(false);
      expect(fieldErrors(result, 'CLIENT_URL')[0]).toMatch(message);
    });

    it('requires MONGODB_URI instead of falling back to a local database', () => {
      const result = validateEnv(strictEnv(nodeEnv, { MONGODB_URI: undefined }));
      expect(fieldErrors(result, 'MONGODB_URI')[0]).toMatch(/explicitly set/i);
    });
  });
});

describe('Error responses never include stack traces', () => {
  function capture(err: any) {
    const out: { status?: number; body?: any } = {};
    const res: any = {
      status: (s: number) => ((out.status = s), res),
      json: (b: any) => ((out.body = b), res),
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(err, { method: 'GET', url: '/x' } as any, res, () => {});
    spy.mockRestore();
    return out;
  }

  it('masks 500s outside development and omits the stack', () => {
    const out = capture(Object.assign(new Error('E11000 at mongodb://internal-host'), { statusCode: 500 }));
    expect(out.status).toBe(500);
    expect(out.body).toEqual({ error: 'Internal Server Error' });
  });

  it('keeps 4xx messages but omits the stack', () => {
    const out = capture(Object.assign(new Error('Bad input'), { statusCode: 400 }));
    expect(out.body).toEqual({ error: 'Bad input' });
  });
});

// The modules below read `env` at import time, so each test loads them fresh against a mocked environment.
async function withEnv<T>(overrides: Record<string, unknown>, load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.doMock('../config/env', async importOriginal => {
    const actual = await importOriginal<typeof import('../config/env')>();
    return { ...actual, env: { ...actual.env, ...overrides } };
  });
  return load();
}

describe('Strict-mode runtime behaviour (staging)', () => {
  afterEach(() => {
    vi.doUnmock('../config/env');
    vi.doUnmock('../models/User');
    vi.doUnmock('../models/Problem');
    vi.resetModules();
  });

  it('sets the auth cookie Secure in staging and production, not in development', async () => {
    for (const [nodeEnv, isStrict] of [['staging', true], ['production', true], ['development', false]] as const) {
      const { authCookieOptions } = await withEnv({ NODE_ENV: nodeEnv, isStrict }, () => import('../config/authCookie'));
      expect(authCookieOptions()).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: isStrict });
    }
  });

  it('runs express in production mode for staging', async () => {
    const { app } = await withEnv({ NODE_ENV: 'staging', isStrict: true }, () => import('../app'));
    expect(app.get('env')).toBe('production');
  });

  describe('development seeding', () => {
    const User = { findOne: vi.fn(), create: vi.fn(), find: vi.fn() };
    const Problem = { countDocuments: vi.fn(), insertMany: vi.fn() };

    beforeEach(() => {
      vi.clearAllMocks();
      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue({});
      Problem.countDocuments.mockResolvedValue(1);
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    async function loadSeed(envOverrides: Record<string, unknown>) {
      vi.doMock('../models/User', () => ({ User }));
      vi.doMock('../models/Problem', () => ({ Problem }));
      return withEnv(envOverrides, () => import('../config/seedDevData'));
    }

    it.each(['staging', 'production', 'test'])('never seeds any account in %s', async nodeEnv => {
      const { seedDevelopmentData } = await loadSeed({ NODE_ENV: nodeEnv, isStrict: nodeEnv !== 'test', SEED_DEV_ADMINS: 'true' });
      await seedDevelopmentData();
      expect(User.findOne).not.toHaveBeenCalled();
      expect(User.create).not.toHaveBeenCalled();
    });

    it('seeds only the non-privileged demo user in development by default', async () => {
      const { seedDevelopmentData } = await loadSeed({ NODE_ENV: 'development', isStrict: false, SEED_DEV_ADMINS: 'false' });
      await seedDevelopmentData();
      const roles = User.create.mock.calls.map(c => c[0].role);
      expect(roles).toEqual(['USER']);
    });

    it('seeds the fixed-password admin accounts only with SEED_DEV_ADMINS=true in development', async () => {
      const { seedDevelopmentData } = await loadSeed({ NODE_ENV: 'development', isStrict: false, SEED_DEV_ADMINS: 'true' });
      await seedDevelopmentData();
      const roles = User.create.mock.calls.map(c => c[0].role);
      expect(roles).toEqual(['USER', 'ADMIN', 'SUPER_ADMIN']);
    });

    it('refuses to start a strict environment while seed accounts exist', async () => {
      const { assertNoDevSeedAccounts, DEV_SEED_ACCOUNT_EMAILS } = await loadSeed({ NODE_ENV: 'staging', isStrict: true });
      const lean = vi.fn().mockResolvedValue([{ email: 'superadmin@algoflow.io' }]);
      User.find.mockReturnValue({ select: () => ({ lean }) });

      await expect(assertNoDevSeedAccounts()).rejects.toThrow(/superadmin@algoflow\.io/);
      expect(User.find).toHaveBeenCalledWith({ email: { $in: [...DEV_SEED_ACCOUNT_EMAILS] } });

      lean.mockResolvedValue([]);
      await expect(assertNoDevSeedAccounts()).resolves.toBeUndefined();
    });
  });
});
