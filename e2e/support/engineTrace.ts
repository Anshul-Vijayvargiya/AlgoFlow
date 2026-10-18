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
  'linear-search': { id: 'linear-search', label: 'Linear Search', heading: 'Linear Search' },
  'binary-search': { id: 'binary-search', label: 'Binary Search', heading: 'Binary Search' },
  'two-pointer': { id: 'two-pointer', label: 'Two Pointer', heading: 'Two Pointer Technique' },
};

export const SORT_IDS: AlgorithmId[] = ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort'];

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
