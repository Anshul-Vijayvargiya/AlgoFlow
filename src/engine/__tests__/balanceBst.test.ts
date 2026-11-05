import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { bstViolation, levelOrderText, nodeMap, treeFromLevelOrder, type BinaryTree } from '../tree/binaryTree';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import type { ExecutionStep, ProgrammingLanguage, TreeNodeView } from '../../types/algorithm';

const def = getAlgorithmDefinition('bst-balance')!;
const run = (tree: string) => def.generateSteps([], { texts: [tree] });
const last = (steps: ExecutionStep[]) => steps.at(-1)!;
const finalTree = (steps: ExecutionStep[]): BinaryTree => ({ nodes: last(steps).tree!.nodes, root: last(steps).tree!.root });

const inorder = (tree: BinaryTree): number[] => {
  const byId = nodeMap(tree);
  const walk = (id: string | null): number[] => (id === null ? [] : [...walk(byId.get(id)!.left), byId.get(id)!.value, ...walk(byId.get(id)!.right)]);
  return walk(tree.root);
};

/** null when every node's subtree heights differ by at most one; otherwise the first node that breaks it */
function unbalancedAt(tree: BinaryTree): number | null {
  const byId = nodeMap(tree);
  let bad: number | null = null;
  const h = (id: string | null): number => {
    if (id === null) return 0;
    const n = byId.get(id)!;
    const l = h(n.left);
    const r = h(n.right);
    if (Math.abs(l - r) > 1 && bad === null) bad = n.value;
    return 1 + Math.max(l, r);
  };
  h(tree.root);
  return bad;
}
const height = (tree: BinaryTree): number => {
  const byId = nodeMap(tree);
  const h = (id: string | null): number => (id === null ? 0 : 1 + Math.max(h(byId.get(id)!.left), h(byId.get(id)!.right)));
  return h(tree.root);
};

/** reference: the same divide and conquer, written independently, from the sorted values */
function referenceBalanced(sorted: number[]): string {
  const nodes: TreeNodeView[] = [];
  const build = (l: number, r: number): string | null => {
    if (l > r) return null;
    const m = l + Math.floor((r - l) / 2);
    const node = { id: `r${m}`, value: sorted[m], left: build(l, m - 1), right: build(m + 1, r) };
    nodes.push(node);
    return node.id;
  };
  return levelOrderText({ nodes, root: build(0, sorted.length - 1) });
}

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}

/** a random BST built by inserting distinct values (within the input's 15 nodes and 5 levels) */
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

describe('Convert BST to Balanced BST — the balanced tree', () => {
  it.each([
    ['1. a right-skewed BST (the default)', '[1, null, 2, null, 3, null, 4, null, 5]', [1, 2, 3, 4, 5], '[3, 1, 4, null, 2, null, 5]'],
    ['2. a left-skewed BST', '[5, 4, null, 3, null, 2, null, 1]', [1, 2, 3, 4, 5], '[3, 1, 4, null, 2, null, 5]'],
    ['3. an already balanced BST (the same shape comes back)', '[4, 2, 6, 1, 3, 5, 7]', [1, 2, 3, 4, 5, 6, 7], '[4, 2, 6, 1, 3, 5, 7]'],
    ['4. the empty tree', '[]', [], '[]'],
    ['5. a single node', '[7]', [7], '[7]'],
    ['6. two nodes', '[1, null, 2]', [1, 2], '[1, null, 2]'],
    ['6. two nodes, left child', '[2, 1]', [1, 2], '[1, null, 2]'],
    ['7. an even number of nodes (4)', '[1, null, 2, null, 3, null, 4]', [1, 2, 3, 4], '[2, 1, 3, null, null, null, 4]'],
    ['7. an even number of nodes (6)', '[10, 5, null, 2, 7, null, null, 6, 8]', [2, 5, 6, 7, 8, 10], '[6, 2, 8, null, 5, 7, 10]'],
    ['8. an odd number of nodes (3)', '[3, 2, null, 1]', [1, 2, 3], '[2, 1, 3]'],
    ['9. negative values', '[-5, -10, null, -20, null, -30]', [-30, -20, -10, -5], '[-20, -30, -10, null, null, null, -5]'],
    ['10. the smallest and largest values the input allows', '[-999, null, 0, null, 999]', [-999, 0, 999], '[0, -999, 999]'],
  ] as const)('%s: %s → %s', (_name, text, sorted, expected) => {
    const steps = run(text);
    expect(last(steps).tree!.balance!.values).toEqual(sorted);
    expect(levelOrderText(finalTree(steps))).toBe(expected);
    expect(referenceBalanced([...sorted]), 'the reference agrees').toBe(expected);
    expect(bstViolation(finalTree(steps)), '12. a BST').toBeNull();
    expect(unbalancedAt(finalTree(steps)), '13. height-balanced').toBeNull();
    expect(last(steps).tree!.result).toEqual({ kind: 'answer', text: last(steps).outcomeText });
  });

  it('the default: [1..5] as a right-skewed chain becomes 3 at the root, height 3 instead of 5', () => {
    const steps = run('[1, null, 2, null, 3, null, 4, null, 5]');
    expect(last(steps).outcomeText).toBe('Balanced BST: [3, 1, 4, null, 2, null, 5], height 3 (input height 5)');
    expect(last(run('[]')).outcomeText).toBe('Balanced BST: [] (the empty tree)');
    expect(last(run('[7]')).outcomeText).toBe('Balanced BST: [7], height 1 (input height 1)');
  });

  it('11. the inorder order is preserved; 15. no value is lost or repeated', () => {
    for (const text of ['[1, null, 2, null, 3, null, 4, null, 5]', '[10, 5, null, 2, 7, null, null, 6, 8]', '[-5, -10, null, -20, null, -30]']) {
      const input = treeFromLevelOrder(text);
      const out = finalTree(run(text));
      expect(inorder(out)).toEqual(inorder(input));
      expect(out.nodes.map(n => n.value).sort((a, b) => a - b)).toEqual(input.nodes.map(n => n.value).sort((a, b) => a - b));
      expect(new Set(out.nodes.map(n => n.id)).size).toBe(input.nodes.length);
    }
  });

  it('13. the height is the smallest possible, ⌊log₂ n⌋ + 1', () => {
    for (const text of ['[1, null, 2, null, 3, null, 4, null, 5]', '[1, null, 2, null, 3, null, 4]', '[4, 2, 6, 1, 3, 5, 7]', '[1, null, 2]', '[7]']) {
      const n = treeFromLevelOrder(text).nodes.length;
      expect(height(finalTree(run(text))), text).toBe(Math.floor(Math.log2(n)) + 1);
    }
  });

  it('14. the input is not mutated: stage 1 shows the parsed input itself, unchanged; a rerun is identical', () => {
    const text = '[1, null, 2, null, 3, null, 4, null, 5]';
    const params = { texts: [text] };
    const steps = def.generateSteps([], params);
    expect(params).toEqual({ texts: [text] });
    const stage1 = steps.filter(s => s.tree!.balance!.stage === 'inorder');
    expect(stage1.every(s => levelOrderText(s.tree!) === text)).toBe(true);
    expect(stage1[0].tree!.nodes).toEqual(treeFromLevelOrder(text).nodes);
    expect(last(steps).tree!.balance!.original).toBe(text);
    // the new tree is made of new nodes
    expect(last(steps).tree!.nodes.every(n => n.id.startsWith('b'))).toBe(true);
    expect(JSON.stringify(def.generateSteps([], params))).toBe(JSON.stringify(steps));
  });

  it('agrees with the reference, and is a balanced BST, on 300 random BSTs', () => {
    const rnd = random(20261105);
    const sizes = new Set<number>();
    for (let k = 0; k < 300; k++) {
      const text = randomBstText(rnd);
      const input = treeFromLevelOrder(text);
      const out = finalTree(run(text));
      const sorted = inorder(input);
      expect(levelOrderText(out), text).toBe(referenceBalanced(sorted));
      expect(bstViolation(out), text).toBeNull();
      expect(unbalancedAt(out), text).toBeNull();
      expect(inorder(out), text).toEqual(sorted);
      sizes.add(input.nodes.length);
    }
    expect(sizes.has(0) && sizes.has(1) && sizes.has(2) && sizes.size > 8).toBe(true);
  });
});

describe('Convert BST to Balanced BST — 16. the steps', () => {
  const INPUTS = [
    '[1, null, 2, null, 3, null, 4, null, 5]',
    '[5, 4, null, 3, null, 2, null, 1]',
    '[4, 2, 6, 1, 3, 5, 7]',
    '[10, 5, null, 2, 7, null, null, 6, 8]',
    '[-5, -10, null, -20, null, -30]',
    '[1, null, 2]',
    '[7]',
    '[]',
  ];

  it.each(INPUTS)('%s: the trace keeps its invariants', text => {
    const steps = run(text);
    const input = treeFromLevelOrder(text);
    const n = input.nodes.length;
    const sorted = inorder(input);
    expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
    expect(steps[0]).toMatchObject({ type: 'init', codeRef: 'call-inorder' });
    expect(last(steps)).toMatchObject({ type: 'complete', codeRef: 'done' });
    expect(steps.slice(0, -1).every(s => s.tree!.result === undefined)).toBe(true);

    // the stages come in order: inorder, then build, then done (the last step only)
    const stages = steps.map(s => s.tree!.balance!.stage);
    const firstBuild = stages.indexOf('build');
    expect(stages.slice(0, firstBuild).every(x => x === 'inorder')).toBe(true);
    expect(stages.slice(firstBuild, -1).every(x => x === 'build')).toBe(true);
    expect(stages.at(-1)).toBe('done');
    expect(steps[firstBuild].codeRef).toBe('call-build');

    let prevValues: readonly number[] = [];
    let prevCreated: readonly string[] = [];
    let prevCompleted: readonly string[] = [];
    for (const s of steps) {
      const t = s.tree!;
      const b = t.balance!;
      expect(s.state).toEqual([]);
      // the array only grows, and stays sorted: it is a prefix of the inorder values
      expect(b.values.slice(0, prevValues.length)).toEqual(prevValues);
      expect(b.values).toEqual(sorted.slice(0, b.values.length));
      prevValues = b.values;
      if (b.stage === 'inorder') {
        // stage 1 draws the input; visited is the inorder order so far, one per appended value
        expect(t.nodes).toBe(steps[0].tree!.nodes);
        expect(t.visited.map(id => input.nodes.find(x => x.id === id)!.value)).toEqual(b.values);
        expect(b.buildCalls).toEqual([]);
        const top = b.inorderCalls.at(-1);
        expect(t.pointers).toEqual(top ? [{ name: 'node', node: top.node }] : []);
      } else {
        // stages 2 and 3: the whole array; the new nodes created so far, each the value at its index
        expect(b.values).toEqual(sorted);
        expect(b.inorderCalls).toEqual([]);
        expect(t.visited).toEqual([]);
        expect(t.nodes.map(x => x.id)).toEqual(b.created);
        for (const x of t.nodes) expect(x.value).toBe(sorted[Number(x.id.slice(1))]);
        expect(b.created.slice(0, prevCreated.length)).toEqual(prevCreated);
        expect(b.completed.slice(0, prevCompleted.length)).toEqual(prevCompleted);
        expect(b.completed.every(id => b.created.includes(id))).toBe(true);
        prevCreated = b.created;
        prevCompleted = b.completed;
        // a node is linked to a parent only once its subtree is complete
        for (const x of t.nodes) for (const c of [x.left, x.right]) if (c) expect(b.completed).toContain(c);
        // each call's range is inside its caller's, and mid = left + (right - left) / 2
        for (const [k, f] of b.buildCalls.entries()) {
          if (f.mid !== undefined) expect(f.mid).toBe(f.left + Math.floor((f.right - f.left) / 2));
          if (k > 0) {
            const up = b.buildCalls[k - 1];
            expect([f.left, f.right]).toEqual(f.via === 'left' ? [up.left, up.mid! - 1] : [up.mid! + 1, up.right]);
          }
        }
        expect(b.buildCalls.slice(0, -1).every(f => f.returns === undefined)).toBe(true);
        // a new node's level is its call's depth
        for (const [k, f] of b.buildCalls.entries()) if (f.node) expect(b.depths[f.node]).toBe(k);
      }
      for (const lang of ['c', 'cpp', 'java', 'python'] as ProgrammingLanguage[]) expect(resolveCodeRef(def, lang, s.codeRef), `${s.codeRef} ${lang}`).not.toBeNull();
    }

    const refs = steps.map(s => s.codeRef);
    // stage 1: one inorder call per node and per empty child, one append per node
    expect(refs.filter(r => r === 'in-check-null')).toHaveLength(2 * n + 1);
    expect(refs.filter(r => r === 'in-append')).toHaveLength(n);
    // stage 2: one call per node and per empty range, one node created per value
    expect(refs.filter(r => r === 'b-check-range')).toHaveLength(2 * n + 1);
    expect(refs.filter(r => r === 'b-create')).toHaveLength(n);
    expect(refs.filter(r => r === 'b-return-node')).toHaveLength(n);
    expect(last(steps).tree!.balance!.completed).toHaveLength(n);
    expect(last(steps).tree!.balance!.buildCalls).toEqual([]);
    // every recursive call is followed (after its own steps) by the link of what it returned
    expect(refs.filter(r => r === 'b-recurse-left')).toHaveLength(refs.filter(r => r === 'b-link-left').length);
    expect(refs.filter(r => r === 'b-recurse-right')).toHaveLength(refs.filter(r => r === 'b-link-right').length);
  });

  it('the default tree, step by step: the inorder walk goes left first, then the middle of [1..5] is chosen', () => {
    const steps = run('[1, null, 2, null, 3, null, 4, null, 5]');
    expect(steps.slice(0, 6).map(s => s.codeRef)).toEqual(['call-inorder', 'in-check-null', 'in-recurse-left', 'in-check-null', 'in-return-null', 'in-append']);
    expect(steps[5].message).toBe('values.append(1) → [1]');
    const build = steps.findIndex(s => s.codeRef === 'call-build');
    expect(steps[build].message).toBe('Stage 2: buildBalanced(values, 0, 4), where values = [1, 2, 3, 4, 5]');
    expect(steps.slice(build + 1, build + 4).map(s => s.codeRef)).toEqual(['b-check-range', 'b-mid', 'b-create']);
    expect(steps[build + 2].message).toBe('mid = left + (right - left) / 2 = 0 + (4 - 0) / 2 = 2');
    expect(steps[build + 3].message).toBe('node = new TreeNode(values[2]) = new node 3');
    expect(steps[build + 3].tree!.root).toBe('b2');
    // the left half [1, 2] picks index 0 (the lower middle), so 2 becomes 1's right child
    const leftMid = steps.find(s => s.codeRef === 'b-mid' && s.tree!.balance!.buildCalls.at(-1)!.left === 0 && s.tree!.balance!.buildCalls.at(-1)!.right === 1)!;
    expect(leftMid.tree!.balance!.buildCalls.at(-1)!.mid).toBe(0);
    expect(steps.length).toBe(1 + (4 * 5 + 2 * 6) + 1 + (8 * 5 + 2 * 6) + 1);
  });

  it('the empty tree: one inorder call and one empty range', () => {
    expect(run('[]').map(s => s.codeRef)).toEqual(['call-inorder', 'in-check-null', 'in-return-null', 'call-build', 'b-check-range', 'b-return-null', 'done']);
  });
});

describe('Convert BST to Balanced BST — code, input and integration', () => {
  it('registered once, in TREES right after Build a Binary Search Tree (Recursive), drawn as a tree', () => {
    expect(def).toMatchObject({ id: 'bst-balance', name: 'Convert BST to Balanced BST', category: 'TREES', visual: 'tree' });
    expect(ALGORITHM_NAV.filter(a => a.id === 'bst-balance')).toEqual([expect.objectContaining({ name: 'Convert BST to Balanced BST', category: 'TREES', implemented: true })]);
    const order = ALGORITHM_NAV.map(a => a.id);
    expect(order.indexOf('bst-balance')).toBe(order.indexOf('build-bst-recursive') + 1);
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(n)' });
    expect(def.description).toMatch(/O\(h\) recursion for the traversal and O\(log n\) for the balanced build/);
    expect(def.description).toMatch(/the input tree is not changed, and every value appears exactly once/);
  });

  it('every listing: the inorder walk, a safe midpoint, the two recursive halves and a new node per value', () => {
    for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
      const code = def.code[lang]!;
      expect(code, lang).toMatch(/mid = left \+ \(right - left\) \/\/? 2/);
      expect(code, lang).not.toMatch(/\(left \+ right\)/);
      expect(code, lang).toMatch(/left = build_?[Bb]alanced\(values, left, mid - 1/);
      expect(code, lang).toMatch(/right = build_?[Bb]alanced\(values, mid \+ 1, right/);
      expect(code, lang).toMatch(/if \(?left > right\)?/);
      expect(code, lang).toMatch(/inorder\(node(->|\.)left, values/);
      // the highlighted lines are the statements they name
      const lines = code.split('\n');
      expect(lines[def.lineMap[lang]!['b-mid'] - 1], lang).toMatch(/mid = left \+/);
      expect(lines[def.lineMap[lang]!['in-append'] - 1], lang).toMatch(/node(->|\.)val/);
    }
    // C follows the repository's createNode with an allocation-failure flag, and frees the array
    expect(def.code.c).toContain('struct TreeNode* createNode(int value, int* failed)');
    expect(def.code.c).toContain('free(values);');
  });

  it('takes a level-order BST under the repository rule: repeated values and non-BSTs are refused', () => {
    for (const text of ['[1, null, 2, null, 3, null, 4, null, 5]', '[]', '[7]', '[-999, null, 999]']) {
      expect(validateAlgorithmInput(def, [], null, null, null, [text]).ok, text).toBe(true);
      expect(buildExecution('bst-balance', [], getAlgorithmDefinition, { texts: [text] }).status).toBe('ok');
    }
    for (const text of ['[2, 2]', '[1, 2]', '[1, 2', '[null, 1]', '[1000]']) expect(validateAlgorithmInput(def, [], null, null, null, [text]).ok, text).toBe(false);
    expect(def.inputSpec!.texts![0].defaultValue).toBe('[1, null, 2, null, 3, null, 4, null, 5]');
  });
});
