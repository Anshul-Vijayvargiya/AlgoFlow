import { describe, it, expect } from 'vitest';
import type { ExecutionStep } from '../../types/algorithm';
import { resolveCodeRange, resolveCodeRef } from '../AlgorithmRegistry';
import { LANGUAGES, codeLines, def, makeRng } from './testUtils';
import { LINE_ANCHORS } from './lineAnchors';
import { buildExecution } from '../buildExecution';

const tp = def('two-pointer');
const trace = (input: number[], target: number) => tp.generateSteps([...input], { target });

/** (codeRef, result) of every step, e.g. "check-less:true" or "increment-left". */
const shape = (steps: ExecutionStep[]) => steps.map(s => (s.result ? `${s.codeRef}:${s.result}` : s.codeRef));

const ITERATION = (eq: boolean, less?: boolean) =>
  ['while-condition:true', 'calc-sum', `check-equal:${eq}`, ...(eq ? ['return-pair'] : [`check-less:${less}`, less ? 'increment-left' : 'decrement-right'])];

/**
 * Walks the trace with an independent oracle of the displayed code (left = 0, right = n - 1; while left < right:
 * sum; if sum == target return; if sum < target left++ else right--; return none). Every executed condition must be
 * the next step, with the right result and pointers. Returns the oracle's answer.
 */
function verifyAgainstOracle(input: number[], target: number): [number, number] | null {
  const steps = trace(input, target);
  let p = 0;
  const take = (ref: string, type: ExecutionStep['type'], result?: boolean): ExecutionStep => {
    const s = steps[p++];
    const where = `${JSON.stringify(input)} target ${target} step ${p - 1}`;
    expect(s, `${where}: trace ended early; expected ${ref}`).toBeDefined();
    expect(s.codeRef, `${where} (${s.message})`).toBe(ref);
    expect(s.type, `${where} ${ref}`).toBe(type);
    if (result !== undefined) expect(s.result, `${where} ${ref} (${s.message})`).toBe(String(result));
    return s;
  };

  take('fn-entry', 'init');
  take('init-pointers', 'assign');
  let left = 0;
  let right = input.length - 1;
  let answer: [number, number] | null = null;
  for (;;) {
    const loop = take('while-condition', 'loop-condition', left < right);
    expect(loop.pointers).toEqual({ left, right });
    if (!(left < right)) break;
    const sum = input[left] + input[right];
    const calc = take('calc-sum', 'assign');
    expect(calc.variables).toMatchObject({ left, right, currentSum: sum });
    const eq = take('check-equal', 'condition', sum === target);
    expect(eq.comparedValues).toEqual({ val1: sum, val2: target });
    expect(eq.indices).toEqual([left, right]);
    if (sum === target) {
      answer = [left, right];
      expect(take('return-pair', 'found').indices).toEqual([left, right]);
      break;
    }
    const less = take('check-less', 'condition', sum < target);
    expect(less.comparedValues).toEqual({ val1: sum, val2: target });
    if (sum < target) {
      left++;
      expect(take('increment-left', 'increment').pointers).toEqual({ left, right });
    } else {
      right--;
      expect(take('decrement-right', 'decrement').pointers).toEqual({ left, right });
    }
  }
  if (!answer) take('return-none', 'not-found');
  take('fn-entry', 'complete');
  expect(p, `${JSON.stringify(input)} target ${target}: extra steps after complete`).toBe(steps.length);
  return answer;
}

describe('Two Pointer trace — every loop check and branch decision is a step (audit M2)', () => {
  it('target found: [2, 5, 8, 12, 15, 19, 24], target 27', () => {
    expect(shape(trace([2, 5, 8, 12, 15, 19, 24], 27))).toEqual([
      'fn-entry',
      'init-pointers',
      ...ITERATION(false, true), // 2 + 24 = 26 < 27 → left++
      ...ITERATION(false, false), // 5 + 24 = 29 > 27 → right--
      ...ITERATION(false, true), // 5 + 19 = 24 < 27 → left++
      ...ITERATION(true), // 8 + 19 = 27 → return
      'fn-entry',
    ]);
  });

  it('target not found: the loop exits with left < right FALSE, then returns none', () => {
    expect(shape(trace([1, 2, 4], 10))).toEqual([
      'fn-entry',
      'init-pointers',
      ...ITERATION(false, true), // 1 + 4 = 5 → left = 1
      ...ITERATION(false, true), // 2 + 4 = 6 → left = 2
      'while-condition:false', // 2 < 2
      'return-none',
      'fn-entry',
    ]);
    const exit = trace([1, 2, 4], 10).find(s => s.codeRef === 'while-condition' && s.result === 'false')!;
    expect(exit.pointers).toEqual({ left: 2, right: 2 });
    expect(exit.message).toMatch(/left\(2\) < right\(2\).*false/i);
  });

  it('the loop never runs for empty and single-element arrays: one FALSE check, then not found', () => {
    for (const input of [[], [7]]) {
      expect(shape(trace(input, 14)), JSON.stringify(input)).toEqual(['fn-entry', 'init-pointers', 'while-condition:false', 'return-none', 'fn-entry']);
    }
    // nothing undefined/NaN, and no highlighted index for the empty array
    for (const s of trace([], 5)) {
      expect(`${s.message} ${s.explanation ?? ''}`).not.toMatch(/undefined|NaN/);
      expect(s.indices ?? []).toEqual([]);
    }
  });

  it('sum == target and sum < target each show both TRUE and FALSE outcomes', () => {
    const results = (ref: string) => new Set(trace([2, 5, 8, 12, 15, 19, 24], 27).filter(s => s.codeRef === ref).map(s => s.result));
    expect(results('check-equal')).toEqual(new Set(['true', 'false']));
    expect(results('check-less')).toEqual(new Set(['true', 'false']));
  });

  it('fuzz: every step matches the displayed code, and the answer matches a brute-force search', () => {
    const rnd = makeRng(91);
    for (let k = 0; k < 400; k++) {
      const input = Array.from({ length: Math.floor(rnd() * 9) }, () => Math.floor(rnd() * 21) - 8).sort((a, b) => a - b);
      const target = Math.floor(rnd() * 37) - 18;
      const answer = verifyAgainstOracle(input, target);
      let exists = false;
      for (let i = 0; i < input.length; i++) for (let j = i + 1; j < input.length; j++) if (input[i] + input[j] === target) exists = true;
      expect(answer !== null, `${JSON.stringify(input)} target ${target}`).toBe(exists);
      if (answer) expect(input[answer[0]] + input[answer[1]]).toBe(target);
    }
  });
});

describe('Two Pointer line mappings — the decision lines are highlighted in every language (audit M2)', () => {
  const EXPECTED: Record<string, Record<string, string>> = {
    cpp: {
      'while-condition': 'while (left < right) {',
      'check-equal': 'if (sum == target) return {left, right};',
      'check-less': 'if (sum < target) left++;',
    },
    c: {
      'while-condition': 'while (left < right) {',
      'check-equal': 'if (sum == target) {',
      'check-less': 'if (sum < target) left++;',
    },
    java: {
      'while-condition': 'while (left < right) {',
      'check-equal': 'if (sum == target) return new int[]{left, right};',
      'check-less': 'if (sum < target) left++;',
    },
    python: {
      'while-condition': 'while left < right:',
      'check-equal': 'if current_sum == target:',
      'check-less': 'elif current_sum < target:',
    },
  };

  for (const lang of LANGUAGES) {
    for (const [ref, text] of Object.entries(EXPECTED[lang])) {
      it(`${lang} / ${ref} → "${text}"`, () => {
        const line = resolveCodeRef(tp, lang, ref);
        expect(line).not.toBeNull();
        expect(codeLines(tp, lang)[line! - 1].trim()).toBe(text);
        expect(LINE_ANCHORS['two-pointer'][ref].test(text)).toBe(true);
      });
    }
  }

  it('no loop or comparison line of the listing is skipped by the trace, in any language', () => {
    const traces = [trace([2, 5, 8, 12, 15, 19, 24], 27), trace([1, 2, 4], 10), trace([1, 9], 5)];
    for (const lang of LANGUAGES) {
      const highlighted = new Set(traces.flat().map(s => resolveCodeRef(tp, lang, s.codeRef)));
      codeLines(tp, lang).forEach((text, i) => {
        if (/left < right|== target|< target/.test(text)) expect(highlighted.has(i + 1), `${lang} line ${i + 1} "${text.trim()}"`).toBe(true);
      });
    }
  });
});

// Audit L3-D: before `return true;` the C version writes the pair to its out-parameters on the line above. The match
// step now covers both lines; its mapped line (aria-current, "← HERE") stays on the return (Sprint 2 fix).
describe('C Two Pointer: the match step highlights the out-parameter writes and the return (audit L3-D)', () => {
  const rangeText = (lang: (typeof LANGUAGES)[number], ref: string) => {
    const r = resolveCodeRange(tp, lang, ref)!;
    return codeLines(tp, lang).slice(r.start - 1, r.end).map(t => t.trim());
  };
  const mappedText = (lang: (typeof LANGUAGES)[number], ref: string) => codeLines(tp, lang)[resolveCodeRef(tp, lang, ref)! - 1].trim();

  it('C: return-pair covers exactly the out-parameter line and `return true;`; its mapped line is the return', () => {
    expect(rangeText('c', 'return-pair')).toEqual(['*outLeft = left; *outRight = right;', 'return true;']);
    expect(mappedText('c', 'return-pair')).toBe('return true;');
  });

  it('C++, Java and Python return the pair in one statement: unchanged single-line ranges', () => {
    expect(rangeText('cpp', 'return-pair')).toEqual(['if (sum == target) return {left, right};']);
    expect(rangeText('java', 'return-pair')).toEqual(['if (sum == target) return new int[]{left, right};']);
    expect(rangeText('python', 'return-pair')).toEqual(['return (left, right)']);
  });

  it('the range belongs to a found step only, and never reaches the condition above it', () => {
    const steps = trace([2, 5, 8, 12, 15, 19, 24], 27);
    const match = steps.find(s => s.codeRef === 'return-pair')!;
    expect(match.type).toBe('found');
    const r = resolveCodeRange(tp, 'c', 'return-pair')!;
    expect(r.start).toBeGreaterThan(resolveCodeRef(tp, 'c', 'check-equal')!);
  });

  it('C: every statement of the listing is highlighted by some step (found and not-found runs)', () => {
    const covered = new Set<number>();
    for (const [input, target] of [[[2, 5, 8, 12, 15, 19, 24], 27], [[1, 2, 4], 10], [[1, 9], 5]] as [number[], number][]) {
      for (const s of trace(input, target)) {
        const r = resolveCodeRange(tp, 'c', s.codeRef)!;
        for (let n = r.start; n <= r.end; n++) covered.add(n);
      }
    }
    codeLines(tp, 'c').forEach((text, i) => {
      if (/^[\s{}]*$/.test(text)) return;
      expect(covered.has(i + 1), `C line ${i + 1} "${text.trim()}"`).toBe(true);
    });
  });
});

// Audit R2: `params.target ?? (arr[0] + arr[n - 1] || 10)`. A passed target is never replaced (the outer operator is
// ??), but the fallback for a call WITHOUT a target turned a legitimate endpoint sum of 0 into 10.
describe('Two Pointer target selection keeps a numeric zero (audit R2)', () => {
  const targetOf = (input: number[], params?: Record<string, unknown>) => tp.generateSteps([...input], params)[0].variables!.target;

  it('an explicit target of 0 is used as given (unchanged behaviour)', () => {
    for (const input of [[-3, 1, 3], [-2, 2], [0, 0], [-5, -1, 6]]) expect(targetOf(input, { target: 0 }), JSON.stringify(input)).toBe(0);
    const steps = trace([-3, 1, 3], 0);
    expect(steps[0].message).toBe('Initialize Two-Pointer Pair Sum — target sum = 0');
    expect(steps.find(s => s.type === 'found')!.indices).toEqual([0, 2]);
  });

  it('without a target, an endpoint sum of 0 is the target (was replaced by 10), and its pair is found', () => {
    for (const input of [[-3, 1, 3], [-2, 2], [0, 0]]) {
      const steps = tp.generateSteps([...input]);
      expect(steps[0].variables!.target, JSON.stringify(input)).toBe(0);
      expect(steps.find(s => s.type === 'found')?.indices, JSON.stringify(input)).toEqual([0, input.length - 1]);
    }
  });

  it('every other fallback is unchanged: non-zero endpoint sums, single elements, and 10 for an empty array', () => {
    expect(targetOf([])).toBe(10);
    expect(targetOf([7])).toBe(14);
    expect(targetOf([-4])).toBe(-8);
    expect(targetOf([-5, -1, 6])).toBe(1);
    expect(targetOf([2, 5, 8])).toBe(10);
    expect(targetOf([2, 5, 8, 12, 15, 19, 24])).toBe(26);
    for (const s of tp.generateSteps([])) expect(`${s.message} ${s.explanation ?? ''}`).not.toMatch(/undefined|NaN/);
  });
});

// Like Linear and Binary Search (audit L-1): an explicit target: null is not "no target". It used to fall through
// `??` to the endpoint-sum fallback, silently searching for a target nobody asked for. It is now rejected.
describe('Two Pointer: target null is rejected, every number and the omitted-target fallback are kept', () => {
  const targetOf = (input: number[], params?: Record<string, unknown>) => tp.generateSteps([...input], params)[0].variables!.target;

  it('target: null throws a clear TypeError instead of falling back to another target', () => {
    expect(() => tp.generateSteps([-3, 1, 3], { target: null })).toThrow(TypeError);
    expect(() => tp.generateSteps([-3, 1, 3], { target: null })).toThrow(/target is null/i);
    expect(() => tp.generateSteps([], { target: null })).toThrow(TypeError);
  });

  it('through buildExecution, null is a safe generator error with no steps', () => {
    const r = buildExecution('two-pointer', [2, 5, 8], undefined, { target: null });
    expect(r.status).toBe('generator-error');
    expect(r.steps).toEqual([]);
    if (r.status !== 'generator-error') return;
    expect(r.error.kind).toBe('generator-error');
    expect(r.error.message).toBe('The visualization for this algorithm failed to run.');
    expect(r.error.message).not.toMatch(/null|TypeError/);
  });

  it('an omitted target keeps the endpoint-sum fallback, and 10 for an empty array', () => {
    expect(targetOf([2, 5, 8])).toBe(10);
    expect(targetOf([2, 5, 8], {})).toBe(10);
    expect(targetOf([2, 5, 8], { target: undefined })).toBe(10);
    expect(targetOf([-3, 1, 3])).toBe(0);
    expect(targetOf([])).toBe(10);
  });

  it('target 0 is used exactly (no fallback), and an ordinary target is unchanged', () => {
    expect(targetOf([2, 5, 8], { target: 0 })).toBe(0);
    expect(trace([2, 5, 8], 0).some(s => s.type === 'not-found')).toBe(true);
    expect(trace([-3, 1, 3], 0).find(s => s.type === 'found')!.indices).toEqual([0, 2]);
    expect(trace([2, 5, 8, 12, 15, 19, 24], 27).find(s => s.type === 'found')!.indices).toEqual([2, 5]);
    expect(trace([2, 5, 8], 100).some(s => s.type === 'not-found')).toBe(true);
  });
});
