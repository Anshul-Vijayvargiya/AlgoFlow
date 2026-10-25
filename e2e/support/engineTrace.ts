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

export function engineSteps(id: AlgorithmId, array: number[], target?: number | null): ExecutionStep[] {
  const d = definition(id);
  return d.generateSteps([...array], d.inputSpec?.target ? { target } : undefined);
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
