import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';
import { PRIME_MAX } from '../../engine/algorithms/primeCheck';

// The visualizer store with the number algorithms (input: [n]; [a, b]) next to the array and list ones.
const st = () => useVisualizerStore.getState();

beforeEach(() => {
  useVisualizerStore.setState(useVisualizerStore.getInitialState(), true);
});
afterEach(() => vi.restoreAllMocks());

describe('number algorithms in the visualizer store', () => {
  it("opening one loads its own example and runs it", () => {
    st().setAlgorithm('prime-check');
    expect(st()).toMatchObject({ array: [29], executionStatus: 'ok', currentStepIndex: 0, inputSource: 'default' });
    st().setAlgorithm('swap-two-numbers');
    expect(st()).toMatchObject({ array: [5, 9], executionStatus: 'ok' });
    expect(st().steps.map(s => s.codeRef)).toEqual(['fn-entry', 'assign-temp', 'assign-a', 'assign-b', 'fn-exit']);
  });

  it('a custom array is never reused as n (or a, b), and custom values are never reused as an array', () => {
    st().setAlgorithm('bubble-sort');
    expect(st().applyInput([9, 4, 7, 1, 8, 2], null).ok).toBe(true);
    st().setAlgorithm('prime-check');
    expect(st()).toMatchObject({ array: [29], executionStatus: 'ok', inputSource: 'default' });
    expect(st().applyInput([97], null).ok).toBe(true);
    st().setAlgorithm('bubble-sort');
    expect(st().array).not.toEqual([97]);
    expect(st().executionStatus).toBe('ok');
  });

  it('custom values carry over between number algorithms only when they fit (re-validated, never altered)', () => {
    st().setAlgorithm('swap-two-numbers');
    expect(st().applyInput([3, 4], null).ok).toBe(true);
    st().setAlgorithm('prime-check');
    // [3, 4] is not one value n: shown as invalid input, exactly as entered
    expect(st()).toMatchObject({ array: [3, 4], executionStatus: 'invalid-input', steps: [] });
    expect(st().inputIssue?.message).toBe('Prime Number Checker takes n (1 value).');
  });

  it('array ↔ linked list keeps a custom input as before', () => {
    st().setAlgorithm('bubble-sort');
    st().applyInput([4, 1, 3], null);
    st().setAlgorithm('ll-traverse');
    expect(st().array).toEqual([4, 1, 3]);
  });

  it('applyInput validates the values (whole numbers within the field range)', () => {
    st().setAlgorithm('prime-check');
    expect(st().applyInput([PRIME_MAX], null).ok).toBe(true);
    expect(st().steps.at(-1)?.numbers?.result?.kind).toBe('not-prime');
    expect(st().applyInput([PRIME_MAX + 1], null)).toMatchObject({ ok: false, message: '"n" (10001) is out of range — use values from -999 to 10000.' });
    // a refused input leaves the running trace alone
    expect(st().array).toEqual([PRIME_MAX]);
  });

  it('Randomize picks values from each field\'s range and keeps the custom ones for Restore', () => {
    st().setAlgorithm('swap-two-numbers');
    st().applyInput([-500, 700], null);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    st().randomizeArray();
    expect(st()).toMatchObject({ array: [1, 1], inputSource: 'random', executionStatus: 'ok' });
    expect(st().inputNotice).toEqual({ kind: 'replaced-custom', original: [-500, 700] });
    st().restoreOriginalInput();
    expect(st().array).toEqual([-500, 700]);

    st().setAlgorithm('prime-check');
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    st().randomizeArray();
    expect(st().array).toEqual([200]);
  });

  it('playback (Next, Previous, Reset) works on the number traces like any other', () => {
    st().setAlgorithm('swap-two-numbers');
    st().nextStep();
    st().nextStep();
    expect(st().steps[st().currentStepIndex].codeRef).toBe('assign-a');
    st().previousStep();
    expect(st().steps[st().currentStepIndex].codeRef).toBe('assign-temp');
    st().reset();
    expect(st()).toMatchObject({ currentStepIndex: 0, isPlaying: false });
  });
});
