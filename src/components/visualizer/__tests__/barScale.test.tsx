import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrayVisualizer } from '../ArrayVisualizer';
import { barHeightPercent } from '../barVisuals';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import { parseBars } from './visualTestUtils';

describe('bar heights with negative values', () => {
  it('non-negative arrays keep proportional heights (unchanged behaviour)', () => {
    const h = barHeightPercent([10, 50, 100]);
    expect(h(100)).toBe(88); // capped
    expect(h(50)).toBeCloseTo(50);
    expect(h(10)).toBeCloseTo(12); // floored
  });

  it('with negatives the height is strictly monotonic in value and stays inside [12, 88]', () => {
    for (const a of [[-5, -3, -1], [-9, 0, 9], [3, -8, 3, 0, -8, 12], [-999, 999], [-1]]) {
      const h = barHeightPercent(a);
      const sorted = [...new Set(a)].sort((x, y) => x - y);
      for (let i = 1; i < sorted.length; i++) expect(h(sorted[i]), JSON.stringify(a)).toBeGreaterThan(h(sorted[i - 1]));
      for (const v of a) {
        expect(h(v)).toBeGreaterThanOrEqual(12 - 1e-9);
        expect(h(v)).toBeLessThanOrEqual(88 + 1e-9);
      }
    }
  });

  it('equal values have equal heights; the minimum is the shortest bar', () => {
    const h = barHeightPercent([4, -2, 4, -2, 0]);
    expect(h(4)).toBe(h(4));
    expect(h(-2)).toBeLessThan(h(0));
    expect(h(0)).toBeLessThan(h(4));
    expect(h(-2)).toBeCloseTo(12);
  });

  it('renders negative values in a real trace with their sign in the accessible name', () => {
    const steps = getAlgorithmDefinition('bubble-sort')!.generateSteps([3, -1, -8, 0]);
    const html = renderToStaticMarkup(<ArrayVisualizer currentStep={steps[0]} />);
    expect(html).toContain('value -8');
    expect(html).toContain('value -1');
    expect(parseBars(html)).toHaveLength(4);
    // the shortest bar is the minimum (-8): find heights in order of appearance
    const heights = [...html.matchAll(/style="height:([\d.]+)%"/g)].map(m => Number(m[1]));
    expect(heights).toHaveLength(4);
    expect(Math.min(...heights)).toBe(heights[2]);
  });

  it('long arrays use the compact layout without losing bars', () => {
    const arr = Array.from({ length: 16 }, (_, i) => i * 3 - 10);
    const steps = getAlgorithmDefinition('merge-sort')!.generateSteps(arr);
    const html = renderToStaticMarkup(<ArrayVisualizer currentStep={steps[0]} />);
    expect(parseBars(html)).toHaveLength(16);
    expect(html).toContain('min-w-[16px]');
  });
});
