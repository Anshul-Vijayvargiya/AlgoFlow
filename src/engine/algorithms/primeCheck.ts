import type { AlgorithmDefinition, ExecutionStep, NumberCell, NumberView } from '../../types/algorithm';

/** the range the input field accepts; at 10,000 the loop checks at most 99 divisors (i = 2 … 100) */
export const PRIME_MIN = -999;
export const PRIME_MAX = 10_000;

/**
 * Trial division: n is prime when no i with 2 <= i and i * i <= n divides it. A divisor larger than √n always pairs
 * with one smaller than √n, so checking up to √n is enough: O(√n) time, O(1) extra space.
 */
export const primeCheckDefinition: AlgorithmDefinition = {
  id: 'prime-check',
  name: 'Prime Number Checker',
  category: 'FUNDAMENTALS',
  visual: 'numbers',
  subtitle: 'Tests divisors from 2 while i × i ≤ n.',
  description:
    'A prime number is greater than 1 and divisible only by 1 and itself. The checker tries every divisor i from 2 while i × i ≤ n: if n % i is 0, n is not prime. Any factor larger than √n pairs with one smaller than √n, so stopping at √n is enough. Numbers up to 1 are not prime.',
  complexity: {
    best: 'O(1)',
    average: 'O(√n)',
    worst: 'O(√n)',
    space: 'O(1)',
    bestFor: 'Checking one number; for many numbers at once, a sieve is faster',
  },
  defaultInput: [29],
  inputSpec: {
    numbers: [{ label: 'n', hint: `A whole number from ${PRIME_MIN} to ${PRIME_MAX.toLocaleString('en-US')}`, min: PRIME_MIN, max: PRIME_MAX, random: [2, 200] }],
  },

  code: {
    c: `#include <stdbool.h>

bool isPrime(int n) {
    if (n <= 1) {
        return false;
    }
    for (int i = 2; i * i <= n; i++) {
        if (n % i == 0) {
            return false;
        }
    }
    return true;
}`,
    cpp: `bool isPrime(int n) {
    if (n <= 1) {
        return false;
    }
    for (int i = 2; i * i <= n; i++) {
        if (n % i == 0) {
            return false;
        }
    }
    return true;
}`,
    java: `public class PrimeCheck {
    public static boolean isPrime(int n) {
        if (n <= 1) {
            return false;
        }
        for (int i = 2; i * i <= n; i++) {
            if (n % i == 0) {
                return false;
            }
        }
        return true;
    }
}`,
    python: `def is_prime(n):
    if n <= 1:
        return False
    i = 2
    while i * i <= n:
        if n % i == 0:
            return False
        i += 1
    return True`,
  },

  lineMap: {
    c: { 'fn-entry': 3, 'check-small': 4, 'return-small': 5, 'init-i': 7, 'loop-condition': 7, 'check-divisor': 8, 'return-divisor': 9, 'increment-i': 7, 'return-prime': 12 },
    cpp: { 'fn-entry': 1, 'check-small': 2, 'return-small': 3, 'init-i': 5, 'loop-condition': 5, 'check-divisor': 6, 'return-divisor': 7, 'increment-i': 5, 'return-prime': 10 },
    java: { 'fn-entry': 2, 'check-small': 3, 'return-small': 4, 'init-i': 6, 'loop-condition': 6, 'check-divisor': 7, 'return-divisor': 8, 'increment-i': 6, 'return-prime': 11 },
    python: { 'fn-entry': 1, 'check-small': 2, 'return-small': 3, 'init-i': 4, 'loop-condition': 5, 'check-divisor': 6, 'return-divisor': 7, 'increment-i': 8, 'return-prime': 9 },
  },

  generateSteps: (input: number[]) => {
    const n = input[0];
    // the app validates the field first; a direct caller with another input gets an explicit refusal (a generator
    // error), never a trace of something else
    if (input.length !== 1 || !Number.isInteger(n) || n < PRIME_MIN || n > PRIME_MAX) {
      throw new RangeError(`Prime Number Checker: pass exactly one whole number n from ${PRIME_MIN} to ${PRIME_MAX}.`);
    }

    const steps: ExecutionStep[] = [];
    const checks: { divisor: number; remainder: number }[] = [];
    // the values on screen: n always; i, i × i and n % i once the loop has started
    const view = (cells: NumberCell[], result?: NumberView['result']): NumberView => ({ cells, divisorChecks: [...checks], ...(result ? { result } : {}) });
    const push = (step: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [n], ...step });

    push({
      type: 'init',
      codeRef: 'fn-entry',
      variables: { n },
      numbers: view([{ name: 'n', value: n, role: 'current' }]),
      message: `Check whether n = ${n} is prime`,
      explanation: 'A prime is greater than 1 and has no divisor other than 1 and itself.',
      actionLabel: 'Start',
    });

    const small = n <= 1;
    push({
      type: 'condition',
      codeRef: 'check-small',
      variables: { n },
      result: small ? 'true' : 'false',
      numbers: view([{ name: 'n', value: n, role: 'current' }]),
      message: `n ≤ 1?  ${n} ≤ 1 → ${small}`,
      explanation: small ? 'Numbers up to 1 (0, 1 and negatives) are not prime by definition.' : 'n is greater than 1, so test its divisors.',
      actionLabel: small ? 'n ≤ 1' : 'n > 1',
    });
    if (small) {
      push({
        type: 'complete',
        codeRef: 'return-small',
        variables: { n, isPrime: false },
        numbers: view([{ name: 'n', value: n }], { kind: 'not-prime', text: `${n} is not prime: numbers up to 1 are not prime.` }),
        message: `return false — ${n} is not prime`,
        explanation: 'No divisor was tested: the answer follows from n ≤ 1.',
        actionLabel: 'Not prime',
      });
      return steps;
    }

    let i = 2;
    push({
      type: 'assign',
      codeRef: 'init-i',
      variables: { n, i },
      numbers: view([{ name: 'n', value: n }, { name: 'i', value: i, role: 'changed' }]),
      message: 'Set i = 2 (the smallest possible divisor)',
      explanation: 'Every divisor from 2 up to √n is tried in order.',
      actionLabel: 'i = 2',
    });

    for (;;) {
      const square = i * i;
      const inLoop = square <= n;
      push({
        type: 'loop-condition',
        codeRef: 'loop-condition',
        variables: { n, i, 'i × i': square },
        result: inLoop ? 'true' : 'false',
        numbers: view([{ name: 'n', value: n }, { name: 'i', value: i, role: 'current' }, { name: 'i × i', value: square, role: 'current' }]),
        message: `i × i ≤ n?  ${i} × ${i} = ${square} ≤ ${n} → ${inLoop}`,
        explanation: inLoop
          ? `${i} is at most √${n}, so it could still be a divisor.`
          : `${i} × ${i} is greater than ${n}: any divisor would have been found already, so the loop ends.`,
        actionLabel: inLoop ? 'Keep checking' : 'Past √n',
      });
      if (!inLoop) break;

      const remainder = n % i;
      checks.push({ divisor: i, remainder });
      const divides = remainder === 0;
      push({
        type: 'compare',
        codeRef: 'check-divisor',
        variables: { n, i, 'n % i': remainder },
        result: divides ? 'true' : 'false',
        numbers: view([{ name: 'n', value: n }, { name: 'i', value: i, role: 'current' }, { name: 'n % i', value: remainder, role: 'changed' }]),
        message: `n % i == 0?  ${n} % ${i} = ${remainder} → ${divides}`,
        explanation: divides ? `${i} divides ${n} exactly (${n} = ${i} × ${n / i}).` : `${i} leaves a remainder of ${remainder}, so it is not a divisor.`,
        actionLabel: divides ? 'Divisor found' : 'Not a divisor',
      });
      if (divides) {
        push({
          type: 'complete',
          codeRef: 'return-divisor',
          variables: { n, i, isPrime: false },
          numbers: view([{ name: 'n', value: n }, { name: 'i', value: i, role: 'current' }], {
            kind: 'not-prime',
            text: `${n} is not prime: ${n} = ${i} × ${n / i}.`,
          }),
          message: `return false — ${n} is not prime (divisible by ${i})`,
          explanation: `Found after checking ${checks.length} divisor${checks.length === 1 ? '' : 's'}.`,
          actionLabel: 'Not prime',
        });
        return steps;
      }

      i += 1;
      push({
        type: 'increment',
        codeRef: 'increment-i',
        variables: { n, i },
        numbers: view([{ name: 'n', value: n }, { name: 'i', value: i, role: 'changed' }]),
        message: `i++  →  i = ${i}`,
        explanation: 'Try the next divisor.',
        actionLabel: `i = ${i}`,
      });
    }

    push({
      type: 'complete',
      codeRef: 'return-prime',
      variables: { n, isPrime: true },
      numbers: view([{ name: 'n', value: n }], {
        kind: 'prime',
        text:
          checks.length === 0
            ? `${n} is prime: no i ≥ 2 has i × i ≤ ${n}, so there is nothing to test.`
            : `${n} is prime: none of the ${checks.length} divisor${checks.length === 1 ? '' : 's'} from 2 to ${checks[checks.length - 1].divisor} divides it.`,
      }),
      message: `return true — ${n} is prime`,
      explanation: `Checking stopped at √${n} ≈ ${Math.sqrt(n).toFixed(2)}.`,
      actionLabel: 'Prime',
    });
    return steps;
  },
};
