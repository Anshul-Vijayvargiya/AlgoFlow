import { create } from 'zustand';
import { apiClient } from '../api';
import type { UserProgressData, AlgorithmTrack } from '../api';

interface ProgressState {
  progress: UserProgressData | null;
  tracks: AlgorithmTrack[];
  isLoading: boolean;
  error: string | null;

  fetchProgress: () => Promise<void>;
  recordActivity: (activity: {
    minutes?: number;
    steps?: number;
    algorithmId?: string;
    activityType?: 'visualizer_step' | 'algorithm_completed' | 'problem_submitted' | 'problem_solved';
  }) => Promise<void>;
  updateAlgorithmProgress: (
    algorithmId: string,
    data: {
      status?: 'not_started' | 'in_progress' | 'completed';
      stepsCompleted?: number;
      totalSteps?: number;
      lastStepIndex?: number;
      topic?: string;
    }
  ) => Promise<void>;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  progress: null,
  tracks: [],
  isLoading: false,
  error: null,

  fetchProgress: async () => {
    set({ isLoading: true, error: null });
    try {
      const [prog, trk] = await Promise.all([
        apiClient.progress.getUserProgress(),
        apiClient.progress.getAlgorithmTracks(),
      ]);

      set({
        progress: prog,
        tracks: trk,
        isLoading: false,
      });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.message || 'Failed to load progress data.',
      });
    }
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
