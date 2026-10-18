import { create } from 'zustand';
import { apiClient } from '../api';
import type { PracticeProblem, ProgrammingLanguage } from '../types/algorithm';
import type { SubmissionRecord } from '../api';

interface PracticeState {
  problems: PracticeProblem[];
  total: number;
  isLoading: boolean;
  selectedProblem: PracticeProblem | null;
  selectedLanguage: ProgrammingLanguage;
  userCode: string;
  isSubmitting: boolean;
  submissionResult: {
    passed: boolean;
    runtimeMs: number;
    memoryMb: number;
    message: string;
  } | null;
  submissions: SubmissionRecord[];
  isLoadingSubmissions: boolean;

  selectedDifficulty: string;
  selectedTopic: string;
  searchQuery: string;

  fetchProblems: (params?: { difficulty?: string; category?: string; search?: string }) => Promise<void>;
  selectProblem: (problem: PracticeProblem) => void;
  setLanguage: (lang: ProgrammingLanguage) => void;
  setUserCode: (code: string) => void;
  submitSolution: () => Promise<void>;
  fetchSubmissions: (problemId: string) => Promise<void>;
  setSelectedDifficulty: (diff: string) => void;
  setSelectedTopic: (topic: string) => void;
  setSearchQuery: (query: string) => void;
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  problems: [],
  total: 0,
  isLoading: false,
  selectedProblem: null,
  selectedLanguage: 'cpp',
  userCode: '',
  isSubmitting: false,
  submissionResult: null,
  submissions: [],
  isLoadingSubmissions: false,

  selectedDifficulty: 'All',
  selectedTopic: 'All',
  searchQuery: '',

  fetchProblems: async (params) => {
    set({ isLoading: true });
    try {
      const difficulty = params?.difficulty !== undefined ? params.difficulty : get().selectedDifficulty;
      const category = params?.category !== undefined ? params.category : get().selectedTopic;
      const search = params?.search !== undefined ? params.search : get().searchQuery;

      const res = await apiClient.practice.getProblems({
        difficulty: difficulty !== 'All' ? difficulty : undefined,
        category: category !== 'All' ? category : undefined,
        search: search || undefined,
        limit: 50,
      });

      set({
        problems: res.problems,
        total: res.total,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to fetch problems:', err);
      set({ isLoading: false });
    }
  },

  selectProblem: (problem) => {
    const lang = get().selectedLanguage;
    const starter = (problem.starterCode && problem.starterCode[lang]) || '';
    set({
      selectedProblem: problem,
      userCode: starter,
      submissionResult: null,
    });
    get().fetchSubmissions(problem.id);
  },

  setLanguage: (lang) => {
    const prob = get().selectedProblem;
    set({
      selectedLanguage: lang,
      userCode: prob && prob.starterCode ? prob.starterCode[lang] || '' : '',
    });
  },

  setUserCode: (code) => set({ userCode: code }),

  submitSolution: async () => {
    const prob = get().selectedProblem;
    if (!prob) return;

    set({ isSubmitting: true, submissionResult: null });
    try {
      const res = await apiClient.practice.submitSolution(prob.id, get().selectedLanguage, get().userCode);
      set({ isSubmitting: false, submissionResult: res });

      // Refresh problem list and user submissions for this problem
      await Promise.all([
        get().fetchProblems(),
        get().fetchSubmissions(prob.id),
      ]);
    } catch (err: any) {
      set({
        isSubmitting: false,
        submissionResult: {
          passed: false,
          runtimeMs: 0,
          memoryMb: 0,
          message: err?.message || 'Submission failed. Please try again.',
        },
      });
    }
  },

  fetchSubmissions: async (problemId: string) => {
    set({ isLoadingSubmissions: true });
    try {
      const list = await apiClient.practice.getSubmissions(problemId);
      set({ submissions: list, isLoadingSubmissions: false });
    } catch {
      set({ submissions: [], isLoadingSubmissions: false });
    }
  },

  setSelectedDifficulty: (diff) => {
    set({ selectedDifficulty: diff });
    get().fetchProblems({ difficulty: diff });
  },

  setSelectedTopic: (topic) => {
    set({ selectedTopic: topic });
    get().fetchProblems({ category: topic });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().fetchProblems({ search: query });
  },
}));
