import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';

// Container With Most Water in the visualizer store: its input rules (at least two heights, none negative) are
// enforced on every path in (opening it, a carried-over custom array, applyInput, Randomize), and playback is unchanged.
const st = () => useVisualizerStore.getState();
const best = () => st().steps.find(s => s.type === 'found')?.variables;

beforeEach(() => {
  useVisualizerStore.setState(useVisualizerStore.getInitialState(), true);
});
afterEach(() => vi.restoreAllMocks());

describe('Container With Most Water in the visualizer store', () => {
  it('opening it loads its own example and runs it', () => {
    st().setAlgorithm('container-most-water');
    expect(st()).toMatchObject({ array: [1, 8, 6, 2, 5, 4, 8, 3, 7], target: null, executionStatus: 'ok', inputSource: 'default' });
    expect(best()).toEqual({ maxArea: 49, bestLeft: 1, bestRight: 8 });
  });

  it('a custom array carries over when it fits, and is shown as invalid (never altered) when it does not', () => {
    st().setAlgorithm('bubble-sort');
    st().applyInput([4, 0, 4], null);
    st().setAlgorithm('container-most-water');
    expect(st()).toMatchObject({ array: [4, 0, 4], executionStatus: 'ok' });
    expect(best()).toEqual({ maxArea: 8, bestLeft: 0, bestRight: 2 });

    st().setAlgorithm('bubble-sort');
    st().applyInput([7, -3, 2], null);
    st().setAlgorithm('container-most-water');
    expect(st()).toMatchObject({ array: [7, -3, 2], executionStatus: 'invalid-input', steps: [] });
    expect(st().inputIssue?.message).toBe('Value 2 (-3) is below 0: Container With Most Water takes values from 0 to 999.');

    st().setAlgorithm('bubble-sort');
    st().applyInput([5], null);
    st().setAlgorithm('container-most-water');
    expect(st().inputIssue?.message).toBe('Container With Most Water needs at least 2 values; got 1.');
    // back on an algorithm without these rules, the same input runs again
    st().setAlgorithm('bubble-sort');
    expect(st().executionStatus).toBe('ok');
  });

  it('applyInput refuses too few or negative heights and keeps the running trace', () => {
    st().setAlgorithm('container-most-water');
    expect(st().applyInput([3, 3], null).ok).toBe(true);
    expect(st().applyInput([3], null)).toMatchObject({ ok: false, message: 'Container With Most Water needs at least 2 values; got 1.' });
    expect(st().applyInput([3, -1], null).ok).toBe(false);
    expect(st()).toMatchObject({ array: [3, 3], executionStatus: 'ok' });
  });

  it('Randomize gives at least two non-negative heights, and Restore brings back a custom array', () => {
    st().setAlgorithm('container-most-water');
    st().applyInput([0, 9, 0, 9], null);
    st().setArraySize(1);
    expect(st().array.length).toBe(2);
    expect(st().array.every(v => v >= 0)).toBe(true);
    expect(st()).toMatchObject({ inputSource: 'random', executionStatus: 'ok' });
    expect(st().inputNotice).toEqual({ kind: 'replaced-custom', original: [0, 9, 0, 9] });
    st().restoreOriginalInput();
    expect(st().array).toEqual([0, 9, 0, 9]);
    for (let k = 0; k < 20; k++) {
      st().randomizeArray();
      expect(st().executionStatus).toBe('ok');
    }
  });

  it('playback: Next, Previous and Reset work as for any other trace', () => {
    st().setAlgorithm('container-most-water');
    st().nextStep();
    st().nextStep();
    expect(st().steps[st().currentStepIndex].codeRef).toBe('while-condition');
    st().previousStep();
    expect(st().steps[st().currentStepIndex].codeRef).toBe('init');
    st().reset();
    expect(st()).toMatchObject({ currentStepIndex: 0, isPlaying: false });
  });
});
