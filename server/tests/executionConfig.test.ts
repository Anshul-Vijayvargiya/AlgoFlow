import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isLoopbackHost, localProviderProblem, validateEnv } from '../config/env';

// Execution settings in the environment schema, and the quota store's atomic consume.
const strict = {
  NODE_ENV: 'production',
  CLIENT_URL: 'https://app.example.com',
  MONGODB_URI: 'mongodb://db.example.com/algoflow',
  JWT_SECRET: 'j'.repeat(40),
  COOKIE_SECRET: 'c'.repeat(40),
};
const issues = (env: Record<string, string>) => {
  const r = validateEnv(env);
  return r.success ? [] : r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
};

describe('execution settings', () => {
  it('defaults to disabled, with limits', () => {
    const r = validateEnv(strict);
    expect(r.success && r.data).toMatchObject({ EXECUTION_PROVIDER: 'disabled', EXECUTION_DAILY_LIMIT_PER_USER: 100, EXECUTION_DAILY_LIMIT_GLOBAL: 1800, EXECUTION_RATE_LIMIT_PER_MINUTE: 10 });
  });

  it('the fake provider is refused in staging and production', () => {
    for (const NODE_ENV of ['staging', 'production']) expect(issues({ ...strict, NODE_ENV, EXECUTION_PROVIDER: 'fake' }).join()).toMatch(/EXECUTION_PROVIDER/);
    expect(issues({ ...strict, NODE_ENV: 'development', CLIENT_URL: '', EXECUTION_PROVIDER: 'fake' })).toEqual([]);
  });

  it('the local provider is for development only: refused in staging and production', () => {
    for (const NODE_ENV of ['staging', 'production']) {
      expect(issues({ ...strict, NODE_ENV, EXECUTION_PROVIDER: 'local' }).join()).toMatch(/EXECUTION_PROVIDER.*'local'/);
    }
    expect(issues({ ...strict, NODE_ENV: 'development', CLIENT_URL: '', EXECUTION_PROVIDER: 'local' })).toEqual([]);
    const r = validateEnv({ ...strict, NODE_ENV: 'development', CLIENT_URL: '', EXECUTION_PROVIDER: 'local', LOCAL_PYTHON_PATH: 'py' });
    expect(r.success && r.data.LOCAL_PYTHON_PATH).toBe('py');
  });

  it('the local provider runs only on a loopback-only server: every environment, with and without HOST', () => {
    const dev = { ...strict, NODE_ENV: 'development', CLIENT_URL: '', EXECUTION_PROVIDER: 'local' };
    const test = { ...dev, NODE_ENV: 'test' };
    const hostProblem = /HOST: EXECUTION_PROVIDER=local runs code on this machine, so the server must listen on loopback only/;
    // development: loopback by default, and any loopback address; never all interfaces, a LAN address or a host name
    expect(issues(dev)).toEqual([]);
    for (const HOST of ['127.0.0.1', '127.0.0.2', '::1', '[::1]']) expect(issues({ ...dev, HOST }), HOST).toEqual([]);
    for (const HOST of ['0.0.0.0', '::', '192.168.1.20', '10.0.0.5', 'localhost', 'myhost.local', '127.0.0.256', '1270.0.0.1']) {
      expect(issues({ ...dev, HOST }).join(), HOST).toMatch(hostProblem);
    }
    expect(issues({ ...dev, HOST: '0.0.0.0' }).join()).toContain('HOST is 0.0.0.0. Set HOST=127.0.0.1');
    // test mode listens on all interfaces by default: the local provider needs HOST set to loopback explicitly
    expect(issues(test).join()).toMatch(/HOST is 0\.0\.0\.0 \(the test default\)/);
    expect(issues({ ...test, HOST: '127.0.0.1' })).toEqual([]);
    expect(issues({ ...test, HOST: '0.0.0.0' }).join()).toMatch(hostProblem);
    // staging and production: refused whatever HOST is
    for (const NODE_ENV of ['staging', 'production']) {
      for (const HOST of [undefined, '127.0.0.1', '0.0.0.0']) {
        const env = { ...strict, NODE_ENV, EXECUTION_PROVIDER: 'local', ...(HOST ? { HOST } : {}) };
        expect(issues(env).join(), `${NODE_ENV} ${HOST}`).toMatch(/EXECUTION_PROVIDER: In (staging|production), EXECUTION_PROVIDER cannot be 'local'/);
      }
    }
    // other providers are unaffected by HOST
    expect(issues({ ...dev, EXECUTION_PROVIDER: 'fake', HOST: '0.0.0.0' })).toEqual([]);
    expect(issues({ ...dev, EXECUTION_PROVIDER: 'disabled', HOST: '0.0.0.0' })).toEqual([]);
  });

  it('isLoopbackHost and localProviderProblem, the checks the provider factory repeats', () => {
    expect(['127.0.0.1', '127.255.255.254', '::1', '[::1]', ' 127.0.0.1 '].every(isLoopbackHost)).toBe(true);
    expect(['0.0.0.0', 'localhost', '::', '::ffff:127.0.0.1', '128.0.0.1', '127.0.0', '127.0.0.1.5', ''].some(isLoopbackHost)).toBe(false);
    expect(localProviderProblem('development', undefined)).toBeNull();
    expect(localProviderProblem('development', '0.0.0.0')).toMatch(/loopback only/);
    expect(localProviderProblem('test', undefined)).toMatch(/the test default/);
    expect(localProviderProblem('production', '127.0.0.1')).toMatch(/cannot be 'local'/);
  });

  it('judge0 needs a URL and (unless auth is none) a key; deployed URLs must be https', () => {
    expect(issues({ ...strict, EXECUTION_PROVIDER: 'judge0' }).join()).toMatch(/JUDGE0_API_URL.*JUDGE0_API_KEY|JUDGE0_API_KEY.*JUDGE0_API_URL/);
    expect(issues({ ...strict, EXECUTION_PROVIDER: 'judge0', JUDGE0_API_URL: 'https://judge0-ce.p.rapidapi.com', JUDGE0_API_KEY: 'k' })).toEqual([]);
    expect(issues({ ...strict, EXECUTION_PROVIDER: 'judge0', JUDGE0_API_URL: 'http://judge0.internal', JUDGE0_AUTH: 'none' }).join()).toMatch(/https/);
    expect(issues({ ...strict, EXECUTION_PROVIDER: 'judge0', JUDGE0_API_URL: 'https://judge0.internal', JUDGE0_AUTH: 'none' })).toEqual([]);
  });

  it('limits must be positive integers', () => {
    expect(issues({ ...strict, EXECUTION_DAILY_LIMIT_PER_USER: '0' }).join()).toMatch(/EXECUTION_DAILY_LIMIT_PER_USER/);
    expect(issues({ ...strict, EXECUTION_DAILY_LIMIT_GLOBAL: '-5' }).join()).toMatch(/EXECUTION_DAILY_LIMIT_GLOBAL/);
  });
});

const { model } = vi.hoisted(() => ({ model: { findOneAndUpdate: vi.fn(), updateOne: vi.fn(), findOne: vi.fn() } }));
vi.mock('../models/ExecutionQuota', () => ({ ExecutionQuota: model }));
const { consumeQuota, refundQuota } = await import('../services/execution/quota');

describe('quota store', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments only while enough is left (one atomic conditional update)', async () => {
    model.findOneAndUpdate.mockResolvedValue({ count: 3 });
    expect(await consumeQuota('user:u1', 5, '2026-10-21')).toBe(3);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith({ key: 'user:u1', date: '2026-10-21', count: { $lte: 4 } }, { $inc: { count: 1 } }, expect.objectContaining({ upsert: true }));
  });

  it('several runs at once (a practice submission: one per test) are taken all or none', async () => {
    model.findOneAndUpdate.mockResolvedValue({ count: 7 });
    expect(await consumeQuota('user:u1', 10, '2026-10-21', 6)).toBe(7);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith({ key: 'user:u1', date: '2026-10-21', count: { $lte: 4 } }, { $inc: { count: 6 } }, expect.anything());
    // more than the whole allowance: refused without touching the database
    model.findOneAndUpdate.mockClear();
    expect(await consumeQuota('user:u1', 5, '2026-10-21', 6)).toBeNull();
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('at the limit the upsert collides with the existing document: the retry without insert finds nothing → used up', async () => {
    model.findOneAndUpdate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 })).mockResolvedValueOnce(null);
    expect(await consumeQuota('user:u1', 5, '2026-10-21')).toBeNull();
    expect(model.findOneAndUpdate.mock.calls[1][2]).toMatchObject({ upsert: false });
  });

  it('two first requests racing: the loser retries and is counted', async () => {
    model.findOneAndUpdate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 })).mockResolvedValueOnce({ count: 2 });
    expect(await consumeQuota('global', 1800, '2026-10-21')).toBe(2);
  });

  it('other database errors propagate (no silent allowance)', async () => {
    model.findOneAndUpdate.mockRejectedValueOnce(new Error('connection lost'));
    await expect(consumeQuota('user:u1', 5)).rejects.toThrow('connection lost');
  });

  it('a refund never takes the count below zero', async () => {
    await refundQuota('user:u1', '2026-10-21');
    expect(model.updateOne).toHaveBeenCalledWith({ key: 'user:u1', date: '2026-10-21', count: { $gte: 1 } }, { $inc: { count: -1 } });
    await refundQuota('global', '2026-10-21', 4);
    expect(model.updateOne).toHaveBeenLastCalledWith({ key: 'global', date: '2026-10-21', count: { $gte: 4 } }, { $inc: { count: -4 } });
    model.updateOne.mockClear();
    await refundQuota('global', '2026-10-21', 0);
    expect(model.updateOne).not.toHaveBeenCalled();
  });
});
