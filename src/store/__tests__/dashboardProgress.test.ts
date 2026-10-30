import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, type TodayProgress, type UserProfile } from '../../api';
import { MockApiClient } from '../../api/mockAdapter';
import { useAuthStore } from '../useAuthStore';
import { useProgressStore } from '../useProgressStore';

// The Dashboard's checklist and recent activity in the progress store, and the mock API's version of the same rules
// (it keeps them in this browser's storage, so a reload keeps them).

/** an in-memory localStorage that survives "reloads" (new MockApiClient instances) within a test */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

const today = (manualCompleted: string[] = []): TodayProgress => ({
  date: '2026-10-21',
  resetsAt: '2026-10-22T00:00:00.000Z',
  verified: { walkthroughs: 0, submissions: 0, accepted: 0 },
  manualCompleted,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  useAuthStore.setState({ user: { id: 'u1' } as UserProfile });
  useProgressStore.getState().reset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('progress store — daily checklist', () => {
  it('fetchToday loads it; a failure is kept as an error, not as an empty checklist', async () => {
    vi.spyOn(apiClient.progress, 'getToday').mockResolvedValueOnce(today(['review'])).mockRejectedValueOnce(new Error('offline'));
    await useProgressStore.getState().fetchToday();
    expect(useProgressStore.getState()).toMatchObject({ today: today(['review']), todayError: null, todayLoading: false });
    useProgressStore.getState().reset();
    await useProgressStore.getState().fetchToday();
    expect(useProgressStore.getState()).toMatchObject({ today: null, todayError: 'offline' });
  });

  it("a tick shows at once, is saved, and the server's answer is kept", async () => {
    useProgressStore.setState({ today: today() });
    const saved = deferred<TodayProgress>();
    const put = vi.spyOn(apiClient.progress, 'setDailyGoal').mockReturnValue(saved.promise);
    const p = useProgressStore.getState().setManualGoal('review', true);
    expect(useProgressStore.getState()).toMatchObject({ goalSaving: 'review', today: { manualCompleted: ['review'] } });
    saved.resolve(today(['review']));
    await p;
    expect(put).toHaveBeenCalledWith('review', true);
    expect(useProgressStore.getState()).toMatchObject({ goalSaving: null, goalError: null, today: { manualCompleted: ['review'] } });
  });

  it('a failed save undoes the tick and says why', async () => {
    useProgressStore.setState({ today: today() });
    vi.spyOn(apiClient.progress, 'setDailyGoal').mockRejectedValue(new Error('Network down'));
    await useProgressStore.getState().setManualGoal('review', true);
    expect(useProgressStore.getState()).toMatchObject({ goalSaving: null, goalError: 'Network down', today: { manualCompleted: [] } });
  });

  it('one save at a time: a second tick while saving is ignored (no double request)', async () => {
    useProgressStore.setState({ today: today() });
    const saved = deferred<TodayProgress>();
    const put = vi.spyOn(apiClient.progress, 'setDailyGoal').mockReturnValue(saved.promise);
    const first = useProgressStore.getState().setManualGoal('review', true);
    await useProgressStore.getState().setManualGoal('review', false);
    saved.resolve(today(['review']));
    await first;
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("a response for the previous account is dropped after a sign-out", async () => {
    useProgressStore.setState({ today: today() });
    const saved = deferred<TodayProgress>();
    vi.spyOn(apiClient.progress, 'setDailyGoal').mockReturnValue(saved.promise);
    const p = useProgressStore.getState().setManualGoal('review', true);
    useAuthStore.setState({ user: null });
    saved.resolve(today(['review']));
    await p;
    expect(useProgressStore.getState().today).toBeNull();
  });
});

describe('progress store — recent activity', () => {
  it('loads the latest events (8), and keeps a failure as an error', async () => {
    const get = vi.spyOn(apiClient.progress, 'getRecentActivity').mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('timeout'));
    await useProgressStore.getState().fetchRecent();
    expect(get).toHaveBeenCalledWith(8);
    expect(useProgressStore.getState()).toMatchObject({ recent: [], recentLoaded: true, recentError: null });
    useProgressStore.getState().reset();
    await useProgressStore.getState().fetchRecent();
    expect(useProgressStore.getState()).toMatchObject({ recentLoaded: false, recentError: 'timeout' });
  });
});

describe('mock API — the same rules, kept in this browser', () => {
  it('a manual tick survives a reload; verified goals cannot be ticked; unticking removes it', async () => {
    await new MockApiClient().progress.setDailyGoal('review', true);
    // a "reload": a new client reading the same storage
    expect((await new MockApiClient().progress.getToday()).manualCompleted).toEqual(['review']);
    await expect(new MockApiClient().progress.setDailyGoal('submit', true)).rejects.toThrow(/Only your own goals/);
    await new MockApiClient().progress.setDailyGoal('review', false);
    expect((await new MockApiClient().progress.getToday()).manualCompleted).toEqual([]);
  });

  it('a new UTC day starts with nothing ticked, and the previous day is kept in storage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T23:59:00Z'));
    await new MockApiClient().progress.setDailyGoal('review', true);
    vi.setSystemTime(new Date('2026-10-22T00:00:30Z'));
    const t = await new MockApiClient().progress.getToday();
    expect(t).toMatchObject({ date: '2026-10-22', resetsAt: '2026-10-23T00:00:00.000Z', manualCompleted: [] });
    expect(JSON.parse(localStorage.getItem('algoflow_daily_goals')!)).toEqual({ '2026-10-21': ['review'] });
  });

  it('nothing done: zero solved, no streak, no recent events, no invented minutes', async () => {
    const api = new MockApiClient();
    const p = await api.progress.getUserProgress();
    expect(p).toMatchObject({ solvedCount: 0, streakDays: 0, longestStreakDays: 0 });
    expect(p.difficultyDistribution.map(d => d.value)).toEqual([0, 0, 0]);
    expect(p.weeklyActivity.every(d => d.minutes === 0)).toBe(true);
    expect(await api.progress.getRecentActivity()).toEqual([]);
  });

  it('a walkthrough and an accepted submission: verified goals done, a 1-day streak, 1 solved, both in recent activity', async () => {
    const api = new MockApiClient();
    await api.progress.recordVisualizerActivity('binary-search', 3);
    const problem = (await api.practice.getProblems({ limit: 50 })).problems[0];
    // store an accepted submission as the mock's own submit would
    localStorage.setItem(
      'algoflow_practice_state',
      JSON.stringify({ submissions: { [problem.id]: [{ id: 'x1', problemId: problem.id, language: 'python', code: '', status: 'ACCEPTED', passed: true, runtimeMs: 1, memoryMb: 1, createdAt: new Date().toISOString() }] } })
    );
    const t = await api.progress.getToday();
    expect(t.verified).toEqual({ walkthroughs: 1, submissions: 1, accepted: 1 });
    const p = await api.progress.getUserProgress();
    expect(p).toMatchObject({ solvedCount: 1, streakDays: 1, longestStreakDays: 1 });
    const recent = await api.progress.getRecentActivity();
    expect(recent.map(e => [e.kind, e.targetId])).toEqual(expect.arrayContaining([['walkthrough', 'binary-search'], ['submission', problem.id]]));
    expect(recent.find(e => e.kind === 'walkthrough')).toMatchObject({ title: 'Binary Search', stepsViewed: 4 });
  });
});
