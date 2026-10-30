/**
 * TRACE-vs-ENGINE EXPECTATIONS
 *
 * These helpers ask AlgoFlow's own engine what trace it would generate for an input, so a test can check that
 * the UI RENDERS that trace faithfully (messages, highlighted code line, bars, pointers...). They prove
 * UI-to-engine consistency only. They are NOT evidence that the algorithm is correct — that is what
 * `oracles.ts` is for.
 */
import { getAlgorithmDefinition } from '../../src/engine/AlgorithmRegistry';
import { LINE_ANCHORS } from '../../src/engine/__tests__/lineAnchors';
import type { AlgorithmId, ExecutionStep, ProgrammingLanguage } from '../../src/types/algorithm';

export type { AlgorithmId, ExecutionStep, ProgrammingLanguage };

export const ALGORITHMS: Record<string, { id: AlgorithmId; label: string; heading: string }> = {
  'bubble-sort': { id: 'bubble-sort', label: 'Bubble Sort', heading: 'Bubble Sort' },
  'selection-sort': { id: 'selection-sort', label: 'Selection Sort', heading: 'Selection Sort' },
  'insertion-sort': { id: 'insertion-sort', label: 'Insertion Sort', heading: 'Insertion Sort' },
  'merge-sort': { id: 'merge-sort', label: 'Merge Sort', heading: 'Merge Sort' },
  'quick-sort': { id: 'quick-sort', label: 'Quick Sort', heading: 'Quick Sort' },
  'heap-sort': { id: 'heap-sort', label: 'Heap Sort', heading: 'Heap Sort' },
  'linear-search': { id: 'linear-search', label: 'Linear Search', heading: 'Linear Search' },
  'binary-search': { id: 'binary-search', label: 'Binary Search', heading: 'Binary Search' },
  'two-pointer': { id: 'two-pointer', label: 'Two Pointer', heading: 'Two Pointer Technique' },
  'two-sum': { id: 'two-sum', label: 'Two Sum', heading: 'Two Sum' },
  'majority-element': { id: 'majority-element', label: 'Majority Element', heading: 'Majority Element' },
  'container-most-water': { id: 'container-most-water', label: 'Container With Most Water', heading: 'Container With Most Water' },
  'trapping-rain-water': { id: 'trapping-rain-water', label: 'Trapping Rain Water', heading: 'Trapping Rain Water' },
  'merge-sorted-array': { id: 'merge-sorted-array', label: 'Merge Sorted Array', heading: 'Merge Sorted Array' },
  'remove-duplicates-sorted': { id: 'remove-duplicates-sorted', label: 'Remove Duplicates from Sorted Array', heading: 'Remove Duplicates from Sorted Array' },
  'maximum-subarray': { id: 'maximum-subarray', label: 'Maximum Subarray', heading: 'Maximum Subarray' },
  'three-sum': { id: 'three-sum', label: '3Sum', heading: '3Sum' },
};

/** Linked-list operations: drawn as nodes, with their own input form (kept apart from ALGORITHMS, whose specs expect bars). */
export const LIST_ALGORITHMS: Record<string, { id: AlgorithmId; label: string; heading: string }> = {
  'll-build': { id: 'll-build', label: 'Build Linked List', heading: 'Build Linked List' },
  'll-traverse': { id: 'll-traverse', label: 'Traverse Linked List', heading: 'Traverse Linked List' },
  'll-search': { id: 'll-search', label: 'Search Linked List', heading: 'Search Linked List' },
  'll-insert-head': { id: 'll-insert-head', label: 'Insert at Head', heading: 'Insert at Head' },
  'll-insert-tail': { id: 'll-insert-tail', label: 'Insert at Tail', heading: 'Insert at Tail' },
  'll-insert-at': { id: 'll-insert-at', label: 'Insert at Position', heading: 'Insert at Position' },
  'll-delete-head': { id: 'll-delete-head', label: 'Delete at Head', heading: 'Delete at Head' },
  'll-delete-tail': { id: 'll-delete-tail', label: 'Delete at Tail', heading: 'Delete at Tail' },
  'll-delete-at': { id: 'll-delete-at', label: 'Delete at Position', heading: 'Delete at Position' },
  'reverse-linked-list': { id: 'reverse-linked-list', label: 'Reverse Linked List', heading: 'Reverse Linked List' },
};

/** The number algorithms (visual 'numbers'): their input is the values n, or a and b. */
export const NUMBER_ALGORITHMS: Record<string, { id: AlgorithmId; label: string; heading: string }> = {
  'prime-check': { id: 'prime-check', label: 'Prime Number Checker', heading: 'Prime Number Checker' },
  'swap-two-numbers': { id: 'swap-two-numbers', label: 'Swap of Two Numbers', heading: 'Swap of Two Numbers' },
  'valid-perfect-square': { id: 'valid-perfect-square', label: 'Valid Perfect Square', heading: 'Valid Perfect Square' },
  'sqrt-x': { id: 'sqrt-x', label: 'Sqrt(x)', heading: 'Sqrt(x)' },
  'arranging-coins': { id: 'arranging-coins', label: 'Arranging Coins', heading: 'Arranging Coins' },
};

/** The tree traversals (visual 'tree'): their input is one level-order string. */
export const TREE_ALGORITHMS: Record<string, { id: AlgorithmId; label: string; heading: string }> = {
  'tree-inorder': { id: 'tree-inorder', label: 'Inorder Traversal', heading: 'Inorder Traversal' },
  'tree-preorder': { id: 'tree-preorder', label: 'Preorder Traversal', heading: 'Preorder Traversal' },
  'tree-postorder': { id: 'tree-postorder', label: 'Postorder Traversal', heading: 'Postorder Traversal' },
  'tree-level-order': { id: 'tree-level-order', label: 'Level Order Traversal', heading: 'Level Order Traversal' },
};

/** The text algorithms (visual 'text'): their input is strings, one per field. */
export const TEXT_ALGORITHMS: Record<string, { id: AlgorithmId; label: string; heading: string }> = {
  'roman-to-integer': { id: 'roman-to-integer', label: 'Roman to Integer', heading: 'Roman to Integer' },
  'longest-common-prefix': { id: 'longest-common-prefix', label: 'Longest Common Prefix', heading: 'Longest Common Prefix' },
  'valid-parentheses': { id: 'valid-parentheses', label: 'Valid Parentheses', heading: 'Valid Parentheses' },
  'find-first-occurrence': { id: 'find-first-occurrence', label: 'Find the Index of the First Occurrence', heading: 'Find the Index of the First Occurrence' },
  'length-of-last-word': { id: 'length-of-last-word', label: 'Length of Last Word', heading: 'Length of Last Word' },
  'add-binary': { id: 'add-binary', label: 'Add Binary', heading: 'Add Binary' },
  'valid-palindrome': { id: 'valid-palindrome', label: 'Valid Palindrome', heading: 'Valid Palindrome' },
  'valid-palindrome-ii': { id: 'valid-palindrome-ii', label: 'Valid Palindrome II', heading: 'Valid Palindrome II' },
};

/** The parameters a linked-list operation takes, as the app passes them ({ value } and/or { index }). */
export interface ListParams {
  value?: number;
  index?: number;
}

export function engineListSteps(id: AlgorithmId, list: number[], params: ListParams = {}): ExecutionStep[] {
  const d = definition(id);
  const p: Record<string, unknown> = {};
  if (d.inputSpec?.value) p.value = params.value ?? d.inputSpec.value.defaultValue;
  if (d.inputSpec?.index) p.index = params.index;
  return d.generateSteps([...list], Object.keys(p).length ? p : undefined);
}

export const SORT_IDS: AlgorithmId[] = ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort', 'heap-sort'];

export const definition = (id: AlgorithmId) => {
  const d = getAlgorithmDefinition(id);
  if (!d) throw new Error(`Algorithm ${id} is not registered`);
  return d;
};

/** the engine's trace for an input, with the target or (Merge Sorted Array) second array the app would pass */
export function engineSteps(id: AlgorithmId, array: number[], target?: number | null, second?: number[]): ExecutionStep[] {
  const d = definition(id);
  const spec = d.inputSpec;
  const params = spec?.target ? { target } : spec?.secondArray ? { second: [...(second ?? spec.secondArray.defaultValue)] } : undefined;
  return d.generateSteps([...array], params);
}

export function expectedLine(id: AlgorithmId, lang: ProgrammingLanguage, step: ExecutionStep) {
  const d = definition(id);
  const n = d.lineMap[lang][step.codeRef!];
  return { n, text: d.code[lang].split('\n')[n - 1].trim() };
}

/** Intent regex for what a codeRef must highlight (language-neutral, from the line-map test suite). */
export function intentPattern(id: AlgorithmId, step: ExecutionStep): RegExp {
  const a = LINE_ANCHORS[id][step.codeRef!];
  return new RegExp(a.source, a.flags);
}
