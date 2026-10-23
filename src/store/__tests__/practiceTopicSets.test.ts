import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { apiClient, type ProblemsListResponse, type SubmissionResult } from '../../api';
import type { PracticeProblem } from '../../types/algorithm';
import { usePracticeStore } from '../usePracticeStore';

// Topic learning sets and the topic filter in the Practice store, against a scripted API (no network, no server).
const problem = (id: string, category: string, solved = false, difficulty: PracticeProblem['difficulty'] = 'Easy'): PracticeProblem => ({
  id, title: id, difficulty, category, tags: [], solved, description: '', testCases: [],
  starterCode: { c: '', cpp: '', java: '', python: '' },
});
const page = (problems: PracticeProblem[], p = 1, totalPages = 1, total = problems.length): ProblemsListResponse => ({
  problems, total, page: p, limit: 50, totalPages,
});
const s = () => usePracticeStore.getState();
/** a promise the test resolves when it chooses (to control the order responses arrive in) */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

let getProblems: MockInstance<typeof apiClient.practice.getProblems>;
beforeEach(() => {
  s().reset();
  usePracticeStore.setState({
    problems: [], total: 0, currentPage: 1, totalPages: 1, isLoading: false, error: null,
    selectedDifficulty: 'All', selectedTopic: 'All', searchQuery: '',
  });
  getProblems = vi.spyOn(apiClient.practice, 'getProblems');
});
afterEach(() => vi.restoreAllMocks());

describe('topic learning sets (store)', () => {
  it('read every page of the published problems (50 at a time) and group them by topic', async () => {
    getProblems
      .mockResolvedValueOnce(page([problem('p1', 'Arrays', true), problem('p2', 'Stack')], 1, 2, 3))
      .mockResolvedValueOnce(page([problem('p4', 'Arrays')], 2, 2, 3));
    const loading = s().fetchTopicSets();
    expect(s().topicSetsStatus).toBe('loading');
    await loading;
    expect(getProblems.mock.calls.map(c => c[0])).toEqual([{ page: 1, limit: 50 }, { page: 2, limit: 50 }]);
    expect(s().topicSetsStatus).toBe('ready');
    expect(s().topicSets.map(t => [t.topic, t.total, t.solved])).toEqual([['Arrays', 2, 1], ['Stack', 1, 0]]);
    expect(s().topicSetsIncomplete).toBe(false);
  });

  it('read with no filters: the sets do not change with the current topic, difficulty or search', async () => {
    usePracticeStore.setState({ selectedTopic: 'Stack', selectedDifficulty: 'Hard', searchQuery: 'x' });
    getProblems.mockResolvedValue(page([problem('p1', 'Arrays')]));
    await s().fetchTopicSets();
    expect(getProblems).toHaveBeenCalledWith({ page: 1, limit: 50 });
  });

  it('no published problems: ready with no sets (the page shows an empty state, nothing invented)', async () => {
    getProblems.mockResolvedValue(page([], 1, 1, 0));
    await s().fetchTopicSets();
    expect(s()).toMatchObject({ topicSetsStatus: 'ready', topicSets: [] });
  });

  it('a failure is an error state with the message; Retry loads them', async () => {
    getProblems.mockRejectedValueOnce(new Error('Network error.'));
    await s().fetchTopicSets();
    expect(s()).toMatchObject({ topicSetsStatus: 'error', topicSetsError: 'Network error.', topicSets: [] });
    getProblems.mockResolvedValueOnce(page([problem('p1', 'Trees')]));
    await s().fetchTopicSets();
    expect(s()).toMatchObject({ topicSetsStatus: 'ready', topicSetsError: null });
    expect(s().topicSets.map(t => t.topic)).toEqual(['Trees']);
  });

  it('a refresh keeps the loaded sets on screen (no loading flash) and updates the solved counts', async () => {
    getProblems.mockResolvedValueOnce(page([problem('p1', 'Arrays')]));
    await s().fetchTopicSets();
    const refreshed = deferred<ProblemsListResponse>();
    getProblems.mockReturnValueOnce(refreshed.promise);
    const refreshing = s().fetchTopicSets();
    expect(s().topicSetsStatus).toBe('ready');
    refreshed.resolve(page([problem('p1', 'Arrays', true)]));
    await refreshing;
    expect(s().topicSets[0]).toMatchObject({ total: 1, solved: 1 });
  });

  it('stops at 50 pages and says the counts may be incomplete', async () => {
    getProblems.mockImplementation(async params => page([problem(`p${params?.page}`, 'Arrays')], params?.page ?? 1, 60, 60));
    await s().fetchTopicSets();
    expect(getProblems).toHaveBeenCalledTimes(50);
    expect(s()).toMatchObject({ topicSetsStatus: 'ready', topicSetsIncomplete: true });
    expect(s().topicSets[0].total).toBe(50);
  });

  it('the pages changing while loading (a different page answered than asked) is an error, never partial results shown as ready', async () => {
    getProblems
      .mockResolvedValueOnce(page([problem('p1', 'Arrays')], 1, 3, 3))
      // problems were removed meanwhile: the server clamps page 2 to page 1
      .mockResolvedValueOnce(page([problem('p1', 'Arrays')], 1, 1, 1));
    await s().fetchTopicSets();
    expect(getProblems).toHaveBeenCalledTimes(2);
    expect(s()).toMatchObject({
      topicSetsStatus: 'error',
      topicSetsError: 'The problem list changed while the topic sets were loading. Please try again.',
      topicSets: [],
    });
  });

  it('a failed refresh keeps the sets loaded earlier (shown with the error), for a request failure or changed pages', async () => {
    getProblems.mockResolvedValueOnce(page([problem('p1', 'Arrays', true), problem('p2', 'Stack')]));
    await s().fetchTopicSets();
    const loaded = s().topicSets;

    getProblems.mockRejectedValueOnce(new Error('Network error.'));
    await s().fetchTopicSets();
    expect(s()).toMatchObject({ topicSetsStatus: 'error', topicSetsError: 'Network error.' });
    expect(s().topicSets).toEqual(loaded);

    getProblems.mockResolvedValueOnce(page([problem('p1', 'Arrays')], 1, 2, 2)).mockResolvedValueOnce(page([problem('p1', 'Arrays')], 1, 1, 1));
    await s().fetchTopicSets();
    expect(s().topicSetsStatus).toBe('error');
    expect(s().topicSets).toEqual(loaded);

    // a later successful refresh replaces them and clears the error
    getProblems.mockResolvedValueOnce(page([problem('p1', 'Arrays', true), problem('p2', 'Stack', true)]));
    await s().fetchTopicSets();
    expect(s()).toMatchObject({ topicSetsStatus: 'ready', topicSetsError: null });
    expect(s().topicSets.map(t => [t.topic, t.solved])).toEqual([['Arrays', 1], ['Stack', 1]]);
  });

  it("signing out or switching accounts drops the sets (solved counts are per account), and a late answer is ignored", async () => {
    const late = deferred<ProblemsListResponse>();
    getProblems.mockReturnValueOnce(late.promise);
    const loading = s().fetchTopicSets();
    s().reset();
    late.resolve(page([problem('p1', 'Arrays', true)]));
    await loading;
    expect(s()).toMatchObject({ topicSets: [], topicSetsStatus: 'idle' });
  });

  it('a late failure for the previous account is ignored too (no error shown to the next account)', async () => {
    const late = deferred<ProblemsListResponse>();
    getProblems.mockReturnValueOnce(late.promise.then(() => Promise.reject(new Error('old account request failed'))));
    const loading = s().fetchTopicSets();
    s().reset();
    late.resolve(page([]));
    await loading;
    expect(s()).toMatchObject({ topicSetsStatus: 'idle', topicSetsError: null });
  });

  it('a submission refreshes the topic sets, so a newly solved problem is counted', async () => {
    usePracticeStore.setState({ selectedProblem: problem('p1', 'Arrays'), fetchSubmissions: async () => {} });
    vi.spyOn(apiClient.practice, 'submitSolution').mockResolvedValue({ status: 'ACCEPTED', judged: true, passed: true, runtimeMs: 1, memoryMb: 1, message: 'ok' } as SubmissionResult);
    getProblems.mockResolvedValue(page([problem('p1', 'Arrays', true)]));
    await s().submitSolution();
    // one call for the list (current filters, page size 12) and one for the topic sets (all problems, 50 a page)
    expect(getProblems.mock.calls.map(c => c[0]?.limit).sort()).toEqual([12, 50]);
    expect(s().topicSets[0]).toMatchObject({ topic: 'Arrays', solved: 1 });
  });
});

describe('topic selection with search, difficulty and pagination (store)', () => {
  it('selecting a topic asks for page 1 of that topic and keeps the difficulty and search', async () => {
    usePracticeStore.setState({ selectedDifficulty: 'Medium', searchQuery: 'water', currentPage: 3, totalPages: 4 });
    getProblems.mockResolvedValue(page([problem('p4', 'Arrays', false, 'Medium')]));
    s().setSelectedTopic('Arrays');
    expect(s()).toMatchObject({ selectedTopic: 'Arrays', currentPage: 1, selectedDifficulty: 'Medium', searchQuery: 'water' });
    await vi.waitFor(() => expect(s().isLoading).toBe(false));
    expect(getProblems).toHaveBeenCalledWith({ page: 1, limit: 12, difficulty: 'Medium', category: 'Arrays', search: 'water' });
  });

  it('"All topics" sends no topic filter; changing difficulty or search keeps the topic and goes back to page 1', async () => {
    getProblems.mockResolvedValue(page([]));
    usePracticeStore.setState({ selectedTopic: 'Stack', currentPage: 2, totalPages: 3 });
    s().setSelectedDifficulty('Easy');
    expect(getProblems).toHaveBeenLastCalledWith({ page: 1, limit: 12, difficulty: 'Easy', category: 'Stack', search: undefined });
    usePracticeStore.setState({ currentPage: 2, totalPages: 3 });
    s().setSearchQuery('paren');
    expect(getProblems).toHaveBeenLastCalledWith({ page: 1, limit: 12, difficulty: 'Easy', category: 'Stack', search: 'paren' });
    s().setSelectedTopic('All');
    expect(getProblems).toHaveBeenLastCalledWith({ page: 1, limit: 12, difficulty: 'Easy', category: undefined, search: 'paren' });
  });

  it("the page shown is the server's (a clamped page past the end), and Next/Previous stay within 1..totalPages", async () => {
    getProblems.mockResolvedValue(page([problem('p1', 'Arrays')], 2, 2, 13));
    await s().fetchProblems({ page: 9 });
    expect(s()).toMatchObject({ currentPage: 2, totalPages: 2, total: 13 });
    getProblems.mockClear();
    s().setPage(3);
    s().setPage(0);
    expect(getProblems).toHaveBeenCalledTimes(1);
    expect(getProblems).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('a slow answer for an earlier topic never replaces the list for the topic chosen last', async () => {
    const stack = deferred<ProblemsListResponse>();
    const trees = deferred<ProblemsListResponse>();
    getProblems.mockReturnValueOnce(stack.promise).mockReturnValueOnce(trees.promise);
    s().setSelectedTopic('Stack');
    s().setSelectedTopic('Trees');
    trees.resolve(page([problem('p5', 'Trees')]));
    await vi.waitFor(() => expect(s().problems.map(p => p.id)).toEqual(['p5']));
    stack.resolve(page([problem('p2', 'Stack')]));
    await stack.promise;
    await new Promise(r => setTimeout(r, 0));
    expect(s().problems.map(p => p.id)).toEqual(['p5']);
    expect(s()).toMatchObject({ selectedTopic: 'Trees', isLoading: false });
  });

  it('a late failure for an earlier request does not show an error over the newer list', async () => {
    const first = deferred<ProblemsListResponse>();
    getProblems.mockReturnValueOnce(first.promise.then(() => Promise.reject(new Error('old request failed')))).mockResolvedValueOnce(page([problem('p1', 'Arrays')]));
    const a = s().fetchProblems({ category: 'Stack' });
    await s().fetchProblems({ category: 'Arrays' });
    first.resolve(page([]));
    await a;
    expect(s()).toMatchObject({ error: null });
    expect(s().problems.map(p => p.id)).toEqual(['p1']);
  });
});

describe('sign-out or account switch (reset): nothing from the previous account lands afterwards', () => {
  it("a problem-list request still in flight is ignored, and the previous account's list (solved flags) is cleared", async () => {
    usePracticeStore.setState({ problems: [problem('p1', 'Arrays', true)], total: 1, currentPage: 2, totalPages: 2 });
    const late = deferred<ProblemsListResponse>();
    getProblems.mockReturnValueOnce(late.promise);
    const loading = s().fetchProblems();
    expect(s().isLoading).toBe(true);
    s().reset();
    // cleared at once: no solved badge of the previous account, page 1, and not stuck loading
    expect(s()).toMatchObject({ problems: [], total: 0, currentPage: 1, totalPages: 1, isLoading: false, error: null });
    late.resolve(page([problem('p1', 'Arrays', true)], 2, 2, 13));
    await loading;
    expect(s()).toMatchObject({ problems: [], total: 0, currentPage: 1, isLoading: false });
  });

  it('a late problem-list failure for the previous account shows no error', async () => {
    const late = deferred<ProblemsListResponse>();
    getProblems.mockReturnValueOnce(late.promise.then(() => Promise.reject(new Error('old account request failed'))));
    const loading = s().fetchProblems();
    s().reset();
    late.resolve(page([]));
    await loading;
    expect(s()).toMatchObject({ error: null, isLoading: false });
  });

  it("a submission-history request still in flight is ignored (another account never sees it)", async () => {
    const late = deferred<Awaited<ReturnType<typeof apiClient.practice.getSubmissions>>>();
    vi.spyOn(apiClient.practice, 'getSubmissions').mockReturnValueOnce(late.promise);
    const loading = s().fetchSubmissions('p1');
    s().reset();
    late.resolve([{ id: 's1', problemId: 'p1', language: 'cpp', code: 'previous account code', status: 'ACCEPTED', passed: true, runtimeMs: 1, memoryMb: 1, createdAt: new Date().toISOString() }]);
    await loading;
    expect(s()).toMatchObject({ submissions: [], isLoadingSubmissions: false });
  });

  it('after a reset, new requests for the next account are applied normally', async () => {
    s().reset();
    getProblems.mockResolvedValueOnce(page([problem('p2', 'Stack')]));
    await s().fetchProblems();
    expect(s().problems.map(p => p.id)).toEqual(['p2']);
    getProblems.mockResolvedValueOnce(page([problem('p2', 'Stack')]));
    await s().fetchTopicSets();
    expect(s()).toMatchObject({ topicSetsStatus: 'ready' });
  });
});
