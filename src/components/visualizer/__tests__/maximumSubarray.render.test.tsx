import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { ArrayVisualizer } from '../ArrayVisualizer';
import { deriveOutcome } from '../barVisuals';

// The real ArrayVisualizer for steps of the real Maximum Subarray trace: the current run in range (the rest dimmed),
// start and i under the bars, the value cards, and the best subarray marked found at the end.
const def = getAlgorithmDefinition('maximum-subarray')!;
const trace = (nums: number[]) => def.generateSteps([...nums]);
const render = (all: ExecutionStep[], k: number) =>
  renderToStaticMarkup(<ArrayVisualizer currentStep={all[k]} positionPointers={def.positionPointers} outcome={deriveOutcome(all, k)} stepIntervalMs={700} />);
const bars = (html: string) =>
  [...html.matchAll(/data-bar-index="(\d+)" data-role="([a-z]+)" data-in-range="(true|false)" data-pointers="([^"]*)"/g)].map(m => ({
    index: Number(m[1]),
    role: m[2],
    inRange: m[3] === 'true',
    pointers: m[4],
  }));
const cardValue = (html: string, name: string) => {
  const start = html.indexOf(`data-number-cell="${name}"`);
  return /data-number-value="true">(.*?)<\/dd>/.exec(html.slice(start))![1].replace(/<[^>]+>/g, '');
};

describe('Maximum Subarray — the bar visualizer', () => {
  const nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4];
  const all = trace(nums);

  it('extending the run 4, -1, 2: those bars in range (start is the first), i under its end, the rest dimmed; the cards agree', () => {
    const k = all.findIndex(s => s.codeRef === 'extend' && s.pointers!.i === 5);
    const html = render(all, k);
    const b = bars(html);
    expect(b.filter(x => x.inRange).map(x => x.index)).toEqual([3, 4, 5]);
    // only i is drawn as a chip (start would overlap it on narrow bars); start is the first bar in range and a card
    expect(b.filter(x => x.pointers).map(x => [x.index, x.pointers])).toEqual([[5, 'i']]);
    expect(cardValue(html, 'currentSum')).toBe('5');
    expect(cardValue(html, 'maxSum')).toBe('4');
    expect(cardValue(html, 'start')).toBe('3');
  });

  it('a new best lights up the whole best run', () => {
    const k = all.findIndex(s => s.codeRef === 'update-max' && s.variables!.maxSum === 6);
    const b = bars(render(all, k));
    expect(b.filter(x => x.role === 'assign').map(x => x.index)).toEqual([3, 4, 5, 6]);
  });

  it('the end: [4, -1, 2, 1] marked found, nothing else; no pointer chips; the banner gives the sum and the subarray', () => {
    const html = render(all, all.length - 1);
    const b = bars(html);
    expect(b.filter(x => x.role === 'found').map(x => x.index)).toEqual([3, 4, 5, 6]);
    expect(b.every(x => x.role === 'found' || x.role === 'default')).toBe(true);
    expect(b.every(x => x.pointers === '')).toBe(true);
    expect(html).toMatch(/data-outcome-kind="found"[^>]*>.*Max sum 6: nums\[3\.\.6\] = \[4, -1, 2, 1\]<\/div>/);
  });

  it('all negative: the single best value is the found bar, and the banner says so', () => {
    const neg = trace([-8, -3, -6, -2, -5, -4]);
    const html = render(neg, neg.length - 1);
    expect(bars(html).filter(x => x.role === 'found').map(x => x.index)).toEqual([3]);
    expect(html).toContain('Max sum -2: nums[3..3] = [-2]');
  });
});
