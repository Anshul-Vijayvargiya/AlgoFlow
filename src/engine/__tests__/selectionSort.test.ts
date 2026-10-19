import { describe, it, expect } from 'vitest';
import type { ExecutionStep } from '../../types/algorithm';
import { resolveCodeRef } from '../AlgorithmRegistry';
import { LANGUAGES, EDGE_INPUTS, randomArrays, codeLines, def, sortedCopy } from './testUtils';

const selection = def('selection-sort');
const trace = (input: number[]) => selection.generateSteps([...input]);

const INPUTS: [string, number[]][] = [
  ['empty', []],
  ['single', [7]],
  ['two', [2, 1]],
  ['sorted', [1, 2, 3, 4]],
  ['reverse-sorted', [4, 3, 2, 1]],
  ['duplicates', [3, 3, 1, 2]],
  ['all equal', [5, 5, 5]],
  ['default input', [...selection.defaultInput]],
  ...Object.entries(EDGE_INPUTS),
  ...randomArrays(60, 9, 17).map((a, i) => [`random #${i}`, a] as [string, number[]]),
];

/** The outer-loop control events of a trace, in order: condition results, i++ (with the new i) and lock annotations. */
const outerEvents = (steps: ExecutionStep[]) =>
  steps
    .filter(s => s.codeRef === 'outer-loop' || s.type === 'sorted')
    .map(s => (s.type === 'sorted' ? 'locked' : s.type === 'increment' ? `i++ → ${s.variables!.i}` : `i < n-1: ${s.result}`));

/** What the displayed code does: for (i = 0; i < n - 1; i++) { …pass…; [locked] } — then one failing check. */
function expectedOuterEvents(n: number): string[] {
  const out: string[] = [];
  let i = 0;
  for (; i < n - 1; i++) out.push('i < n-1: true', 'locked', `i++ → ${i + 1}`);
  out.push('i < n-1: false');
  return out;
}

describe('Selection Sort outer loop: every condition check, every i++, and the exit (audit follow-up to L3-E)', () => {
  for (const [name, input] of INPUTS) {
    it(`${name} ${JSON.stringify(input)}: the outer loop runs exactly as the displayed for-loop does`, () => {
      const steps = trace(input);
      expect(outerEvents(steps)).toEqual(expectedOuterEvents(input.length));
      expect(steps[steps.length - 1].state).toEqual(sortedCopy(input));
    });
  }

  it('every outer-loop condition result is arithmetically correct, and i++ adds exactly one', () => {
    for (const [, input] of INPUTS) {
      const n = input.length;
      let lastI: number | undefined;
      for (const s of trace(input)) {
        if (s.codeRef !== 'outer-loop') continue;
        const i = s.variables!.i as number;
        if (s.type === 'loop-condition') expect(s.result, `i=${i} n=${n}`).toBe(i < n - 1 ? 'true' : 'false');
        if (s.type === 'increment') {
          expect(i).toBe(lastI! + 1);
          expect(s.pointers).toEqual({ i });
        }
        lastI = i;
      }
    }
  });

  it('the final check is FALSE with i = max(n - 1, 0) and is followed only by the complete step', () => {
    for (const [, input] of INPUTS) {
      const steps = trace(input);
      const exit = steps[steps.length - 2];
      expect(exit.type).toBe('loop-condition');
      expect(exit.codeRef).toBe('outer-loop');
      expect(exit.result).toBe('false');
      expect(exit.variables!.i).toBe(Math.max(input.length - 1, 0));
      expect(exit.message).toBe(`Outer loop: i=${Math.max(input.length - 1, 0)} < ${input.length - 1} → false — all passes complete`);
      expect(steps[steps.length - 1].type).toBe('complete');
    }
  });

  it('i++ and the exit check highlight the outer for line in every language; "locked" still highlights none (L3-E)', () => {
    const steps = trace([3, 1, 2]);
    for (const lang of LANGUAGES) {
      const outer = codeLines(selection, lang)[selection.lineMap[lang]['outer-loop'] - 1].trim();
      expect(outer, lang).toMatch(/^for (\(int i = 0; i < n - 1; i\+\+\) \{|i in range\(n - 1\):)$/);
      for (const s of steps.filter(x => x.type === 'increment' || (x.codeRef === 'outer-loop' && x.result === 'false'))) {
        expect(resolveCodeRef(selection, lang, s.codeRef), `${lang} ${s.message}`).toBe(selection.lineMap[lang]['outer-loop']);
      }
      for (const s of steps.filter(x => x.type === 'sorted')) expect(resolveCodeRef(selection, lang, s.codeRef), lang).toBeNull();
    }
  });

  it('step counts: max(n - 1, 0) + 1 more than before the fix (n - 1 increments, one exit check)', () => {
    const before: [number[], number][] = [[[], 2], [[7], 2], [[2, 1], 11], [[7, 4, 1, 8, 2], 51], [[1, 2, 3, 4], 29], [[4, 3, 2, 1], 35], [[3, 3, 1, 2], 33]];
    for (const [input, oldCount] of before) {
      expect(trace(input).length, JSON.stringify(input)).toBe(oldCount + Math.max(input.length - 1, 0) + 1);
    }
  });
});
