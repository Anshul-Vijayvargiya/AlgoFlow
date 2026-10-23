import { create } from 'zustand';
import { apiClient } from '../api';
import type { PracticeProblem, ProgrammingLanguage } from '../types/algorithm';
import type { SubmissionRecord, SubmissionResult } from '../api';
import { useAuthStore } from './useAuthStore';
import { buildTopicSets, type TopicSet } from '../pages/practice/topicSets';

/** the server's (and the mock's) largest page; topic sets read every page of the published problems */
const TOPIC_SETS_PAGE_SIZE = 50;
/** at most this many pages (2,500 problems) are read for the topic sets; beyond that they are marked incomplete */
const TOPIC_SETS_MAX_PAGES = 50;

// each request gets a number: a response is applied only if no newer request was made since, and no reset (sign-out or
// account switch) happened since, so a slow answer for an earlier topic, filter, search or page, or for the previous
// account, never replaces what the user asked for last
let problemsRequest = 0;
let topicSetsRequest = 0;
let submissionsRequest = 0;

/** one draft per problem and language, so switching either never loses or mixes code */
const draftKey = (problemId: string, lang: ProgrammingLanguage) => `${problemId}::${lang}`;

/**
 * Drafts are kept on this device, per account (the key holds the account id, so one account never reads another's),
 * and survive a reload. They are never sent to the server: only Submit sends code. A draft that equals the problem's
 * starter is not kept. If storage is unavailable or full, drafts still work for the session (draftsNotSaved).
 */
export const DRAFTS_STORAGE_PREFIX = 'algoflow_practice_drafts:';
/** the same cap as a submission; a longer draft is kept in memory only */
const DRAFT_MAX_CHARS = 50_000;

const storageKey = () => {
  const id = useAuthStore.getState().user?.id;
  return id ? DRAFTS_STORAGE_PREFIX + id : null;
};

function readStoredDrafts(): Record<string, string> {
  const key = storageKey();
  if (!key) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([k, v]) => k.includes('::') && typeof v === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}

/** returns false when the drafts could not be stored (they stay in memory) */
function writeStoredDrafts(drafts: Record<string, string>): boolean {
  const key = storageKey();
  if (!key) return true;
  try {
    const kept = Object.fromEntries(Object.entries(drafts).filter(([, v]) => v.length <= DRAFT_MAX_CHARS));
    localStorage.setItem(key, JSON.stringify(kept));
    return Object.keys(kept).length === Object.keys(drafts).length;
  } catch {
    return false;
  }
}

interface PracticeState {
  problems: PracticeProblem[];
  total: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  isLoading: boolean;
  /** the problem list could not be loaded */
  error: string | null;
  selectedProblem: PracticeProblem | null;
  selectedLanguage: ProgrammingLanguage;
  userCode: string;
  /** edited code per problem and language, for the signed-in account (kept on this device) */
  drafts: Record<string, string>;
  /** the last draft could not be stored on this device: it lasts only until the page is reloaded */
  draftsNotSaved: boolean;
  isSubmitting: boolean;
  /** the server's verdict (or record, for problems that are not auto-judged) */
  submissionResult: SubmissionResult | null;
  /** the submission request failed: no verdict exists (never shown as one) */
  submissionError: string | null;
  submissions: SubmissionRecord[];
  isLoadingSubmissions: boolean;

  selectedDifficulty: string;
  selectedTopic: string;
  searchQuery: string;

  /** the topic learning sets, built from every published problem (independent of the current filters) */
  topicSets: TopicSet[];
  topicSetsStatus: 'idle' | 'loading' | 'ready' | 'error';
  topicSetsError: string | null;
  /** more problems exist than were read for the topic sets: their counts are a lower bound */
  topicSetsIncomplete: boolean;

  fetchProblems: (params?: { page?: number; difficulty?: string; category?: string; search?: string }) => Promise<void>;
  fetchTopicSets: () => Promise<void>;
  setPage: (page: number) => void;
  selectProblem: (problem: PracticeProblem) => void;
  setLanguage: (lang: ProgrammingLanguage) => void;
  setUserCode: (code: string) => void;
  submitSolution: () => Promise<void>;
  fetchSubmissions: (problemId: string) => Promise<void>;
  setSelectedDifficulty: (diff: string) => void;
  setSelectedTopic: (topic: string) => void;
  setSearchQuery: (query: string) => void;
  reset: () => void;
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  problems: [],
  total: 0,
  currentPage: 1,
  totalPages: 1,
  pageSize: 12,
  isLoading: false,
  error: null,
  selectedProblem: null,
  selectedLanguage: 'cpp',
  userCode: '',
  drafts: readStoredDrafts(),
  draftsNotSaved: false,
  isSubmitting: false,
  submissionResult: null,
  submissionError: null,
  submissions: [],
  isLoadingSubmissions: false,

  selectedDifficulty: 'All',
  selectedTopic: 'All',
  searchQuery: '',

  topicSets: [],
  topicSetsStatus: 'idle',
  topicSetsError: null,
  topicSetsIncomplete: false,

  fetchProblems: async (params) => {
    const request = ++problemsRequest;
    set({ isLoading: true, error: null });
    try {
      const difficulty = params?.difficulty !== undefined ? params.difficulty : get().selectedDifficulty;
      const category = params?.category !== undefined ? params.category : get().selectedTopic;
      const search = params?.search !== undefined ? params.search : get().searchQuery;
      const page = params?.page !== undefined ? params.page : get().currentPage;
      const pageSize = get().pageSize;

      const res = await apiClient.practice.getProblems({
        page,
        limit: pageSize,
        difficulty: difficulty !== 'All' ? difficulty : undefined,
        category: category !== 'All' ? category : undefined,
        search: search || undefined,
      });
      if (request !== problemsRequest) return;

      set({
        problems: res.problems,
        total: res.total,
        currentPage: res.page,
        totalPages: Math.max(1, res.totalPages),
        isLoading: false,
      });
    } catch (err: any) {
      if (request !== problemsRequest) return;
      set({ isLoading: false, error: err?.message || 'The problems could not be loaded.' });
    }
  },

  fetchTopicSets: async () => {
    const request = ++topicSetsRequest;
    // keep showing the sets already loaded while they refresh (e.g. after a submission)
    set({ topicSetsStatus: get().topicSets.length ? 'ready' : 'loading', topicSetsError: null });
    try {
      const all: PracticeProblem[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await apiClient.practice.getProblems({ page, limit: TOPIC_SETS_PAGE_SIZE });
        if (request !== topicSetsRequest) return;
        // a different page than asked (clamped: problems were removed while reading) means the pages already read no
        // longer line up: the counts would be wrong, so this is a failure, never partial results shown as complete
        if (res.page !== page) throw new Error('The problem list changed while the topic sets were loading. Please try again.');
        all.push(...res.problems);
        totalPages = Math.max(1, res.totalPages);
        page += 1;
      } while (page <= totalPages && page <= TOPIC_SETS_MAX_PAGES);
      set({ topicSets: buildTopicSets(all), topicSetsStatus: 'ready', topicSetsIncomplete: totalPages > TOPIC_SETS_MAX_PAGES });
    } catch (err: any) {
      if (request !== topicSetsRequest) return;
      // the sets loaded earlier (if any) stay: the page shows them with the error, instead of nothing
      set({ topicSetsStatus: 'error', topicSetsError: err?.message || 'The topic sets could not be loaded.' });
    }
  },

  selectProblem: (problem) => {
    const lang = get().selectedLanguage;
    const starter = (problem.starterCode && problem.starterCode[lang]) || '';
    set({
      selectedProblem: problem,
      // this problem's own draft in this language, else its starter program (never another problem's code)
      userCode: get().drafts[draftKey(problem.id, lang)] ?? starter,
      submissionResult: null,
      submissionError: null,
    });
    get().fetchSubmissions(problem.id);
  },

  setLanguage: (lang) => {
    const prob = get().selectedProblem;
    set({
      selectedLanguage: lang,
      // the draft kept for that language (edits in the previous language stay in its draft)
      userCode: prob ? get().drafts[draftKey(prob.id, lang)] ?? (prob.starterCode?.[lang] || '') : '',
    });
  },

  setUserCode: (code) => {
    const prob = get().selectedProblem;
    if (!prob) {
      set({ userCode: code });
      return;
    }
    const lang = get().selectedLanguage;
    const drafts = { ...get().drafts };
    // back to the starter: nothing to keep (an emptied editor is a draft, and is kept)
    if (code === (prob.starterCode?.[lang] || '')) delete drafts[draftKey(prob.id, lang)];
    else drafts[draftKey(prob.id, lang)] = code;
    set({ userCode: code, drafts, draftsNotSaved: !writeStoredDrafts(drafts) });
  },

  submitSolution: async () => {
    const prob = get().selectedProblem;
    if (!prob) return;

    set({ isSubmitting: true, submissionResult: null, submissionError: null });
    try {
      const res = await apiClient.practice.submitSolution(prob.id, get().selectedLanguage, get().userCode);
      set({ isSubmitting: false, submissionResult: res });

      // Refresh problem list, the topic sets' solved counts and user submissions for this problem
      await Promise.all([
        get().fetchProblems(),
        get().fetchTopicSets(),
        get().fetchSubmissions(prob.id),
      ]);
    } catch (err: any) {
      set({ isSubmitting: false, submissionError: err?.message || 'Your solution could not be submitted. Please try again.' });
    }
  },

  fetchSubmissions: async (problemId: string) => {
    const request = ++submissionsRequest;
    set({ isLoadingSubmissions: true });
    try {
      const list = await apiClient.practice.getSubmissions(problemId);
      if (request !== submissionsRequest) return;
      set({ submissions: list, isLoadingSubmissions: false });
    } catch {
      if (request !== submissionsRequest) return;
      set({ submissions: [], isLoadingSubmissions: false });
    }
  },

  setPage: (page) => {
    const next = Math.max(1, Math.min(get().totalPages, Math.floor(page)));
    if (next === get().currentPage) return;
    set({ currentPage: next });
    get().fetchProblems({ page: next });
  },

  setSelectedDifficulty: (diff) => {
    set({ selectedDifficulty: diff, currentPage: 1 });
    get().fetchProblems({ page: 1, difficulty: diff });
  },

  setSelectedTopic: (topic) => {
    set({ selectedTopic: topic, currentPage: 1 });
    get().fetchProblems({ page: 1, category: topic });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query, currentPage: 1 });
    get().fetchProblems({ page: 1, search: query });
  },

  reset: () => {
    // the problem list (solved flags), topic sets (solved counts) and submission history belong to the account: drop
    // them, and make every request still in flight for the previous account a stale one (its answer is ignored)
    problemsRequest += 1;
    topicSetsRequest += 1;
    submissionsRequest += 1;
    set({
      selectedProblem: null, userCode: '', drafts: {}, draftsNotSaved: false, submissionResult: null, submissionError: null,
      submissions: [], isLoadingSubmissions: false,
      // an ignored request never finishes loading, so loading is cleared here; the next visit loads page 1 again
      problems: [], total: 0, currentPage: 1, totalPages: 1, isLoading: false, error: null,
      topicSets: [], topicSetsStatus: 'idle', topicSetsError: null, topicSetsIncomplete: false,
    });
  },
}));

// drafts and results belong to one account: on sign-out or another account, drop what is open (the stored drafts
// stay on the device under their own account), and on sign-in load that account's stored drafts
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id === previous.user?.id) return;
  if (previous.user) usePracticeStore.getState().reset();
  if (state.user) usePracticeStore.setState({ drafts: readStoredDrafts() });
});
