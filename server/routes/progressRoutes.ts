import { Router } from 'express';
import { z } from 'zod';
import { ProgressTrack, type IProgressTrack } from '../models/ProgressTrack';
import { ActivityLog, ActivityType } from '../models/ActivityLog';
import { Submission } from '../models/Submission';
import { Problem } from '../models/Problem';
import { User } from '../models/User';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  AVAILABLE_ALGORITHM_COUNT,
  IMPLEMENTED_ALGORITHM_COUNT,
  IMPLEMENTED_ALGORITHM_IDS,
  IMPLEMENTED_TOPICS,
  isImplementedAlgorithm,
  topicOfAlgorithm,
} from '../../src/data/algorithmCatalog';

const router = Router();

/**
 * Legacy activity report. Only visualizer steps can be reported by a client, and only as the furthest step viewed:
 *  - steps: how many steps of the algorithm's trace were viewed (step index + 1), at least 2 (step 0 alone is opening
 *    the trace). Stored as the day's maximum, the same record POST /visualizer-activity keeps.
 *  - minutes: still accepted so older clients are not rejected, but ignored: the client cannot measure time.
 *  - problem submissions are logged by the server when a problem is submitted; completion and solved problems have no
 *    server-side verification. None of them can be reported here.
 */
const activitySchema = z
  .object({
    minutes: z.number().min(0).max(180).optional(),
    steps: z.number().int().min(2).max(5001),
    algorithmId: z.string().trim().max(100),
    activityType: z
      .string()
      .optional()
      .default('visualizer_step')
      .refine(t => t === 'visualizer_step', {
        message: 'Only visualizer steps can be reported. Submissions, solved problems and completion are recorded by the server.',
      }),
  })
  .strict();

/**
 * A visualizer walkthrough: the user stepped (Next / Play) to stepIndex of a trace of an implemented algorithm.
 * stepIndex >= 1, because opening a trace (step 0) is not activity. The cap is far above any trace the app produces.
 */
const visualizerActivitySchema = z
  .object({
    algorithmId: z.string().trim().max(100),
    stepIndex: z.number().int().min(1).max(5000),
  })
  .strict();

/**
 * Legacy algorithm progress update. Progress itself is server-derived: an algorithm becomes 'in_progress' through
 * POST /visualizer-activity, its step and topic come from that activity and the algorithm list, and nothing can mark
 * it 'completed' (there is no verified completion rule). The only change a client may make is to reset its own
 * existing record to 'not_started'.
 */
const updateProgressSchema = z
  .object({
    status: z.literal('not_started'),
  })
  .strict();

// Helper: Format date as YYYY-MM-DD
function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper: Calculate authentic active streak
async function calculateStreak(userId: any): Promise<number> {
  const distinctDays: string[] = await ActivityLog.distinct('date', { userId });
  if (distinctDays.length === 0) return 0;

  const daySet = new Set(distinctDays);
  const now = new Date();
  const todayStr = toDateString(now);

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = toDateString(yesterday);

  // If user has no activity today and no activity yesterday, the streak is 0
  if (!daySet.has(todayStr) && !daySet.has(yesterdayStr)) {
    return 0;
  }

  // Count backwards from latest active day
  let currentCheck = daySet.has(todayStr) ? now : yesterday;
  let streak = 0;

  while (true) {
    const dStr = toDateString(currentCheck);
    if (daySet.has(dStr)) {
      streak++;
      currentCheck.setUTCDate(currentCheck.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

// Helper: Build 7-day weekly activity array from real DB records
async function getWeeklyActivity(userId: any): Promise<{ day: string; date: string; minutes: number; steps: number }[]> {
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result: { day: string; date: string; minutes: number; steps: number }[] = [];

  const now = new Date();
  const dateStrings: string[] = [];

  // Last 7 days in chronological order
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const dStr = toDateString(d);
    dateStrings.push(dStr);
    result.push({
      day: daysOfWeek[d.getUTCDay()],
      date: dStr,
      minutes: 0,
      steps: 0,
    });
  }

  const logs = await ActivityLog.find({
    userId,
    date: { $in: dateStrings },
  });

  const aggregateMap: Record<string, { minutes: number; steps: number }> = {};
  for (const log of logs) {
    if (!aggregateMap[log.date]) {
      aggregateMap[log.date] = { minutes: 0, steps: 0 };
    }
    aggregateMap[log.date].minutes += log.minutes || 0;
    aggregateMap[log.date].steps += log.steps || 0;
  }

  return result.map((item) => ({
    ...item,
    minutes: aggregateMap[item.date]?.minutes || 0,
    steps: aggregateMap[item.date]?.steps || 0,
  }));
}

// GET /api/progress/summary — Authentic user progress calculation
router.get('/summary', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;

    // 1. Calculate streak
    const streakDays = await calculateStreak(userId);

    // 2. Count distinct solved problems
    const solvedProblemIds = await Submission.distinct('problemId', {
      userId,
      passed: true,
    });
    const solvedCount = solvedProblemIds.length;

    // 3. Count completed algorithms (only those the app implements)
    const algorithmsLearned = await ProgressTrack.countDocuments({
      userId,
      status: 'completed',
      algorithmId: { $in: IMPLEMENTED_ALGORITHM_IDS },
    });

    // 4. Weekly activity from real ActivityLogs
    const weeklyActivity = await getWeeklyActivity(userId);

    // 5. Difficulty distribution from solved problems
    const solvedSubmissions = await Submission.find({
      userId,
      passed: true,
    }).select('problemId');

    // Aggregate difficulty
    const solvedIds = Array.from(new Set(solvedSubmissions.map((s) => s.problemId)));
    let easyCount = 0;
    let mediumCount = 0;
    let hardCount = 0;

    if (solvedIds.length > 0) {
      // Submission.problemId is the problem's slug (Problem.problemId), not its _id
      const solvedProblems = await Problem.find({ problemId: { $in: solvedIds } }).select('difficulty');
      for (const p of solvedProblems) {
        if (p.difficulty === 'Easy') easyCount++;
        else if (p.difficulty === 'Medium') mediumCount++;
        else if (p.difficulty === 'Hard') hardCount++;
      }
    }

    const difficultyDistribution = [
      { name: 'Easy', value: easyCount, color: '#10B981' },
      { name: 'Medium', value: mediumCount, color: '#F59E0B' },
      { name: 'Hard', value: hardCount, color: '#F43F5E' },
    ];

    // 6. Topics: only those with implemented algorithms; a track's topic comes from the algorithm list, never the client
    const allTracks = ((await ProgressTrack.find({ userId })) as unknown as IProgressTrack[]).filter(t => isImplementedAlgorithm(t.algorithmId));
    const tracksByAlgorithm = new Map(allTracks.map(t => [t.algorithmId, t]));
    const topicCoverage = IMPLEMENTED_TOPICS.map(({ topic, algorithmIds }) => ({
      topic,
      implemented: algorithmIds.length,
      // explored: the user stepped through it in the visualizer (in progress) or completed it
      practised: algorithmIds.filter(id => ['in_progress', 'completed'].includes(tracksByAlgorithm.get(id)?.status ?? '')).length,
      completed: algorithmIds.filter(id => tracksByAlgorithm.get(id)?.status === 'completed').length,
    }));
    const topicProficiency = topicCoverage.map(t => ({ topic: t.topic, score: Math.round((t.completed / t.implemented) * 100) }));
    const practisedCount = allTracks.filter(t => t.status === 'in_progress' || t.status === 'completed').length;

    // Update user record with latest computed metrics for consistency
    await User.updateOne(
      { _id: userId },
      { $set: { streakDays, solvedCount, algorithmsLearned } }
    );

    // progress is measured against the algorithms that can actually be learned in the app (implemented ones)
    const overallProgressPercent = Math.min(100, Math.round((algorithmsLearned / IMPLEMENTED_ALGORITHM_COUNT) * 100));
    const algorithmTotals = {
      available: AVAILABLE_ALGORITHM_COUNT,
      implemented: IMPLEMENTED_ALGORITHM_COUNT,
      practised: practisedCount,
      completed: algorithmsLearned,
    };

    res.json({
      streakDays,
      solvedCount,
      algorithmsLearned,
      weeklyActivity,
      difficultyDistribution,
      topicProficiency,
      topicCoverage,
      algorithmTotals,
      overallProgressPercent,
    });
  } catch (err) {
    next(err);
  }
});

const isDuplicateKey = (err: unknown) => (err as { code?: number } | null)?.code === 11000;

/** a concurrent first request can lose an upsert race on a unique index; one retry then updates the winner's record */
async function upsertOnce<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (isDuplicateKey(err)) return op();
    throw err;
  }
}

/**
 * POST /api/progress/visualizer-activity — the signed-in user stepped through a visualizer trace.
 * Idempotent: per (user, day, algorithm) the furthest step is kept with $max, so retries, remounts and repeated
 * requests never inflate it. The algorithm's track becomes 'in_progress' (never 'completed': there is no verified
 * completion rule). No time is recorded: the visualizer does not measure it.
 */
router.post('/visualizer-activity', requireAuth, validateBody(visualizerActivitySchema), async (req: AuthRequest, res, next) => {
  try {
    // the session's user id, typed as the models declare it (Mongoose casts the string at runtime)
    const userId = req.user?.userId as unknown as IProgressTrack['userId'];
    const { algorithmId, stepIndex } = req.body as z.infer<typeof visualizerActivitySchema>;
    if (!isImplementedAlgorithm(algorithmId)) {
      res.status(400).json({ error: 'Unknown algorithm.' });
      return;
    }
    const now = new Date();
    const stepsViewed = stepIndex + 1;

    const log = await upsertOnce(() =>
      ActivityLog.findOneAndUpdate(
        { userId, date: toDateString(now), activityType: 'visualizer_step', targetId: algorithmId },
        { $max: { steps: stepsViewed }, $set: { updatedAt: now } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      )
    );

    await upsertOnce(() =>
      ProgressTrack.findOneAndUpdate(
        { userId, algorithmId },
        {
          $set: { lastActivityAt: now, topic: topicOfAlgorithm(algorithmId) },
          $max: { lastStepIndex: stepIndex },
          $setOnInsert: { status: 'in_progress' },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      )
    );
    // a track that exists but was never started (e.g. created through the older endpoint) is now in progress
    await ProgressTrack.updateOne({ userId, algorithmId, status: 'not_started' }, { $set: { status: 'in_progress' } });

    res.json({ recorded: true, algorithmId, date: toDateString(now), stepsViewed: (log as { steps?: number } | null)?.steps ?? stepsViewed });
  } catch (err) {
    next(err);
  }
});

// GET /api/progress/algorithms — Fetch all algorithm progress tracks for user
router.get('/algorithms', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const tracks = await ProgressTrack.find({ userId: req.user?.userId }).sort({ updatedAt: -1 });
    res.json({ tracks });
  } catch (err) {
    next(err);
  }
});

// POST /api/progress/activity — legacy visualizer step report (see activitySchema; idempotent per user, day and algorithm)
router.post(
  '/activity',
  requireAuth,
  validateBody(activitySchema),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user?.userId;
      const { steps, algorithmId } = req.body as z.infer<typeof activitySchema>;
      if (!isImplementedAlgorithm(algorithmId)) {
        res.status(400).json({ error: 'Unknown algorithm.' });
        return;
      }
      const now = new Date();

      // steps is a furthest-step maximum, not a count: a repeated report cannot add to it. No minutes are recorded.
      await upsertOnce(() =>
        ActivityLog.findOneAndUpdate(
          {
            userId,
            date: toDateString(now),
            activityType: 'visualizer_step' as ActivityType,
            targetId: algorithmId,
          },
          {
            $max: { steps },
            $set: { updatedAt: now },
          },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        )
      );

      // Return updated progress summary
      const streakDays = await calculateStreak(userId);
      const weeklyActivity = await getWeeklyActivity(userId);

      res.json({
        success: true,
        streakDays,
        weeklyActivity,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/progress/algorithms/:algorithmId — reset the user's own existing record (see updateProgressSchema)
router.put(
  '/algorithms/:algorithmId',
  requireAuth,
  validateBody(updateProgressSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user?.userId;
      const { algorithmId } = req.params;
      if (!isImplementedAlgorithm(algorithmId)) {
        res.status(400).json({ error: 'Unknown algorithm.' });
        return;
      }
      const { status } = req.body as z.infer<typeof updateProgressSchema>;

      // never creates a record: progress starts with validated visualizer activity
      const track = await ProgressTrack.findOneAndUpdate({ userId, algorithmId }, { $set: { status } }, { returnDocument: 'after' });
      if (!track) {
        res.status(404).json({ error: 'No progress has been recorded for this algorithm.' });
        return;
      }

      res.json(track);
    } catch (err) {
      next(err);
    }
  }
);

// Backward compatibility alias for GET /api/progress
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    const streakDays = await calculateStreak(userId);
    const solvedProblemIds = await Submission.distinct('problemId', { userId, passed: true });
    const weeklyActivity = await getWeeklyActivity(userId);

    res.json({
      weeklyActivity,
      difficultyDistribution: [
        { name: 'Easy', value: 0, color: '#10B981' },
        { name: 'Medium', value: 0, color: '#F59E0B' },
        { name: 'Hard', value: 0, color: '#F43F5E' },
      ],
      streakDays,
      solvedCount: solvedProblemIds.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
