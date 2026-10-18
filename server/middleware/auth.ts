import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/authService';
import { resolveSession, type SessionPrincipal } from '../services/sessionService';
import { AUTH_COOKIE_NAME, authCookieOptions } from '../config/authCookie';
import type { UserRole } from '../models/User';

export interface AuthRequest extends Request {
  user?: SessionPrincipal;
}

export function extractToken(req: Request): string | undefined {
  if (req.cookies?.[AUTH_COOKIE_NAME]) {
    return req.cookies[AUTH_COOKIE_NAME];
  }
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }
  return undefined;
}

const REJECTIONS = {
  invalid: { code: 'SESSION_INVALID', error: 'Invalid or expired authentication session.' },
  unknown_user: { code: 'SESSION_INVALID', error: 'Invalid or expired authentication session.' },
  revoked: { code: 'SESSION_REVOKED', error: 'Your session has ended. Please log in again.' },
  suspended: { code: 'ACCOUNT_SUSPENDED', error: 'This account has been suspended. Please contact administration.' },
} as const;

function reject(res: Response, reason: keyof typeof REJECTIONS): void {
  // 401 (not 403) for suspension too: the session itself is no longer valid, and the client signs out on 401.
  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions());
  res.status(401).json(REJECTIONS[reason]);
}

/** Verifies the token AND checks the user's current status, role and token version in the database. */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  const claims = verifyToken(token);
  if (!claims) {
    reject(res, 'invalid');
    return;
  }

  try {
    const session = await resolveSession(claims);
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
