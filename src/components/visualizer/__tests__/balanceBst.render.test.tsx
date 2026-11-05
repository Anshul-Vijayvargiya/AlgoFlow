import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { TreeVisualizer } from '../TreeVisualizer';

// The real TreeVisualizer for steps of the real Convert BST to Balanced BST trace: the stage, the input tree during the
// inorder walk (current, visited, waiting), the sorted array with left / mid / right, the call stacks of both stages,
// the new nodes (created, completed) in their array columns and the final balanced tree.
const run = (tree: string) => getAlgorithmDefinition('bst-balance')!.generateSteps([], { texts: [tree] });
const render = (s: ExecutionStep) => renderToStaticMarkup(<TreeVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
/** every node as "value:state" */
const states = (html: string) => [...html.matchAll(/data-value="(-?\d+)" data-state="([a-z]+)"/g)].map(m => `${m[1]}:${m[2]}`);
/** each node's drawn column and level */
const places = (html: string) => Object.fromEntries([...html.matchAll(/data-value="(-?\d+)" data-state="[a-z]+" data-x="(\d+)" data-depth="(\d+)"/g)].map(m => [m[1], `${m[2]},${m[3]}`]));
/** every cell of the sorted array as "value:status:marks" */
const cells = (html: string) => [...html.matchAll(/data-index="\d+" data-value="(-?\d+)" data-cell="([a-z-]+)" data-marks="([A-Z ]*)"/g)].map(m => `${m[1]}:${m[2]}${m[3] ? `:${m[3]}` : ''}`);

const DEFAULT = '[1, null, 2, null, 3, null, 4, null, 5]';
const STEPS = run(DEFAULT);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('TreeVisualizer — Convert BST to Balanced BST', () => {
  it('the inorder traversal stage: the input tree, the node visited, the calls waiting, the order of the visit', () => {
    // the third append: 1 and 2 are done, the walk is at 3, whose callers (1 and 2) wait on the stack
    const html = render(at('in-append', 2));
    expect(html).toMatch(/data-testid="tree-stage" data-stage="inorder"[^>]*>Stage 1 of 3: inorder traversal into a sorted array/);
    expect(states(html)).toEqual(['1:visited', '2:visited', '3:current', '4:unvisited', '5:unvisited']);
    expect(html).toMatch(/data-value="1" data-state="visited"[^>]*data-visit-order="1"/);
    expect(decode(html)).toContain('Node 1: visited in order: its value is in the array');
    expect(decode(html)).toContain('inorder(node.right = 3)');
    expect(html).toContain('data-testid="tree-original" data-original="[1, null, 2, null, 3, null, 4, null, 5]"');
  });

  it('the sorted array display: stage 1 appends in order, the value just appended highlighted', () => {
    const html = render(at('in-append', 2));
    expect(html).toContain('data-values="1,2,3"');
    expect(cells(html)).toEqual(['1:collected', '2:collected', '3:appended']);
    // going left from the root into its empty left child: the root's call waits, nothing in the array yet
    const left = render(at('in-recurse-left', 0));
    expect(states(left)).toEqual(['1:waiting', '2:unvisited', '3:unvisited', '4:unvisited', '5:unvisited']);
    expect(cells(left)).toEqual([]);
  });

  it('midpoint selection and the recursive range: left, mid and right marked on the array and in the call', () => {
    const html = render(at('b-mid'));
    expect(html).toMatch(/data-testid="tree-stage" data-stage="build"/);
    expect(html).toMatch(/data-testid="tree-sorted" data-values="1,2,3,4,5" data-left="0" data-right="4" data-mid="2"/);
    expect(cells(html)).toEqual(['1:in-range:L', '2:in-range', '3:mid:M', '4:in-range', '5:in-range:R']);
    expect(decode(html)).toContain(': left = 0, right = 4, mid = 2 (value 3)');
    expect(decode(html)).toMatch(/data-frame-status="active" data-frame-via="root" data-frame-left="0" data-frame-right="4" data-frame-mid="2"/);
    expect(decode(html)).toContain('buildBalanced(values, 0, 4)<span>, mid = 2</span>');
    // nothing is created yet
    expect(html).toContain('The balanced tree has no node yet (root = null).');
  });

  it('the recursive call for a half: its range only; the values outside it and the nodes already made', () => {
    // building 4's right half: [5] (index 4), with 3 and 4 already created
    const s = STEPS.find(x => x.codeRef === 'b-mid' && x.tree!.balance!.buildCalls.at(-1)!.left === 4)!;
    const html = render(s);
    expect(cells(html)).toEqual(['1:created', '2:created', '3:created', '4:created', '5:mid:L M R']);
    expect([...decode(html).matchAll(/buildBalanced\(values, (\d+), (\d+)\)/g)].map(m => `${m[1]}..${m[2]}`)).toEqual(['0..4', '3..4', '4..4']);
  });

  it('new node creation: drawn in its array column on its call\'s level, before its parent links it', () => {
    const root = render(at('b-create'));
    expect(states(root)).toEqual(['3:current']);
    expect(places(root)).toEqual({ 3: '2,0' });
    expect(root).toMatch(/data-value="3" data-state="current"[^>]*data-pointers="node"/);
    // 1 (left half) is created: drawn one level down at column 0, not linked to 3 yet
    const one = render(at('b-create', 1));
    expect(states(one)).toEqual(['3:created', '1:current']);
    expect(places(one)).toEqual({ 3: '2,0', 1: '0,1' });
    expect(one).not.toContain('data-edge=');
    expect(decode(one)).toContain('Node 3: created; its subtrees are being built');
    // once 1's subtree is built and returned, the link appears and 1 is completed
    const linked = render(STEPS.find(s => s.codeRef === 'b-link-left' && s.tree!.current === 'b2')!);
    expect(decode(linked)).toMatch(/data-edge="b2-b0" data-side="left"[^>]*class="stroke-emerald-500\/70"/);
    expect(states(linked)).toEqual(['3:current', '1:completed', '2:completed']);
    expect(decode(linked)).toContain('Node 1: its subtree is built');
  });

  it('the final balanced tree: every node completed and linked, the result with the heights', () => {
    const html = render(STEPS.at(-1)!);
    expect(html).toMatch(/data-testid="tree-stage" data-stage="done"[^>]*>Stage 3 of 3: return the balanced BST/);
    expect(states(html).every(s => s.endsWith(':completed'))).toBe(true);
    expect(places(html)).toEqual({ 3: '2,0', 1: '0,1', 4: '3,1', 2: '1,2', 5: '4,2' });
    expect([...html.matchAll(/data-edge="(b\d-b\d)" data-side="(left|right)"/g)].map(m => `${m[1]}:${m[2]}`).sort()).toEqual(['b0-b1:right', 'b2-b0:left', 'b2-b3:right', 'b3-b4:right']);
    expect(html).toMatch(/data-testid="tree-result"[^>]*>.*Balanced BST: \[3, 1, 4, null, 2, null, 5\], height 3 \(input height 5\)/);
    expect(html).toContain('no call in progress');
    expect(cells(html).every(c => c.endsWith(':created'))).toBe(true);
  });

  it('the empty tree: the empty message in both stages, then the empty balanced tree', () => {
    const steps = run('[]');
    expect(render(steps[0])).toContain('The tree is empty (root = null).');
    expect(render(steps.at(-1)!)).toContain('Balanced BST: [] (the empty tree)');
  });

  it('other tree algorithms are unchanged: no stage, no sorted array', () => {
    const inorder = getAlgorithmDefinition('tree-inorder')!.generateSteps([]);
    for (const s of [inorder[0], inorder.at(-1)!]) {
      const html = render(s);
      for (const t of ['tree-stage', 'tree-sorted', 'tree-original', 'data-cell']) expect(html).not.toContain(t);
      expect(html).toContain('data-testid="tree-output"');
    }
  });
});
