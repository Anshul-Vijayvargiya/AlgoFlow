import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { UserProfile } from '../../api';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { useAuthStore } from '../../store/useAuthStore';
import { useProgressStore } from '../../store/useProgressStore';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import type { AlgorithmId } from '../../types/algorithm';
import { RECORDING_ERROR, RETRY_DELAY_MS, milestoneSteps, startVisualizerActivityTracking } from '../visualizerActivity';

function user(id = 'u1'): UserProfile {
  return {
    id,
    name: 'Ada',
    email: 'ada@algoflow.io',
    role: 'USER',
    accountStatus: 'active',
    preferences: { theme: 'dark', preferredLanguage: 'cpp', dailyGoalMinutes: 30 },
    streakDays: 0,
    solvedCount: 0,
    algorithmsLearned: 0,
    progressPercent: 0,
  };
}

/** a record function whose calls are kept and can be made to fail */
function fakeRecord() {
  const calls: [string, number][] = [];
  let fail = false;
  return {
    calls,
    failNext: (v: boolean) => void (fail = v),
    record: (algorithmId: string, stepIndex: number) => {
      calls.push([algorithmId, stepIndex]);
      return fail ? Promise.reject(new Error('Network error')) : Promise.resolve({ recorded: true });
    },
  };
}

const flush = () => new Promise(r => setTimeout(r, 0));
const vis = () => useVisualizerStore.getState();
const last = () => vis().steps.length - 1;
let clock = 0;
let stop: (() => void) | null = null;

beforeEach(() => {
  clock = 1_000_000;
  useAuthStore.setState({ user: user() });
  useProgressStore.setState({ recordingError: null });
  vis().setAlgorithm('bubble-sort');
});
afterEach(() => {
  stop?.();
  stop = null;
});

describe('milestones', () => {
  it('are the first step after the start, the middle step and the last step', () => {
    expect(milestoneSteps(0)).toEqual([]);
    expect(milestoneSteps(1)).toEqual([1]);
    expect(milestoneSteps(2)).toEqual([1, 2]);
    expect(milestoneSteps(10)).toEqual([1, 5, 10]);
    expect(milestoneSteps(41)).toEqual([1, 21, 41]);
  });
});

describe('visualizer activity recording', () => {
  it('opening an algorithm or staying on step 0 records nothing', () => {
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    vis().setAlgorithm('merge-sort');
    vis().reset();
    vis().setSpeed(300);
    expect(fake.calls).toEqual([]);
  });

  it('stepping records each milestone once, as the furthest milestone reached', () => {
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    vis().nextStep();
    vis().nextStep();
    expect(fake.calls).toEqual([['bubble-sort', 1]]);
    const middle = milestoneSteps(last())[1];
    vis().setCurrentStepIndex(middle);
    vis().nextStep();
    expect(fake.calls).toEqual([['bubble-sort', 1], ['bubble-sort', middle]]);
    vis().setCurrentStepIndex(last());
    expect(fake.calls.at(-1)).toEqual(['bubble-sort', last()]);
    expect(fake.calls).toHaveLength(3);
  });

  it('jumping straight to the end sends only the last step', () => {
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    vis().setCurrentStepIndex(last());
    expect(fake.calls).toEqual([['bubble-sort', last()]]);
  });

  it('no duplicates: going back and forth, revisiting a step, or a second tracker start after stop', () => {
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    vis().nextStep();
    vis().previousStep();
    vis().nextStep();
    vis().setCurrentStepIndex(1);
    expect(fake.calls).toEqual([['bubble-sort', 1]]);
  });

  it('a new input or reselecting the algorithm is a new walkthrough and is recorded again (the server keeps the maximum)', () => {
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    vis().nextStep();
    vis().randomizeArray();
    vis().nextStep();
    vis().setAlgorithm('bubble-sort');
    vis().nextStep();
    expect(fake.calls).toEqual([['bubble-sort', 1], ['bubble-sort', 1], ['bubble-sort', 1]]);
  });

  it('signed out: nothing is sent', () => {
    useAuthStore.setState({ user: null });
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    vis().nextStep();
    vis().setCurrentStepIndex(last());
    expect(fake.calls).toEqual([]);
  });

  it('another user signing in on the same device records their own walkthrough', () => {
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    vis().nextStep();
    useAuthStore.setState({ user: user('u2') });
    vis().previousStep();
    vis().nextStep();
    expect(fake.calls).toEqual([['bubble-sort', 1], ['bubble-sort', 1]]);
  });

  it('unimplemented algorithms and failed executions record nothing', () => {
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    const unimplemented = ALGORITHM_NAV.find(a => !a.implemented)!.id as AlgorithmId;
    vis().setAlgorithm(unimplemented);
    vis().nextStep();
    vis().setCurrentStepIndex(5);
    expect(fake.calls).toEqual([]);
    // a trace whose generator failed is not a walkthrough
    vis().setAlgorithm('bubble-sort');
    useVisualizerStore.setState({ executionStatus: 'generator-error' });
    useVisualizerStore.setState({ currentStepIndex: last() });
    expect(fake.calls).toEqual([]);
  });

  it('a failed save never throws into the visualizer; it is reported, then retried after a delay and cleared on success', async () => {
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    fake.failNext(true);
    expect(() => vis().nextStep()).not.toThrow();
    await flush();
    expect(useProgressStore.getState().recordingError).toBe(RECORDING_ERROR);
    expect(vis().currentStepIndex).toBe(1);

    // moving again straight away does not hammer the server
    fake.failNext(false);
    vis().nextStep();
    expect(fake.calls).toHaveLength(1);

    clock += RETRY_DELAY_MS + 1;
    vis().previousStep();
    await flush();
    expect(fake.calls).toEqual([['bubble-sort', 1], ['bubble-sort', 1]]);
    expect(useProgressStore.getState().recordingError).toBeNull();
  });

  it('signing out clears a pending recording error', async () => {
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    fake.failNext(true);
    vis().nextStep();
    await flush();
    expect(useProgressStore.getState().recordingError).toBe(RECORDING_ERROR);
    useAuthStore.setState({ user: null });
    expect(useProgressStore.getState().recordingError).toBeNull();
  });

  it('stopping the tracker stops recording', () => {
    const fake = fakeRecord();
    stop = startVisualizerActivityTracking(fake.record, () => clock);
    stop();
    stop = null;
    vis().nextStep();
    expect(fake.calls).toEqual([]);
  });
});
