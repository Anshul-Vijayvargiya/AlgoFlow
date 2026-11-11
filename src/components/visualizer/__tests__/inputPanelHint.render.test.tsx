import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { AlgorithmId } from '../../../types/algorithm';

// As in containerMostWater.render.test: static rendering reads the store's initial state, so the store hook is replaced
// by one serving chosen values (only InputPanel reads it here).
const store = vi.hoisted(() => ({
  selectedAlgorithm: 'array-sort-colors' as string,
  array: [2, 0, 2, 1, 1, 0] as number[],
  target: null as number | null,
  second: null as number[] | null,
  inputNotice: null as unknown,
  applyInput: () => ({ ok: true }),
  sortInputCopy: () => ({ ok: true }),
  restoreOriginalInput: () => {},
}));
vi.mock('../../../store/useVisualizerStore', () => ({
  useVisualizerStore: (selector?: (s: typeof store) => unknown) => (selector ? selector(store) : store),
}));

const { InputPanel } = await import('../InputPanel');

/** the hint under the array field for an algorithm with its own example loaded, as plain text */
function hint(id: AlgorithmId): string {
  const def = getAlgorithmDefinition(id)!;
  store.selectedAlgorithm = id;
  store.array = [...def.defaultInput];
  store.target = def.inputSpec?.target?.defaultValue ?? null;
  store.second = def.inputSpec?.secondArray ? [...def.inputSpec.secondArray.defaultValue] : null;
  const html = renderToStaticMarkup(<InputPanel />);
  return html.match(/<p id="input-hint"[^>]*>(.*?)<\/p>/s)![1].replace(/<svg.*?<\/svg>/s, '').replace(/<[^>]+>/g, '').replace(/<!-- -->/g, '').replace(/&quot;/g, '"');
}

// The hint under the array field states the algorithm's real limits: how many values (inputSpec.minLength and
// maxLength) and which values (inputSpec.minValue and maxValue), each falling back to the visualizer's own limit.
describe('the array input hint follows the algorithm’s own limits', () => {
  it('Sort Colors: 1 to 10 whole numbers (0 to 2)', () => {
    const text = hint('array-sort-colors');
    expect(text).toContain('1 to 10 whole numbers (0 to 2), separated by commas.');
    expect(text).not.toContain('999');
    expect(text).not.toContain('16');
    expect(text).not.toContain('Leave the array blank');
  });

  it('Move Zeroes: 1 to 10 whole numbers, still over the whole range (-999 to 999)', () => {
    const text = hint('array-move-zeroes');
    expect(text).toContain('1 to 10 whole numbers (-999 to 999), separated by commas.');
    expect(text).not.toContain('16');
  });

  it('algorithms with a minimum length and no maximum keep the visualizer’s 16', () => {
    expect(hint('container-most-water')).toContain('2 to 16 whole numbers (0 to 999), separated by commas.');
    expect(hint('maximum-subarray')).toContain('1 to 16 whole numbers (-999 to 999), separated by commas.');
  });

  it('algorithms with no limits of their own are unchanged', () => {
    expect(hint('bubble-sort')).toContain('Up to 16 whole numbers (-999 to 999), separated by commas.');
    expect(hint('bubble-sort')).toContain('Leave the array blank for an empty array.');
    expect(hint('trapping-rain-water')).toContain('Up to 16 whole numbers (0 to 999), separated by commas.');
    expect(hint('heap-last-stone-weight')).toContain('Up to 10 whole numbers (1 to 999), separated by commas.');
    expect(hint('merge-sorted-array')).toContain('nums1 and nums2: up to 16 whole numbers together (-999 to 999), separated by commas; each must be sorted ascending.');
  });
});
