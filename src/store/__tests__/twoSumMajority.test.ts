import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';

// Two Sum (array + target) and Majority Element (array only) in the visualizer store: they use the store's existing
// array paths (custom input kept across algorithms, Randomize + Restore, validation, playback), unchanged.
const st = () => useVisualizerStore.getState();
const outcomeOf = () => st().steps.find(s => s.type === 'found' || s.type === 'not-found')?.type;

beforeEach(() => {
  useVisualizerStore.setState(useVisualizerStore.getInitialState(), true);
});
afterEach(() => vi.restoreAllMocks());

describe('Two Sum and Majority Element in the visualizer store', () => {
  it('opening one loads its own example (Two Sum with its example target) and runs it', () => {
    st().setAlgorithm('two-sum');
    expect(st()).toMatchObject({ array: [3, 8, 11, 5, 2, 7, 4], target: 9, executionStatus: 'ok', inputSource: 'default', currentStepIndex: 0 });
    expect(outcomeOf()).toBe('found');
    st().setAlgorithm('majority-element');
    expect(st()).toMatchObject({ array: [2, 2, 1, 1, 1, 2, 2], executionStatus: 'ok' });
    expect(outcomeOf()).toBe('found');
  });

  it('a custom array and target carry over: Linear Search → Two Sum → Majority Element, re-run on the same values', () => {
    st().setAlgorithm('linear-search');
    expect(st().applyInput([5, -2, 9, 5], 3).ok).toBe(true);
    st().setAlgorithm('two-sum');
    expect(st()).toMatchObject({ array: [5, -2, 9, 5], target: 3, inputSource: 'custom', executionStatus: 'ok' });
    expect(st().steps.find(s => s.type === 'found')?.pointers).toEqual({ j: 0, i: 1 });
    st().setAlgorithm('majority-element');
    expect(st()).toMatchObject({ array: [5, -2, 9, 5], executionStatus: 'ok' });
    expect(outcomeOf()).toBe('not-found');
  });

  it('an unsorted custom array stays valid for Two Sum (no sorted requirement), unlike Two Pointer', () => {
    st().setAlgorithm('two-sum');
    expect(st().applyInput([9, 1, 5], 6).ok).toBe(true);
    st().setAlgorithm('two-pointer');
    expect(st().executionStatus).toBe('invalid-input');
    st().setAlgorithm('two-sum');
    expect(st()).toMatchObject({ array: [9, 1, 5], executionStatus: 'ok' });
  });

  it('applyInput: a new target re-runs the trace; a missing target is refused and the running trace is kept', () => {
    st().setAlgorithm('two-sum');
    expect(st().applyInput([1, 2, 3], 7).ok).toBe(true);
    expect(outcomeOf()).toBe('not-found');
    expect(st().applyInput([1, 2, 3], 5).ok).toBe(true);
    expect(st().steps.find(s => s.type === 'found')?.pointers).toEqual({ j: 1, i: 2 });
    expect(st().applyInput([1, 2, 3], null)).toMatchObject({ ok: false, message: 'Enter a value for "Target sum".' });
    expect(st()).toMatchObject({ array: [1, 2, 3], target: 5 });
  });

  it('Randomize replaces a custom array (Two Sum keeps its target) and Restore brings it back', () => {
    st().setAlgorithm('two-sum');
    st().applyInput([4, 4, 4], 8);
    st().randomizeArray();
    expect(st()).toMatchObject({ inputSource: 'random', target: 8, executionStatus: 'ok' });
    expect(st().inputNotice).toEqual({ kind: 'replaced-custom', original: [4, 4, 4] });
    st().restoreOriginalInput();
    expect(st()).toMatchObject({ array: [4, 4, 4], target: 8 });

    st().setAlgorithm('majority-element');
    st().setArraySize(5);
    expect(st().array).toHaveLength(5);
    expect(st().executionStatus).toBe('ok');
  });

  it('playback works on both traces like any other (Next, Previous, Reset)', () => {
    for (const id of ['two-sum', 'majority-element'] as const) {
      st().setAlgorithm(id);
      st().nextStep();
      st().nextStep();
      expect(st().currentStepIndex, id).toBe(2);
      st().previousStep();
      expect(st().currentStepIndex, id).toBe(1);
      st().reset();
      expect(st(), id).toMatchObject({ currentStepIndex: 0, isPlaying: false });
    }
  });
});
