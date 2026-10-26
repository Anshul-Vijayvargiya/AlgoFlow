import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';

// As in listPanels.render.test: static rendering reads the store's initial state, so the store hook is replaced by
// one serving chosen values (only InputPanel reads it here; ArrayVisualizer takes its step as a prop).
const store = vi.hoisted(() => ({
  selectedAlgorithm: 'container-most-water' as string,
  array: [1, 8, 6, 2, 5, 4, 8, 3, 7] as number[],
  target: null as number | null,
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

// Container With Most Water in the real ArrayVisualizer: the container overlay (current water + best outline), the
// value cards and the outcome; and the input panel's rules for heights.
const steps = getAlgorithmDefinition('container-most-water')!.generateSteps([1, 8, 6, 2, 5, 4, 8, 3, 7]);
const at = (pick: (s: ExecutionStep) => boolean) => steps.findIndex(pick);
/** the overlay's containers as drawn: kind → its data attributes */
const containers = (html: string) =>
  Object.fromEntries(
    [...html.matchAll(/data-container="(current|best)" data-left="(\d+)" data-right="(\d+)" data-level="(\d+)" data-area="(\d+)"/g)].map(m => [
      m[1],
      { left: Number(m[2]), right: Number(m[3]), level: Number(m[4]), area: Number(m[5]) },
    ])
  );
const cardValue = (html: string, name: string) => {
  const start = html.indexOf(`data-number-cell="${name}"`);
  return /data-number-value="[^"]*">(.*?)<\/dd>/.exec(html.slice(start))![1].replace(/<[^>]+>/g, '');
};

describe('Container With Most Water in the array view', () => {
  it('the area step: the water between left and right at the shorter height, labelled with its area; pointers on both lines', () => {
    const html = renderStep('container-most-water', steps, at(s => s.codeRef === 'calc-area'));
    expect(containers(html)).toEqual({ current: { left: 0, right: 8, level: 1, area: 8 } });
    expect(html).toContain('>area 8</span>');
    const bars = parseBars(html);
    expect(bars[0].pointers).toEqual(['left']);
    expect(bars[8].pointers).toEqual(['right']);
    // the overlay is decoration: the same facts are in the value cards (and the step message)
    expect(html).toMatch(/data-container="current"[^>]*aria-hidden="true"/);
    expect(cardValue(html, 'area')).toBe('8');
    expect(cardValue(html, 'width')).toBe('8');
    expect(cardValue(html, 'h')).toBe('1');
  });

  it('later: the current container and the best so far (dashed), each with its own label', () => {
    const k = at(s => s.codeRef === 'calc-area' && s.variables!.area === 49);
    const html = renderStep('container-most-water', steps, k + 1);
    expect(containers(html)).toEqual({
      current: { left: 1, right: 8, level: 7, area: 49 },
      best: { left: 0, right: 8, level: 1, area: 8 },
    });
    expect(html).toContain('>best 8</span>');
    expect(html).toMatch(/data-container="best"[^>]*class="[^"]*border-dashed/);
  });

  it('between containers (width, h steps) only the best is drawn', () => {
    const html = renderStep('container-most-water', steps, at(s => s.codeRef === 'calc-height' && s.variables!.h === 7));
    expect(Object.keys(containers(html))).toEqual(['best']);
    expect(cardValue(html, 'area')).toBe('—not set');
  });

  it('the end: the best pair is locked as found, its container outlined, and the banner gives the area and the indices', () => {
    const html = renderStep('container-most-water', steps, steps.length - 1);
    expect(rolesOf(parseBars(html), 'found')).toEqual([1, 8]);
    expect(containers(html)).toEqual({ best: { left: 1, right: 8, level: 7, area: 49 } });
    expect(html).toMatch(/data-outcome-kind="found"[^>]*>.*Max area 49: lines 1 and 8 \(min\(8, 7\) × 7\)<\/div>/);
    expect(cardValue(html, 'maxArea')).toBe('49');
    expect(cardValue(html, 'bestLeft')).toBe('1');
    expect(cardValue(html, 'bestRight')).toBe('8');
  });

  it('no other array algorithm draws a container', () => {
    const bubble = getAlgorithmDefinition('bubble-sort')!.generateSteps([3, 1, 2]);
    expect(renderStep('bubble-sort', bubble, 2)).not.toContain('data-container');
  });
});

describe('the input panel for heights', () => {
  it('says 2 to 16 values from 0, and never offers an empty array', () => {
    const html = renderToStaticMarkup(<InputPanel />);
    expect(html).toContain('2 to 16 whole numbers (0 to 999)');
    expect(html).not.toContain('Leave the array blank');
    expect(html).not.toContain('target-input');
  });
});
