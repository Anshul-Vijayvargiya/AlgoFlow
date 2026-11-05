import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { TreeVisualizer } from '../TreeVisualizer';

// The real TreeVisualizer for steps of the real Mirror a BST trace: each node's state (current, swapping, swapped,
// completed, unvisited), the links of the node being swapped as they really are, temp, the call stack, the tree's level
// order, the swap order and the final mirrored tree.
const run = (tree: string) => getAlgorithmDefinition('bst-mirror')!.generateSteps([], { texts: [tree] });
const render = (s: ExecutionStep) => renderToStaticMarkup(<TreeVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
/** every node as "value:state" */
const states = (html: string) => [...html.matchAll(/data-value="(-?\d+)" data-state="([a-z]+)"/g)].map(m => `${m[1]}:${m[2]}`);
/** every edge as "parent-child:side", from the node ids (n0 = 8, n1 = 5, n2 = 12, …) */
const edges = (html: string) => [...html.matchAll(/data-edge="(n\d+-n\d+)" data-side="(left|right)"/g)].map(m => `${m[1]}:${m[2]}`);
/** each node's drawn column (inorder rank) */
const columns = (html: string) => Object.fromEntries([...html.matchAll(/data-value="(-?\d+)" data-state="[a-z]+" data-x="(\d+)"/g)].map(m => [m[1], Number(m[2])]));

const STEPS = run('[8, 5, 12, 3, 6, 10, 14]');
/** the step at the root where this statement has just run */
const atRoot = (codeRef: string) => STEPS.find(s => s.codeRef === codeRef && s.tree!.current === 'n0')!;

describe('TreeVisualizer — Mirror a BST', () => {
  it('the start: the input tree, the root call, nothing swapped yet', () => {
    const html = render(STEPS[0]);
    expect(states(html)).toEqual(['8:current', '5:unvisited', '12:unvisited', '3:unvisited', '6:unvisited', '10:unvisited', '14:unvisited']);
    expect(html).toMatch(/data-testid="tree-shape" data-original="\[8, 5, 12, 3, 6, 10, 14\]" data-shape="\[8, 5, 12, 3, 6, 10, 14\]"/);
    expect(html).toContain('data-frame-status="active" data-frame-node="n0" data-frame-via="root"');
    expect(html).toContain('data-testid="tree-swapped"');
    expect(html).not.toContain('data-swapped=');
    expect(html).not.toContain('data-testid="tree-swap"');
  });

  it('current node highlighting, and the two children being swapped: temp holds the original left child', () => {
    const html = render(atRoot('save-temp'));
    expect(states(html)).toEqual(['8:current', '5:swapping', '12:swapping', '3:unvisited', '6:unvisited', '10:unvisited', '14:unvisited']);
    expect(html).toMatch(/data-testid="tree-swap" data-node="8" data-phase="temp" data-original-left="5" data-original-right="12" data-temp="5" data-left="5" data-right="12"/);
    expect(decode(html)).toContain('Node 5: a child being swapped');
    // temp points at 5, node at 8
    expect(html).toMatch(/data-value="5" data-state="swapping"[^>]*data-pointers="temp"/);
    expect(html).toMatch(/data-value="8" data-state="current"[^>]*data-pointers="node"/);
    // the links being swapped are drawn dashed and named
    expect(html).toMatch(/data-edge="n0-n1" data-side="left" data-rewiring="true"><path[^>]*stroke-dasharray="5 3"/);
  });

  it('just after node.left = node.right: both links point to 12, the left subtree hangs only from temp', () => {
    const html = render(atRoot('set-left'));
    expect(html).toMatch(/data-phase="left" data-original-left="5" data-original-right="12" data-temp="5" data-left="12" data-right="12"/);
    expect(edges(html).filter(e => e.startsWith('n0-'))).toEqual(['n0-n2:left', 'n0-n2:right']);
    // the two links to the same child bend apart, so both are visible
    const paths = [...html.matchAll(/data-edge="n0-n2" data-side="(left|right)" data-rewiring="true"><path d="M [\d.]+ [\d.]+ Q ([\d.]+) /g)].map(m => Number(m[2]));
    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toBe(paths[1]);
    // the tree is still drawn in its original places until the swap is done
    expect(columns(html)).toMatchObject({ 3: 0, 5: 1, 8: 3, 12: 5 });
    expect(decode(html)).toContain('Node 8: current, node points here; left child 12, right child 12.');
    expect(decode(html)).toContain('node.left = 12<span class="sr-only"> (just set)</span>');
  });

  it('updated tree links: after node.right = temp the tree is redrawn with 8\'s children swapped', () => {
    const html = render(atRoot('set-right'));
    expect(html).toMatch(/data-phase="right"[^>]*data-temp="5" data-left="12" data-right="5"/);
    expect(edges(html).filter(e => e.startsWith('n0-'))).toEqual(['n0-n2:left', 'n0-n1:right']);
    // 12's subtree is now on the left of 8, 5's on the right (12's own children are not swapped yet)
    expect(columns(html)).toMatchObject({ 10: 0, 12: 1, 14: 2, 8: 3, 3: 4, 5: 5, 6: 6 });
    expect(html).toContain('data-shape="[8, 12, 5, 10, 14, 3, 6]"');
    expect([...html.matchAll(/data-swapped="(-?\d+)"/g)].map(m => m[1])).toEqual(['8']);
    // the swapped links are solid
    expect(html).toMatch(/data-edge="n0-n2" data-side="left" data-rewiring="false"><path(?![^>]*stroke-dasharray)[^>]*class="stroke-emerald-500\/70"/);
  });

  it('swapped (subtrees in progress) and completed (whole subtree mirrored) are drawn and said differently', () => {
    // 12's call has returned; 8 waits for its right subtree, which starts at 5
    const s = STEPS.find(x => x.codeRef === 'recurse-right' && x.tree!.current === 'n1')!;
    const html = render(s);
    expect(states(html)).toEqual(['8:swapped', '5:current', '12:completed', '3:unvisited', '6:unvisited', '10:completed', '14:completed']);
    expect(decode(html)).toContain('Node 8: its children are swapped; its subtrees are being mirrored');
    expect(decode(html)).toContain('Node 12: its whole subtree is mirrored');
    expect(decode(html)).toContain('Node 3: not visited yet');
    // edges out of swapped nodes are drawn as updated; 5's are not swapped yet
    expect(html).toMatch(/data-edge="n0-n1" data-side="right"[^>]*class="stroke-emerald-500\/70"/);
    expect(html).toMatch(/data-edge="n1-n3" data-side="left"[^>]*class="stroke-slate-600"/);
    expect(decode(html)).toContain('mirror(node.right = 5)');
  });

  it('a returning call shows what it returns', () => {
    const ret = STEPS.find(s => s.codeRef === 'return-node' && s.tree!.current === 'n2')!;
    expect(decode(render(ret))).toMatch(/data-frame-status="returning" data-frame-node="n2" data-frame-via="left"[^>]*><span aria-hidden="true">└─ <\/span>mirror\(node\.left = 12\)<span> ↩ returns node 12<\/span>/);
    const empty = STEPS.find(s => s.codeRef === 'return-null')!;
    expect(decode(render(empty))).toContain('↩ returns null');
  });

  it('the final mirrored tree: every node completed, no call in progress, the result says it is not a valid BST', () => {
    const html = render(STEPS.at(-1)!);
    expect(states(html).every(s => s.endsWith(':completed'))).toBe(true);
    expect(columns(html)).toEqual({ 14: 0, 12: 1, 10: 2, 8: 3, 6: 4, 5: 5, 3: 6 });
    expect(html).toContain('data-shape="[8, 12, 5, 14, 10, 6, 3]"');
    expect([...html.matchAll(/data-swapped="(-?\d+)"/g)].map(m => m[1])).toEqual(['8', '12', '14', '10', '5', '6', '3']);
    expect(html).toContain('no call in progress');
    expect(html).toMatch(/data-testid="tree-result"[^>]*>.*Mirrored tree: \[8, 12, 5, 14, 10, 6, 3\] \(values now decrease from left to right: not a valid BST\)/);
    expect(html).not.toContain('data-testid="tree-swap"');
    expect(html).not.toContain('data-rewiring');
  });

  it('a leaf: temp = null is shown with the null pointers', () => {
    const html = render(run('[7]').find(s => s.codeRef === 'save-temp')!);
    expect(html).toMatch(/data-original-left="null" data-original-right="null" data-temp="null" data-left="null" data-right="null"/);
    expect(html).toContain('temp = null');
  });

  it('the empty tree: the empty message, then the mirrored empty tree', () => {
    const steps = run('[]');
    expect(render(steps[0])).toContain('data-testid="tree-empty"');
    expect(render(steps.at(-1)!)).toContain('Mirrored tree: [] (the empty tree is its own mirror)');
  });

  it('other tree algorithms are unchanged: no swap panel, no mirror attributes', () => {
    const inorder = getAlgorithmDefinition('tree-inorder')!.generateSteps([]);
    for (const s of [inorder[0], inorder.at(-1)!]) {
      const html = render(s);
      for (const t of ['tree-swap', 'tree-shape', 'tree-swapped', 'data-rewiring', 'swapping']) expect(html).not.toContain(t);
      expect(html).toMatch(/<line data-edge="n0-n1" data-side="left"/);
    }
  });
});
