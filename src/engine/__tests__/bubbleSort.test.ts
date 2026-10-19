import { describe, it, expect } from 'vitest';
import type { ExecutionStep } from '../../types/algorithm';
import { LANGUAGES, EDGE_INPUTS, randomArrays, codeLines, def, sortedCopy } from './testUtils';

const bubble = def('bubble-sort');
const trace = (input: number[]) => bubble.generateSteps([...input]);

const REQUIRED_INPUTS: [string, number[]][] = [
  ['already sorted', [1, 2, 3, 4]],
  ['mixed', [5, 1, 4, 2]],
  ['reversed', [4, 3, 2, 1]],
  ['duplicates', [2, 2, 1, 2]],
  ['empty', []],
  ['single', [7]],
];

const inversions = (a: number[]) => {
  let c = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) c++;
  return c;
};

/** Steps that are the outer loop's own condition check (not the inner loop's). */
const outerConditions = (steps: ExecutionStep[]) =>
  steps.filter(s => s.type === 'loop-condition' && s.codeRef === 'outer-loop');

describe('Bubble Sort trace — matches the displayed (non-optimized) implementation', () => {
  for (const [name, input] of REQUIRED_INPUTS) {
    describe(`${name} ${JSON.stringify(input)}`, () => {
      const n = input.length;
      const steps = trace(input);

      it('ends sorted and the array is a sorted copy of the input', () => {
        expect(steps[steps.length - 1].state).toEqual(sortedCopy(input));
      });

      it('has no early-exit / return step (the displayed code has none)', () => {
        expect(steps.filter(s => s.type === 'return')).toEqual([]);
        expect(steps.filter(s => /early exit/i.test(`${s.actionLabel} ${s.message}`))).toEqual([]);
        expect(steps.some(s => s.variables && 'earlyExit' in s.variables)).toBe(false);
      });

      it('performs every comparison the code performs: n(n-1)/2 compares, one condition per compare', () => {
        const expected = (n * (n - 1)) / 2;
        expect(steps.filter(s => s.type === 'compare')).toHaveLength(expected);
        expect(steps.filter(s => s.codeRef === 'if-greater')).toHaveLength(expected);
      });

      it('swaps exactly once per inversion', () => {
        expect(steps.filter(s => s.type === 'swap')).toHaveLength(inversions(input));
      });

      it('runs max(n-1, 0) passes and each pass locks the right-most unsorted index', () => {
        const passes = Math.max(n - 1, 0);
        expect(steps.filter(s => s.type === 'sorted')).toHaveLength(passes);
        const locked = steps.filter(s => s.type === 'sorted').map(s => s.indices![0]);
        expect(locked).toEqual(Array.from({ length: passes }, (_, p) => n - p - 1));
      });

      it('outer loop: true for i = 0..n-2, then exactly one false check with the correct i', () => {
        const checks = outerConditions(steps);
        const trues = checks.filter(s => s.result === 'true');
        const falses = checks.filter(s => s.result === 'false');
        expect(trues.map(s => s.pointers!.i)).toEqual(Array.from({ length: Math.max(n - 1, 0) }, (_, i) => i));
        expect(falses).toHaveLength(1);
        // After a normal run i == n-1 (n >= 2); when the loop never ran (n <= 1) i is still 0.
        expect(falses[0].variables!.i).toBe(Math.max(0, n - 1));
        expect(falses[0].variables!['n-1']).toBe(n - 1);
      });

      it('every recorded condition result is arithmetically correct', () => {
        for (const s of steps) {
          if (s.result === undefined) continue;
          if (s.codeRef === 'outer-loop') {
            const i = s.variables!.i as number;
            expect(s.result, `outer step ${s.id}`).toBe(i < n - 1 ? 'true' : 'false');
          } else if (s.codeRef === 'inner-loop') {
            const j = s.variables!.j as number;
            const limit = s.variables!.limit as number;
            expect(s.result, `inner step ${s.id}`).toBe(j < limit ? 'true' : 'false');
          } else if (s.codeRef === 'if-greater') {
            const { val1, val2 } = s.comparedValues!;
            expect(s.result, `if step ${s.id}`).toBe(val1 > val2 ? 'true' : 'false');
          }
        }
      });

      it('nothing but the final "complete" step follows the outer-loop-false check', () => {
        const idx = steps.findIndex(s => s.codeRef === 'outer-loop' && s.result === 'false');
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(steps.slice(idx + 1).map(s => s.type)).toEqual(['complete']);
      });

      it('the array changes only on swap steps, and a swap exchanges exactly the highlighted pair', () => {
        for (let k = 1; k < steps.length; k++) {
          const prev = steps[k - 1];
          const cur = steps[k];
          if (cur.type === 'swap') {
            const [a, b] = cur.indices!;
            const expected = [...prev.state];
            [expected[a], expected[b]] = [expected[b], expected[a]];
            expect(cur.state, `swap step ${cur.id}`).toEqual(expected);
            expect(prev.state[a]).toBeGreaterThan(prev.state[b]); // only swapped because out of order
          } else {
            expect(cur.state, `step ${cur.id} (${cur.type}) changed the array`).toEqual(prev.state);
          }
        }
      });

      it('a TRUE if-greater is immediately followed by a swap; a FALSE one is not', () => {
        steps.forEach((s, k) => {
          if (s.codeRef !== 'if-greater') return;
          const next = steps[k + 1];
          if (s.result === 'true') expect(next.type, `step ${s.id}`).toBe('swap');
          else expect(next.type, `step ${s.id}`).not.toBe('swap');
        });
      });

      it('compare steps highlight the two adjacent bars that hold the compared values', () => {
        for (const s of steps.filter(x => x.type === 'compare')) {
          const [a, b] = s.indices!;
          expect(b).toBe(a + 1);
          expect([s.state[a], s.state[b]]).toEqual([s.comparedValues!.val1, s.comparedValues!.val2]);
        }
      });

      it('every step has a codeRef that resolves in all four languages (the explanation-only "sorted" step has none)', () => {
        for (const s of steps) {
          if (s.type === 'sorted') {
            expect(s.codeRef, `step ${s.id}`).toBeUndefined();
            continue;
          }
          expect(s.codeRef, `step ${s.id}`).toBeTruthy();
          for (const lang of LANGUAGES) expect(bubble.lineMap[lang][s.codeRef!], `${lang}/${s.codeRef}`).toBeGreaterThan(0);
        }
      });
    });
  }

  describe('trace ↔ code correspondence', () => {
    it('the displayed code for every language contains no early-exit logic', () => {
      for (const lang of LANGUAGES) {
        expect(bubble.code[lang], lang).not.toMatch(/swapped|early|break|flag/i);
      }
    });

    it('each step type highlights a line whose text is that operation, in every language', () => {
      const text = (lang: (typeof LANGUAGES)[number], ref: string) =>
        codeLines(bubble, lang)[bubble.lineMap[lang][ref] - 1];
      const byType: [ExecutionStep['type'], string, RegExp][] = [
        ['compare', 'compare-adjacent', /arr\[j\]\s*>\s*arr\[j \+ 1\]/],
        ['swap', 'do-swap', /swap\(|temp|, arr\[j \+ 1\] =/],
      ];
      const steps = trace([5, 1, 4, 2]);
      for (const [type, ref, re] of byType) {
        const step = steps.find(s => s.type === type)!;
        expect(step.codeRef).toBe(ref);
        for (const lang of LANGUAGES) expect(text(lang, step.codeRef!), `${lang}/${type}`).toMatch(re);
      }
      for (const s of steps.filter(x => x.codeRef === 'outer-loop' && x.type !== 'sorted')) {
        for (const lang of LANGUAGES) expect(text(lang, 'outer-loop')).toMatch(/for\s*\(?\s*(int\s+)?i\b/);
        expect(s.codeRef).toBe('outer-loop');
      }
    });
  });

  describe('golden traces', () => {
    it('[1, 2, 3, 4]: three full passes with no swaps, no early exit (was 19 steps with an invented return)', () => {
      const steps = trace([1, 2, 3, 4]);
      expect(steps.filter(s => s.type === 'swap')).toHaveLength(0);
      expect(steps.filter(s => s.type === 'compare')).toHaveLength(6);
      expect(steps.filter(s => s.type === 'sorted')).toHaveLength(3);
      expect(outerConditions(steps).map(s => `${s.variables!.i}:${s.result}`)).toEqual(['0:true', '1:true', '2:true', '3:false']);
      expect(steps).toHaveLength(39);
    });

    it('[5, 1, 4, 2]: four swaps, final [1, 2, 4, 5]', () => {
      const steps = trace([5, 1, 4, 2]);
      const swaps = steps.filter(s => s.type === 'swap');
      expect(swaps.map(s => s.state)).toEqual([
        [1, 5, 4, 2],
        [1, 4, 5, 2],
        [1, 4, 2, 5],
        [1, 2, 4, 5],
      ]);
      expect(steps.filter(s => s.type === 'compare').map(s => s.comparedValues)).toEqual([
        { val1: 5, val2: 1 },
        { val1: 5, val2: 4 },
        { val1: 5, val2: 2 },
        { val1: 1, val2: 4 },
        { val1: 4, val2: 2 },
        { val1: 1, val2: 2 },
      ]);
    });

    it('[]: init, outer-loop false (i=0, limit -1), complete', () => {
      const steps = trace([]);
      expect(steps.map(s => s.type)).toEqual(['init', 'loop-condition', 'complete']);
      expect(steps[1].variables).toEqual({ i: 0, 'n-1': -1 });
    });

    it('[7]: init, outer-loop false (i=0, limit 0), complete', () => {
      const steps = trace([7]);
      expect(steps.map(s => s.type)).toEqual(['init', 'loop-condition', 'complete']);
      expect(steps[1].variables).toEqual({ i: 0, 'n-1': 0 });
    });
  });

  describe('fuzz', () => {
    it('150 random arrays: sorted result, n(n-1)/2 compares, inversion-count swaps, one final outer-false', () => {
      for (const input of [...Object.values(EDGE_INPUTS), ...randomArrays(150, 9, 99)]) {
        const steps = trace(input);
        const n = input.length;
        expect(steps[steps.length - 1].state).toEqual(sortedCopy(input));
        expect(steps.filter(s => s.type === 'compare')).toHaveLength((n * (n - 1)) / 2);
        expect(steps.filter(s => s.type === 'swap')).toHaveLength(inversions(input));
        expect(steps.filter(s => s.codeRef === 'outer-loop' && s.result === 'false')).toHaveLength(1);
        expect(steps.filter(s => s.type === 'return')).toHaveLength(0);
      }
    });
  });
});

// Audit L2: the panel shows comparedValues as "Comparing: a vs b". A swap compares nothing; the comparison that led to
// it (arr[j] > arr[j+1], in the original order) belongs to the compare / if-greater steps before it.
describe('Bubble Sort swap steps do not show a comparison (audit L2)', () => {
  const inputs = [...REQUIRED_INPUTS.map(([, a]) => a), [8, 3, 5, 1, 6], ...randomArrays(80, 8, 41)];

  it('swap steps carry no comparedValues', () => {
    for (const input of inputs) {
      for (const s of trace(input).filter(x => x.type === 'swap')) {
        expect(s.comparedValues, `${JSON.stringify(input)} step ${s.id} (${s.message})`).toBeUndefined();
      }
    }
  });

  it('the comparison before each swap keeps the pre-swap values in their original order (larger first)', () => {
    for (const input of inputs) {
      const steps = trace(input);
      steps.forEach((s, k) => {
        if (s.type !== 'swap') return;
        const [compare, condition] = [steps[k - 2], steps[k - 1]];
        const [a, b] = s.indices!;
        const before = { val1: compare.state[a], val2: compare.state[b] };
        expect(compare.type).toBe('compare');
        expect(condition.codeRef).toBe('if-greater');
        expect(compare.comparedValues).toEqual(before);
        expect(condition.comparedValues).toEqual(before);
        expect(before.val1).toBeGreaterThan(before.val2);
        // the swap really exchanged them
        expect([s.state[a], s.state[b]]).toEqual([before.val2, before.val1]);
      });
    }
  });

  it('[2, 1]: the whole trace is unchanged except the swap step; its explanation names the larger value moving right', () => {
    const steps = trace([2, 1]);
    expect(steps.map(s => [s.type, s.message, s.comparedValues ?? null])).toEqual([
      ['init', 'Initialize bubbleSort — array of 2 elements', null],
      ['loop-condition', 'Outer loop: i=0 < 1 → true  (Pass 1)', null],
      ['loop-condition', 'Inner loop: j=0 < 1 → true', null],
      ['compare', 'Compare arr[0]=2 and arr[1]=1', { val1: 2, val2: 1 }],
      ['condition', '2 > 1 is TRUE — swap', { val1: 2, val2: 1 }],
      ['swap', 'Swapped arr[0] ↔ arr[1]  (now: 1, 2)', null],
      ['increment', 'j++ → j=1', null],
      ['loop-condition', 'Inner loop: j=1 < 1 → false — pass 1 complete', null],
      ['sorted', 'Element 2 locked at index 1 (sorted)', null],
      ['increment', 'i++ → i=1', null],
      ['loop-condition', 'Outer loop: i=1 < 1 → false — all passes complete', null],
      ['complete', 'Bubble Sort complete — array fully sorted!', null],
    ]);
    const swap = steps.find(s => s.type === 'swap')!;
    expect(swap.explanation).toBe('Values swapped. The larger element 2 moves right toward its sorted position.');
    expect(`${swap.message} ${swap.explanation}`).not.toMatch(/compar/i);
  });
});
