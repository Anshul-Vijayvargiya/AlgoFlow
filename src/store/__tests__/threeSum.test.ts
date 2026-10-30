import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';

// 3Sum in the visualizer store: its example, custom input as entered (the trace sorts its own copy), and Randomize
// drawing from its own range (-9 to 9), so triplets that sum to 0 are common.
const st = () => useVisualizerStore.getState();
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('3Sum in the visualizer store', () => {
  it('opens on the LeetCode example and runs it', () => {
    st().setAlgorithm('three-sum');
    expect(st()).toMatchObject({ array: [-1, 0, 1, 2, -1, -4], executionStatus: 'ok' });
    expect(st().steps.at(-1)!.outcomeText).toBe('2 triplets sum to 0: [[-1, -1, 2], [-1, 0, 1]]');
  });

  it('a custom array is kept as entered (unsorted, negative); the trace sorts a copy; empty and short arrays run', () => {
    st().setAlgorithm('three-sum');
    expect(st().applyInput([3, -3, 0, 5], null).ok).toBe(true);
    expect(st().array).toEqual([3, -3, 0, 5]);
    expect(st().steps[1].state).toEqual([3, -3, 0, 5]);
    expect(st().steps.at(-1)!.state).toEqual([-3, 0, 3, 5]);
    expect(st().steps.at(-1)!.outcomeText).toBe('1 triplet sums to 0: [[-3, 0, 3]]');
    for (const short of [[], [4], [1, -1]]) {
      expect(st().applyInput(short, null).ok).toBe(true);
      expect(st().steps.at(-1)!.outcomeText).toBe('No triplet sums to 0');
    }
  });

  it('Randomize: values from -9 to 9, a valid run every time, and runs that find triplets', () => {
    st().setAlgorithm('three-sum');
    let withTriplets = 0;
    for (let k = 0; k < 40; k++) {
      st().randomizeArray();
      expect(st().array.every(v => Number.isInteger(v) && v >= -9 && v <= 9)).toBe(true);
      expect(st().executionStatus).toBe('ok');
      if (st().steps.at(-2)!.type === 'found') withTriplets++;
    }
    // about half the runs find one (values from 10 to 94, the default range, never would); none in 40 is beyond chance
    expect(withTriplets).toBeGreaterThan(0);
  });
});
