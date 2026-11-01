import { describe, it, expect } from 'vitest';
import { buildBstRecursiveDefinition as rec } from '../algorithms/tree/buildBstRecursive';
import { buildBstDefinition as iter } from '../algorithms/tree/buildBst';
import { buildExecution } from '../buildExecution';
import { getAlgorithmDefinition, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { takesTexts, validateAlgorithmInput } from '../inputParsing';
import { levelOrderText, nodeMap, treeLevels } from '../tree/binaryTree';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep, TreeCallFrame } from '../../types/algorithm';

// Build a BST, recursively: root = insert(root, value) for each value; insert returns a new node for an empty subtree,
// recurses left / right otherwise, re-links that child, and returns its node; an equal value is skipped.
const run = (values: number[]) => rec.generateSteps([...values]);
const shape = (steps: ExecutionStep[]) => levelOrderText(steps.at(-1)!.tree!);
const frames = (s: ExecutionStep) => s.tree!.build!.calls!;
/** a stack in words: via:node, with the node a call returns after an arrow */
const stackText = (s: ExecutionStep) => frames(s).map(f => `${f.via}:${f.node ?? 'null'}${f.returns ? `>${f.returns}` : ''}`).join(' ');

describe('Build a BST (Recursive) — the tree built', () => {
  it.each([
    ['the example (balanced)', [50, 30, 70, 20, 40, 60, 80], '[50, 30, 70, 20, 40, 60, 80]'],
    ['empty', [], '[]'],
    ['one value', [5], '[5]'],
    ['ascending: a right-leaning chain', [1, 2, 3, 4], '[1, null, 2, null, 3, null, 4]'],
    ['descending: a left-leaning chain', [4, 3, 2, 1], '[4, 3, null, 2, null, 1]'],
    ['negative values and zero', [0, -5, 5, -10, -1], '[0, -5, 5, -10, -1]'],
    ['a duplicate of the root', [5, 5, 3], '[5, 3]'],
    ['a duplicate inside a subtree', [5, 3, 8, 3, 8], '[5, 3, 8]'],
    ['all equal: one node', [2, 2, 2], '[2]'],
  ])('%s', (_name, values, expected) => {
    expect(shape(run(values as number[]))).toBe(expected);
  });

  it('on 500 random inputs: the same tree, node ids and skipped duplicates as the iterative build; the input untouched', () => {
    const rng = makeRng(31);
    for (let t = 0; t < 500; t++) {
      const values = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * [7, 40, 1999][t % 3]) - [3, 20, 999][t % 3]);
      const before = [...values];
      const r = run(values).at(-1)!.tree!;
      const i = iter.generateSteps([...values]).at(-1)!.tree!;
      const where = JSON.stringify(values);
      expect(levelOrderText(r), where).toBe(levelOrderText(i));
      expect([...r.nodes].sort((a, b) => a.id.localeCompare(b.id)), where).toEqual([...i.nodes].sort((a, b) => a.id.localeCompare(b.id)));
      expect(r.build!.skipped, where).toEqual(i.build!.skipped);
      expect(values).toEqual(before);
    }
  });

  it('refuses values that are not whole numbers, as the iterative build does', () => {
    expect(() => run([1.5, 2])).toThrow(TypeError);
  });
});

describe('Build a BST (Recursive) — the recursion, step by step', () => {
  it('[8, 4, 6, 4]: each call, its base case, the new node returned and linked, and the calls unwinding', () => {
    const steps = run([8, 4, 6, 4]);
    expect(steps.map(s => `${s.codeRef}${s.result ? `:${s.result}` : ''} [${stackText(s)}]`)).toEqual([
      'init-root []',
      'next-value:true []',
      // 8: the tree is empty, so the first call is the base case
      'call-root [root:null]', 'check-null:true [root:null]', 'base-create [root:null>n0]', 'assign-root []',
      'next-value:true []',
      // 4: smaller than 8, a call on its empty left child creates the node, and 8's call links it
      'call-root [root:n0]', 'check-null:false [root:n0]', 'check-less:true [root:n0]',
      'recurse-left [root:n0 left:null]', 'check-null:true [root:n0 left:null]', 'base-create [root:n0 left:null>n1]',
      'attach-left [root:n0]', 'return-node [root:n0>n0]', 'assign-root []',
      'next-value:true []',
      // 6: left of 8, right of 4; the calls return one by one
      'call-root [root:n0]', 'check-null:false [root:n0]', 'check-less:true [root:n0]',
      'recurse-left [root:n0 left:n1]', 'check-null:false [root:n0 left:n1]', 'check-less:false [root:n0 left:n1]', 'check-greater:true [root:n0 left:n1]',
      'recurse-right [root:n0 left:n1 right:null]', 'check-null:true [root:n0 left:n1 right:null]', 'base-create [root:n0 left:n1 right:null>n2]',
      'attach-right [root:n0 left:n1]', 'return-node [root:n0 left:n1>n1]', 'attach-left [root:n0]', 'return-node [root:n0>n0]', 'assign-root []',
      'next-value:true []',
      // the second 4: equal to 4, so no call is made and every call returns its node unchanged
      'call-root [root:n0]', 'check-null:false [root:n0]', 'check-less:true [root:n0]',
      'recurse-left [root:n0 left:n1]', 'check-null:false [root:n0 left:n1]', 'check-less:false [root:n0 left:n1]', 'check-greater:false [root:n0 left:n1]',
      'return-node [root:n0 left:n1>n1]', 'attach-left [root:n0]', 'return-node [root:n0>n0]', 'assign-root []',
      'next-value:false []',
      'return []',
    ]);
  });

  it('the new node exists only in the returned value until its caller links it', () => {
    const steps = run([8, 4]);
    const create = steps.findIndex(s => s.codeRef === 'base-create' && s.tree!.build!.index === 1);
    const b = steps[create].tree!.build!;
    expect(b.created).toMatchObject({ id: 'n1', value: 4, left: null, right: null });
    expect(b.slot).toEqual({ parent: 'n0', side: 'left' });
    expect(steps[create].tree!.nodes.map(n => n.id)).toEqual(['n0']);
    const attach = steps[create + 1];
    expect(attach).toMatchObject({ codeRef: 'attach-left' });
    expect(attach.tree!.build!).toMatchObject({ inserted: 'n1' });
    expect(attach.tree!.build!.created).toBeUndefined();
    expect(nodeMap(attach.tree!).get('n0')!.left).toBe('n1');
  });

  it('every snapshot is a real call stack: rooted at buildBST, each call one child below its caller, one push or pop per step', () => {
    const rng = makeRng(9);
    for (let t = 0; t < 150; t++) {
      const values = Array.from({ length: Math.floor(rng() * 13) }, () => Math.floor(rng() * 15) - 7);
      const problems: string[] = [];
      const check = (ok: boolean, what: string) => {
        if (!ok && problems.length < 10) problems.push(`${JSON.stringify(values)} ${what}`);
      };
      let prev: readonly TreeCallFrame[] = [];
      for (const s of run(values)) {
        const at = `step ${s.id} (${s.codeRef})`;
        const v = s.tree!;
        const b = v.build!;
        const calls = b.calls!;
        const byId = nodeMap(v);
        if (calls.length) {
          check(calls[0].via === 'root', `${at}: the outermost call gets the root`);
          check(calls[0].node === v.root || (v.root === null && calls[0].node === null), `${at}: the outermost call works on the root`);
        }
        calls.forEach((f, k) => k > 0 && check(calls[k - 1].node !== null && byId.get(calls[k - 1].node!)![f.via as 'left' | 'right'] === f.node, `${at}: frame ${k} is its caller's ${f.via} child`));
        check(calls.slice(0, -1).every(f => !f.returns), `${at}: only the running call can be returning`);
        // the path is the chain of non-empty subtrees the calls work on; the node pointer is the running call's node
        check(JSON.stringify(b.path) === JSON.stringify(calls.flatMap(f => (f.node ? [f.node] : []))), `${at}: path`);
        if (calls.length) check(v.pointers?.[0]?.node === calls.at(-1)!.node, `${at}: node pointer`);
        // one push (a call), one pop (after a return) or a change to the running frame only
        const sameBelow = (a: readonly TreeCallFrame[], z: readonly TreeCallFrame[], len: number) => a.slice(0, len).every((f, k) => f === z[k]);
        const d = calls.length - prev.length;
        check(
          (d === 1 && sameBelow(calls, prev, prev.length)) || (d === -1 && sameBelow(calls, prev, calls.length)) || (d === 0 && sameBelow(calls, prev, calls.length - 1)),
          `${at}: ${prev.length} → ${calls.length} frames`
        );
        if (s.codeRef === 'check-null') check((s.result === 'true') === (calls.at(-1)!.node === null), `${at}: base case test`);
        if (s.codeRef === 'base-create') check(calls.at(-1)!.returns === b.created!.id && !byId.has(b.created!.id), `${at}: the new node is returned, not linked`);
        if (s.codeRef === 'return-node') check(calls.at(-1)!.returns === calls.at(-1)!.node, `${at}: a call returns its own node`);
        prev = calls;
      }
      expect(problems).toEqual([]);
    }
  });

  it('a duplicate makes no further call: the equal node is marked and every call returns unchanged', () => {
    for (const [values, at] of [[[5, 5], 0], [[5, 3, 8, 3], 1]] as const) {
      const steps = run([...values]);
      const i = values.length - 1;
      const dup = steps.filter(s => s.tree!.build!.index === i);
      const equal = dup.find(s => s.codeRef === 'check-greater' && s.result === 'false')!;
      expect(equal.tree!.build!.duplicate, JSON.stringify(values)).toBeDefined();
      expect(frames(equal)).toHaveLength(at + 1);
      expect(dup.filter(s => s.codeRef?.startsWith('recurse')).length).toBe(at);
      expect(dup.some(s => s.codeRef === 'base-create')).toBe(false);
      expect(dup.at(-1)!.tree!.nodes).toBe(steps.find(s => s.tree!.build!.index === i)!.tree!.nodes);
      expect(steps.at(-1)!.tree!.build!.skipped).toEqual([i]);
    }
  });

  it('snapshots never change afterwards: frozen trees and stacks, nodes arrays shared until a link, same trace on a rerun', () => {
    const steps = run([50, 30, 70, 20, 40, 60, 80, 30]);
    const copy = JSON.parse(JSON.stringify(steps));
    for (const s of steps) {
      expect(Object.isFrozen(s.tree!.nodes) && Object.isFrozen(frames(s)) && frames(s).every(f => Object.isFrozen(f))).toBe(true);
    }
    expect(new Set(steps.map(s => s.tree!.nodes)).size).toBe(8);
    expect(run([50, 30, 70, 20, 40, 60, 80, 30])).toEqual(steps);
    expect(JSON.parse(JSON.stringify(steps))).toEqual(copy);
    // going back to a step shows exactly what it showed: its own tree and stack
    const mid = steps.find(s => s.codeRef === 'base-create' && s.tree!.build!.index === 4)!;
    expect(levelOrderText(mid.tree!)).toBe('[50, 30, 70, 20]');
    expect(stackText(mid)).toBe('root:n0 left:n1 right:null>n4');
  });

  it('an empty input completes with the empty tree and no call ever made', () => {
    const steps = run([]);
    expect(steps.map(s => s.codeRef)).toEqual(['init-root', 'next-value', 'return']);
    for (const s of steps) expect(frames(s)).toEqual([]);
    expect(steps.at(-1)!.outcomeText).toBe('Empty tree: no values to insert');
  });

  it('16 ascending values: the last insertion is 16 calls deep (15 nodes and the base case); the tree 16 levels', () => {
    const steps = run(Array.from({ length: 16 }, (_, k) => k));
    expect(Math.max(...steps.map(s => frames(s).length))).toBe(16);
    expect(treeLevels(steps.at(-1)!.tree!)).toBe(16);
  });

  it('ends with the tree, its inorder and the duplicates skipped (the same result as the iterative build)', () => {
    const steps = run([5, 3, 5, 8]);
    expect(steps.at(-1)).toMatchObject({ type: 'complete', codeRef: 'return', outcomeText: 'BST of 3 nodes; inorder: [3, 5, 8]; 1 duplicate skipped' });
    expect(steps.at(-1)!.outcomeText).toBe(iter.generateSteps([5, 3, 5, 8]).at(-1)!.outcomeText);
  });
});

describe('Build a BST (Recursive) — code listings', () => {
  const line = (lang: (typeof LANGUAGES)[number], ref: string) => codeLines(rec, lang)[rec.lineMap[lang][ref] - 1].trim();

  it('every codeRef the trace uses is mapped in all four languages, to the right statement', () => {
    const used = new Set([...run([5, 3, 8, 5, 4]), ...run([])].map(s => s.codeRef!));
    expect(used).toEqual(new Set(Object.keys(rec.lineMap.cpp)));
    for (const lang of LANGUAGES) {
      for (const ref of used) expect(resolveCodeRef(rec, lang, ref), `${lang} ${ref}`).not.toBeNull();
      // (C also passes its allocation-failure flag)
      expect(line(lang, 'recurse-left'), lang).toMatch(/node(->|\.)left = insert\(node(->|\.)left, value(, failed)?\)/);
      expect(line(lang, 'attach-left')).toBe(line(lang, 'recurse-left'));
      expect(line(lang, 'recurse-right'), lang).toMatch(/node(->|\.)right = insert\(node(->|\.)right, value(, failed)?\)/);
      expect(line(lang, 'base-create'), lang).toMatch(/return (newNode|createNode|new TreeNode|TreeNode)\(value(, failed)?\)/);
      expect(line(lang, 'return-node'), lang).toMatch(/^return node;?$/);
      expect(line(lang, 'call-root'), lang).toMatch(/root = insert\(root, /);
    }
  });

  it('every listing is truly recursive: insert calls itself, and buildBST has no loop that walks the tree', () => {
    for (const lang of LANGUAGES) {
      const code = rec.code[lang];
      expect(code.match(/= insert\(node(->|\.)(left|right), value(, failed)?\)/g), lang).toHaveLength(2);
      expect(code, lang).not.toMatch(/while/);
    }
  });

  it('C reports a failed allocation instead of hiding it: the flag is set, passed down every call, reset and checked by buildBST', () => {
    // (C++, Java and Python report it by throwing, before any assignment; the trace never runs out of memory)
    const c = rec.code.c;
    expect(c).toMatch(/if \(newNode == NULL\) \{\n\s*\*failed = 1;.*\n\s*return NULL;/);
    expect(c.match(/insert\([^)]*, failed\)/g)).toHaveLength(3);
    expect(c).toContain('return createNode(value, failed);');
    expect(c).toMatch(/\*failed = 0;\n\n\s*for \(int i = 0; i < n; i\+\+\) \{\n\s*root = insert\(root, values\[i\], failed\);\n\s*if \(\*failed\) \{\n\s*break;/);
    // the base case is reached only on an empty child, so the NULL a failed call returns never replaces a node
    expect(line('c', 'check-null')).toBe('if (node == NULL) {');
    expect(rec.lineSpans).toEqual({ c: { 'init-root': 2 } });
    expect(codeLines(rec, 'c')[rec.lineMap.c['init-root']].trim()).toBe('*failed = 0;');
  });
});

describe('Build a BST (Recursive) — input and integration', () => {
  it('takes the same array input as the iterative build', () => {
    expect(takesTexts(rec)).toBe(false);
    for (const values of [[50, 30, 70], [], [-999, 999], Array(16).fill(1), Array(17).fill(0)]) {
      expect(validateAlgorithmInput(rec, values, null).ok).toBe(validateAlgorithmInput(iter, values, null).ok);
    }
  });

  it('registered separately from the iterative build, listed right after it in TREES, with recursion-aware bounds', () => {
    expect(getAlgorithmDefinition('build-bst-recursive')).toBe(rec);
    expect(getAlgorithmDefinition('build-bst')).toBe(iter);
    expect(visualKindOf(rec)).toBe('tree');
    expect(ALGORITHM_NAV.filter(a => a.id === 'build-bst-recursive')).toEqual([
      expect.objectContaining({ name: 'Build a Binary Search Tree (Recursive)', category: 'TREES', implemented: true }),
    ]);
    const order = ALGORITHM_NAV.map(a => a.id);
    expect(order.indexOf('build-bst-recursive')).toBe(order.indexOf('build-bst') + 1);
    expect(ALGORITHM_NAV.find(a => a.id === 'bst')).toMatchObject({ implemented: false });
    expect(rec.complexity).toMatchObject({ average: 'O(n log n)', worst: 'O(n²)', space: 'O(n)' });
    expect(rec.description).toMatch(/O\(h\) call-stack space/);
    expect(rec.description).toMatch(/AVL and Red-Black/);
    expect(rec.defaultInput).toEqual(iter.defaultInput);
    expect(buildExecution('build-bst-recursive', [50, 30, 70, 20, 40, 60, 80]).status).toBe('ok');
  });
});
