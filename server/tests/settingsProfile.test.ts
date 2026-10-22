import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

// PATCH /api/users/profile — the settings the app uses: preferred language and daily goal (theme has its own tests).
const { User } = vi.hoisted(() => ({ User: { findById: vi.fn(), findByIdAndUpdate: vi.fn(), updateOne: vi.fn() } }));
vi.mock('../models/User', () => ({ User }));
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439022';
const patch = (body: object, id = USER) => request(app).patch('/api/users/profile').set('Cookie', [`algoflow_token=${tokenFor(id, 'USER')}`]).send(body);

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitsForTesting();
  User.findByIdAndUpdate.mockImplementation(async (_id: string, update: { $set: Record<string, unknown> }) => ({
    _id: { toString: () => _id },
    name: 'Ada',
    email: 'ada@algoflow.io',
    role: 'USER',
    accountStatus: 'active',
    preferences: {
      theme: 'dark',
      preferredLanguage: update.$set['preferences.preferredLanguage'] ?? 'cpp',
      dailyGoalMinutes: update.$set['preferences.dailyGoalMinutes'] ?? 30,
    },
  }));
});

describe('settings: preferred language and daily goal', () => {
  it("saves both on the session's own account and returns them", async () => {
    const res = await patch({ preferences: { preferredLanguage: 'python', dailyGoalMinutes: 45 } });
    expect(res.status).toBe(200);
    expect(res.body.user.preferences).toMatchObject({ preferredLanguage: 'python', dailyGoalMinutes: 45 });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      USER,
      { $set: { 'preferences.preferredLanguage': 'python', 'preferences.dailyGoalMinutes': 45 } },
      expect.objectContaining({ runValidators: true })
    );
  });

  it('only the fields sent are changed (saving the language leaves the goal and theme alone)', async () => {
    await patch({ preferences: { preferredLanguage: 'java' } });
    expect(User.findByIdAndUpdate.mock.calls[0][1]).toEqual({ $set: { 'preferences.preferredLanguage': 'java' } });
  });

  it.each([
    ['an unknown language', { preferredLanguage: 'rust' }],
    ['a fractional goal', { dailyGoalMinutes: 30.5 }],
    ['a goal below 5 minutes', { dailyGoalMinutes: 4 }],
    ['a goal above 300 minutes', { dailyGoalMinutes: 301 }],
    ['a goal sent as text', { dailyGoalMinutes: '30' }],
  ])('rejects %s, changing nothing', async (_label, preferences) => {
    const res = await patch({ preferences });
    expect(res.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('each account changes only itself: the id comes from the session, never the body', async () => {
    await patch({ preferences: { dailyGoalMinutes: 60 } }, OTHER);
    expect(User.findByIdAndUpdate.mock.calls[0][0]).toBe(OTHER);
  });

  it('requires a signed-in user', async () => {
    const res = await request(app).patch('/api/users/profile').send({ preferences: { dailyGoalMinutes: 60 } });
    expect(res.status).toBe(401);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
