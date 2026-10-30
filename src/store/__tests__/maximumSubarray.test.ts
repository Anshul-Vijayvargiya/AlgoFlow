import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';

// Maximum Subarray in the visualizer store: its example, custom input as entered (negatives, unsorted), and Randomize
// drawing from its own range (-20 to 20) without sorting.
const st = () => useVisualizerStore.getState();
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('Maximum Subarray in the visualizer store', () => {
  it('opens on its example and runs it', () => {
    st().setAlgorithm('maximum-subarray');
    expect(st()).toMatchObject({ array: [-2, 1, -3, 4, -1, 2, 1, -5, 4], executionStatus: 'ok' });
    expect(st().steps.at(-1)!.outcomeText).toBe('Max sum 6: nums[3..6] = [4, -1, 2, 1]');
  });

  it('a custom array is used exactly as entered (negative, unsorted); an empty one is refused', () => {
    st().setAlgorithm('maximum-subarray');
    expect(st().applyInput([5, -9, 3, -1, 4], null).ok).toBe(true);
    expect(st().array).toEqual([5, -9, 3, -1, 4]);
    expect(st().steps.at(-1)!.outcomeText).toBe('Max sum 6: nums[2..4] = [3, -1, 4]');
    expect(st().applyInput([], null)).toMatchObject({ ok: false });
    expect(st().array).toEqual([5, -9, 3, -1, 4]);
  });

  it('Randomize: values from -20 to 20, never sorted, never empty, always a valid run', () => {
    st().setAlgorithm('maximum-subarray');
    const seen: number[] = [];
    for (let k = 0; k < 40; k++) {
      st().randomizeArray();
      const a = st().array;
      expect(a.length).toBeGreaterThanOrEqual(1);
      expect(a.every(v => Number.isInteger(v) && v >= -20 && v <= 20)).toBe(true);
      expect(st().executionStatus).toBe('ok');
      seen.push(...a);
    }
    // both signs appear (the range straddles zero), and the values are not sorted for the user
    expect(seen.some(v => v < 0) && seen.some(v => v > 0)).toBe(true);
    const sortedEvery = Array.from({ length: 20 }, () => {
      st().randomizeArray();
      const a = st().array;
      return a.every((v, i) => i === 0 || a[i - 1] <= v);
    });
    expect(sortedEvery.every(Boolean)).toBe(false);
  });
});
