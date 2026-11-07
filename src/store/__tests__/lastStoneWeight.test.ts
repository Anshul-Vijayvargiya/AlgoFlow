import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';

// The visualizer store with Last Stone Weight: an array input of at most 10 weights from 1 to 999.
const st = () => useVisualizerStore.getState();
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('Last Stone Weight in the visualizer store', () => {
  it('opening it loads the example and runs it', () => {
    st().setAlgorithm('heap-last-stone-weight');
    expect(st()).toMatchObject({ array: [2, 7, 4, 1, 8, 1], executionStatus: 'ok', inputSource: 'default', arraySize: 6 });
    expect(st().steps).toHaveLength(244);
    expect(st().steps.at(-1)!.outcomeText).toBe('The last stone weighs 1');
  });

  it('a custom array runs as typed; 11 stones, 0 or a negative weight are refused and change nothing; [] runs', () => {
    st().setAlgorithm('heap-last-stone-weight');
    expect(st().applyInput([9, 3], null).ok).toBe(true);
    expect(st().steps.at(-1)!.heap!.result!.value).toBe(6);
    expect(st().applyInput([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], null)).toMatchObject({ ok: false, message: 'Too many values (11). The visualizer supports at most 10.' });
    expect(st().applyInput([4, 0], null)).toMatchObject({ ok: false, message: 'Value 2 (0) is below 1: Last Stone Weight takes values from 1 to 999.' });
    expect(st().applyInput([-3], null).ok).toBe(false);
    expect(st().array).toEqual([9, 3]);
    expect(st().applyInput([], null).ok).toBe(true);
    expect(st().steps.at(-1)!.outcomeText).toBe('No stones at all: the answer is 0');
    expect(st().applyInput([999, 1, 1, 1, 1, 1, 1, 1, 1, 1], null).ok).toBe(true);
    expect(st().steps.at(-1)!.heap!.result!.value).toBe(990);
  });

  it('Randomize stays within 10 stones of 1 to 20, whatever size another algorithm left behind', () => {
    st().setAlgorithm('bubble-sort');
    st().setArraySize(16);
    st().setAlgorithm('heap-last-stone-weight');
    for (let k = 0; k < 200; k++) {
      st().randomizeArray();
      expect(st().array.length).toBeLessThanOrEqual(10);
      expect(st().array.every(v => Number.isInteger(v) && v >= 1 && v <= 20)).toBe(true);
      expect(st().executionStatus).toBe('ok');
    }
    st().setArraySize(16);
    expect(st().array).toHaveLength(10);
    expect(st().executionStatus).toBe('ok');
  });

  it("another algorithm's custom array does not carry in: it might be too long or hold 0 or negative values", () => {
    st().setAlgorithm('bubble-sort');
    expect(st().applyInput([5, -2, 0, 9], null).ok).toBe(true);
    st().setAlgorithm('heap-last-stone-weight');
    expect(st()).toMatchObject({ array: [2, 7, 4, 1, 8, 1], executionStatus: 'ok', inputSource: 'default' });
  });

  it('other array algorithms still carry a custom array between them, and Heap Sort runs as before', () => {
    st().setAlgorithm('bubble-sort');
    expect(st().applyInput([5, 5, 1], null).ok).toBe(true);
    st().setAlgorithm('heap-sort');
    expect(st()).toMatchObject({ array: [5, 5, 1], inputSource: 'custom', executionStatus: 'ok' });
    expect(st().steps.at(-1)!.state).toEqual([1, 5, 5]);
  });

  it('Restore puts a custom input back after Randomize', () => {
    st().setAlgorithm('heap-last-stone-weight');
    expect(st().applyInput([7, 3], null).ok).toBe(true);
    st().randomizeArray();
    expect(st()).toMatchObject({ inputSource: 'random', inputNotice: { kind: 'replaced-custom', original: [7, 3] } });
    st().restoreOriginalInput();
    expect(st().array).toEqual([7, 3]);
  });
});
