import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Problem } from '../models/Problem';
import { Submission, type ISubmission } from '../models/Submission';
import { ActivityLog } from '../models/ActivityLog';
import { requireAuth, extractToken, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { verifyToken } from '../services/authService';
import { resolveSession } from '../services/sessionService';
import { env } from '../config/env';
import { executionRateLimiter } from '../middleware/rateLimiter';
import { getExecutionProvider } from '../services/execution';
import { consumeQuota, refundQuota, utcDay } from '../services/execution/quota';
import { finishExecution, tryStartExecution } from '../services/execution/concurrency';
import { judgeSubmission, type JudgeOutcome } from '../services/judging/judge';

const router = Router();

// strict: a client cannot send a verdict, tests or limits along with its code
const submitSchema = z.strictObject({
  language: z.enum(['cpp', 'c', 'java', 'python'], {
    error: 'Language must be one of: cpp, c, java, python',
  }),
  code: z
    .string({ error: (issue) => (issue.input === undefined ? 'Source code is required' : undefined) })
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
        // judged by running the program; otherwise attempts are recorded without a verdict
        autoJudged: p.judgeMode === 'stdio',
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
      autoJudged: problem.judgeMode === 'stdio',
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
  executionRateLimiter,
  validateBody(submitSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const { language, code } = req.body as z.infer<typeof submitSchema>;
      const userId = req.user!.userId;
      // the session's user id, typed as the models declare it (Mongoose casts the string at runtime)
      const owner = userId as unknown as ISubmission['userId'];

      const isObjectId = mongoose.isValidObjectId(id);
      const problem = await Problem.findOne({
        $or: isObjectId ? [{ _id: id }, { problemId: id.toLowerCase() }] : [{ problemId: id.toLowerCase() }],
        publicationStatus: 'published',
      });

      if (!problem) {
        res.status(404).json({ error: 'Problem not found.' });
        return;
      }

      if (problem.judgeMode !== 'stdio') {
        // Not set up for automatic judging (its tests are not program inputs/outputs): record the attempt without a
        // verdict, as before judging existed.
        const submission = await Submission.create({
          userId: owner,
          problemId: problem.problemId,
          language,
          code,
          status: 'SUBMITTED',
          passed: false,
          runtimeMs: 0,
          memoryMb: 0,
          message: 'Attempt recorded. This problem is not set up for automatic judging, so it has no verdict.',
        });
        await logPracticeAttempt(owner, problem.problemId);
        res.status(201).json({
          submissionId: submission._id.toString(),
          problemId: problem.problemId,
          status: submission.status,
          judged: false,
          passed: submission.passed,
          runtimeMs: submission.runtimeMs,
          memoryMb: submission.memoryMb,
          message: 'Practice solution submitted and recorded. This problem is not set up for automatic judging, so it has no verdict.',
        });
        return;
      }

      const provider = getExecutionProvider();
      if (!provider) {
        res.status(503).json({ error: 'Judging is not available on this server: code execution is not configured. Your solution was not submitted.', code: 'execution_disabled' });
        return;
      }
      if (!tryStartExecution(userId)) {
        res.status(429).json({ error: 'Your previous submission or program is still running. Wait for it to finish.', code: 'execution_in_progress' });
        return;
      }
      try {
        // one run per test: reserve them all (user, then the global cap), give back what judging does not use
        const tests = problem.testCases.map(t => ({ input: t.input, expected: t.expected, isHidden: Boolean(t.isHidden) }));
        const runs = Math.max(1, tests.length);
        const day = utcDay();
        const userKey = `user:${userId}`;
        const used = await consumeQuota(userKey, env.EXECUTION_DAILY_LIMIT_PER_USER, day, runs);
        if (used === null) {
          res.status(429).json({
            error: `Judging this problem needs ${runs} code runs and you do not have that many left today (limit ${env.EXECUTION_DAILY_LIMIT_PER_USER}, resets at 00:00 UTC).`,
            code: 'daily_quota_exceeded',
          });
          return;
        }
        if ((await consumeQuota('global', env.EXECUTION_DAILY_LIMIT_GLOBAL, day, runs)) === null) {
          await refundQuota(userKey, day, runs);
          res.status(503).json({ error: 'Judging has reached its daily capacity. Please try again tomorrow.', code: 'global_quota_exceeded' });
          return;
        }

        const outcome = await judgeSubmission(provider, { language, source: code }, tests);
        const unused = runs - outcome.runsUsed;
        if (unused > 0) await Promise.all([refundQuota(userKey, day, unused), refundQuota('global', day, unused)]);

        const message = verdictMessage(outcome);
        const submission = await Submission.create({
          userId: owner,
          problemId: problem.problemId,
          language,
          code,
          status: outcome.verdict,
          passed: outcome.verdict === 'ACCEPTED',
          runtimeMs: outcome.maxTimeMs ?? 0,
          memoryMb: outcome.maxMemoryKb !== null ? Math.round((outcome.maxMemoryKb / 1024) * 10) / 10 : 0,
          message,
          testsPassed: outcome.testsPassed,
          testsTotal: outcome.testsTotal,
          failedTestNumber: outcome.failedTest?.number,
          failedTestHidden: outcome.failedTest?.hidden,
        });
        // a judging failure is not the learner's practice: the submission is kept, but earns no activity credit
        if (outcome.verdict !== 'JUDGING_ERROR') await logPracticeAttempt(owner, problem.problemId);

        res.status(201).json({
          submissionId: submission._id.toString(),
          problemId: problem.problemId,
          status: outcome.verdict,
          judged: true,
          passed: outcome.verdict === 'ACCEPTED',
          runtimeMs: submission.runtimeMs,
          memoryMb: submission.memoryMb,
          message,
          testsPassed: outcome.testsPassed,
          testsTotal: outcome.testsTotal,
          failedTest: outcome.failedTest,
          compileOutput: outcome.compileOutput,
          errorCode: outcome.error ? `provider_${outcome.error.kind}` : undefined,
          usedToday: used - Math.max(0, unused),
          dailyLimit: env.EXECUTION_DAILY_LIMIT_PER_USER,
        });
      } finally {
        finishExecution(userId);
      }
    } catch (err) {
      next(err);
    }
  }
);

const pickJudgement = ({ testsPassed, testsTotal, failedTestNumber, failedTestHidden }: Partial<ISubmission>) => ({
  testsPassed,
  testsTotal,
  failedTestNumber,
  failedTestHidden,
});

/** a practice attempt counts as activity for the day (an estimated 5 minutes, as before judging existed) */
async function logPracticeAttempt(userId: ISubmission['userId'], problemId: string) {
  await ActivityLog.findOneAndUpdate(
    { userId, date: new Date().toISOString().split('T')[0], activityType: 'problem_submitted', targetId: problemId },
    { $inc: { minutes: 5 }, $set: { updatedAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );
}

function verdictMessage(o: JudgeOutcome): string {
  const where = o.failedTest ? `${o.failedTest.hidden ? 'hidden ' : ''}test ${o.failedTest.number}` : '';
  const tally = `${o.testsPassed} of ${o.testsTotal} tests passed`;
  switch (o.verdict) {
    case 'ACCEPTED':
      return `Accepted: all ${o.testsTotal} tests passed.`;
    case 'WRONG_ANSWER':
      return `Wrong answer on ${where} (${tally}).`;
    case 'RUNTIME_ERROR':
      return `Runtime error on ${where} (${tally}).`;
    case 'TIME_LIMIT_EXCEEDED':
      return `Time limit exceeded on ${where} (${tally}).`;
    case 'COMPILATION_ERROR':
      return 'Compilation failed: no tests were run.';
    case 'JUDGING_ERROR':
      return `Judging error: ${o.error?.message ?? 'judging could not finish.'} Your solution was not judged; please try again.`;
  }
}

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
      // judged submissions only (absent on unjudged and legacy records)
      ...pickJudgement(s as Partial<ISubmission>),
      createdAt: s.createdAt.toISOString(),
    }));

    res.json({ submissions });
  } catch (err) {
    next(err);
  }
});

export default router;
