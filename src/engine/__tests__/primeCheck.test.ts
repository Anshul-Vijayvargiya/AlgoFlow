import { describe, it, expect } from 'vitest';
import { primeCheckDefinition as prime, PRIME_MAX, PRIME_MIN } from '../algorithms/primeCheck';
import { buildExecution } from '../buildExecution';
import { resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateNumberDraft } from '../inputParsing';
import { LANGUAGES, codeLines } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// The Prime Number Checker's trace: every divisor check, its remainder and the final answer, against an independent
// definition of primality.
const run = (n: number) => prime.generateSteps([n]);
const last = (steps: ExecutionStep[]) => steps[steps.length - 1];
/** an oracle written differently from the generator: count divisors of n among 1..n */
const isPrimeOracle = (n: number) => n > 1 && Array.from({ length: n }, (_, k) => k + 1).filter(d => n % d === 0).length === 2;

describe('Prime Number Checker — results', () => {
  it.each([
    [-999, false], [-5, false], [0, false], [1, false], [2, true], [3, true], [4, false], [9, false], [15, false],
    [25, false], [29, true], [49, false], [97, true], [1000, false], [9973, true], [10000, false],
  ])('n = %i → prime: %s', (n, expected) => {
    const end = last(run(n));
    expect(end.type).toBe('complete');
    expect(end.variables?.isPrime).toBe(expected);
    expect(end.numbers?.result?.kind).toBe(expected ? 'prime' : 'not-prime');
  });

  it('agrees with an independent primality check for every n from -20 to 2,000', () => {
    for (let n = -20; n <= 2000; n++) expect(last(run(n)).variables?.isPrime, `n = ${n}`).toBe(isPrimeOracle(n));
  });

  it('n ≤ 1: answered by the first check, with no divisor tried', () => {
    for (const n of [-999, -1, 0, 1]) {
      const steps = run(n);
      expect(steps.map(s => s.codeRef)).toEqual(['fn-entry', 'check-small', 'return-small']);
      expect(steps[1].result).toBe('true');
      expect(last(steps).numbers?.divisorChecks).toEqual([]);
      expect(last(steps).numbers?.result?.text).toBe(`${n} is not prime: numbers up to 1 are not prime.`);
    }
  });
});

describe('Prime Number Checker — divisor checks (i from 2 while i × i ≤ n)', () => {
  it('tries exactly 2, 3, … up to the first divisor (composite) or ⌊√n⌋ (prime), each with n % i', () => {
    for (let n = 2; n <= 2000; n++) {
      const checks = last(run(n)).numbers?.divisorChecks ?? [];
      const firstDivisor = Array.from({ length: Math.floor(Math.sqrt(n)) - 1 }, (_, k) => k + 2).find(i => n % i === 0);
      const lastTried = firstDivisor ?? Math.floor(Math.sqrt(n));
      expect(checks.map(c => c.divisor), `n = ${n}`).toEqual(Array.from({ length: Math.max(0, lastTried - 1) }, (_, k) => k + 2));
      for (const c of checks) expect(c.remainder, `n = ${n}, i = ${c.divisor}`).toBe(n % c.divisor);
    }
  });

  it('29: checks 2, 3, 4 and 5, then stops because 6 × 6 > 29', () => {
    const steps = run(29);
    expect(last(steps).numbers?.divisorChecks).toEqual([
      { divisor: 2, remainder: 1 }, { divisor: 3, remainder: 2 }, { divisor: 4, remainder: 1 }, { divisor: 5, remainder: 4 },
    ]);
    const exit = steps.filter(s => s.codeRef === 'loop-condition').at(-1)!;
    expect(exit).toMatchObject({ result: 'false', variables: { i: 6, 'i × i': 36 } });
    expect(exit.message).toBe('i × i ≤ n?  6 × 6 = 36 ≤ 29 → false');
    expect(last(steps).numbers?.result?.text).toBe('29 is prime: none of the 4 divisors from 2 to 5 divides it.');
  });

  it('a composite stops at its smallest divisor and says what it is', () => {
    const steps = run(91); // 7 × 13
    const checks = last(steps).numbers?.divisorChecks ?? [];
    expect(checks.at(-1)).toEqual({ divisor: 7, remainder: 0 });
    expect(last(steps)).toMatchObject({ codeRef: 'return-divisor', variables: { isPrime: false, i: 7 } });
    expect(last(steps).numbers?.result?.text).toBe('91 is not prime: 91 = 7 × 13.');
  });

  it('2 and 3: no i ≥ 2 has i × i ≤ n, so the loop never runs', () => {
    for (const n of [2, 3]) {
      const steps = run(n);
      expect(steps.map(s => s.codeRef)).toEqual(['fn-entry', 'check-small', 'init-i', 'loop-condition', 'return-prime']);
      expect(last(steps).numbers?.result?.text).toBe(`${n} is prime: no i ≥ 2 has i × i ≤ ${n}, so there is nothing to test.`);
    }
  });

  it('each step shows the divisor being tested and n % i, and highlights them', () => {
    const steps = run(15);
    const compare = steps.find(s => s.codeRef === 'check-divisor' && s.variables?.i === 3)!;
    expect(compare.numbers?.cells).toEqual([
      { name: 'n', value: 15 },
      { name: 'i', value: 3, role: 'current' },
      { name: 'n % i', value: 0, role: 'changed' },
    ]);
    expect(compare).toMatchObject({ result: 'true', message: 'n % i == 0?  15 % 3 = 0 → true' });
  });

  it('O(√n): at most ⌊√n⌋ - 1 loop iterations, and a constant number of steps per iteration', () => {
    for (const n of [97, 1000, 9973, 10000]) {
      const steps = run(n);
      const iterations = steps.filter(s => s.codeRef === 'check-divisor').length;
      expect(iterations, `n = ${n}`).toBeLessThanOrEqual(Math.floor(Math.sqrt(n)) - 1);
      expect(steps.length, `n = ${n}`).toBeLessThanOrEqual(3 * iterations + 6);
    }
    // the largest prime allowed checks 98 divisors (2 … 99) in fewer than 300 steps
    expect(run(9973).length).toBeLessThan(300);
  });

  it('the state is always [n] (nothing is modified), and steps are numbered from 0', () => {
    const steps = run(49);
    steps.forEach((s, i) => {
      expect(s.state).toEqual([49]);
      expect(s.id).toBe(i);
    });
  });
});

describe('Prime Number Checker — code lines in C, C++, Java and Python', () => {
  it('every step highlights the statement it performs, in every language', () => {
    const expected: Record<string, RegExp> = {
      'fn-entry': /is_?prime\(\s*(int )?n\s*\)/i, 'check-small': /n <= 1/, 'return-small': /return (false|False)/, 'init-i': /i = 2/,
      'loop-condition': /i \* i <= n/, 'check-divisor': /n % i == 0/, 'return-divisor': /return (false|False)/,
      'increment-i': /i\+\+|i \+= 1/, 'return-prime': /return (true|True)/,
    };
    const refs = new Set([1, 2, 4, 29, 91].flatMap(n => run(n).map(s => s.codeRef!)));
    expect([...refs].sort()).toEqual(Object.keys(expected).sort());
    for (const lang of LANGUAGES) {
      const lines = codeLines(prime, lang);
      for (const ref of refs) {
        const line = resolveCodeRef(prime, lang, ref);
        expect(line, `${lang} ${ref}`).not.toBeNull();
        expect(lines[line! - 1], `${lang} ${ref}`).toMatch(expected[ref]);
      }
    }
  });
});

describe('Prime Number Checker — input', () => {
  it(`accepts whole numbers from ${PRIME_MIN} to ${PRIME_MAX} inclusive, and nothing else`, () => {
    for (const n of [PRIME_MIN, -1, 0, 1, 2, 9973, PRIME_MAX]) expect(validateAlgorithmInput(prime, [n], null).ok, String(n)).toBe(true);
    for (const n of [PRIME_MIN - 1, PRIME_MAX + 1, 2.5]) expect(validateAlgorithmInput(prime, [n], null).ok, String(n)).toBe(false);
    expect(validateAlgorithmInput(prime, [], null)).toMatchObject({ ok: false, message: 'Prime Number Checker takes n (1 value).' });
    expect(validateAlgorithmInput(prime, [3, 4], null).ok).toBe(false);
  });

  it('typed text: blank, decimals, words and out-of-range values are explained, and the field is named', () => {
    expect(validateNumberDraft(prime, [' 97 '])).toEqual({ ok: true, values: [97] });
    expect(validateNumberDraft(prime, [''])).toEqual({ ok: false, field: 0, message: 'Enter a value for "n".' });
    expect(validateNumberDraft(prime, ['7.5'])).toMatchObject({ ok: false, message: '"n" ("7.5") is a decimal — only whole numbers are supported.' });
    expect(validateNumberDraft(prime, ['seven'])).toMatchObject({ ok: false, message: '"n" ("seven") is not a whole number.' });
    expect(validateNumberDraft(prime, ['10001'])).toMatchObject({ ok: false, message: '"n" (10001) is out of range — use values from -999 to 10000.' });
  });

  it('a direct call with an invalid input is refused (a generator error), never a trace of something else', () => {
    for (const input of [[], [1, 2], [10001], [-1000], [3.5]]) expect(() => prime.generateSteps(input), JSON.stringify(input)).toThrow(RangeError);
    expect(buildExecution('prime-check', [10001]).status).toBe('generator-error');
    expect(buildExecution('prime-check', [29]).status).toBe('ok');
  });
});
