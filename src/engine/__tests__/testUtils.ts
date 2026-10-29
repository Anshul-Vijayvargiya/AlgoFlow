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
  // the binary searches: 0, 1, perfect and non-perfect squares, and the largest values (2^31 - 1, 46341² - 1)
  'valid-perfect-square': [[0], [1], [2], [4], [14], [16], [25], [26], [808201], [2147395600], [2147395601], [2147483647]],
  'sqrt-x': [[0], [1], [2], [3], [4], [8], [15], [16], [99], [100], [2147395599], [2147395600], [2147483647]],
  'arranging-coins': [[0], [1], [2], [3], [5], [6], [8], [10], [1000], [2147450880], [2147483647]],
};

/** Tree traversals: their input is one level-order string (params.texts), never an array. */
export const treeAlgorithms = () => getAllAlgorithms().filter(d => visualKindOf(d) === 'tree');

/** representative trees for the traversals (one level-order string each) */
export const TREE_TEST_INPUTS: string[][] = [
  ['[1, 2, 3, 4, 5, null, 6]'],
  ['[4, 2, 6, 1, 3, 5, 7]'],
  ['[1, null, 2, 3]'],
  ['[1, 2, null, 3, null, 4]'],
  ['[1, null, 2, null, 3, null, 4]'],
  ['[3, 9, 20, null, null, 15, 7]'],
  ['[5, 3, 8, 1, 4, null, 9, null, 2]'],
  ['[1]'],
  ['[]'],
  ['[-5, 0, 999, -999]'],
];

/** Text algorithms (Roman to Integer, Valid Parentheses…): their input is strings (params.texts), never an array. */
export const textAlgorithms = () => getAllAlgorithms().filter(d => visualKindOf(d) === 'text');

/**
 * Representative valid inputs for each text algorithm (one string per field), covering every path: LeetCode's examples,
 * the shortest inputs and the branches each algorithm has (a mismatch, an early return, a final carry…).
 */
export const TEXT_INPUTS: Record<string, string[][]> = {
  'roman-to-integer': [['III'], ['LVIII'], ['MCMXCIV'], ['I'], ['IV'], ['IX'], ['XL'], ['CD'], ['MMMCMXCIX'], ['DCCCXC']],
  'longest-common-prefix': [['flower, flow, flight'], ['dog, racecar, car'], ['a'], [''], ['ab, a'], ['a, ab'], ['abc, abc, abc'], [', abc'], ['abc, ']],
  'valid-parentheses': [['()'], ['()[]{}'], ['(]'], ['([])'], ['([)]'], ['(('], [')'], ['{[()()]}'], ['('], [']']],
  'find-first-occurrence': [['sadbutsad', 'sad'], ['leetcode', 'leeto'], ['a', 'a'], ['a', 'ab'], ['mississippi', 'issip'], ['hello', 'll'], ['abc', 'c'], ['aaa', 'aaaa']],
  'length-of-last-word': [['Hello World'], ['   fly me   to   the moon  '], ['luffy is still joyboy'], ['a'], ['a '], [' a'], ['day  ']],
  'add-binary': [['11', '1'], ['1010', '1011'], ['0', '0'], ['1', '0'], ['0', '1'], ['1111', '1'], ['100', '110010'], ['111111111111', '111111111111']],
  'valid-palindrome': [['A man, a plan, a canal: Panama'], ['race a car'], [' '], ['0P'], ['a'], ['.,'], ['ab_a'], ['Madam']],
  // already a palindrome, the first deletion works, only the second works, neither works, the shortest inputs
  // the tree traversals: balanced, unbalanced (left- and right-leaning), missing children, one node, the empty tree
  'tree-inorder': TREE_TEST_INPUTS,
  'tree-preorder': TREE_TEST_INPUTS,
  'tree-postorder': TREE_TEST_INPUTS,
  'tree-level-order': TREE_TEST_INPUTS,
  'valid-palindrome-ii': [['racecar'], ['abca'], ['cbbcc'], ['abc'], ['a'], ['aa'], ['ab'], ['deeee'], ['eeccccbebaeeabebccceea'], ['ebcbbececabbacecbbcbe']],
};

/** the inputs a generic test should run: the given array inputs, plus a number algorithm's own representative values */
export const inputsWithNumbers = (d: AlgorithmDefinition, arrays: readonly number[][]): number[][] =>
  visualKindOf(d) === 'numbers'
    ? [d.defaultInput, ...(NUMBER_INPUTS[d.id] ?? [])]
    : // a text or tree algorithm's input array is always empty; its strings come from params.texts (or its default example)
      visualKindOf(d) === 'text' || visualKindOf(d) === 'tree'
      ? [d.defaultInput]
      : arrays.filter(input => hasDefaultRun(d, input));

/**
 * Whether a call with default parameters has a valid trace: every array algorithm runs on any array, while Delete
 * at Position has no node to delete in an empty list, and a number algorithm runs only on its own values ([n];
 * [a, b], each in range). The app rejects such inputs before running anything; generic registry tests skip them,
 * and a test checks that the generator refuses each one.
 */
export function hasDefaultRun(d: AlgorithmDefinition, input: readonly number[]): boolean {
  // number algorithms, and array algorithms with input rules (Container With Most Water: two or more heights, none
  // negative), run only on input the app would accept
  // a text or tree algorithm takes no array: called without params it runs on its default example
  if (visualKindOf(d) === 'text' || visualKindOf(d) === 'tree') return input.length === 0;
  if (visualKindOf(d) === 'numbers' || d.inputSpec?.minLength !== undefined || d.inputSpec?.minValue !== undefined) {
    return validateAlgorithmInput(d, [...input], null).ok;
  }
  const index = d.inputSpec?.index;
  return !index || defaultListIndex(index, input.length) !== null;
}

/**
 * How many values a trace of `input` (with default parameters) shows: the input's length, plus the example second
 * array's for an algorithm that takes one (Merge Sorted Array's nums1 grows by nums2's length).
 */
export const traceLength = (d: AlgorithmDefinition, input: readonly number[]) => input.length + (d.inputSpec?.secondArray?.defaultValue.length ?? 0);

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
