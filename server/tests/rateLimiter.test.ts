import { describe, it, expect, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import { _resetRateLimitsForTesting, apiRateLimiter, authRateLimiter } from '../middleware/rateLimiter';

// The rate limiters' 429: the wait as the standard Retry-After header (whole seconds) and as retryAfterSeconds in the
// body, which the app reads. Driven directly with stub requests: no routes, no database.
function call(limiter: typeof apiRateLimiter, ip = '203.0.113.7') {
  const res = { statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown };
  const stub = {
    setHeader: (k: string, v: string) => ((res.headers[k.toLowerCase()] = v), stub),
    status: (code: number) => ((res.statusCode = code), stub),
    json: (b: unknown) => ((res.body = b), stub),
  };
  let passed = false;
  limiter({ ip, socket: {} } as unknown as Request, stub as unknown as Response, () => (passed = true));
  return { passed, ...res };
}

beforeEach(() => _resetRateLimitsForTesting());

describe('rate limiter 429 responses', () => {
  it('the API limiter lets RATE_LIMIT_MAX_API requests through, then answers 429 with Retry-After and retryAfterSeconds', () => {
    for (let k = 0; k < env.RATE_LIMIT_MAX_API; k++) expect(call(apiRateLimiter).passed).toBe(true);
    const blocked = call(apiRateLimiter);
    expect(blocked.passed).toBe(false);
    expect(blocked.statusCode).toBe(429);
    const seconds = (blocked.body as { retryAfterSeconds: number }).retryAfterSeconds;
    expect(blocked.body).toMatchObject({ error: 'API rate limit exceeded. Please slow down your requests.' });
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000));
    expect(blocked.headers['retry-after']).toBe(String(seconds));
    // another address has its own allowance
    expect(call(apiRateLimiter, '203.0.113.8').passed).toBe(true);
  });

  it('the auth limiter sends the same header', () => {
    for (let k = 0; k < env.RATE_LIMIT_MAX_AUTH; k++) call(authRateLimiter);
    const blocked = call(authRateLimiter);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toMatch(/^[1-9]\d*$/);
  });
});
