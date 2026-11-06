import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { PermutationsVisualizer } from '../PermutationsVisualizer';
import { SubsetsVisualizer } from '../SubsetsVisualizer';

// The real PermutationsVisualizer for steps of the real trace: the input with what is used and what is being looked at,
// the depth, the whole decision tree with each node's state, the current permutation, the call stack, the permutations
// saved and the separate costs.
const run = (...nums: number[]) => getAlgorithmDefinition('backtracking-permutations')!.generateSteps(nums);
const render = (s: ExecutionStep) => renderToStaticMarkup(<PermutationsVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
const nodes = (html: string) => Object.fromEntries([...html.matchAll(/data-tree-node="(\d*)" data-state="([a-z]+)" data-saved="(\d*)"/g)].map(m => [m[1], `${m[2]}${m[3] ? `#${m[3]}` : ''}`]));
const permutations = (html: string) => [...html.matchAll(/data-permutation="([^"]*)"/g)].map(m => m[1]);
const cells = (html: string) => [...html.matchAll(/data-input-index="(\d)" data-value="(-?\d+)" data-used="(true|false)" data-current="(true|false)"/g)].map(m => `${m[2]}:${m[3] === 'true' ? 'used' : 'free'}${m[4] === 'true' ? ':looking' : ''}`);

const STEPS = run(1, 2, 3);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('PermutationsVisualizer', () => {
  it('the whole tree is drawn from the start, with one fewer branch at each level', () => {
    const map = nodes(render(STEPS[0]));
    expect(Object.keys(map)).toHaveLength(16);
    expect(Object.values(map).every(v => v === 'unvisited')).toBe(true);
    // n - depth children: 3 below the root, then 2, then 1
    const children = (path: string) => Object.keys(map).filter(p => p.length === path.length + 1 && p.startsWith(path));
    expect(children('').sort()).toEqual(['0', '1', '2']);
    expect(children('1').sort()).toEqual(['10', '12']);
    expect(children('12')).toEqual(['120']);
    expect(children('120')).toEqual([]);
    expect(Object.keys(nodes(render(run(1, 2, 3, 4)[0])))).toHaveLength(65);
    expect(Object.keys(nodes(render(run()[0])))).toEqual(['']);
  });

  it('a node stays where it is on every step, and the permutations run left to right in the order found', () => {
    const place = (html: string) => [...html.matchAll(/data-tree-node="(\d*)"[^>]*><circle cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => `${m[1]}:${m[2]},${m[3]}`);
    const first = place(render(STEPS[0]));
    for (const s of [STEPS[20], STEPS[70], STEPS.at(-1)!]) expect(place(render(s))).toEqual(first);
    const x = (path: string) => Number(first.find(p => p.startsWith(`${path}:`))!.split(':')[1].split(',')[0]);
    const finals = ['012', '021', '102', '120', '201', '210'].map(x);
    expect(finals).toEqual([...finals].sort((a, b) => a - b));
    expect(new Set(finals).size).toBe(6);
    // a parent sits midway above its first and last children
    expect(x('')).toBe((x('0') + x('2')) / 2);
    expect(x('1')).toBe((x('10') + x('12')) / 2);
    expect(x('12')).toBe(x('120'));
  });

  it('edges are labelled with the value chosen, and show which were walked', () => {
    const html = render(at('recurse', 1)); // [1, 2]
    expect(html).toMatch(/data-edge="0" data-value="1" data-walked="true"/);
    expect(html).toMatch(/data-edge="01" data-value="2" data-walked="true"/);
    expect(html).toMatch(/data-edge="02" data-value="3" data-walked="false"/);
    expect(html).toMatch(/data-edge="1" data-value="2" data-walked="false"/);
    // the edge stops at the node's rim, so it does not cross the number inside
    const edge = html.match(/data-edge="12"[^>]*><line x1="([\d.]+)" y1="([\d.]+)"/)!;
    const parent = html.match(/data-tree-node="1"[^>]*><circle cx="([\d.]+)" cy="([\d.]+)"/)!;
    expect(Math.hypot(Number(edge[1]) - Number(parent[1]), Number(edge[2]) - Number(parent[2]))).toBeCloseTo(12);
  });

  it('available and used elements: each cell says which it is, and the element being looked at is highlighted', () => {
    expect(cells(render(STEPS[0]))).toEqual(['1:free', '2:free', '3:free']);
    const first = render(at('check-used'));
    expect(cells(first)).toEqual(['1:free:looking', '2:free', '3:free']);
    expect(first).toContain('>free</span>');
    // after choosing 1: looking at 1 again, one level down, and finding it used
    const skip = render(at('check-used', 1));
    expect(cells(skip)).toEqual(['1:used:looking', '2:free', '3:free']);
    expect(skip).toContain('>used</span>');
    expect(decode(skip)).toContain('Input: 1 used, 2 free, 3 free; looking at index 0, value 1');
    expect(skip).toMatch(/data-skipped="1"/);
    expect(decode(skip)).toContain('1 already used: skipped');
  });

  it('the recursion depth', () => {
    expect(render(STEPS[0])).toContain('no call running');
    expect(render(at('check-full'))).toMatch(/data-testid="permutations-depth" data-depth="0"[^>]*>depth 0: filling position 0 \(0 to 2\)/);
    expect(render(at('check-full', 1))).toMatch(/data-depth="1"[^>]*>depth 1: filling position 1 \(0 to 2\)/);
    expect(render(at('save'))).toMatch(/data-depth="3"[^>]*>depth 3: all 3 positions filled/);
  });

  it('a push and a pop are shown and said; used[] and current are back after the unmark', () => {
    const push = decode(render(at('push')));
    expect(push).toMatch(/data-testid="permutations-current" data-values="1" data-added="1" data-removed="" data-skipped=""/);
    expect(push).toContain('+ 1 pushed');
    const pop = decode(render(at('pop')));
    expect(pop).toMatch(/data-values="1,2" data-added="" data-removed="3"/);
    expect(pop).toContain('− 3 popped (backtracking)');
    // popped, but still marked used until the next statement
    expect(cells(render(at('pop')))[2]).toBe('3:used:looking');
    expect(cells(render(at('unmark')))[2]).toBe('3:free:looking');
  });

  it('a save: the new permutation joins the list, numbered as on the tree', () => {
    const html = render(at('save', 1)); // [1, 3, 2]
    expect(permutations(html)).toEqual(['1,2,3', '1,3,2']);
    expect(html).toMatch(/data-permutation="1,3,2" data-newest="true"[^>]*bg-amber-500\/20/);
    expect(nodes(html)['021']).toBe('current#2');
    expect(nodes(html)['012']).toBe('finished#1');
    expect(html).toContain('permutations saved: 2 of 6');
  });

  it('node states: current, on the call stack, finished, not reached', () => {
    const map = nodes(render(at('save', 1)));
    expect(map['']).toBe('path');
    expect(map['0']).toBe('path');
    expect(map['02']).toBe('path');
    expect(map['01']).toBe('finished');
    expect(map['1']).toBe('unvisited');
    expect(decode(render(at('save', 1)))).toContain('Decision tree: running the call for [1, 3, 2], at depth 3 of 3.');
  });

  it('the call stack: each call with its choice, the last one active, a returning call says so', () => {
    const html = decode(render(at('save', 1)));
    expect(html).toMatch(/data-testid="permutations-calls" data-depth="4"/);
    expect(html).toContain('dfs: position 0');
    expect(html).toContain('dfs: position 2<span> — after choosing 3</span>');
    expect(html).toMatch(/data-frame-node="021" data-frame-chosen="1" data-frame-status="active"/);
    expect(html).toMatch(/data-frame-node="" data-frame-chosen="" data-frame-status="waiting"/);
    const ret = decode(render(at('return-full')));
    expect(ret).toMatch(/data-frame-status="returning"/);
    expect(ret).toContain('↩ returns');
  });

  it('the costs are shown apart, each with its total', () => {
    const html = decode(render(at('save', 1)));
    expect(html).toMatch(/data-testid="permutations-costs" data-calls="\d+" data-checks="\d+" data-copied="6"/);
    expect(html).toContain('recursive calls:');
    expect(html).toContain('used[] checks:');
    expect(html).toContain('elements copied into results:');
    expect(html).toContain('6 of 18');
    const end = decode(render(STEPS.at(-1)!));
    expect(end).toMatch(/data-calls="16" data-checks="30" data-copied="18"/);
    expect(end).toContain('16 of 16');
    expect(end).toContain('30 of 30');
    expect(end).toContain('18 of 18');
  });

  it('the end: every permutation in order, every node finished, no call in progress, the result stated', () => {
    const html = render(STEPS.at(-1)!);
    expect(permutations(html)).toEqual(['1,2,3', '1,3,2', '2,1,3', '2,3,1', '3,1,2', '3,2,1']);
    expect(Object.values(nodes(html)).every(v => v.startsWith('finished'))).toBe(true);
    expect(html).toContain('no call in progress');
    expect(html).toMatch(/role="status" data-testid="permutations-result"/);
    expect(html).toContain('6 permutations of [1, 2, 3] (3! = 6)');
    expect(render(STEPS[5])).not.toContain('data-testid="permutations-result"');
  });

  it('the empty input: one node, one empty permutation', () => {
    const html = decode(render(run().at(-1)!));
    expect(html).toContain('[ ] (empty)');
    expect(permutations(html)).toEqual(['']);
    expect(html).toContain('1 permutation of []: the empty permutation (0! = 1)');
    expect(html).toContain('1 of 1');
    expect(html).toContain('0 of 0');
  });

  it('a wide tree scrolls inside its own focusable area; the drawing is hidden from assistive technology, which gets it in words', () => {
    const html = render(run(1, 2, 3, 4)[0]);
    expect(html).toMatch(/tabindex="0" role="region" aria-label="Decision tree" data-testid="permutations-tree-scroll" class="[^"]*overflow-x-auto/);
    expect(html).toMatch(/<svg width="848"[^>]*aria-hidden="true"/);
    expect(html).toContain('data-testid="permutations-tree-text"');
  });

  it('each decision-tree visualizer draws only its own algorithm\'s steps', () => {
    const subsets = getAlgorithmDefinition('backtracking-subsets')!.generateSteps([1, 2]);
    expect(render(subsets[0])).toBe('');
    expect(renderToStaticMarkup(<SubsetsVisualizer currentStep={STEPS[0]} />)).toBe('');
    expect(renderToStaticMarkup(<SubsetsVisualizer currentStep={subsets[0]} />)).toContain('data-testid="subsets-visualizer"');
    expect(render(STEPS[0])).toContain('data-testid="permutations-visualizer"');
  });
});
