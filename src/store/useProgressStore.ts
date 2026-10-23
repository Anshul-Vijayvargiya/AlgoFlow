import { create } from 'zustand';
import { apiClient } from '../api';
import type { UserProgressData, AlgorithmTrack, LegacyActivityReport, AlgorithmProgressReset } from '../api';
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

  fetchProgress: () => Promise<void>;
  /** loads only the algorithm tracks (for pages that need nothing else) */
  fetchTracks: () => Promise<void>;
  /** forgets everything loaded for the previous user (on sign-out or a change of account) */
  reset: () => void;
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
