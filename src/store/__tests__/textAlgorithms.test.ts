import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';
import { getAlgorithmDefinition } from '../../engine/AlgorithmRegistry';

// The visualizer store with the text algorithms (input: strings, one per field) next to the array and number ones.
const st = () => useVisualizerStore.getState();

beforeEach(() => {
  useVisualizerStore.setState(useVisualizerStore.getInitialState(), true);
});
afterEach(() => vi.restoreAllMocks());

describe('text algorithms in the visualizer store', () => {
  it('opening one loads its own example strings and runs them; the array stays empty', () => {
    st().setAlgorithm('find-first-occurrence');
    expect(st()).toMatchObject({ array: [], texts: ['sadbutsad', 'sad'], executionStatus: 'ok', currentStepIndex: 0, inputSource: 'default' });
    expect(st().steps[st().steps.length - 1].variables).toEqual({ index: 0 });
    st().setAlgorithm('add-binary');
    expect(st()).toMatchObject({ texts: ['1010', '1011'], executionStatus: 'ok' });
  });

  it('applying strings runs them exactly as typed (spaces kept); invalid strings are refused and change nothing', () => {
    st().setAlgorithm('length-of-last-word');
    expect(st().applyInput([], null, null, null, ['  Hello World  ']).ok).toBe(true);
    expect(st()).toMatchObject({ texts: ['  Hello World  '], inputSource: 'custom', executionStatus: 'ok' });
    expect(st().steps[st().steps.length - 1].variables).toEqual({ length: 5 });
    const before = st().inputRevision;
    const r = st().applyInput([], null, null, null, ['   ']);
    expect(r).toMatchObject({ ok: false, message: '"s" needs at least one word.' });
    expect(st().texts).toEqual(['  Hello World  ']);
    expect(st().inputRevision).toBe(before);
  });

  it('switching never carries strings to another algorithm, nor an array to a text algorithm', () => {
    st().setAlgorithm('bubble-sort');
    expect(st().applyInput([9, 4, 7], null).ok).toBe(true);
    st().setAlgorithm('valid-palindrome');
    expect(st()).toMatchObject({ array: [], texts: ['A man, a plan, a canal: Panama'], inputSource: 'default', executionStatus: 'ok' });
    expect(st().applyInput([], null, null, null, ['race a car']).ok).toBe(true);
    st().setAlgorithm('valid-parentheses');
    expect(st()).toMatchObject({ texts: ['([]){}'], inputSource: 'default' });
    st().setAlgorithm('bubble-sort');
    expect(st()).toMatchObject({ texts: null, executionStatus: 'ok' });
    expect(st().array.length).toBeGreaterThan(0);
  });

  it('Randomize loads another of the algorithm’s examples, keeps custom strings for Restore, and Restore puts them back', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    st().setAlgorithm('roman-to-integer');
    expect(st().applyInput([], null, null, null, ['XLII']).ok).toBe(true);
    st().randomizeArray();
    const examples = getAlgorithmDefinition('roman-to-integer')!.inputSpec!.textExamples!;
    expect(examples.map(e => e[0])).toContain(st().texts![0]);
    expect(st().texts).not.toEqual(['XLII']);
    expect(st()).toMatchObject({ inputSource: 'random', executionStatus: 'ok', inputNotice: { kind: 'replaced-custom', originalTexts: ['XLII'] } });
    st().restoreOriginalInput();
    expect(st()).toMatchObject({ texts: ['XLII'], inputSource: 'custom', inputNotice: null, executionStatus: 'ok' });
  });

  it('Randomize never picks the example already shown', () => {
    st().setAlgorithm('add-binary');
    for (let k = 0; k < 20; k++) {
      const before = st().texts;
      st().randomizeArray();
      expect(st().texts).not.toEqual(before);
      expect(st().executionStatus).toBe('ok');
    }
  });
});
