import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Problem } from '../models/Problem';
import { Submission } from '../models/Submission';
import { ActivityLog } from '../models/ActivityLog';
import { requireAuth, extractToken, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { verifyToken } from '../services/authService';
import { resolveSession } from '../services/sessionService';

const router = Router();

const submitSchema = z.object({
  language: z.enum(['cpp', 'c', 'java', 'python'], {
    errorMap: () => ({ message: 'Language must be one of: cpp, c, java, python' }),
  }),
  code: z
    .string({ required_error: 'Source code is required' })
    .min(1, 'Source code cannot be empty')
    .max(50000, 'Source code cannot exceed 50,000 characters'),
});

// Helper: Optional authentication resolver (doesn't reject if unauthenticated). Uses the same database-backed session
// check as requireAuth, so a revoked or suspended session is simply treated as anonymous.
async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  const claims = token ? verifyToken(token) : null;
  if (claims) {
    try {
      const session = await resolveSession(claims);
      if (session.ok) {
        req.user = session.principal;
      }
    } catch (err) {
      next(err);
      return;
    }
  }
  next();
}

// Helper: Escape regex
function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// GET /api/problems — List published problems with filtering, pagination, and user solve state
router.get('/', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {
      publicationStatus: 'published',
    };

    const difficulty = typeof req.query.difficulty === 'string' ? req.query.difficulty.trim() : undefined;
    if (difficulty && difficulty !== 'All') {
      filter.difficulty = difficulty;
    }

    const category = typeof req.query.category === 'string' ? req.query.category.trim() : undefined;
    if (category && category !== 'All') {
      filter.category = category;
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    if (search) {
      const sanitized = escapeRegex(search);
      filter.$or = [
        { title: { $regex: sanitized, $options: 'i' } },
        { category: { $regex: sanitized, $options: 'i' } },
        { tags: { $regex: sanitized, $options: 'i' } },
      ];
    }

    // Resolve user solved problems if authenticated
    let solvedSet = new Set<string>();
    if (req.user?.userId) {
      const solved = await Submission.distinct('problemId', {
        userId: req.user.userId,
        passed: true,
      });
      solvedSet = new Set(solved);
    }

    const [total, rawProblems] = await Promise.all([
      Problem.countDocuments(filter),
      Problem.find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // Sanitize problems: never leak hidden test cases to client
    const problems = rawProblems.map((p) => {
      const publicTestCases = (p.testCases || [])
        .filter((tc) => !tc.isHidden)
        .map((tc) => ({ input: tc.input, expected: tc.expected }));

      return {
        id: p.problemId,
        problemId: p.problemId,
        title: p.title,
        difficulty: p.difficulty,
        category: p.category,
        tags: p.tags || [],
        description: p.description,
        constraints: p.constraints || [],
        examples: p.examples || [],
        starterCode: p.starterCode || { cpp: '', c: '', java: '', python: '' },
        testCases: publicTestCases,
        solved: solvedSet.has(p.problemId),
      };
    });

    res.json({
      problems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/problems/:id — Fetch single problem without exposing hidden evaluation test cases
router.get('/:id', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const isObjectId = mongoose.isValidObjectId(id);

    const problem = await Problem.findOne({
      $or: isObjectId ? [{ _id: id }, { problemId: id.toLowerCase() }] : [{ problemId: id.toLowerCase() }],
      publicationStatus: 'published',
    }).lean();

    if (!problem) {
      res.status(404).json({ error: 'Problem not found.' });
      return;
    }

    // Check if current user has solved it
    let solved = false;
    if (req.user?.userId) {
      const userSolve = await Submission.findOne({
        userId: req.user.userId,
        problemId: problem.problemId,
        passed: true,
      });
      solved = !!userSolve;
    }

    // Filter out hidden test cases
    const publicTestCases = (problem.testCases || [])
      .filter((tc) => !tc.isHidden)
      .map((tc) => ({ input: tc.input, expected: tc.expected }));

    res.json({
      id: problem.problemId,
      problemId: problem.problemId,
      title: problem.title,
      difficulty: problem.difficulty,
      category: problem.category,
      tags: problem.tags || [],
      description: problem.description,
      constraints: problem.constraints || [],
      examples: problem.examples || [],
      starterCode: problem.starterCode || { cpp: '', c: '', java: '', python: '' },
      testCases: publicTestCases,
      solved,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/problems/:id/submit — Record practice attempt
router.post(
  '/:id/submit',
  requireAuth,
  validateBody(submitSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const { language, code } = req.body;
      const userId = req.user?.userId;

      const isObjectId = mongoose.isValidObjectId(id);
      const problem = await Problem.findOne({
        $or: isObjectId ? [{ _id: id }, { problemId: id.toLowerCase() }] : [{ problemId: id.toLowerCase() }],
        publicationStatus: 'published',
      });

      if (!problem) {
        res.status(404).json({ error: 'Problem not found.' });
        return;
      }

      // Record authentic practice attempt in Submission collection
      // Status is recorded as 'SUBMITTED'. Sandbox evaluation service scheduled for Phase 4.
      const submission = await Submission.create({
        userId,
        problemId: problem.problemId,
        language,
        code,
        status: 'SUBMITTED',
        passed: false,
        runtimeMs: 0,
        memoryMb: 0,
        message: 'Practice attempt recorded. Secure code execution sandbox will be integrated in Phase 4.',
      });

      // Log practice attempt in ActivityLog
      const todayStr = new Date().toISOString().split('T')[0];
      await ActivityLog.findOneAndUpdate(
        {
          userId,
          date: todayStr,
          activityType: 'problem_submitted',
          targetId: problem.problemId,
        },
        {
          $inc: { minutes: 5 },
          $set: { updatedAt: new Date() },
        },
        { upsert: true, new: true }
      );

      res.status(201).json({
        submissionId: submission._id.toString(),
        problemId: problem.problemId,
        status: submission.status,
        passed: submission.passed,
        runtimeMs: submission.runtimeMs,
        memoryMb: submission.memoryMb,
        message: 'Practice solution submitted and recorded successfully! (Automated sandboxed evaluation scheduled for Phase 4)',
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/problems/:id/submissions — Fetch authenticated user's attempt history for problem
router.get('/:id/submissions', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const isObjectId = mongoose.isValidObjectId(id);

    const problem = await Problem.findOne({
      $or: isObjectId ? [{ _id: id }, { problemId: id.toLowerCase() }] : [{ problemId: id.toLowerCase() }],
    });

    if (!problem) {
      res.status(404).json({ error: 'Problem not found.' });
      return;
    }

    const rawSubmissions = await Submission.find({
      userId: req.user?.userId,
      problemId: problem.problemId,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const submissions = rawSubmissions.map((s) => ({
      id: s._id.toString(),
      problemId: s.problemId,
      language: s.language,
      code: s.code,
      status: s.status,
      passed: s.passed,
      runtimeMs: s.runtimeMs,
      memoryMb: s.memoryMb,
      message: s.message,
      createdAt: s.createdAt.toISOString(),
    }));

    res.json({ submissions });
  } catch (err) {
    next(err);
  }
});

export default router;
