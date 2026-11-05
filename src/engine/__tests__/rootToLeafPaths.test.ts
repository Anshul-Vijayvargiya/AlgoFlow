import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateTextDraft } from '../inputParsing';
import { parseLevelOrderTree, treeFromLevelOrder, type BinaryTree } from '../tree/binaryTree';
import type { ExecutionStep } from '../../types/algorithm';

const def = getAlgorithmDefinition('tree-root-to-leaf-paths')!;
const run = (tree: string) => def.generateSteps([], { texts: [tree] });
/** the paths the last step holds, as values */
const pathsOf = (steps: ExecutionStep[]) => {
  const t = steps.at(-1)!.tree!;
  const v = (id: string) => t.nodes.find(n => n.id === id)!.value;
  return t.paths!.completed.map(p => p.map(v));
};

/** the reference: a plain recursive DFS over the parsed tree, left before right (paths as node ids) */
function reference(tree: BinaryTree): string[][] {
  const byId = new Map(tree.nodes.map(n => [n.id, n]));
  const out: string[][] = [];
  const walk = (id: string | null, path: string[]) => {
    if (id === null) return;
    const n = byId.get(id)!;
    const here = [...path, id];
    if (!n.left && !n.right) out.push(here);
    walk(n.left, here);
    walk(n.right, here);
  };
  walk(tree.root, []);
  return out;
}

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}

const EXAMPLE = '[1, 2, 3, 4, 5, 6, 7]';

describe('Root to Leaf Paths — output', () => {
  it('the example [1, 2, 3, 4, 5, 6, 7]: [1, 2, 4], [1, 2, 5], [1, 3, 6], [1, 3, 7]', () => {
    const steps = run(EXAMPLE);
    expect(pathsOf(steps)).toEqual([
      [1, 2, 4],
      [1, 2, 5],
      [1, 3, 6],
      [1, 3, 7],
    ]);
    expect(steps.at(-1)!.outcomeText).toBe('4 root-to-leaf paths: [1, 2, 4], [1, 2, 5], [1, 3, 6], [1, 3, 7]');
    expect(steps.at(-1)!.tree!.result).toEqual({ kind: 'answer', text: steps.at(-1)!.outcomeText });
  });

  it.each([
    ['empty tree', '[]', [], 'Empty tree: no root-to-leaf paths'],
    ['single node (the root is the only leaf)', '[7]', [[7]], '1 root-to-leaf path: [7]'],
    ['only a left child', '[1, 2]', [[1, 2]], '1 root-to-leaf path: [1, 2]'],
    ['only a right child', '[1, null, 2]', [[1, 2]], '1 root-to-leaf path: [1, 2]'],
    ['skewed left', '[1, 2, null, 3, null, 4, null, 5]', [[1, 2, 3, 4, 5]], '1 root-to-leaf path: [1, 2, 3, 4, 5]'],
    ['skewed right', '[1, null, 2, null, 3, null, 4, null, 5]', [[1, 2, 3, 4, 5]], '1 root-to-leaf path: [1, 2, 3, 4, 5]'],
    ['multiple leaves at different depths', '[1, 2, 3, 4, 5, null, 6]', [[1, 2, 4], [1, 2, 5], [1, 3, 6]], '3 root-to-leaf paths: [1, 2, 4], [1, 2, 5], [1, 3, 6]'],
    ['negative values', '[-1, -2, -3, null, -4]', [[-1, -2, -4], [-1, -3]], '2 root-to-leaf paths: [-1, -2, -4], [-1, -3]'],
    ['duplicate values (not a BST: no ordering is assumed)', '[2, 2, 2, 2, null, null, 2]', [[2, 2, 2], [2, 2, 2]], '2 root-to-leaf paths: [2, 2, 2], [2, 2, 2]'],
    ['a tree that is not a BST', '[5, 9, 1]', [[5, 9], [5, 1]], '2 root-to-leaf paths: [5, 9], [5, 1]'],
  ])('%s', (_name, tree, expected, text) => {
    const steps = run(tree);
    expect(pathsOf(steps)).toEqual(expected);
    expect(steps.at(-1)!.outcomeText).toBe(text);
  });

  it('300 random binary trees: exactly the reference paths, in left-to-right order; one per leaf, each from the root to that leaf', () => {
    const r = random(11);
    const next = () => r.next().value as number;
    let checked = 0;
    while (checked < 300) {
      const length = 1 + Math.floor(next() * 20);
      const values = Array.from({ length }, (_, k) => (k > 0 && next() < 0.3 ? 'null' : String(Math.floor(next() * 21) - 10)));
      const parsed = parseLevelOrderTree(`[${values.join(', ')}]`);
      if (!parsed.ok) continue;
      const tree = parsed.tree;
      const steps = run(`[${values.join(', ')}]`);
      const found = steps.at(-1)!.tree!.paths!.completed;
      expect(found, values.join(', ')).toEqual(reference(tree));
      // one path per leaf, each ending at a different leaf; each starts at the root and follows parent → child links
      const byId = new Map(tree.nodes.map(n => [n.id, n]));
      const leaves = tree.nodes.filter(n => !n.left && !n.right).map(n => n.id);
      expect(found.map(p => p.at(-1)).sort()).toEqual([...leaves].sort());
      for (const p of found) {
        expect(p[0]).toBe(tree.root);
        for (let k = 1; k < p.length; k++) expect([byId.get(p[k - 1])!.left, byId.get(p[k - 1])!.right]).toContain(p[k]);
      }
      checked++;
    }
  });
});

describe('Root to Leaf Paths — every step follows the recursive code', () => {
  const inputs = [EXAMPLE, '[]', '[7]', '[1, 2]', '[1, null, 2]', '[1, 2, null, 3, null, 4, null, 5]', '[1, 2, 3, 4, 5, null, 6]', '[2, 2, 2, 2, null, null, 2]'];
  const traces = inputs.map(run);

  it('starts with the setup and the call on the root; ends with no call in progress and an empty path', () => {
    for (const steps of traces) {
      expect(steps[0]).toMatchObject({ type: 'init', codeRef: 'init' });
      expect(steps[1]).toMatchObject({ codeRef: 'call-root' });
      expect(steps[1].tree!.paths!.calls).toEqual([{ node: steps[0].tree!.root, via: 'root' }]);
      expect(steps.at(-1)).toMatchObject({ type: 'complete', codeRef: 'return' });
      expect(steps.at(-1)!.tree!.paths!.calls).toEqual([]);
      expect(steps.at(-1)!.tree!.paths!.path).toEqual([]);
      expect(steps.map(s => s.id)).toEqual(steps.map((_, i) => i));
    }
  });

  it('the path is always the chain of non-empty calls in progress, root first: it is a real root-down path', () => {
    for (const steps of traces) {
      for (const s of steps) {
        const p = s.tree!.paths!;
        const chain = p.calls.flatMap(c => (c.node ? [c.node] : []));
        // after "add" and before "backtrack" the running node is on the path; the path never holds anything else
        expect(chain.slice(0, p.path.length)).toEqual(p.path);
        expect(p.path.length >= chain.length - 1).toBe(true);
      }
    }
  });

  it('"add" appends exactly the current node; "backtrack" removes exactly it; nothing else changes the path', () => {
    for (const steps of traces) {
      for (const [i, s] of steps.entries()) {
        if (i === 0) continue;
        const before = steps[i - 1].tree!.paths!.path;
        const after = s.tree!.paths!.path;
        if (s.codeRef === 'add') expect(after).toEqual([...before, s.tree!.current]);
        else if (s.codeRef === 'backtrack') expect([...after, s.tree!.current]).toEqual(before);
        else expect(after).toEqual(before);
      }
    }
  });

  it('backtracking restores the parent\'s path: after a child call returns, the path is what it was before the call', () => {
    for (const steps of traces) {
      for (const [i, s] of steps.entries()) {
        if (s.codeRef !== 'left-returned' && s.codeRef !== 'right-returned') continue;
        const call = s.codeRef === 'left-returned' ? 'recurse-left' : 'recurse-right';
        // the matching call: the latest one at the same depth
        const depth = s.tree!.paths!.calls.length;
        const k = steps.slice(0, i).findLastIndex(x => x.codeRef === call && x.tree!.paths!.calls.length === depth + 1);
        expect(k).toBeGreaterThan(-1);
        expect(s.tree!.paths!.path).toEqual(steps[k].tree!.paths!.path);
      }
    }
  });

  it('a path is saved only at a leaf, as a copy of the whole current path; a leaf\'s call never recurses', () => {
    for (const steps of traces) {
      for (const [i, s] of steps.entries()) {
        if (i === 0) continue;
        const before = steps[i - 1].tree!.paths!.completed;
        const after = s.tree!.paths!.completed;
        if (s.codeRef === 'save') {
          expect(steps[i - 1]).toMatchObject({ codeRef: 'check-leaf', result: 'true' });
          expect(after).toEqual([...before, s.tree!.paths!.path]);
          expect(steps[i + 1].codeRef).toBe('backtrack');
        } else {
          expect(after).toEqual(before);
        }
        if (s.codeRef === 'check-leaf') {
          const n = s.tree!.nodes.find(x => x.id === s.tree!.current)!;
          expect(s.result).toBe(String(n.left === null && n.right === null));
        }
      }
    }
  });

  it('a call pushes one frame for that child; only an empty child returns at once; the node pointer is the running call\'s node', () => {
    for (const steps of traces) {
      for (let i = 1; i < steps.length; i++) {
        const s = steps[i];
        const before = steps[i - 1].tree!.paths!.calls;
        const after = s.tree!.paths!.calls;
        if (s.codeRef === 'recurse-left' || s.codeRef === 'recurse-right') {
          const side = s.codeRef === 'recurse-left' ? 'left' : 'right';
          const parent = s.tree!.nodes.find(n => n.id === before.at(-1)!.node)!;
          expect(after).toEqual([...before, { node: parent[side], via: side }]);
        } else if (s.codeRef === 'call-root') {
          expect(after).toEqual([{ node: s.tree!.root, via: 'root' }]);
        } else {
          expect(after.length).toBeLessThanOrEqual(before.length);
        }
        if (s.codeRef === 'return-null') expect(after.at(-1)!.node).toBeNull();
        if (after.length) expect(s.tree!.pointers).toEqual([{ name: 'node', node: after.at(-1)!.node }]);
      }
    }
  });

  it('every node is added once and backtracked once; it ends finished', () => {
    for (const steps of traces) {
      const nodes = steps[0].tree!.nodes.map(n => n.id);
      const added = steps.filter(s => s.codeRef === 'add').map(s => s.tree!.current);
      const removed = steps.filter(s => s.codeRef === 'backtrack').map(s => s.tree!.current);
      expect([...added].sort()).toEqual([...nodes].sort());
      expect([...removed].sort()).toEqual([...nodes].sort());
      expect([...steps.at(-1)!.tree!.paths!.finished].sort()).toEqual([...nodes].sort());
    }
  });

  it('every step explains itself', () => {
    for (const steps of traces) for (const s of steps) {
      expect(s.message.length, `step ${s.id}`).toBeGreaterThan(0);
      expect(s.explanation?.length ?? 0, `step ${s.id}`).toBeGreaterThan(0);
      expect(s.actionLabel?.length ?? 0, `step ${s.id}`).toBeGreaterThan(0);
    }
  });

  it('the example in full: the statements the code runs, in order', () => {
    const leaf = 'check-null add check-leaf save backtrack';
    const inner = (l: string, r: string) => `check-null add check-leaf recurse-left ${l} left-returned recurse-right ${r} right-returned backtrack`;
    expect(run(EXAMPLE).map(s => s.codeRef).join(' ')).toBe(`init call-root ${inner(inner(leaf, leaf), inner(leaf, leaf))} return`);
  });
});

describe('Root to Leaf Paths — input', () => {
  it('takes one level-order tree with no BST rule; the default is [1, 2, 3, 4, 5, 6, 7]; documents O(n + L)', () => {
    expect(def.inputSpec!.texts!.map(f => [f.label, f.rule, f.defaultValue])).toEqual([['root', 'level-order-tree', '[1, 2, 3, 4, 5, 6, 7]']]);
    expect(def.inputSpec!.textRange).toBeUndefined();
    expect(def.complexity).toMatchObject({ best: 'O(n + L)', average: 'O(n + L)', worst: 'O(n·h)', space: 'O(h)' });
    // the traversals keep their own default
    expect(getAlgorithmDefinition('tree-inorder')!.inputSpec!.texts![0].defaultValue).toBe('[1, 2, 3, 4, 5, null, 6]');
    for (const texts of def.inputSpec!.textExamples!) expect(validateAlgorithmInput(def, [], null, null, null, texts), texts[0]).toEqual({ ok: true });
  });

  it('a tree that is not a BST, and repeated values, are accepted', () => {
    for (const t of ['[5, 9, 1]', '[2, 2, 2]', '[1, 2, 3]']) expect(validateTextDraft(def, [t])).toEqual({ ok: true, texts: [t] });
  });

  it('malformed trees and the node limits are refused like the traversals refuse them', () => {
    expect(validateTextDraft(def, ['[1, 2'])).toMatchObject({ ok: false, field: 0, message: expect.stringContaining('missing its closing "]"') });
    expect(validateTextDraft(def, ['[null, 1]'])).toMatchObject({ ok: false, message: expect.stringContaining('The root (value 1) cannot be null') });
    expect(validateTextDraft(def, [`[${Array.from({ length: 16 }, (_, k) => k).join(', ')}]`])).toMatchObject({ ok: false, message: expect.stringContaining('Too many nodes (16)') });
    expect(validateTextDraft(def, ['[1, null, 2, null, 3, null, 4, null, 5, null, 6]'])).toMatchObject({ ok: false, message: expect.stringContaining('6 levels deep') });
    expect(() => run('[1, x]')).toThrow(RangeError);
  });

  it('called without input it runs on its default example', () => {
    expect(pathsOf(def.generateSteps([]))).toEqual(pathsOf(run(EXAMPLE)));
    expect(treeFromLevelOrder(EXAMPLE).nodes).toHaveLength(7);
  });
});
