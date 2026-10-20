import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';
import { getAlgorithmDefinition } from '../../engine/AlgorithmRegistry';
import { MAX_ARRAY_SIZE } from '../../engine/inputParsing';
import type { AlgorithmId } from '../../types/algorithm';

const st = () => useVisualizerStore.getState();
const gen = (id: AlgorithmId, input: number[], target?: number) =>
  getAlgorithmDefinition(id)!.generateSteps([...input], target === undefined ? undefined : { target });

beforeEach(() => {
  // true reset: the store is a module singleton, so custom input from one test must not leak into the next
  useVisualizerStore.setState(useVisualizerStore.getInitialState(), true);
});

describe('generators never reorder the user\'s array', () => {
  const USER = [9, -3, 9, 0, 5, -3, 12];

  it('Linear Search keeps the exact input order in every step and reports the FIRST occurrence', () => {
    const steps = gen('linear-search', USER, 9);
    for (const s of steps) expect(s.state).toEqual(USER);
    expect(steps.find(s => s.type === 'found')!.variables!.foundIndex).toBe(0);
    const t2 = gen('linear-search', USER, -3);
    expect(t2.find(s => s.type === 'found')!.variables!.foundIndex).toBe(1);
    // order of examination is the array's own order
    const examined = t2.filter(s => s.codeRef === 'compare-target').map(s => s.pointers!.i);
    expect(examined).toEqual([0, 1]);
  });

  it('Linear Search handles negative and zero targets and a missing target', () => {
    expect(gen('linear-search', USER, 0).find(s => s.type === 'found')!.variables!.foundIndex).toBe(3);
    expect(gen('linear-search', USER, 12).find(s => s.type === 'found')!.variables!.foundIndex).toBe(6);
    expect(gen('linear-search', USER, 100).some(s => s.type === 'not-found')).toBe(true);
    expect(gen('linear-search', [], 5).some(s => s.type === 'not-found')).toBe(true);
  });

  it('Binary Search and Two Pointer use the array exactly as given — they no longer sort it', () => {
    const asc = [-5, -1, 0, 3, 3, 8];
    for (const s of gen('binary-search', asc, 3)) expect(s.state).toEqual(asc);
    for (const s of gen('two-pointer', asc, 3)) expect(s.state).toEqual(asc);
    // direct call with UNSORTED input: still the user's order (a faithful trace of the code), plus a warning
    const unsorted = [5, 1, 4, 2];
    const steps = gen('binary-search', unsorted, 4);
    for (const s of steps) expect(s.state).toEqual(unsorted);
    expect(steps[0].explanation).toMatch(/NOT sorted/);
    for (const s of gen('two-pointer', unsorted, 6)) expect(s.state).toEqual(unsorted);
  });

  it('Binary Search works for every position, absent targets, negatives, duplicates, single and empty arrays', () => {
    const a = [-9, -4, 0, 2, 2, 7, 11];
    for (const [i, v] of a.entries()) {
      const found = gen('binary-search', a, v).find(s => s.type === 'found')!;
      expect(a[found.variables!.foundIndex as number], `target ${v}`).toBe(v);
      void i;
    }
    for (const miss of [-100, -5, 1, 100]) expect(gen('binary-search', a, miss).some(s => s.type === 'not-found'), `${miss}`).toBe(true);
    expect(gen('binary-search', [5], 5).some(s => s.type === 'found')).toBe(true);
    expect(gen('binary-search', [5], -5).some(s => s.type === 'not-found')).toBe(true);
    expect(gen('binary-search', [], 5).some(s => s.type === 'not-found')).toBe(true);
  });

  it('Two Pointer: documented semantics = two different positions left < right whose values sum to the target', () => {
    const a = [-4, -1, 2, 2, 6, 9];
    const f = gen('two-pointer', a, 8).find(s => s.type === 'found')!; // 2 + 6
    const { left, right } = f.variables as { left: number; right: number };
    expect(left).toBeLessThan(right);
    expect(a[left] + a[right]).toBe(8);
    const dup = gen('two-pointer', [2, 2, 3], 4).find(s => s.type === 'found')!; // duplicates: two equal values at distinct indexes
    expect([dup.variables!.left, dup.variables!.right]).toEqual([0, 1]);
    expect(gen('two-pointer', [3], 6).some(s => s.type === 'not-found')).toBe(true); // an element cannot pair with itself
    expect(gen('two-pointer', a, 1000).some(s => s.type === 'not-found')).toBe(true);
    expect(gen('two-pointer', a, 5).find(s => s.type === 'found')).toBeDefined(); // -1 + 6
    expect(gen('two-pointer', [], 0).some(s => s.type === 'not-found')).toBe(true);
  });

  it('every sorting algorithm sorts a COPY: the caller\'s array is untouched, even with negatives/duplicates', () => {
    for (const id of ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort', 'heap-sort'] as AlgorithmId[]) {
      const user = [3, -1, 3, 0, -8, 2];
      const copy = [...user];
      const steps = getAlgorithmDefinition(id)!.generateSteps(user);
      expect(user, id).toEqual(copy);
      expect(steps[0].state, id).toEqual(copy); // the trace starts from the user's order
      expect(steps[steps.length - 1].state, id).toEqual([-8, -1, 0, 2, 3, 3]);
    }
  });
});

describe('applyInput — regenerates safely', () => {
  it('Linear Search with a custom array and target: trace is generated from exactly those values', () => {
    st().setAlgorithm('linear-search');
    const r = st().applyInput([4, 2, 9, 7, 5, 1, 8], 7);
    expect(r.ok).toBe(true);
    expect(st().array).toEqual([4, 2, 9, 7, 5, 1, 8]);
    expect(st().target).toBe(7);
    expect(st().steps).toEqual(gen('linear-search', [4, 2, 9, 7, 5, 1, 8], 7));
    expect(st().inputSource).toBe('custom');
    expect(st().executionStatus).toBe('ok');
  });

  it('the target actually reaches the generator: different targets give different traces', () => {
    st().setAlgorithm('linear-search');
    st().applyInput([4, 2, 9, 7], 4);
    const first = st().steps.length;
    st().applyInput([4, 2, 9, 7], 7);
    const last = st().steps.length;
    st().applyInput([4, 2, 9, 7], 100);
    expect(first).toBeLessThan(last);
    expect(st().steps.some(s => s.type === 'not-found')).toBe(true);
    expect(st().steps[0].variables!.target).toBe(100);
  });

  it('resets position, playback, highlights and completion; recomputes the step count', () => {
    st().setAlgorithm('bubble-sort');
    st().setCurrentStepIndex(st().steps.length - 1);
    st().play();
    expect(st().isPlaying).toBe(true);
    const revision = st().inputRevision;
    st().applyInput([3, 1, 2], null);
    expect(st().currentStepIndex).toBe(0);
    expect(st().isPlaying).toBe(false);
    expect(st().steps).toEqual(gen('bubble-sort', [3, 1, 2]));
    expect(st().steps.length).not.toBe(65);
    expect(st().arraySize).toBe(3);
    expect(st().inputRevision).toBeGreaterThan(revision);
  });

  it('keeps the selected algorithm and language', () => {
    st().setAlgorithm('quick-sort');
    st().setLanguage('python');
    st().applyInput([5, 4, 3], null);
    expect(st().selectedAlgorithm).toBe('quick-sort');
    expect(st().selectedLanguage).toBe('python');
  });

  it('an invalid input is rejected and leaves the current trace untouched', () => {
    st().setAlgorithm('binary-search');
    const before = st().steps;
    const r = st().applyInput([5, 1, 4], 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.canSortCopy).toBe(true);
    expect(st().steps).toBe(before);
    expect(st().array).not.toEqual([5, 1, 4]);
    expect(st().applyInput(Array(MAX_ARRAY_SIZE + 1).fill(1), null).ok).toBe(false);
    st().setAlgorithm('linear-search');
    expect(st().applyInput([1, 2], null).ok).toBe(false); // target required
  });

  it('rapid consecutive changes can only leave the LAST result visible', () => {
    st().setAlgorithm('linear-search');
    const inputs: [number[], number][] = [
      [[1, 2, 3], 1],
      [[9, 8], 9],
      [[5, 5, 5, 5], 5],
      [[7], 7],
      [[4, 2, 9, 7, 5, 1, 8], 7],
    ];
    for (const [a, t] of inputs) st().applyInput(a, t);
    const [a, t] = inputs[inputs.length - 1];
    expect(st().array).toEqual(a);
    expect(st().steps).toEqual(gen('linear-search', a, t));
    expect(st().currentStepIndex).toBe(0);
  });

  it('works for empty and single-element arrays for every algorithm', () => {
    const ids: AlgorithmId[] = ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort', 'heap-sort', 'linear-search', 'binary-search', 'two-pointer'];
    for (const id of ids) {
      st().setAlgorithm(id);
      const t = getAlgorithmDefinition(id)!.inputSpec?.target ? 3 : null;
      expect(st().applyInput([], t).ok, `${id} empty`).toBe(true);
      expect(st().executionStatus).toBe('ok');
      expect(st().steps[0].state).toEqual([]);
      expect(st().applyInput([3], t).ok, `${id} single`).toBe(true);
      expect(st().steps[0].state).toEqual([3]);
    }
  });
});

describe('switching algorithms with a custom array', () => {
  it('retains the custom array and re-validates it against the new algorithm', () => {
    st().setAlgorithm('bubble-sort');
    st().applyInput([5, 1, 4, 2], null);
    st().setAlgorithm('quick-sort');
    expect(st().array).toEqual([5, 1, 4, 2]);
    expect(st().steps[0].state).toEqual([5, 1, 4, 2]);
    expect(st().steps).toEqual(gen('quick-sort', [5, 1, 4, 2]));
    expect(st().currentStepIndex).toBe(0);
  });

  it('custom unsorted array → Binary Search: explicit invalid-input state, no trace, array untouched', () => {
    st().applyInput([5, 1, 4, 2], null);
    st().setAlgorithm('binary-search');
    expect(st().executionStatus).toBe('invalid-input');
    expect(st().steps).toEqual([]);
    expect(st().array).toEqual([5, 1, 4, 2]);
    expect(st().inputIssue).toMatchObject({ canSortCopy: true });
    expect(st().inputIssue!.message).toContain('Binary Search');
    expect(st().resolveCurrentLine()).toBeNull();
    expect(st().executionError).toBeNull();
    // never another algorithm's trace
    expect(st().steps.some(s => s.codeRef)).toBe(false);
  });

  it('Sort a copy is explicit: sorted copy in, original kept in a notice, Restore puts it back', () => {
    st().applyInput([5, 1, 4, 2], null);
    st().setAlgorithm('binary-search');
    const r = st().sortInputCopy();
    expect(r.ok).toBe(true);
    expect(st().array).toEqual([1, 2, 4, 5]);
    expect(st().inputNotice).toEqual({ kind: 'sorted-copy', original: [5, 1, 4, 2] });
    expect(st().executionStatus).toBe('ok');
    expect(st().steps).toEqual(gen('binary-search', [1, 2, 4, 5], st().target!));
    st().restoreOriginalInput();
    expect(st().array).toEqual([5, 1, 4, 2]);
    expect(st().inputNotice).toBeNull();
    expect(st().executionStatus).toBe('invalid-input'); // original is unsorted, so Binary Search still needs input attention
  });

  it('Sort a copy uses the target the user typed, not the previously applied one', () => {
    st().setAlgorithm('binary-search');
    st().applyInput([1, 2, 3], 3); // previously applied target = 3
    const r = st().sortInputCopy([9, 4, 6], 4); // draft: unsorted array, target 4
    expect(r.ok).toBe(true);
    expect(st().array).toEqual([4, 6, 9]);
    expect(st().target).toBe(4);
    expect(st().steps[0].variables!.target).toBe(4);
    expect(st().steps).toEqual(gen('binary-search', [4, 6, 9], 4));
  });

  it('custom array → Linear Search keeps the order and adopts the default target (editable)', () => {
    st().applyInput([9, 3, 9], null);
    st().setAlgorithm('linear-search');
    expect(st().array).toEqual([9, 3, 9]);
    expect(st().target).toBe(getAlgorithmDefinition('linear-search')!.inputSpec!.target!.defaultValue);
    for (const s of st().steps) expect(s.state).toEqual([9, 3, 9]);
  });

  it('a custom target survives switching between search algorithms', () => {
    st().setAlgorithm('linear-search');
    st().applyInput([1, 2, 3, 4], 3);
    st().setAlgorithm('binary-search');
    expect(st().target).toBe(3);
    expect(st().steps[0].variables!.target).toBe(3);
  });

  it('default/random arrays are replaced by the new algorithm\'s own default example (no custom input to retain)', () => {
    st().setAlgorithm('merge-sort');
    st().setAlgorithm('binary-search');
    expect(st().array).toEqual(getAlgorithmDefinition('binary-search')!.defaultInput);
    expect(st().inputSource).toBe('default');
    expect(st().executionStatus).toBe('ok');
  });

  it('retains the custom array across an unimplemented algorithm', () => {
    st().applyInput([8, 6, 7], null);
    st().setAlgorithm('jump-search');
    expect(st().executionStatus).toBe('unimplemented');
    expect(st().array).toEqual([8, 6, 7]);
    st().setAlgorithm('bubble-sort');
    expect(st().steps[0].state).toEqual([8, 6, 7]);
  });

  it('switching clears position, playback and any previous error', () => {
    st().setAlgorithm('merge-sort');
    st().setCurrentStepIndex(20);
    st().play();
    st().setAlgorithm('quick-sort');
    expect(st().currentStepIndex).toBe(0);
    expect(st().isPlaying).toBe(false);
    expect(st().executionError).toBeNull();
    expect(st().inputIssue).toBeNull();
  });
});

describe('Randomize and Size with custom input', () => {
  it('replace a custom array visibly (notice) and Restore brings it back; the target is unchanged', () => {
    st().setAlgorithm('linear-search');
    st().applyInput([4, 2, 9, 7], 9);
    st().randomizeArray();
    expect(st().inputSource).toBe('random');
    expect(st().array).toHaveLength(4); // randomize keeps the current size
    expect(st().inputNotice).toEqual({ kind: 'replaced-custom', original: [4, 2, 9, 7] });
    expect(st().target).toBe(9);
    st().restoreOriginalInput();
    expect(st().array).toEqual([4, 2, 9, 7]);
    expect(st().inputSource).toBe('custom');
    expect(st().inputNotice).toBeNull();
    expect(st().steps).toEqual(gen('linear-search', [4, 2, 9, 7], 9));
  });

  it('the notice survives repeated randomizing so the original stays recoverable', () => {
    st().setAlgorithm('bubble-sort');
    st().applyInput([3, 2, 1], null);
    st().randomizeArray();
    st().randomizeArray();
    st().setArraySize(10);
    expect(st().array).toHaveLength(10);
    expect(st().inputNotice).toEqual({ kind: 'replaced-custom', original: [3, 2, 1] });
  });

  it('no notice when nothing custom was replaced', () => {
    st().setAlgorithm('bubble-sort');
    st().randomizeArray();
    expect(st().inputNotice).toBeNull();
  });

  it('Size and Randomize produce ASCENDING arrays for algorithms that require sorted input', () => {
    for (const id of ['binary-search', 'two-pointer'] as AlgorithmId[]) {
      st().setAlgorithm(id);
      for (let k = 0; k < 5; k++) {
        st().randomizeArray();
        expect(st().array, id).toEqual([...st().array].sort((a, b) => a - b));
        expect(st().executionStatus, id).toBe('ok');
      }
      st().setArraySize(12);
      expect(st().array).toHaveLength(12);
    }
  });

  it('Size is clamped to the maximum', () => {
    st().setAlgorithm('bubble-sort');
    st().setArraySize(500);
    expect(st().array).toHaveLength(MAX_ARRAY_SIZE);
  });

  it('the displayed size always equals the real array length', () => {
    st().setAlgorithm('bubble-sort');
    st().applyInput([1, 2, 3, 4, 5, 6, 7, 8, 9], null);
    expect(st().arraySize).toBe(9);
    st().applyInput([], null);
    expect(st().arraySize).toBe(0);
  });
});

describe('playback regression', () => {
  it('Play at the last step restarts from step 1 and plays (was: did nothing)', () => {
    st().setCurrentStepIndex(st().steps.length - 1);
    st().togglePlay();
    expect(st().currentStepIndex).toBe(0);
    expect(st().isPlaying).toBe(true);
    st().pause();
    st().setCurrentStepIndex(st().steps.length - 1);
    st().play();
    expect(st().currentStepIndex).toBe(0);
    expect(st().isPlaying).toBe(true);
  });

  it('Play mid-trace continues from the current step; Pause keeps the position', () => {
    st().setCurrentStepIndex(5);
    st().togglePlay();
    expect(st().currentStepIndex).toBe(5);
    expect(st().isPlaying).toBe(true);
    st().togglePlay();
    expect(st().isPlaying).toBe(false);
    expect(st().currentStepIndex).toBe(5);
  });

  it('Next at the last step stops playback without wrapping', () => {
    st().setCurrentStepIndex(st().steps.length - 1);
    st().nextStep();
    expect(st().currentStepIndex).toBe(st().steps.length - 1);
    expect(st().isPlaying).toBe(false);
  });

  it('Play with no trace (invalid input) is a no-op', () => {
    st().applyInput([5, 1, 4], null);
    st().setAlgorithm('binary-search');
    expect(st().executionStatus).toBe('invalid-input');
    st().play();
    st().togglePlay();
    expect(st().isPlaying).toBe(false);
    expect(st().currentStepIndex).toBe(0);
    st().nextStep();
    st().previousStep();
    expect(st().currentStepIndex).toBe(0);
  });

  it('changing input during playback stops it and starts the new trace at step 1', () => {
    st().setCurrentStepIndex(3);
    st().play();
    st().applyInput([2, 1], null);
    expect(st().isPlaying).toBe(false);
    expect(st().currentStepIndex).toBe(0);
    expect(st().steps).toEqual(gen('bubble-sort', [2, 1]));
  });

  it('Next/Previous/Reset behave on the regenerated trace', () => {
    st().applyInput([2, 1, 3], null);
    const steps = gen('bubble-sort', [2, 1, 3]);
    st().nextStep(); st().nextStep(); st().nextStep();
    expect(st().steps[st().currentStepIndex]).toEqual(steps[3]);
    st().previousStep();
    expect(st().steps[st().currentStepIndex]).toEqual(steps[2]);
    st().reset();
    expect(st().currentStepIndex).toBe(0);
    expect(st().steps[0]).toEqual(steps[0]);
  });

  it('changing language keeps the position of the regenerated trace', () => {
    st().applyInput([2, 1, 3], null);
    st().setCurrentStepIndex(6);
    st().setLanguage('java');
    st().setLanguage('python');
    expect(st().currentStepIndex).toBe(6);
    expect(vi.isMockFunction(console.error)).toBe(false);
  });
});

// Audit R2: the target the user applies is exactly the target the trace uses and displays, including 0.
describe('Two Pointer: applied target and trace target agree (audit R2)', () => {
  it('target 0: the store keeps 0, the trace searches for 0 and finds the pair', () => {
    st().setAlgorithm('two-pointer');
    expect(st().applyInput([-3, 1, 3], 0)).toEqual({ ok: true });
    expect(st().target).toBe(0);
    expect(st().steps[0].variables!.target).toBe(0);
    expect(st().steps[0].message).toBe('Initialize Two-Pointer Pair Sum — target sum = 0');
    expect(st().steps.find(s => s.type === 'found')!.indices).toEqual([0, 2]);
  });

  it('a missing target is rejected before the generator runs; the previous trace stays', () => {
    st().setAlgorithm('two-pointer');
    st().applyInput([-3, 1, 3], 0);
    const before = st().steps;
    expect(st().applyInput([-3, 1, 3], null)).toEqual({ ok: false, canSortCopy: false, message: 'Enter a value for "Target sum".' });
    expect(st().steps).toBe(before);
    expect(st().target).toBe(0);
  });
});

// Phase 2 linked-list operations: the store passes { value } to the generator and enforces the node limits.
describe('linked-list operations in the store', () => {
  const genList = (id: AlgorithmId, input: number[], value?: number) =>
    getAlgorithmDefinition(id)!.generateSteps([...input], value === undefined ? undefined : { value });

  it('selecting an operation loads its default list and value; the index is unused', () => {
    st().setAlgorithm('ll-search');
    expect(st().array).toEqual([4, 7, 1, 7, 9]);
    expect(st().target).toBe(7);
    expect(st().index).toBeNull();
    expect(st().executionStatus).toBe('ok');
    expect(st().steps).toEqual(genList('ll-search', [4, 7, 1, 7, 9], 7));
    st().setAlgorithm('ll-traverse');
    expect(st().target).toBeNull();
    expect(st().steps).toEqual(genList('ll-traverse', st().array));
  });

  it('the applied value reaches the generator (Search, Insert at Head, Insert at Tail)', () => {
    st().setAlgorithm('ll-search');
    expect(st().applyInput([3, 3, 1], 1).ok).toBe(true);
    expect(st().steps).toEqual(genList('ll-search', [3, 3, 1], 1));
    expect(st().steps[st().steps.length - 1].variables!.result).toBe(2);
    for (const id of ['ll-insert-head', 'll-insert-tail'] as const) {
      st().setAlgorithm(id);
      expect(st().applyInput([5, 6], 0).ok).toBe(true);
      const last = st().steps[st().steps.length - 1];
      expect(last.state).toEqual(id === 'll-insert-head' ? [0, 5, 6] : [5, 6, 0]);
    }
  });

  it('empty and single-node lists are accepted by every operation', () => {
    for (const id of ['ll-traverse', 'll-search', 'll-insert-head', 'll-insert-tail', 'll-delete-head', 'll-delete-tail'] as const) {
      st().setAlgorithm(id);
      for (const input of [[], [5]]) {
        const needsValue = id === 'll-search' || id === 'll-insert-head' || id === 'll-insert-tail';
        expect(st().applyInput(input, needsValue ? 5 : null).ok, `${id} ${JSON.stringify(input)}`).toBe(true);
        expect(st().executionStatus).toBe('ok');
      }
    }
  });

  it('node limits: 10 nodes, or 9 when the operation adds one; Size is clamped to the same limit', () => {
    st().setAlgorithm('ll-traverse');
    expect(st().applyInput(Array(10).fill(1), null).ok).toBe(true);
    expect(st().applyInput(Array(11).fill(1), null)).toMatchObject({ ok: false, message: 'Too many nodes (11). The visualizer shows at most 10.' });
    st().setArraySize(50);
    expect(st().array).toHaveLength(10);

    st().setAlgorithm('ll-insert-tail');
    const before = st().steps;
    expect(st().applyInput(Array(10).fill(1), 3).ok).toBe(false);
    expect(st().steps).toBe(before);
    expect(st().applyInput(Array(9).fill(1), 3).ok).toBe(true);
    st().setArraySize(50);
    expect(st().array).toHaveLength(9);
  });

  it('a missing value is rejected before the generator runs; the previous trace stays', () => {
    st().setAlgorithm('ll-insert-head');
    const before = st().steps;
    expect(st().applyInput([1, 2], null)).toMatchObject({ ok: false });
    expect(st().steps).toBe(before);
  });
});

// Phase 3: Insert / Delete at Position take an index as well; Build and Reverse take only the list.
describe('linked-list positions in the store', () => {
  const genAt = (id: AlgorithmId, input: number[], params: Record<string, unknown>) => getAlgorithmDefinition(id)!.generateSteps([...input], params);

  it('selecting Insert / Delete at Position loads the default list, value and position', () => {
    st().setAlgorithm('ll-insert-at');
    expect([st().array, st().target, st().index]).toEqual([[4, 7, 9], 5, 2]);
    expect(st().steps).toEqual(genAt('ll-insert-at', [4, 7, 9], { value: 5, index: 2 }));
    st().setAlgorithm('ll-delete-at');
    expect([st().array, st().target, st().index]).toEqual([[4, 7, 1, 9], null, 2]);
    expect(st().steps).toEqual(genAt('ll-delete-at', [4, 7, 1, 9], { index: 2 }));
    for (const id of ['ll-build', 'reverse-linked-list'] as const) {
      st().setAlgorithm(id);
      expect(st().index).toBeNull();
      expect(st().executionStatus).toBe('ok');
    }
  });

  it('the applied position and value reach the generator: head, middle and tail', () => {
    st().setAlgorithm('ll-insert-at');
    for (const [index, result] of [[0, [8, 1, 2]], [1, [1, 8, 2]], [2, [1, 2, 8]]] as const) {
      expect(st().applyInput([1, 2], 8, index).ok).toBe(true);
      expect(st().index).toBe(index);
      expect(st().steps[st().steps.length - 1].state).toEqual(result);
    }
    st().setAlgorithm('ll-delete-at');
    for (const [index, result] of [[0, [2, 3]], [1, [1, 3]], [2, [1, 2]]] as const) {
      expect(st().applyInput([1, 2, 3], null, index).ok).toBe(true);
      expect(st().steps[st().steps.length - 1].state).toEqual(result);
    }
  });

  it('an invalid position is rejected before the generator runs; the previous trace stays', () => {
    st().setAlgorithm('ll-delete-at');
    const before = st().steps;
    expect(st().applyInput([1, 2, 3], null, 3)).toEqual({ ok: false, canSortCopy: false, message: 'Index 3 is out of range. For a list of 3 nodes, delete at 0 to 2.' });
    expect(st().applyInput([], null, 0)).toMatchObject({ ok: false, message: 'The list is empty, so there is no node to delete at index 0.' });
    expect(st().applyInput([1, 2, 3], null, null)).toMatchObject({ ok: false, message: 'Enter a value for "Position".' });
    expect(st().steps).toBe(before);
    expect(st().index).toBe(2);
  });

  it('a custom list keeps the user\'s position when switching; without one, the default is moved into range', () => {
    st().setAlgorithm('reverse-linked-list');
    st().applyInput([6], null);
    st().setAlgorithm('ll-insert-at');
    expect(st().index).toBe(1); // default 2 does not fit a 1-node list: append at 1
    expect(st().executionStatus).toBe('ok');
    st().applyInput([6, 7, 8], 3, 3);
    st().setAlgorithm('ll-delete-at');
    // the user's position 3 is kept (never silently changed) and reported as invalid for deleting
    expect(st().index).toBe(3);
    expect(st().executionStatus).toBe('invalid-input');
    expect(st().inputIssue?.message).toBe('Index 3 is out of range. For a list of 3 nodes, delete at 0 to 2.');
  });

  it('Size / Randomize generate a list the position fits: it is moved into range, and Delete keeps at least one node', () => {
    st().setAlgorithm('ll-delete-at');
    st().applyInput([1, 2, 3, 4], null, 3);
    st().setArraySize(2);
    expect(st().array).toHaveLength(2);
    expect(st().index).toBe(1);
    expect(st().executionStatus).toBe('ok');
    st().setArraySize(0);
    expect(st().array).toHaveLength(1);
    expect(st().index).toBe(0);
    expect(st().executionStatus).toBe('ok');
    st().setArraySize(50);
    expect(st().array).toHaveLength(10);
    expect(st().index).toBe(0); // a position that still fits is kept
    st().setAlgorithm('ll-insert-at');
    st().setArraySize(50);
    expect(st().array).toHaveLength(9);
    st().setArraySize(0);
    expect([st().array, st().index, st().executionStatus]).toEqual([[], 0, 'ok']);
  });
});

// Phase 5 regression: Restore after Size / Randomize brought the list back with the position Size had moved into range.
describe('Restore after Size / Randomize on a linked list', () => {
  it('restores the entered list AND the entered position', () => {
    st().setAlgorithm('ll-delete-at');
    st().applyInput([1, 2, 3, 4], null, 3);
    st().setArraySize(2);
    expect(st().index).toBe(1);
    st().randomizeArray(); // the notice keeps the original through repeated randomizing
    st().restoreOriginalInput();
    expect([st().array, st().index, st().executionStatus, st().inputNotice]).toEqual([[1, 2, 3, 4], 3, 'ok', null]);
    expect(st().steps).toEqual(getAlgorithmDefinition('ll-delete-at')!.generateSteps([1, 2, 3, 4], { index: 3 }));
  });

  it('operations without a position, and arrays, are unchanged', () => {
    st().setAlgorithm('ll-search');
    st().applyInput([5, 6], 6);
    st().setArraySize(3);
    expect(st().inputNotice).toEqual({ kind: 'replaced-custom', original: [5, 6] });
    st().restoreOriginalInput();
    expect([st().array, st().target, st().index]).toEqual([[5, 6], 6, null]);
  });
});
