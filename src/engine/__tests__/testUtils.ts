import { expect } from 'vitest';
import type { AlgorithmDefinition, ExecutionStep, ProgrammingLanguage } from '../../types/algorithm';
import { getAllAlgorithms } from '../AlgorithmRegistry';

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
] as const;

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
