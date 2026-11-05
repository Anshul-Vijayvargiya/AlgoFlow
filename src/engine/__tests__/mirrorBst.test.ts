import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { bstViolation, layoutTree, levelOrderText, nodeMap, treeFromLevelOrder, type BinaryTree } from '../tree/binaryTree';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import type { ExecutionStep, ProgrammingLanguage, TreeNodeView } from '../../types/algorithm';

const def = getAlgorithmDefinition('bst-mirror')!;
const run = (tree: string) => def.generateSteps([], { texts: [tree] });
const last = (steps: ExecutionStep[]) => steps.at(-1)!;
const finalTree = (steps: ExecutionStep[]): BinaryTree => ({ nodes: last(steps).tree!.nodes, root: last(steps).tree!.root });
const valueOf = (steps: ExecutionStep[], id: string) => steps[0].tree!.nodes.find(n => n.id === id)!.value;

/** reference: a new tree, built bottom up, with every node's children exchanged (the input is not touched) */
function mirroredReference(tree: BinaryTree): string {
  const byId = nodeMap(tree);
  const out: TreeNodeView[] = [];
  const copy = (id: string | null): string | null => {
    if (id === null) return null;
    const n = byId.get(id)!;
    const left = copy(n.right);
    const right = copy(n.left);
    out.push({ id: n.id, value: n.value, left, right });
    return n.id;
  };
  return levelOrderText({ nodes: out, root: copy(tree.root) });
}

const inorder = (tree: BinaryTree): number[] => {
  const byId = nodeMap(tree);
  const walk = (id: string | null): number[] => (id === null ? [] : [...walk(byId.get(id)!.left), byId.get(id)!.value, ...walk(byId.get(id)!.right)]);
  return walk(tree.root);
};

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}

/** a random BST built by inserting distinct values, in level order (within the input's 15 nodes and 5 levels) */
function randomBstText(rnd: Generator<number>): string {
  const next = () => rnd.next().value as number;
  for (;;) {
    const size = Math.floor(next() * 14);
    const pool = Array.from({ length: 80 }, (_, k) => k - 40);
    type N = { v: number; l: N | null; r: N | null };
    let root: N | null = null;
    for (let k = 0; k < size; k++) {
      const v = pool.splice(Math.floor(next() * pool.length), 1)[0];
      const node: N = { v, l: null, r: null };
      if (!root) root = node;
      else
        for (let at: N = root; ; ) {
          const side = v < at.v ? 'l' : 'r';
          if (!at[side]) {
            at[side] = node;
            break;
          }
          at = at[side]!;
        }
    }
    const out: (number | null)[] = [];
    const queue: (N | null)[] = root ? [root] : [];
    while (queue.length) {
      const n = queue.shift()!;
      out.push(n ? n.v : null);
      if (n) queue.push(n.l, n.r);
    }
    while (out.at(-1) === null) out.pop();
    const text = `[${out.map(v => (v === null ? 'null' : v)).join(', ')}]`;
    if (validateAlgorithmInput(def, [], null, null, null, [text]).ok) return text;
  }
}

describe('Mirror a BST — the mirrored tree', () => {
  it.each([
    ['1. the standard seven-node BST (the default)', '[8, 5, 12, 3, 6, 10, 14]', '[8, 12, 5, 14, 10, 6, 3]'],
    ['2. the empty tree', '[]', '[]'],
    ['3. a single node', '[7]', '[7]'],
    ['4. left-skewed (only left children)', '[5, 4, null, 3, null, 2, null, 1]', '[5, null, 4, null, 3, null, 2, null, 1]'],
    ['5. right-skewed (only right children)', '[1, null, 2, null, 3, null, 4, null, 5]', '[1, 2, null, 3, null, 4, null, 5]'],
    ['6. missing children', '[10, 5, 15, null, 7, 12]', '[10, 15, 5, null, 12, 7]'],
    ['6. missing children, deeper', '[20, 10, 30, 5, 15, null, 35, null, 7]', '[20, 30, 10, 35, null, 15, 5, null, null, null, null, 7]'],
    ['7. negative values', '[-5, -10, 0, -12, -7, null, 3]', '[-5, 0, -10, 3, null, -7, -12]'],
    ['two levels', '[2, 1, 3]', '[2, 3, 1]'],
  ] as const)('%s: %s → %s', (_name, text, expected) => {
    const steps = run(text);
    expect(levelOrderText(finalTree(steps))).toBe(expected);
    expect(mirroredReference(treeFromLevelOrder(text)), 'the reference agrees').toBe(expected);
    expect(last(steps).tree!.mirror!.shape).toBe(expected);
    expect(last(steps).outcomeText).toMatch(new RegExp(`^Mirrored tree: ${expected.replace(/[[\]]/g, '\\$&')}`));
    expect(last(steps).tree!.result).toEqual({ kind: 'answer', text: last(steps).outcomeText });
  });

  it('the result text: not a valid BST for two or more nodes; one node and the empty tree are their own mirror', () => {
    expect(last(run('[8, 5, 12, 3, 6, 10, 14]')).outcomeText).toBe('Mirrored tree: [8, 12, 5, 14, 10, 6, 3] (values now decrease from left to right: not a valid BST)');
    expect(last(run('[7]')).outcomeText).toBe('Mirrored tree: [7] (a single node is its own mirror)');
    expect(last(run('[]')).outcomeText).toBe('Mirrored tree: [] (the empty tree is its own mirror)');
    expect(last(run('[8, 5, 12, 3, 6, 10, 14]')).explanation).toContain('not a valid binary search tree under the usual rule');
    expect(last(run('[7]')).explanation).toContain('still a valid BST');
  });

  it('8. every node has its children swapped: new left = old right, new right = old left', () => {
    for (const text of ['[8, 5, 12, 3, 6, 10, 14]', '[20, 10, 30, 5, 15, null, 35, null, 7]', '[5, 4, null, 3, null, 2, null, 1]']) {
      const before = nodeMap(treeFromLevelOrder(text));
      const after = nodeMap(finalTree(run(text)));
      for (const [id, n] of before) expect(after.get(id), `${text} ${n.value}`).toMatchObject({ left: n.right, right: n.left });
      // every node is swapped exactly once
      expect([...last(run(text)).tree!.mirror!.swapped].sort()).toEqual([...before.keys()].sort());
    }
  });

  it('9. node values are preserved: the same ids hold the same values, the root is the same node', () => {
    const text = '[8, 5, 12, 3, 6, 10, 14]';
    const steps = run(text);
    const input = treeFromLevelOrder(text);
    for (const s of steps) {
      expect(s.tree!.root).toBe(input.root);
      expect(Object.fromEntries(s.tree!.nodes.map(n => [n.id, n.value]))).toEqual(Object.fromEntries(input.nodes.map(n => [n.id, n.value])));
    }
    expect([...inorder(finalTree(steps))].sort((a, b) => a - b)).toEqual([...inorder(input)].sort((a, b) => a - b));
  });

  it('10. the input is not mutated: the first step is the parsed input, earlier steps keep their links, a rerun is identical', () => {
    const text = '[8, 5, 12, 3, 6, 10, 14]';
    const params = { texts: [text] };
    const steps = def.generateSteps([], params);
    expect(params).toEqual({ texts: [text] });
    expect(steps[0].tree!.nodes).toEqual(treeFromLevelOrder(text).nodes);
    expect(levelOrderText({ nodes: steps[0].tree!.nodes, root: steps[0].tree!.root })).toBe(text);
    // snapshots are frozen: later swaps cannot reach back into earlier steps
    expect(Object.isFrozen(steps[0].tree!.nodes)).toBe(true);
    expect(steps[0].tree!.nodes.every(n => Object.isFrozen(n))).toBe(true);
    expect(JSON.stringify(def.generateSteps([], params))).toBe(JSON.stringify(steps));
    expect(def.inputSpec!.texts![0].defaultValue).toBe('[8, 5, 12, 3, 6, 10, 14]');
  });

  it('12. structurally correct: mirroring twice gives the input back; the mirror reads its values in decreasing order', () => {
    for (const text of ['[8, 5, 12, 3, 6, 10, 14]', '[20, 10, 30, 5, 15, null, 35, null, 7]', '[-5, -10, 0, -12, -7, null, 3]']) {
      const once = finalTree(run(text));
      const values = inorder(once);
      expect(values).toEqual([...values].sort((a, b) => b - a));
      // the mirror is not a BST under the usual rule; mirrored back (by the reference), it is the input again
      expect(bstViolation(once)).not.toBeNull();
      expect(mirroredReference(once)).toBe(text);
    }
  });

  it('agrees with a reference on 300 random BSTs (one node and the empty tree included)', () => {
    const rnd = random(20261105);
    const sizes = new Set<number>();
    for (let k = 0; k < 300; k++) {
      const text = randomBstText(rnd);
      const tree = treeFromLevelOrder(text);
      const steps = run(text);
      expect(levelOrderText(finalTree(steps)), text).toBe(mirroredReference(tree));
      expect(steps.filter(s => s.codeRef === 'set-right'), text).toHaveLength(tree.nodes.length);
      sizes.add(tree.nodes.length);
    }
    expect(sizes.has(0) && sizes.has(1) && sizes.size > 8).toBe(true);
  });
});

describe('Mirror a BST — 11. the steps', () => {
  const INPUTS = [
    '[8, 5, 12, 3, 6, 10, 14]',
    '[20, 10, 30, 5, 15, null, 35, null, 7]',
    '[10, 5, 15, null, 7, 12]',
    '[-5, -10, 0, -12, -7, null, 3]',
    '[5, 4, null, 3, null, 2, null, 1]',
    '[1, null, 2, null, 3, null, 4, null, 5]',
    '[2, 1, 3]',
    '[7]',
    '[]',
  ];

  it.each(INPUTS)('%s: the trace keeps its invariants', text => {
    const steps = run(text);
    const input = treeFromLevelOrder(text);
    const original = nodeMap(input);
    const n = input.nodes.length;
    expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
    expect(steps[0]).toMatchObject({ type: 'init', codeRef: 'call-root' });
    expect(last(steps)).toMatchObject({ type: 'complete', codeRef: 'done' });
    expect(steps.slice(0, -1).every(s => s.tree!.result === undefined)).toBe(true);

    let prevSwapped: readonly string[] = [];
    let prevCompleted: readonly string[] = [];
    for (const [k, s] of steps.entries()) {
      const t = s.tree!;
      const m = t.mirror!;
      expect(s.state).toEqual([]);
      // the drawn links always form one tree with every node in it (the layout places each node once)
      const children = t.nodes.flatMap(x => [x.left, x.right].filter(c => c !== null));
      expect(new Set(children).size).toBe(children.length);
      expect(Object.keys(layoutTree(t))).toHaveLength(n);
      expect(m.shape).toBe(levelOrderText(t));
      expect(m.original).toBe(levelOrderText(input));
      // the drawn links change only when a swap is completed (node.right = temp)
      if (k > 0 && t.nodes !== steps[k - 1].tree!.nodes) expect(s.codeRef).toBe('set-right');
      // swapped and completed only grow; a node is completed only after it was swapped
      expect(m.swapped.slice(0, prevSwapped.length)).toEqual(prevSwapped);
      expect(m.completed.slice(0, prevCompleted.length)).toEqual(prevCompleted);
      expect(m.completed.every(id => m.swapped.includes(id))).toBe(true);
      prevSwapped = m.swapped;
      prevCompleted = m.completed;
      // a swapped node's drawn links are the swapped ones; one not swapped yet keeps the original ones
      for (const x of t.nodes) {
        const o = original.get(x.id)!;
        expect({ left: x.left, right: x.right }).toEqual(m.swapped.includes(x.id) ? { left: o.right, right: o.left } : { left: o.left, right: o.right });
      }
      // the pointers: node is the running call's node, temp only during a swap
      const top = m.calls.at(-1);
      expect(t.pointers).toEqual([...(top ? [{ name: 'node', node: top.node }] : []), ...(m.swap ? [{ name: 'temp', node: m.swap.temp }] : [])]);
      expect(m.calls.slice(0, -1).every(f => f.returned === undefined)).toBe(true);
      // the swap: its links as each of the three statements leaves them
      const sw = m.swap;
      expect(Boolean(sw)).toBe(['save-temp', 'set-left', 'set-right'].includes(s.codeRef ?? ''));
      if (sw) {
        const o = original.get(sw.node)!;
        expect(t.current).toBe(sw.node);
        expect(top!.node).toBe(sw.node);
        expect(sw).toMatchObject({ originalLeft: o.left, originalRight: o.right, temp: o.left });
        const expected = { 'save-temp': ['temp', o.left, o.right], 'set-left': ['left', o.right, o.right], 'set-right': ['right', o.right, o.left] }[s.codeRef as 'save-temp' | 'set-left' | 'set-right'];
        expect([sw.phase, sw.left, sw.right]).toEqual(expected);
      }
      for (const lang of ['c', 'cpp', 'java', 'python'] as ProgrammingLanguage[]) expect(resolveCodeRef(def, lang, s.codeRef), `${s.codeRef} ${lang}`).not.toBeNull();
    }

    // the three swap statements run in order, one after another, once per node
    const refs = steps.map(s => s.codeRef);
    for (const [k, r] of refs.entries()) if (r === 'save-temp') expect(refs.slice(k, k + 3)).toEqual(['save-temp', 'set-left', 'set-right']);
    expect(refs.filter(r => r === 'save-temp')).toHaveLength(n);
    // one call per node and per empty child (2n + 1 calls), each returns once
    expect(refs.filter(r => r === 'check-null')).toHaveLength(2 * n + 1);
    expect(refs.filter(r => r === 'return-null')).toHaveLength(n + 1);
    expect(refs.filter(r => r === 'return-node')).toHaveLength(n);
    expect(last(steps).tree!.mirror!.completed).toHaveLength(n);
    expect(last(steps).tree!.mirror!.calls).toEqual([]);
    // the swap order is the preorder of the mirrored tree: a node is swapped before its subtrees are mirrored
    const mirrored = finalTree(steps);
    const byId = nodeMap(mirrored);
    const pre = (id: string | null): string[] => (id === null ? [] : [id, ...pre(byId.get(id)!.left), ...pre(byId.get(id)!.right)]);
    expect(last(steps).tree!.mirror!.swapped).toEqual(pre(mirrored.root));
    // and a node's call returns after both of its children's calls (postorder)
    const post = (id: string | null): string[] => (id === null ? [] : [...post(byId.get(id)!.left), ...post(byId.get(id)!.right), id]);
    expect(last(steps).tree!.mirror!.completed).toEqual(post(mirrored.root));
  });

  it('the default tree: the order of operations at the root, step by step', () => {
    const steps = run('[8, 5, 12, 3, 6, 10, 14]');
    expect(steps.slice(0, 8).map(s => s.codeRef)).toEqual(['call-root', 'check-null', 'save-temp', 'set-left', 'set-right', 'recurse-left', 'check-null', 'save-temp']);
    expect(steps[2].message).toBe('temp = node.left = node 5');
    expect(steps[3].message).toBe('node.left = node.right = node 12');
    expect(steps[3].explanation).toBe("8's left link now points to 12. For a moment both links point to 12, and the original left subtree (node 5) is reachable only through temp.");
    expect(steps[4].message).toBe('node.right = temp = node 5');
    expect(steps[4].tree!.mirror!.shape).toBe('[8, 12, 5, 10, 14, 3, 6]');
    // recursion continues into the new left child, which was the right one
    expect(steps[5].message).toBe('mirror(node.left), where node.left = node 12');
    expect(valueOf(steps, steps[5].tree!.current!)).toBe(12);
    expect(steps.length).toBe(1 + 7 * 7 + 2 * 8 + 1);
  });

  it('a leaf: temp = null and the three statements still run', () => {
    const steps = run('[7]');
    expect(steps.map(s => s.codeRef)).toEqual(['call-root', 'check-null', 'save-temp', 'set-left', 'set-right', 'recurse-left', 'check-null', 'return-null', 'recurse-right', 'check-null', 'return-null', 'return-node', 'done']);
    expect(steps[2].tree!.mirror!.swap).toMatchObject({ temp: null, left: null, right: null });
    expect(steps[2].tree!.pointers).toEqual([{ name: 'node', node: 'n0' }, { name: 'temp', node: null }]);
  });

  it('the empty tree: one call that returns null at once', () => {
    const steps = run('[]');
    expect(steps.map(s => s.codeRef)).toEqual(['call-root', 'check-null', 'return-null', 'done']);
    expect(steps[2].explanation).toBe('The mirror of the empty tree is the empty tree.');
  });
});

describe('Mirror a BST — code, input and integration', () => {
  it('registered once, in TREES right after Validate Binary Search Tree, drawn as a tree', () => {
    expect(def).toMatchObject({ id: 'bst-mirror', name: 'Mirror a BST', category: 'TREES', visual: 'tree' });
    expect(ALGORITHM_NAV.filter(a => a.id === 'bst-mirror')).toEqual([expect.objectContaining({ name: 'Mirror a BST', category: 'TREES', implemented: true })]);
    const order = ALGORITHM_NAV.map(a => a.id);
    expect(order.indexOf('bst-mirror')).toBe(order.indexOf('tree-validate-bst') + 1);
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(h)' });
    expect(def.description).toMatch(/O\(log n\) for a balanced tree and O\(n\) for a skewed one/);
    expect(def.description).toMatch(/No node is created or copied: only the child references change/);
    expect(def.description).toMatch(/not a valid BST/);
  });

  it('every listing: null check, temp = left, left = right, right = temp, both recursive calls, return node', () => {
    const arrow = { c: '->', cpp: '->', java: '.', python: '.' } as const;
    for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
      const a = arrow[lang];
      const lines = def.code[lang]!.split('\n').map(l => l.trim().replace(/;$/, ''));
      const at = (re: RegExp) => lines.findIndex(l => re.test(l));
      const order = [/^if \(?node (==|is)/, new RegExp(`temp = node${a === '->' ? '->' : '\\.'}left$`), /left = node(->|\.)right$/, /right = temp$/, /^mirror\(node(->|\.)left\)$/, /^mirror\(node(->|\.)right\)$/, /^return node$/].map(at);
      expect(order.every(k => k >= 0), lang).toBe(true);
      expect([...order].sort((x, y) => x - y), lang).toEqual(order);
      // the highlighted lines are the statements they name
      expect(lines[def.lineMap[lang]!['save-temp'] - 1]).toMatch(/temp = node(->|\.)left$/);
      expect(lines[def.lineMap[lang]!['set-right'] - 1]).toMatch(/right = temp$/);
    }
  });

  it('takes a level-order BST; a tree that is not a BST, or malformed input, is refused', () => {
    for (const text of ['[8, 5, 12, 3, 6, 10, 14]', '[]', '[7]', '[-999, null, 999]']) {
      expect(validateAlgorithmInput(def, [], null, null, null, [text]).ok, text).toBe(true);
      expect(buildExecution('bst-mirror', [], getAlgorithmDefinition, { texts: [text] }).status).toBe('ok');
    }
    for (const text of ['[8, 12, 5]', '[5, 5]', '[1, 2', '[null, 1]', '[1000]', '[1.5]']) expect(validateAlgorithmInput(def, [], null, null, null, [text]).ok, text).toBe(false);
  });
});
