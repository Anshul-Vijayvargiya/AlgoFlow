import { describe, it, expect } from 'vitest';
import type { AlgorithmDefinition, ExecutionStep, ListSnapshot } from '../../types/algorithm';
import { resolveCodeRange, resolveCodeRef } from '../AlgorithmRegistry';
import { buildExecution } from '../buildExecution';
import { MAX_LIST_SIZE, validateAlgorithmInput } from '../inputParsing';
import { nodeById } from '../linkedList/listSnapshot';
import { LANGUAGES, codeLines, def, makeRng } from './testUtils';
import { expectValidListTrace } from './linkedListInvariants';

// Phase 3: Build, Insert at Position, Delete at Position, Reverse.
const OPS = ['ll-build', 'll-insert-at', 'll-delete-at', 'reverse-linked-list'] as const;
type Op = (typeof OPS)[number];

function randomLists(count: number, seed: number): number[][] {
  const rnd = makeRng(seed);
  return Array.from({ length: count }, () => Array.from({ length: Math.floor(rnd() * 10) }, () => Math.floor(rnd() * 13) - 6));
}
/** 0..9 nodes (Insert at Position adds one), with duplicates and negatives. */
const LISTS: number[][] = [[], [5], [5, 5], [1, 2], [3, 3, 1, 3], [-4, 0, -4], [4, 7, 9, 3, 8, 1, 2, 6, 0], ...randomLists(40, 77)];

const insertAt = (input: number[], index: number, value = 8) => def('ll-insert-at').generateSteps([...input], { index, value });
const deleteAt = (input: number[], index: number) => def('ll-delete-at').generateSteps([...input], { index });
const build = (input: number[]) => def('ll-build').generateSteps([...input]);
const reverse = (input: number[]) => def('reverse-linked-list').generateSteps([...input]);

/** Every trace an operation can produce over LISTS: each valid index for the positional operations. */
function allTraces(id: Op): [string, ExecutionStep[]][] {
  const out: [string, ExecutionStep[]][] = [];
  for (const input of LISTS) {
    const at = JSON.stringify(input);
    if (id === 'll-insert-at') for (let i = 0; i <= input.length; i++) out.push([`${at} insert@${i}`, insertAt(input, i)]);
    else if (id === 'll-delete-at') for (let i = 0; i < input.length; i++) out.push([`${at} delete@${i}`, deleteAt(input, i)]);
    else out.push([at, def(id).generateSteps([...input])]);
  }
  return out;
}

const shape = (steps: ExecutionStep[]) => steps.map(s => (s.result ? `${s.codeRef}:${s.result}` : String(s.codeRef)));
const repeat = <T,>(n: number, items: T[]) => Array.from({ length: Math.max(0, n) }, () => items).flat();
const changes = (steps: ExecutionStep[]) => steps.filter(s => s.list?.changed).map(s => `${s.codeRef}:${s.list!.changed!.kind}`);
const final = (steps: ExecutionStep[]) => steps[steps.length - 1];
const at = (steps: ExecutionStep[], ref: string, nth = 0) => steps.filter(s => s.codeRef === ref)[nth].list!;
const ids = (s: ListSnapshot) => s.nodes.map(n => n.id);
/** HEAD and TAIL after a step, as [head, tail]. */
const ends = (s: ListSnapshot) => [s.head, s.tail];

describe('Phase 3 linked-list operations — shared invariants on every trace', () => {
  for (const id of OPS) {
    it(`${id}: every trace is valid (frozen snapshots, stable ends, state = list from HEAD, one exact change per step)`, () => {
      for (const [label, steps] of allTraces(id)) {
        expectValidListTrace(steps, `${id} ${label}`);
        expect(steps[0].type).toBe('init');
        expect(final(steps).type).toBe('complete');
        expect(steps[0].list!.pointers).toEqual({});
        expect(final(steps).list!.pointers).toEqual({});
        for (const s of steps) {
          for (const i of s.indices ?? []) expect(i >= 0 && i < s.state.length, `${id} ${label} step ${s.id} index ${i}`).toBe(true);
          expect(`${s.message} ${s.explanation ?? ''}`, `${id} ${label} step ${s.id}`).not.toMatch(/undefined|NaN|null/);
        }
      }
    });
  }

  it('earlier snapshots never change while later steps are produced or replayed (immutability across playback)', () => {
    const steps = reverse([1, 2, 3]);
    const copies = steps.map(s => JSON.stringify(s.list));
    for (const s of [...steps].reverse()) expect(Object.isFrozen(s.list)).toBe(true);
    reverse([1, 2, 3]);
    expect(steps.map(s => JSON.stringify(s.list))).toEqual(copies);
  });
});

describe('Build', () => {
  it('appends every value through TAIL: final FALSE loop check; the list equals the input with ids n1..nk in order', () => {
    for (const input of LISTS) {
      const steps = build(input);
      const n = input.length;
      const body = (k: number) => ['loop:true', 'create-node', k === 0 ? 'check-empty:true' : 'check-empty:false', k === 0 ? 'set-head' : 'link-tail', 'set-tail', 'inc-i'];
      expect(shape(steps)).toEqual(['fn-entry', 'init-list', 'init-i', ...input.flatMap((_, k) => body(k)), 'loop:false', 'fn-entry']);
      expect(steps[0].state).toEqual([]);
      expect(final(steps).state).toEqual(input);
      expect(ids(final(steps).list!)).toEqual(input.map((_, k) => `n${k + 1}`));
      expect(changes(steps)).toEqual(input.flatMap((_, k) => (k === 0 ? ['set-head:head', 'set-tail:tail'] : ['link-tail:next', 'set-tail:tail'])));
      expect(ends(final(steps).list!)).toEqual(n ? ['n1', `n${n}`] : [null, null]);
    }
  });

  it('an empty input builds the empty list: HEAD = TAIL = NULL, the loop is FALSE at once', () => {
    const steps = build([]);
    expect(shape(steps)).toEqual(['fn-entry', 'init-list', 'init-i', 'loop:false', 'fn-entry']);
    expect(final(steps).list!.nodes).toEqual([]);
  });

  it('each new node is outside the list until a link or HEAD reaches it, and the state grows one value at a time', () => {
    const steps = build([4, 7]);
    expect(at(steps, 'create-node', 0).detached).toEqual(['n1']);
    expect(at(steps, 'set-head').detached).toEqual([]);
    expect(at(steps, 'create-node', 1).detached).toEqual(['n2']);
    expect(at(steps, 'link-tail').detached).toEqual([]);
    expect(steps.filter(s => s.codeRef === 'set-tail').map(s => s.state)).toEqual([[4], [4, 7]]);
  });
});

describe('Insert at Position', () => {
  const expected = (n: number, index: number) => {
    if (index === 0) return ['fn-entry', 'create-node', 'check-zero:true', 'link-head', 'set-head', n === 0 ? 'check-tail-empty:true' : 'check-tail-empty:false', ...(n === 0 ? ['set-tail-empty'] : []), 'return-head', 'fn-entry'];
    const appended = index === n;
    return [
      'fn-entry', 'create-node', 'check-zero:false', 'set-prev', 'set-i',
      ...repeat(index - 1, ['loop:true', 'advance-prev', 'inc-i']), 'loop:false',
      'link-node', 'link-prev', appended ? 'check-tail:true' : 'check-tail:false', ...(appended ? ['set-tail'] : []), 'fn-entry',
    ];
  };

  it('inserts at every position (head, middle, tail) of every list: oracle result and exact step order', () => {
    for (const input of LISTS) {
      for (let index = 0; index <= input.length; index++) {
        const steps = insertAt(input, index, 8);
        const label = `${JSON.stringify(input)} @${index}`;
        expect(shape(steps), label).toEqual(expected(input.length, index));
        const oracle = [...input];
        oracle.splice(index, 0, 8);
        expect(final(steps).state, label).toEqual(oracle);
        const newId = `n${input.length + 1}`;
        expect(final(steps).list!.nodes.find(n => n.id === newId)!.value).toBe(8);
        expect(ends(final(steps).list!), label).toEqual([index === 0 ? newId : 'n1', index === input.length ? newId : `n${input.length}`]);
      }
    }
  });

  it('records exactly the HEAD / link / TAIL changes of each case', () => {
    expect(changes(insertAt([], 0))).toEqual(['set-head:head', 'set-tail-empty:tail']); // node.next = head: NULL = NULL
    expect(changes(insertAt([4, 7], 0))).toEqual(['link-head:next', 'set-head:head']);
    expect(changes(insertAt([4, 7, 9], 2))).toEqual(['link-node:next', 'link-prev:next']);
    expect(changes(insertAt([4, 7, 9], 3))).toEqual(['link-prev:next', 'set-tail:tail']); // node.next = prev.next: NULL = NULL
  });

  it('middle: prev walks to position index−1; the new node links forward first, then prev links to it', () => {
    const steps = insertAt([4, 7, 9, 3], 3, 8);
    expect(steps.filter(s => s.codeRef === 'loop').map(s => s.list!.pointers.prev)).toEqual(['n1', 'n2', 'n3']);
    const linked = at(steps, 'link-node');
    expect(nodeById(linked, 'n5')!.next).toBe('n4');
    expect(linked.detached).toEqual(['n5']);
    expect(linked.nodes.map(n => n.next).filter(x => x === 'n4')).toHaveLength(2); // n3 and the new node both point to n4
    const joined = at(steps, 'link-prev');
    expect(joined.detached).toEqual([]);
    expect(nodeById(joined, 'n3')!.next).toBe('n5');
  });

  it('tail: after prev.next = node, TAIL still names the old last node until the next statement', () => {
    const steps = insertAt([4, 7], 2, 8);
    expect(ends(at(steps, 'link-prev'))).toEqual(['n1', 'n2']);
    expect(ends(at(steps, 'set-tail'))).toEqual(['n1', 'n3']);
  });
});

describe('Delete at Position', () => {
  const expected = (n: number, index: number) => {
    if (index === 0) return ['fn-entry', 'check-zero:true', 'head-temp', 'advance-head', n === 1 ? 'check-last:true' : 'check-last:false', ...(n === 1 ? ['clear-tail'] : []), 'head-release', 'head-return', 'fn-entry'];
    const last = index === n - 1;
    return [
      'fn-entry', 'check-zero:false', 'set-prev', 'set-i',
      ...repeat(index - 1, ['loop:true', 'advance-prev', 'inc-i']), 'loop:false',
      'set-temp', 'unlink', last ? 'check-tail:true' : 'check-tail:false', ...(last ? ['set-tail'] : []), 'release', 'fn-entry',
    ];
  };

  it('deletes at every position (head, middle, tail) of every non-empty list: oracle result and exact step order', () => {
    for (const input of LISTS) {
      for (let index = 0; index < input.length; index++) {
        const steps = deleteAt(input, index);
        const label = `${JSON.stringify(input)} @${index}`;
        expect(shape(steps), label).toEqual(expected(input.length, index));
        const oracle = [...input];
        oracle.splice(index, 1);
        expect(final(steps).state, label).toEqual(oracle);
        const removed = `n${index + 1}`;
        expect(ids(final(steps).list!), label).not.toContain(removed);
        const left = ids(final(steps).list!);
        expect(ends(final(steps).list!), label).toEqual(left.length ? [left[0], left[left.length - 1]] : [null, null]);
      }
    }
  });

  it('records exactly the HEAD / link / TAIL changes of each case', () => {
    expect(changes(deleteAt([5], 0))).toEqual(['advance-head:head', 'clear-tail:tail']);
    expect(changes(deleteAt([4, 7], 0))).toEqual(['advance-head:head']);
    expect(changes(deleteAt([4, 7, 9], 1))).toEqual(['unlink:next']);
    expect(changes(deleteAt([4, 7, 9], 2))).toEqual(['unlink:next', 'set-tail:tail']);
  });

  it('memory: the node is unlinked (detached, still pointing forward), then released; its id never returns', () => {
    const steps = deleteAt([4, 7, 9], 1);
    const unlinked = at(steps, 'unlink');
    expect(unlinked.detached).toEqual(['n2']);
    expect(nodeById(unlinked, 'n2')!.next).toBe('n3'); // temp.next is untouched: free() does not need it cleared
    expect(unlinked.pointers.temp).toBe('n2');
    const k = steps.findIndex(s => s.codeRef === 'release');
    for (const s of steps.slice(k)) {
      expect(ids(s.list!)).not.toContain('n2');
      expect(Object.values(s.list!.pointers)).not.toContain('n2');
    }
    expect(steps[k].variables!.released).toBe(7);
    expect(at(steps, 'release').pointers).toEqual({ prev: 'n1' });
  });

  it('tail: TAIL keeps naming the unlinked node until it moves back to prev; the node is released only after', () => {
    const steps = deleteAt([4, 7, 9], 2);
    expect(ends(at(steps, 'unlink'))).toEqual(['n1', 'n3']);
    expect(at(steps, 'unlink').detached).toEqual(['n3']);
    expect(ends(at(steps, 'set-tail'))).toEqual(['n1', 'n2']);
    expect(ids(at(steps, 'set-tail'))).toContain('n3');
    expect(ids(at(steps, 'release'))).toEqual(['n1', 'n2']);
  });
});

describe('Reverse', () => {
  it('empty, single, two and longer lists: exact step order with the final FALSE loop check', () => {
    for (const input of LISTS) {
      const steps = reverse(input);
      expect(shape(steps)).toEqual([
        'fn-entry', 'set-prev', 'set-curr', 'set-tail',
        ...repeat(input.length, ['loop:true', 'save-next', 'reverse-link', 'advance-prev', 'advance-curr']),
        'loop:false', 'set-head', 'fn-entry',
      ]);
      expect(final(steps).state).toEqual([...input].reverse());
      const n = input.length;
      expect(ends(final(steps).list!)).toEqual(n ? [`n${n}`, 'n1'] : [null, null]);
      // TAIL, one link per node, then HEAD — with at most one node nothing actually changes
      expect(changes(steps)).toEqual(n >= 2 ? ['set-tail:tail', ...repeat(n, ['reverse-link:next']), 'set-head:head'] : []);
    }
  });

  it('a single node: its next is already NULL, so nothing changes', () => {
    const steps = reverse([5]);
    expect(changes(steps)).toEqual([]);
    expect(steps.every(s => s.state.length === 1)).toBe(true);
  });

  it('intermediate pointer states: after k iterations prev = node k, curr = node k+1, the first k links point back', () => {
    const input = [10, 20, 30, 40];
    const steps = reverse(input);
    const loops = steps.filter(s => s.codeRef === 'loop');
    loops.forEach((s, k) => {
      const l = s.list!;
      expect(l.pointers.prev, `iteration ${k}`).toBe(k === 0 ? null : `n${k}`);
      expect(l.pointers.curr, `iteration ${k}`).toBe(k < input.length ? `n${k + 1}` : null);
      for (let j = 1; j <= input.length; j++) {
        const next = nodeById(l, `n${j}`)!.next;
        if (j <= k) expect(next, `iteration ${k} n${j}`).toBe(j === 1 ? null : `n${j - 1}`);
        else expect(next, `iteration ${k} n${j}`).toBe(j === input.length ? null : `n${j + 1}`);
      }
      // HEAD still names the old first node until the loop ends; TAIL was moved to it before the loop
      expect(ends(l)).toEqual(['n1', 'n1']);
      // read from HEAD: the whole list before the first flip, then only the old first node (its next is NULL)
      expect(s.state).toEqual(k === 0 ? input : [10]);
    });
  });

  it('save-next keeps the rest of the list reachable at the moment its link is turned around', () => {
    const steps = reverse([1, 2, 3]);
    steps.filter(s => s.codeRef === 'reverse-link').forEach((s, k) => {
      const l = s.list!;
      const curr = l.pointers.curr!;
      expect(curr).toBe(`n${k + 1}`);
      expect(l.pointers.next).toBe(k + 2 <= 3 ? `n${k + 2}` : null);
      expect(nodeById(l, curr)!.next).toBe(k === 0 ? null : `n${k}`);
    });
  });

  it('two nodes: TAIL moves first, the links flip one at a time, HEAD moves last', () => {
    const steps = reverse([1, 2]);
    expect(ends(at(steps, 'set-tail'))).toEqual(['n1', 'n1']);
    expect(ends(at(steps, 'set-head'))).toEqual(['n2', 'n1']);
    expect(at(steps, 'set-head').nodes.map(n => [n.id, n.next])).toEqual([['n1', null], ['n2', 'n1']]);
  });
});

// The transitional HEAD/TAIL states: code sets HEAD and TAIL in separate statements, so for one or two steps they
// legitimately disagree. Each snapshot must be exactly the state right after its own statement — no earlier, no later.
describe('transitional HEAD/TAIL states (empty ↔ one node), every operation that crosses them', () => {
  const trail = (steps: ExecutionStep[]) => steps.map(s => [s.codeRef, s.list!.head, s.list!.tail, s.list!.detached.join(',')]);

  it('empty → one node', () => {
    // [codeRef, HEAD, TAIL, detached] after each statement
    expect(trail(def('ll-insert-head').generateSteps([], { value: 8 }))).toEqual([
      ['fn-entry', null, null, ''],
      ['create-node', null, null, 'n1'], // allocated, not in the list
      ['link-node', null, null, 'n1'], // node.next = head (NULL)
      ['set-head', 'n1', null, ''], // head = node: TAIL not yet set
      ['check-tail', 'n1', null, ''], // the condition reads TAIL == NULL
      ['set-tail', 'n1', 'n1', ''],
      ['fn-entry', 'n1', 'n1', ''],
    ]);
    expect(trail(def('ll-insert-tail').generateSteps([], { value: 8 }))).toEqual([
      ['fn-entry', null, null, ''],
      ['create-node', null, null, 'n1'],
      ['check-empty', null, null, 'n1'],
      ['set-head-empty', 'n1', null, ''],
      ['set-tail-empty', 'n1', 'n1', ''],
      ['fn-entry', 'n1', 'n1', ''],
    ]);
    expect(trail(insertAt([], 0))).toEqual([
      ['fn-entry', null, null, ''],
      ['create-node', null, null, 'n1'],
      ['check-zero', null, null, 'n1'],
      ['link-head', null, null, 'n1'],
      ['set-head', 'n1', null, ''],
      ['check-tail-empty', 'n1', null, ''],
      ['set-tail-empty', 'n1', 'n1', ''],
      ['return-head', 'n1', 'n1', ''],
      ['fn-entry', 'n1', 'n1', ''],
    ]);
    expect(trail(build([4]))).toEqual([
      ['fn-entry', null, null, ''],
      ['init-list', null, null, ''],
      ['init-i', null, null, ''],
      ['loop', null, null, ''],
      ['create-node', null, null, 'n1'],
      ['check-empty', null, null, 'n1'],
      ['set-head', 'n1', null, ''],
      ['set-tail', 'n1', 'n1', ''],
      ['inc-i', 'n1', 'n1', ''],
      ['loop', 'n1', 'n1', ''],
      ['fn-entry', 'n1', 'n1', ''],
    ]);
  });

  it('one node → empty', () => {
    expect(trail(def('ll-delete-head').generateSteps([5]))).toEqual([
      ['fn-entry', 'n1', 'n1', ''],
      ['check-empty', 'n1', 'n1', ''],
      ['set-temp', 'n1', 'n1', ''],
      ['advance-head', null, 'n1', 'n1'], // head = head.next: the node is out of the list, TAIL still names it
      ['check-last', null, 'n1', 'n1'],
      ['clear-tail', null, null, 'n1'], // still exists (temp) until it is released
      ['release', null, null, ''],
      ['fn-entry', null, null, ''],
    ]);
    expect(trail(def('ll-delete-tail').generateSteps([5]))).toEqual([
      ['fn-entry', 'n1', 'n1', ''],
      ['check-empty', 'n1', 'n1', ''],
      ['check-single', 'n1', 'n1', ''],
      ['single-temp', 'n1', 'n1', ''],
      ['single-clear-head', null, 'n1', 'n1'],
      ['single-clear-tail', null, null, 'n1'],
      ['single-release', null, null, ''],
      ['single-return', null, null, ''],
      ['fn-entry', null, null, ''],
    ]);
    expect(trail(deleteAt([5], 0))).toEqual([
      ['fn-entry', 'n1', 'n1', ''],
      ['check-zero', 'n1', 'n1', ''],
      ['head-temp', 'n1', 'n1', ''],
      ['advance-head', null, 'n1', 'n1'],
      ['check-last', null, 'n1', 'n1'],
      ['clear-tail', null, null, 'n1'],
      ['head-release', null, null, ''],
      ['head-return', null, null, ''],
      ['fn-entry', null, null, ''],
    ]);
  });

  it('a released node is never referenced again, and no snapshot names a node that does not exist', () => {
    for (const steps of [deleteAt([5], 0), def('ll-delete-head').generateSteps([5]), def('ll-delete-tail').generateSteps([5])]) {
      const k = steps.findIndex(s => /release/.test(String(s.codeRef)));
      for (const s of steps.slice(k)) expect(JSON.stringify(s.list)).not.toMatch(/"n1"/);
    }
  });
});

describe('invalid indexes and list sizes', () => {
  it('the generators refuse an index outside the list (the app rejects it earlier); null is a TypeError', () => {
    for (const [input, bad] of [[[], [-1, 1]], [[1, 2, 3], [-1, 4, 100, 1.5, NaN]]] as const) {
      for (const index of bad) expect(() => insertAt([...input], index), `insert ${JSON.stringify(input)} @${index}`).toThrow(RangeError);
    }
    for (const [input, bad] of [[[], [0, -1]], [[1, 2, 3], [-1, 3, 4, 0.5]]] as const) {
      for (const index of bad) expect(() => deleteAt([...input], index), `delete ${JSON.stringify(input)} @${index}`).toThrow(RangeError);
    }
    expect(() => def('ll-insert-at').generateSteps([1], { index: null, value: 3 })).toThrow(TypeError);
    expect(() => def('ll-delete-at').generateSteps([1], { index: null })).toThrow(TypeError);
    expect(() => def('ll-insert-at').generateSteps([1], { index: 0, value: null })).toThrow(TypeError);
    for (const [id, params] of [['ll-insert-at', { index: 9, value: 1 }], ['ll-delete-at', { index: 3 }]] as const) {
      const r = buildExecution(id, [1, 2, 3], undefined, params);
      expect(r.status).toBe('generator-error');
      expect(r.steps).toEqual([]);
    }
  });

  it('an omitted index is the default moved into range; deleting from an empty list has no index at all', () => {
    const indexOf = (steps: ExecutionStep[]) => steps[0].variables!.index;
    expect(indexOf(def('ll-insert-at').generateSteps([4, 7, 9]))).toBe(2);
    expect(indexOf(def('ll-insert-at').generateSteps([4]))).toBe(1);
    expect(indexOf(def('ll-insert-at').generateSteps([]))).toBe(0);
    expect(indexOf(def('ll-delete-at').generateSteps([4, 7, 1, 9]))).toBe(2);
    expect(indexOf(def('ll-delete-at').generateSteps([4]))).toBe(0);
    expect(() => def('ll-delete-at').generateSteps([])).toThrow(/empty/);
  });

  it('validation (the app) rejects invalid positions with clear messages before anything runs', () => {
    const ins = def('ll-insert-at');
    const del = def('ll-delete-at');
    expect(validateAlgorithmInput(ins, [1, 2, 3], 9, 3)).toEqual({ ok: true });
    expect(validateAlgorithmInput(ins, [1, 2, 3], 9, 4)).toEqual({
      ok: false,
      canSortCopy: false,
      message: 'Index 4 is out of range. For a list of 3 nodes, insert at 0 to 3 (3 appends at the end).',
    });
    expect(validateAlgorithmInput(ins, [1, 2, 3], 9, -1).ok).toBe(false);
    expect(validateAlgorithmInput(ins, [1, 2, 3], 9, null)).toMatchObject({ ok: false, message: 'Enter a value for "Position".' });
    expect(validateAlgorithmInput(ins, [1, 2, 3], null, 1)).toMatchObject({ ok: false, message: 'Enter a value for "New value".' });
    expect(validateAlgorithmInput(del, [1, 2, 3], null, 2)).toEqual({ ok: true });
    expect(validateAlgorithmInput(del, [1, 2, 3], null, 3)).toMatchObject({ ok: false, message: 'Index 3 is out of range. For a list of 3 nodes, delete at 0 to 2.' });
    expect(validateAlgorithmInput(del, [], null, 0)).toMatchObject({ ok: false, message: 'The list is empty, so there is no node to delete at index 0.' });
  });

  it('maximum size: 10 nodes for Build, Delete at Position and Reverse; 9 for Insert at Position (it adds one)', () => {
    const ten = Array.from({ length: MAX_LIST_SIZE }, (_, k) => k);
    for (const id of ['ll-build', 'reverse-linked-list'] as const) {
      expect(validateAlgorithmInput(def(id), ten, null, null).ok, id).toBe(true);
      expect(validateAlgorithmInput(def(id), [...ten, 10], null, null).ok, id).toBe(false);
    }
    expect(validateAlgorithmInput(def('ll-delete-at'), ten, null, 9).ok).toBe(true);
    expect(validateAlgorithmInput(def('ll-delete-at'), [...ten, 10], null, 0).ok).toBe(false);
    expect(validateAlgorithmInput(def('ll-insert-at'), ten.slice(1), 5, 9).ok).toBe(true);
    expect(validateAlgorithmInput(def('ll-insert-at'), ten, 5, 0)).toMatchObject({
      ok: false,
      message: 'Too many nodes (10). Insert at Position adds one, and the visualizer shows at most 10, so start with at most 9.',
    });
    // the largest valid inputs produce valid traces
    expectValidListTrace(build(ten), 'build 10');
    expectValidListTrace(reverse(ten), 'reverse 10');
    expectValidListTrace(deleteAt(ten, 9), 'delete 10 @9');
    expectValidListTrace(insertAt(ten.slice(1), 9), 'insert 9 @9');
    expect(final(insertAt(ten.slice(1), 9)).state).toHaveLength(MAX_LIST_SIZE);
  });
});

// ─── Code lines ──────────────────────────────────────────────────────────────

type Lines = Record<string, [c: string, cpp: string, java: string, python: string]>;
const RELEASE: [string, string, string, string] = ['free(temp);', 'delete temp;', 'temp = null; // last reference dropped: the GC reclaims the node', 'del temp  # last reference dropped: the node is garbage'];
const WALK: Lines = {
  'set-prev': ['Node* prev = list->head;', 'Node* prev = head;', 'Node prev = head;', 'prev = self.head'],
  'set-i': ['int i = 0;', 'int i = 0;', 'int i = 0;', 'i = 0'],
  loop: ['while (i < index - 1) {', 'while (i < index - 1) {', 'while (i < index - 1) {', 'while i < index - 1:'],
  'advance-prev': ['prev = prev->next;', 'prev = prev->next;', 'prev = prev.next;', 'prev = prev.next'],
  'inc-i': ['i++;', 'i++;', 'i++;', 'i += 1'],
};
const LINES: Record<Op, Lines> = {
  'll-build': {
    'fn-entry': ['void build(List* list, int values[], int n) {', 'void build(const vector<int>& values) {', 'void build(int[] values) {', 'def build(self, values):'],
    'init-list': ['list->head = NULL;', 'head = nullptr;', 'head = null;', 'self.head = None'],
    'init-i': ['for (int i = 0; i < n; i++) {', 'for (size_t i = 0; i < values.size(); i++) {', 'for (int i = 0; i < values.length; i++) {', 'for i in range(len(values)):'],
    loop: ['for (int i = 0; i < n; i++) {', 'for (size_t i = 0; i < values.size(); i++) {', 'for (int i = 0; i < values.length; i++) {', 'for i in range(len(values)):'],
    'inc-i': ['for (int i = 0; i < n; i++) {', 'for (size_t i = 0; i < values.size(); i++) {', 'for (int i = 0; i < values.length; i++) {', 'for i in range(len(values)):'],
    'create-node': ['Node* node = malloc(sizeof(Node));', 'Node* node = new Node(values[i]);', 'Node node = new Node(values[i]);', 'node = Node(values[i])'],
    'check-empty': ['if (list->head == NULL) list->head = node;', 'if (head == nullptr) head = node;', 'if (head == null) head = node;', 'if self.head is None:'],
    'set-head': ['if (list->head == NULL) list->head = node;', 'if (head == nullptr) head = node;', 'if (head == null) head = node;', 'self.head = node'],
    'link-tail': ['else list->tail->next = node;', 'else tail->next = node;', 'else tail.next = node;', 'self.tail.next = node'],
    'set-tail': ['list->tail = node;', 'tail = node;', 'tail = node;', 'self.tail = node'],
  },
  'll-insert-at': {
    'fn-entry': ['void insertAt(List* list, int index, int value) {', 'void insertAt(int index, int value) {', 'void insertAt(int index, int value) {', 'def insert_at(self, index, value):'],
    'create-node': ['Node* node = malloc(sizeof(Node));', 'Node* node = new Node(value);', 'Node node = new Node(value);', 'node = Node(value)'],
    'check-zero': ['if (index == 0) {', 'if (index == 0) {', 'if (index == 0) {', 'if index == 0:'],
    'link-head': ['node->next = list->head;', 'node->next = head;', 'node.next = head;', 'node.next = self.head'],
    'set-head': ['list->head = node;', 'head = node;', 'head = node;', 'self.head = node'],
    'check-tail-empty': ['if (list->tail == NULL) list->tail = node;', 'if (tail == nullptr) tail = node;', 'if (tail == null) tail = node;', 'if self.tail is None:'],
    'set-tail-empty': ['if (list->tail == NULL) list->tail = node;', 'if (tail == nullptr) tail = node;', 'if (tail == null) tail = node;', 'self.tail = node'],
    'return-head': ['return;', 'return;', 'return;', 'return'],
    ...WALK,
    'link-node': ['node->next = prev->next;', 'node->next = prev->next;', 'node.next = prev.next;', 'node.next = prev.next'],
    'link-prev': ['prev->next = node;', 'prev->next = node;', 'prev.next = node;', 'prev.next = node'],
    'check-tail': ['if (prev == list->tail) list->tail = node;', 'if (prev == tail) tail = node;', 'if (prev == tail) tail = node;', 'if prev is self.tail:'],
    'set-tail': ['if (prev == list->tail) list->tail = node;', 'if (prev == tail) tail = node;', 'if (prev == tail) tail = node;', 'self.tail = node'],
  },
  'll-delete-at': {
    'fn-entry': ['void deleteAt(List* list, int index) {', 'void deleteAt(int index) {', 'void deleteAt(int index) {', 'def delete_at(self, index):'],
    'check-zero': ['if (index == 0) {', 'if (index == 0) {', 'if (index == 0) {', 'if index == 0:'],
    'head-temp': ['Node* temp = list->head;', 'Node* temp = head;', 'Node temp = head;', 'temp = self.head'],
    'advance-head': ['list->head = temp->next;', 'head = temp->next;', 'head = temp.next;', 'self.head = temp.next'],
    'check-last': ['if (list->head == NULL) list->tail = NULL;', 'if (head == nullptr) tail = nullptr;', 'if (head == null) tail = null;', 'if self.head is None:'],
    'clear-tail': ['if (list->head == NULL) list->tail = NULL;', 'if (head == nullptr) tail = nullptr;', 'if (head == null) tail = null;', 'self.tail = None'],
    'head-release': RELEASE,
    'head-return': ['return;', 'return;', 'return;', 'return'],
    ...WALK,
    'set-temp': ['Node* temp = prev->next;', 'Node* temp = prev->next;', 'Node temp = prev.next;', 'temp = prev.next'],
    unlink: ['prev->next = temp->next;', 'prev->next = temp->next;', 'prev.next = temp.next;', 'prev.next = temp.next'],
    'check-tail': ['if (temp == list->tail) list->tail = prev;', 'if (temp == tail) tail = prev;', 'if (temp == tail) tail = prev;', 'if temp is self.tail:'],
    'set-tail': ['if (temp == list->tail) list->tail = prev;', 'if (temp == tail) tail = prev;', 'if (temp == tail) tail = prev;', 'self.tail = prev'],
    release: RELEASE,
  },
  'reverse-linked-list': {
    'fn-entry': ['void reverse(List* list) {', 'void reverse() {', 'void reverse() {', 'def reverse(self):'],
    'set-prev': ['Node* prev = NULL;', 'Node* prev = nullptr;', 'Node prev = null;', 'prev = None'],
    'set-curr': ['Node* curr = list->head;', 'Node* curr = head;', 'Node curr = head;', 'curr = self.head'],
    'set-tail': ['list->tail = list->head;', 'tail = head;', 'tail = head;', 'self.tail = self.head'],
    loop: ['while (curr != NULL) {', 'while (curr != nullptr) {', 'while (curr != null) {', 'while curr is not None:'],
    'save-next': ['Node* next = curr->next;', 'Node* next = curr->next;', 'Node next = curr.next;', 'next_node = curr.next'],
    'reverse-link': ['curr->next = prev;', 'curr->next = prev;', 'curr.next = prev;', 'curr.next = prev'],
    'advance-prev': ['prev = curr;', 'prev = curr;', 'prev = curr;', 'prev = curr'],
    'advance-curr': ['curr = next;', 'curr = next;', 'curr = next;', 'curr = next_node'],
    'set-head': ['list->head = prev;', 'head = prev;', 'head = prev;', 'self.head = prev'],
  },
};

describe('Phase 3 code lines — exact statements in all four languages', () => {
  const lineText = (d: AlgorithmDefinition, lang: (typeof LANGUAGES)[number], ref: string) => codeLines(d, lang)[resolveCodeRef(d, lang, ref)! - 1].trim();

  for (const id of OPS) {
    it(`${id}: the table covers exactly the codeRefs the line map defines and the traces emit`, () => {
      const emitted = new Set<string>();
      for (const [, steps] of allTraces(id)) for (const s of steps) if (s.codeRef) emitted.add(s.codeRef);
      expect([...emitted].sort()).toEqual(Object.keys(LINES[id]).sort());
      for (const lang of LANGUAGES) expect(Object.keys(def(id).lineMap[lang]).sort()).toEqual(Object.keys(LINES[id]).sort());
    });

    it(`${id}: every codeRef highlights its exact statement in C, C++, Java and Python`, () => {
      for (const [ref, texts] of Object.entries(LINES[id])) {
        LANGUAGES.forEach((lang, k) => expect(lineText(def(id), lang, ref), `${lang} ${ref}`).toBe(texts[k]));
      }
    });

    it(`${id}: every statement of every listing is highlighted by some step`, () => {
      for (const lang of LANGUAGES) {
        const covered = new Set<number>();
        for (const [, steps] of allTraces(id)) {
          for (const s of steps) {
            const r = resolveCodeRange(def(id), lang, s.codeRef);
            if (r) for (let line = r.start; line <= r.end; line++) covered.add(line);
          }
        }
        codeLines(def(id), lang).forEach((text, k) => {
          if (/^[\s{}]*$/.test(text) || /^\s*\}?\s*else\s*\{?\s*:?\s*$/.test(text)) return;
          expect(covered.has(k + 1), `${id} ${lang} line ${k + 1} "${text.trim()}"`).toBe(true);
        });
      }
    });
  }

  it('C allocation is explicit and complete: malloc, data and next = NULL form one step (C++, Java, Python: one constructor)', () => {
    const range = (id: Op, ref: string, lang: (typeof LANGUAGES)[number] = 'c') => {
      const r = resolveCodeRange(def(id), lang, ref)!;
      return codeLines(def(id), lang).slice(r.start - 1, r.end).map(t => t.trim());
    };
    expect(range('ll-insert-at', 'create-node')).toEqual(['Node* node = malloc(sizeof(Node));', 'node->data = value;', 'node->next = NULL;']);
    expect(range('ll-build', 'create-node')).toEqual(['Node* node = malloc(sizeof(Node));', 'node->data = values[i];', 'node->next = NULL;']);
    for (const lang of ['cpp', 'java', 'python'] as const) {
      expect(range('ll-insert-at', 'create-node', lang)).toHaveLength(1);
      expect(range('ll-build', 'create-node', lang)).toHaveLength(1);
    }
    // the list starts empty: head and tail are set to NULL as one step in every language
    expect(range('ll-build', 'init-list')).toEqual(['list->head = NULL;', 'list->tail = NULL;']);
    expect(range('ll-build', 'init-list', 'python')).toEqual(['self.head = None', 'self.tail = None']);
  });

  it('a deleted node is released with free() in C and delete in C++, after it is unlinked, in both branches', () => {
    const d = def('ll-delete-at');
    for (const ref of ['head-release', 'release']) {
      expect(lineText(d, 'c', ref)).toBe('free(temp);');
      expect(lineText(d, 'cpp', ref)).toBe('delete temp;');
    }
    // every free / delete follows the statement that made the node unreachable from the list
    for (const lang of ['c', 'cpp'] as const) {
      const lines = codeLines(d, lang).map(t => t.trim());
      const releases = lines.flatMap((t, k) => (/^(free\(temp\)|delete temp);$/.test(t) ? [k] : []));
      expect(releases).toHaveLength(2);
      expect(lines.slice(0, releases[0]).join('\n')).toMatch(/head = temp->next;/);
      expect(lines.slice(releases[0] + 1, releases[1]).join('\n')).toMatch(/prev->next = temp->next;/);
    }
    // reverse, build and insert never release memory
    for (const id of ['ll-build', 'll-insert-at', 'reverse-linked-list'] as const) {
      for (const lang of LANGUAGES) expect(codeLines(def(id), lang).join('\n')).not.toMatch(/\bfree\(|\bdelete \w|\bdel \w/);
    }
  });
});
