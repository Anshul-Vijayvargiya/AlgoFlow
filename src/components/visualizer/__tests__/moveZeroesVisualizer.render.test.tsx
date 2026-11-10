import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { MoveZeroesVisualizer } from '../MoveZeroesVisualizer';

// The real MoveZeroesVisualizer for steps of the real Move Zeroes trace: indexed cells, the slow and fast pointers, the
// value checked, the swaps, the non-zero values in place, the zeroes between the pointers and the final array.
const run = (...nums: number[]) => getAlgorithmDefinition('array-move-zeroes')!.generateSteps(nums);
const render = (s: ExecutionStep) => renderToStaticMarkup(<MoveZeroesVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ''));
/** every cell as "k=value:state" */
const cells = (html: string) => [...html.matchAll(/data-cell="(\d+)" data-value="(-?\d+)" data-state="([a-z-]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}`);
/** the pointers under each cell, as "k:slow,fast" */
const pointers = (html: string) =>
  [...html.matchAll(/data-pointers="(\d+)"[^>]*>(.*?)<\/span><\/li>/g)].map(m => [m[1], [...m[2].matchAll(/data-pointer="([a-z]+)"/g)].map(p => p[1])] as const).filter(([, p]) => p.length).map(([k, p]) => `${k}:${p.join(',')}`);
const note = (html: string) => decode(html.match(/data-testid="cells-note" data-kind="([a-z-]*)"[^>]*>(?:<span[^>]*>([^<]*)<\/span>)?/)!.slice(1).join('|'));

const STEPS = run(0, 1, 0, 3, 12);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('MoveZeroesVisualizer', () => {
  it('the first step: the input as indexed cells, no pointers yet', () => {
    const html = decode(render(STEPS[0]));
    expect(cells(html)).toEqual(['0=0:normal', '1=1:normal', '2=0:normal', '3=3:normal', '4=12:normal']);
    expect(pointers(html)).toEqual([]);
    expect(text(html)).toContain('input: [0, 1, 0, 3, 12]');
    expect(html).not.toContain('data-testid="cells-result"');
  });

  it('the two pointers are labelled under their cells, in different colours; both on one cell when equal', () => {
    const html = decode(render(at('loop-condition', 0)));
    expect(pointers(html)).toEqual(['0:slow,fast']);
    expect(html).toMatch(/data-pointer="slow" class="text-cyan-300"/);
    expect(html).toMatch(/data-pointer="fast" class="text-amber-300"/);
    const later = decode(render(at('check-nonzero', 3)));
    expect(pointers(later)).toEqual(['1:slow', '3:fast']);
  });

  it('a zero: the cell is marked as found and skipped', () => {
    const html = decode(render(at('check-nonzero', 0)));
    expect(cells(html)[0]).toBe('0=0:zero-found');
    expect(note(html)).toBe('zero|nums[0] = 0: a zero, skip it (slow stays at 0)');
    expect(html).toMatch(/data-legend="zero-found"[^>]*>.*zero: skipped/);
  });

  it('a non-zero value: marked, with the zeroes between slow and fast shown as the gap', () => {
    const html = decode(render(at('check-nonzero', 3)));
    expect(cells(html)).toEqual(['0=1:kept', '1=0:gap', '2=0:gap', '3=3:nonzero-found', '4=12:unvisited']);
    expect(note(html)).toBe('nonzero|nums[3] = 3 ≠ 0: a non-zero value');
  });

  it('a swap: both cells marked, the array after it, and what moved where', () => {
    const decided = decode(render(at('check-distinct', 1)));
    expect(note(decided)).toBe('swap-needed|slow = 1 ≠ fast = 3: swap needed');
    const html = decode(render(at('swap', 1)));
    expect(cells(html)).toEqual(['0=1:kept', '1=3:swapped', '2=0:gap', '3=0:swapped', '4=12:unvisited']);
    expect(note(html)).toBe('swap|swap nums[1] ↔ nums[3]: 3 moves to position 1, the 0 to position 3');
    expect(html).toMatch(/data-testid="cells-array" data-values="1,3,0,0,12"/);
  });

  it('slow == fast: no swap, shown as already in place', () => {
    const steps = run(5, 0);
    const html = decode(render(steps.find(s => s.codeRef === 'check-distinct')!));
    expect(cells(html)[0]).toBe('0=5:in-place');
    expect(note(html)).toBe('in-place|slow = fast = 0: already in place, no swap');
  });

  it('slow++: the non-zero prefix grows', () => {
    const html = decode(render(at('advance-slow', 1)));
    expect(cells(html).slice(0, 2)).toEqual(['0=1:kept', '1=3:kept']);
    expect(note(html)).toBe('advance-slow|slow → 2: 2 non-zero values in place');
    expect(text(html)).toContain('2 non-zero in place');
  });

  it('the end: the non-zero values first, the zeroes at the back, and the result announced', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(cells(html)).toEqual(['0=1:final-value', '1=3:final-value', '2=12:final-value', '3=0:final-zero', '4=0:final-zero']);
    expect(html).toMatch(/role="status" data-testid="cells-result"/);
    expect(text(html)).toContain('Moved 2 zeroes to the end: [1, 3, 12, 0, 0]');
  });

  it('screen readers get the array in words, with the pointers; the cells themselves are hidden', () => {
    const html = decode(render(at('swap', 1)));
    expect(html).toMatch(/data-testid="cells-row" aria-hidden="true"/);
    expect(html).toContain('The array: nums[0] = 1, non-zero, already in place; nums[1] = 3 (slow), just swapped; nums[2] = 0, between slow and fast: zeroes; nums[3] = 0 (fast), just swapped; nums[4] = 12.');
  });

  it('responsive: cells keep their size and wrap onto more rows instead of scrolling; -999 fits', () => {
    const html = decode(render(run(-999, 0, 999, 0, -5, 0, 7, 0, 1, 0).at(-1)!));
    expect(html).toMatch(/data-testid="cells-row" aria-hidden="true" class="[^"]*flex flex-wrap/);
    expect(cells(html)).toHaveLength(10);
    expect(html).toMatch(/class="flex flex-col items-center gap-0.5 w-11 sm:w-12"/);
    expect(html).not.toContain('overflow-x-auto');
  });

  it('a step of another algorithm draws nothing', () => {
    expect(renderToStaticMarkup(<MoveZeroesVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
  });
});
