import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';
import { printAllPairsDefinition } from '../../engine/algorithms/printAllPairs';

// Print All Pairs in the visualizer store: its example, custom input kept as entered (never sorted), playback, and
// Randomize, through the store's existing array paths.
const st = () => useVisualizerStore.getState();
const output = () => (st().steps.at(-1)!.buffers ?? []).map(b => b.values);
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('Print All Pairs in the visualizer store', () => {
  it('opens on its example and runs it', () => {
    st().setAlgorithm('print-all-pairs');
    expect(st()).toMatchObject({ array: [10, 20, 30, 40], executionStatus: 'ok', inputSource: 'default', currentStepIndex: 0 });
    expect(output()).toEqual([[10, 20], [10, 30], [10, 40], [20, 30], [20, 40], [30, 40]]);
  });

  it('a custom array is kept as entered and paired in its own order; empty and one-value arrays run', () => {
    st().setAlgorithm('print-all-pairs');
    expect(st().applyInput([5, -3, 5], null).ok).toBe(true);
    expect(st().array).toEqual([5, -3, 5]);
    expect(st().steps.every(s => s.state.join() === '5,-3,5')).toBe(true);
    expect(output()).toEqual([[5, -3], [5, 5], [-3, 5]]);
    expect(st().steps).toEqual(printAllPairsDefinition.generateSteps([5, -3, 5]));
    for (const short of [[], [7]]) {
      expect(st().applyInput(short, null).ok).toBe(true);
      expect(st().executionStatus).toBe('ok');
      expect(output()).toEqual([]);
    }
  });

  it('playback walks the steps, and reset goes back to the first one without re-running the trace', () => {
    st().setAlgorithm('print-all-pairs');
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

  it('Randomize keeps the length and always gives n(n - 1) / 2 pairs', () => {
    st().setAlgorithm('print-all-pairs');
    for (let k = 0; k < 10; k++) {
      st().randomizeArray();
      const n = st().array.length;
      expect(n).toBe(4);
      expect(st().executionStatus).toBe('ok');
      expect(output()).toHaveLength((n * (n - 1)) / 2);
    }
  });
});
