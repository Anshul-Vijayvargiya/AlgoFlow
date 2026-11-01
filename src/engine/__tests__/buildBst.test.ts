import { describe, it, expect } from 'vitest';
import { buildBstDefinition as bst } from '../algorithms/tree/buildBst';
import { buildExecution } from '../buildExecution';
import { getAlgorithmDefinition, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { takesTexts, validateAlgorithmInput } from '../inputParsing';
import { levelOrderText, nodeMap, treeLevels } from '../tree/binaryTree';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// Build a BST: insert the values in order; smaller goes left, larger right; a value already in the tree is skipped.
const run = (values: number[]) => bst.generateSteps([...values]);
const finalTree = (steps: ExecutionStep[]) => steps.at(-1)!.tree!;
const shape = (steps: ExecutionStep[]) => levelOrderText(finalTree(steps));
const refs = (steps: ExecutionStep[]) => steps.map(s => `${s.codeRef}${s.result ? `:${s.result}` : ''}`);

/** an oracle written differently from the generator: recursive insertion into nested nodes, then level order */
type O = { v: number; l: O | null; r: O | null };
const insert = (t: O | null, v: number): O => (t === null ? { v, l: null, r: null } : v < t.v ? { ...t, l: insert(t.l, v) } : v > t.v ? { ...t, r: insert(t.r, v) } : t);
function oracleShape(values: number[]): string {
  let t: O | null = null;
  for (const v of values) t = insert(t, v);
  if (!t) return '[]';
  const out: (number | null)[] = [];
  const queue: (O | null)[] = [t];
  while (queue.length) {
    const x = queue.shift()!;
    out.push(x ? x.v : null);
    if (x) queue.push(x.l, x.r);
  }
  while (out.at(-1) === null) out.pop();
  return `[${out.map(v => (v === null ? 'null' : v)).join(', ')}]`;
}

describe('Build a BST — the tree built', () => {
  it.each([
    ['the example (balanced)', [50, 30, 70, 20, 40, 60, 80], '[50, 30, 70, 20, 40, 60, 80]'],
    ['empty', [], '[]'],
    ['one value', [5], '[5]'],
    ['ascending: a right-leaning chain', [1, 2, 3, 4], '[1, null, 2, null, 3, null, 4]'],
    ['descending: a left-leaning chain', [4, 3, 2, 1], '[4, 3, null, 2, null, 1]'],
    ['negative values', [0, -5, 5, -10, -1], '[0, -5, 5, -10, -1]'],
    ['duplicates are skipped', [5, 3, 5, 3, 7, 7], '[5, 3, 7]'],
    ['all equal: one node', [2, 2, 2], '[2]'],
    ['zig-zag', [10, 2, 8, 4, 6], '[10, 2, null, null, 8, 4, null, null, 6]'],
  ])('%s', (_name, values, expected) => {
    expect(shape(run(values as number[]))).toBe(expected);
  });

  it('on 500 random inputs: the same tree as a recursive insertion, a valid BST of the distinct values, ids by first position, input untouched', () => {
    const rng = makeRng(23);
    for (let t = 0; t < 500; t++) {
      const values = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * [7, 40, 1999][t % 3]) - [3, 20, 999][t % 3]);
      const before = [...values];
      const steps = run(values);
      const tree = finalTree(steps);
      const where = JSON.stringify(values);
      expect(levelOrderText(tree), where).toBe(oracleShape(values));
      // inorder is strictly increasing: the distinct values, sorted
      const byId = nodeMap(tree);
      const inorder: number[] = [];
      const walk = (id: string | null) => {
        if (!id) return;
        walk(byId.get(id)!.left);
        inorder.push(byId.get(id)!.value);
        walk(byId.get(id)!.right);
      };
      walk(tree.root);
      expect(inorder, where).toEqual([...new Set(values)].sort((a, b) => a - b));
      // each node is named after the first position of its value; the root is the first value
      for (const node of tree.nodes) expect(node.id, where).toBe(`n${values.indexOf(node.value)}`);
      if (values.length) expect(tree.root).toBe('n0');
      expect(values).toEqual(before);
      expect(tree.build!.skipped, where).toEqual(values.flatMap((v, k) => (values.indexOf(v) < k ? [k] : [])));
    }
  });

  it('refuses values that are not whole numbers, as the array algorithms do', () => {
    expect(() => run([1.5, 2])).toThrow(TypeError);
  });
});

describe('Build a BST — steps', () => {
  it('[5, 3, 5]: 5 becomes the root, 3 goes left, the second 5 stops at the root and is skipped', () => {
    expect(refs(run([5, 3, 5]))).toEqual([
      'init-root',
      'next-value:true', 'init-search', 'search-loop:false', 'check-dup:false', 'check-root:true', 'insert-root',
      'next-value:true', 'init-search', 'search-loop:true', 'set-parent', 'compare:true', 'go-left', 'search-loop:false', 'check-dup:false', 'check-root:false', 'check-side:true', 'insert-left',
      'next-value:true', 'init-search', 'search-loop:false', 'check-dup:true', 'skip-dup',
      'next-value:false',
      'return',
    ]);
  });

  it('an empty input completes normally with an empty tree', () => {
    const steps = run([]);
    expect(refs(steps)).toEqual(['init-root', 'next-value:false', 'return']);
    for (const s of steps) expect(s.tree).toMatchObject({ nodes: [], root: null });
    expect(steps.at(-1)!.outcomeText).toBe('Empty tree: no values to insert');
  });

  it('every snapshot is accurate: the tree so far, the search path down from the root, pointers, slot and insertion', () => {
    const rng = makeRng(5);
    for (let t = 0; t < 150; t++) {
      const values = Array.from({ length: Math.floor(rng() * 13) }, () => Math.floor(rng() * 15) - 7);
      const problems: string[] = [];
      const check = (ok: boolean, what: string) => {
        if (!ok && problems.length < 10) problems.push(`${JSON.stringify(values)} ${what}`);
      };
      let inserted = 0;
      for (const s of run(values)) {
        const v = s.tree!;
        const b = v.build!;
        const at = `step ${s.id} (${s.codeRef})`;
        const byId = nodeMap(v);
        const ptr = (name: string) => v.pointers?.find(p => p.name === name)?.node;
        if (s.codeRef === 'insert-root' || s.codeRef === 'insert-left' || s.codeRef === 'insert-right') inserted++;
        check(v.nodes.length === inserted, `${at}: ${v.nodes.length} nodes, ${inserted} inserted`);
        check(s.state.length === 0, `${at}: state`);
        // the path starts at the root and each node is a child of the one before
        check(b.path.length === 0 || b.path[0] === v.root, `${at}: path starts at the root`);
        b.path.forEach((id, k) => k > 0 && check([byId.get(b.path[k - 1])!.left, byId.get(b.path[k - 1])!.right].includes(id), `${at}: path`));
        if (s.codeRef === 'compare') {
          check(v.current === ptr('curr') && v.current === b.path.at(-1), `${at}: the compared node is curr`);
          check(s.result === String(values[b.index!] < byId.get(v.current!)!.value), `${at}: compare result`);
        }
        if (s.codeRef === 'insert-left' || s.codeRef === 'insert-right') {
          const parent = byId.get(ptr('parent')!)!;
          check(parent[s.codeRef === 'insert-left' ? 'left' : 'right'] === b.inserted, `${at}: linked under parent`);
          check(byId.get(b.inserted!)!.value === values[b.index!], `${at}: the inserted value`);
        }
        if (b.slot) {
          check(ptr('curr') === null && b.index !== null, `${at}: a slot only once curr is null`);
          if (b.slot.parent !== null) check(byId.get(b.slot.parent)![b.slot.side as 'left' | 'right'] === null, `${at}: the slot is an empty child`);
        }
        if (b.duplicate) check(byId.get(b.duplicate)!.value === values[b.index!], `${at}: duplicate value`);
      }
      expect(problems).toEqual([]);
    }
  });

  it('snapshots never change afterwards: nodes are frozen, and a nodes array is shared until the next insertion', () => {
    const steps = run([50, 30, 70, 20, 40, 60, 80, 30]);
    const copy = JSON.parse(JSON.stringify(steps));
    for (const s of steps) {
      expect(Object.isFrozen(s.tree!.nodes)).toBe(true);
      for (const n of s.tree!.nodes) expect(Object.isFrozen(n)).toBe(true);
    }
    // one nodes array for the empty tree and one per insertion (the duplicate 30 makes none)
    expect(new Set(steps.map(s => s.tree!.nodes)).size).toBe(8);
    // a node that did not change is the same object in every later array
    const leaf20 = steps.find(s => s.codeRef === 'insert-left' && s.tree!.build!.index === 3)!.tree!.nodes.find(n => n.value === 20)!;
    expect(steps.at(-1)!.tree!.nodes.find(n => n.value === 20)).toBe(leaf20);
    // running the same input again gives an identical trace, and the first trace is untouched by it
    expect(run([50, 30, 70, 20, 40, 60, 80, 30])).toEqual(steps);
    expect(JSON.parse(JSON.stringify(steps))).toEqual(copy);
  });

  it('the tree grows one node per insertion, and earlier steps keep the smaller tree', () => {
    const steps = run([50, 30, 70]);
    const sizes = steps.map(s => s.tree!.nodes.length);
    expect(sizes.indexOf(1)).toBe(steps.findIndex(s => s.codeRef === 'insert-root'));
    expect(steps.find(s => s.codeRef === 'insert-left')!.tree!.nodes.map(n => n.value)).toEqual([50, 30]);
    expect(steps[0].tree!.nodes).toEqual([]);
  });

  it('ends with the tree, its inorder and the duplicates skipped', () => {
    const steps = run([5, 3, 5, 8]);
    expect(steps.at(-1)).toMatchObject({ type: 'complete', codeRef: 'return', outcomeText: 'BST of 3 nodes; inorder: [3, 5, 8]; 1 duplicate skipped' });
    expect(steps.at(-1)!.tree!.result).toEqual({ kind: 'answer', text: 'BST of 3 nodes; inorder: [3, 5, 8]; 1 duplicate skipped' });
  });

  it('a skewed input of 16 values is 16 levels deep (the drawing compacts its rows for it)', () => {
    expect(treeLevels(finalTree(run(Array.from({ length: 16 }, (_, k) => k))))).toBe(16);
  });
});

describe('Build a BST — code listings', () => {
  const line = (lang: (typeof LANGUAGES)[number], ref: string) => codeLines(bst, lang)[bst.lineMap[lang][ref] - 1].trim();

  it('every codeRef the trace uses is mapped in all four languages, to the right statement', () => {
    const used = new Set([...run([5, 3, 5, 8, 4]), ...run([])].map(s => s.codeRef!));
    expect(used).toEqual(new Set(Object.keys(bst.lineMap.cpp)));
    for (const lang of LANGUAGES) {
      for (const ref of used) expect(resolveCodeRef(bst, lang, ref), `${lang} ${ref}`).not.toBeNull();
      expect(line(lang, 'search-loop'), lang).toMatch(/while \(?curr.*val != value/);
      expect(line(lang, 'compare'), lang).toMatch(/value < curr(->|\.)val/);
      expect(line(lang, 'go-left')).toBe(line(lang, 'compare'));
      expect(line(lang, 'insert-left'), lang).toMatch(/parent(->|\.)left = /);
      expect(line(lang, 'insert-right'), lang).toMatch(/parent(->|\.)right = /);
      expect(line(lang, 'return'), lang).toMatch(/return root/);
    }
    // C reads the next value in two statements: the loop header and values[i]
    expect(codeLines(bst, 'c')[bst.lineMap.c['next-value']].trim()).toBe('int value = values[i];');
    expect(bst.lineSpans).toEqual({ c: { 'next-value': 2 } });
  });

  it('every listing skips a duplicate the same way: the search stops at an equal value, then continue', () => {
    for (const lang of LANGUAGES) {
      expect(line(lang, 'search-loop')).toContain('!= value');
      expect(codeLines(bst, lang).slice(bst.lineMap[lang]['check-dup'] - 1, bst.lineMap[lang]['skip-dup']).join(' ')).toMatch(/continue/);
    }
  });
});

describe('Build a BST — input and integration', () => {
  it('an array of up to 16 whole numbers, as the array algorithms take it; empty included', () => {
    expect(takesTexts(bst)).toBe(false);
    expect(validateAlgorithmInput(bst, [50, 30, 70], null).ok).toBe(true);
    expect(validateAlgorithmInput(bst, [], null).ok).toBe(true);
    expect(validateAlgorithmInput(bst, [-999, 999], null).ok).toBe(true);
    expect(validateAlgorithmInput(bst, Array(17).fill(0), null).ok).toBe(false);
  });

  it('registered once, listed in TREES after the traversals, drawn as a tree, with honest unbalanced-BST bounds', () => {
    expect(getAlgorithmDefinition('build-bst')).toBe(bst);
    expect(visualKindOf(bst)).toBe('tree');
    expect(ALGORITHM_NAV.filter(a => a.id === 'build-bst')).toEqual([
      expect.objectContaining({ name: 'Build a Binary Search Tree', category: 'TREES', implemented: true }),
    ]);
    const order = ALGORITHM_NAV.map(a => a.id);
    expect(order.indexOf('build-bst')).toBe(order.indexOf('tree-level-order') + 1);
    expect(bst.complexity).toMatchObject({ average: 'O(n log n)', worst: 'O(n²)', space: 'O(n)' });
    expect(bst.description).toMatch(/AVL and Red-Black/);
    expect(bst.defaultInput).toEqual([50, 30, 70, 20, 40, 60, 80]);
    expect(buildExecution('build-bst', [50, 30, 70, 20, 40, 60, 80]).status).toBe('ok');
  });
});
