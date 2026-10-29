import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';

// Merge Sorted Array in the visualizer store: its second array (nums2) goes through every input path — opening it,
// applyInput, "Sort a copy", Randomize, Restore — and other algorithms never get one.
const st = () => useVisualizerStore.getState();
const merged = () => st().steps.at(-1)?.state;

beforeEach(() => {
  useVisualizerStore.setState(useVisualizerStore.getInitialState(), true);
});
afterEach(() => vi.restoreAllMocks());

describe('Merge Sorted Array in the visualizer store', () => {
  it('opening it loads its example: nums1 [1, 2, 3], nums2 [2, 5, 6]; Size counts both', () => {
    st().setAlgorithm('merge-sorted-array');
    expect(st()).toMatchObject({ array: [1, 2, 3], second: [2, 5, 6], target: null, executionStatus: 'ok', inputSource: 'default', arraySize: 6 });
    expect(merged()).toEqual([1, 2, 2, 3, 5, 6]);
  });

  it('other algorithms have no second array, before and after visiting it', () => {
    expect(st().second).toBeNull();
    st().setAlgorithm('merge-sorted-array');
    st().setAlgorithm('two-sum');
    expect(st().second).toBeNull();
    expect(st().executionStatus).toBe('ok');
  });

  it('a custom array carries over as nums1 (with the example nums2) and is re-validated', () => {
    st().setAlgorithm('bubble-sort');
    st().applyInput([1, 4, 9], null);
    st().setAlgorithm('merge-sorted-array');
    expect(st()).toMatchObject({ array: [1, 4, 9], second: [2, 5, 6], executionStatus: 'ok' });
    expect(merged()).toEqual([1, 2, 4, 5, 6, 9]);

    st().setAlgorithm('bubble-sort');
    st().applyInput([9, 1], null);
    st().setAlgorithm('merge-sorted-array');
    expect(st()).toMatchObject({ array: [9, 1], executionStatus: 'invalid-input' });
    expect(st().inputIssue).toEqual({
      message: 'Merge Sorted Array needs nums1 sorted in ascending order, but index 0 (9) is greater than index 1 (1).',
      canSortCopy: true,
    });
  });

  it('applyInput takes both arrays (m = 0 and n = 0 included); an invalid pair is refused and the trace kept', () => {
    st().setAlgorithm('merge-sorted-array');
    expect(st().applyInput([], null, null, [3, 4]).ok).toBe(true);
    expect(merged()).toEqual([3, 4]);
    expect(st().applyInput([-2, 7], null, null, []).ok).toBe(true);
    expect(merged()).toEqual([-2, 7]);
    expect(st().applyInput([1], null, null, [5, 2])).toMatchObject({ ok: false, field: 'second' });
    expect(st().applyInput(Array(9).fill(1), null, null, Array(8).fill(2)).ok).toBe(false);
    expect(st()).toMatchObject({ array: [-2, 7], second: [] });
  });

  it('"Sort a copy" sorts both arrays as copies and keeps both originals for Restore', () => {
    st().setAlgorithm('merge-sorted-array');
    expect(st().sortInputCopy([3, 1], null, [9, 2, 5]).ok).toBe(true);
    expect(st()).toMatchObject({ array: [1, 3], second: [2, 5, 9], executionStatus: 'ok' });
    expect(st().inputNotice).toEqual({ kind: 'sorted-copy', original: [3, 1], originalSecond: [9, 2, 5] });
    st().restoreOriginalInput();
    expect(st()).toMatchObject({ array: [3, 1], second: [9, 2, 5], executionStatus: 'invalid-input' });
  });

  it('Randomize splits the size between two sorted arrays; Restore brings both custom arrays back', () => {
    st().setAlgorithm('merge-sorted-array');
    st().applyInput([1, 1], null, null, [0]);
    for (let t = 0; t < 30; t++) {
      st().setArraySize(10);
      const { array, second } = st();
      expect(array.length + second!.length).toBe(10);
      for (const a of [array, second!]) expect(a).toEqual([...a].sort((x, y) => x - y));
      expect(st().executionStatus).toBe('ok');
      expect(merged()).toEqual([...array, ...second!].sort((x, y) => x - y));
    }
    expect(st().inputNotice).toEqual({ kind: 'replaced-custom', original: [1, 1], originalSecond: [0] });
    st().restoreOriginalInput();
    expect(st()).toMatchObject({ array: [1, 1], second: [0] });
  });

  it('playback: Next, Previous and Reset work as for any other trace', () => {
    st().setAlgorithm('merge-sorted-array');
    st().nextStep();
    st().nextStep();
    expect(st().steps[st().currentStepIndex].codeRef).toBe('loop-condition');
    st().previousStep();
    expect(st().steps[st().currentStepIndex].codeRef).toBe('init-pointers');
    st().reset();
    expect(st()).toMatchObject({ currentStepIndex: 0, isPlaying: false });
  });
});
