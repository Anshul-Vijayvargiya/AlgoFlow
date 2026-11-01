import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, type AlgorithmTrack, type RecentActivityEvent, type TodayProgress, type UserProgressData } from '../../api';
import { HttpError } from '../../api/httpAdapter';
import { useProgressStore } from '../useProgressStore';

// The dashboard's requests (progress, tracks, today, recent) against the API rate limit: a remount or StrictMode's
// second effect shares the request in flight, a short 429 is retried and recovers, a long one is reported and keeps
// what was loaded, and a request for the previous account is never shared with or applied to the next.
const s = () => useProgressStore.getState();
const progress = (solvedCount: number): UserProgressData => ({
  weeklyActivity: [], difficultyDistribution: [], topicProficiency: [], streakDays: 0, solvedCount, algorithmsLearned: 0,
} as unknown as UserProgressData);
const today = { date: '2026-10-21', resetsAt: '2026-10-22T00:00:00.000Z', verified: { walkthroughs: 0, submissions: 0, accepted: 0 }, manualCompleted: [] } as unknown as TodayProgress;
const limited = (retryAfterMs: number) => new HttpError('API rate limit exceeded. Please slow down your requests.', 429, undefined, retryAfterMs);
/** the dashboard's mount effect */
const mount = () => Promise.all([s().fetchProgress(), s().fetchToday(), s().fetchRecent()]);

let getUserProgress: ReturnType<typeof vi.spyOn>;
let getAlgorithmTracks: ReturnType<typeof vi.spyOn>;
let getToday: ReturnType<typeof vi.spyOn>;
let getRecent: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  s().reset();
  getUserProgress = vi.spyOn(apiClient.progress, 'getUserProgress').mockResolvedValue(progress(2));
  getAlgorithmTracks = vi.spyOn(apiClient.progress, 'getAlgorithmTracks').mockResolvedValue([] as AlgorithmTrack[]);
  getToday = vi.spyOn(apiClient.progress, 'getToday').mockResolvedValue(today);
  getRecent = vi.spyOn(apiClient.progress, 'getRecentActivity').mockResolvedValue([] as RecentActivityEvent[]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('dashboard requests', () => {
  it('a successful load: one request per endpoint, and the data applied', async () => {
    await mount();
    for (const spy of [getUserProgress, getAlgorithmTracks, getToday, getRecent]) expect(spy).toHaveBeenCalledTimes(1);
    expect(s()).toMatchObject({ progress: { solvedCount: 2 }, today, recentLoaded: true, error: null });
  });

  it('duplicate requests (StrictMode mounts twice; the Progress page asks for tracks too) share one each', async () => {
    await Promise.all([mount(), mount(), s().fetchTracks()]);
    for (const spy of [getUserProgress, getAlgorithmTracks, getToday, getRecent]) expect(spy).toHaveBeenCalledTimes(1);
    // once settled, a later visit asks again
    await mount();
    expect(getUserProgress).toHaveBeenCalledTimes(2);
  });

  it('a short 429 is retried after the wait and recovers without an error', async () => {
    getUserProgress.mockRejectedValueOnce(limited(1000));
    const loading = s().fetchProgress();
    await vi.advanceTimersByTimeAsync(1300);
    await loading;
    expect(getUserProgress).toHaveBeenCalledTimes(2);
    expect(s()).toMatchObject({ progress: { solvedCount: 2 }, error: null, isLoading: false });
  });

  it('a long 429 (the rate-limit window) is not waited out: one attempt, the message shown, the earlier data kept', async () => {
    await mount();
    getUserProgress.mockRejectedValue(limited(900_000));
    await s().fetchProgress();
    expect(getUserProgress).toHaveBeenCalledTimes(2);
    expect(s()).toMatchObject({ progress: { solvedCount: 2 }, error: 'API rate limit exceeded. Please slow down your requests.', isLoading: false });
  });

  it("another account never gets the previous account's answer, even from a request still in flight", async () => {
    let finish!: (p: UserProgressData) => void;
    getUserProgress.mockReturnValueOnce(new Promise<UserProgressData>(r => (finish = r)));
    const first = s().fetchProgress();
    s().reset(); // sign-out / account switch
    getUserProgress.mockResolvedValueOnce(progress(7));
    const second = s().fetchProgress();
    // the new account's request is its own, not the one in flight
    expect(getUserProgress).toHaveBeenCalledTimes(2);
    finish(progress(99));
    await Promise.all([first, second]);
    expect(s().progress?.solvedCount).toBe(7);
  });
});
