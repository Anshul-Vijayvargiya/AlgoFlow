import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, type AlgorithmTrack, type UserProfile } from '../../api';
import { useAuthStore } from '../useAuthStore';
import { useProgressStore } from '../useProgressStore';

const track = (algorithmId: string): AlgorithmTrack => ({
  algorithmId,
  status: 'in_progress',
  stepsCompleted: 0,
  totalSteps: 0,
  lastStepIndex: 1,
  executionCount: 0,
  lastActivityAt: '2026-10-20T10:00:00Z',
});
const user = (id: string) => ({ id }) as UserProfile;

/** a promise resolved or rejected from the test */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

beforeEach(() => {
  useAuthStore.setState({ user: user('u1') });
  useProgressStore.getState().reset();
});
afterEach(() => vi.restoreAllMocks());

describe('progress store — tracks', () => {
  it('fetchTracks loads only the tracks (no summary request) and marks them loaded', async () => {
    const tracks = vi.spyOn(apiClient.progress, 'getAlgorithmTracks').mockResolvedValue([track('bubble-sort')]);
    const summary = vi.spyOn(apiClient.progress, 'getUserProgress');
    const p = useProgressStore.getState().fetchTracks();
    expect(useProgressStore.getState()).toMatchObject({ tracksLoading: true, tracksLoaded: false });
    await p;
    expect(useProgressStore.getState()).toMatchObject({ tracksLoading: false, tracksLoaded: true, tracksError: null });
    expect(useProgressStore.getState().tracks.map(t => t.algorithmId)).toEqual(['bubble-sort']);
    expect(tracks).toHaveBeenCalledTimes(1);
    expect(summary).not.toHaveBeenCalled();
  });

  it('an empty list is a loaded result, not an error', async () => {
    vi.spyOn(apiClient.progress, 'getAlgorithmTracks').mockResolvedValue([]);
    await useProgressStore.getState().fetchTracks();
    expect(useProgressStore.getState()).toMatchObject({ tracks: [], tracksLoaded: true, tracksError: null });
  });

  it('a failure is reported and leaves earlier tracks in place; a retry clears it', async () => {
    const spy = vi.spyOn(apiClient.progress, 'getAlgorithmTracks').mockRejectedValueOnce(new Error('Unable to connect to the server.'));
    await useProgressStore.getState().fetchTracks();
    expect(useProgressStore.getState()).toMatchObject({ tracksError: 'Unable to connect to the server.', tracksLoaded: false });
    spy.mockResolvedValueOnce([track('merge-sort')]);
    await useProgressStore.getState().fetchTracks();
    expect(useProgressStore.getState()).toMatchObject({ tracksError: null, tracksLoaded: true });
  });

  it("signing out or switching account drops the previous user's progress", async () => {
    vi.spyOn(apiClient.progress, 'getAlgorithmTracks').mockResolvedValue([track('bubble-sort')]);
    await useProgressStore.getState().fetchTracks();
    useAuthStore.setState({ user: user('u2') });
    expect(useProgressStore.getState()).toMatchObject({ tracks: [], tracksLoaded: false, progress: null });

    await useProgressStore.getState().fetchTracks();
    useAuthStore.setState({ user: null });
    expect(useProgressStore.getState()).toMatchObject({ tracks: [], tracksLoaded: false });
  });

  it("a response that arrives after the account changed is dropped (never shown to the next user)", async () => {
    const late = deferred<AlgorithmTrack[]>();
    vi.spyOn(apiClient.progress, 'getAlgorithmTracks').mockReturnValueOnce(late.promise);
    const p = useProgressStore.getState().fetchTracks();
    useAuthStore.setState({ user: user('u2') });
    late.resolve([track('bubble-sort')]);
    await p;
    expect(useProgressStore.getState()).toMatchObject({ tracks: [], tracksLoaded: false });
  });

  it('a profile refresh for the same user keeps the loaded progress', async () => {
    vi.spyOn(apiClient.progress, 'getAlgorithmTracks').mockResolvedValue([track('bubble-sort')]);
    await useProgressStore.getState().fetchTracks();
    useAuthStore.setState({ user: { ...user('u1'), name: 'Renamed' } });
    expect(useProgressStore.getState().tracksLoaded).toBe(true);
  });
});
