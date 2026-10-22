import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';
import { ALGORITHM_NAV } from '../../src/data/algorithmMetadata';
import { IMPLEMENTED_ALGORITHM_COUNT, IMPLEMENTED_TOPICS } from '../../src/data/algorithmCatalog';

// Progress accuracy and visualizer activity recording (UI sprint, phase 2). Models are mocked as in productRoutes.test.ts.
const { mockProgressTrack, mockActivityLog, mockProblem, mockSubmission, mockUser } = vi.hoisted(() => ({
  mockProgressTrack: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), countDocuments: vi.fn() },
  mockActivityLog: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), distinct: vi.fn() },
  mockProblem: { find: vi.fn(), findOne: vi.fn(), countDocuments: vi.fn() },
  mockSubmission: { find: vi.fn(), findOne: vi.fn(), create: vi.fn(), distinct: vi.fn() },
  mockUser: { findById: vi.fn(), findByIdAndUpdate: vi.fn(), updateOne: vi.fn() },
}));

vi.mock('../models/ProgressTrack', () => ({ ProgressTrack: mockProgressTrack }));
vi.mock('../models/ActivityLog', () => ({ ActivityLog: mockActivityLog }));
vi.mock('../models/Problem', () => ({ Problem: mockProblem }));
vi.mock('../models/Submission', () => ({ Submission: mockSubmission }));
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));
vi.mock('../models/User', () => ({ User: mockUser }));

const queryOf = (result: unknown) => ({
  select: vi.fn().mockReturnThis(),
  then: (ok?: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, fail),
});

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439022';
const cookie = (id = USER) => [`algoflow_token=${tokenFor(id, 'USER')}`];
const today = () => new Date().toISOString().slice(0, 10);

const post = (body: unknown, id = USER) => request(app).post('/api/progress/visualizer-activity').set('Cookie', cookie(id)).send(body as object);

/** summary mocks: no activity, no submissions, and the given tracks */
function mockSummary(tracks: { algorithmId: string; status: string }[], completed = tracks.filter(t => t.status === 'completed').length) {
  mockActivityLog.distinct.mockResolvedValue([]);
  mockActivityLog.find.mockResolvedValue([]);
  mockSubmission.distinct.mockResolvedValue([]);
  mockSubmission.find.mockReturnValue(queryOf([]));
  mockProgressTrack.countDocuments.mockResolvedValue(completed);
  mockProgressTrack.find.mockResolvedValue(tracks);
  mockUser.updateOne.mockResolvedValue({});
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitsForTesting();
  mockActivityLog.findOneAndUpdate.mockResolvedValue({ steps: 4 });
  mockProgressTrack.findOneAndUpdate.mockResolvedValue({});
  mockProgressTrack.updateOne.mockResolvedValue({});
});

describe('POST /api/progress/visualizer-activity', () => {
  it('requires a signed-in user', async () => {
    const res = await request(app).post('/api/progress/visualizer-activity').send({ algorithmId: 'bubble-sort', stepIndex: 3 });
    expect(res.status).toBe(401);
    expect(mockActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("records the step for the session's own user, keeping the furthest step for the day (idempotent $max, no time)", async () => {
    const res = await post({ algorithmId: 'bubble-sort', stepIndex: 3 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recorded: true, algorithmId: 'bubble-sort', date: today(), stepsViewed: 4 });
    const [filter, update, options] = mockActivityLog.findOneAndUpdate.mock.calls[0];
    expect(String(filter.userId)).toBe(USER);
    expect(filter).toMatchObject({ date: today(), activityType: 'visualizer_step', targetId: 'bubble-sort' });
    expect(update.$max).toEqual({ steps: 4 });
    expect(update).not.toHaveProperty('$inc');
    expect(JSON.stringify(update)).not.toContain('minutes');
    expect(options).toMatchObject({ upsert: true });
  });

  it('marks the algorithm in progress — never completed — with its topic from the algorithm list', async () => {
    await post({ algorithmId: 'reverse-linked-list', stepIndex: 2 });
    const [filter, update] = mockProgressTrack.findOneAndUpdate.mock.calls[0];
    expect(String(filter.userId)).toBe(USER);
    expect(filter.algorithmId).toBe('reverse-linked-list');
    expect(update.$setOnInsert).toEqual({ status: 'in_progress' });
    expect(update.$set.topic).toBe('Linked List');
    expect(update.$max).toEqual({ lastStepIndex: 2 });
    expect(JSON.stringify(update)).not.toContain('completed');
    // an existing never-started track moves to in progress; a completed one is left alone
    expect(mockProgressTrack.updateOne).toHaveBeenCalledWith(expect.objectContaining({ algorithmId: 'reverse-linked-list', status: 'not_started' }), { $set: { status: 'in_progress' } });
  });

  it('the same request twice sends the same idempotent update (a retry cannot inflate the record)', async () => {
    await post({ algorithmId: 'merge-sort', stepIndex: 5 });
    await post({ algorithmId: 'merge-sort', stepIndex: 5 });
    const [a, b] = mockActivityLog.findOneAndUpdate.mock.calls;
    expect(a[0]).toEqual(b[0]);
    expect(a[1].$max).toEqual(b[1].$max);
  });

  it('a concurrent first request that loses the upsert race is retried once', async () => {
    mockActivityLog.findOneAndUpdate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 })).mockResolvedValueOnce({ steps: 6 });
    const res = await post({ algorithmId: 'merge-sort', stepIndex: 5 });
    expect(res.status).toBe(200);
    expect(mockActivityLog.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('other database failures are reported as errors, not as recorded', async () => {
    mockActivityLog.findOneAndUpdate.mockRejectedValue(new Error('connection lost'));
    const res = await post({ algorithmId: 'merge-sort', stepIndex: 5 });
    expect(res.status).toBe(500);
    expect(res.body.recorded).toBeUndefined();
  });

  it('rejects unknown and unimplemented algorithms', async () => {
    const unimplemented = ALGORITHM_NAV.find(a => !a.implemented)!.id;
    for (const algorithmId of ['no-such-algo', unimplemented]) {
      const res = await post({ algorithmId, stepIndex: 1 });
      expect(res.status, algorithmId).toBe(400);
    }
    expect(mockActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects step 0 (opening a trace), invalid steps and extra fields such as a completion claim or another user', async () => {
    for (const body of [
      { algorithmId: 'bubble-sort', stepIndex: 0 },
      { algorithmId: 'bubble-sort', stepIndex: -1 },
      { algorithmId: 'bubble-sort', stepIndex: 1.5 },
      { algorithmId: 'bubble-sort', stepIndex: 99999 },
      { algorithmId: 'bubble-sort' },
      { algorithmId: 'bubble-sort', stepIndex: 2, status: 'completed' },
      { algorithmId: 'bubble-sort', stepIndex: 2, minutes: 30 },
      { algorithmId: 'bubble-sort', stepIndex: 2, userId: OTHER },
    ]) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(mockActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockProgressTrack.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("each user's activity is written under their own id only", async () => {
    await post({ algorithmId: 'bubble-sort', stepIndex: 1 }, OTHER);
    expect(String(mockActivityLog.findOneAndUpdate.mock.calls[0][0].userId)).toBe(OTHER);
    expect(String(mockProgressTrack.findOneAndUpdate.mock.calls[0][0].userId)).toBe(OTHER);
  });
});

describe('POST /api/progress/activity (legacy) — hardened', () => {
  const activity = (body: unknown, id = USER) => request(app).post('/api/progress/activity').set('Cookie', cookie(id)).send(body as object);
  const UNIMPLEMENTED = ALGORITHM_NAV.find(a => !a.implemented)!.id;

  beforeEach(() => {
    mockActivityLog.distinct.mockResolvedValue([]);
    mockActivityLog.find.mockResolvedValue([]);
    // the response's weekly activity counts submissions too
    mockSubmission.find.mockReturnValue(queryOf([]));
  });

  it('requires a signed-in user', async () => {
    const res = await request(app).post('/api/progress/activity').send({ algorithmId: 'bubble-sort', steps: 3 });
    expect(res.status).toBe(401);
    expect(mockActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("legitimate visualizer steps: stored as the day's furthest step for the session user; response format unchanged", async () => {
    const res = await activity({ algorithmId: 'bubble-sort', steps: 12, activityType: 'visualizer_step' });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['streakDays', 'success', 'weeklyActivity']);
    expect(res.body.success).toBe(true);
    const [filter, update, options] = mockActivityLog.findOneAndUpdate.mock.calls[0];
    expect(String(filter.userId)).toBe(USER);
    expect(filter).toMatchObject({ date: today(), activityType: 'visualizer_step', targetId: 'bubble-sort' });
    expect(update).toEqual({ $max: { steps: 12 }, $set: { updatedAt: expect.any(Date) } });
    expect(options).toMatchObject({ upsert: true });
    // it reports activity only: no progress record is created or advanced
    expect(mockProgressTrack.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockProgressTrack.updateOne).not.toHaveBeenCalled();
  });

  it('client minutes are never recorded (accepted for older clients, ignored)', async () => {
    const res = await activity({ algorithmId: 'bubble-sort', steps: 5, minutes: 180 });
    expect(res.status).toBe(200);
    expect(JSON.stringify(mockActivityLog.findOneAndUpdate.mock.calls[0][1])).not.toContain('minutes');
  });

  it('repeated requests cannot inflate steps: each sends the same $max, never $inc', async () => {
    for (let i = 0; i < 3; i++) expect((await activity({ algorithmId: 'bubble-sort', steps: 40 })).status).toBe(200);
    const updates = mockActivityLog.findOneAndUpdate.mock.calls.map(c => c[1]);
    expect(updates).toHaveLength(3);
    expect(updates.every(u => !('$inc' in u) && u.$max.steps === 40)).toBe(true);
  });

  it('no defaults are invented: a report without steps or an algorithm is rejected', async () => {
    for (const body of [{}, { algorithmId: 'bubble-sort' }, { steps: 5 }]) expect((await activity(body)).status, JSON.stringify(body)).toBe(400);
    expect(mockActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects submission, solved and completion events, and unknown event types', async () => {
    for (const activityType of ['problem_submitted', 'problem_solved', 'algorithm_completed', 'anything']) {
      const res = await activity({ algorithmId: 'bubble-sort', steps: 5, activityType });
      expect(res.status, activityType).toBe(400);
    }
    expect(mockActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects unknown and unimplemented algorithms', async () => {
    for (const algorithmId of ['no-such-algo', UNIMPLEMENTED, 'general']) expect((await activity({ algorithmId, steps: 5 })).status, algorithmId).toBe(400);
    expect(mockActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid values and extra fields (another user, a status, a date)', async () => {
    for (const body of [
      { algorithmId: 'bubble-sort', steps: 1 },
      { algorithmId: 'bubble-sort', steps: 0 },
      { algorithmId: 'bubble-sort', steps: 2.5 },
      { algorithmId: 'bubble-sort', steps: 5002 },
      { algorithmId: 'bubble-sort', steps: 5, minutes: -1 },
      { algorithmId: 'bubble-sort', steps: 5, userId: OTHER },
      { algorithmId: 'bubble-sort', steps: 5, status: 'completed' },
      { algorithmId: 'bubble-sort', steps: 5, date: '2020-01-01' },
    ]) {
      expect((await activity(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(mockActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('PUT /api/progress/algorithms/:id (legacy) — hardened', () => {
  const put = (id: string, body: unknown, user = USER) => request(app).put(`/api/progress/algorithms/${id}`).set('Cookie', cookie(user)).send(body as object);

  it('requires a signed-in user', async () => {
    const res = await request(app).put('/api/progress/algorithms/bubble-sort').send({ status: 'not_started' });
    expect(res.status).toBe(401);
    expect(mockProgressTrack.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("resets the user's own existing record and returns it (response format unchanged)", async () => {
    const track = { algorithmId: 'bubble-sort', status: 'not_started', lastStepIndex: 4, stepsCompleted: 0, totalSteps: 0, executionCount: 0 };
    mockProgressTrack.findOneAndUpdate.mockResolvedValue(track);
    const res = await put('bubble-sort', { status: 'not_started' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(track);
    const [filter, update, options] = mockProgressTrack.findOneAndUpdate.mock.calls[0];
    expect(String(filter.userId)).toBe(USER);
    expect(filter.algorithmId).toBe('bubble-sort');
    expect(update).toEqual({ $set: { status: 'not_started' } });
    // never creates a record
    expect(options?.upsert).toBeFalsy();
  });

  it('a record that does not exist is not created (404)', async () => {
    mockProgressTrack.findOneAndUpdate.mockResolvedValue(null);
    const res = await put('merge-sort', { status: 'not_started' }, OTHER);
    expect(res.status).toBe(404);
    expect(String(mockProgressTrack.findOneAndUpdate.mock.calls[0][0].userId)).toBe(OTHER);
  });

  it('rejects unknown and unimplemented algorithm ids', async () => {
    for (const id of ['no-such-algo', ALGORITHM_NAV.find(a => !a.implemented)!.id]) expect((await put(id, { status: 'not_started' })).status, id).toBe(400);
    expect(mockProgressTrack.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('cannot forge progress or completion, and rejects every other field', async () => {
    for (const body of [
      { status: 'completed' },
      { status: 'in_progress' },
      { status: 'in_progress', lastStepIndex: 2 },
      {},
      { status: 'not_started', topic: 'Graphs' },
      { status: 'not_started', lastStepIndex: 3 },
      { status: 'not_started', stepsCompleted: 10, totalSteps: 10 },
      { status: 'not_started', completedAt: new Date().toISOString() },
      { status: 'not_started', userId: OTHER },
    ]) {
      expect((await put('bubble-sort', body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(mockProgressTrack.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /api/progress/summary — totals', () => {
  it('reports totals from the algorithm list: available, implemented, explored and completed', async () => {
    mockSummary([
      { algorithmId: 'bubble-sort', status: 'in_progress' },
      { algorithmId: 'merge-sort', status: 'completed' },
      { algorithmId: 'reverse-linked-list', status: 'in_progress' },
      { algorithmId: 'heap-sort', status: 'not_started' },
      // not implemented / unknown: never counted
      { algorithmId: ALGORITHM_NAV.find(a => !a.implemented)!.id, status: 'completed' },
      { algorithmId: 'no-such-algo', status: 'in_progress' },
    ], 1);
    const res = await request(app).get('/api/progress/summary').set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.body.algorithmTotals).toEqual({ available: ALGORITHM_NAV.length, implemented: IMPLEMENTED_ALGORITHM_COUNT, practised: 3, completed: 1 });
    expect(IMPLEMENTED_ALGORITHM_COUNT).toBe(ALGORITHM_NAV.filter(a => a.implemented).length);
    expect(res.body.algorithmsLearned).toBe(1);
    expect(res.body.overallProgressPercent).toBe(Math.round((1 / IMPLEMENTED_ALGORITHM_COUNT) * 100));
    // completed algorithms are counted among implemented ones only
    expect(mockProgressTrack.countDocuments.mock.calls[0][0]).toMatchObject({ status: 'completed', algorithmId: { $in: expect.arrayContaining(['bubble-sort']) } });
    expect(mockProgressTrack.countDocuments.mock.calls[0][0].algorithmId.$in).toHaveLength(IMPLEMENTED_ALGORITHM_COUNT);
  });

  it('topic coverage lists only topics with implemented algorithms, with exact counts', async () => {
    mockSummary([
      { algorithmId: 'bubble-sort', status: 'in_progress' },
      { algorithmId: 'merge-sort', status: 'completed' },
      { algorithmId: 'reverse-linked-list', status: 'in_progress' },
    ]);
    const res = await request(app).get('/api/progress/summary').set('Cookie', cookie());
    const coverage = res.body.topicCoverage as { topic: string; implemented: number; practised: number; completed: number }[];
    expect(coverage.map(t => t.topic)).toEqual(IMPLEMENTED_TOPICS.map(t => t.topic));
    expect(coverage.find(t => t.topic === 'Sorting')).toMatchObject({ practised: 2, completed: 1 });
    expect(coverage.find(t => t.topic === 'Linked List')).toMatchObject({ practised: 1, completed: 0 });
    expect(coverage.reduce((n, t) => n + t.implemented, 0)).toBe(IMPLEMENTED_ALGORITHM_COUNT);
    // topics with nothing to visualize (e.g. graphs, DP) are not reported as 0% proficiency
    expect(res.body.topicProficiency.map((t: { topic: string }) => t.topic)).toEqual(IMPLEMENTED_TOPICS.map(t => t.topic));
  });

  it('a new account: all zeros, nothing invented', async () => {
    mockSummary([]);
    const res = await request(app).get('/api/progress/summary').set('Cookie', cookie());
    expect(res.body.algorithmTotals).toMatchObject({ practised: 0, completed: 0 });
    expect(res.body.overallProgressPercent).toBe(0);
    expect(res.body.weeklyActivity.every((d: { steps: number; minutes: number }) => d.steps === 0 && d.minutes === 0)).toBe(true);
  });

  it('solved problems are matched to their difficulty by problem slug', async () => {
    mockSummary([]);
    mockSubmission.distinct.mockResolvedValue(['two-sum']);
    mockSubmission.find.mockReturnValue(queryOf([{ problemId: 'two-sum' }]));
    mockProblem.find.mockReturnValue(queryOf([{ difficulty: 'Medium' }]));
    const res = await request(app).get('/api/progress/summary').set('Cookie', cookie());
    expect(mockProblem.find).toHaveBeenCalledWith({ problemId: { $in: ['two-sum'] } });
    expect(res.body.difficultyDistribution.map((d: { value: number }) => d.value)).toEqual([0, 1, 0]);
  });

  it("summaries read only the signed-in user's records", async () => {
    mockSummary([]);
    await request(app).get('/api/progress/summary').set('Cookie', cookie(OTHER));
    expect(String(mockProgressTrack.find.mock.calls[0][0].userId)).toBe(OTHER);
    expect(String(mockActivityLog.find.mock.calls[0][0].userId)).toBe(OTHER);
  });
});

describe('weekly activity: daily counts from real records', () => {
  const dayOffset = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`);
  // the difficulty query asks for passed submissions; the weekly query asks for every submission since the first day
  const submissionsFor = (weekly: { createdAt?: Date }[]) =>
    mockSubmission.find.mockImplementation((filter: Record<string, unknown>) => queryOf('passed' in filter ? [] : weekly));

  it('walkthroughs are visualizer_step records (one per algorithm per day); submissions come from the submissions themselves', async () => {
    mockSummary([]);
    mockActivityLog.find.mockResolvedValue([
      { date: today(), activityType: 'visualizer_step', targetId: 'bubble-sort', steps: 12, minutes: 0 },
      { date: today(), activityType: 'visualizer_step', targetId: 'heap-sort', steps: 3, minutes: 0 },
      // the estimated minutes of a practice attempt never become a submission count
      { date: today(), activityType: 'problem_submitted', targetId: 'p1', steps: 0, minutes: 15 },
      { date: dayOffset(2), activityType: 'visualizer_step', targetId: 'bubble-sort', steps: 4, minutes: 0 },
    ]);
    submissionsFor([
      { createdAt: new Date() },
      { createdAt: new Date() },
      { createdAt: startOfDay(dayOffset(6)) },
      // before the first day, or without a time: not counted
      { createdAt: new Date(startOfDay(dayOffset(6)).getTime() - 1) },
      {},
    ]);
    const res = await request(app).get('/api/progress/summary').set('Cookie', cookie());
    expect(res.status).toBe(200);
    const week = res.body.weeklyActivity;
    expect(week.map((d: { date: string }) => d.date)).toEqual([6, 5, 4, 3, 2, 1, 0].map(dayOffset));
    // the existing fields are unchanged; the counts are added beside them
    expect(week[6]).toEqual({
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getUTCDay()],
      date: today(),
      minutes: 15,
      steps: 15,
      submissions: 2,
      walkthroughs: 2,
    });
    expect(week[4]).toMatchObject({ minutes: 0, steps: 4, submissions: 0, walkthroughs: 1 });
    expect(week[0]).toMatchObject({ submissions: 1, walkthroughs: 0 });
    expect(week.reduce((n: number, d: { submissions: number }) => n + d.submissions, 0)).toBe(3);
  });

  it('asks for this user\'s submissions since the first day (00:00 UTC), judging failures excluded', async () => {
    mockSummary([]);
    submissionsFor([]);
    await request(app).get('/api/progress/summary').set('Cookie', cookie());
    const weeklyQuery = mockSubmission.find.mock.calls.map(c => c[0]).find((f: Record<string, unknown>) => !('passed' in f));
    expect(weeklyQuery).toEqual({ userId: USER, createdAt: { $gte: startOfDay(dayOffset(6)) }, status: { $ne: 'JUDGING_ERROR' } });
  });

  it('a week with no records: seven days of zeros, nothing invented', async () => {
    mockSummary([]);
    submissionsFor([]);
    const res = await request(app).get('/api/progress/summary').set('Cookie', cookie());
    expect(res.body.weeklyActivity).toHaveLength(7);
    for (const d of res.body.weeklyActivity) expect(d).toMatchObject({ minutes: 0, steps: 0, submissions: 0, walkthroughs: 0 });
  });
});
