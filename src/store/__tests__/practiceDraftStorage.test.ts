import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, type SubmissionResult, type UserProfile } from '../../api';
import type { PracticeProblem } from '../../types/algorithm';
import { useAuthStore } from '../useAuthStore';
import { DRAFTS_STORAGE_PREFIX, usePracticeStore } from '../usePracticeStore';

// Practice drafts kept on the device, per account: an in-memory localStorage stands in for the browser's.
const problem = (id: string): PracticeProblem => ({
  id, title: id, difficulty: 'Easy', category: 'Arrays', tags: [], solved: false, description: '', testCases: [],
  starterCode: { c: `// ${id} C starter`, cpp: `// ${id} C++ starter`, java: `// ${id} Java starter`, python: `# ${id} Python starter` },
});
const user = (id: string) => ({ id }) as UserProfile;
const s = () => usePracticeStore.getState();
let store: Map<string, string>;
const stored = (userId: string) => JSON.parse(store.get(DRAFTS_STORAGE_PREFIX + userId) ?? '{}');

/** what a page reload does to the store: memory is gone, the session is restored, the account's drafts are loaded */
function reload(userId: string) {
  useAuthStore.setState({ user: null });
  useAuthStore.setState({ user: user(userId) });
}

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  useAuthStore.setState({ user: null });
  s().reset();
  useAuthStore.setState({ user: user('u1') });
  usePracticeStore.setState({ selectedLanguage: 'cpp', fetchSubmissions: async () => {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('practice drafts on the device', () => {
  it('survive a reload: each problem and language restores its own draft', () => {
    s().selectProblem(problem('p1'));
    s().setUserCode('// p1 C++ work');
    s().setLanguage('python');
    s().setUserCode('# p1 Python work');
    s().selectProblem(problem('p2'));
    s().setUserCode('# p2 Python work');

    reload('u1');
    s().selectProblem(problem('p1'));
    expect(s().userCode).toBe('# p1 Python work');
    s().setLanguage('cpp');
    expect(s().userCode).toBe('// p1 C++ work');
    s().setLanguage('java');
    expect(s().userCode).toBe('// p1 Java starter');
    s().selectProblem(problem('p2'));
    s().setLanguage('python');
    expect(s().userCode).toBe('# p2 Python work');
  });

  it('are stored under the account: another account never sees them, and they come back for their owner', () => {
    s().selectProblem(problem('p1'));
    s().setUserCode('// u1 private');
    useAuthStore.setState({ user: user('u2') });
    expect(s().drafts).toEqual({});
    s().selectProblem(problem('p1'));
    expect(s().userCode).toBe('// p1 C++ starter');
    s().setUserCode('// u2 own');

    expect(stored('u1')).toEqual({ 'p1::cpp': '// u1 private' });
    expect(stored('u2')).toEqual({ 'p1::cpp': '// u2 own' });

    useAuthStore.setState({ user: null });
    useAuthStore.setState({ user: user('u1') });
    s().selectProblem(problem('p1'));
    expect(s().userCode).toBe('// u1 private');
  });

  it('signed out: nothing is stored', () => {
    useAuthStore.setState({ user: null });
    s().selectProblem(problem('p1'));
    s().setUserCode('// anonymous');
    expect(store.size).toBe(0);
  });

  it('an emptied editor is kept as an empty draft; going back to the starter keeps nothing', () => {
    s().selectProblem(problem('p1'));
    s().setUserCode('');
    reload('u1');
    s().selectProblem(problem('p1'));
    expect(s().userCode).toBe('');

    s().setUserCode('// p1 C++ starter');
    expect(stored('u1')).toEqual({});
  });

  it('submitting never clears or uploads drafts: only Submit sends code, and saving a draft calls no API', async () => {
    const calls = (['submitSolution', 'getProblems', 'getProblemById', 'getSubmissions'] as const).map(m => vi.spyOn(apiClient.practice, m));
    s().selectProblem(problem('p1'));
    s().setUserCode('// my answer');
    for (const c of calls) expect(c).not.toHaveBeenCalled();

    calls[0].mockResolvedValue({ status: 'WRONG_ANSWER', judged: true, passed: false, runtimeMs: 1, memoryMb: 1, message: 'm' } as SubmissionResult);
    calls[1].mockResolvedValue({ problems: [], total: 0, page: 1, limit: 50, totalPages: 1 });
    await s().submitSolution();
    expect(calls[0]).toHaveBeenCalledWith('p1', 'cpp', '// my answer');
    expect(s().userCode).toBe('// my answer');
    expect(stored('u1')).toEqual({ 'p1::cpp': '// my answer' });
  });

  it('storage full or blocked: the draft still works for the session, and the page is told it was not saved', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    });
    s().selectProblem(problem('p1'));
    s().setUserCode('// kept in memory');
    expect(s().draftsNotSaved).toBe(true);
    s().setLanguage('python');
    s().setLanguage('cpp');
    expect(s().userCode).toBe('// kept in memory');
  });

  it('unreadable or tampered storage is ignored, never shown as code', () => {
    store.set(DRAFTS_STORAGE_PREFIX + 'u1', 'not json');
    reload('u1');
    expect(s().drafts).toEqual({});
    store.set(DRAFTS_STORAGE_PREFIX + 'u1', JSON.stringify({ 'p1::cpp': 42, weird: 'x', 'p1::java': '// ok' }));
    reload('u1');
    expect(s().drafts).toEqual({ 'p1::java': '// ok' });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    });
    reload('u1');
    expect(s().drafts).toEqual({});
  });

  it('a draft longer than a submission allows is kept for the session but not stored', () => {
    s().selectProblem(problem('p1'));
    s().setUserCode('x'.repeat(50_001));
    expect(s().draftsNotSaved).toBe(true);
    expect(stored('u1')).toEqual({});
    s().setUserCode('// short again');
    expect(s().draftsNotSaved).toBe(false);
    expect(stored('u1')).toEqual({ 'p1::cpp': '// short again' });
  });
});
