/**
 * AlgorithmRegistry — The single source of truth for ALL algorithm definitions.
 *
 * Each algorithm definition owns its:
 *  - id, name, category, description, complexity
 *  - code (all 4 languages)
 *  - lineMap (codeRef → line number per language)
 *  - generateSteps(input, params) → ExecutionStep[]
 *
 * FAIL-SAFE: If an algorithm is not in this registry, the visualizer never falls back
 * to another algorithm. See buildExecution.ts for how the failure kinds are reported.
 */
import type { AlgorithmId, AlgorithmDefinition, ProgrammingLanguage, VisualKind } from '../types/algorithm';
import { bubbleSortDefinition } from './algorithms/bubbleSort';
import { selectionSortDefinition } from './algorithms/selectionSort';
import { insertionSortDefinition } from './algorithms/insertionSort';
import { linearSearchDefinition } from './algorithms/linearSearch';
import { binarySearchDefinition } from './algorithms/binarySearch';
import { mergeSortDefinition } from './algorithms/mergeSort';
import { quickSortDefinition } from './algorithms/quickSort';
import { heapSortDefinition } from './algorithms/heapSort';
import { twoPointerDefinition } from './algorithms/twoPointer';
import { llTraverseDefinition } from './algorithms/linkedList/traverse';
import { llSearchDefinition } from './algorithms/linkedList/search';
import { llInsertHeadDefinition } from './algorithms/linkedList/insertHead';
import { llInsertTailDefinition } from './algorithms/linkedList/insertTail';
import { llDeleteHeadDefinition } from './algorithms/linkedList/deleteHead';
import { llDeleteTailDefinition } from './algorithms/linkedList/deleteTail';
import { llBuildDefinition } from './algorithms/linkedList/build';
import { llInsertAtDefinition } from './algorithms/linkedList/insertAt';
import { llDeleteAtDefinition } from './algorithms/linkedList/deleteAt';
import { reverseLinkedListDefinition } from './algorithms/linkedList/reverse';
import { primeCheckDefinition } from './algorithms/primeCheck';
import { swapTwoNumbersDefinition } from './algorithms/swapTwoNumbers';
import { twoSumDefinition } from './algorithms/twoSum';
import { majorityElementDefinition } from './algorithms/majorityElement';
import { containerMostWaterDefinition } from './algorithms/containerMostWater';
import { removeDuplicatesSortedDefinition } from './algorithms/removeDuplicatesSorted';

// ─── Registry ──────────────────────────────────────────────────────────────────
const REGISTRY = new Map<AlgorithmId, AlgorithmDefinition>();

function register(def: AlgorithmDefinition) {
  REGISTRY.set(def.id, def);
}

register(bubbleSortDefinition);
register(selectionSortDefinition);
register(insertionSortDefinition);
register(linearSearchDefinition);
register(binarySearchDefinition);
register(mergeSortDefinition);
register(quickSortDefinition);
register(heapSortDefinition);
register(twoPointerDefinition);
register(llTraverseDefinition);
register(llSearchDefinition);
register(llInsertHeadDefinition);
register(llInsertTailDefinition);
register(llDeleteHeadDefinition);
register(llDeleteTailDefinition);
register(llBuildDefinition);
register(llInsertAtDefinition);
register(llDeleteAtDefinition);
register(reverseLinkedListDefinition);
register(primeCheckDefinition);
register(swapTwoNumbersDefinition);
register(twoSumDefinition);
register(majorityElementDefinition);
register(containerMostWaterDefinition);
register(removeDuplicatesSortedDefinition);

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns the full algorithm definition or undefined if not implemented. */
export function getAlgorithmDefinition(id: AlgorithmId): AlgorithmDefinition | undefined {
  return REGISTRY.get(id);
}

/**
 * Resolves a codeRef to a 1-based line number for the given language.
 * Returns null when the step has no codeRef OR the codeRef is not present in the
 * language's line map. It never guesses a line: callers must handle null explicitly
 * (the code panel shows an "unmapped step" state instead of highlighting line 1).
 */
export function resolveCodeRef(
  def: AlgorithmDefinition,
  lang: ProgrammingLanguage,
  codeRef: string | undefined
): number | null {
  if (!codeRef) return null;
  const line = def.lineMap[lang]?.[codeRef];
  return typeof line === 'number' ? line : null;
}

/**
 * The inclusive range of lines a codeRef highlights: `lineLeads` lines before its mapped line (default 0) through
 * `lineSpans` lines from it (default 1). The range always contains what resolveCodeRef returns, and is null in
 * exactly the same cases.
 */
export function resolveCodeRange(
  def: AlgorithmDefinition,
  lang: ProgrammingLanguage,
  codeRef: string | undefined
): { start: number; end: number } | null {
  const line = resolveCodeRef(def, lang, codeRef);
  if (line === null) return null;
  const lead = def.lineLeads?.[lang]?.[codeRef!] ?? 0;
  const span = def.lineSpans?.[lang]?.[codeRef!] ?? 1;
  return { start: line - lead, end: line + span - 1 };
}

/** How a definition's trace is drawn: 'array' unless it declares otherwise (every existing algorithm is 'array'). */
export const visualKindOf = (def: Pick<AlgorithmDefinition, 'visual'> | undefined): VisualKind =>
  def?.visual ?? 'array';

/**
 * Returns the source code string for the given algorithm and language.
 * Returns null if the algorithm is not implemented or the language is unavailable.
 * NEVER falls back to another algorithm's code.
 */
export function getAlgorithmCode(
  id: AlgorithmId,
  lang: ProgrammingLanguage
): string | null {
  const def = REGISTRY.get(id);
  if (!def) return null;
  return def.code[lang] || null;
}

/** Returns all registered algorithm definitions (for sidebar/navigation). */
export function getAllAlgorithms(): AlgorithmDefinition[] {
  return Array.from(REGISTRY.values());
}

/** Returns algorithm definitions for a given category. */
export function getAlgorithmsByCategory(
  category: AlgorithmDefinition['category']
): AlgorithmDefinition[] {
  return Array.from(REGISTRY.values()).filter(d => d.category === category);
}
