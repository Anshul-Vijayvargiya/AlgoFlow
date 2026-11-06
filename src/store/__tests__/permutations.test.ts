import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';

// The visualizer store with Find All Permutations: an array input, limited to 4 distinct values.
const st = () => useVisualizerStore.getState();
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('Find All Permutations in the visualizer store', () => {
  it('opening it loads the example and runs it', () => {
    st().setAlgorithm('backtracking-permutations');
    expect(st()).toMatchObject({ array: [1, 2, 3], executionStatus: 'ok', inputSource: 'default', arraySize: 3 });
    expect(st().steps).toHaveLength(136);
    expect(st().steps.at(-1)!.outcomeText).toBe('6 permutations of [1, 2, 3] (3! = 6)');
  });

  it('a custom array runs as typed; too many values or a repeat are refused and change nothing', () => {
    st().setAlgorithm('backtracking-permutations');
    expect(st().applyInput([4, 9], null).ok).toBe(true);
    expect(st().steps.at(-1)!.permutations!.permutations).toEqual([[4, 9], [9, 4]]);
    expect(st().applyInput([1, 2, 3, 4, 5], null)).toMatchObject({ ok: false, message: 'Too many values (5). The visualizer supports at most 4.' });
    expect(st().applyInput([1, 1], null).ok).toBe(false);
    expect(st().array).toEqual([4, 9]);
    expect(st().applyInput([], null).ok).toBe(true);
    expect(st().steps.at(-1)!.permutations!.permutations).toEqual([[]]);
  });

  it('Randomize always gives distinct values within the limit, whatever size another algorithm left behind', () => {
    st().setAlgorithm('bubble-sort');
    st().setArraySize(12);
    st().setAlgorithm('backtracking-permutations');
    for (let k = 0; k < 200; k++) {
      st().randomizeArray();
      expect(st().array.length).toBeLessThanOrEqual(4);
      expect(new Set(st().array).size).toBe(st().array.length);
      expect(st().executionStatus).toBe('ok');
    }
    st().setArraySize(12);
    expect(st().array).toHaveLength(4);
    expect(st().steps).toHaveLength(600);
  });

  it('another algorithm\'s custom array does not carry in, not even from Subsets, which allows one value more', () => {
    st().setAlgorithm('bubble-sort');
    expect(st().applyInput([5, 5, 1, 2, 3, 4, 8, 9], null).ok).toBe(true);
    st().setAlgorithm('backtracking-permutations');
    expect(st()).toMatchObject({ array: [1, 2, 3], executionStatus: 'ok', inputSource: 'default' });
    st().setAlgorithm('backtracking-subsets');
    expect(st().applyInput([1, 2, 3, 4, 5], null).ok).toBe(true);
    st().setAlgorithm('backtracking-permutations');
    expect(st()).toMatchObject({ array: [1, 2, 3], executionStatus: 'ok', inputSource: 'default' });
    expect(st().steps[0].permutations).toBeDefined();
    expect(st().steps[0].subsets).toBeUndefined();
    st().setAlgorithm('backtracking-subsets');
    expect(st().steps[0].subsets).toBeDefined();
    expect(st().steps[0].permutations).toBeUndefined();
  });

  it('Restore puts a custom input back after Randomize', () => {
    st().setAlgorithm('backtracking-permutations');
    expect(st().applyInput([7, 3], null).ok).toBe(true);
    st().randomizeArray();
    expect(st()).toMatchObject({ inputSource: 'random', inputNotice: { kind: 'replaced-custom', original: [7, 3] } });
    st().restoreOriginalInput();
    expect(st().array).toEqual([7, 3]);
  });
});
