import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';
import { fourSumDefinition } from '../../engine/algorithms/fourSum';

// 4Sum in the visualizer store: its example and example target, custom input and target as entered (the trace sorts its
// own copy), playback over its steps, and Randomize drawing from its own range (-9 to 9) while keeping the target.
const st = () => useVisualizerStore.getState();
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('4Sum in the visualizer store', () => {
  it('opens on the LeetCode example with target 0 and runs it', () => {
    st().setAlgorithm('four-sum');
    expect(st()).toMatchObject({ array: [1, 0, -1, 0, -2, 2], target: 0, executionStatus: 'ok', inputSource: 'default', currentStepIndex: 0 });
    expect(st().steps.at(-1)!.outcomeText).toBe('3 quadruplets sum to 0: [[-2, -1, 1, 2], [-2, 0, 0, 2], [-1, 0, 0, 1]]');
  });

  it('the target entered is the one the trace uses; a missing target is refused and the running trace is kept', () => {
    st().setAlgorithm('four-sum');
    expect(st().applyInput([2, -1, 3, 0, 1, -2], 4).ok).toBe(true);
    expect(st()).toMatchObject({ array: [2, -1, 3, 0, 1, -2], target: 4, inputSource: 'custom' });
    expect(st().steps.every(s => s.variables?.target === 4)).toBe(true);
    expect(st().steps[1].state).toEqual([2, -1, 3, 0, 1, -2]);
    expect(st().steps.at(-1)!.state).toEqual([-2, -1, 0, 1, 2, 3]);
    // the six values sum to 3, so each answer leaves out a pair summing to -1: (-2, 1) or (-1, 0)
    expect(st().steps.at(-1)!.outcomeText).toBe('2 quadruplets sum to 4: [[-2, 1, 2, 3], [-1, 0, 2, 3]]');
    expect(st().steps).toEqual(fourSumDefinition.generateSteps([2, -1, 3, 0, 1, -2], { target: 4 }));

    expect(st().applyInput([2, -1, 3, 0, 1, -2], -999).ok).toBe(true);
    expect(st().steps.at(-1)!.outcomeText).toBe('No quadruplet sums to -999');
    expect(st().applyInput([1, 2, 3, 4], null)).toMatchObject({ ok: false, message: 'Enter a value for "Target sum".' });
    expect(st()).toMatchObject({ array: [2, -1, 3, 0, 1, -2], target: -999 });
    for (const short of [[], [4], [1, -1, 0]]) {
      expect(st().applyInput(short, 0).ok).toBe(true);
      expect(st().steps.at(-1)!.outcomeText).toBe('No quadruplet sums to 0');
    }
  });

  it('playback walks the steps, and reset goes back to the first one without re-running the trace', () => {
    st().setAlgorithm('four-sum');
    const steps = st().steps;
    st().nextStep();
    st().nextStep();
    expect(st().currentStepIndex).toBe(2);
    st().setCurrentStepIndex(steps.length - 1);
    expect(st().steps[st().currentStepIndex].type).toBe('complete');
    st().reset();
    expect(st().currentStepIndex).toBe(0);
    expect(st().steps).toBe(steps);
    st().setCurrentStepIndex(steps.length - 1);
    expect(st().steps[st().currentStepIndex].outcomeText).toBe(steps.at(-1)!.outcomeText);
  });

  it('a custom array and target carry over from Two Sum, and 3Sum is unaffected by them', () => {
    st().setAlgorithm('two-sum');
    expect(st().applyInput([5, -5, 0, 0, 3], 0).ok).toBe(true);
    st().setAlgorithm('four-sum');
    expect(st()).toMatchObject({ array: [5, -5, 0, 0, 3], target: 0, inputSource: 'custom', executionStatus: 'ok' });
    expect(st().steps.at(-1)!.outcomeText).toBe('1 quadruplet sums to 0: [[-5, 0, 0, 5]]');
    st().setAlgorithm('three-sum');
    expect(st()).toMatchObject({ array: [5, -5, 0, 0, 3], executionStatus: 'ok' });
    expect(st().steps.at(-1)!.outcomeText).toBe('1 triplet sums to 0: [[-5, 0, 5]]');
  });

  it('Randomize: values from -9 to 9, the target kept, a valid run every time, and runs that find quadruplets', () => {
    st().setAlgorithm('four-sum');
    // Randomize keeps the array's length: ten values
    st().applyInput([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2);
    let withQuads = 0;
    for (let k = 0; k < 40; k++) {
      st().randomizeArray();
      expect(st().array).toHaveLength(10);
      expect(st().array.every(v => Number.isInteger(v) && v >= -9 && v <= 9)).toBe(true);
      expect(st()).toMatchObject({ target: 2, executionStatus: 'ok', inputSource: 'random' });
      if (st().steps.at(-2)!.type === 'found') withQuads++;
    }
    // most runs of ten values from -9 to 9 have some four that sum to 2 (values from 10 to 94, the default range, never
    // would); none in 40 is beyond chance
    expect(withQuads).toBeGreaterThan(0);
  });
});
