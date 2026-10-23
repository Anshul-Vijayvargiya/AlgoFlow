import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { UserProfile, UserProgressData } from '../../../api';
import { dailyGoalSummary } from '../dashboardData';

// The daily goal from Settings, on the Dashboard. Static rendering reads each store's initial state, so the stores
// the Dashboard reads are replaced by plain objects holding the state under test (as in dashboard.render.test.tsx).
const authState = vi.hoisted(() => ({ user: null as UserProfile | null }));
vi.mock('../../../store/useAuthStore', () => ({ useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState) }));
const progressStore = vi.hoisted(() => ({
  progress: null as UserProgressData | null,
  tracks: [],
  isLoading: false,
  error: null as string | null,
  fetchProgress: () => Promise.resolve(),
}));
vi.mock('../../../store/useProgressStore', () => ({ useProgressStore: () => progressStore }));
vi.mock('../../../store/useVisualizerStore', () => ({
  useVisualizerStore: (selector: (s: { setAlgorithm: () => void }) => unknown) => selector({ setAlgorithm: () => {} }),
}));
const { Dashboard } = await import('../../Dashboard');

const week = (todayMinutes: number) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => ({ day, minutes: i === 6 ? todayMinutes : 40, steps: 0 }));
const progress = (todayMinutes: number): UserProgressData => ({
  weeklyActivity: week(todayMinutes),
  difficultyDistribution: [],
  topicProficiency: [],
  streakDays: 1,
  solvedCount: 0,
  algorithmsLearned: 0,
  overallProgressPercent: 0,
});
const signIn = (dailyGoalMinutes: number) => {
  authState.user = { id: 'u1', preferences: { theme: 'dark', preferredLanguage: 'cpp', dailyGoalMinutes } } as UserProfile;
};
const render = () => renderToStaticMarkup(<MemoryRouter><Dashboard /></MemoryRouter>);

beforeEach(() => {
  Object.assign(progressStore, { progress: null, isLoading: false, error: null });
  authState.user = null;
});

describe('daily goal summary', () => {
  it("today's minutes (the last day of the week) against the goal", () => {
    expect(dailyGoalSummary(week(10), 30)).toEqual({ today: 10, goal: 30, percent: 33, met: false });
    expect(dailyGoalSummary(week(45), 30)).toEqual({ today: 45, goal: 30, percent: 100, met: true });
    expect(dailyGoalSummary([], 30)).toEqual({ today: 0, goal: 30, percent: 0, met: false });
  });

  it('no goal, or an invalid one: nothing to show', () => {
    for (const goal of [undefined, 0, -5, Number.NaN]) expect(dailyGoalSummary(week(10), goal)).toBeNull();
  });
});

describe('Dashboard — daily goal', () => {
  it("shows the signed-in account's goal against today's minutes, with a progress bar and the estimate caveat", () => {
    signIn(45);
    progressStore.progress = progress(15);
    const html = render();
    expect(html).toMatch(/data-testid="daily-goal-text"[^>]*>15 of 45 min today</);
    expect(html).toMatch(/role="progressbar" aria-label="Daily goal" aria-valuemin="0" aria-valuemax="45" aria-valuenow="15"/);
    expect(html).toContain('Minutes are estimated');
    expect(html).toMatch(/<h2 id="daily-goal-heading"/);
  });

  it('a reached goal says so', () => {
    signIn(10);
    progressStore.progress = progress(15);
    expect(render()).toMatch(/15 of 10 min today · goal reached/);
  });

  it('a different goal changes the panel (it follows Settings)', () => {
    signIn(120);
    progressStore.progress = progress(15);
    expect(render()).toContain('15 of 120 min today');
  });

  it('not shown while progress is loading or failed to load (no invented minutes)', () => {
    signIn(30);
    progressStore.isLoading = true;
    expect(render()).not.toContain('data-testid="daily-goal"');
    progressStore.isLoading = false;
    progressStore.error = 'offline';
    expect(render()).not.toContain('data-testid="daily-goal"');
  });
});
