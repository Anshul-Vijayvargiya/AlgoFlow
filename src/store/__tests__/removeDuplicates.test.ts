import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';

// Remove Duplicates from Sorted Array in the visualizer store: sorted input is required (never sorted silently, "Sort
// a copy" on request), Randomize draws sorted values from 1 to 9, and playback is unchanged.
const st = () => useVisualizerStore.getState();
const unique = () => st().steps.at(-1)?.variables?.unique;

beforeEach(() => {
  useVisualizerStore.setState(useVisualizerStore.getInitialState(), true);
});
afterEach(() => vi.restoreAllMocks());

describe('Remove Duplicates in the visualizer store', () => {
  it('opening it loads its own example and runs it', () => {
    st().setAlgorithm('remove-duplicates-sorted');
    expect(st()).toMatchObject({ array: [1, 1, 2, 2, 3], target: null, executionStatus: 'ok', inputSource: 'default' });
    expect(unique()).toBe(3);
  });

  it('an unsorted custom array is never reordered: invalid input, then "Sort a copy" runs on a sorted copy', () => {
    st().setAlgorithm('bubble-sort');
    st().applyInput([3, 1, 3, 2], null);
    st().setAlgorithm('remove-duplicates-sorted');
    expect(st()).toMatchObject({ array: [3, 1, 3, 2], executionStatus: 'invalid-input', steps: [] });
    expect(st().inputIssue?.message).toBe(
      'Remove Duplicates from Sorted Array needs an array sorted in ascending order, but index 0 (3) is greater than index 1 (1).'
    );
    expect(st().sortInputCopy().ok).toBe(true);
    expect(st()).toMatchObject({ array: [1, 2, 3, 3], executionStatus: 'ok' });
    expect(st().inputNotice).toEqual({ kind: 'sorted-copy', original: [3, 1, 3, 2] });
    expect(unique()).toBe(3);
  });

  it('applyInput: a sorted array with repeats runs; an unsorted one is refused and the trace is kept', () => {
    st().setAlgorithm('remove-duplicates-sorted');
    expect(st().applyInput([-2, -2, 0, 5, 5, 5], null).ok).toBe(true);
    expect(unique()).toBe(3);
    expect(st().applyInput([2, 1], null).ok).toBe(false);
    expect(st().array).toEqual([-2, -2, 0, 5, 5, 5]);
  });

  it('Randomize gives sorted values from 1 to 9 (so repeats are common); Restore brings a custom array back', () => {
    st().setAlgorithm('remove-duplicates-sorted');
    st().applyInput([4, 4, 4], null);
    for (let k = 0; k < 30; k++) {
      st().setArraySize(12);
      const a = st().array;
      expect(a).toHaveLength(12);
      expect(a.every(v => v >= 1 && v <= 9)).toBe(true);
      expect(a).toEqual([...a].sort((x, y) => x - y));
      expect(st().executionStatus).toBe('ok');
    }
    expect(st().inputNotice).toEqual({ kind: 'replaced-custom', original: [4, 4, 4] });
    st().restoreOriginalInput();
    expect(st().array).toEqual([4, 4, 4]);
  });

  it('other algorithms still randomize from 10 to 94', () => {
    st().setAlgorithm('bubble-sort');
    // the lowest draw, then the highest: exactly the old range's ends (Bubble Sort keeps the order)
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValue(0.9999);
    st().setArraySize(5);
    expect(st().array).toEqual([10, 94, 94, 94, 94]);
  });

  it('playback: Next, Previous and Reset work as for any other trace', () => {
    st().setAlgorithm('remove-duplicates-sorted');
    st().nextStep();
    st().nextStep();
    expect(st().steps[st().currentStepIndex].codeRef).toBe('init-slow');
    st().previousStep();
    expect(st().steps[st().currentStepIndex].codeRef).toBe('check-empty');
    st().reset();
    expect(st()).toMatchObject({ currentStepIndex: 0, isPlaying: false });
  });
});
