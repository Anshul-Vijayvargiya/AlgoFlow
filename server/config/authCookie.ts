import type { CookieOptions } from 'express';
import { env } from './env';

export const AUTH_COOKIE_NAME = 'algoflow_token';
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches the JWT lifetime

/**
 * Secure (https only) in every strict environment (staging, production). SameSite=Lax means the front end and the
 * API must be same-site (same origin, or sibling subdomains of one registrable domain).
 */
export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isStrict,
    sameSite: 'lax',
    path: '/',
  };
}
