import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

interface RateRecord {
  count: number;
  resetTime: number;
}

const authHits = new Map<string, RateRecord>();
const apiHits = new Map<string, RateRecord>();

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of authHits.entries()) {
    if (now > record.resetTime) authHits.delete(key);
  }
  for (const [key, record] of apiHits.entries()) {
    if (now > record.resetTime) apiHits.delete(key);
  }
}, 300000).unref();

export function _resetRateLimitsForTesting(): void {
  authHits.clear();
  apiHits.clear();
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
