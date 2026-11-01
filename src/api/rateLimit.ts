/**
 * Client-side manners for AlgoFlow's API rate limit (server/middleware/rateLimiter.ts: a fixed window per IP shared by
 * every /api request, answered with 429 and the wait as Retry-After).
 *
 *  - dedupe: identical requests already in flight share one network request (a remount, React StrictMode's double
 *    effect, two components asking for the same data).
 *  - withRateLimitRetry: a 429 from the rate limiter is retried a few times, waiting what the server asked for (or a
 *    jittered exponential backoff when it does not say), and never longer than maxDelayMs: a longer wait is given up at
 *    once and reported with its time, so nothing retries in a storm or waits for minutes behind the user's back.
 */
import { HttpError } from './httpAdapter';

/** the error a request ends with when it is rate limited: the time after which trying again makes sense */
export class RateLimitedError extends Error {
  readonly status = 429;
  /** epoch ms after which the server should accept the request again */
  readonly retryAt: number;
  constructor(message: string, retryAt: number) {
    super(message);
    this.name = 'RateLimitedError';
    this.retryAt = retryAt;
  }
}

/** a 429 that waiting can fix: the general limiter's, not a daily quota or a run still in progress (those carry a code) */
export const isRetryableRateLimit = (err: unknown): err is HttpError => err instanceof HttpError && err.status === 429 && !err.code;

export interface RetryOptions {
  /** retries after the first attempt */
  maxRetries?: number;
  /** first backoff when the server gives no wait; doubled each retry */
  baseDelayMs?: number;
  /** the longest wait retried automatically; a longer one is reported instead */
  maxDelayMs?: number;
  /** 0 ≤ x < 1; Math.random by default (tests pass their own) */
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const RETRY_DEFAULTS = { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 20_000 } as const;

const realSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * The wait before retry number `attempt` (0-based): what the server asked for plus up to a quarter more (so clients
 * told the same time do not all return together), or full jitter over the exponential backoff when it did not say.
 */
export function retryDelayMs(attempt: number, retryAfterMs: number | undefined, opts: Required<Pick<RetryOptions, 'baseDelayMs' | 'random'>>): number {
  if (retryAfterMs !== undefined) return Math.ceil(retryAfterMs * (1 + 0.25 * opts.random()));
  return Math.ceil(opts.baseDelayMs * 2 ** attempt * opts.random()) + 1;
}

/** runs fn, retrying the general rate limiter's 429 within the bounds above; any other error is thrown at once */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...RETRY_DEFAULTS, ...options };
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableRateLimit(err)) throw err;
      const delay = retryDelayMs(attempt, err.retryAfterMs, { baseDelayMs, random });
      // out of retries, or asked to wait too long: report when to try again rather than wait (or hammer) here
      if (attempt >= maxRetries || delay > maxDelayMs) {
        throw new RateLimitedError(err.message, now() + (err.retryAfterMs ?? delay));
      }
      await sleep(delay);
    }
  }
}

/** shares one in-flight promise per key; the entry is dropped when it settles, so a later call starts afresh */
export function createDedupe() {
  const inFlight = new Map<string, Promise<unknown>>();
  return function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const running = inFlight.get(key);
    if (running) return running as Promise<T>;
    const p = fn().finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  };
}
