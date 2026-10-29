import { describe, it, expect } from 'vitest';
import type { ExecutionStep } from '../../types/algorithm';
import { layoutTree, levelOrderText, nodeMap, parseLevelOrderTree, treeFromLevelOrder, treeLevels, MAX_TREE_NODES, type BinaryTree } from '../tree/binaryTree';
import { validateAlgorithmInput } from '../inputParsing';
import { def, makeRng, TREE_TEST_INPUTS } from './testUtils';

/**
 * The binary tree input (LeetCode's level-order array), its layout, and the four traversals run for real: the visit
 * order against recursive references, and every step's stack / queue, pointers and current node against what the
 * iterative code does.
 */
const IDS = ['tree-inorder', 'tree-preorder', 'tree-postorder', 'tree-level-order'] as const;
const run = (id: string, text: string) => def(id).generateSteps([], { texts: [text] });
const outputOf = (steps: ExecutionStep[]) => {
  const t = steps.at(-1)!.tree!;
  const byId = new Map(t.nodes.map(n => [n.id, n.value]));
  return t.visited.map(id => byId.get(id)!);
};

/** recursive references, written independently of the generators */
function reference(tree: BinaryTree): Record<(typeof IDS)[number], number[]> {
  const byId = nodeMap(tree);
  const out = { 'tree-inorder': [] as number[], 'tree-preorder': [] as number[], 'tree-postorder': [] as number[], 'tree-level-order': [] as number[] };
  const dfs = (id: string | null) => {
    if (!id) return;
    const n = byId.get(id)!;
    out['tree-preorder'].push(n.value);
    dfs(n.left);
    out['tree-inorder'].push(n.value);
    dfs(n.right);
    out['tree-postorder'].push(n.value);
  };
  dfs(tree.root);
  // level order: level by level, left to right (a node's depth from the layout)
  const pos = layoutTree(tree);
  out['tree-level-order'] = [...tree.nodes].sort((a, b) => pos[a.id].depth - pos[b.id].depth || pos[a.id].x - pos[b.id].x).map(n => n.value);
  return out;
}

/** a random tree of up to 15 nodes and 5 levels, written in level order */
function randomTree(rng: () => number): string {
  type N = { value: number; left: N | null; right: N | null; depth: number };
  const root: N = { value: Math.floor(rng() * 20), left: null, right: null, depth: 0 };
  const all = [root];
  const count = Math.floor(rng() * MAX_TREE_NODES);
  for (let k = 0; k < count; k++) {
    const open = all.filter(n => n.depth < 4 && (!n.left || !n.right));
    if (!open.length) break;
    const parent = open[Math.floor(rng() * open.length)];
    const child: N = { value: Math.floor(rng() * 20), left: null, right: null, depth: parent.depth + 1 };
    if (!parent.left && (parent.right || rng() < 0.5)) parent.left = child;
    else parent.right = child;
    all.push(child);
  }
  const values: (number | null)[] = [];
  const queue: (N | null)[] = [root];
  while (queue.length) {
    const n = queue.shift()!;
    values.push(n ? n.value : null);
    if (n) queue.push(n.left, n.right);
  }
  while (values.at(-1) === null) values.pop();
  return `[${values.map(v => (v === null ? 'null' : v)).join(', ')}]`;
}

describe('level-order input', () => {
  it('the example: 1 with children 2 and 3; 2 with 4 and 5; 3 with only a right child, 6', () => {
    const t = treeFromLevelOrder('[1, 2, 3, 4, 5, null, 6]');
    expect(t.root).toBe('n0');
    expect(t.nodes).toEqual([
      { id: 'n0', value: 1, left: 'n1', right: 'n2' },
      { id: 'n1', value: 2, left: 'n3', right: 'n4' },
      { id: 'n2', value: 3, left: null, right: 'n6' },
      { id: 'n3', value: 4, left: null, right: null },
      { id: 'n4', value: 5, left: null, right: null },
      { id: 'n6', value: 6, left: null, right: null },
    ]);
  });

  it('a null node has no children listed: [1, null, 2, 3] is 1 → right 2 → left 3', () => {
    const t = treeFromLevelOrder('[1, null, 2, 3]');
    const byValue = Object.fromEntries(t.nodes.map(n => [n.value, n]));
    expect(byValue[1].left).toBeNull();
    expect(byValue[1].right).toBe(byValue[2].id);
    expect(byValue[2].left).toBe(byValue[3].id);
    expect(byValue[2].right).toBeNull();
  });

  it('accepts brackets or none, any spacing, trailing nulls, NULL in capitals, negatives; [] is the empty tree', () => {
    for (const text of ['[1,2,3]', '1, 2, 3', '  [ 1 ,2,  3 ]  ', '[1, 2, 3, null, null]', '[1, 2, 3, NULL]']) {
      expect(levelOrderText(treeFromLevelOrder(text)), text).toBe('[1, 2, 3]');
    }
    expect(treeFromLevelOrder('[]')).toEqual({ nodes: [], root: null });
    expect(treeFromLevelOrder('[-999, 999]').nodes.map(n => n.value)).toEqual([-999, 999]);
  });

  it('refuses malformed input with a reason', () => {
    const message = (text: string) => {
      const r = parseLevelOrderTree(text);
      return r.ok ? 'ok' : r.message;
    };
    expect(message('[1, 2, 3')).toBe('The tree is missing its closing "]".');
    expect(message('1, 2]')).toBe('The tree is missing its opening "[".');
    expect(message('[1, , 3]')).toBe('Value 2 is empty: separate values with single commas.');
    expect(message('[1, 2.5]')).toMatch(/Value 2 \("2\.5"\) is a decimal/);
    expect(message('[1, x]')).toBe('Value 2 ("x") is not a whole number or null.');
    expect(message('[1, 1000]')).toBe('Value 2 (1000) is out of range: values go from -999 to 999.');
    expect(message('[null]')).toBe('A tree of only null is empty: write [] for the empty tree.');
    expect(message('[null, 1]')).toBe('The root (value 1) cannot be null. Write [] for the empty tree.');
    // 1 has children null and null: the next value has no parent
    expect(message('[1, null, null, 4]')).toBe('Value 4 (4) has no parent: every node before it already has both children listed, or is null.');
    expect(message(`[${Array.from({ length: 16 }, (_, k) => k).join(', ')}]`)).toBe(`Too many nodes (16). The visualizer shows at most ${MAX_TREE_NODES}.`);
    expect(message('[1, 2, null, 3, null, 4, null, 5, null, 6]')).toBe('The tree is 6 levels deep. The visualizer shows at most 5 levels.');
  });

  it('the visualizer field uses the same rules; the generators refuse what it refuses', () => {
    const d = def('tree-inorder');
    expect(validateAlgorithmInput(d, [], null, null, null, ['[1, null, 2]']).ok).toBe(true);
    expect(validateAlgorithmInput(d, [], null, null, null, ['[]']).ok).toBe(true);
    for (const bad of ['', '[1, x]', '[null, 1]']) {
      expect(validateAlgorithmInput(d, [], null, null, null, [bad]).ok, bad).toBe(false);
      for (const id of IDS) expect(() => run(id, bad), `${id} ${bad}`).toThrow(RangeError);
    }
    expect(validateAlgorithmInput(d, [1, 2], null, null, null, ['[1]']).ok).toBe(false); // an array is not a tree's input
  });
});

describe('layout: positions and edges', () => {
  it('every node gets a column of its own (its inorder rank) and a row by depth; a left child is left of its parent, a right child right', () => {
    for (const [text] of [...TREE_TEST_INPUTS, ...Array.from({ length: 100 }, (_, k) => [randomTree(makeRng(k + 1))])]) {
      const t = treeFromLevelOrder(text);
      const pos = layoutTree(t);
      expect(Object.values(pos).map(p => p.x).sort((a, b) => a - b), text).toEqual(t.nodes.map((_, k) => k));
      expect(pos[t.root ?? ''] ?? null, text).toEqual(t.root ? { x: pos[t.root].x, depth: 0 } : null);
      for (const n of t.nodes) {
        if (n.left) {
          expect(pos[n.left].x, `${text}: left of ${n.value}`).toBeLessThan(pos[n.id].x);
          expect(pos[n.left].depth).toBe(pos[n.id].depth + 1);
        }
        if (n.right) {
          expect(pos[n.right].x, `${text}: right of ${n.value}`).toBeGreaterThan(pos[n.id].x);
          expect(pos[n.right].depth).toBe(pos[n.id].depth + 1);
        }
      }
      expect(Math.max(-1, ...Object.values(pos).map(p => p.depth)) + 1).toBe(treeLevels(t));
    }
  });

  it('the example’s layout: 4 2 5 1 3 6 from left to right, on rows 2 1 2 0 1 2', () => {
    const t = treeFromLevelOrder('[1, 2, 3, 4, 5, null, 6]');
    const pos = layoutTree(t);
    const byColumn = [...t.nodes].sort((a, b) => pos[a.id].x - pos[b.id].x);
    expect(byColumn.map(n => n.value)).toEqual([4, 2, 5, 1, 3, 6]);
    expect(byColumn.map(n => pos[n.id].depth)).toEqual([2, 1, 2, 0, 1, 2]);
  });

  it('writing a tree back in level order gives the same tree', () => {
    for (let k = 0; k < 100; k++) {
      const text = randomTree(makeRng(500 + k));
      expect(levelOrderText(treeFromLevelOrder(text))).toBe(text);
    }
  });
});

describe('traversal sequences', () => {
  it('the example [1, 2, 3, 4, 5, null, 6]', () => {
    const text = '[1, 2, 3, 4, 5, null, 6]';
    expect(outputOf(run('tree-inorder', text))).toEqual([4, 2, 5, 1, 3, 6]);
    expect(outputOf(run('tree-preorder', text))).toEqual([1, 2, 4, 5, 3, 6]);
    expect(outputOf(run('tree-postorder', text))).toEqual([4, 5, 2, 6, 3, 1]);
    expect(outputOf(run('tree-level-order', text))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('balanced, unbalanced, missing children, one node and empty: all four against the recursive references', () => {
    for (const [text] of TREE_TEST_INPUTS) {
      const ref = reference(treeFromLevelOrder(text));
      for (const id of IDS) expect(outputOf(run(id, text)), `${id} ${text}`).toEqual(ref[id]);
    }
    // a BST's inorder is sorted
    expect(outputOf(run('tree-inorder', '[4, 2, 6, 1, 3, 5, 7]'))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // a chain to the right: every order but postorder follows it
    expect(outputOf(run('tree-postorder', '[1, null, 2, null, 3, null, 4]'))).toEqual([4, 3, 2, 1]);
    for (const id of IDS) expect(outputOf(run(id, '[]')), id).toEqual([]);
    for (const id of IDS) expect(outputOf(run(id, '[7]')), id).toEqual([7]);
  });

  it('300 random trees: all four agree with the references', () => {
    const rng = makeRng(2026);
    for (let k = 0; k < 300; k++) {
      const text = randomTree(rng);
      const ref = reference(treeFromLevelOrder(text));
      for (const id of IDS) expect(outputOf(run(id, text)), `${id} ${text}`).toEqual(ref[id]);
    }
  });
});

describe('every step follows the iterative code', () => {
  const traces = (id: string) => TREE_TEST_INPUTS.map(([text]) => ({ text, steps: run(id, text) }));

  it('DFS stacks: a push adds the node on top, a pop removes the top, nothing else changes the stack', () => {
    for (const id of ['tree-inorder', 'tree-preorder', 'tree-postorder']) {
      for (const { text, steps } of traces(id)) {
        let stack: string[] = [];
        for (const s of steps) {
          const items = s.tree!.stack?.items;
          if (!items) continue;
          const action = s.tree!.stack!.action;
          if (action === 'push') expect(items.slice(0, -1), `${id} ${text} step ${s.id}`).toEqual(stack);
          else if (action === 'pop') expect([...items, s.tree!.current ?? '?'], `${id} ${text} step ${s.id}`).toEqual(stack);
          else expect(items, `${id} ${text} step ${s.id} (${s.codeRef})`).toEqual(stack);
          stack = [...items];
        }
        expect(stack, `${id} ${text}: empty at the end`).toEqual([]);
      }
    }
  });

  it('the level-order queue: enqueue adds at the back, dequeue removes the front (first in, first out)', () => {
    for (const { text, steps } of traces('tree-level-order')) {
      let queue: string[] = [];
      for (const s of steps) {
        const q = s.tree!.queue;
        if (!q) continue;
        if (q.action === 'enqueue') expect(q.items.slice(0, -1), `${text} step ${s.id}`).toEqual(queue);
        else if (q.action === 'dequeue') expect([s.tree!.current, ...q.items], `${text} step ${s.id}`).toEqual(queue);
        else expect(q.items).toEqual(queue);
        queue = [...q.items];
      }
      expect(queue).toEqual([]);
    }
  });

  it('every reference is a node of the tree; each node is visited once; the trace ends with every node visited', () => {
    for (const id of IDS) {
      for (const { text, steps } of traces(id)) {
        const ids = new Set(treeFromLevelOrder(text).nodes.map(n => n.id));
        for (const s of steps) {
          const t = s.tree!;
          const where = `${id} ${text} step ${s.id}`;
          expect(s.state, where).toEqual([]);
          for (const ref of [...t.visited, ...(t.stack?.items ?? []), ...(t.queue?.items ?? []), ...(t.current ? [t.current] : [])]) {
            expect(ids.has(ref), `${where}: ${ref}`).toBe(true);
          }
          for (const p of t.pointers ?? []) expect(p.node === null || ids.has(p.node), `${where}: ${p.name}`).toBe(true);
          expect(new Set(t.visited).size, where).toBe(t.visited.length);
          expect(`${s.message} ${s.explanation ?? ''}`, where).not.toMatch(/undefined|NaN/);
        }
        const end = steps.at(-1)!;
        expect(end.type).toBe('complete');
        expect(end.tree!.visited).toHaveLength(ids.size);
        expect(end.tree!.result?.text).toMatch(/^(Inorder|Preorder|Postorder|Level order): \[/);
        // linear: a bounded number of steps per node
        expect(steps.length, `${id} ${text}`).toBeLessThanOrEqual(14 * ids.size + 8);
      }
    }
  });

  it('a visit step appends exactly the current node to the output', () => {
    for (const id of IDS) {
      for (const { steps } of traces(id)) {
        for (const [k, s] of steps.entries()) {
          if (s.codeRef !== 'visit') continue;
          expect(s.tree!.visited).toEqual([...steps[k - 1].tree!.visited, s.tree!.current]);
        }
      }
    }
  });

  it('inorder: curr is always the node the code holds — pushed nodes are curr, popped nodes become curr', () => {
    for (const { steps } of traces('tree-inorder')) {
      for (const s of steps) {
        const curr = s.tree!.pointers?.find(p => p.name === 'curr')?.node;
        if (s.codeRef === 'push') expect(s.tree!.stack!.items.at(-1)).toBe(curr);
        if (s.codeRef === 'pop' || s.codeRef === 'visit') expect(s.tree!.current).toBe(curr);
      }
    }
  });
});
