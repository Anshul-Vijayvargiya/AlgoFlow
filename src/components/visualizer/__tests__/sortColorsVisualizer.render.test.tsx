import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { SortColorsVisualizer } from '../SortColorsVisualizer';
import { MoveZeroesVisualizer } from '../MoveZeroesVisualizer';

// The real SortColorsVisualizer for steps of the real Sort Colors trace: indexed cells, the low, mid and high pointers,
// the value checked, the swaps, the four regions and the final array.
const run = (...nums: number[]) => getAlgorithmDefinition('array-sort-colors')!.generateSteps(nums);
const render = (s: ExecutionStep) => renderToStaticMarkup(<SortColorsVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ''));
/** every cell as "k=value:state" */
const cells = (html: string) => [...html.matchAll(/data-cell="(\d+)" data-value="(\d+)" data-state="([a-z]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}`);
/** the pointers under each cell, as "k:low,mid" */
const pointers = (html: string) =>
  [...html.matchAll(/data-pointers="(\d+)"[^>]*>(.*?)<\/span><\/li>/g)].map(m => [m[1], [...m[2].matchAll(/data-pointer="([a-z]+)"/g)].map(p => p[1])] as const).filter(([, p]) => p.length).map(([k, p]) => `${k}:${p.join(',')}`);
/** the pointer values, as "low=0" (with * when this step moved it) */
const vars = (html: string) => [...html.matchAll(/data-var="([a-z]+)" data-value="(-?\d*)" data-moved="(true|false)"/g)].map(m => `${m[1]}=${m[2]}${m[3] === 'true' ? '*' : ''}`);
const note = (html: string) => html.match(/data-testid="flag-note" data-kind="([a-z-]*)"[^>]*><span[^>]*>([^<]*)<\/span>/)!.slice(1).join('|');
const legend = (html: string) => [...html.matchAll(/data-legend="([a-z]+)"/g)].map(m => m[1]);

const STEPS = run(2, 0, 2, 1, 1, 0);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('SortColorsVisualizer', () => {
  it('the first step: the input as indexed cells, nothing checked, no pointers yet', () => {
    const html = decode(render(STEPS[0]));
    expect(cells(html)).toEqual(['0=2:unknown', '1=0:unknown', '2=2:unknown', '3=1:unknown', '4=1:unknown', '5=0:unknown']);
    expect(pointers(html)).toEqual([]);
    expect(vars(html)).toEqual(['low=', 'mid=', 'high=']);
    expect(text(html)).toContain('input: [2, 0, 2, 1, 1, 0]');
    expect(text(html)).toContain('6 of 6 not checked');
    expect(html).not.toContain('data-testid="flag-result"');
  });

  it('the three pointers are labelled under their cells, each in its own colour, and listed with their values and meaning', () => {
    const html = decode(render(at('loop-condition', 0)));
    expect(pointers(html)).toEqual(['0:low,mid', '5:high']);
    expect(html).toMatch(/data-pointer="low" class="text-cyan-300">▲ low</);
    expect(html).toMatch(/data-pointer="mid" class="text-amber-300">▲ mid</);
    expect(html).toMatch(/data-pointer="high" class="text-emerald-300">▲ high</);
    expect(vars(html)).toEqual(['low=0', 'mid=0', 'high=5']);
    expect(text(html)).toContain('low= 0(next 0 goes here)');
    expect(text(html)).toContain('mid= 0(value being checked)');
    expect(text(html)).toContain('high= 5(next 2 goes here)');
  });

  it('each pointer is marked on the step that sets it', () => {
    expect(vars(decode(render(at('init-low'))))).toEqual(['low=0*', 'mid=', 'high=']);
    expect(vars(decode(render(at('init-mid'))))).toEqual(['low=0', 'mid=0*', 'high=']);
    expect(vars(decode(render(at('init-high'))))).toEqual(['low=0', 'mid=0', 'high=5*']);
  });

  it('the current element: the value read at mid is marked, with the step described in the trace’s words', () => {
    const html = decode(render(at('check-zero', 0)));
    expect(cells(html)[0]).toBe('0=2:current');
    expect(note(html)).toBe('check|nums[0]=2 == 0 → FALSE');
    expect(legend(html)).toEqual(['current', 'unknown']);
  });

  it('a 2: swapped with high, both cells marked; then high moves left and mid stays', () => {
    const swap = decode(render(at('swap-high', 0)));
    expect(cells(swap)).toEqual(['0=0:swapped', '1=0:unknown', '2=2:unknown', '3=1:unknown', '4=1:unknown', '5=2:swapped']);
    expect(note(swap)).toBe('swap-high|swap nums[mid=0] ↔ nums[high=5] → [0, 0, 2, 1, 1, 2]');
    expect(swap).toMatch(/data-testid="flag-array" data-values="0,0,2,1,1,2"/);
    const after = decode(render(at('retreat-high', 0)));
    expect(vars(after)).toEqual(['low=0', 'mid=0', 'high=4*']);
    expect(pointers(after)).toEqual(['0:low,mid', '4:high']);
    expect(cells(after)[5]).toBe('5=2:two');
    expect(note(after)).toBe('retreat-high|high-- → high=4; mid stays at 0');
  });

  it('a 0: swapped with low (here the same cell), then low and mid move right; the 0s region grows', () => {
    const swap = decode(render(at('swap-low', 0)));
    expect(cells(swap)[0]).toBe('0=0:swapped');
    expect(note(swap)).toBe('swap-low|swap nums[low=0] ↔ nums[mid=0] → [0, 0, 2, 1, 1, 2]');
    const after = decode(render(at('advance-mid-zero', 0)));
    expect(cells(after)).toEqual(['0=0:zero', '1=0:unknown', '2=2:unknown', '3=1:unknown', '4=1:unknown', '5=2:two']);
    expect(pointers(after)).toEqual(['1:low,mid', '4:high']);
  });

  it('a 1: left in place; the 1s region grows when mid moves on', () => {
    const steps = run(0, 1, 1, 2);
    const html = decode(render(steps.filter(s => s.codeRef === 'advance-mid-one')[1]));
    expect(cells(html)).toEqual(['0=0:zero', '1=1:one', '2=1:one', '3=2:unknown']);
    expect(pointers(html)).toEqual(['1:low', '3:mid,high']);
    expect(note(html)).toBe('advance-mid|mid++ → mid=3');
  });

  it('the four regions are shown as data and in words, from the step', () => {
    const html = decode(render(at('loop-condition', 3)));
    expect(html).toMatch(/data-testid="flag-regions" data-zeros="0,2" data-ones="2,2" data-unknown="2,5" data-twos="5,6"/);
    expect(text(html)).toContain('0s: positions 0 to 1 · 1s: none · not checked: positions 2 to 4 · 2s: position 5');
    expect(legend(html)).toEqual(['zero', 'two', 'unknown']);
    expect(html).toMatch(/data-legend="zero"[^>]*>.*0s: before low/);
    expect(html).toMatch(/data-legend="unknown"[^>]*>.*not checked yet/);
  });

  it('the end: 0s, then 1s, then 2s, nothing unchecked, and the sorted array announced', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(cells(html)).toEqual(['0=0:zero', '1=0:zero', '2=1:one', '3=1:one', '4=2:two', '5=2:two']);
    expect(html).toMatch(/role="status" data-testid="flag-result"/);
    expect(text(html)).toContain('Sorted in one pass: [0, 0, 1, 1, 2, 2]');
    expect(html).toMatch(/data-testid="flag-progress"[^>]*>Done</);
    expect(html).toMatch(/data-testid="flag-array" data-values="0,0,1,1,2,2"/);
  });

  it('a pointer that has left the array is still shown by value: [2] ends with high = -1', () => {
    const html = decode(render(run(2).at(-1)!));
    expect(vars(html)).toEqual(['low=0', 'mid=0', 'high=-1']);
    expect(pointers(html)).toEqual(['0:low,mid']);
    expect(cells(html)).toEqual(['0=2:two']);
  });

  it('nothing is worked out here: the picture follows the step it is given, even one that is not sorted', () => {
    // a made-up step: the component must draw exactly this, not what the algorithm would have produced
    const fake: ExecutionStep = {
      id: 0,
      state: [2, 1, 0],
      type: 'assign',
      message: 'made up',
      sortColors: { input: [0, 1, 2], nums: [2, 1, 0], low: 2, mid: 0, high: 1, operation: 'loop', regions: { zeros: [0, 1], ones: [1, 1], unknown: [1, 2], twos: [2, 3] } },
    };
    const html = decode(render(fake));
    expect(cells(html)).toEqual(['0=2:zero', '1=1:unknown', '2=0:two']);
    expect(pointers(html)).toEqual(['0:mid', '1:high', '2:low']);
    expect(note(html)).toBe('loop|made up');
    expect(html).toMatch(/data-testid="flag-array" data-values="2,1,0"/);
    expect(html).not.toContain('data-testid="flag-result"');
  });

  it('screen readers get the array in words, with the pointers; the cells themselves are hidden', () => {
    const html = decode(render(at('swap-high', 1)));
    expect(html).toMatch(/data-testid="flag-row" aria-hidden="true"/);
    expect(html).toContain(
      'The array: nums[0] = 0, 0s: before low; nums[1] = 0, 0s: before low; nums[2] = 1 (low, mid), just swapped; nums[3] = 1, not checked yet; nums[4] = 2 (high), just swapped; nums[5] = 2, 2s: after high.'
    );
  });

  it('responsive: cells keep their size and wrap onto more rows instead of scrolling', () => {
    const html = decode(render(run(2, 2, 1, 0, 0, 1, 2, 0, 1, 1).at(-1)!));
    expect(html).toMatch(/data-testid="flag-row" aria-hidden="true" class="[^"]*flex flex-wrap/);
    expect(cells(html)).toHaveLength(10);
    expect(html).toMatch(/class="flex flex-col items-center gap-0.5 w-11 sm:w-12"/);
    expect(html).not.toContain('overflow-x-auto');
  });

  it('a step of another algorithm draws nothing, and Move Zeroes’ own visualizer ignores a Sort Colors step', () => {
    expect(renderToStaticMarkup(<SortColorsVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
    expect(renderToStaticMarkup(<SortColorsVisualizer currentStep={getAlgorithmDefinition('array-move-zeroes')!.generateSteps([0, 1])[0]} />)).toBe('');
    expect(renderToStaticMarkup(<MoveZeroesVisualizer currentStep={STEPS[0]} />)).toBe('');
  });
});
