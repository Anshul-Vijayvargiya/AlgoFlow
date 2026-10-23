/**
 * Records visualizer walkthroughs as learning activity for the signed-in user.
 *
 * What counts: stepping (Next, Play or the step slider) through a trace of an implemented algorithm that ran
 * successfully. Opening the visualizer, rendering a page or sitting on step 0 records nothing, and nothing here ever
 * marks an algorithm completed or mastered.
 *
 * What is sent: a few milestones per trace — the first step after the start, the middle step and the last step. When
 * the user reaches one, the furthest milestone reached is sent once for that trace (one algorithm + input, identified
 * by the store's inputRevision). The server keeps the furthest step per user, day and algorithm, so a repeat (a
 * remount, a reload, a retry) never inflates anything.
 *
 * Failures never interrupt the visualizer: the reason is put in useProgressStore.recordingError, and the milestone is
 * tried again the next time the user moves through the trace (at most once per RETRY_DELAY_MS).
 */
import { apiClient } from '../api';
import { isImplementedAlgorithm } from '../data/algorithmCatalog';
import { useAuthStore } from '../store/useAuthStore';
import { useProgressStore } from '../store/useProgressStore';
import { useVisualizerStore } from '../store/useVisualizerStore';

export type RecordVisualizerActivity = (algorithmId: string, stepIndex: number) => Promise<unknown>;

export const RECORDING_ERROR = 'Your latest visualizer activity could not be saved. It will be tried again as you continue.';
export const RETRY_DELAY_MS = 10_000;

const recordViaApi: RecordVisualizerActivity = (algorithmId, stepIndex) =>
  apiClient.progress.recordVisualizerActivity(algorithmId, stepIndex);

/** the recorded steps of a trace whose last step index is lastIndex: the first after the start, the middle and the last */
export function milestoneSteps(lastIndex: number): number[] {
  if (lastIndex < 1) return [];
  return [...new Set([1, Math.ceil(lastIndex / 2), lastIndex])];
}

/** Starts recording; returns a function that stops it. Called once from main.tsx (and by tests with a fake record). */
export function startVisualizerActivityTracking(record: RecordVisualizerActivity = recordViaApi, now: () => number = Date.now): () => void {
  // keys (user | algorithm | input revision | step) already sent or being sent
  const sent = new Set<string>();
  // keys whose last attempt failed → when they may be tried again
  const retryAt = new Map<string, number>();

  const stop = useVisualizerStore.subscribe(state => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const { selectedAlgorithm, executionStatus, steps, currentStepIndex, inputRevision } = state;
    if (executionStatus !== 'ok' || !isImplementedAlgorithm(selectedAlgorithm)) return;
    const reached = milestoneSteps(steps.length - 1).filter(m => m <= currentStepIndex);
    if (reached.length === 0) return;
    const step = reached[reached.length - 1];
    const key = `${user.id}|${selectedAlgorithm}|${inputRevision}|${step}`;
    if (sent.has(key) || (retryAt.get(key) ?? 0) > now()) return;

    sent.add(key);
    record(selectedAlgorithm, step).then(
      () => {
        retryAt.delete(key);
        if (useProgressStore.getState().recordingError) useProgressStore.setState({ recordingError: null });
      },
      () => {
        sent.delete(key);
        retryAt.set(key, now() + RETRY_DELAY_MS);
        useProgressStore.setState({ recordingError: RECORDING_ERROR });
      }
    );
  });

  // a signed-out session has nothing to report
  const stopAuth = useAuthStore.subscribe((state, previous) => {
    if (!state.user && previous.user) useProgressStore.setState({ recordingError: null });
  });

  return () => {
    stop();
    stopAuth();
  };
}
