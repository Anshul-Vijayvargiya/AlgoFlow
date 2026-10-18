import { Router, Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { hashPassword, comparePassword, generateToken, verifyToken } from '../services/authService';
import { revokeSessionsForToken } from '../services/sessionService';
import { requireAuth, extractToken, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiter';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_MS, authCookieOptions } from '../config/authCookie';

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

function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, { ...authCookieOptions(), maxAge: AUTH_COOKIE_MAX_AGE_MS });
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

    const token = generateToken({ userId: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    setAuthCookie(res, token);

    res.status(201).json({
      user: {
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
        progressPercent: 5,
      },
    });
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

    const token = generateToken({ userId: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    setAuthCookie(res, token);

    res.json({
      user: {
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
        progressPercent: 68,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — revokes every session of the user (server side), then clears the cookie.
// Works without a valid session too, so a client can always clear a stale cookie.
router.post('/logout', async (req, res, next) => {
  try {
    const token = extractToken(req);
    const claims = token ? verifyToken(token) : null;
    if (claims) {
      await revokeSessionsForToken(claims);
    }
  } catch (err) {
    next(err);
    return;
  }
  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions());
  res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({
      user: {
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
        progressPercent: 68,
      },
    });
  } catch (err) {
    next(err);
  }
});


export default router;
