import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

// Strict Zod schema for profile / settings update
// Explicitly ignores/disallows role, accountStatus, email, streak, etc.
const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(60, 'Name cannot exceed 60 characters')
    .optional(),
  preferences: z
    .object({
      theme: z.enum(['dark', 'light', 'system']).optional(),
      preferredLanguage: z.enum(['cpp', 'c', 'java', 'python']).optional(),
      dailyGoalMinutes: z.number().int('The daily goal must be a whole number of minutes').min(5).max(300).optional(),
    })
    .optional(),
});

function sanitizeProfile(user: any) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    preferences: user.preferences || {
      theme: 'dark',
      preferredLanguage: 'cpp',
      dailyGoalMinutes: 30,
    },
    streakDays: user.streakDays,
    solvedCount: user.solvedCount,
    algorithmsLearned: user.algorithmsLearned,
    avatarUrl: user.avatarUrl,
  };
}

// GET /api/users/profile — Fetch authenticated user profile & settings
router.get('/profile', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ user: sanitizeProfile(user) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/profile — Update display name and settings safely
router.patch(
  '/profile',
  requireAuth,
  validateBody(updateProfileSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { name, preferences } = req.body;
      const userId = req.user?.userId;

      const updateFields: Record<string, any> = {};
      if (name !== undefined) {
        updateFields.name = name;
      }
      if (preferences) {
        if (preferences.theme !== undefined) {
          updateFields['preferences.theme'] = preferences.theme;
        }
        if (preferences.preferredLanguage !== undefined) {
          updateFields['preferences.preferredLanguage'] = preferences.preferredLanguage;
        }
        if (preferences.dailyGoalMinutes !== undefined) {
          updateFields['preferences.dailyGoalMinutes'] = preferences.dailyGoalMinutes;
        }
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      res.json({ user: sanitizeProfile(user) });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
