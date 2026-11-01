import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { TreeVisualizer } from '../TreeVisualizer';

// The real TreeVisualizer for steps of the real Build a BST trace: the tree built so far, the node being compared, the
// search path, the empty child the value goes into, the node just inserted or found equal, and the input in order.
const steps = (values: number[]) => getAlgorithmDefinition('build-bst')!.generateSteps([...values]);
const render = (s: ExecutionStep) => renderToStaticMarkup(<TreeVisualizer currentStep={s} stepIntervalMs={700} />);
const states = (html: string) =>
  Object.fromEntries([...html.matchAll(/data-node-id="(n\d+)" data-value="(-?\d+)" data-state="([a-z]+)"/g)].map(m => [Number(m[2]), m[3]]));
const edges = (html: string) => [...html.matchAll(/data-edge="(n\d+-n\d+)" data-side="(left|right)"[^>]*class="([^"]*)"/g)].map(m => ({ edge: m[1], side: m[2], walked: m[3].includes('emerald') }));
const inputRow = (html: string) => [...html.matchAll(/data-input-index="(\d+)" data-input-status="([a-z]+)"/g)].map(m => m[2]);
const example = steps([50, 30, 70, 20, 40, 60, 80]);
const find = (all: ExecutionStep[], codeRef: string, index: number) => all.find(s => s.codeRef === codeRef && s.tree!.build!.index === index)!;

describe('TreeVisualizer — building a BST', () => {
  it('the empty tree before the first value, with every value still to insert', () => {
    const html = render(example[0]);
    expect(html).toContain('data-testid="tree-empty"');
    expect(inputRow(html)).toEqual(Array(7).fill('pending'));
    expect(html).not.toContain('data-testid="tree-output"');
  });

  it('the first value is announced as the root while the tree is empty', () => {
    expect(render(find(example, 'check-root', 0))).toMatch(/The tree is empty \(root = null\)\.(<!-- -->)? 50 will become the root\./);
  });

  it('comparing 40: the node being compared, the path walked, the edges walked, and 40 current in the input', () => {
    // 40 goes 50 → 30 → right; at the compare with 30
    const s = example.filter(x => x.codeRef === 'compare' && x.tree!.build!.index === 4)[1];
    const html = render(s);
    expect(states(html)).toEqual({ 50: 'path', 30: 'current', 70: 'unvisited', 20: 'unvisited' });
    expect(edges(html).filter(e => e.walked).map(e => e.edge)).toEqual(['n0-n1']);
    expect(inputRow(html)).toEqual(['done', 'done', 'done', 'done', 'current', 'pending', 'pending']);
    expect(html).toMatch(/data-pointers="parent,curr"/);
  });

  it('the empty child is drawn dashed beside its parent, then the new node is drawn there, linked on the right side', () => {
    const slotStep = find(example, 'check-side', 4);
    const html = render(slotStep);
    expect(html).toMatch(/data-testid="tree-slot" data-parent="n1" data-side="right" data-value="40"/);
    expect(html).toContain('40 goes in the empty right child of node 30.');
    const inserted = render(find(example, 'insert-right', 4));
    expect(inserted).not.toContain('data-testid="tree-slot"');
    expect(states(inserted)[40]).toBe('inserted');
    expect(edges(inserted)).toContainEqual({ edge: 'n1-n4', side: 'right', walked: true });
  });

  it('a duplicate is marked on the equal node and struck through in the input', () => {
    const all = steps([5, 3, 5]);
    const html = render(all.find(s => s.codeRef === 'skip-dup')!);
    expect(states(html)).toEqual({ 5: 'duplicate', 3: 'unvisited' });
    expect(html).toContain('equal to the value (skipped)');
    const end = render(all.at(-1)!);
    expect(inputRow(end)).toEqual(['done', 'done', 'skipped']);
    expect(end).toContain('(duplicate, skipped)');
    expect(end).toMatch(/data-testid="tree-result"[^>]*>.*BST of 2 nodes; inorder: \[3, 5\]; 1 duplicate skipped/);
  });

  it('the final tree: every node in the tree, all edges, nothing current', () => {
    const html = render(example.at(-1)!);
    expect(Object.values(states(html))).toEqual(Array(7).fill('unvisited'));
    expect(html).toContain('Node 50: in the tree');
    expect(edges(html).map(e => `${e.edge}:${e.side}`).sort()).toEqual(['n0-n1:left', 'n0-n2:right', 'n1-n3:left', 'n1-n4:right', 'n2-n5:left', 'n2-n6:right']);
    expect(inputRow(html)).toEqual(Array(7).fill('done'));
  });

  it('a skewed tree of 16 levels gets compact rows, so it stays on screen', () => {
    const chain = steps(Array.from({ length: 16 }, (_, k) => k));
    // 16 rows of 46 px plus padding, instead of 16 × 66
    expect(render(chain.at(-1)!)).toMatch(/<svg width="788" height="788"/);
    // the example (3 levels) keeps the full row height
    expect(render(example.at(-1)!)).toMatch(/<svg width="374" height="250"/);
  });
});
