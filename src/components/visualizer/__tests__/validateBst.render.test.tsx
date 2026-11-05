import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { TreeVisualizer } from '../TreeVisualizer';

// The real TreeVisualizer for steps of the real Validate BST trace: each node's state (current, validated, completed,
// invalid, the conflicting ancestor, unvisited), the running call's allowed range, the call stack with its bounds, the
// nodes validated so far, the violation and the verdict.
const run = (tree: string) => getAlgorithmDefinition('tree-validate-bst')!.generateSteps([], { texts: [tree] });
const render = (s: ExecutionStep) => renderToStaticMarkup(<TreeVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
/** every node as "value:state" */
const states = (html: string) => [...html.matchAll(/data-value="(-?\d+)" data-state="([a-z]+)"/g)].map(m => `${m[1]}:${m[2]}`);
const frames = (html: string) =>
  [...html.matchAll(/data-frame-status="([a-z]+)" data-frame-node="([^"]+)" data-frame-via="([a-z]+)" data-frame-min="([^"]+)" data-frame-max="([^"]+)" data-frame-returns="([a-z]*)"/g)].map(
    m => `${m[3]}:${m[2]}:(${m[4]},${m[5]}):${m[1]}${m[6] ? `:${m[6]}` : ''}`
  );

const VALID = run('[10, 5, 15, 2, 7, 12, 20]');
const INVALID = run('[10, 5, 15, null, null, 6, 20]');
/** the step checking the node with this value (check-range) */
const checking = (steps: ExecutionStep[], value: number) =>
  steps.find(s => s.codeRef === 'check-range' && s.tree!.nodes.find(n => n.id === s.tree!.current)?.value === value)!;

describe('TreeVisualizer — Validate BST', () => {
  it('the start: every node unchecked, the root call with (−∞, +∞), nothing validated yet', () => {
    const html = render(VALID[0]);
    expect(states(html)).toEqual(['10:current', '5:unvisited', '15:unvisited', '2:unvisited', '7:unvisited', '12:unvisited', '20:unvisited']);
    expect(decode(html)).toMatch(/data-testid="tree-bounds" data-min="−∞" data-max="\+∞"/);
    expect(decode(html)).toContain('allowed range for 10: </span><span class="font-bold text-cyan-300">(−∞, +∞)</span>');
    expect(frames(html)).toEqual(['root:n0:(−∞,+∞):active']);
    expect(html).toContain('data-testid="tree-validated"');
    expect(html).not.toContain('data-validated=');
  });

  it('the current node is highlighted, with the range its call allows (min < value < max)', () => {
    const html = render(checking(VALID, 7));
    expect(states(html)).toContain('7:current');
    expect(decode(html)).toMatch(/data-testid="tree-bounds" data-min="5" data-max="10"/);
    expect(decode(html)).toContain('(5, 10)</span><span class="text-slate-400"> (min < value < max)</span>');
    // the call stack carries the bounds of every call in progress
    expect(frames(html)).toEqual(['root:n0:(−∞,+∞):waiting', 'left:n1:(−∞,10):waiting', 'right:n4:(5,10):active']);
    expect(decode(html)).toContain('isValidBST(node.right = 7, 5, 10)');
  });

  it('validated (in range, subtrees in progress) and completed (whole subtree valid) are drawn and said differently', () => {
    // 2's call has returned true; 5 and 10 are in range and wait for the rest of their subtrees
    const html = render(checking(VALID, 7));
    expect(states(html)).toEqual(['10:validated', '5:validated', '15:unvisited', '2:completed', '7:current', '12:unvisited', '20:unvisited']);
    expect(decode(html)).toContain('Node 10: in its allowed range; its subtrees are being checked');
    expect(decode(html)).toContain('Node 2: its whole subtree is a valid BST');
    expect(decode(html)).toContain('Node 15: not checked yet');
    // 7 has just passed its own check: listed last, highlighted as the current node
    expect([...html.matchAll(/data-validated="(-?\d+)"/g)].map(m => m[1])).toEqual(['10', '5', '2', '7']);
    expect(html).toMatch(/data-validated="7" class="[^"]*bg-amber-500\/20/);
    // the edges walked so far are drawn, the others are not
    expect(html).toMatch(/data-edge="n1-n3"[^>]*class="stroke-emerald-500\/70"/);
    expect(html).toMatch(/data-edge="n0-n2"[^>]*class="stroke-slate-600"/);
  });

  it('a returning call shows what it returns', () => {
    const ret = VALID.find(s => s.codeRef === 'return-right' && s.tree!.current === 'n3')!;
    expect(frames(render(ret)).at(-1)).toBe('left:n3:(−∞,5):returning:true');
    expect(decode(render(ret))).toContain('↩ returns true');
  });

  it('the invalid node and the ancestor whose bound it breaks; the violation is explained', () => {
    const html = render(checking(INVALID, 6));
    expect(states(html)).toEqual(['10:conflict', '5:completed', '15:validated', '6:invalid', '20:unvisited']);
    expect(decode(html)).toContain('Node 6: invalid: outside its allowed range');
    expect(decode(html)).toContain('Node 10: the ancestor whose bound the invalid node breaks');
    expect(decode(html)).toMatch(/data-testid="tree-bounds" data-min="10" data-max="15"/);
    expect(decode(html)).toContain('data-testid="tree-violation" class="text-rose-200 font-bold">6 is in the right subtree of 10, so it must be greater than 10.</p>');
    // the conflicting ancestor is drawn dashed
    expect(html).toMatch(/data-value="10" data-state="conflict"[^>]*><circle[^>]*stroke-dasharray="4 3"/);
  });

  it('the end: VALID BST, every node completed, no call in progress', () => {
    const html = render(VALID.at(-1)!);
    expect(states(html).every(s => s.endsWith(':completed'))).toBe(true);
    expect(html).toMatch(/data-testid="tree-result" data-verdict="valid" class="[^"]*bg-cyan-500\/15/);
    expect(html).toContain('VALID BST: all 7 nodes are inside the ranges their ancestors allow');
    expect(html).toContain('no call in progress');
    expect(html).not.toContain('data-testid="tree-violation"');
  });

  it('the end: INVALID BST with the reason; unchecked nodes say validation stopped early', () => {
    const html = render(INVALID.at(-1)!);
    expect(html).toMatch(/data-testid="tree-result" data-verdict="invalid" class="[^"]*bg-rose-500\/15/);
    expect(html).toContain('INVALID BST: 6 is in the right subtree of 10, so it must be greater than 10');
    expect(states(html)).toContain('6:invalid');
    expect(decode(html)).toContain('Node 20: never checked (validation stopped early)');
  });

  it('a repeated value is invalid, and the reason says values cannot repeat', () => {
    const html = render(run('[10, 5, 15, 5]').at(-1)!);
    expect(states(html)).toEqual(['10:validated', '5:conflict', '15:unvisited', '5:invalid']);
    expect(html).toContain('INVALID BST: 5 is in the left subtree of 5, so it must be smaller than 5 (values cannot repeat)');
  });

  it('the empty tree: the empty message, then VALID BST', () => {
    const steps = run('[]');
    expect(render(steps[0])).toContain('data-testid="tree-empty"');
    expect(render(steps.at(-1)!)).toContain('VALID BST: the empty tree is a valid binary search tree');
  });

  it('other tree algorithms are unchanged: no bounds, no verdict', () => {
    const inorder = getAlgorithmDefinition('tree-inorder')!.generateSteps([]);
    for (const s of [inorder[0], inorder.at(-1)!]) {
      const html = render(s);
      expect(html).not.toContain('tree-bounds');
      expect(html).not.toContain('data-verdict');
      expect(html).not.toContain('tree-validated');
    }
  });
});
