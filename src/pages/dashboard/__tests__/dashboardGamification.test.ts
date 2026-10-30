import { describe, it, expect } from 'vitest';
import type { RecentActivityEvent, TodayProgress } from '../../../api';
import { DAILY_GOALS, currentStreak, dailyGoalStatuses, isManualGoal, longestStreak, nextUtcMidnight, utcDay } from '../../../data/dailyGoals';
import { checklistSummary, greeting, recentEventView, resetText, streakView } from '../dashboardData';

// The Dashboard's checklist, streak and recent activity, from the shared rules in src/data/dailyGoals.ts (the server
// uses the same functions) and the Dashboard's view helpers.

const NONE = { walkthroughs: 0, submissions: 0, accepted: 0 };
const today = (verified = NONE, manualCompleted: string[] = []): TodayProgress => ({
  date: '2026-10-21',
  resetsAt: '2026-10-22T00:00:00.000Z',
  verified,
  manualCompleted,
});

describe('streak: consecutive UTC days with activity', () => {
  it('counts back from today', () => {
    expect(currentStreak(['2026-10-19', '2026-10-20', '2026-10-21'], '2026-10-21')).toBe(3);
  });

  it('today not active yet: the streak ending yesterday is kept (the day is not over)', () => {
    expect(currentStreak(['2026-10-19', '2026-10-20'], '2026-10-21')).toBe(2);
  });

  it('a missed day ends it: nothing today or yesterday is 0, and a gap stops the count', () => {
    expect(currentStreak(['2026-10-18', '2026-10-19'], '2026-10-21')).toBe(0);
    expect(currentStreak(['2026-10-17', '2026-10-18', '2026-10-20', '2026-10-21'], '2026-10-21')).toBe(2);
    expect(currentStreak([], '2026-10-21')).toBe(0);
  });

  it('crosses month and year boundaries and ignores duplicates and malformed days', () => {
    expect(currentStreak(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-01'], '2026-01-01')).toBe(3);
    expect(currentStreak(['2026-02-28', '2026-03-01'], '2026-03-01')).toBe(2);
    expect(currentStreak(['garbage', '2026-10-21'], '2026-10-21')).toBe(1);
  });

  it('a missed day never erases history: the longest streak still counts earlier runs', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-10', '2026-10-21'];
    expect(currentStreak(days, '2026-10-21')).toBe(1);
    expect(longestStreak(days)).toBe(4);
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(['2026-10-05'])).toBe(1);
  });

  it('days are UTC: an instant late in the evening west of UTC, or early morning east of it, falls on its UTC day', () => {
    // 23:30 on 20 October in New York (UTC-4) is 03:30 on 21 October UTC
    expect(utcDay(new Date('2026-10-20T23:30:00-04:00'))).toBe('2026-10-21');
    // 01:00 on 21 October in Kolkata (UTC+5:30) is 19:30 on 20 October UTC
    expect(utcDay(new Date('2026-10-21T01:00:00+05:30'))).toBe('2026-10-20');
    // so two sessions on one local evening that straddle 00:00 UTC are two consecutive streak days, not one
    const days = [utcDay(new Date('2026-10-20T19:00:00-04:00')), utcDay(new Date('2026-10-20T21:00:00-04:00'))];
    expect(days).toEqual(['2026-10-20', '2026-10-21']);
    expect(currentStreak(days, '2026-10-21')).toBe(2);
  });

  it('the checklist resets at the next 00:00 UTC, also across a month end', () => {
    expect(nextUtcMidnight(new Date('2026-10-21T13:45:00Z')).toISOString()).toBe('2026-10-22T00:00:00.000Z');
    expect(nextUtcMidnight(new Date('2026-10-31T23:59:59Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(nextUtcMidnight(new Date('2026-10-21T00:00:00Z')).toISOString()).toBe('2026-10-22T00:00:00.000Z');
  });
});

describe('streak view', () => {
  it('an active streak with its best', () => {
    expect(streakView({ streakDays: 3, longestStreakDays: 7 })).toEqual({ current: 3, longest: 7, value: '3 Days', note: 'Best: 7 days' });
    expect(streakView({ streakDays: 1, longestStreakDays: 1 }).value).toBe('1 Day');
  });

  it('after a missed day: 0, with the best kept and how to restart', () => {
    expect(streakView({ streakDays: 0, longestStreakDays: 5 })).toMatchObject({ value: '0 Days', note: 'Best: 5 days · any activity today starts a new streak' });
  });

  it('never active (or an older server without the best): an invitation, no invented best', () => {
    expect(streakView({ streakDays: 0, longestStreakDays: 0 }).note).toBe('Step through an algorithm or submit a solution to start one');
    expect(streakView({ streakDays: 2 })).toMatchObject({ longest: 2, note: 'Best: 2 days' });
  });
});

describe('daily checklist', () => {
  it('3 verified goals and 1 manual goal; only the manual one can be ticked', () => {
    expect(DAILY_GOALS.map(g => [g.id, g.kind])).toEqual([
      ['visualize', 'verified'],
      ['submit', 'verified'],
      ['solve', 'verified'],
      ['review', 'manual'],
    ]);
    expect(isManualGoal('review')).toBe(true);
    for (const id of ['visualize', 'submit', 'solve', 'nope', 42]) expect(isManualGoal(id)).toBe(false);
  });

  it('verified goals follow the counted activity, never a tick', () => {
    const statuses = (v: typeof NONE, manual: string[] = []) => Object.fromEntries(dailyGoalStatuses(v, manual).map(g => [g.id, g.done]));
    expect(statuses(NONE)).toEqual({ visualize: false, submit: false, solve: false, review: false });
    expect(statuses({ walkthroughs: 1, submissions: 2, accepted: 0 })).toEqual({ visualize: true, submit: true, solve: false, review: false });
    // a tick on a verified goal (e.g. an old or forged record) does not complete it
    expect(statuses(NONE, ['submit', 'review'])).toEqual({ visualize: false, submit: false, solve: false, review: true });
  });

  it('"2 of 4 goals complete", a percentage, and all done', () => {
    expect(checklistSummary(today({ walkthroughs: 1, submissions: 0, accepted: 0 }, ['review']))).toMatchObject({ done: 2, total: 4, percent: 50, allDone: false, text: '2 of 4 goals complete' });
    expect(checklistSummary(today()).text).toBe('0 of 4 goals complete');
    expect(checklistSummary(today({ walkthroughs: 2, submissions: 1, accepted: 1 }, ['review']))).toMatchObject({ done: 4, allDone: true, percent: 100 });
  });

  it('the reset time is shown in UTC and in the viewer\'s time zone', () => {
    expect(resetText('2026-10-22T00:00:00.000Z', 'Asia/Kolkata')).toMatch(/^Resets at 00:00 UTC \(5:30\s?(AM|am) your time\)$/);
    expect(resetText('2026-10-22T00:00:00.000Z', 'America/New_York')).toMatch(/^Resets at 00:00 UTC \(8:00\s?(PM|pm) your time\)$/);
    expect(resetText('not a date')).toBe('Resets daily at 00:00 UTC');
  });
});

describe('recent activity', () => {
  const submission = (status: string, problemId = 'two-sum'): RecentActivityEvent =>
    ({ id: 's1', kind: 'submission', targetId: problemId, title: 'Two Sum', status, language: 'python', at: '2026-10-21T09:15:00.000Z' }) as RecentActivityEvent;

  it('a submission: its verdict, a local date and time, and a link to that problem in Practice', () => {
    const v = recentEventView(submission('ACCEPTED'), 'UTC');
    expect(v).toMatchObject({ title: 'Two Sum', typeLabel: 'Practice submission', statusLabel: 'Accepted', tone: 'success', link: { to: '/practice?problem=two-sum' } });
    expect(v.when).toMatch(/21 Oct.*9:15|Oct 21.*9:15/);
    expect(recentEventView(submission('WRONG_ANSWER')).statusLabel).toBe('Wrong Answer');
    expect(recentEventView(submission('SUBMITTED')).statusLabel).toBe('Recorded (not judged)');
    expect(recentEventView(submission('ACCEPTED', 'a b')).link).toEqual({ to: '/practice?problem=a%20b' });
  });

  it("a walkthrough: the algorithm's name, and a link that opens it in the visualizer (no step number: only milestones are recorded)", () => {
    const e: RecentActivityEvent = { id: 'w1', kind: 'walkthrough', targetId: 'binary-search', title: 'binary-search', date: '2026-10-21', stepsViewed: 6, at: '2026-10-21T10:00:00.000Z' };
    expect(recentEventView(e)).toMatchObject({ title: 'Binary Search', typeLabel: 'Visualizer walkthrough', statusLabel: 'Stepped through', link: { to: '/visualizer', algorithmId: 'binary-search' } });
  });

  it('an algorithm the visualizer no longer has: listed, but with no link', () => {
    const e: RecentActivityEvent = { id: 'w2', kind: 'walkthrough', targetId: 'retired-algo', title: 'Retired', date: '2026-10-21', stepsViewed: 2, at: '2026-10-21T10:00:00.000Z' };
    expect(recentEventView(e)).toMatchObject({ title: 'Retired', link: null });
  });
});

describe('greeting', () => {
  it('follows the local hour', () => {
    expect([4, 5, 11, 12, 17, 18, 23].map(greeting)).toEqual([
      'Good evening', 'Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening',
    ]);
  });
});
