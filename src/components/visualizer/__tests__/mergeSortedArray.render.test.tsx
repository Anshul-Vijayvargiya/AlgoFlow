import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';

// As in listPanels.render.test: static rendering reads the store's initial state, so the store hook is replaced by
// one serving chosen values (only InputPanel reads it; ArrayVisualizer takes its step as a prop).
const store = vi.hoisted(() => ({
  selectedAlgorithm: 'merge-sorted-array' as string,
  array: [1, 2, 3] as number[],
  target: null as number | null,
  second: [2, 5, 6] as number[] | null,
  inputNotice: null as unknown,
  applyInput: () => ({ ok: true }),
  sortInputCopy: () => ({ ok: true }),
  restoreOriginalInput: () => {},
}));
vi.mock('../../../store/useVisualizerStore', () => ({
  useVisualizerStore: (selector?: (s: typeof store) => unknown) => (selector ? selector(store) : store),
}));

const { InputPanel } = await import('../InputPanel');
const { parseBars, renderStep, rolesOf } = await import('./visualTestUtils');

// Merge Sorted Array in the real ArrayVisualizer (nums1 as bars with i / k, nums2 as a row with j) and its input panel.
const steps = getAlgorithmDefinition('merge-sorted-array')!.generateSteps([1, 2, 3], { second: [2, 5, 6] });
const at = (pick: (s: ExecutionStep) => boolean) => steps.findIndex(pick);
const render = (k: number) => renderStep('merge-sorted-array', steps, k);

describe('Merge Sorted Array in the array view', () => {
  it('nums2 is a row labelled "nums2" with its cursor j; i and k sit under nums1’s bars', () => {
    const html = render(at(s => s.codeRef === 'compare'));
    expect(html).toMatch(/data-buffer="nums2"[^>]*><span class="[^"]*">nums2<\/span>/);
    expect([...html.matchAll(/data-buffer-cell="(\d)" data-buffer-active="(true|false)"/g)].map(m => m[2])).toEqual(['false', 'false', 'true']);
    expect(html).toContain('>j = 2</span>');
    const bars = parseBars(html);
    expect(bars[2].pointers).toEqual(['i']);
    expect(bars[5].pointers).toEqual(['k']);
    // the placeholders show their 0 until written; no bar is outside the range (so none is dimmed)
    expect([...html.matchAll(/data-bar-index="(\d+)"[^>]*data-value="(-?\d+)"/g)].map(m => Number(m[2]))).toEqual([1, 2, 3, 0, 0, 0]);
    expect(bars.every(b => b.inRange)).toBe(true);
  });

  it('a write: ASSIGN on the slot written, which then counts as final once k moves on', () => {
    const k = at(s => s.codeRef === 'write-from-first');
    const html = render(k);
    expect(rolesOf(parseBars(html), 'assign')).toEqual([2, 3]);
    expect(html).toMatch(/data-bar-index="3" data-role="assign"[^>]*data-value="3"/);
    expect(rolesOf(parseBars(render(k + 2)), 'sorted')).toEqual([3, 4, 5]);
  });

  it('the end: every slot final, no pointers, and the banner gives the merged array', () => {
    const html = render(steps.length - 1);
    const bars = parseBars(html);
    expect(rolesOf(bars, 'sorted')).toEqual([0, 1, 2, 3, 4, 5]);
    expect(bars.flatMap(b => b.pointers)).toEqual([]);
    expect(html).toMatch(/data-outcome-kind="sorted"[^>]*>.*Merged: \[1, 2, 2, 3, 5, 6\]<\/div>/);
  });

  it('Merge Sort’s buffer rows keep their names ("left buffer", cursor i)', () => {
    const ms = getAlgorithmDefinition('merge-sort')!.generateSteps([5, 2, 4, 1]);
    const k = ms.findIndex(s => (s.buffers ?? []).some(b => b.name === 'left' && b.cursor !== undefined));
    const html = renderStep('merge-sort', ms, k);
    expect(html).toContain('>left buffer</span>');
    expect(html).toMatch(/>i = \d<\/span>/);
  });
});

describe('the input panel with a second array', () => {
  it('nums1 and nums2 fields with the applied values, and a hint about both', () => {
    const html = renderToStaticMarkup(<InputPanel />);
    expect(html).toMatch(/<label for="array-input"[^>]*>.*?nums1<\/label>/);
    expect(html).toMatch(/<label for="second-input"[^>]*>.*?nums2<\/label>/);
    expect(html).toMatch(/id="array-input"[^>]*value="1, 2, 3"/);
    expect(html).toMatch(/id="second-input"[^>]*value="2, 5, 6"/);
    expect(html).toContain('nums1 and nums2: up to 16 whole numbers together (-999 to 999), separated by commas; each must be sorted ascending.');
    expect(html).not.toContain('Leave the array blank');
    expect(html).not.toContain('target-input');
  });

  it('other algorithms keep one "Array" field and their hint', () => {
    store.selectedAlgorithm = 'bubble-sort';
    store.second = null;
    const html = renderToStaticMarkup(<InputPanel />);
    store.selectedAlgorithm = 'merge-sorted-array';
    store.second = [2, 5, 6];
    expect(html).toMatch(/<label for="array-input"[^>]*>.*?Array<\/label>/);
    expect(html).not.toContain('second-input');
    expect(html).toContain('Up to 16 whole numbers (-999 to 999), separated by commas.');
    expect(html).toContain('Leave the array blank for an empty array.');
  });
});
