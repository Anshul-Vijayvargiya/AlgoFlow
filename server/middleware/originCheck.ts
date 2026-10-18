import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Validates request Origin / Referer for state-changing HTTP mutations (POST, PUT, PATCH, DELETE).
 *
 * CSRF Threat Model & Defense:
 * - Browsers automatically send HttpOnly cookies on cross-origin requests.
 * - While SameSite=Lax provides standard protection against standard cross-site form POSTs,
 *   Origin verification provides defense-in-depth against same-site subdomain compromise,
 *   browser compatibility edge cases, and cross-site framing.
 * - Browsers ALWAYS include the Origin header on cross-origin fetch/XHR mutations.
 * - Non-browser programmatic clients (curl, test harnesses) typically do not send an Origin header;
 *   these are permitted unless browser Sec-Fetch-Site indicates a cross-site browser context.
 */
export function validateOrigin(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (!mutatingMethods.includes(method)) {
    return next();
  }

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const secFetchSite = req.headers['sec-fetch-site'];

  // Normalize allowed origin
  let allowedOrigin: string;
  try {
    allowedOrigin = new URL(env.CLIENT_URL).origin.toLowerCase();
  } catch {
    allowedOrigin = env.CLIENT_URL.toLowerCase();
  }

  // 1. Browser-declared cross-site request (Sec-Fetch-Site metadata)
  if (secFetchSite === 'cross-site') {
    res.status(403).json({ error: 'Cross-origin mutation request rejected.' });
    return;
  }

  // 2. Origin header verification
  if (originHeader) {
    try {
      const incomingOrigin = new URL(originHeader).origin.toLowerCase();
      if (incomingOrigin !== allowedOrigin) {
        res.status(403).json({ error: 'Invalid or unauthorized request origin.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Malformed request origin header.' });
      return;
    }
    return next();
  }

  // 3. Fallback to Referer header if Origin is absent
  if (refererHeader) {
    try {
      const incomingRefererOrigin = new URL(refererHeader).origin.toLowerCase();
      if (incomingRefererOrigin !== allowedOrigin) {
        res.status(403).json({ error: 'Invalid or unauthorized request referer.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Malformed request referer header.' });
      return;
    }
    return next();
  }

  // 4. If neither Origin nor Referer is present:
  // Legitimate non-browser clients (CLI tools, server-to-server calls, unit tests)
  // do not send Origin headers. Allow them to proceed.
  next();
}
