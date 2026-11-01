import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { AlgorithmId, ExecutionStep } from '../../../types/algorithm';
import { TreeVisualizer } from '../TreeVisualizer';

// The real TreeVisualizer for steps of the real recursive Build a BST trace: the call stack (outermost first, the
// running call distinct from the waiting ones and from a returning one), the base case, the node it creates before its
// caller links it, and the tree drawing shared with the iterative build.
const steps = (values: number[], id: AlgorithmId = 'build-bst-recursive') => getAlgorithmDefinition(id)!.generateSteps([...values]);
const render = (s: ExecutionStep) => renderToStaticMarkup(<TreeVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
/** the call stack as drawn: status, node, via and the text of each frame */
const calls = (html: string) =>
  [...html.matchAll(/data-frame="\d+" data-frame-status="([a-z]+)" data-frame-node="([^"]+)" data-frame-via="([a-z]+)"[^>]*>(.*?)<\/li>/g)].map(m => ({
    status: m[1],
    node: m[2],
    via: m[3],
    text: decode(m[4].replace(/<[^>]+>/g, '').replace(/<!-- -->/g, '')),
  }));
const states = (html: string) => Object.fromEntries([...html.matchAll(/data-node-id="(n\d+)" data-value="(-?\d+)" data-state="([a-z]+)"/g)].map(m => [Number(m[2]), m[3]]));
const all = steps([8, 4, 6]);
const at = (codeRef: string, index: number, n = 0) => all.filter(s => s.codeRef === codeRef && s.tree!.build!.index === index)[n];

describe('TreeVisualizer — the recursive build', () => {
  it('before any call: an empty stack in words, the empty tree and the input to come', () => {
    const html = render(all[0]);
    expect(html).toMatch(/data-testid="tree-calls" data-depth="0"/);
    expect(html).toContain('buildBST — no insert call in progress');
    expect(html).toContain('data-testid="tree-empty"');
  });

  it('the base case on the empty tree, then the new root returned before buildBST sets it', () => {
    expect(calls(render(at('check-null', 0)))).toEqual([{ status: 'active', node: 'null', via: 'root', text: 'insert(root = null, 8) — base case' }]);
    const html = render(at('base-create', 0));
    expect(calls(html)).toEqual([{ status: 'returning', node: 'null', via: 'root', text: 'insert(root = null, 8) ↩ returns new node 8' }]);
    expect(html).toMatch(/New node 8 created: it becomes the root once it is returned\./);
    expect(states(render(at('assign-root', 0)))).toEqual({ 8: 'inserted' });
  });

  it('6 three calls deep: the waiting callers, the running base case and the dashed empty child', () => {
    const html = render(at('check-null', 2, 2));
    expect(calls(html)).toEqual([
      { status: 'waiting', node: 'n0', via: 'root', text: 'insert(root = 8, 6) (waiting)' },
      { status: 'waiting', node: 'n1', via: 'left', text: '└─ insert(node.left = 4, 6) (waiting)' },
      { status: 'active', node: 'null', via: 'right', text: '└─ insert(node.right = null, 6) — base case' },
    ]);
    expect(html).toMatch(/data-testid="tree-slot" data-parent="n1" data-side="right" data-value="6" data-created="false"/);
    expect(states(html)).toEqual({ 8: 'path', 4: 'path' });
  });

  it('the base case returns the new node (drawn solid in its place), then the caller links it and returns in turn', () => {
    const created = render(at('base-create', 2));
    expect(created).toMatch(/data-testid="tree-slot" data-parent="n1" data-side="right" data-value="6" data-created="true"/);
    expect(created).toContain('New node 6 created for the empty right child of node 4.');
    expect(calls(created).at(-1)).toEqual({ status: 'returning', node: 'null', via: 'right', text: '└─ insert(node.right = null, 6) ↩ returns new node 6' });

    const linked = render(at('attach-right', 2));
    expect(linked).not.toContain('data-testid="tree-slot"');
    expect(states(linked)).toEqual({ 8: 'path', 4: 'current', 6: 'inserted' });
    expect(calls(linked).map(c => c.status)).toEqual(['waiting', 'active']);

    expect(calls(render(at('return-node', 2)))).toEqual([
      { status: 'waiting', node: 'n0', via: 'root', text: 'insert(root = 8, 6) (waiting)' },
      { status: 'returning', node: 'n1', via: 'left', text: '└─ insert(node.left = 4, 6) ↩ returns node 4' },
    ]);
  });

  it('the final tree is drawn as by the iterative build, with no call left', () => {
    const html = render(all.at(-1)!);
    expect(calls(html)).toEqual([]);
    expect(html).toContain('buildBST — no insert call in progress');
    expect(states(html)).toEqual(states(render(steps([8, 4, 6], 'build-bst').at(-1)!)));
    expect(html).toMatch(/data-testid="tree-result"[^>]*>.*BST of 3 nodes; inorder: \[4, 6, 8\]/);
  });

  it('a deep stack (16 calls) is listed in full in a scrolling region that starts at the running call', () => {
    const chain = steps(Array.from({ length: 16 }, (_, k) => k));
    const deepest = chain.reduce((best, s) => (s.tree!.build!.calls!.length > best.tree!.build!.calls!.length ? s : best));
    const html = render(deepest);
    expect(calls(html)).toHaveLength(16);
    expect(html).toMatch(/role="region" aria-label="Call stack" class="[^"]*overflow-y-auto flex flex-col-reverse/);
  });

  it('steps without calls render as before: the iterative build and the traversals show no call stack', () => {
    for (const s of [...steps([8, 4, 6], 'build-bst'), ...getAlgorithmDefinition('tree-inorder')!.generateSteps([], { texts: ['[1, 2, 3]'] })]) {
      expect(render(s)).not.toContain('data-testid="tree-calls"');
    }
  });
});
