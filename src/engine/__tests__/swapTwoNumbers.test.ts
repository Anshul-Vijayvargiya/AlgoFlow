import { describe, it, expect } from 'vitest';
import { swapTwoNumbersDefinition as swap, SWAP_MAX, SWAP_MIN } from '../algorithms/swapTwoNumbers';
import { resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateNumberDraft } from '../inputParsing';
import { LANGUAGES, codeLines } from './testUtils';

// Swap of Two Numbers: temp = a, a = b, b = temp, with the values after every statement.
const run = (a: number, b: number) => swap.generateSteps([a, b]);
const values = (s: ReturnType<typeof run>[number]) => Object.fromEntries((s.numbers?.cells ?? []).map(c => [c.name, c.value]));

describe('Swap of Two Numbers — steps', () => {
  it('runs temp = a, a = b, b = temp in order, with the values after each statement', () => {
    const steps = run(5, 9);
    expect(steps.map(s => s.codeRef)).toEqual(['fn-entry', 'assign-temp', 'assign-a', 'assign-b', 'fn-exit']);
    expect(steps.map(values)).toEqual([
      { a: 5, b: 9, temp: null },
      { a: 5, b: 9, temp: 5 },
      { a: 9, b: 9, temp: 5 },
      { a: 9, b: 5, temp: 5 },
      { a: 9, b: 5, temp: 5 },
    ]);
    // the input values as they are at each step (generic consumers read `state`)
    expect(steps.map(s => s.state)).toEqual([[5, 9], [5, 9], [9, 9], [9, 5], [9, 5]]);
    expect(steps.map(s => s.type)).toEqual(['init', 'assign', 'assign', 'assign', 'complete']);
  });

  it('each assignment marks the variable it writes as changed and the one it reads as in use', () => {
    const roles = run(5, 9).slice(1, 4).map(s => Object.fromEntries((s.numbers?.cells ?? []).filter(c => c.role).map(c => [c.name, c.role])));
    expect(roles).toEqual([
      { temp: 'changed', a: 'current' },
      { a: 'changed', b: 'current' },
      { b: 'changed', temp: 'current' },
    ]);
  });

  it('messages name the statement and its result; the last step gives the swapped values', () => {
    const steps = run(5, 9);
    expect(steps.map(s => s.message)).toEqual(['Swap a = 5 and b = 9', 'temp = a  →  temp = 5', 'a = b  →  a = 9', 'b = temp  →  b = 5', 'Done — a = 9, b = 5']);
    expect(steps[4].numbers?.result).toEqual({ kind: 'swapped', text: 'Swapped: a = 9, b = 5 (they were a = 5, b = 9).' });
    expect(steps[4].explanation).toContain('O(1) time and O(1) extra space');
  });

  it.each([[0, 0], [7, 7], [-3, 12], [SWAP_MAX, SWAP_MIN], [SWAP_MIN, SWAP_MAX]])('swaps %i and %i (equal, negative and extreme values)', (a, b) => {
    const end = run(a, b).at(-1)!;
    expect(end.state).toEqual([b, a]);
    expect(end.variables).toEqual({ a: b, b: a });
  });

  it('always five steps, whatever the values: O(1) time', () => {
    for (const [a, b] of [[1, 2], [999, -999], [0, 0]]) expect(run(a, b)).toHaveLength(5);
  });
});

describe('Swap of Two Numbers — code lines in C, C++, Java and Python', () => {
  it('each assignment highlights its own statement in every language', () => {
    const expected: Record<string, RegExp> = {
      'assign-temp': /int temp = \*?a;|^\s*temp = a$/,
      'assign-a': /^\s*\*?a = \*?b;?$/,
      'assign-b': /^\s*\*?b = temp;?$/,
    };
    for (const lang of LANGUAGES) {
      const lines = codeLines(swap, lang);
      for (const [ref, pattern] of Object.entries(expected)) expect(lines[resolveCodeRef(swap, lang, ref)! - 1], `${lang} ${ref}`).toMatch(pattern);
      // the three assignments are three consecutive lines, in order
      const at = ['assign-temp', 'assign-a', 'assign-b'].map(ref => resolveCodeRef(swap, lang, ref)!);
      expect(at[1] - at[0]).toBe(1);
      expect(at[2] - at[1]).toBe(1);
    }
  });

  it('the end of the swap: Java and Python return the pair; C and C++ change the caller\'s variables (void)', () => {
    expect(codeLines(swap, 'java')[resolveCodeRef(swap, 'java', 'fn-exit')! - 1]).toMatch(/return new int\[\] \{ a, b \}/);
    expect(codeLines(swap, 'python')[resolveCodeRef(swap, 'python', 'fn-exit')! - 1]).toMatch(/return a, b/);
    expect(swap.code.c).toMatch(/void swapNumbers\(int \*a, int \*b\)/);
    expect(swap.code.cpp).toMatch(/void swapNumbers\(int& a, int& b\)/);
  });
});

describe('Swap of Two Numbers — input', () => {
  it(`takes exactly a and b, each a whole number from ${SWAP_MIN} to ${SWAP_MAX}`, () => {
    expect(validateAlgorithmInput(swap, [5, 9], null).ok).toBe(true);
    expect(validateAlgorithmInput(swap, [5], null)).toMatchObject({ ok: false, message: 'Swap of Two Numbers takes a and b (2 values).' });
    expect(validateAlgorithmInput(swap, [1, 2, 3], null).ok).toBe(false);
    expect(validateAlgorithmInput(swap, [SWAP_MAX + 1, 0], null).ok).toBe(false);
    expect(validateNumberDraft(swap, ['5', ''])).toEqual({ ok: false, field: 1, message: 'Enter a value for "b".' });
    expect(validateNumberDraft(swap, ['-3', ' 12'])).toEqual({ ok: true, values: [-3, 12] });
  });

  it('a direct call with an invalid input is refused', () => {
    for (const input of [[], [1], [1, 2, 3], [1000, 0], [1.5, 2]]) expect(() => swap.generateSteps(input), JSON.stringify(input)).toThrow(RangeError);
  });
});
