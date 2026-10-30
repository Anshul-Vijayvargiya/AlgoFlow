import { create } from 'zustand';
import { apiClient } from '../api';
import type { UserProgressData, AlgorithmTrack, LegacyActivityReport, AlgorithmProgressReset, TodayProgress, RecentActivityEvent } from '../api';
import { useAuthStore } from './useAuthStore';

interface ProgressState {
  progress: UserProgressData | null;
  tracks: AlgorithmTrack[];
  isLoading: boolean;
  error: string | null;
  /** the last visualizer activity could not be saved (set by progress/visualizerActivity; cleared by the next save) */
  recordingError: string | null;
  /** tracks have been loaded for the signed-in user (by fetchProgress or fetchTracks) */
  tracksLoaded: boolean;
  tracksLoading: boolean;
  tracksError: string | null;
  /** today's checklist data (GET /progress/today) */
  today: TodayProgress | null;
  todayLoading: boolean;
  todayError: string | null;
  /** a manual goal is being saved */
  goalSaving: string | null;
  /** the last tick could not be saved (it was undone) */
  goalError: string | null;
  /** the latest submissions and walkthroughs */
  recent: RecentActivityEvent[];
  recentLoaded: boolean;
  recentLoading: boolean;
  recentError: string | null;

  fetchProgress: () => Promise<void>;
  /** loads only the algorithm tracks (for pages that need nothing else) */
  fetchTracks: () => Promise<void>;
  /** forgets everything loaded for the previous user (on sign-out or a change of account) */
  reset: () => void;
  fetchToday: () => Promise<void>;
  /** ticks or unticks a manual goal: shown at once, saved, and undone if saving fails */
  setManualGoal: (goalId: string, done: boolean) => Promise<void>;
  fetchRecent: () => Promise<void>;
  recordActivity: (activity: LegacyActivityReport) => Promise<void>;
  updateAlgorithmProgress: (algorithmId: string, data: AlgorithmProgressReset) => Promise<void>;
}

const INITIAL_DATA = {
  progress: null,
  tracks: [] as AlgorithmTrack[],
  isLoading: false,
  error: null,
  recordingError: null,
  tracksLoaded: false,
  tracksLoading: false,
  tracksError: null,
  today: null as TodayProgress | null,
  todayLoading: false,
  todayError: null,
  goalSaving: null,
  goalError: null,
  recent: [] as RecentActivityEvent[],
  recentLoaded: false,
  recentLoading: false,
  recentError: null,
};

// bumped by reset(): a response to a request made for the previous user is dropped
let generation = 0;

export const useProgressStore = create<ProgressState>((set, get) => ({
  ...INITIAL_DATA,

  fetchProgress: async () => {
    const requestGeneration = generation;
    set({ isLoading: true, error: null });
    try {
      const [prog, trk] = await Promise.all([
        apiClient.progress.getUserProgress(),
        apiClient.progress.getAlgorithmTracks(),
      ]);
      if (requestGeneration !== generation) return;

      set({
        progress: prog,
        tracks: trk,
        isLoading: false,
        tracksLoaded: true,
      });
    } catch (err: any) {
      if (requestGeneration !== generation) return;
      set({
        isLoading: false,
        error: err?.message || 'Failed to load progress data.',
      });
    }
  },

  fetchTracks: async () => {
    const requestGeneration = generation;
    set({ tracksLoading: true, tracksError: null });
    try {
      const tracks = await apiClient.progress.getAlgorithmTracks();
      if (requestGeneration !== generation) return;
      set({ tracks, tracksLoaded: true, tracksLoading: false });
    } catch (err: any) {
      if (requestGeneration !== generation) return;
      set({ tracksLoading: false, tracksError: err?.message || 'Failed to load your progress.' });
    }
  },

  fetchToday: async () => {
    const requestGeneration = generation;
    set({ todayLoading: true, todayError: null });
    try {
      const today = await apiClient.progress.getToday();
      if (requestGeneration !== generation) return;
      set({ today, todayLoading: false });
    } catch (err: any) {
      if (requestGeneration !== generation) return;
      set({ todayLoading: false, todayError: err?.message || "Today's goals could not be loaded." });
    }
  },

  setManualGoal: async (goalId, done) => {
    const requestGeneration = generation;
    const before = get().today;
    if (!before || get().goalSaving) return;
    const ticked = new Set(before.manualCompleted);
    if (done) ticked.add(goalId);
    else ticked.delete(goalId);
    set({ today: { ...before, manualCompleted: [...ticked] }, goalSaving: goalId, goalError: null });
    try {
      const today = await apiClient.progress.setDailyGoal(goalId, done);
      if (requestGeneration !== generation) return;
      set({ today, goalSaving: null });
    } catch (err: any) {
      if (requestGeneration !== generation) return;
      set({ today: before, goalSaving: null, goalError: err?.message || 'Your goal could not be saved.' });
    }
  },

  fetchRecent: async () => {
    const requestGeneration = generation;
    set({ recentLoading: true, recentError: null });
    try {
      const recent = await apiClient.progress.getRecentActivity(8);
      if (requestGeneration !== generation) return;
      set({ recent, recentLoaded: true, recentLoading: false });
    } catch (err: any) {
      if (requestGeneration !== generation) return;
      set({ recentLoading: false, recentError: err?.message || 'Recent activity could not be loaded.' });
    }
  },

  reset: () => {
    generation++;
    set({ ...INITIAL_DATA });
  },

  recordActivity: async (activity) => {
    try {
      await apiClient.progress.recordActivity(activity);
      // Refresh progress metrics after recording activity
      await get().fetchProgress();
    } catch (err: any) {
      console.warn('Failed to record learning activity:', err);
    }
  },

  updateAlgorithmProgress: async (algorithmId, data) => {
    try {
      await apiClient.progress.updateAlgorithmProgress(algorithmId, data);
      await get().fetchProgress();
    } catch (err: any) {
      console.warn('Failed to update algorithm progress:', err);
    }
  },
}));

// progress belongs to one account: drop it when that account signs out or another one signs in
useAuthStore.subscribe((state, previous) => {
  if (previous.user && state.user?.id !== previous.user.id) useProgressStore.getState().reset();
});
