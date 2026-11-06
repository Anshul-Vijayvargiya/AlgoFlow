import { describe, it, expect, beforeEach } from 'vitest';
import { getAlgorithmDefinition } from '../../engine/AlgorithmRegistry';
import { useVisualizerStore } from '../useVisualizerStore';

// The visualizer store with the bit algorithms: the input is named values, and Randomize picks one of the examples.
const st = () => useVisualizerStore.getState();
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('bit manipulation in the visualizer store', () => {
  it('opening one loads its default values and runs them', () => {
    st().setAlgorithm('bitwise-and');
    expect(st()).toMatchObject({ array: [12, 10], executionStatus: 'ok', inputSource: 'default' });
    expect(st().steps.at(-1)!.outcomeText).toBe('12 & 10 = 8');
  });

  it('custom values at the int32 limits run as typed; invalid ones are refused and change nothing', () => {
    st().setAlgorithm('bitwise-or');
    expect(st().applyInput([2147483647, -2147483648], null).ok).toBe(true);
    expect(st().steps.at(-1)!.outcomeText).toBe('2147483647 | -2147483648 = -1');
    expect(st().applyInput([2147483648, 1], null).ok).toBe(false);
    expect(st().array).toEqual([2147483647, -2147483648]);
    st().setAlgorithm('bit-clear-range');
    expect(st().applyInput([255, 5, 2], null)).toMatchObject({ ok: false, message: '"l" (5) must not be greater than "r" (2).' });
    expect(st().array).toEqual([255, 2, 5]);
  });

  it('Randomize picks one of the examples, another than the current input, and Restore puts a custom input back', () => {
    st().setAlgorithm('bit-set-ith');
    const examples = getAlgorithmDefinition('bit-set-ith')!.inputSpec!.numberExamples!.map(e => JSON.stringify(e));
    for (let k = 0; k < 40; k++) {
      const before = JSON.stringify(st().array);
      st().randomizeArray();
      expect(examples).toContain(JSON.stringify(st().array));
      expect(JSON.stringify(st().array)).not.toBe(before);
      expect(st().executionStatus).toBe('ok');
    }
    expect(st().applyInput([7, 3], null).ok).toBe(true);
    st().randomizeArray();
    expect(st()).toMatchObject({ inputSource: 'random', inputNotice: { kind: 'replaced-custom', original: [7, 3] } });
    st().restoreOriginalInput();
    expect(st().array).toEqual([7, 3]);
  });

  it('a number algorithm without examples still randomizes within its field', () => {
    st().setAlgorithm('swap-two-numbers');
    st().randomizeArray();
    expect(st().array).toHaveLength(2);
    expect(st().array.every(v => v >= 1 && v <= 99)).toBe(true);
  });

  it('switching between bit algorithms loads each one\'s own values, whatever was typed before', () => {
    st().setAlgorithm('bitwise-and');
    expect(st().applyInput([1, 2], null).ok).toBe(true);
    st().setAlgorithm('bit-update-ith');
    expect(st().executionStatus).toBe('ok');
    expect(st().steps.length).toBeGreaterThan(0);
    st().setAlgorithm('bit-clear-range');
    expect(st().executionStatus).toBe('ok');
  });
});
