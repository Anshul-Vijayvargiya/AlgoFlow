import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';

// The visualizer store with Subsets: an array input, limited to 5 distinct values.
const st = () => useVisualizerStore.getState();
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('Subsets in the visualizer store', () => {
  it('opening it loads the example and runs it', () => {
    st().setAlgorithm('backtracking-subsets');
    expect(st()).toMatchObject({ array: [1, 2, 3], executionStatus: 'ok', inputSource: 'default', arraySize: 3 });
    expect(st().steps).toHaveLength(61);
    expect(st().steps.at(-1)!.outcomeText).toBe('8 subsets of [1, 2, 3] (2^3 = 8)');
  });

  it('a custom array runs as typed; too many values or a repeat are refused and change nothing', () => {
    st().setAlgorithm('backtracking-subsets');
    expect(st().applyInput([4, 9], null).ok).toBe(true);
    expect(st().steps.at(-1)!.subsets!.subsets).toEqual([[], [4], [4, 9], [9]]);
    expect(st().applyInput([1, 2, 3, 4, 5, 6], null)).toMatchObject({ ok: false, message: 'Too many values (6). The visualizer supports at most 5.' });
    expect(st().applyInput([1, 1], null).ok).toBe(false);
    expect(st().array).toEqual([4, 9]);
    expect(st().applyInput([], null).ok).toBe(true);
    expect(st().steps.at(-1)!.subsets!.subsets).toEqual([[]]);
  });

  it('Randomize always gives distinct values within the limit, whatever size another algorithm left behind', () => {
    st().setAlgorithm('bubble-sort');
    st().setArraySize(12);
    st().setAlgorithm('backtracking-subsets');
    for (let k = 0; k < 200; k++) {
      st().randomizeArray();
      expect(st().array.length).toBeLessThanOrEqual(5);
      expect(new Set(st().array).size).toBe(st().array.length);
      expect(st().array.every(v => v >= 1 && v <= 9)).toBe(true);
      expect(st().executionStatus).toBe('ok');
    }
    st().setArraySize(12);
    expect(st().array).toHaveLength(5);
    expect(new Set(st().array).size).toBe(5);
    expect(st().steps).toHaveLength(253);
  });

  it('another algorithm\'s custom array does not carry in: it might be too long or repeat values', () => {
    st().setAlgorithm('bubble-sort');
    expect(st().applyInput([5, 5, 1, 2, 3, 4, 8, 9], null).ok).toBe(true);
    st().setAlgorithm('backtracking-subsets');
    expect(st()).toMatchObject({ array: [1, 2, 3], executionStatus: 'ok', inputSource: 'default' });
  });

  it('other array algorithms still carry a custom array between them, and Randomize may still repeat values there', () => {
    st().setAlgorithm('bubble-sort');
    expect(st().applyInput([5, 5, 1], null).ok).toBe(true);
    st().setAlgorithm('selection-sort');
    expect(st()).toMatchObject({ array: [5, 5, 1], inputSource: 'custom' });
    st().setArraySize(16);
    expect(st().array).toHaveLength(16);
  });

  it('Restore puts a custom input back after Randomize', () => {
    st().setAlgorithm('backtracking-subsets');
    expect(st().applyInput([7, 3], null).ok).toBe(true);
    st().randomizeArray();
    expect(st()).toMatchObject({ inputSource: 'random', inputNotice: { kind: 'replaced-custom', original: [7, 3] } });
    st().restoreOriginalInput();
    expect(st().array).toEqual([7, 3]);
  });
});
