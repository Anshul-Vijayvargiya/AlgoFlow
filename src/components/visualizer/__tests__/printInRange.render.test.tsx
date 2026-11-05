import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { TreeVisualizer } from '../TreeVisualizer';

// The real TreeVisualizer for steps of the real Print in Range (BST) trace: each node's state (current, printed,
// checked outside the range, pruned, its call waiting), the dashed edges into pruned subtrees, the range, the call
// stack, the skipped nodes and the printed output.
const run = (tree: string, low: number, high: number) => getAlgorithmDefinition('bst-print-in-range')!.generateSteps([], { texts: [tree, String(low), String(high)] });
const render = (s: ExecutionStep) => renderToStaticMarkup(<TreeVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/<!-- -->/g, '');
const states = (html: string) => Object.fromEntries([...html.matchAll(/data-node-id="(n\d+)" data-value="(-?\d+)" data-state="([a-z]+)"/g)].map(m => [Number(m[2]), m[3]]));
const calls = (html: string) =>
  [...html.matchAll(/data-frame="\d+" data-frame-status="([a-z]+)" data-frame-node="([^"]+)" data-frame-via="([a-z]+)"[^>]*>(.*?)<\/li>/g)].map(m => ({
    status: m[1],
    via: m[3],
    text: decode(m[4].replace(/<[^>]+>/g, '')),
  }));
const printed = (html: string) => [...html.matchAll(/data-output="(-?\d+)"/g)].map(m => Number(m[1]));
const prunedEdges = (html: string) => [...html.matchAll(/data-edge="(n\d+-n\d+)" data-side="[a-z]+"[^>]*data-pruned="true"/g)].map(m => m[1]);

const example = run('[8, 5, 12, 3, 6, 10, 14]', 5, 12);
const at = (codeRef: string, n = 0) => example.filter(s => s.codeRef === codeRef)[n];

describe('TreeVisualizer — Print in Range (BST)', () => {
  it('the first call: the range, root as current, one call, nothing printed or skipped yet', () => {
    const html = render(example[0]);
    expect(html).toMatch(/data-testid="tree-range" data-low="5" data-high="12"/);
    expect(decode(html)).toContain('[5, 12]');
    expect(calls(html)).toEqual([{ status: 'active', via: 'root', text: 'printInRange(root = 8, 5, 12)' }]);
    expect(states(html)).toEqual({ 8: 'current', 5: 'unvisited', 12: 'unvisited', 3: 'unvisited', 6: 'unvisited', 10: 'unvisited', 14: 'unvisited' });
    expect(decode(html)).toMatch(/skipped by pruning: <span[^>]*>none yet/);
    expect(html).toMatch(/printed:<\/span>/);
  });

  it('5 = low: the left test is false, so 3 is pruned (dashed node and edge) while 8\'s call waits', () => {
    const html = render(at('check-left', 1));
    expect(states(html)).toMatchObject({ 5: 'current', 8: 'waiting', 3: 'pruned' });
    expect(prunedEdges(html)).toEqual(['n1-n3']);
    expect(html).toMatch(/data-node-id="n3"[^>]*>.*?stroke-dasharray="4 3"/);
    expect(calls(html)).toEqual([
      { status: 'waiting', via: 'root', text: 'printInRange(root = 8, 5, 12) (waiting)' },
      { status: 'active', via: 'left', text: '└─ printInRange(node.left = 5, 5, 12)' },
    ]);
    expect(decode(html)).toMatch(/skipped by pruning: <span[^>]*>3</);
  });

  it('a call on an empty child is drawn as such in the stack', () => {
    const html = render(at('return-null'));
    expect(calls(html).at(-1)).toEqual({ status: 'active', via: 'left', text: '└─ printInRange(node.left = null, 5, 12) — empty subtree' });
  });

  it('printing: the printed nodes in ascending order, the newest one current', () => {
    const html = render(at('print', 2)); // 8
    expect(printed(html)).toEqual([5, 6, 8]);
    expect(states(html)).toMatchObject({ 8: 'current', 5: 'visited', 6: 'visited' });
  });

  it('the end: everything printed, 3 and 14 pruned, no call left, the answer', () => {
    const html = render(example.at(-1)!);
    expect(printed(html)).toEqual([5, 6, 8, 10, 12]);
    expect(states(html)).toEqual({ 8: 'visited', 5: 'visited', 12: 'visited', 3: 'pruned', 6: 'visited', 10: 'visited', 14: 'pruned' });
    expect(prunedEdges(html).sort()).toEqual(['n1-n3', 'n2-n6']);
    expect(html).toContain('no call in progress');
    expect(html).toMatch(/data-testid="tree-result"[^>]*>.*Printed in ascending order: 5 6 8 10 12/);
  });

  it('a node checked and found outside the range is marked so, and said in words', () => {
    // [8, 5, 12, 3, 6, 10, 14] with [9, 11]: 8 is checked (below 9), then 12 (above 11)
    const steps = run('[8, 5, 12, 3, 6, 10, 14]', 9, 11);
    const html = render(steps.at(-1)!);
    expect(states(html)).toMatchObject({ 8: 'outside', 12: 'outside', 10: 'visited', 5: 'pruned', 3: 'pruned', 6: 'pruned', 14: 'pruned' });
    expect(decode(html)).toContain('Node 8: checked: outside the range, not printed');
    expect(decode(html)).toContain('Node 5: skipped: its subtree cannot hold a value in range');
    expect(decode(html)).toContain('Node 10: printed');
  });

  it('the empty tree: the empty drawing and the answer', () => {
    const steps = run('[]', 1, 5);
    const html = render(steps.at(-1)!);
    expect(html).toContain('data-testid="tree-empty"');
    expect(html).toMatch(/Empty tree: nothing to print/);
  });

  it('the other tree algorithms render as before: no range, no "printed:" label', () => {
    const inorder = getAlgorithmDefinition('tree-inorder')!.generateSteps([]);
    const html = render(inorder.at(-1)!);
    expect(html).not.toContain('data-testid="tree-range"');
    expect(html).not.toContain('data-testid="tree-pruned"');
    expect(html).toMatch(/output:<\/span>/);
  });
});
