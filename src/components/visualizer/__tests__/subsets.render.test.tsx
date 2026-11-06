import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { SubsetsVisualizer } from '../SubsetsVisualizer';

// The real SubsetsVisualizer for steps of the real trace: the input with the element being decided, the whole decision
// tree with each node's state, the current subset, the call stack, the subsets saved and the two costs.
const run = (...nums: number[]) => getAlgorithmDefinition('backtracking-subsets')!.generateSteps(nums);
const render = (s: ExecutionStep) => renderToStaticMarkup(<SubsetsVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
const nodes = (html: string) => Object.fromEntries([...html.matchAll(/data-tree-node="([IE]*)" data-state="([a-z]+)" data-saved="(\d*)"/g)].map(m => [m[1], `${m[2]}${m[3] ? `#${m[3]}` : ''}`]));
const subsets = (html: string) => [...html.matchAll(/data-subset="([^"]*)"/g)].map(m => m[1]);

const STEPS = run(1, 2, 3);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('SubsetsVisualizer', () => {
  it('the whole tree is drawn from the start: 2^(n+1) - 1 nodes, the root saved first, nothing else reached', () => {
    const map = nodes(render(STEPS[0]));
    expect(Object.keys(map)).toHaveLength(15);
    expect(map['']).toBe('unvisited#1');
    expect(Object.entries(map).filter(([k]) => k !== '').every(([, v]) => v === 'unvisited')).toBe(true);
    expect(Object.keys(nodes(render(run(1, 2, 3, 4, 5)[0])))).toHaveLength(63);
    expect(Object.keys(nodes(render(run()[0])))).toEqual(['']);
  });

  it('a node stays where it is on every step: its place depends on the path only', () => {
    const place = (html: string) => [...html.matchAll(/data-tree-node="([IE]*)"[^>]*><circle cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => `${m[1]}:${m[2]},${m[3]}`);
    const first = place(render(STEPS[0]));
    for (const s of [STEPS[10], STEPS[30], STEPS.at(-1)!]) expect(place(render(s))).toEqual(first);
    // include is to the left of exclude, a parent midway above its children
    const x = (path: string) => Number(first.find(p => p.startsWith(`${path}:`))!.split(':')[1].split(',')[0]);
    expect(x('I')).toBeLessThan(x('E'));
    expect(x('')).toBe((x('I') + x('E')) / 2);
  });

  it('the element being decided is highlighted in the input, with its index', () => {
    const html = render(at('check-end', 1)); // dfs(1)
    expect(html).toContain('data-testid="subsets-input"');
    expect(html).toMatch(/data-input-index="1" data-value="2" data-current="true"/);
    expect(html).toMatch(/data-input-index="0" data-value="1" data-current="false"/);
    expect(decode(html)).toContain('deciding on index 1, value 2');
    // all decided: nothing is highlighted
    expect(render(at('return-end'))).not.toContain('data-current="true"');
  });

  it('include: the value joins the current subset and is said to; the edges say what each branch does', () => {
    const html = decode(render(at('include')));
    expect(html).toMatch(/data-testid="subsets-current" data-values="1" data-added="1" data-removed=""/);
    expect(html).toContain('+ 1 included');
    expect(html).toMatch(/data-edge="I" data-choice="include"/);
    expect(html).toMatch(/data-edge="E" data-choice="exclude"/);
    expect(html).toMatch(/>\+1<\/text>/);
    expect(html).toMatch(/>skip<\/text>/);
    // the second level decides on the second element
    expect(html).toMatch(/>\+2<\/text>/);
  });

  it('a save: the new subset appears at the end of the list, numbered as on the tree', () => {
    const html = render(at('save', 1)); // [1, 2]
    expect(subsets(html)).toEqual(['', '1', '1,2']);
    expect(html).toMatch(/data-subset="1,2" data-newest="true"[^>]*bg-amber-500\/20/);
    expect(nodes(html).II).toBe('unvisited#3');
    expect(html).toContain('subsets saved: 3 of 8');
  });

  it('backtracking: the removal is shown and said, and current goes back', () => {
    const html = decode(render(at('pop')));
    expect(html).toMatch(/data-testid="subsets-current" data-values="1,2" data-added="" data-removed="3"/);
    expect(html).toContain('− 3 removed (backtracking)');
  });

  it('node states and the edges walked: current, on the call stack, finished, not reached', () => {
    const html = render(at('recurse-exclude')); // dfs(3) without 3: path IIE
    const map = nodes(html);
    expect(map.IIE).toBe('current');
    expect(map['']).toBe('path#1');
    expect(map.I).toBe('path#2');
    expect(map.II).toBe('path#3');
    expect(map.III).toBe('finished#4');
    // an exclude node never has a subset of its own
    expect(map.E).toBe('unvisited');
    expect(html).toMatch(/data-edge="III" data-choice="include" data-walked="true"/);
    expect(html).toMatch(/data-edge="IE" data-choice="exclude" data-walked="false"/);
    expect(decode(html)).toContain('Decision tree: running now, the call for [1, 2] at depth 3 of 3.');
  });

  it('the call stack: each call with what it decided, the last one active, a returning call says so', () => {
    const html = decode(render(at('recurse-exclude')));
    expect(html).toMatch(/data-depth="4"/);
    expect(html).toContain('dfs(0)');
    expect(html).toContain('dfs(1)<span> — with 1</span>');
    expect(html).toContain('dfs(3)<span> — without 3</span>');
    expect(html).toMatch(/data-frame-i="3" data-frame-node="IIE" data-frame-via="exclude" data-frame-status="active"/);
    expect(html).toMatch(/data-frame-i="0" data-frame-node="" data-frame-via="root" data-frame-status="waiting"/);
    const ret = decode(render(at('return-end')));
    expect(ret).toMatch(/data-frame-status="returning"/);
    expect(ret).toContain('↩ returns');
  });

  it('the two costs are shown apart, each with its total', () => {
    const html = decode(render(at('save', 2))); // [1, 2, 3]
    expect(html).toMatch(/data-testid="subsets-costs" data-calls="3" data-copied="6"/);
    expect(html).toContain('recursive calls:');
    expect(html).toContain('3 of 15');
    expect(html).toContain('elements copied into results:');
    expect(html).toContain('6 of 12');
    expect(render(STEPS.at(-1)!)).toMatch(/data-calls="15" data-copied="12"/);
  });

  it('the end: every subset in order, every node finished, no call in progress, the result stated', () => {
    const html = render(STEPS.at(-1)!);
    expect(subsets(html)).toEqual(['', '1', '1,2', '1,2,3', '1,3', '2', '2,3', '3']);
    expect(Object.values(nodes(html)).every(v => v.startsWith('finished'))).toBe(true);
    expect(html).toContain('no call in progress');
    expect(html).toMatch(/role="status" data-testid="subsets-result"/);
    expect(html).toContain('8 subsets of [1, 2, 3] (2^3 = 8)');
    expect(render(STEPS[5])).not.toContain('data-testid="subsets-result"');
  });

  it('the empty input: one node, one subset', () => {
    const steps = run();
    const html = decode(render(steps.at(-1)!));
    expect(html).toContain('[ ] (empty)');
    expect(subsets(html)).toEqual(['']);
    expect(html).toContain('1 subset of []: only the empty subset (2^0 = 1)');
    expect(html).toContain('0 of 0');
    expect(html).toContain('1 of 1');
  });

  it('a wide tree scrolls inside its own focusable area; the drawing is hidden from assistive technology, which gets it in words', () => {
    const html = render(run(1, 2, 3, 4, 5)[0]);
    expect(html).toMatch(/tabindex="0" role="region" aria-label="Decision tree" data-testid="subsets-tree-scroll" class="[^"]*overflow-x-auto/);
    expect(html).toMatch(/<svg width="1120"[^>]*aria-hidden="true"/);
    expect(decode(html)).toContain('aria-label="Subsets saved: []"');
    expect(html).toContain('data-testid="subsets-tree-text"');
  });

  it('a step of another algorithm draws nothing', () => {
    expect(renderToStaticMarkup(<SubsetsVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
  });
});
