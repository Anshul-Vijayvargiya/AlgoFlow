import type { UiState } from './visualizerApp';

/** Indices of the bars the UI shows as MATCH (found). */
export const foundIndices = (s: UiState): number[] => s.bars.filter(b => b.role === 'found').map(b => b.index);

/** Drops consecutive duplicates. */
export function dedupe<T>(items: T[]): T[] {
  return items.filter((x, i) => i === 0 || x !== items[i - 1]);
}

/** index of the bar carrying a pointer label, or undefined */
export const pointerAt = (s: UiState, label: string): number | undefined => s.bars.find(b => b.pointers.includes(label))?.index;
