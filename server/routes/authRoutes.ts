import { Router, Response } from 'express';
import { z } from 'zod';
import { User, type IUser } from '../models/User';
import { hashPassword, comparePassword, generateAccessToken, verifyAccessToken } from '../services/authService';
import { createSession, revokeAllSessions, revokeSessionById, revokeSessionByRefreshToken, rotateRefreshToken } from '../services/sessionService';
import { requireAuth, extractAccessToken, AuthRequest } from '../middleware/auth';
import { requireFrontendOrigin } from '../middleware/originCheck';
import { validateBody } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiter';
import { LEGACY_AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME, legacyCookieOptions, refreshCookieOptions } from '../config/authCookie';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60, 'Name cannot exceed 60 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password cannot exceed 72 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required').max(72, 'Password cannot exceed 72 characters'),
});

/**
 * Sessions (see docs/authentication.md):
 *  - sign-in (register / login) starts a session: the refresh token goes in an HttpOnly cookie scoped to /api/auth,
 *    and a short-lived access token (ACCESS_TOKEN_TTL) is returned in the body for the front end to keep in memory;
 *  - POST /refresh rotates the refresh token and returns a new access token;
 *  - POST /logout ends this device's session; POST /logout-all ends every session of the account.
 * Responses carrying a token are never cached.
 */
function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...refreshCookieOptions(), expires: expiresAt });
  // the previous design's 7-day cookie is no longer used: remove it wherever it is still set
  res.clearCookie(LEGACY_AUTH_COOKIE_NAME, legacyCookieOptions());
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.clearCookie(LEGACY_AUTH_COOKIE_NAME, legacyCookieOptions());
}

function accessTokenBody(userId: string, sessionId: string, tokenVersion: number) {
  const { token, expiresAt } = generateAccessToken({ userId, sessionId, tokenVersion });
  return { accessToken: token, accessTokenExpiresAt: expiresAt.toISOString() };
}

/** starts a session for a signed-in user: the refresh cookie, and the access token for the response body */
async function startSession(res: Response, user: Pick<IUser, '_id' | 'tokenVersion'>) {
  const userId = user._id.toString();
  const tokenVersion = user.tokenVersion ?? 0;
  const session = await createSession(userId, tokenVersion);
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  res.set('Cache-Control', 'no-store');
  return accessTokenBody(userId, session.sessionId, tokenVersion);
}

function userBody(user: IUser, progressPercent: number) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus || 'active',
    preferences: user.preferences || {
      theme: 'dark',
      preferredLanguage: 'cpp',
      dailyGoalMinutes: 30,
    },
    streakDays: user.streakDays,
    solvedCount: user.solvedCount,
    algorithmsLearned: user.algorithmsLearned,
    progressPercent,
  };
}

// POST /api/auth/register
router.post('/register', authRateLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
      role: 'USER',
    });

    const tokens = await startSession(res, user);
    res.status(201).json({ user: userBody(user, 5), ...tokens });
  } catch (err: any) {
    // Catch MongoDB duplicate key error (code 11000) for concurrent race conditions
    if (err?.code === 11000 || (err?.name === 'MongoServerError' && err?.code === 11000)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authRateLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // Only after the password is verified, so the suspension state of an account is not disclosed to anyone else
    if (user.accountStatus === 'suspended') {
      res.status(403).json({ error: 'This account has been suspended. Please contact administration.' });
      return;
    }

    const tokens = await startSession(res, user);
    res.json({ user: userBody(user, 68), ...tokens });
  } catch (err) {
    next(err);
  }
});

const REFRESH_FAILURES = {
  invalid: { code: 'REFRESH_INVALID', error: 'No active session. Please log in.' },
  expired: { code: 'REFRESH_EXPIRED', error: 'Your session has expired. Please log in again.' },
  revoked: { code: 'SESSION_REVOKED', error: 'Your session has ended. Please log in again.' },
  reuse: { code: 'SESSION_REVOKED', error: 'Your session has ended. Please log in again.' },
  suspended: { code: 'ACCOUNT_SUSPENDED', error: 'This account has been suspended. Please contact administration.' },
} as const;

// POST /api/auth/refresh — the refresh cookie (never a URL, body or header value) for a rotated cookie and a new
// access token. Only from the front end's own origin (requireFrontendOrigin, on top of the global origin check).
router.post('/refresh', requireFrontendOrigin, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const result = await rotateRefreshToken(req.cookies?.[REFRESH_COOKIE_NAME]);
    if (!result.ok) {
      if (result.reason === 'race') {
        // another request rotated this token a moment ago (another tab): its new cookie is already on its way
        res.status(409).json({ code: 'REFRESH_IN_PROGRESS', error: 'Your session is being renewed. Please retry.' });
        return;
      }
      clearAuthCookies(res);
      res.status(401).json(REFRESH_FAILURES[result.reason]);
      return;
    }
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.json(accessTokenBody(result.userId, result.sessionId, result.tokenVersion));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — ends this device's session (the one the refresh cookie, or else a valid access token,
// belongs to), then clears the cookies. Always succeeds, so a client can clear a stale or invalid cookie too; a stale
// cookie never ends a newer session.
router.post('/logout', async (req, res, next) => {
  clearAuthCookies(res);
  try {
    const revoked = await revokeSessionByRefreshToken(req.cookies?.[REFRESH_COOKIE_NAME]);
    if (!revoked) {
      const token = extractAccessToken(req);
      const verified = token ? verifyAccessToken(token) : null;
      if (verified?.ok) await revokeSessionById(verified.claims.sessionId, verified.claims.userId);
    }
  } catch (err) {
    next(err);
    return;
  }
  res.json({ message: 'Logged out successfully.' });
});

// POST /api/auth/logout-all — ends every session of the account (needs a current access token)
router.post('/logout-all', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await revokeAllSessions(req.user!.userId);
    clearAuthCookies(res);
    res.json({ message: 'Logged out of every device.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user: userBody(user, 68) });
  } catch (err) {
    next(err);
  }
});

export default router;
