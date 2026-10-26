import { expect } from 'vitest';
import type { AlgorithmDefinition, ExecutionStep, ProgrammingLanguage } from '../../types/algorithm';
import { getAllAlgorithms, visualKindOf } from '../AlgorithmRegistry';
import { defaultListIndex, validateAlgorithmInput } from '../inputParsing';

export const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];

/** Deterministic PRNG so fuzz failures are reproducible. */
export function makeRng(seed = 20240601) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function randomArrays(count: number, maxLen = 9, seed = 7): number[][] {
  const rnd = makeRng(seed);
  return Array.from({ length: count }, () =>
    Array.from({ length: Math.floor(rnd() * (maxLen + 1)) }, () => Math.floor(rnd() * 30) + 1)
  );
}

/** Fixed edge-case inputs used for every algorithm. */
export const EDGE_INPUTS: Record<string, number[]> = {
  empty: [],
  single: [7],
  duplicates: [2, 2, 1, 2],
  allEqual: [3, 3, 3],
  sorted: [1, 2, 3, 4],
  reversed: [4, 3, 2, 1],
  mixed: [5, 1, 4, 2],
};

export const SORT_IDS = [
  'bubble-sort',
  'selection-sort',
  'insertion-sort',
  'merge-sort',
  'quick-sort',
  'heap-sort',
] as const;

/** Algorithms drawn as bars over a fixed-length numeric array (every algorithm except the linked-list operations). */
export const arrayAlgorithms = () => getAllAlgorithms().filter(d => visualKindOf(d) === 'array');
/** Linked-list operations: their list can grow or shrink, so array-length invariants do not apply to them. */
export const listAlgorithms = () => getAllAlgorithms().filter(d => visualKindOf(d) === 'linked-list');
/** Number algorithms (Prime Number Checker, Swap of Two Numbers): their input is named values ([n]; [a, b]), not an array. */
export const numberAlgorithms = () => getAllAlgorithms().filter(d => visualKindOf(d) === 'numbers');

/**
 * Representative valid inputs for each number algorithm, covering every path (for the prime check: n ≤ 1, the
 * smallest primes with no loop iteration, a square, composites found at 2 and later, primes near the limits).
 */
export const NUMBER_INPUTS: Record<string, number[][]> = {
  'prime-check': [[-999], [-5], [0], [1], [2], [3], [4], [9], [15], [25], [29], [49], [97], [1000], [9973], [10000]],
  'swap-two-numbers': [[5, 9], [0, 0], [7, 7], [-3, 12], [999, -999], [-999, 999]],
};

/** the inputs a generic test should run: the given array inputs, plus a number algorithm's own representative values */
export const inputsWithNumbers = (d: AlgorithmDefinition, arrays: readonly number[][]): number[][] =>
  visualKindOf(d) === 'numbers' ? [d.defaultInput, ...(NUMBER_INPUTS[d.id] ?? [])] : arrays.filter(input => hasDefaultRun(d, input));

/**
 * Whether a call with default parameters has a valid trace: every array algorithm runs on any array, while Delete
 * at Position has no node to delete in an empty list, and a number algorithm runs only on its own values ([n];
 * [a, b], each in range). The app rejects such inputs before running anything; generic registry tests skip them,
 * and a test checks that the generator refuses each one.
 */
export function hasDefaultRun(d: AlgorithmDefinition, input: readonly number[]): boolean {
  // number algorithms, and array algorithms with input rules (Container With Most Water: two or more heights, none
  // negative), run only on input the app would accept
  if (visualKindOf(d) === 'numbers' || d.inputSpec?.minLength !== undefined || d.inputSpec?.minValue !== undefined) {
    return validateAlgorithmInput(d, [...input], null).ok;
  }
  const index = d.inputSpec?.index;
  return !index || defaultListIndex(index, input.length) !== null;
}

export function def(id: string): AlgorithmDefinition {
  const d = getAllAlgorithms().find(a => a.id === id);
  if (!d) throw new Error(`Algorithm "${id}" is not registered`);
  return d;
}

export const sortedCopy = (a: number[]) => [...a].sort((x, y) => x - y);
export const sameMultiset = (a: number[], b: number[]) =>
  JSON.stringify(sortedCopy(a)) === JSON.stringify(sortedCopy(b));

export function lastOfType(steps: ExecutionStep[], type: ExecutionStep['type']) {
  return [...steps].reverse().find(s => s.type === type);
}

export function codeLines(d: AlgorithmDefinition, lang: ProgrammingLanguage): string[] {
  return d.code[lang].split('\n');
}

/**
 * A compare step's highlighted bars must hold the values the step says it compares.
 * Two highlighted bars → exactly [val1, val2]. One highlighted bar → it must hold one of the two
 * values (Linear Search compares a bar to a target that is not on any bar; Merge Sort's left
 * value may exist only in its temporary buffer — mergeSort.test.ts pins which side it is).
 */
export function expectCompareHighlightsAgree(s: ExecutionStep, label: string) {
  if (!s.comparedValues || !s.indices) return;
  const { val1, val2 } = s.comparedValues;
  if (s.indices.length === 2) {
    expect([s.state[s.indices[0]], s.state[s.indices[1]]], `${label} step ${s.id}: ${s.message}`).toEqual([val1, val2]);
  } else {
    expect(s.indices, `${label} step ${s.id}: compare step highlights nothing`).toHaveLength(1);
    expect([val1, val2], `${label} step ${s.id}: ${s.message}`).toContain(s.state[s.indices[0]]);
  }
}
