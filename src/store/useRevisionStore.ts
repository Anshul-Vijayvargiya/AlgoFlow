import { create } from 'zustand';
import { apiClient } from '../api';
import type { RevisionRecord } from '../api';
import { HttpError } from '../api/httpAdapter';
import { withRateLimitRetry } from '../api/rateLimit';
import type { RevisionReasonId, RevisionStatus } from '../data/revisions';
import { useAuthStore } from './useAuthStore';

/**
 * The signed-in user's Revision List, shared by the header's badge, the Revision page and the Visualizer's bookmark. The
 * server owns the data: it is loaded once per account, and each change applies what the server returned, so every
 * count on screen comes from the same records.
 */
interface RevisionState {
  items: RevisionRecord[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** why the list could not be loaded */
  error: string | null;
  /** algorithms with a change in flight */
  busy: string[];
  /** loads the list unless it is loaded or loading; `force` is Retry */
  load: (options?: { force?: boolean }) => Promise<void>;
  /** adds the algorithm, or changes its reason; rejects with the reason a change failed */
  mark: (algorithmId: string, reason: RevisionReasonId | null) => Promise<void>;
  setStatus: (algorithmId: string, status: RevisionStatus) => Promise<void>;
  remove: (algorithmId: string) => Promise<void>;
  reset: () => void;
}

export const revisionCounts = (items: readonly RevisionRecord[]) => {
  const revised = items.filter(r => r.status === 'revised').length;
  return { total: items.length, pending: items.length - revised, revised };
};

const INITIAL = { items: [] as RevisionRecord[], status: 'idle' as const, error: null, busy: [] as string[] };

// bumped by reset(): a response to a request made for the previous account is dropped
let generation = 0;
let loading: Promise<void> | null = null;

export const useRevisionStore = create<RevisionState>((set, get) => {
  /** one change: waits for a load in flight (which would overwrite it), and applies the result to the list */
  async function change<T>(algorithmId: string, send: () => Promise<T>, apply: (items: RevisionRecord[], result: T) => RevisionRecord[]) {
    const requestGeneration = generation;
    set({ busy: [...get().busy, algorithmId] });
    const done = () => set({ busy: get().busy.filter(id => id !== algorithmId) });
    try {
      await loading;
      // each request can safely be repeated, so waiting out the API rate limiter never applies a change twice
      const result = await withRateLimitRetry(send);
      if (requestGeneration !== generation) return;
      set({ items: apply(get().items, result) });
      done();
    } catch (err) {
      if (requestGeneration !== generation) return;
      done();
      throw err;
    }
  }

  const replace = (items: RevisionRecord[], saved: RevisionRecord) =>
    items.some(r => r.algorithmId === saved.algorithmId) ? items.map(r => (r.algorithmId === saved.algorithmId ? saved : r)) : [saved, ...items];
  const without = (items: RevisionRecord[], algorithmId: string) => items.filter(r => r.algorithmId !== algorithmId);
  /** the record is gone from the server (removed in another tab) */
  const isGone = (err: unknown) => err instanceof HttpError && err.status === 404;

  return {
    ...INITIAL,

    load: (options) => {
      if (!options?.force && (loading || get().status === 'ready')) return loading ?? Promise.resolve();
      const requestGeneration = generation;
      set({ status: 'loading', error: null });
      const request: Promise<void> = withRateLimitRetry(() => apiClient.revisions.getRevisions())
        .then(items => {
          if (requestGeneration === generation) set({ items, status: 'ready' });
        })
        .catch((err: unknown) => {
          if (requestGeneration === generation) {
            set({ status: 'error', error: (err as Error)?.message || 'Failed to load your Revision List.' });
          }
        })
        .finally(() => {
          if (loading === request) loading = null;
        });
      loading = request;
      return request;
    },

    mark: (algorithmId, reason) =>
      change(algorithmId, () => apiClient.revisions.markForRevision(algorithmId, reason), replace),

    setStatus: async (algorithmId, status) => {
      try {
        await change(algorithmId, () => apiClient.revisions.setRevisionStatus(algorithmId, status), replace);
      } catch (err) {
        if (isGone(err)) set({ items: without(get().items, algorithmId) });
        throw err;
      }
    },

    remove: async (algorithmId) => {
      try {
        await change(algorithmId, () => apiClient.revisions.removeRevision(algorithmId), items => without(items, algorithmId));
      } catch (err) {
        // already removed (in another tab): what the user asked for
        if (!isGone(err)) throw err;
        set({ items: without(get().items, algorithmId) });
      }
    },

    reset: () => {
      generation++;
      loading = null;
      set({ ...INITIAL });
    },
  };
});

// the list belongs to one account: drop it when it signs out or another one signs in
useAuthStore.subscribe((state, previous) => {
  if (previous.user && state.user?.id !== previous.user.id) useRevisionStore.getState().reset();
});
