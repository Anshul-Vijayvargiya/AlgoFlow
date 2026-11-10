import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { ClimbingStairsVisualizer } from '../ClimbingStairsVisualizer';

// The real ClimbingStairsVisualizer for steps of the real Climbing Stairs trace: the staircase, the step being computed,
// the steps the two rolling variables hold, the variables, the addition, the display-only history and the answer.
const run = (n: number) => getAlgorithmDefinition('dp-climbing-stairs')!.generateSteps([n]);
const render = (s: ExecutionStep) => renderToStaticMarkup(<ClimbingStairsVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ''));
/** every stair as "k=ways:state" */
const stairs = (html: string) => [...html.matchAll(/data-stair="(\d+)" data-ways="(\d*)" data-state="([a-z0-9-]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}`);
const tags = (html: string) => [...html.matchAll(/data-stair-tag="(\d+)"[^>]*>([^<]*)</g)].filter(m => m[2]).map(m => `${m[1]}:${m[2]}`);
const vars = (html: string) => [...html.matchAll(/data-var="([a-z0-9]+)" data-value="(\d*)" data-active="(true|false)"/g)].map(m => `${m[1]}=${m[2]}${m[3] === 'true' ? '*' : ''}`);

const STEPS = run(5);
const find = (codeRef: string, i?: number) => STEPS.find(s => s.codeRef === codeRef && (i === undefined || s.stairs!.i === i))!;

describe('ClimbingStairsVisualizer', () => {
  it('the first step: a staircase of n numbered steps, nothing computed, empty variables and history', () => {
    const html = decode(render(STEPS[0]));
    expect(stairs(html)).toEqual(['1=:unknown', '2=:unknown', '3=:unknown', '4=:unknown', '5=:unknown']);
    expect(vars(html)).toEqual(['prev2=', 'prev1=', 'current=']);
    expect(text(html)).toContain('nothing computed yet');
    expect(html).not.toContain('data-testid="stairs-result"');
  });

  it('a staircase: step k is k / n of the full height, so the steps rise to the right', () => {
    const html = render(STEPS.at(-1)!);
    const heights = [...html.matchAll(/data-stair="\d+"[^>]*style="height:([\d.]+)%/g)].map(m => Number(m[1]));
    expect(heights).toEqual([20, 40, 60, 80, 100]);
    expect(html).toMatch(/style="width:min\(100%, 16.25rem\)"/);
  });

  it('the base values: prev2 = ways(1) = 1, prev1 = ways(2) = 2, each tagged on its step', () => {
    const html = decode(render(find('set-prev1')));
    expect(stairs(html)).toEqual(['1=1:prev2', '2=2:prev1', '3=:unknown', '4=:unknown', '5=:unknown']);
    expect(tags(html)).toEqual(['1:prev2', '2:prev1']);
    expect(vars(html)).toEqual(['prev2=1', 'prev1=2*', 'current=']);
  });

  it('a pass: step i is being computed from the two steps below it; the addition is shown', () => {
    const loop = decode(render(find('loop-condition', 4)));
    expect(stairs(loop)).toEqual(['1=1:known', '2=2:prev2', '3=3:prev1', '4=:current', '5=:unknown']);
    expect(tags(loop)).toEqual(['2:prev2', '3:prev1', '4:i']);
    expect(loop).toMatch(/data-stair="4"[^>]*>\?<\/li>/);
    const add = decode(render(find('compute-current', 4)));
    expect(stairs(add)[3]).toBe('4=5:current');
    expect(vars(add)).toEqual(['prev2=2', 'prev1=3', 'current=5*']);
    expect(text(add)).toContain('current = prev1 + prev2 = 3 + 2 = 5');
    expect(add).toMatch(/data-testid="stairs-calc" data-kind="add"/);
  });

  it('the shifts move the tags: prev2 to step i − 1, then prev1 to step i', () => {
    const p2 = decode(render(find('shift-prev2', 4)));
    expect(tags(p2)).toEqual(['3:prev2 prev1', '4:i']);
    expect(vars(p2)).toEqual(['prev2=3*', 'prev1=3', 'current=5']);
    const p1 = decode(render(find('shift-prev1', 4)));
    expect(tags(p1)).toEqual(['3:prev2', '4:prev1 i']);
    expect(vars(p1)).toEqual(['prev2=3', 'prev1=5*', 'current=5']);
  });

  it('the history is labelled display only, and grows as the run establishes each value', () => {
    const html = decode(render(find('compute-current', 4)));
    expect(text(html)).toContain('history (display only — the code keeps just prev2 and prev1, no array)');
    expect([...html.matchAll(/data-history="([\d,]+)"/g)].map(m => m[1])).toEqual(['1,1', '2,2', '3,3', '4,5']);
  });

  it('the end: step n is the answer, the history is complete, and the result is announced', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(stairs(html)).toEqual(['1=1:known', '2=2:known', '3=3:known', '4=5:known', '5=8:result']);
    expect(html).toMatch(/role="status" data-testid="stairs-result"/);
    expect(text(html)).toContain('Climbing a 5-step staircase has 8 distinct ways.');
    expect(tags(html)).toEqual([]);
  });

  it('n = 2: the base case returns n, shown as such, with only ways(2) in the history', () => {
    const html = decode(render(run(2).at(-1)!));
    expect(stairs(html)).toEqual(['1=:unknown', '2=2:result']);
    expect(text(html)).toContain('n ≤ 2: the answer is n = 2');
    expect([...html.matchAll(/data-history="([\d,]+)"/g)].map(m => m[1])).toEqual(['2,2']);
  });

  it('screen readers get the staircase in words; the drawing itself is hidden from them', () => {
    const html = decode(render(find('compute-current', 4)));
    expect(html).toMatch(/data-testid="stairs-steps" aria-hidden="true"/);
    expect(html).toContain('Staircase of 5 steps: step 1: 1 way (computed earlier); step 2: 2 ways (prev2 = ways(i − 2)); step 3: 3 ways (prev1 = ways(i − 1)); step 4: 5 ways (step i: being computed); step 5: not computed.');
  });

  it('responsive: ten steps share the width and use smaller text instead of scrolling', () => {
    const html = render(run(10).at(-1)!);
    expect(html).toMatch(/style="width:min\(100%, 32.5rem\)"/);
    expect(html).toMatch(/data-testid="stairs-steps"[^>]*class="[^"]*text-\[11px\] sm:text-sm"[^>]*style="grid-template-columns:repeat\(10, minmax\(0, 1fr\)\)"/);
    expect(html).not.toContain('overflow-x-auto');
  });

  it('a step of another algorithm draws nothing', () => {
    expect(renderToStaticMarkup(<ClimbingStairsVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
  });
});
