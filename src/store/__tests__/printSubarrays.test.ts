import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';
import { printSubarraysDefinition } from '../../engine/algorithms/printSubarrays';

// Print Subarrays in the visualizer store: its example, custom input kept as entered (never sorted), playback, and
// Randomize, through the store's existing array paths.
const st = () => useVisualizerStore.getState();
const output = () => (st().steps.at(-1)!.buffers ?? []).map(b => b.values);
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('Print Subarrays in the visualizer store', () => {
  it('opens on its example and runs it', () => {
    st().setAlgorithm('print-subarrays');
    expect(st()).toMatchObject({ array: [1, 2, 3], executionStatus: 'ok', inputSource: 'default', currentStepIndex: 0 });
    expect(output()).toEqual([[1], [1, 2], [1, 2, 3], [2], [2, 3], [3]]);
  });

  it('a custom array is kept as entered; empty and one-value arrays run', () => {
    st().setAlgorithm('print-subarrays');
    expect(st().applyInput([4, -4, 4], null).ok).toBe(true);
    expect(st().array).toEqual([4, -4, 4]);
    expect(output()).toEqual([[4], [4, -4], [4, -4, 4], [-4], [-4, 4], [4]]);
    expect(st().steps).toEqual(printSubarraysDefinition.generateSteps([4, -4, 4]));
    expect(st().applyInput([], null).ok).toBe(true);
    expect(output()).toEqual([]);
    expect(st().applyInput([5], null).ok).toBe(true);
    expect(output()).toEqual([[5]]);
  });

  it('playback walks the steps, and reset goes back to the first one without re-running the trace', () => {
    st().setAlgorithm('print-subarrays');
    const steps = st().steps;
    st().nextStep();
    st().nextStep();
    expect(st().currentStepIndex).toBe(2);
    st().setCurrentStepIndex(steps.length - 1);
    expect(st().steps[st().currentStepIndex].type).toBe('complete');
    st().reset();
    expect(st().currentStepIndex).toBe(0);
    expect(st().steps).toBe(steps);
  });

  it('Randomize keeps the length and always gives n(n + 1) / 2 subarrays', () => {
    st().setAlgorithm('print-subarrays');
    for (let k = 0; k < 10; k++) {
      st().randomizeArray();
      expect(st().array).toHaveLength(3);
      expect(st().executionStatus).toBe('ok');
      expect(output()).toHaveLength(6);
    }
  });

  it('switching to Print All Pairs and back runs each on the same array', () => {
    st().setAlgorithm('print-subarrays');
    st().applyInput([1, 2], null);
    st().setAlgorithm('print-all-pairs');
    expect(output()).toEqual([[1, 2]]);
    st().setAlgorithm('print-subarrays');
    expect(output()).toEqual([[1], [1, 2], [2]]);
  });
});
