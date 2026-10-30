import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

// The Dashboard's data: the daily checklist (GET /api/progress/today, PUT /api/progress/today/goals/:goalId), recent
// activity (GET /api/progress/recent) and the streak in the summary. Models are mocked as in progressTracking.test.ts.
const { mockProgressTrack, mockActivityLog, mockProblem, mockSubmission, mockUser, mockDailyGoalLog } = vi.hoisted(() => ({
  mockProgressTrack: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), countDocuments: vi.fn() },
  mockActivityLog: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), distinct: vi.fn(), countDocuments: vi.fn() },
  mockProblem: { find: vi.fn(), findOne: vi.fn(), countDocuments: vi.fn() },
  mockSubmission: { find: vi.fn(), findOne: vi.fn(), create: vi.fn(), distinct: vi.fn(), countDocuments: vi.fn() },
  mockUser: { findById: vi.fn(), findByIdAndUpdate: vi.fn(), updateOne: vi.fn() },
  mockDailyGoalLog: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}));

vi.mock('../models/ProgressTrack', () => ({ ProgressTrack: mockProgressTrack }));
vi.mock('../models/ActivityLog', () => ({ ActivityLog: mockActivityLog }));
vi.mock('../models/Problem', () => ({ Problem: mockProblem }));
vi.mock('../models/Submission', () => ({ Submission: mockSubmission }));
vi.mock('../models/DailyGoalLog', () => ({ DailyGoalLog: mockDailyGoalLog }));
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));
vi.mock('../models/User', () => ({ User: mockUser }));

/** a Mongoose query: chainable, and awaitable with the given result */
const queryOf = (result: unknown) => {
  const q = {
    select: vi.fn(() => q),
    sort: vi.fn(() => q),
    limit: vi.fn(() => q),
    lean: vi.fn(() => q),
    then: (ok?: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, fail),
  };
  return q;
};

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439022';
const cookie = (id = USER) => [`algoflow_token=${tokenFor(id, 'USER')}`];
const NOW = new Date('2026-10-21T13:45:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitsForTesting();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mockActivityLog.countDocuments.mockResolvedValue(0);
  mockSubmission.countDocuments.mockResolvedValue(0);
  mockDailyGoalLog.findOne.mockReturnValue(queryOf(null));
  mockDailyGoalLog.findOneAndUpdate.mockResolvedValue({});
  mockDailyGoalLog.updateOne.mockResolvedValue({});
});
afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/progress/today', () => {
  it('requires a signed-in user', async () => {
    const res = await request(app).get('/api/progress/today');
    expect(res.status).toBe(401);
    expect(mockActivityLog.countDocuments).not.toHaveBeenCalled();
  });

  it("today's UTC day, when it resets, the verified counts and the ticked goals — all for the session's user only", async () => {
    mockActivityLog.countDocuments.mockResolvedValue(2);
    mockSubmission.countDocuments.mockImplementation(async (q: { status: unknown }) => (q.status === 'ACCEPTED' ? 1 : 3));
    mockDailyGoalLog.findOne.mockReturnValue(queryOf({ completed: ['review'] }));
    const res = await request(app).get('/api/progress/today').set('Cookie', cookie(OTHER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date: '2026-10-21',
      resetsAt: '2026-10-22T00:00:00.000Z',
      verified: { walkthroughs: 2, submissions: 3, accepted: 1 },
      manualCompleted: ['review'],
    });
    expect(mockActivityLog.countDocuments).toHaveBeenCalledWith({ userId: OTHER, date: '2026-10-21', activityType: 'visualizer_step' });
    const range = { $gte: new Date('2026-10-21T00:00:00.000Z'), $lt: new Date('2026-10-22T00:00:00.000Z') };
    expect(mockSubmission.countDocuments).toHaveBeenCalledWith({ userId: OTHER, createdAt: range, status: { $ne: 'JUDGING_ERROR' } });
    expect(mockSubmission.countDocuments).toHaveBeenCalledWith({ userId: OTHER, createdAt: range, status: 'ACCEPTED' });
    expect(mockDailyGoalLog.findOne).toHaveBeenCalledWith({ userId: OTHER, date: '2026-10-21' });
  });

  it('a stored tick that is not a manual goal (e.g. a verified goal written by an old client) is never reported as done', async () => {
    mockDailyGoalLog.findOne.mockReturnValue(queryOf({ completed: ['submit', 'review', 'review', 'bogus'] }));
    const res = await request(app).get('/api/progress/today').set('Cookie', cookie());
    expect(res.body.manualCompleted).toEqual(['review']);
  });

  it('a new UTC day starts empty; the previous day is looked up by nothing (its record is kept, not deleted)', async () => {
    vi.setSystemTime(new Date('2026-10-22T00:00:01.000Z'));
    const res = await request(app).get('/api/progress/today').set('Cookie', cookie());
    expect(res.body).toMatchObject({ date: '2026-10-22', resetsAt: '2026-10-23T00:00:00.000Z', manualCompleted: [] });
    expect(mockDailyGoalLog.findOne).toHaveBeenCalledWith({ userId: USER, date: '2026-10-22' });
    expect(mockDailyGoalLog.updateOne).not.toHaveBeenCalled();
  });
});

describe('PUT /api/progress/today/goals/:goalId', () => {
  const put = (goalId: string, body: unknown, id = USER) => request(app).put(`/api/progress/today/goals/${goalId}`).set('Cookie', cookie(id)).send(body as object);

  it('requires a signed-in user', async () => {
    const res = await request(app).put('/api/progress/today/goals/review').send({ done: true });
    expect(res.status).toBe(401);
    expect(mockDailyGoalLog.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('ticking: one record per user and UTC day, the goal added once ($addToSet, so repeats never duplicate it)', async () => {
    mockDailyGoalLog.findOne.mockReturnValue(queryOf({ completed: ['review'] }));
    const res = await put('review', { done: true });
    expect(res.status).toBe(200);
    expect(res.body.manualCompleted).toEqual(['review']);
    expect(mockDailyGoalLog.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: USER, date: '2026-10-21' },
      { $addToSet: { completed: 'review' } },
      expect.objectContaining({ upsert: true })
    );
  });

  it('unticking removes it and never creates a record', async () => {
    const res = await put('review', { done: false });
    expect(res.status).toBe(200);
    expect(mockDailyGoalLog.updateOne).toHaveBeenCalledWith({ userId: USER, date: '2026-10-21' }, { $pull: { completed: 'review' } });
    expect(mockDailyGoalLog.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("only the session's user's record is changed", async () => {
    await put('review', { done: true }, OTHER);
    expect(mockDailyGoalLog.findOneAndUpdate.mock.calls[0][0]).toEqual({ userId: OTHER, date: '2026-10-21' });
  });

  it('verified goals and unknown goals cannot be ticked', async () => {
    for (const goal of ['visualize', 'submit', 'solve', 'not-a-goal']) {
      const res = await put(goal, { done: true });
      expect(res.status, goal).toBe(400);
    }
    expect(mockDailyGoalLog.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('the body is validated: a boolean done, nothing else (no dates, no user ids)', async () => {
    for (const body of [{}, { done: 'yes' }, { done: true, date: '2026-01-01' }, { done: true, userId: OTHER }]) {
      const res = await put('review', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(mockDailyGoalLog.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockDailyGoalLog.updateOne).not.toHaveBeenCalled();
  });

  it('a lost race on the unique index (two first ticks at once) is retried once', async () => {
    mockDailyGoalLog.findOneAndUpdate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 })).mockResolvedValueOnce({});
    const res = await put('review', { done: true });
    expect(res.status).toBe(200);
    expect(mockDailyGoalLog.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('ticking is not activity: no activity log is written, so the streak is unchanged', async () => {
    await put('review', { done: true });
    expect(mockActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /api/progress/recent', () => {
  const sub = (id: string, problemId: string, status: string, at: string) => ({ _id: id, problemId, status, language: 'python', createdAt: new Date(at) });
  const walk = (id: string, targetId: string, date: string, steps: number, at: string) => ({ _id: id, targetId, date, steps, updatedAt: new Date(at) });

  beforeEach(() => {
    mockSubmission.find.mockReturnValue(queryOf([]));
    mockActivityLog.find.mockReturnValue(queryOf([]));
    mockProblem.find.mockReturnValue(queryOf([]));
  });

  it('requires a signed-in user', async () => {
    expect((await request(app).get('/api/progress/recent')).status).toBe(401);
    expect(mockSubmission.find).not.toHaveBeenCalled();
  });

  it('nothing recorded: an empty list (no example events)', async () => {
    const res = await request(app).get('/api/progress/recent').set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ events: [] });
  });

  it("submissions and walkthroughs merged newest first, with titles, verdicts and no code; the session's user only", async () => {
    const subs = queryOf([sub('s1', 'two-sum', 'ACCEPTED', '2026-10-21T09:00:00Z'), sub('s2', 'two-sum', 'WRONG_ANSWER', '2026-10-20T08:00:00Z')]);
    mockSubmission.find.mockReturnValue(subs);
    mockActivityLog.find.mockReturnValue(queryOf([walk('a1', 'binary-search', '2026-10-21', 6, '2026-10-21T10:00:00Z'), walk('a2', 'retired-algo', '2026-10-21', 3, '2026-10-21T11:00:00Z')]));
    mockProblem.find.mockReturnValue(queryOf([{ problemId: 'two-sum', title: 'Two Sum' }]));

    const res = await request(app).get('/api/progress/recent?limit=5').set('Cookie', cookie(OTHER));
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([
      { id: 'walkthrough:a1', kind: 'walkthrough', targetId: 'binary-search', title: 'Binary Search', date: '2026-10-21', stepsViewed: 6, at: '2026-10-21T10:00:00.000Z' },
      { id: 'submission:s1', kind: 'submission', targetId: 'two-sum', title: 'Two Sum', status: 'ACCEPTED', language: 'python', at: '2026-10-21T09:00:00.000Z' },
      { id: 'submission:s2', kind: 'submission', targetId: 'two-sum', title: 'Two Sum', status: 'WRONG_ANSWER', language: 'python', at: '2026-10-20T08:00:00.000Z' },
    ]);
    expect(mockSubmission.find).toHaveBeenCalledWith({ userId: OTHER });
    expect(mockActivityLog.find).toHaveBeenCalledWith({ userId: OTHER, activityType: 'visualizer_step' });
    // the code is never read for this list
    expect(subs.select).toHaveBeenCalledWith('problemId status language createdAt');
    expect(subs.limit).toHaveBeenCalledWith(5);
  });

  it('the limit is validated (1 to 20, default 8) and caps the merged list', async () => {
    mockSubmission.find.mockReturnValue(queryOf([sub('s1', 'p', 'ACCEPTED', '2026-10-21T09:00:00Z'), sub('s2', 'p', 'ACCEPTED', '2026-10-21T08:00:00Z')]));
    mockActivityLog.find.mockReturnValue(queryOf([walk('a1', 'binary-search', '2026-10-21', 2, '2026-10-21T10:00:00Z')]));
    const one = await request(app).get('/api/progress/recent?limit=1').set('Cookie', cookie());
    expect(one.body.events.map((e: { id: string }) => e.id)).toEqual(['walkthrough:a1']);
    for (const bad of ['0', '21', 'abc', '2.5']) expect((await request(app).get(`/api/progress/recent?limit=${bad}`).set('Cookie', cookie())).status, bad).toBe(400);
    await request(app).get('/api/progress/recent').set('Cookie', cookie());
    expect(mockSubmission.find.mock.results.at(-1)!.value.limit).toHaveBeenCalledWith(8);
  });
});

describe('GET /api/progress/summary — streaks', () => {
  beforeEach(() => {
    mockActivityLog.find.mockResolvedValue([]);
    mockSubmission.distinct.mockResolvedValue([]);
    mockSubmission.find.mockReturnValue(queryOf([]));
    mockProgressTrack.countDocuments.mockResolvedValue(0);
    mockProgressTrack.find.mockResolvedValue([]);
    mockUser.updateOne.mockResolvedValue({});
  });

  it('the current streak (UTC days ending today or yesterday) and the longest one, from the activity log', async () => {
    mockActivityLog.distinct.mockResolvedValue(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-19', '2026-10-20']);
    const res = await request(app).get('/api/progress/summary').set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ streakDays: 2, longestStreakDays: 4 });
    expect(mockActivityLog.distinct).toHaveBeenCalledWith('date', { userId: USER });
  });

  it('a missed day: the current streak is 0 and the longest is kept', async () => {
    mockActivityLog.distinct.mockResolvedValue(['2026-10-17', '2026-10-18', '2026-10-19']);
    const res = await request(app).get('/api/progress/summary').set('Cookie', cookie());
    expect(res.body).toMatchObject({ streakDays: 0, longestStreakDays: 3 });
  });

  it('solved problems are distinct problems with a passed (accepted) submission; attempts are not counted', async () => {
    mockActivityLog.distinct.mockResolvedValue([]);
    mockSubmission.distinct.mockResolvedValue(['two-sum', 'valid-parens']);
    const res = await request(app).get('/api/progress/summary').set('Cookie', cookie());
    expect(res.body.solvedCount).toBe(2);
    expect(mockSubmission.distinct).toHaveBeenCalledWith('problemId', { userId: USER, passed: true });
  });
});
