import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';
import { ExecutionProviderError, type ExecutionProvider, type ExecutionResult } from '../services/execution/types';
import { OUTPUT_MAX_CHARS, SOURCE_MAX_CHARS, STDIN_MAX_CHARS } from '../routes/runRoutes';
import { env } from '../config/env';

// POST /api/run and GET /api/run/languages with a scripted provider and quota store (the real quota store is
// exercised against MongoDB by the real-backend E2E suite).
const { state, quota } = vi.hoisted(() => ({
  state: { provider: null as ExecutionProvider | null },
  quota: { consumeQuota: vi.fn(), refundQuota: vi.fn(), quotaUsed: vi.fn(), utcDay: () => '2026-10-21' },
}));
vi.mock('../services/execution', () => ({ getExecutionProvider: () => state.provider }));
vi.mock('../services/execution/quota', () => quota);
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439022';
const cookie = (id = USER) => [`algoflow_token=${tokenFor(id, 'USER')}`];
const post = (body: unknown, id = USER) => request(app).post('/api/run').set('Cookie', cookie(id)).send(body as object);
const valid = { language: 'cpp', source: 'int main(){}', stdin: '1 2 3' };

const ok: ExecutionResult = { status: 'success', stdout: 'out\n', stderr: '', compileOutput: '', exitCode: 0, exitSignal: null, timeMs: 12, memoryKb: 2048 };
function provider(execute: ExecutionProvider['execute']): ExecutionProvider {
  return { name: 'judge0', languages: () => [{ id: 'cpp', label: 'C++ (GCC 9.2.0)' }, { id: 'c', label: 'C (GCC 9.2.0)' }, { id: 'java', label: 'Java (OpenJDK 13.0.1)' }, { id: 'python', label: 'Python (3.8.1)' }], execute: vi.fn(execute) };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitsForTesting();
  state.provider = provider(async () => ok);
  quota.consumeQuota.mockResolvedValue(1);
  quota.refundQuota.mockResolvedValue(undefined);
  quota.quotaUsed.mockResolvedValue(3);
});

describe('POST /api/run — access and validation', () => {
  it('requires a signed-in user', async () => {
    const res = await request(app).post('/api/run').send(valid);
    expect(res.status).toBe(401);
    expect(state.provider!.execute).not.toHaveBeenCalled();
  });

  it('disabled (no provider configured): 503, nothing runs and nothing is counted', async () => {
    state.provider = null;
    const res = await post(valid);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('execution_disabled');
    expect(quota.consumeQuota).not.toHaveBeenCalled();
  });

  it('rejects unsupported languages, empty or oversized programs, oversized input and extra fields — before any quota is used', async () => {
    for (const body of [
      { ...valid, language: 'ruby' },
      { ...valid, language: undefined },
      { ...valid, source: '' },
      { ...valid, source: 'x'.repeat(SOURCE_MAX_CHARS + 1) },
      { ...valid, stdin: 'x'.repeat(STDIN_MAX_CHARS + 1) },
      { ...valid, stdin: 42 },
      { ...valid, timeLimit: 60 },
      { ...valid, userId: OTHER },
    ]) {
      expect((await post(body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(quota.consumeQuota).not.toHaveBeenCalled();
    expect(state.provider!.execute).not.toHaveBeenCalled();
  });
});

describe('POST /api/run — results', () => {
  it("returns the provider's real result with the language label and today's usage", async () => {
    quota.consumeQuota.mockResolvedValueOnce(7).mockResolvedValueOnce(120);
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'success', stdout: 'out\n', stderr: '', compileOutput: '', truncated: false, exitCode: 0, exitSignal: null, timeMs: 12, memoryKb: 2048,
      language: { id: 'cpp', label: 'C++ (GCC 9.2.0)' }, provider: 'judge0', usedToday: 7, dailyLimit: env.EXECUTION_DAILY_LIMIT_PER_USER,
    });
    expect(state.provider!.execute).toHaveBeenCalledWith({ language: 'cpp', source: 'int main(){}', stdin: '1 2 3' });
    expect(quota.consumeQuota).toHaveBeenNthCalledWith(1, `user:${USER}`, env.EXECUTION_DAILY_LIMIT_PER_USER, '2026-10-21');
    expect(quota.consumeQuota).toHaveBeenNthCalledWith(2, 'global', env.EXECUTION_DAILY_LIMIT_GLOBAL, '2026-10-21');
  });

  it('compile errors, runtime errors and timeouts are passed through as they are', async () => {
    for (const r of [
      { ...ok, status: 'compile_error' as const, stdout: '', compileOutput: 'error: x', exitCode: null },
      { ...ok, status: 'runtime_error' as const, stdout: '', stderr: 'Segmentation fault', exitCode: 139, exitSignal: 11 },
      { ...ok, status: 'timeout' as const, stdout: '', exitCode: null, timeMs: 2000 },
    ]) {
      state.provider = provider(async () => r);
      const res = await post(valid);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: r.status, compileOutput: r.compileOutput, stderr: r.stderr, exitCode: r.exitCode });
    }
  });

  it('long output is cut to the cap and flagged', async () => {
    state.provider = provider(async () => ({ ...ok, stdout: 'y'.repeat(OUTPUT_MAX_CHARS + 500) }));
    const res = await post(valid);
    expect(res.body.stdout).toHaveLength(OUTPUT_MAX_CHARS);
    expect(res.body.truncated).toBe(true);
  });
});

describe('POST /api/run — provider failures never look like results', () => {
  it.each([
    ['unavailable', 503],
    ['busy', 503],
    ['misconfigured', 503],
    ['timeout', 504],
  ] as const)('%s → %i with an error and no output', async (kind, status) => {
    state.provider = provider(async () => {
      throw new ExecutionProviderError(kind, 'internal detail', true);
    });
    const res = await post(valid);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(`provider_${kind}`);
    expect(res.body.error).toEqual(expect.any(String));
    for (const field of ['status', 'stdout', 'stderr', 'exitCode']) expect(res.body).not.toHaveProperty(field);
    expect(JSON.stringify(res.body)).not.toContain('internal detail');
  });

  it('when the provider never accepted the program, the user and global allowance is given back', async () => {
    state.provider = provider(async () => {
      throw new ExecutionProviderError('unavailable', 'x', false);
    });
    await post(valid);
    expect(quota.refundQuota).toHaveBeenCalledWith(`user:${USER}`, '2026-10-21');
    expect(quota.refundQuota).toHaveBeenCalledWith('global', '2026-10-21');
  });

  it('when the provider accepted the program (it may have counted it), nothing is refunded', async () => {
    state.provider = provider(async () => {
      throw new ExecutionProviderError('timeout', 'x', true);
    });
    await post(valid);
    expect(quota.refundQuota).not.toHaveBeenCalled();
  });

  it('an unexpected error is a 500, not a result', async () => {
    state.provider = provider(async () => {
      throw new Error('boom');
    });
    const res = await post(valid);
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('stdout');
  });
});

describe('POST /api/run — quotas and abuse protection', () => {
  it("the user's daily quota used up: 429, the program is not sent", async () => {
    quota.consumeQuota.mockResolvedValueOnce(null);
    const res = await post(valid);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('daily_quota_exceeded');
    expect(state.provider!.execute).not.toHaveBeenCalled();
  });

  it('the global daily cap reached: 503, the user is refunded, the program is not sent', async () => {
    quota.consumeQuota.mockResolvedValueOnce(4).mockResolvedValueOnce(null);
    const res = await post(valid);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('global_quota_exceeded');
    expect(quota.refundQuota).toHaveBeenCalledWith(`user:${USER}`, '2026-10-21');
    expect(state.provider!.execute).not.toHaveBeenCalled();
  });

  it('per-user rate limit per minute; another user is not affected', async () => {
    for (let i = 0; i < env.EXECUTION_RATE_LIMIT_PER_MINUTE; i++) expect((await post(valid)).status).toBe(200);
    const limited = await post(valid);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('execution_rate_limited');
    expect((await post(valid, OTHER)).status).toBe(200);
  });

  it('one run at a time per user', async () => {
    let release!: () => void;
    let calls = 0;
    // the first run waits until released; later runs finish at once
    state.provider = provider(() => (calls++ === 0 ? new Promise(r => (release = () => r(ok))) : Promise.resolve(ok)));
    const first = post(valid).then(r => r);
    await vi.waitFor(() => expect(state.provider!.execute).toHaveBeenCalledTimes(1));
    const second = await post(valid);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('execution_in_progress');
    release();
    expect((await first).status).toBe(200);
    expect((await post(valid)).status).toBe(200);
  });
});

describe('GET /api/run/languages', () => {
  it('requires a signed-in user', async () => {
    expect((await request(app).get('/api/run/languages')).status).toBe(401);
  });

  it("lists the provider's languages with real versions, the limits and today's usage", async () => {
    const res = await request(app).get('/api/run/languages').set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      available: true,
      provider: 'judge0',
      limits: { sourceMaxChars: SOURCE_MAX_CHARS, stdinMaxChars: STDIN_MAX_CHARS, dailyPerUser: env.EXECUTION_DAILY_LIMIT_PER_USER },
      usedToday: 3,
    });
    expect(res.body.languages).toContainEqual({ id: 'java', label: 'Java (OpenJDK 13.0.1)' });
    expect(quota.quotaUsed).toHaveBeenCalledWith(`user:${USER}`);
  });

  it('disabled: available false and no languages', async () => {
    state.provider = null;
    const res = await request(app).get('/api/run/languages').set('Cookie', cookie());
    expect(res.body).toMatchObject({ available: false, provider: null, languages: [] });
  });
});
