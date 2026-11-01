import type { CookieOptions } from 'express';
import { env } from './env';

/**
 * The refresh token's cookie. The access token is never a cookie: the browser keeps it in memory and sends it as a
 * Bearer header.
 *
 * - HttpOnly: page scripts cannot read it.
 * - Secure (https only) in every strict environment (staging, production).
 * - SameSite=Lax: the front end and the API must be same-site (one origin with /api reverse-proxied, or sibling
 *   subdomains of one registrable domain). Unrelated hosting domains (e.g. *.vercel.app and *.onrender.com) are
 *   cross-site: the browser will not send this cookie, and refresh fails. SameSite=None is deliberately not used.
 * - Path=/api/auth: sent only to the auth endpoints (refresh and logout), never with ordinary API requests.
 * - No Domain attribute: host-only, the most restrictive choice.
 */
export const REFRESH_COOKIE_NAME = 'algoflow_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';

/** The previous design's 7-day session cookie: never read any more, and cleared on every auth response. */
export const LEGACY_AUTH_COOKIE_NAME = 'algoflow_token';

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isStrict,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

/** how the legacy cookie was set (path "/"), so clearing it matches */
export function legacyCookieOptions(): CookieOptions {
  return { httpOnly: true, secure: env.isStrict, sameSite: 'lax', path: '/' };
}
