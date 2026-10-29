import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';
import { INT_MAX } from '../../engine/algorithms/numberSearch';

// The visualizer store with the binary searches over whole numbers (Valid Perfect Square, Sqrt(x), Arranging Coins).
const st = () => useVisualizerStore.getState();
const lastStep = () => st().steps[st().steps.length - 1];

beforeEach(() => {
  useVisualizerStore.setState(useVisualizerStore.getInitialState(), true);
});
afterEach(() => vi.restoreAllMocks());

describe('binary searches over whole numbers in the visualizer store', () => {
  it.each([
    ['valid-perfect-square', [16], 'return-true'],
    ['sqrt-x', [8], 'return'],
    ['arranging-coins', [8], 'return'],
  ] as const)('opening %s loads its own example and runs it', (id, input, end) => {
    st().setAlgorithm(id);
    expect(st()).toMatchObject({ array: input, executionStatus: 'ok', currentStepIndex: 0, inputSource: 'default' });
    expect(st().steps[0].codeRef).toBe('fn-entry');
    expect(lastStep().codeRef).toBe(end);
  });

  it('a custom value carries over between the three (one whole number each), re-run for the new algorithm', () => {
    st().setAlgorithm('sqrt-x');
    expect(st().applyInput([26], null).ok).toBe(true);
    expect(lastStep().variables?.ans).toBe(5);
    st().setAlgorithm('valid-perfect-square');
    expect(st()).toMatchObject({ array: [26], executionStatus: 'ok' });
    expect(lastStep().codeRef).toBe('return-false');
    st().setAlgorithm('arranging-coins');
    expect(st()).toMatchObject({ array: [26], executionStatus: 'ok' });
    expect(lastStep().variables?.ans).toBe(6);
  });

  it('values that do not fit (negative, two values, from another algorithm) are shown as invalid, never altered', () => {
    st().setAlgorithm('swap-two-numbers');
    expect(st().applyInput([-3, 12], null).ok).toBe(true);
    st().setAlgorithm('sqrt-x');
    expect(st()).toMatchObject({ array: [-3, 12], executionStatus: 'invalid-input', steps: [] });
    expect(st().inputIssue?.message).toBe('Sqrt(x) takes x (1 value).');

    st().setAlgorithm('prime-check');
    expect(st().applyInput([-5], null).ok).toBe(true);
    st().setAlgorithm('arranging-coins');
    expect(st()).toMatchObject({ array: [-5], executionStatus: 'invalid-input' });
  });

  it('the largest value runs; one more is refused and leaves the running trace alone', () => {
    st().setAlgorithm('valid-perfect-square');
    expect(st().applyInput([INT_MAX], null).ok).toBe(true);
    expect(lastStep().numbers?.result?.kind).toBe('no');
    const r = st().applyInput([INT_MAX + 1], null);
    expect(r.ok).toBe(false);
    expect(st().array).toEqual([INT_MAX]);
    expect(st().executionStatus).toBe('ok');
  });

  it("Randomize picks from the field's small range", () => {
    for (const [id, low, high] of [['valid-perfect-square', 1, 400], ['sqrt-x', 0, 1000], ['arranging-coins', 0, 100]] as const) {
      st().setAlgorithm(id);
      vi.spyOn(Math, 'random').mockReturnValue(0);
      st().randomizeArray();
      expect(st()).toMatchObject({ array: [low], inputSource: 'random', executionStatus: 'ok' });
      vi.spyOn(Math, 'random').mockReturnValue(0.9999);
      st().randomizeArray();
      expect(st().array).toEqual([high]);
      vi.restoreAllMocks();
    }
  });

  it('playback walks the probes in order, and Reset returns to the start', () => {
    st().setAlgorithm('sqrt-x');
    const seen: string[] = [];
    while (st().currentStepIndex < st().steps.length - 1) {
      seen.push(st().steps[st().currentStepIndex].codeRef!);
      st().nextStep();
    }
    expect(seen.slice(0, 5)).toEqual(['fn-entry', 'init', 'loop-condition', 'calc-mid', 'compare']);
    expect(st().steps[st().currentStepIndex].numbers?.result?.text).toBe('Sqrt(8) = 2: 2² = 4 ≤ 8 < 3² = 9.');
    st().previousStep();
    expect(st().steps[st().currentStepIndex].codeRef).toBe('loop-condition');
    st().reset();
    expect(st()).toMatchObject({ currentStepIndex: 0, isPlaying: false });
  });
});
