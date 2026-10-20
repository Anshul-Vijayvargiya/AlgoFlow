/**
 * INDEPENDENT ALGORITHM ORACLES
 *
 * Everything in this file is written from the problem definitions, not from AlgoFlow's code: it imports
 * nothing from `src/`. Tests use these to decide what the correct answer is, so that a mistake in an
 * AlgoFlow generator cannot also be baked into the expectation.
 *
 * Where several answers are valid (duplicates), the oracles expose a VALIDITY predicate rather than one
 * index, and tests only require a specific index when the algorithm promises it (Linear Search → first
 * occurrence).
 */

export interface LinearResult {
  /** index of the FIRST occurrence, or -1 */
  index: number;
  /** values examined, in order (a linear scan stops at the first match) */
  examined: number[];
}

/** Linear Search promises: scan left to right, stop at the first match. */
export function linearSearchOracle(array: number[], target: number): LinearResult {
  const examined: number[] = [];
  for (let i = 0; i < array.length; i++) {
    examined.push(array[i]);
    if (array[i] === target) return { index: i, examined };
  }
  return { index: -1, examined };
}

/** Is `index` a correct Binary Search answer on a SORTED array? (any matching index is correct) */
export function isValidSearchAnswer(array: number[], target: number, index: number): boolean {
  if (index === -1) return !array.includes(target);
  return Number.isInteger(index) && index >= 0 && index < array.length && array[index] === target;
}

/**
 * The probe sequence (mid indices) of the textbook iterative binary search
 * `mid = low + (high - low) / 2` that AlgoFlow displays. Only meaningful for sorted arrays; for arrays with
 * duplicates the probes are still deterministic, but tests use `isValidSearchAnswer` for the answer itself.
 */
export function binarySearchProbes(array: number[], target: number): number[] {
  const probes: number[] = [];
  let low = 0;
  let high = array.length - 1;
  while (low <= high) {
    const mid = low + Math.floor((high - low) / 2);
    probes.push(mid);
    if (array[mid] === target) break;
    if (array[mid] < target) low = mid + 1;
    else high = mid - 1;
  }
  return probes;
}

/** Brute force: does ANY pair of distinct positions i < j sum to the target? (no sortedness assumed) */
export function pairExists(array: number[], target: number): boolean {
  for (let i = 0; i < array.length; i++) for (let j = i + 1; j < array.length; j++) if (array[i] + array[j] === target) return true;
  return false;
}

/** Is (i, j) a correct Two Pointer answer? Two DISTINCT positions whose values sum to the target. */
export function isValidPair(array: number[], target: number, i: number, j: number): boolean {
  return (
    Number.isInteger(i) &&
    Number.isInteger(j) &&
    i !== j &&
    i >= 0 &&
    j >= 0 &&
    i < array.length &&
    j < array.length &&
    array[i] + array[j] === target
  );
}

export const sortedAscending = (array: number[]): number[] => [...array].sort((a, b) => a - b);

export const isNonDecreasing = (array: number[]): boolean => array.every((v, i) => i === 0 || array[i - 1] <= v);

/** Same elements with the same multiplicities (order ignored). */
export function isPermutation(a: number[], b: number[]): boolean {
  return a.length === b.length && sortedAscending(a).every((v, i) => v === sortedAscending(b)[i]);
}

/**
 * Linked-list operations, computed independently on a plain array: the list read from HEAD after the operation, and
 * (Search) the first matching position or -1. The engine is never consulted.
 */
export function listOracle(id: string, list: number[], params: { value?: number; index?: number }): { list: number[]; found?: number } {
  const out = [...list];
  const { value = NaN, index = NaN } = params;
  switch (id) {
    case 'll-build':
    case 'll-traverse':
      return { list: out };
    case 'll-search':
      return { list: out, found: out.indexOf(value) };
    case 'll-insert-head':
      return { list: [value, ...out] };
    case 'll-insert-tail':
      return { list: [...out, value] };
    case 'll-insert-at':
      out.splice(index, 0, value);
      return { list: out };
    case 'll-delete-head':
      return { list: out.slice(1) };
    case 'll-delete-tail':
      return { list: out.slice(0, -1) };
    case 'll-delete-at':
      out.splice(index, 1);
      return { list: out };
    case 'reverse-linked-list':
      return { list: out.reverse() };
    default:
      throw new Error(`no list oracle for ${id}`);
  }
}
