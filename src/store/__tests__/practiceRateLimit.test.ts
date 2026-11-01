import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { apiClient, type ProblemsListResponse, type SubmissionResult } from '../../api';
import { HttpError } from '../../api/httpAdapter';
import type { PracticeProblem } from '../../types/algorithm';
import { PRACTICE_CACHE_TTL_MS, SEARCH_DEBOUNCE_MS, usePracticeStore } from '../usePracticeStore';

// The Practice page's requests against the API rate limit: duplicates shared, fresh data reused, a 429 retried within
// bounds, a long wait respected (no request before it), the data loaded earlier kept, and Retry recovering once it is
// allowed. Against a scripted API, with fake timers and a fake clock: nothing waits for real.
const problem = (id: string, category: string, solved = false): PracticeProblem => ({
  id, title: id, difficulty: 'Easy', category, tags: [], solved, description: '', testCases: [],
  starterCode: { c: '', cpp: '', java: '', python: '' },
});
const page = (problems: PracticeProblem[], p = 1, totalPages = 1): ProblemsListResponse => ({ problems, total: problems.length, page: p, limit: 50, totalPages });
const limited = (retryAfterMs: number) => new HttpError('API rate limit exceeded. Please slow down your requests.', 429, undefined, retryAfterMs);
const s = () => usePracticeStore.getState();
/** the page's two mount effects (React StrictMode runs them twice in development) */
const mount = () => Promise.all([s().fetchProblems(), s().fetchTopicSets()]);

let getProblems: MockInstance<typeof apiClient.practice.getProblems>;
let clock = 1_700_000_000_000;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  clock = 1_700_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  s().reset();
  usePracticeStore.setState({ selectedDifficulty: 'All', selectedTopic: 'All', searchQuery: '' });
  getProblems = vi.spyOn(apiClient.practice, 'getProblems');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Practice requests and the API rate limit', () => {
  it('a successful load: one request for the list and one for the topic sets', async () => {
    getProblems.mockResolvedValue(page([problem('p1', 'Arrays')]));
    await mount();
    expect(getProblems).toHaveBeenCalledTimes(2);
    expect(s()).toMatchObject({ problems: [expect.objectContaining({ id: 'p1' })], topicSetsStatus: 'ready', error: null, problemsRetryAt: null, topicSetsRetryAt: null });
  });

  it('duplicate requests (StrictMode mounts the page twice) share one request each', async () => {
    getProblems.mockResolvedValue(page([problem('p1', 'Arrays')]));
    await Promise.all([mount(), mount()]);
    expect(getProblems.mock.calls.map(c => c[0])).toEqual([{ page: 1, limit: 12, difficulty: undefined, category: undefined, search: undefined }, { page: 1, limit: 50 }]);
    expect(s().topicSetsStatus).toBe('ready');
  });

  it('cached data: a revisit within the cache time sends nothing; after it, the page asks again', async () => {
    getProblems.mockResolvedValue(page([problem('p1', 'Arrays')]));
    await mount();
    await mount();
    expect(getProblems).toHaveBeenCalledTimes(2);
    expect(s().problems.map(p => p.id)).toEqual(['p1']);
    clock += PRACTICE_CACHE_TTL_MS + 1;
    await mount();
    expect(getProblems).toHaveBeenCalledTimes(4);
  });

  it('typing a search sends one request, once typing pauses', async () => {
    getProblems.mockResolvedValue(page([]));
    for (const q of ['b', 'bi', 'bin', 'bina', 'binar', 'binary']) {
      s().setSearchQuery(q);
      vi.advanceTimersByTime(50);
    }
    expect(getProblems).not.toHaveBeenCalled();
    expect(s().searchQuery).toBe('binary');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(getProblems).toHaveBeenCalledTimes(1);
    expect(getProblems).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'binary', page: 1 }));
  });

  it('a 429 with a short wait is retried after it, and the load recovers without an error', async () => {
    getProblems.mockRejectedValueOnce(limited(1000)).mockResolvedValue(page([problem('p1', 'Arrays')]));
    const loading = s().fetchProblems();
    await vi.advanceTimersByTimeAsync(999);
    expect(getProblems).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    await loading;
    expect(getProblems).toHaveBeenCalledTimes(2);
    expect(s()).toMatchObject({ error: null, problemsRetryAt: null, isLoading: false });
  });

  it('retry limit: a 429 that persists is tried three times in all, then reported — never again on its own', async () => {
    getProblems.mockRejectedValue(limited(1000));
    const loading = s().fetchTopicSets();
    await vi.advanceTimersByTimeAsync(5000);
    await loading;
    expect(getProblems).toHaveBeenCalledTimes(3);
    expect(s()).toMatchObject({ topicSetsStatus: 'error', topicSetsError: 'API rate limit exceeded. Please slow down your requests.' });
    expect(s().topicSetsRetryAt).toBeGreaterThan(clock);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(getProblems).toHaveBeenCalledTimes(3);
  });

  it('a long wait (the 15-minute window): kept data, no request before the time — not even Retry — then one Retry recovers', async () => {
    getProblems.mockResolvedValue(page([problem('p1', 'Arrays'), problem('p2', 'Stack')]));
    await mount();
    const loadedSets = s().topicSets;
    const loadedProblems = s().problems;
    clock += PRACTICE_CACHE_TTL_MS + 1;

    getProblems.mockReset();
    getProblems.mockRejectedValue(limited(900_000));
    await mount();
    // not waited out: one attempt each, reported with the server's time
    expect(getProblems).toHaveBeenCalledTimes(2);
    expect(s()).toMatchObject({ topicSetsStatus: 'error', error: 'API rate limit exceeded. Please slow down your requests.', isLoading: false });
    expect(s().topicSetsRetryAt).toBe(clock + 900_000);
    expect(s().problemsRetryAt).toBe(clock + 900_000);
    // the data loaded earlier stays
    expect(s().topicSets).toEqual(loadedSets);
    expect(s().problems).toEqual(loadedProblems);

    // before the time: a remount, another mount and Retry send nothing
    clock += 60_000;
    await mount();
    await s().fetchTopicSets({ force: true });
    await s().fetchProblems(undefined, { force: true });
    expect(getProblems).toHaveBeenCalledTimes(2);
    expect(s().topicSets).toEqual(loadedSets);

    // after it: Retry sends one request each and recovers
    clock += 900_000;
    getProblems.mockReset();
    getProblems.mockResolvedValue(page([problem('p1', 'Arrays', true), problem('p2', 'Stack')]));
    await s().fetchTopicSets({ force: true });
    await s().fetchProblems(undefined, { force: true });
    expect(getProblems).toHaveBeenCalledTimes(2);
    expect(s()).toMatchObject({ topicSetsStatus: 'ready', topicSetsError: null, topicSetsRetryAt: null, error: null, problemsRetryAt: null });
    expect(s().topicSets.find(t => t.topic === 'Arrays')).toMatchObject({ solved: 1 });
  });

  it('a submission refreshes even fresh cached data (the solved flags changed)', async () => {
    getProblems.mockResolvedValue(page([problem('p1', 'Arrays')]));
    await mount();
    usePracticeStore.setState({ selectedProblem: problem('p1', 'Arrays'), fetchSubmissions: async () => {} });
    vi.spyOn(apiClient.practice, 'submitSolution').mockResolvedValue({ status: 'ACCEPTED', judged: true, passed: true, runtimeMs: 1, memoryMb: 1, message: 'ok' } as SubmissionResult);
    getProblems.mockResolvedValue(page([problem('p1', 'Arrays', true)]));
    await s().submitSolution();
    expect(getProblems).toHaveBeenCalledTimes(4);
    expect(s().topicSets[0]).toMatchObject({ solved: 1 });
    expect(s().problems[0].solved).toBe(true);
  });

  it('sign-out (reset) drops the cache and any wait: the next account loads its own data', async () => {
    getProblems.mockRejectedValue(limited(900_000));
    await mount();
    expect(s().topicSetsRetryAt).not.toBeNull();
    s().reset();
    expect(s()).toMatchObject({ topicSetsRetryAt: null, problemsRetryAt: null });
    getProblems.mockReset();
    getProblems.mockResolvedValue(page([problem('p9', 'Graphs')]));
    await mount();
    expect(getProblems).toHaveBeenCalledTimes(2);
    expect(s().problems.map(p => p.id)).toEqual(['p9']);
  });
});
