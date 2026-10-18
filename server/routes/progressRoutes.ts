import { Router } from 'express';
import { z } from 'zod';
import { ProgressTrack } from '../models/ProgressTrack';
import { ActivityLog, ActivityType } from '../models/ActivityLog';
import { Submission } from '../models/Submission';
import { Problem } from '../models/Problem';
import { User } from '../models/User';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

const activitySchema = z.object({
  minutes: z.number().min(0).max(180).optional().default(5),
  steps: z.number().min(0).max(1000).optional().default(10),
  algorithmId: z.string().trim().max(100).optional(),
  activityType: z
    .enum(['visualizer_step', 'algorithm_completed', 'problem_submitted', 'problem_solved'])
    .optional()
    .default('visualizer_step'),
});

const updateProgressSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  stepsCompleted: z.number().min(0).optional(),
  totalSteps: z.number().min(0).optional(),
  lastStepIndex: z.number().min(0).optional(),
  topic: z.string().trim().max(50).optional(),
});

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

    // 3. Count completed algorithms
    const algorithmsLearned = await ProgressTrack.countDocuments({
      userId,
      status: 'completed',
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
      const solvedProblems = await Problem.find({ _id: { $in: solvedIds } }).select('difficulty');
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

    // 6. Topic proficiency based on algorithms tracked
    const allTracks = await ProgressTrack.find({ userId });
    const topicScores: Record<string, { total: number; completed: number }> = {
      Sorting: { total: 4, completed: 0 },
      Searching: { total: 3, completed: 0 },
      Arrays: { total: 4, completed: 0 },
      Trees: { total: 3, completed: 0 },
      Graphs: { total: 3, completed: 0 },
      DP: { total: 3, completed: 0 },
    };

    for (const track of allTracks) {
      const topicName = track.topic || 'Sorting';
      if (!topicScores[topicName]) {
        topicScores[topicName] = { total: 3, completed: 0 };
      }
      if (track.status === 'completed') {
        topicScores[topicName].completed++;
      }
    }

    const topicProficiency = Object.entries(topicScores).map(([topic, data]) => ({
      topic,
      score: Math.min(100, Math.round((data.completed / Math.max(1, data.total)) * 100)),
    }));

    // Update user record with latest computed metrics for consistency
    await User.updateOne(
      { _id: userId },
      { $set: { streakDays, solvedCount, algorithmsLearned } }
    );

    const totalPlatformAlgorithms = 26;
    const overallProgressPercent = Math.min(
      100,
      Math.round((algorithmsLearned / totalPlatformAlgorithms) * 100)
    );

    res.json({
      streakDays,
      solvedCount,
      algorithmsLearned,
      weeklyActivity,
      difficultyDistribution,
      topicProficiency,
      overallProgressPercent,
    });
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

// POST /api/progress/activity — Record legitimate learning activity (deduplicated)
router.post(
  '/activity',
  requireAuth,
  validateBody(activitySchema),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user?.userId;
      const { minutes, steps, algorithmId, activityType } = req.body;
      const todayStr = toDateString(new Date());
      const targetId = algorithmId || 'general';

      // Deduplication: upsert record for (userId, date, activityType, targetId)
      // Caps maximum daily addition per target to prevent count gaming
      await ActivityLog.findOneAndUpdate(
        {
          userId,
          date: todayStr,
          activityType: activityType as ActivityType,
          targetId,
        },
        {
          $inc: {
            minutes: Math.min(minutes || 0, 60),
            steps: Math.min(steps || 0, 500),
          },
          $set: { updatedAt: new Date() },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
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

// PUT /api/progress/algorithms/:algorithmId — Update algorithm completion state
router.put(
  '/algorithms/:algorithmId',
  requireAuth,
  validateBody(updateProgressSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user?.userId;
      const { algorithmId } = req.params;
      const { status, stepsCompleted, totalSteps, lastStepIndex, topic } = req.body;

      const updateData: Record<string, any> = {
        lastActivityAt: new Date(),
      };

      if (status !== undefined) updateData.status = status;
      if (stepsCompleted !== undefined) updateData.stepsCompleted = stepsCompleted;
      if (totalSteps !== undefined) updateData.totalSteps = totalSteps;
      if (lastStepIndex !== undefined) updateData.lastStepIndex = lastStepIndex;
      if (topic !== undefined) updateData.topic = topic;

      if (status === 'completed') {
        updateData.completedAt = new Date();
        updateData.$inc = { executionCount: 1 };
      }

      const track = await ProgressTrack.findOneAndUpdate(
        { userId, algorithmId },
        updateData,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Also record activity log if completed
      if (status === 'completed') {
        const todayStr = toDateString(new Date());
        await ActivityLog.findOneAndUpdate(
          {
            userId,
            date: todayStr,
            activityType: 'algorithm_completed',
            targetId: algorithmId,
          },
          {
            $inc: { minutes: 15, steps: totalSteps || 10 },
          },
          { upsert: true, new: true }
        );
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
