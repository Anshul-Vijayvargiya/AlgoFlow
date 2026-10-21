import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import type { AuthRequest } from './auth';

interface RateRecord {
  count: number;
  resetTime: number;
}

const authHits = new Map<string, RateRecord>();
const apiHits = new Map<string, RateRecord>();
const executionHits = new Map<string, RateRecord>();
const tutorHits = new Map<string, RateRecord>();

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of authHits.entries()) {
    if (now > record.resetTime) authHits.delete(key);
  }
  for (const [key, record] of apiHits.entries()) {
    if (now > record.resetTime) apiHits.delete(key);
  }
  for (const [key, record] of executionHits.entries()) {
    if (now > record.resetTime) executionHits.delete(key);
  }
  for (const [key, record] of tutorHits.entries()) {
    if (now > record.resetTime) tutorHits.delete(key);
  }
}, 300000).unref();

// all AI Tutor questions together, in this process (see takeTutorGlobalSlot)
let tutorGlobal: RateRecord = { count: 0, resetTime: 0 };

export function _resetRateLimitsForTesting(): void {
  authHits.clear();
  apiHits.clear();
  executionHits.clear();
  tutorHits.clear();
  tutorGlobal = { count: 0, resetTime: 0 };
}

export function authRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const maxAuth = env.RATE_LIMIT_MAX_AUTH;

  let record = authHits.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    authHits.set(ip, record);
    return next();
  }

  if (record.count >= maxAuth) {
    res.status(429).json({
      error: 'Too many authentication attempts. Please try again later.',
      retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }

  record.count++;
  next();
}

export function apiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const maxApi = env.RATE_LIMIT_MAX_API;

  let record = apiHits.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    apiHits.set(ip, record);
    return next();
  }

  if (record.count >= maxApi) {
    res.status(429).json({
      error: 'API rate limit exceeded. Please slow down your requests.',
      retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }

  record.count++;
  next();
}

/** Code runs per signed-in user per minute (after requireAuth). Each run costs provider quota, so it is per user, not per IP. */
export function executionRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = (req as AuthRequest).user?.userId ?? req.ip ?? 'unknown';
  const now = Date.now();
  let record = executionHits.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + 60_000 };
    executionHits.set(key, record);
  }
  if (record.count >= env.EXECUTION_RATE_LIMIT_PER_MINUTE) {
    res.status(429).json({
      error: 'Too many code runs. Please wait a moment and try again.',
      code: 'execution_rate_limited',
      retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }
  record.count++;
  next();
}

/**
 * Takes one of this minute's AI Tutor requests for all users together (TUTOR_GLOBAL_RATE_LIMIT_PER_MINUTE), so a burst
 * from many users stays under the provider's per-minute limit. Taken only for a question about to be sent (after
 * validation); give it back with releaseTutorGlobalSlot if the question is not sent after all. Process-local: each
 * server instance counts its own minute.
 */
export function takeTutorGlobalSlot(now = Date.now()): { ok: true; window: number } | { ok: false; retryAfterSeconds: number } {
  if (now > tutorGlobal.resetTime) tutorGlobal = { count: 0, resetTime: now + 60_000 };
  if (tutorGlobal.count >= env.TUTOR_GLOBAL_RATE_LIMIT_PER_MINUTE) {
    return { ok: false, retryAfterSeconds: Math.ceil((tutorGlobal.resetTime - now) / 1000) };
  }
  tutorGlobal.count++;
  return { ok: true, window: tutorGlobal.resetTime };
}

/** gives back a slot from takeTutorGlobalSlot (only while its minute lasts: a new minute starts from zero anyway) */
export function releaseTutorGlobalSlot(window: number): void {
  if (tutorGlobal.resetTime === window && tutorGlobal.count > 0) tutorGlobal.count--;
}

/** AI Tutor questions per signed-in user per minute (after requireAuth); its own bucket, apart from code runs. */
export function tutorRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = (req as AuthRequest).user?.userId ?? req.ip ?? 'unknown';
  const now = Date.now();
  let record = tutorHits.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + 60_000 };
    tutorHits.set(key, record);
  }
  if (record.count >= env.TUTOR_RATE_LIMIT_PER_MINUTE) {
    res.status(429).json({
      error: 'Too many questions. Please wait a moment and try again.',
      code: 'tutor_rate_limited',
      retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }
  record.count++;
  next();
}
