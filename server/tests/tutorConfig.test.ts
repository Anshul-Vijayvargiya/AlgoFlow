import { describe, it, expect } from 'vitest';
import { env, validateEnv } from '../config/env';
import { getTutorProvider } from '../services/tutor';

// The AI Tutor's configuration: disabled unless enabled explicitly, never by the presence of a key.
const strict = {
  NODE_ENV: 'production',
  CLIENT_URL: 'https://app.example.com',
  MONGODB_URI: 'mongodb://db.example.com/algoflow',
  JWT_SECRET: 'j'.repeat(40),
  COOKIE_SECRET: 'c'.repeat(40),
};
const issues = (e: Record<string, string>) => {
  const r = validateEnv(e);
  return r.success ? [] : r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
};

describe('AI Tutor configuration', () => {
  it('is disabled by default, even when a Gemini key and model are present', () => {
    const r = validateEnv({ ...strict, GEMINI_API_KEY: 'present-key', GEMINI_MODEL: 'gemini-3.5-flash-lite' });
    expect(r.success && r.data.AI_PROVIDER).toBe('disabled');
  });

  it('in this test process (which loads the developer .env), no tutor provider and no Gemini key are configured', () => {
    // tests must never be able to reach the real API or hold a real key: the Vitest setup file blanks both first
    expect(env.AI_PROVIDER, 'AI_PROVIDER must be disabled for the test suite').toBe('disabled');
    // a boolean, so a failure can never print the value
    expect(env.GEMINI_API_KEY === undefined, 'no Gemini key may be loaded into the test suite').toBe(true);
    expect(getTutorProvider()).toBeNull();
  });

  it('gemini needs both a key and an explicitly chosen model (there is no default model)', () => {
    expect(issues({ ...strict, AI_PROVIDER: 'gemini' }).join()).toMatch(/GEMINI_API_KEY.*GEMINI_MODEL|GEMINI_MODEL.*GEMINI_API_KEY/);
    expect(issues({ ...strict, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }).join()).toMatch(/GEMINI_MODEL/);
    expect(issues({ ...strict, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3.5-flash-lite' })).toEqual([]);
  });

  it('the model id cannot carry a path, query or anything but a model name', () => {
    for (const GEMINI_MODEL of ['models/x', 'gemini-2.5-flash?key=1', '../secret', 'Gemini Flash', 'x/y:generateContent']) {
      expect(issues({ ...strict, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL }).join(), GEMINI_MODEL).toMatch(/GEMINI_MODEL/);
    }
  });

  it("'fake' is refused in staging and production, and allowed only in development and tests", () => {
    for (const NODE_ENV of ['staging', 'production']) expect(issues({ ...strict, NODE_ENV, AI_PROVIDER: 'fake' }).join()).toMatch(/AI_PROVIDER/);
    expect(issues({ NODE_ENV: 'test', AI_PROVIDER: 'fake' })).toEqual([]);
  });

  it('an empty value counts as unset', () => {
    expect(issues({ ...strict, AI_PROVIDER: 'gemini', GEMINI_API_KEY: '', GEMINI_MODEL: '' }).join()).toMatch(/GEMINI_API_KEY/);
  });

  it('limits default to positive values and must stay positive', () => {
    const r = validateEnv(strict);
    expect(r.success && r.data).toMatchObject({ TUTOR_RATE_LIMIT_PER_MINUTE: 10, TUTOR_DAILY_LIMIT_PER_USER: 30, TUTOR_DAILY_LIMIT_GLOBAL: 200 });
    expect(issues({ ...strict, TUTOR_DAILY_LIMIT_GLOBAL: '0' }).join()).toMatch(/TUTOR_DAILY_LIMIT_GLOBAL/);
  });

  it('the Judge0 execution settings are unchanged by the tutor settings', () => {
    const r = validateEnv({ ...strict, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3.5-flash-lite' });
    expect(r.success && r.data).toMatchObject({ EXECUTION_PROVIDER: 'disabled', EXECUTION_DAILY_LIMIT_PER_USER: 100, EXECUTION_DAILY_LIMIT_GLOBAL: 1800 });
  });
});
