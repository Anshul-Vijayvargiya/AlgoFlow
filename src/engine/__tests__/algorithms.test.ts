import { describe, it, expect } from 'vitest';
import { getAllAlgorithms } from '../AlgorithmRegistry';
import { buildExecution } from '../buildExecution';
import type { ExecutionStep } from '../../types/algorithm';
import {
  EDGE_INPUTS,
  SORT_IDS,
  def,
  randomArrays,
  sameMultiset,
  sortedCopy,
  lastOfType,
  expectCompareHighlightsAgree,
} from './testUtils';

const FUZZ = randomArrays(150, 9, 11);
const SORT_INPUTS = [...Object.values(EDGE_INPUTS), ...FUZZ];

describe('sorting algorithms — correct results (real generators)', () => {
  for (const id of SORT_IDS) {
    describe(id, () => {
      it('sorts every edge case: empty, single, duplicates, all-equal, sorted, reversed, mixed', () => {
        for (const [name, input] of Object.entries(EDGE_INPUTS)) {
          const steps = def(id).generateSteps([...input]);
          expect(steps[steps.length - 1].state, `${id} ${name}`).toEqual(sortedCopy(input));
        }
      });

      it('sorts 150 random inputs (including duplicates) and never mutates the caller input', () => {
        for (const input of FUZZ) {
          const copy = [...input];
          const steps = def(id).generateSteps(copy);
          expect(copy, 'input mutated').toEqual(input);
          expect(steps[steps.length - 1].state, `${id} ${JSON.stringify(input)}`).toEqual(sortedCopy(input));
        }
      });
    });
  }
});

describe('searching algorithms — correct results (real generators)', () => {
  const finalOutcome = (steps: ExecutionStep[]) => ({
    found: lastOfType(steps, 'found'),
    notFound: lastOfType(steps, 'not-found'),
  });

  describe('linear-search', () => {
    const d = def('linear-search');
    const cases: [string, number[], number][] = [
      ['target in the middle', [4, 2, 9, 7, 5, 1, 8], 7],
      ['target first', [4, 2, 9, 7, 5, 1, 8], 4],
      ['target last', [4, 2, 9, 7, 5, 1, 8], 8],
      ['duplicate target (first occurrence wins)', [2, 2, 1, 2], 2],
      ['single element, present', [7], 7],
    ];
    for (const [name, arr, target] of cases) {
      it(`finds the first occurrence — ${name}`, () => {
        const { found, notFound } = finalOutcome(d.generateSteps([...arr], { target }));
        expect(notFound).toBeUndefined();
        expect(found?.variables?.foundIndex).toBe(arr.indexOf(target));
      });
    }

    it('checks indices in order 0..k and reports each comparison outcome', () => {
      const steps = d.generateSteps([4, 2, 9, 7, 5, 1, 8], { target: 7 });
      const compared = steps.filter(s => s.type === 'condition');
      expect(compared.map(s => s.pointers?.i)).toEqual([0, 1, 2, 3]);
      expect(compared.map(s => s.result)).toEqual(['false', 'false', 'false', 'true']);
    });

    for (const [name, arr] of [
      ['missing target', [4, 2, 9, 7, 5, 1, 8]],
      ['empty array', []],
      ['single element, absent', [7]],
    ] as [string, number[]][]) {
      it(`reports not-found — ${name}`, () => {
        const { found, notFound } = finalOutcome(d.generateSteps([...arr], { target: 3 }));
        expect(found).toBeUndefined();
        expect(notFound?.variables?.returnVal).toBe(-1);
      });
    }

    it('without an explicit target it still finds the default target (current UI behaviour)', () => {
      const steps = d.generateSteps([4, 2, 9, 7, 5, 1, 8]);
      expect(lastOfType(steps, 'found')?.variables?.foundIndex).toBe(3);
    });
  });

  describe('binary-search', () => {
    const d = def('binary-search');
    const arr = [1, 3, 5, 7, 9, 11, 14];

    for (const [name, target] of [
      ['middle', 7],
      ['first', 1],
      ['last', 14],
    ] as [string, number][]) {
      it(`finds target at the ${name}`, () => {
        const { found, notFound } = finalOutcome(d.generateSteps([...arr], { target }));
        expect(notFound).toBeUndefined();
        expect(found?.variables?.foundIndex).toBe(arr.indexOf(target));
      });
    }

    it('reports not-found for absent targets below, between and above the range', () => {
      for (const target of [0, 6, 100]) {
        const { found, notFound } = finalOutcome(d.generateSteps([...arr], { target }));
        expect(found, `target ${target}`).toBeUndefined();
        expect(notFound?.variables?.returnVal).toBe(-1);
      }
    });

    it('empty array and single element', () => {
      expect(lastOfType(d.generateSteps([], { target: 5 }), 'not-found')).toBeDefined();
      expect(lastOfType(d.generateSteps([5], { target: 5 }), 'found')?.variables?.foundIndex).toBe(0);
      expect(lastOfType(d.generateSteps([5], { target: 6 }), 'not-found')).toBeDefined();
    });

    it('with duplicates returns an index that actually holds the target', () => {
      const dup = [1, 2, 2, 2, 3];
      const idx = lastOfType(d.generateSteps(dup, { target: 2 }), 'found')?.variables?.foundIndex as number;
      expect(dup[idx]).toBe(2);
    });

    it('pointer arithmetic: mid = floor((low+high)/2) and bounds move correctly', () => {
      const steps = d.generateSteps([...arr], { target: 14 });
      const mids = steps.filter(s => s.codeRef === 'calc-mid');
      for (const s of mids) {
        const { low, high, mid } = s.pointers!;
        expect(mid).toBe(Math.floor((low + high) / 2));
      }
      expect(mids.map(s => s.pointers!.mid)).toEqual([3, 5, 6]);
      const lows = steps.filter(s => s.codeRef === 'update-low').map(s => s.pointers!.low);
      expect(lows).toEqual([4, 6]);
    });

    it('fuzz (ascending input, as the algorithm requires): result always agrees with a reference search', () => {
      for (const input of FUZZ) {
        const sorted = sortedCopy(input);
        for (const target of [...sorted, 0, 31]) {
          // Since Sprint 4 the generator no longer sorts for the caller: pass the sorted copy explicitly.
          const steps = d.generateSteps([...sorted], { target });
          const idx = lastOfType(steps, 'found')?.variables?.foundIndex as number | undefined;
          if (sorted.includes(target)) expect(sorted[idx!]).toBe(target);
          else expect(lastOfType(steps, 'not-found')).toBeDefined();
        }
      }
    });
  });

  describe('two-pointer', () => {
    const d = def('two-pointer');
    it('finds a valid pair when one exists and reports none otherwise', () => {
      const arr = [2, 5, 8, 12, 15, 19, 24];
      const found = lastOfType(d.generateSteps([...arr], { target: 27 }), 'found');
      const { left, right } = found!.variables as { left: number; right: number };
      expect(left).toBeLessThan(right);
      expect(arr[left] + arr[right]).toBe(27);
      expect(lastOfType(d.generateSteps([...arr], { target: 1 }), 'not-found')).toBeDefined();
      expect(lastOfType(d.generateSteps([], { target: 5 }), 'not-found')).toBeDefined();
      expect(lastOfType(d.generateSteps([7], { target: 14 }), 'not-found')).toBeDefined();
    });
  });
});

describe('execution-step consistency (all registered algorithms)', () => {
  const inputsFor = (id: string) =>
    id === 'binary-search' || id === 'two-pointer' ? [...Object.values(EDGE_INPUTS), ...FUZZ] : SORT_INPUTS;

  it('step ids are contiguous, first step is init and last step is complete', () => {
    for (const d of getAllAlgorithms()) {
      for (const input of inputsFor(d.id)) {
        const steps = d.generateSteps([...input]);
        expect(steps.length).toBeGreaterThanOrEqual(2);
        expect(steps[0].type, `${d.id} ${JSON.stringify(input)}`).toBe('init');
        expect(steps[steps.length - 1].type).toBe('complete');
        steps.forEach((s, i) => expect(s.id).toBe(i));
      }
    }
  });

  it('state length never changes and sortedIndices stay in bounds (non-empty inputs)', () => {
    for (const d of getAllAlgorithms()) {
      for (const input of inputsFor(d.id).filter(a => a.length > 0)) {
        const steps = d.generateSteps([...input]);
        for (const s of steps) {
          expect(s.state.length, `${d.id} step ${s.id}`).toBe(input.length);
          for (const i of s.sortedIndices ?? []) {
            expect(i).toBeGreaterThanOrEqual(0);
            expect(i).toBeLessThan(input.length);
          }
        }
      }
    }
  });

  it('highlighted indices are within the array for non-empty inputs', () => {
    for (const d of getAllAlgorithms()) {
      for (const input of inputsFor(d.id).filter(a => a.length > 0)) {
        for (const s of d.generateSteps([...input])) {
          for (const i of s.indices ?? []) {
            expect(i, `${d.id} step ${s.id} ${s.codeRef}`).toBeGreaterThanOrEqual(0);
            expect(i, `${d.id} step ${s.id} ${s.codeRef}`).toBeLessThan(input.length);
          }
        }
      }
    }
  });

  it('swap-based sorts keep the array a permutation of the input at every step', () => {
    for (const id of ['bubble-sort', 'selection-sort', 'quick-sort'] as const) {
      for (const input of SORT_INPUTS) {
        for (const s of def(id).generateSteps([...input])) {
          expect(sameMultiset(s.state, input), `${id} ${JSON.stringify(input)} step ${s.id}`).toBe(true);
        }
      }
    }
  });

  it('a compare step highlights only bars that hold the compared values (all comparing algorithms)', () => {
    for (const id of ['bubble-sort', 'selection-sort', 'linear-search', 'quick-sort', 'merge-sort'] as const) {
      for (const input of SORT_INPUTS) {
        for (const s of def(id).generateSteps([...input])) {
          if (s.type === 'compare') expectCompareHighlightsAgree(s, `${id} ${JSON.stringify(input)}`);
        }
      }
    }
  });

  it('pointers agree with variables of the same name (all algorithms)', () => {
    for (const id of ['bubble-sort', 'selection-sort', 'insertion-sort', 'linear-search', 'binary-search', 'merge-sort', 'quick-sort', 'two-pointer']) {
      for (const input of inputsFor(id)) {
        for (const s of def(id).generateSteps([...input])) {
          for (const [k, v] of Object.entries(s.pointers ?? {})) {
            if (s.variables && k in s.variables) {
              expect(s.variables[k], `${id} step ${s.id} ${k}`).toBe(v);
            }
          }
        }
      }
    }
  });

  // Fixed in Sprint 3 (previously pinned with it.fails: audit P2-1, P2-3 and the Sprint 1 Insertion Sort finding).
  it('Insertion Sort pointers agree with variables, including j = -1 (audit P2-1)', () => {
    for (const input of SORT_INPUTS) {
      for (const s of def('insertion-sort').generateSteps([...input])) {
        for (const [k, v] of Object.entries(s.pointers ?? {})) {
          if (s.variables && k in s.variables) expect(s.variables[k], `step ${s.id} ${k}`).toBe(v);
        }
      }
    }
    // the exact case the audit reported: the while-FALSE step with j = -1
    const steps = def('insertion-sort').generateSteps([2, 1]);
    const falseStep = steps.find(s => s.codeRef === 'while-condition' && s.result === 'false')!;
    expect(falseStep.variables!.j).toBe(-1);
    expect(falseStep.pointers!.j).toBe(-1);
  });

  it('a bar in sortedIndices already holds its final sorted value and never changes afterwards (all sorts)', () => {
    for (const id of SORT_IDS) {
      for (const input of SORT_INPUTS) {
        const final = sortedCopy(input);
        const lockedValue = new Map<number, number>();
        for (const s of def(id).generateSteps([...input])) {
          for (const i of s.sortedIndices ?? []) {
            const where = `${id} ${JSON.stringify(input)} step ${s.id} (${s.codeRef}) index ${i}`;
            expect(s.state[i], `${where}: marked sorted but not at its final value`).toBe(final[i]);
            if (lockedValue.has(i)) expect(s.state[i], `${where}: changed after being marked sorted`).toBe(lockedValue.get(i));
            lockedValue.set(i, s.state[i]);
          }
        }
      }
    }
  });

  it('every algorithm: an empty array produces no highlighted/sorted indices and no undefined/NaN text (audit P2-3)', () => {
    for (const d of getAllAlgorithms()) {
      for (const params of [undefined, { target: 5 }]) {
        for (const s of d.generateSteps([], params)) {
          expect(`${s.message} ${s.explanation ?? ''}`, `${d.id} step ${s.id}`).not.toMatch(/undefined|NaN/);
          expect(s.state, `${d.id} step ${s.id}`).toEqual([]);
          expect(s.indices ?? [], `${d.id} step ${s.id} indices`).toEqual([]);
          expect(s.sortedIndices ?? [], `${d.id} step ${s.id} sortedIndices`).toEqual([]);
          expect(s.sortedPrefixIndices ?? [], `${d.id} step ${s.id} sortedPrefixIndices`).toEqual([]);
          expect(s.buffers ?? [], `${d.id} step ${s.id} buffers`).toEqual([]);
        }
      }
    }
  });
});

// Audit M1: sortedIndices means "in its final position". Insertion Sort's growing prefix is only sorted relative to
// itself (later keys shift it), so it is reported separately as sortedPrefixIndices.
describe('final positions vs Insertion Sort\'s sorted prefix (audit M1)', () => {
  const prefixUpTo = (i: number) => Array.from({ length: i }, (_, k) => k);

  it('Insertion Sort: the initial prefix is not marked as a final position', () => {
    const [init] = def('insertion-sort').generateSteps([6, 2, 8, 4, 3]);
    expect(init.sortedIndices ?? []).toEqual([]);
    expect(init.sortedPrefixIndices).toEqual([0]);
  });

  it('Insertion Sort: nothing is final until the outer loop ends; until then the prefix is [0..i-1]', () => {
    for (const input of SORT_INPUTS.filter(a => a.length > 0)) {
      const steps = def('insertion-sort').generateSteps([...input]);
      const loopEnd = steps.findIndex(s => s.codeRef === 'outer-loop' && s.result === 'false');
      steps.forEach((s, k) => {
        const where = `${JSON.stringify(input)} step ${k} (${s.codeRef})`;
        if (k < loopEnd) {
          expect(s.sortedIndices ?? [], where).toEqual([]);
          const i = typeof s.pointers?.i === 'number' ? s.pointers.i : undefined;
          const prefix = s.sortedPrefixIndices ?? [];
          // the prefix is contiguous from 0; it grows by one only on the insert-key step of pass i
          expect(prefix, where).toEqual(prefixUpTo(prefix.length));
          if (i !== undefined) expect(prefix.length, where).toBe(i);
        } else {
          expect(s.sortedIndices, where).toEqual(prefixUpTo(input.length));
          expect(s.sortedPrefixIndices ?? [], where).toEqual([]);
        }
      });
    }
  });

  it('only Insertion Sort reports a sorted prefix', () => {
    for (const d of getAllAlgorithms().filter(a => a.id !== 'insertion-sort')) {
      for (const input of SORT_INPUTS) {
        for (const s of d.generateSteps([...input], { target: 5 })) expect(s.sortedPrefixIndices, `${d.id} step ${s.id}`).toBeUndefined();
      }
    }
  });

  it('Bubble Sort and Selection Sort lock exactly the same final positions as before', () => {
    const lockSequence = (id: 'bubble-sort' | 'selection-sort', input: number[]) => {
      const seq: number[][] = [];
      for (const s of def(id).generateSteps([...input])) {
        const cur = s.sortedIndices ?? [];
        if (JSON.stringify(seq.at(-1)) !== JSON.stringify(cur)) seq.push(cur);
      }
      return seq;
    };
    expect(lockSequence('bubble-sort', [8, 3, 5, 1, 6])).toEqual([[], [4], [4, 3], [4, 3, 2], [4, 3, 2, 1], [0, 1, 2, 3, 4]]);
    expect(lockSequence('bubble-sort', [3, 3, 1, 2])).toEqual([[], [3], [3, 2], [3, 2, 1], [0, 1, 2, 3]]);
    expect(lockSequence('selection-sort', [7, 4, 1, 8, 2])).toEqual([[], [0], [0, 1], [0, 1, 2], [0, 1, 2, 3], [0, 1, 2, 3, 4]]);
    expect(lockSequence('selection-sort', [3, 3, 1, 2])).toEqual([[], [0], [0, 1], [0, 1, 2], [0, 1, 2, 3]]);
  });
});

// Audit L-1: Linear and Binary Search only treated an OMITTED target as "use the default", so a direct call with
// target: null searched for null (Binary Search's `<` even coerced it to 0). null is now rejected explicitly; the
// app never passes it (the store validates the target first), and buildExecution reports it as a generator error.
describe('Linear and Binary Search: target null is rejected, every number is kept (audit L-1)', () => {
  const SEARCHES = ['linear-search', 'binary-search'] as const;
  const targetOf = (steps: ExecutionStep[]) => steps[0].variables!.target;
  const foundAt = (steps: ExecutionStep[]) => steps.find(s => s.type === 'found')?.indices?.[0];

  for (const id of SEARCHES) {
    describe(id, () => {
      it('target: null throws a clear error instead of searching for null (or for 0)', () => {
        expect(() => def(id).generateSteps([0, 1, 2], { target: null })).toThrow(/target.*null/i);
      });

      it('through buildExecution, null becomes an explicit generator error with no steps', () => {
        const r = buildExecution(id, [0, 1, 2], undefined, { target: null });
        expect(r.status).toBe('generator-error');
        expect(r.steps).toEqual([]);
      });

      it('an omitted target keeps the existing default (the middle element; 0 for an empty array)', () => {
        expect(targetOf(def(id).generateSteps([1, 3, 5, 7, 9]))).toBe(5);
        expect(targetOf(def(id).generateSteps([1, 3, 5, 7]))).toBe(5);
        expect(targetOf(def(id).generateSteps([]))).toBe(0);
        expect(targetOf(def(id).generateSteps([1, 3, 5], {}))).toBe(3);
      });

      it('target 0 is searched for as 0 and found where it is', () => {
        const steps = def(id).generateSteps([-3, -1, 0, 4, 9], { target: 0 });
        expect(targetOf(steps)).toBe(0);
        expect(foundAt(steps)).toBe(2);
        expect(steps[0].message).toContain('target = 0');
      });

      it('an ordinary numeric target is unchanged (found and not found)', () => {
        expect(foundAt(def(id).generateSteps([1, 3, 5, 7, 9], { target: 7 }))).toBe(3);
        const miss = def(id).generateSteps([1, 3, 5, 7, 9], { target: 4 });
        expect(targetOf(miss)).toBe(4);
        expect(miss.some(s => s.type === 'not-found')).toBe(true);
      });
    });
  }
});
