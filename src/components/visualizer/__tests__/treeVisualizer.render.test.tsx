import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { AlgorithmId, ExecutionStep } from '../../../types/algorithm';
import { TreeVisualizer } from '../TreeVisualizer';

// The real TreeVisualizer for steps of the real traversal traces: nodes at their positions with their states and
// visit order, the parent-child edges, pointers, the stack or queue, the output, the empty tree and the result.
const steps = (id: AlgorithmId, text = '[1, 2, 3, 4, 5, null, 6]') => getAlgorithmDefinition(id)!.generateSteps([], { texts: [text] });
const render = (s: ExecutionStep) => renderToStaticMarkup(<TreeVisualizer currentStep={s} stepIntervalMs={700} />);
const nodes = (html: string) =>
  [...html.matchAll(/data-node-id="(n\d+)" data-value="(-?\d+)" data-state="([a-z]+)" data-x="(\d+)" data-depth="(\d+)" data-visit-order="(\d*)" data-pointers="([^"]*)"/g)].map(m => ({
    id: m[1],
    value: Number(m[2]),
    state: m[3],
    x: Number(m[4]),
    depth: Number(m[5]),
    order: m[6] ? Number(m[6]) : null,
    pointers: m[7],
  }));
const edges = (html: string) => [...html.matchAll(/data-edge="(n\d+-n\d+)" data-side="(left|right)"/g)].map(m => `${m[1]}:${m[2]}`);
const at = (all: ExecutionStep[], codeRef: string, n = 0) => all.filter(s => s.codeRef === codeRef)[n];

describe('TreeVisualizer', () => {
  it('draws every node at its column and row, and an edge from each parent to each child', () => {
    const html = render(steps('tree-inorder')[0]);
    expect(nodes(html).map(n => [n.value, n.x, n.depth])).toEqual([
      [1, 3, 0],
      [2, 1, 1],
      [3, 4, 1],
      [4, 0, 2],
      [5, 2, 2],
      [6, 5, 2],
    ]);
    expect(edges(html)).toEqual(['n0-n1:left', 'n0-n2:right', 'n1-n3:left', 'n1-n4:right', 'n2-n6:right']);
    // the drawing is sized for 6 columns and 3 rows
    expect(html).toMatch(/<svg width="328" height="250" viewBox="0 0 328 250"/);
  });

  it('inorder mid-trace: the visited nodes with their order, the current node, the stack and curr', () => {
    const all = steps('tree-inorder');
    const html = render(at(all, 'visit', 2)); // 4, 2, then 5
    const byValue = Object.fromEntries(nodes(html).map(n => [n.value, n]));
    expect([byValue[4].order, byValue[2].order, byValue[5].order]).toEqual([1, 2, 3]);
    expect(byValue[5].state).toBe('current');
    expect(byValue[4].state).toBe('visited');
    expect(byValue[1].state).toBe('waiting'); // still on the stack
    expect(byValue[3].state).toBe('unvisited');
    expect(byValue[5].pointers).toBe('curr');
    expect(html).toMatch(/data-testid="tree-stack" data-action=""/);
    expect([...html.matchAll(/data-item="(n\d+)" data-end="(true|false)"/g)].map(m => [m[1], m[2]])).toEqual([['n0', 'true']]);
    expect([...html.matchAll(/data-output="(-?\d+)"/g)].map(m => Number(m[1]))).toEqual([4, 2, 5]);
    expect(html).toContain('Output so far: 4, 2, 5');
  });

  it('a null pointer is listed in words; level order shows its queue front to back', () => {
    const inorder = steps('tree-inorder');
    expect(render(at(inorder, 'go-left', 2))).toMatch(/data-testid="tree-null-pointers"[^>]*>curr = null</);
    const level = steps('tree-level-order');
    const html = render(at(level, 'enqueue-right'));
    expect(html).toMatch(/data-testid="tree-queue" data-action="enqueue"/);
    expect(html).toContain('Queue, front to back: 2, 3');
    expect(html).not.toContain('data-testid="tree-stack"');
  });

  it('the empty tree: said in words, nothing drawn', () => {
    const all = steps('tree-preorder', '[]');
    const html = render(all.at(-1)!);
    expect(html).toContain('data-testid="tree-empty"');
    expect(html).not.toContain('data-testid="tree-svg"');
    expect(html).toContain('Preorder: []');
  });

  it('the last step: every node visited, the result in a status region; the tree is described for screen readers', () => {
    const all = steps('tree-postorder');
    const html = render(all.at(-1)!);
    expect(nodes(html).every(n => n.state === 'visited')).toBe(true);
    expect(nodes(html).sort((a, b) => a.order! - b.order!).map(n => n.value)).toEqual([4, 5, 2, 6, 3, 1]);
    expect(html).toMatch(/role="status" data-testid="tree-result"[^>]*>.*Postorder: \[4, 5, 2, 6, 3, 1\]/);
    // the code's last pointer still holds the root, the node popped last
    expect(html).toContain('Node 1: visited (6th visited), last points here; left child 2, right child 3.');
    expect(html).toContain('Node 3: visited (5th visited); left child none, right child 6.');
  });

  it('a wide tree scrolls inside a focusable, named region instead of widening the page', () => {
    const html = render(steps('tree-level-order', '[8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]')[0]);
    expect(html).toMatch(/tabindex="0" role="region" aria-label="Binary tree" data-testid="tree-scroll" class="[^"]*overflow-x-auto/);
    expect(nodes(html)).toHaveLength(15);
  });
});
