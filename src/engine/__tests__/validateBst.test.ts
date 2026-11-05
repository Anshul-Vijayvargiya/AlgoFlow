import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { levelOrderText, nodeMap, parseLevelOrderTree, treeFromLevelOrder, type BinaryTree } from '../tree/binaryTree';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import type { ExecutionStep, ProgrammingLanguage } from '../../types/algorithm';

const def = getAlgorithmDefinition('tree-validate-bst')!;
const run = (tree: string) => def.generateSteps([], { texts: [tree] });
const last = (steps: ExecutionStep[]) => steps.at(-1)!;
const valueOf = (steps: ExecutionStep[], id: string) => steps[0].tree!.nodes.find(n => n.id === id)!.value;

/** reference 1, no bounds at all: every value of each left subtree below the node, of each right subtree above (O(n²)) */
function isBstBruteForce(tree: BinaryTree): boolean {
  const byId = nodeMap(tree);
  const values = (id: string | null): number[] => (id === null ? [] : [byId.get(id)!.value, ...values(byId.get(id)!.left), ...values(byId.get(id)!.right)]);
  return tree.nodes.every(n => values(n.left).every(v => v < n.value) && values(n.right).every(v => v > n.value));
}

/** reference 2: the first node, in preorder, that is not strictly between the closest ancestors it hangs left / right of */
function firstViolator(tree: BinaryTree): string | null {
  const byId = nodeMap(tree);
  const walk = (id: string | null, ancestors: { value: number; side: 'left' | 'right' }[]): string | null => {
    if (id === null) return null;
    const n = byId.get(id)!;
    // the node must be below every ancestor whose left subtree holds it, and above every one whose right subtree does
    if (ancestors.some(a => (a.side === 'left' ? n.value >= a.value : n.value <= a.value))) return id;
    return walk(n.left, [...ancestors, { value: n.value, side: 'left' }]) ?? walk(n.right, [...ancestors, { value: n.value, side: 'right' }]);
  };
  return walk(tree.root, []);
}

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}

/** a random tree: often a real BST (built by insertion), sometimes with one value changed or repeated, sometimes any tree */
function randomTreeText(rnd: Generator<number>): string {
  const next = () => rnd.next().value as number;
  const size = Math.floor(next() * 12);
  const kind = next();
  if (kind < 0.35) {
    // any binary tree, values from a small range so repeats happen
    const vals = Array.from({ length: size }, () => (next() < 0.2 ? null : Math.floor(next() * 21) - 10));
    if (vals.length) vals[0] ??= 0;
    const text = `[${vals.map(v => (v === null ? 'null' : v)).join(', ')}]`;
    return parseLevelOrderTree(text).ok ? text : '[1]';
  }
  // insert distinct values into a BST, then maybe break it
  const pool = Array.from({ length: 60 }, (_, k) => k - 30);
  const values: number[] = [];
  while (values.length < size) {
    const v = pool.splice(Math.floor(next() * pool.length), 1)[0];
    values.push(v);
  }
  type N = { v: number; l: N | null; r: N | null };
  let root: N | null = null;
  for (const v of values) {
    const node: N = { v, l: null, r: null };
    if (!root) root = node;
    else
      for (let at: N = root; ; ) {
        if (v < at.v) {
          if (!at.l) { at.l = node; break; }
          at = at.l;
        } else {
          if (!at.r) { at.r = node; break; }
          at = at.r;
        }
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
  if (kind > 0.7 && values.length > 1) {
    // change one value: to a repeat of another value, or to anything
    const at = 1 + Math.floor(next() * (out.length - 1));
    if (out[at] !== null) out[at] = next() < 0.5 ? values[Math.floor(next() * values.length)] : Math.floor(next() * 61) - 30;
  }
  const text = `[${out.map(v => (v === null ? 'null' : v)).join(', ')}]`;
  return parseLevelOrderTree(text).ok ? text : '[1]';
}

describe('Validate BST — the answer', () => {
  it.each([
    ['1. a valid balanced BST (the default)', '[10, 5, 15, 2, 7, 12, 20]', true],
    ['2. an invalid BST: a child on the wrong side of its parent', '[5, 1, 4, null, null, 3, 6]', false],
    ['3. invalid only by an ancestor: 6 is fine under 15 but sits in the right subtree of 10', '[10, 5, 15, null, null, 6, 20]', false],
    ['4. a repeated value (the left child equals its parent)', '[10, 5, 15, 5]', false],
    ['4. a repeated value deeper down (10 again, in the left subtree of 10)', '[10, 5, 15, null, 10]', false],
    ['4. a repeated value as a right child', '[2, 1, 2]', false],
    ['5. negative values, valid', '[-5, -10, 0, -12, -7, null, 3]', true],
    ['5. negative values, invalid', '[-5, -10, 0, -12, -4]', false],
    ['6. the empty tree', '[]', true],
    ['7. a single node', '[1]', true],
    ['8. left-skewed, valid', '[5, 4, null, 3, null, 2, null, 1]', true],
    ['8. left-skewed, invalid at the bottom', '[5, 4, null, 3, null, 2, null, 4]', false],
    ['9. right-skewed, valid', '[1, null, 2, null, 3, null, 4, null, 5]', true],
    ['9. right-skewed, invalid at the bottom', '[1, null, 2, null, 3, null, 4, null, 1]', false],
    ['10. the smallest and largest values the input allows', '[-999, null, 999]', true],
    ['10. the extremes on both sides of the root', '[0, -999, 999]', true],
    ['10. the extremes, repeated', '[-999, null, -999]', false],
  ] as const)('%s: %s → %s', (_name, text, valid) => {
    const steps = run(text);
    const v = last(steps).tree!.validate!;
    expect(v.verdict).toBe(valid ? 'valid' : 'invalid');
    expect(isBstBruteForce(treeFromLevelOrder(text)), 'the brute force agrees').toBe(valid);
    expect(last(steps).outcomeText).toMatch(valid ? /^VALID BST: / : /^INVALID BST: /);
    expect(last(steps).tree!.result).toEqual({ kind: 'answer', text: last(steps).outcomeText });
  });

  it('the result explains the violation, naming the ancestor whose bound is broken', () => {
    expect(last(run('[10, 5, 15, null, null, 6, 20]')).outcomeText).toBe('INVALID BST: 6 is in the right subtree of 10, so it must be greater than 10');
    expect(last(run('[5, 1, 4, null, null, 3, 6]')).outcomeText).toBe('INVALID BST: 4 is in the right subtree of 5, so it must be greater than 5');
    expect(last(run('[10, 5, 15, 5]')).outcomeText).toBe('INVALID BST: 5 is in the left subtree of 5, so it must be smaller than 5 (values cannot repeat)');
    expect(last(run('[10, 5, 15, null, 10]')).outcomeText).toBe('INVALID BST: 10 is in the left subtree of 10, so it must be smaller than 10 (values cannot repeat)');
    expect(last(run('[10, 5, 15, 2, 7, 12, 20]')).outcomeText).toBe('VALID BST: all 7 nodes are inside the ranges their ancestors allow');
    expect(last(run('[1]')).outcomeText).toBe('VALID BST: a single node is always a valid binary search tree');
    expect(last(run('[]')).outcomeText).toBe('VALID BST: the empty tree is a valid binary search tree');
  });

  it('an ancestor violation is not a parent-child one: the explanation says the parent alone would allow it', () => {
    const steps = run('[10, 5, 15, null, null, 6, 20]');
    const check = steps.find(s => s.codeRef === 'check-range' && s.result === 'true')!;
    expect(check.explanation).toContain('Its parent 15 alone would allow it (6 is smaller than 15)');
    expect(check.explanation).toContain('a parent-child comparison would miss');
    // a parent-child violation does not say so
    const direct = run('[5, 1, 4, null, null, 3, 6]').find(s => s.codeRef === 'check-range' && s.result === 'true')!;
    expect(direct.explanation).not.toContain('parent-child');
  });

  it('11. the first invalid node: the first one in preorder outside its bounds, and the ancestor that set the bound', () => {
    // 6 (right subtree of 10) and 30 (left subtree of 20) are both invalid; the left subtree is checked first
    const steps = run('[10, 5, 20, 2, 11, 30, 25]');
    const v = last(steps).tree!.validate!;
    expect(valueOf(steps, v.invalid!)).toBe(11);
    expect(valueOf(steps, v.conflict!)).toBe(10);
    // after it, nothing else is checked: 20, 30, 25 stay unchecked
    expect(v.passed.map(id => valueOf(steps, id))).toEqual([10, 5, 2]);
    expect(steps.filter(s => s.codeRef === 'check-range').map(s => valueOf(steps, s.tree!.current!))).toEqual([10, 5, 2, 11]);
    const deep = run('[10, 5, 15, null, null, 6, 20]');
    const d = last(deep).tree!.validate!;
    expect(valueOf(deep, d.invalid!)).toBe(6);
    expect(valueOf(deep, d.conflict!)).toBe(10);
    expect(d.violation).toBe('6 is in the right subtree of 10, so it must be greater than 10');
  });

  it('agrees with a brute force (no bounds) and finds the same first invalid node as a reference, on 600 random trees', () => {
    const rnd = random(20261105);
    let valid = 0;
    let invalid = 0;
    for (let k = 0; k < 600; k++) {
      const text = randomTreeText(rnd);
      const tree = treeFromLevelOrder(text);
      const steps = run(text);
      const v = last(steps).tree!.validate!;
      const expected = isBstBruteForce(tree);
      expect(v.verdict, text).toBe(expected ? 'valid' : 'invalid');
      expect(v.invalid ?? null, text).toBe(firstViolator(tree));
      if (expected) valid++;
      else invalid++;
    }
    // both answers are well represented
    expect(valid).toBeGreaterThan(100);
    expect(invalid).toBeGreaterThan(100);
  });
});

describe('Validate BST — the bounds', () => {
  it('each call gets (min, max) from its ancestors: the root (−∞, +∞), left (min, node.val), right (node.val, max)', () => {
    const steps = run('[10, 5, 15, 2, 7, 12, 20]');
    const seen = new Map<number, string>();
    for (const s of steps.filter(x => x.codeRef === 'check-range')) {
      const f = s.tree!.validate!.calls.at(-1)!;
      seen.set(valueOf(steps, f.node!), `(${f.min ?? '-inf'}, ${f.max ?? '+inf'})`);
    }
    expect(Object.fromEntries(seen)).toEqual({ 10: '(-inf, +inf)', 5: '(-inf, 10)', 2: '(-inf, 5)', 7: '(5, 10)', 15: '(10, +inf)', 12: '(10, 15)', 20: '(15, +inf)' });
    // the nodes that set each bound
    const seven = steps.find(s => s.codeRef === 'check-range' && s.tree!.current && valueOf(steps, s.tree!.current) === 7)!.tree!.validate!.calls.at(-1)!;
    expect(valueOf(steps, seven.minFrom!)).toBe(5);
    expect(valueOf(steps, seven.maxFrom!)).toBe(10);
  });

  it('the messages and variables write the unbounded ends as −∞ and +∞', () => {
    const steps = run('[10, 5, 15]');
    expect(steps[0].message).toBe('isValidBST(root, −∞, +∞), where root = [10, 5, 15]');
    expect(steps[1].variables).toMatchObject({ min: '−∞', max: '+∞' });
    const left = steps.find(s => s.codeRef === 'recurse-left')!;
    expect(left.message).toBe('leftValid = isValidBST(node.left, −∞, 10), where node.left = node 5');
    // the root's call (the first recurse-right is 5's, into its empty right child)
    const right = steps.find(s => s.codeRef === 'recurse-right' && s.tree!.current === 'n2')!;
    expect(right.message).toBe('rightValid = isValidBST(node.right, 10, +∞), where node.right = node 15');
  });

  it('integer limits: the listings use bounds wider than int (no overflow at INT_MIN / INT_MAX)', () => {
    expect(def.code.c).toContain('long long min, long long max');
    expect(def.code.c).toContain('isValidBST(root, LLONG_MIN, LLONG_MAX)');
    expect(def.code.cpp).toContain('long long min, long long max');
    expect(def.code.cpp).toContain('isValidBST(root, LLONG_MIN, LLONG_MAX)');
    expect(def.code.java).toContain('long min, long max');
    expect(def.code.java).toContain('isValidBST(root, Long.MIN_VALUE, Long.MAX_VALUE)');
    expect(def.code.python).toContain('is_valid_bst(root, float("-inf"), float("inf"))');
    // strict comparisons in every listing: equal values are invalid
    for (const lang of ['c', 'cpp', 'java', 'python'] as const) expect(def.code[lang]).toMatch(/val <= min(_val)? (\|\||or) node(->|\.)val >= max(_val)?/);
  });
});

describe('Validate BST — 12. the steps', () => {
  const INPUTS = [
    '[10, 5, 15, 2, 7, 12, 20]',
    '[10, 5, 15, null, null, 6, 20]',
    '[5, 1, 4, null, null, 3, 6]',
    '[10, 5, 15, 5]',
    '[10, 5, 15, null, 10]',
    '[-5, -10, 0, -12, -7, null, 3]',
    '[5, 4, null, 3, null, 2, null, 1]',
    '[1, null, 2, null, 3, null, 4, null, 5]',
    '[-999, null, 999]',
    '[10, 5, 20, 2, 11, 30, 25]',
    '[1]',
    '[]',
  ];

  it.each(INPUTS)('%s: the trace keeps its invariants', text => {
    const steps = run(text);
    const tree = treeFromLevelOrder(text);
    const byId = nodeMap(tree);
    expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
    expect(steps[0]).toMatchObject({ type: 'init', codeRef: 'call-root' });
    expect(last(steps)).toMatchObject({ type: 'complete', codeRef: 'done' });
    // a verdict and a result on the last step only
    expect(steps.slice(0, -1).every(s => s.tree!.validate!.verdict === undefined && s.tree!.result === undefined)).toBe(true);

    let prevPassed: readonly string[] = [];
    let prevCompleted: readonly string[] = [];
    for (const s of steps) {
      const t = s.tree!;
      const v = t.validate!;
      expect(s.state).toEqual([]);
      expect(t.nodes).toBe(steps[0].tree!.nodes);
      // what was checked and what was completed only grows; completed nodes passed their own check first
      expect(v.passed.slice(0, prevPassed.length)).toEqual(prevPassed);
      expect(v.completed.slice(0, prevCompleted.length)).toEqual(prevCompleted);
      expect(v.completed.every(id => v.passed.includes(id))).toBe(true);
      if (v.invalid) expect(v.passed).not.toContain(v.invalid);
      prevPassed = v.passed;
      prevCompleted = v.completed;
      // the node pointer is the running call's node; the bounds are a real range
      const top = v.calls.at(-1);
      expect(t.pointers).toEqual(top ? [{ name: 'node', node: top.node }] : []);
      for (const f of v.calls) if (f.min !== null && f.max !== null) expect(f.min).toBeLessThan(f.max);
      for (const f of v.calls) {
        expect(f.min === null ? null : byId.get(f.minFrom!)!.value).toBe(f.min);
        expect(f.max === null ? null : byId.get(f.maxFrom!)!.value).toBe(f.max);
      }
      // only the running call can have returned
      expect(v.calls.slice(0, -1).every(f => f.returns === undefined)).toBe(true);
      // every step names a line in every language
      for (const lang of ['c', 'cpp', 'java', 'python'] as ProgrammingLanguage[]) expect(resolveCodeRef(def, lang, s.codeRef), `${s.codeRef} ${lang}`).not.toBeNull();
    }

    // each node is checked at most once, and nothing is checked after the first invalid node
    const checks = steps.filter(s => s.codeRef === 'check-range');
    expect(new Set(checks.map(s => s.tree!.current)).size).toBe(checks.length);
    const failed = checks.findIndex(s => s.result === 'true');
    if (failed >= 0) {
      expect(checks.length).toBe(failed + 1);
      const at = steps.indexOf(checks[failed]);
      expect(steps.slice(at + 1).some(s => s.codeRef === 'check-null' || s.codeRef === 'check-range' || (s.codeRef ?? '').startsWith('recurse'))).toBe(false);
      // false is passed back up through every call in progress
      const returns = steps.slice(at + 1, -1);
      expect(returns.every(s => ['return-invalid', 'check-left', 'return-left-false', 'return-right'].includes(s.codeRef ?? ''))).toBe(true);
      expect(returns.filter(s => s.type === 'return').length).toBe(checks[failed].tree!.validate!.calls.length);
    } else {
      // valid: every node checked and completed; one call per node and per empty child (2n + 1 calls)
      expect(checks.length).toBe(tree.nodes.length);
      expect(last(steps).tree!.validate!.completed).toHaveLength(tree.nodes.length);
      expect(steps.filter(s => s.codeRef === 'check-null')).toHaveLength(2 * tree.nodes.length + 1);
    }
    // a check's result is the comparison it shows
    for (const s of checks) {
      const f = s.tree!.validate!.calls.at(-1)!;
      const x = byId.get(f.node!)!.value;
      const outside = (f.min !== null && x <= f.min) || (f.max !== null && x >= f.max);
      expect(s.result).toBe(String(outside));
    }
    // calls are balanced: the last step has none left
    expect(last(steps).tree!.validate!.calls).toEqual([]);
  });

  it('the start and the end: the whole tree, then the verdict with nothing in progress', () => {
    const steps = run('[10, 5, 15, 2, 7, 12, 20]');
    expect(steps[0].tree!.validate).toMatchObject({ passed: [], completed: [], calls: [{ node: 'n0', via: 'root', min: null, max: null }] });
    expect(steps[0].tree!.current).toBe('n0');
    expect(last(steps).tree!.current).toBeUndefined();
    expect(last(steps).tree!.validate!.verdict).toBe('valid');
    expect(levelOrderText(treeFromLevelOrder('[10, 5, 15, 2, 7, 12, 20]'))).toBe('[10, 5, 15, 2, 7, 12, 20]');
  });

  it('the empty tree: one call that returns true at once', () => {
    const steps = run('[]');
    expect(steps.map(s => s.codeRef)).toEqual(['call-root', 'check-null', 'return-null', 'done']);
    expect(steps[2].explanation).toBe('An empty tree is a valid binary search tree.');
  });
});

describe('Validate BST — input and integration', () => {
  it('registered once, in TREES right after Print in Range (BST), drawn as a tree', () => {
    expect(def).toMatchObject({ id: 'tree-validate-bst', name: 'Validate Binary Search Tree', category: 'TREES', visual: 'tree' });
    expect(ALGORITHM_NAV.filter(a => a.id === 'tree-validate-bst')).toEqual([expect.objectContaining({ name: 'Validate Binary Search Tree', category: 'TREES', implemented: true })]);
    const order = ALGORITHM_NAV.map(a => a.id);
    expect(order.indexOf('tree-validate-bst')).toBe(order.indexOf('bst-print-in-range') + 1);
    expect(def.complexity).toMatchObject({ average: 'O(n)', worst: 'O(n)', space: 'O(h)' });
    expect(def.description).toMatch(/skewed tree/);
    expect(def.description).toMatch(/stopping early/);
  });

  it('takes any level-order binary tree (not only a BST): invalid and repeated trees are accepted as input', () => {
    for (const text of ['[10, 5, 15, null, null, 6, 20]', '[10, 5, 15, 5]', '[2, 2, 2]', '[]', '[-999, null, 999]']) {
      expect(validateAlgorithmInput(def, [], null, null, null, [text]).ok, text).toBe(true);
      expect(buildExecution('tree-validate-bst', [], getAlgorithmDefinition, { texts: [text] }).status).toBe('ok');
    }
    for (const text of ['[1, 2', '[null, 1]', '[1000]', '[1.5]']) expect(validateAlgorithmInput(def, [], null, null, null, [text]).ok, text).toBe(false);
    expect(def.inputSpec!.texts![0].defaultValue).toBe('[10, 5, 15, 2, 7, 12, 20]');
    expect(def.inputSpec!.textExamples).toContainEqual(['[10, 5, 15, null, null, 6, 20]']);
  });
});
