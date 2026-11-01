import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/authService';
import { resolveSession, type SessionPrincipal } from '../services/sessionService';
import type { UserRole } from '../models/User';

export interface AuthRequest extends Request {
  user?: SessionPrincipal;
}

/**
 * The access token, from the Authorization header only. It is never read from a cookie, the URL or the body: the
 * browser keeps it in memory, and the only auth cookie (the refresh token) is scoped to /api/auth and is not a JWT.
 */
export function extractAccessToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    return token || undefined;
  }
  return undefined;
}

const REJECTIONS = {
  // the client refreshes on this one, then retries the request once
  expired: { code: 'ACCESS_TOKEN_EXPIRED', error: 'Your session needs to be renewed.' },
  invalid: { code: 'SESSION_INVALID', error: 'Invalid or expired authentication session.' },
  unknown_user: { code: 'SESSION_INVALID', error: 'Invalid or expired authentication session.' },
  revoked: { code: 'SESSION_REVOKED', error: 'Your session has ended. Please log in again.' },
  suspended: { code: 'ACCOUNT_SUSPENDED', error: 'This account has been suspended. Please contact administration.' },
} as const;

function reject(res: Response, reason: keyof typeof REJECTIONS): void {
  // 401 (not 403) for suspension too: the session itself is no longer valid
  res.status(401).json(REJECTIONS[reason]);
}

/** Verifies the access token AND checks the user's status, role and token version and the session in the database. */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = extractAccessToken(req);
  if (!token) {
    res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Authentication required. Please log in.' });
    return;
  }

  const verified = verifyAccessToken(token);
  if (!verified.ok) {
    reject(res, verified.reason);
    return;
  }

  try {
    const session = await resolveSession(verified.claims);
    if (!session.ok) {
      reject(res, session.reason);
      return;
    }
    req.user = session.principal;
  } catch (err) {
    next(err);
    return;
  }
  next();
}

/** Must run after requireAuth: `req.user.role` is the role currently stored in the database. */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: `Access denied. Requires one of roles: ${allowedRoles.join(', ')}` });
      return;
    }

    next();
  };
}
