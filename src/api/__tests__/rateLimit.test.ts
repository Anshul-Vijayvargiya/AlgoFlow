import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpError, httpApiClient, retryAfterMsOf } from '../httpAdapter';
import { RETRY_DEFAULTS, RateLimitedError, createDedupe, retryDelayMs, withRateLimitRetry } from '../rateLimit';

// The client's side of the API rate limit: reading the wait a 429 asks for, bounded retries with jitter, and sharing
// identical requests in flight. Sleep, randomness and the clock are injected: nothing here waits for real.
const limited = (retryAfterMs?: number, code?: string) => new HttpError('API rate limit exceeded. Please slow down your requests.', 429, code, retryAfterMs);
const harness = (random = () => 0.5) => {
  const sleeps: number[] = [];
  return { sleeps, options: { random, sleep: async (ms: number) => void sleeps.push(ms), now: () => 1_000_000 } };
};

afterEach(() => vi.unstubAllGlobals());

describe('retryAfterMsOf', () => {
  it('reads Retry-After as seconds or an HTTP date, else the body, else nothing', () => {
    expect(retryAfterMsOf('7', {})).toBe(7000);
    expect(retryAfterMsOf('Wed, 21 Oct 2026 07:28:30 GMT', {}, Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'))).toBe(30_000);
    expect(retryAfterMsOf('Wed, 21 Oct 2026 07:28:00 GMT', {}, Date.parse('Wed, 21 Oct 2026 07:29:00 GMT'))).toBe(0);
    expect(retryAfterMsOf(null, { retryAfterSeconds: 12 })).toBe(12_000);
    expect(retryAfterMsOf('soon', { retryAfterSeconds: 3 })).toBe(3000);
    expect(retryAfterMsOf(null, { retryAfterSeconds: -1 })).toBeUndefined();
    expect(retryAfterMsOf(null, {})).toBeUndefined();
  });

  it('the HTTP client puts a 429’s wait on its HttpError (header first), and nothing on other errors', async () => {
    const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers })));
    respond(429, { error: 'API rate limit exceeded. Please slow down your requests.', retryAfterSeconds: 99 }, { 'Retry-After': '42' });
    await expect(httpApiClient.practice.getProblems({ page: 1 })).rejects.toMatchObject({ status: 429, retryAfterMs: 42_000, message: 'API rate limit exceeded. Please slow down your requests.' });
    respond(429, { error: 'x', retryAfterSeconds: 5 });
    await expect(httpApiClient.practice.getProblems({ page: 1 })).rejects.toMatchObject({ retryAfterMs: 5000 });
    respond(500, { error: 'boom' }, { 'Retry-After': '42' });
    const err = await httpApiClient.practice.getProblems({ page: 1 }).catch(e => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.retryAfterMs).toBeUndefined();
  });
});

describe('withRateLimitRetry', () => {
  it('a success needs one request', async () => {
    const fn = vi.fn(async () => 'ok');
    const { options, sleeps } = harness();
    await expect(withRateLimitRetry(fn, options)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('a 429 is retried after the wait the server asked for (plus up to a quarter, jittered), then recovers', async () => {
    const fn = vi.fn().mockRejectedValueOnce(limited(2000)).mockResolvedValueOnce('ok');
    const { options, sleeps } = harness(() => 0.5);
    await expect(withRateLimitRetry(fn, options)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2250]);
    // never sooner than asked, never more than a quarter later
    for (const r of [0, 0.999]) expect(retryDelayMs(0, 2000, { baseDelayMs: 1000, random: () => r })).toBeGreaterThanOrEqual(2000);
    expect(retryDelayMs(0, 2000, { baseDelayMs: 1000, random: () => 0.999 })).toBeLessThanOrEqual(2500);
  });

  it('without a wait from the server: full-jitter exponential backoff', () => {
    const delays = (r: number) => [0, 1, 2].map(a => retryDelayMs(a, undefined, { baseDelayMs: 1000, random: () => r }));
    expect(delays(0.999)).toEqual([1000, 1999, 3997]);
    expect(delays(0)).toEqual([1, 1, 1]);
  });

  it('at most maxRetries retries, then a RateLimitedError saying when to try again (no storm)', async () => {
    const fn = vi.fn(async () => {
      throw limited(1000);
    });
    const { options, sleeps } = harness(() => 0);
    const err = await withRateLimitRetry(fn, options).catch(e => e);
    expect(fn).toHaveBeenCalledTimes(1 + RETRY_DEFAULTS.maxRetries);
    expect(sleeps).toEqual([1000, 1000]);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(err).toMatchObject({ status: 429, retryAt: 1_000_000 + 1000, message: 'API rate limit exceeded. Please slow down your requests.' });
  });

  it('a wait longer than maxDelayMs (the 15-minute window) is not waited out: reported at once with its time', async () => {
    const fn = vi.fn(async () => {
      throw limited(900_000);
    });
    const { options, sleeps } = harness();
    const err = await withRateLimitRetry(fn, options).catch(e => e);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
    expect(err).toMatchObject({ retryAt: 1_000_000 + 900_000 });
  });

  it('a 429 that waiting cannot fix (a daily quota, a run in progress: they carry a code) and other errors are not retried', async () => {
    for (const e of [limited(1000, 'daily_quota_exceeded'), new HttpError('boom', 500), new Error('Network error.')]) {
      const fn = vi.fn(async () => {
        throw e;
      });
      const { options, sleeps } = harness();
      await expect(withRateLimitRetry(fn, options)).rejects.toBe(e);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(sleeps).toEqual([]);
    }
  });
});

describe('createDedupe', () => {
  it('identical requests in flight share one; a later one starts afresh; different keys do not share', async () => {
    const dedupe = createDedupe();
    let resolve!: (v: string) => void;
    const fn = vi.fn(() => new Promise<string>(r => (resolve = r)));
    const a = dedupe('k', fn);
    const b = dedupe('k', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    resolve('one');
    await expect(Promise.all([a, b])).resolves.toEqual(['one', 'one']);
    const other = vi.fn(async () => 'other');
    await expect(dedupe('k2', other)).resolves.toBe('other');
    const again = vi.fn(async () => 'two');
    await expect(dedupe('k', again)).resolves.toBe('two');
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('a failure is shared too, and then forgotten (the next call asks again)', async () => {
    const dedupe = createDedupe();
    const failing = vi.fn(async () => {
      throw new Error('nope');
    });
    await expect(Promise.all([dedupe('k', failing), dedupe('k', failing)])).rejects.toThrow('nope');
    expect(failing).toHaveBeenCalledTimes(1);
    const ok = vi.fn(async () => 'fine');
    await expect(dedupe('k', ok)).resolves.toBe('fine');
  });
});
