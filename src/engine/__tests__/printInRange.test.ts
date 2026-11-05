import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateTextDraft } from '../inputParsing';
import { bstViolation, parseLevelOrderTree, treeFromLevelOrder, treeLevels, MAX_TREE_LEVELS, MAX_TREE_NODES } from '../tree/binaryTree';
import type { ExecutionStep } from '../../types/algorithm';

const def = getAlgorithmDefinition('bst-print-in-range')!;
const run = (tree: string, low: number, high: number) => def.generateSteps([], { texts: [tree, String(low), String(high)] });
const printedValues = (steps: ExecutionStep[]) => {
  const last = steps.at(-1)!.tree!;
  const byId = new Map(last.nodes.map(n => [n.id, n.value]));
  return last.visited.map(id => byId.get(id)!);
};
const valueOf = (steps: ExecutionStep[], id: string) => steps[0].tree!.nodes.find(n => n.id === id)!.value;

/** a BST built by inserting values in order, written in level order (what the field takes) */
function bstText(values: number[]): string {
  type N = { v: number; l: N | null; r: N | null };
  let root: N | null = null;
  const insert = (n: N | null, v: number): N => (n === null ? { v, l: null, r: null } : v < n.v ? { ...n, l: insert(n.l, v) } : v > n.v ? { ...n, r: insert(n.r, v) } : n);
  for (const v of values) root = insert(root, v);
  const out: (number | null)[] = [];
  const queue: (N | null)[] = [root];
  if (!root) return '[]';
  while (queue.length) {
    const n = queue.shift()!;
    out.push(n ? n.v : null);
    if (n) queue.push(n.l, n.r);
  }
  while (out.at(-1) === null) out.pop();
  return `[${out.map(v => v ?? 'null').join(', ')}]`;
}

/** the reference: which nodes the pruned recursion reaches, and what it prints */
function reference(text: string, low: number, high: number) {
  const tree = treeFromLevelOrder(text);
  const byId = new Map(tree.nodes.map(n => [n.id, n]));
  const reached: string[] = [];
  const printed: number[] = [];
  const walk = (id: string | null) => {
    if (id === null) return;
    const n = byId.get(id)!;
    reached.push(id);
    if (n.value > low) walk(n.left);
    if (low <= n.value && n.value <= high) printed.push(n.value);
    if (n.value < high) walk(n.right);
  };
  walk(tree.root);
  return { reached, printed, all: tree.nodes.map(n => n.value) };
}

// a deterministic pseudo-random sequence (no flaky seeds)
function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}

const EXAMPLE = '[8, 5, 12, 3, 6, 10, 14]';

describe('Print in Range (BST) — output', () => {
  it('the example: [8, 5, 12, 3, 6, 10, 14] with low = 5, high = 12 prints 5 6 8 10 12', () => {
    const steps = run(EXAMPLE, 5, 12);
    expect(printedValues(steps)).toEqual([5, 6, 8, 10, 12]);
    expect(steps.at(-1)!.outcomeText).toBe('Printed in ascending order: 5 6 8 10 12');
    expect(steps.at(-1)!.tree!.result).toEqual({ kind: 'answer', text: 'Printed in ascending order: 5 6 8 10 12' });
    // 3 (left of 5 = low) and 14 (right of 12 = high) are pruned, never visited
    expect(steps.at(-1)!.tree!.range!.pruned.map(id => valueOf(steps, id))).toEqual([3, 14]);
  });

  it.each([
    ['empty BST', '[]', 1, 5, [], 'Empty tree: nothing to print'],
    ['single node in range', '[7]', 7, 7, [7], 'Printed in ascending order: 7'],
    ['single node out of range', '[7]', 1, 2, [], 'No value of the tree is in [1, 2]: nothing printed'],
    ['no node inside the range', EXAMPLE, 9, 9, [], 'No value of the tree is in [9, 9]: nothing printed'],
    ['entire tree inside', EXAMPLE, -999, 999, [3, 5, 6, 8, 10, 12, 14], 'Printed in ascending order: 3 5 6 8 10 12 14'],
    ['low equals high, a value of the tree', EXAMPLE, 6, 6, [6], 'Printed in ascending order: 6'],
    ['range below every value', EXAMPLE, -5, 1, [], 'No value of the tree is in [-5, 1]: nothing printed'],
    ['range above every value', EXAMPLE, 20, 30, [], 'No value of the tree is in [20, 30]: nothing printed'],
    ['negative values', '[-5, -10, 0, -12, -7, null, 3]', -8, -1, [-7, -5], 'Printed in ascending order: -7 -5'],
    ['boundaries included', EXAMPLE, 3, 14, [3, 5, 6, 8, 10, 12, 14], 'Printed in ascending order: 3 5 6 8 10 12 14'],
    ['a right-skewed tree', '[1, null, 2, null, 3, null, 4]', 2, 3, [2, 3], 'Printed in ascending order: 2 3'],
  ])('%s', (_name, tree, low, high, expected, text) => {
    const steps = run(tree, low, high);
    expect(printedValues(steps)).toEqual(expected);
    expect(steps.at(-1)!.outcomeText).toBe(text);
  });

  it('400 random BSTs and ranges: prints exactly the values in [low, high], ascending, and visits only what the pruned recursion reaches', () => {
    const r = random(7);
    const next = () => r.next().value as number;
    let checked = 0;
    while (checked < 400) {
      const values = Array.from({ length: Math.floor(next() * 16) }, () => Math.floor(next() * 200) - 100);
      const text = bstText(values);
      // only trees the visualizer accepts (at most 15 nodes and 5 levels): a random insertion order is often deeper
      const parsed = parseLevelOrderTree(text);
      if (!parsed.ok) continue;
      const tree = parsed.tree;
      expect(tree.nodes.length).toBeLessThanOrEqual(MAX_TREE_NODES);
      expect(treeLevels(tree)).toBeLessThanOrEqual(MAX_TREE_LEVELS);
      let low = Math.floor(next() * 240) - 120;
      let high = Math.floor(next() * 240) - 120;
      if (low > high) [low, high] = [high, low];
      const steps = run(text, low, high);
      const ref = reference(text, low, high);
      expect(printedValues(steps), `${text} [${low}, ${high}]`).toEqual(ref.all.filter(v => low <= v && v <= high).sort((a, b) => a - b));
      expect(printedValues(steps)).toEqual(ref.printed);
      // the nodes the trace works on are exactly the ones the recursion reaches, in the same order
      const visitedOrder = steps.filter(s => s.codeRef === 'check-null' && s.result === 'false').map(s => s.tree!.current!);
      expect(visitedOrder).toEqual(ref.reached);
      // every node is reached or pruned, never both
      const pruned = steps.at(-1)!.tree!.range!.pruned;
      expect(new Set([...pruned, ...visitedOrder]).size).toBe(tree.nodes.length);
      expect(pruned.filter(id => visitedOrder.includes(id))).toEqual([]);
      checked++;
    }
  });
});

describe('Print in Range (BST) — every step follows the recursive code', () => {
  const traces = [
    run(EXAMPLE, 5, 12),
    run(EXAMPLE, 9, 11),
    run(EXAMPLE, -999, 999),
    run('[-5, -10, 0, -12, -7, null, 3]', -8, -1),
    run('[1, null, 2, null, 3, null, 4]', 2, 3),
    run('[]', 1, 5),
  ];

  it('starts with the call on the root and ends with no call in progress', () => {
    for (const steps of traces) {
      expect(steps[0]).toMatchObject({ type: 'init', codeRef: 'call-root' });
      expect(steps[0].tree!.range!.calls).toEqual([{ node: steps[0].tree!.root, via: 'root' }]);
      expect(steps.at(-1)).toMatchObject({ type: 'complete', codeRef: 'done' });
      expect(steps.at(-1)!.tree!.range!.calls).toEqual([]);
      expect(steps.map(s => s.id)).toEqual(steps.map((_, i) => i));
    }
  });

  it('a recursive call pushes exactly one frame for that child; the node pointer is always the running call\'s node', () => {
    for (const steps of traces) {
      for (let i = 1; i < steps.length; i++) {
        const before = steps[i - 1].tree!.range!.calls;
        const after = steps[i].tree!.range!.calls;
        const s = steps[i];
        if (s.codeRef === 'recurse-left' || s.codeRef === 'recurse-right') {
          const side = s.codeRef === 'recurse-left' ? 'left' : 'right';
          const parent = steps[0].tree!.nodes.find(n => n.id === before.at(-1)!.node)!;
          expect(after).toEqual([...before, { node: parent[side], via: side }]);
        } else {
          // other steps never add a frame; frames end only when their call returns
          expect(after.length).toBeLessThanOrEqual(before.length);
        }
        if (after.length) expect(s.tree!.pointers).toEqual([{ name: 'node', node: after.at(-1)!.node }]);
      }
    }
  });

  it('only a null call returns at once; after the test the null call is the running frame', () => {
    for (const steps of traces) {
      for (const [i, s] of steps.entries()) {
        if (s.codeRef !== 'return-null') continue;
        expect(steps[i - 1]).toMatchObject({ codeRef: 'check-null', result: 'true' });
        expect(s.tree!.range!.calls.at(-1)!.node).toBeNull();
      }
    }
  });

  it('a print step appends exactly the current node, which was just found in range', () => {
    for (const steps of traces) {
      for (const [i, s] of steps.entries()) {
        const before = steps[i - 1]?.tree!.visited ?? [];
        if (s.codeRef === 'print') {
          expect(steps[i - 1]).toMatchObject({ codeRef: 'check-range', result: 'true' });
          expect(s.tree!.visited).toEqual([...before, s.tree!.current]);
        } else if (i > 0) {
          expect(s.tree!.visited).toEqual(before);
        }
      }
    }
  });

  it('a false left / right test prunes exactly that child\'s subtree; nothing else ever prunes', () => {
    for (const steps of traces) {
      for (const [i, s] of steps.entries()) {
        if (i === 0) continue;
        const before = steps[i - 1].tree!.range!.pruned;
        const after = s.tree!.range!.pruned;
        const pruning = (s.codeRef === 'check-left' || s.codeRef === 'check-right') && s.result === 'false';
        if (!pruning) {
          expect(after).toEqual(before);
          continue;
        }
        const node = s.tree!.nodes.find(n => n.id === s.tree!.current)!;
        const child = s.codeRef === 'check-left' ? node.left : node.right;
        const added = after.slice(before.length);
        if (child === null) expect(added).toEqual([]);
        else expect(added[0]).toBe(child);
        // the pruned values are all on the wrong side of the range
        for (const id of added) {
          const v = valueOf(steps, id);
          expect(s.codeRef === 'check-left' ? v < s.tree!.range!.low : v > s.tree!.range!.high).toBe(true);
        }
      }
    }
  });

  it('the left test is node.val > low, the range test low <= node.val <= high, the right test node.val < high', () => {
    for (const steps of traces) {
      for (const s of steps) {
        const r = s.tree!.range!;
        const v = s.tree!.current ? valueOf(steps, s.tree!.current) : null;
        if (s.codeRef === 'check-left') expect(s.result).toBe(String(v! > r.low));
        if (s.codeRef === 'check-range') expect(s.result).toBe(String(r.low <= v! && v! <= r.high));
        if (s.codeRef === 'check-right') expect(s.result).toBe(String(v! < r.high));
      }
    }
  });

  it('a node found out of range is marked outside from that step on; printed nodes never are', () => {
    for (const steps of traces) {
      for (const s of steps) {
        const r = s.tree!.range!;
        for (const id of r.outside) {
          const v = valueOf(steps, id);
          expect(v < r.low || v > r.high).toBe(true);
          expect(s.tree!.visited).not.toContain(id);
        }
      }
    }
  });

  it('every step explains itself', () => {
    for (const steps of traces) for (const s of steps) {
      expect(s.message.length, `step ${s.id}`).toBeGreaterThan(0);
      expect(s.explanation?.length ?? 0, `step ${s.id}`).toBeGreaterThan(0);
      expect(s.actionLabel?.length ?? 0, `step ${s.id}`).toBeGreaterThan(0);
    }
  });

  it('the example in full: the steps the code takes, in order', () => {
    const steps = run(EXAMPLE, 5, 12);
    expect(steps.map(s => s.codeRef).join(' ')).toBe(
      [
        'call-root check-null check-left recurse-left', // 8: go left
        'check-null check-left check-range print check-right recurse-right', // 5: prune 3, print 5, go right
        'check-null check-left recurse-left check-null return-null check-range print check-right recurse-right check-null return-null', // 6
        'check-range print check-right recurse-right', // back in 8: print 8, go right
        'check-null check-left recurse-left', // 12: go left
        'check-null check-left recurse-left check-null return-null check-range print check-right recurse-right check-null return-null', // 10
        'check-range print check-right', // back in 12: print 12, prune 14
        'done',
      ].join(' ')
    );
  });
});

describe('Print in Range (BST) — input', () => {
  it('declares the tree, low and high as text fields, low ≤ high as a range, and documents O(h + k)', () => {
    expect(def.inputSpec!.texts!.map(f => [f.label, f.rule])).toEqual([
      ['root', 'level-order-bst'],
      ['low', 'whole-number'],
      ['high', 'whole-number'],
    ]);
    expect(def.inputSpec!.textRange).toEqual({ low: 1, high: 2 });
    expect(def.complexity).toMatchObject({ best: 'O(h + k)', average: 'O(h + k)', worst: 'O(n)', space: 'O(h)' });
    // every Randomize example is valid
    for (const texts of def.inputSpec!.textExamples!) expect(validateAlgorithmInput(def, [], null, null, null, texts), texts.join(' ')).toEqual({ ok: true });
  });

  it('refuses a tree that is not a BST, naming the node and the ancestor it breaks; and repeated values', () => {
    expect(bstViolation(treeFromLevelOrder('[8, 5, 12, 3, 9]'))).toBe('Not a binary search tree: 9 is in the left subtree of 8, so it must be smaller than 8.');
    expect(bstViolation(treeFromLevelOrder('[8, 5, 12, null, null, 7]'))).toBe('Not a binary search tree: 7 is in the right subtree of 8, so it must be larger than 8.');
    expect(bstViolation(treeFromLevelOrder('[5, 5]'))).toBe('Not a binary search tree: 5 is in the left subtree of 5, so it must be smaller than 5 (values cannot repeat).');
    expect(bstViolation(treeFromLevelOrder(EXAMPLE))).toBeNull();
    expect(bstViolation(treeFromLevelOrder('[]'))).toBeNull();
    const draft = validateTextDraft(def, ['[8, 5, 12, 3, 9]', '1', '2']);
    expect(draft).toEqual({ ok: false, field: 0, message: 'Not a binary search tree: 9 is in the left subtree of 8, so it must be smaller than 8.' });
    expect(() => run('[8, 5, 12, 3, 9]', 1, 2)).toThrow(RangeError);
  });

  it('low and high must be whole numbers from -999 to 999, and low ≤ high (reported on high)', () => {
    expect(validateTextDraft(def, [EXAMPLE, 'x', '5'])).toEqual({ ok: false, field: 1, message: '"low" contains "x": only digits and a minus sign are allowed.' });
    expect(validateTextDraft(def, [EXAMPLE, '5-', '5'])).toEqual({ ok: false, field: 1, message: '"low" must be a whole number, e.g. 5 or -3.' });
    expect(validateTextDraft(def, [EXAMPLE, '1.5', '5'])).toMatchObject({ ok: false, field: 1 });
    expect(validateTextDraft(def, [EXAMPLE, '1', '1000'])).toEqual({ ok: false, field: 2, message: '"high" (1000) is out of range: use -999 to 999.' });
    expect(validateTextDraft(def, [EXAMPLE, '', '5'])).toMatchObject({ ok: false, field: 1 });
    expect(validateTextDraft(def, [EXAMPLE, '12', '5'])).toEqual({ ok: false, field: 2, message: '"low" (12) is greater than "high" (5): the range needs low ≤ high.' });
    expect(validateTextDraft(def, [EXAMPLE, ' -3 ', '-3'])).toEqual({ ok: true, texts: [EXAMPLE, ' -3 ', '-3'] });
    expect(validateAlgorithmInput(def, [], null, null, null, [EXAMPLE, '12', '5'])).toMatchObject({ ok: false });
    expect(() => run(EXAMPLE, 12, 5)).toThrow('"low" (12) is greater than "high" (5)');
  });

  it('called without input it runs on its default example', () => {
    expect(printedValues(def.generateSteps([]))).toEqual([5, 6, 8, 10, 12]);
  });
});
