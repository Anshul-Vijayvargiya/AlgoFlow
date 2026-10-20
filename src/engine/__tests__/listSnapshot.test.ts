import { describe, it, expect } from 'vitest';
import type { ExecutionStep, ListSnapshot } from '../../types/algorithm';
import {
  attach,
  chainFrom,
  createNode,
  detach,
  dropPointer,
  emptyList,
  indexFromHead,
  listFromValues,
  removeNode,
  setHead,
  setNext,
  setPointer,
  setTail,
  settle,
  validateListSnapshot,
  valuesFromHead,
} from '../linkedList/listSnapshot';
import { listTraceProblems } from './linkedListInvariants';

/** A broken snapshot for validation tests (bypasses the helpers on purpose). */
const raw = (s: Partial<ListSnapshot>): ListSnapshot => ({ nodes: [], head: null, tail: null, pointers: {}, detached: [], lastId: 9, ...s });
const node = (id: string, value: number, next: string | null) => ({ id, value, next });

describe('listSnapshot helpers', () => {
  it('listFromValues builds n1 → … → NULL with HEAD on the first and TAIL on the last node', () => {
    const s = listFromValues([4, 7, 7]);
    expect(s.nodes).toEqual([node('n1', 4, 'n2'), node('n2', 7, 'n3'), node('n3', 7, null)]);
    expect([s.head, s.tail, s.lastId]).toEqual(['n1', 'n3', 3]);
    expect(validateListSnapshot(s, { stable: true })).toEqual([]);
    expect(valuesFromHead(s)).toEqual([4, 7, 7]); // duplicates kept, as distinct nodes
  });

  it('the empty list has HEAD = TAIL = NULL and is valid', () => {
    for (const s of [emptyList(), listFromValues([])]) {
      expect([s.head, s.tail, s.nodes.length, s.lastId]).toEqual([null, null, 0, 0]);
      expect(validateListSnapshot(s, { stable: true })).toEqual([]);
      expect(valuesFromHead(s)).toEqual([]);
    }
  });

  it('every snapshot is deeply frozen and every update leaves its argument untouched', () => {
    const s0 = listFromValues([1, 2]);
    const before = JSON.stringify(s0);
    const { snapshot: s1, id } = createNode(s0, 9);
    const s2 = setNext(s1, id, 'n1');
    const s3 = setHead(attach(s2, id), id);
    const s4 = setPointer(s3, 'curr', 'n2');
    for (const s of [s0, s1, s2, s3, s4]) {
      expect(Object.isFrozen(s) && Object.isFrozen(s.nodes) && s.nodes.every(Object.isFrozen) && Object.isFrozen(s.pointers) && Object.isFrozen(s.detached)).toBe(true);
    }
    expect(JSON.stringify(s0)).toBe(before);
    expect(() => {
      (s0.nodes as unknown as unknown[]).push(1);
    }).toThrow(TypeError);
  });

  it('createNode allocates n<lastId+1> outside the list with a NULL next; freed ids are never reused', () => {
    const s = listFromValues([1, 2]);
    const { snapshot, id } = createNode(s, 5);
    expect(id).toBe('n3');
    expect(snapshot.detached).toEqual(['n3']);
    expect(snapshot.nodes.at(-1)).toEqual(node('n3', 5, null));
    expect(validateListSnapshot(snapshot)).toEqual([]);
    // free the last node, then allocate again: n3 is not reused
    const unlinked = setTail(setNext(snapshot, 'n1', null), 'n1');
    const freed = removeNode(removeNode(unlinked, 'n3'), 'n2');
    expect(createNode(freed, 8).id).toBe('n4');
  });

  it('setNext / setHead / setTail record exactly their change; a later statement clears it, attach/detach keep it', () => {
    const s = listFromValues([1, 2, 3]);
    expect(setNext(s, 'n1', 'n3').changed).toEqual({ kind: 'next', node: 'n1', from: 'n2', to: 'n3' });
    expect(setHead(s, 'n2').changed).toEqual({ kind: 'head', from: 'n1', to: 'n2' });
    expect(setTail(s, 'n2').changed).toEqual({ kind: 'tail', from: 'n3', to: 'n2' });
    const changed = setHead(s, 'n2');
    // assigning the value a field already has (e.g. node.next = head on an empty list: NULL = NULL) changes nothing
    expect(setNext(s, 'n3', null).changed).toBeUndefined();
    expect(setHead(s, 'n1').changed).toBeUndefined();
    expect(setTail(s, 'n3').changed).toBeUndefined();
    expect('changed' in setHead(s, 'n1')).toBe(false);
    // separate statements: the HEAD change belongs to the previous step
    for (const t of [setPointer(changed, 'p', 'n1'), dropPointer(changed, 'p')]) expect(t.changed).toBeUndefined();
    // list membership recorded as part of the same statement: the change stays
    for (const t of [detach(changed, 'n1'), attach(changed, 'n1')]) expect(t.changed).toEqual({ kind: 'head', from: 'n1', to: 'n2' });
    expect(removeNode(detach(setHead(listFromValues([1, 2]), 'n2'), 'n1'), 'n1').changed).toBeUndefined();
  });

  it('settle: a step that only reads the list (a condition) keeps the list but records no change', () => {
    const changed = setHead(listFromValues([1, 2]), 'n2');
    const settled = settle(changed);
    expect('changed' in settled).toBe(false);
    expect({ ...settled, changed: changed.changed }).toEqual(changed);
    expect(Object.isFrozen(settled)).toBe(true);
    const plain = listFromValues([1, 2]);
    expect(settle(plain)).toBe(plain);
  });

  it('references to nodes that do not exist are rejected', () => {
    const s = listFromValues([1]);
    expect(() => setNext(s, 'n9', null)).toThrow(/n9/);
    expect(() => setNext(s, 'n1', 'n9')).toThrow(/n9/);
    expect(() => setHead(s, 'n9')).toThrow(/n9/);
    expect(() => setTail(s, 'n9')).toThrow(/n9/);
    expect(() => setPointer(s, 'curr', 'n9')).toThrow(/n9/);
    expect(() => attach(s, 'n9')).toThrow(/n9/);
    expect(() => removeNode(s, 'n9')).toThrow(/n9/);
  });

  it('removeNode refuses a node still on a link, HEAD or TAIL, and drops variables that held it', () => {
    const s = setPointer(listFromValues([1, 2]), 'temp', 'n1');
    expect(() => removeNode(s, 'n1')).toThrow(/still referenced/);
    const unlinked = detach(setHead(s, 'n2'), 'n1');
    const freed = removeNode(unlinked, 'n1');
    expect(freed.nodes.map(n => n.id)).toEqual(['n2']);
    expect(freed.pointers).toEqual({});
    expect(freed.detached).toEqual([]);
    expect(validateListSnapshot(freed, { stable: true })).toEqual([]);
  });

  it('chainFrom / indexFromHead follow next links; a cycle is reported, not looped on', () => {
    const s = listFromValues([5, 6, 7]);
    expect(chainFrom(s, 'n2')).toEqual(['n2', 'n3']);
    expect(chainFrom(s, null)).toEqual([]);
    expect([indexFromHead(s, 'n1'), indexFromHead(s, 'n3')]).toEqual([0, 2]);
    expect(() => chainFrom(setNext(s, 'n3', 'n1'), 'n1')).toThrow(/cycle/);
  });
});

describe('validateListSnapshot catches every structural problem', () => {
  const cases: [string, ListSnapshot, RegExp][] = [
    ['duplicate id', raw({ nodes: [node('n1', 1, null), node('n1', 2, null)], head: 'n1', tail: 'n1' }), /duplicate node id n1/],
    ['bad id', raw({ nodes: [node('x', 1, null)], head: 'x', tail: 'x' }), /not of the form/],
    ['id above lastId', raw({ nodes: [node('n7', 1, null)], head: 'n7', tail: 'n7', lastId: 3 }), /above lastId/],
    ['dangling next', raw({ nodes: [node('n1', 1, 'n5')], head: 'n1', tail: 'n1' }), /missing node n5/],
    ['dangling HEAD', raw({ nodes: [], head: 'n2', tail: 'n2' }), /HEAD points to missing/],
    ['dangling pointer', raw({ nodes: [], pointers: { curr: 'n3' } }), /pointer curr points to missing/],
    ['cycle', raw({ nodes: [node('n1', 1, 'n2'), node('n2', 2, 'n1')], head: 'n1', tail: 'n2' }), /cycle/],
    ['orphan', raw({ nodes: [node('n1', 1, null), node('n2', 2, null)], head: 'n1', tail: 'n1' }), /n2 is unreachable/],
    ['detached on the list', raw({ nodes: [node('n1', 1, null)], head: 'n1', tail: 'n1', detached: ['n1'] }), /detached node n1 is on the HEAD chain/],
  ];
  for (const [name, s, msg] of cases) {
    it(name, () => expect(validateListSnapshot(s).join('\n')).toMatch(msg));
  }

  it('HEAD and TAIL may disagree for one statement mid-operation, but never in a stable list', () => {
    // deleting the only node: head = NULL has run, tail = NULL has not yet
    const s = detach(setHead(setPointer(listFromValues([4]), 'temp', 'n1'), null), 'n1');
    expect(validateListSnapshot(s)).toEqual([]);
    expect(validateListSnapshot(s, { stable: true }).join('\n')).toMatch(/HEAD is NULL but TAIL is n1/);
    const raw1 = raw({ nodes: [node('n1', 1, null)], head: 'n1', tail: null });
    expect(validateListSnapshot(raw1)).toEqual([]);
    expect(validateListSnapshot(raw1, { stable: true }).join('\n')).toMatch(/HEAD is n1 but TAIL is NULL/);
  });

  it('stable checks: TAIL must end the HEAD chain with a NULL next, and nothing may be detached', () => {
    const midReverse = setPointer(setNext(listFromValues([1, 2]), 'n1', null), 'curr', 'n2');
    expect(validateListSnapshot(midReverse)).toEqual([]); // fine while the operation runs
    expect(validateListSnapshot(midReverse, { stable: true }).join('\n')).toMatch(/TAIL is n2 but the list from HEAD ends at n1/);
    const pending = createNode(listFromValues([1]), 2).snapshot;
    expect(validateListSnapshot(pending)).toEqual([]);
    expect(validateListSnapshot(pending, { stable: true }).join('\n')).toMatch(/detached nodes: n2/);
  });
});

/** Builds a trace the way a generator will: one step per helper result. */
function traceOf(snapshots: ListSnapshot[]): ExecutionStep[] {
  return snapshots.map((list, id) => ({ id, type: 'assign', codeRef: 'x', state: valuesFromHead(list), message: `step ${id}`, list }));
}

describe('shared linked-list trace invariants', () => {
  // insert 9 at head of [1, 2]: new node → node.next = head → head = node
  const s0 = listFromValues([1, 2]);
  const { snapshot: s1, id } = createNode(s0, 9);
  const s2 = setNext(s1, id, s0.head);
  const s3 = attach(setHead(s2, id), id);
  const good = traceOf([s0, s1, s2, s3]);

  it('a correct insert-at-head trace passes, including its transitional steps', () => {
    expect(listTraceProblems(good)).toEqual([]);
    expect(good.map(s => s.state)).toEqual([[1, 2], [1, 2], [1, 2], [9, 1, 2]]);
  });

  it('a correct delete-head trace with free() passes', () => {
    const t0 = listFromValues([1, 2]);
    const t1 = setPointer(t0, 'temp', 'n1');
    const t2 = detach(setHead(t1, 'n2'), 'n1');
    const t3 = removeNode(t2, 'n1');
    expect(listTraceProblems(traceOf([t0, t1, t2, t3]))).toEqual([]);
  });

  it('a correct reverse trace passes (transitional steps are split, never cyclic or orphaned)', () => {
    let s = setPointer(setPointer(listFromValues([1, 2, 3]), 'prev', null), 'curr', 'n1');
    const snaps = [listFromValues([1, 2, 3]), s];
    for (const c of ['n1', 'n2', 'n3']) {
      const prev = s.pointers.prev;
      s = setPointer(s, 'next', s.nodes.find(n => n.id === c)!.next);
      snaps.push(s);
      s = setNext(s, c, prev);
      snaps.push(s);
      s = setPointer(s, 'prev', c);
      snaps.push(s);
      s = setPointer(s, 'curr', s.pointers.next);
      snaps.push(s);
    }
    s = setTail(s, 'n1');
    snaps.push(s);
    s = setHead(s, 'n3');
    snaps.push(s);
    expect(listTraceProblems(traceOf(snaps))).toEqual([]);
    expect(valuesFromHead(s)).toEqual([3, 2, 1]);
  });

  const corrupt = (f: (steps: ExecutionStep[]) => void) => {
    const steps = traceOf([s0, s1, s2, s3]).map(s => ({ ...s }));
    f(steps);
    return listTraceProblems(steps).join('\n');
  };
  it.each([
    ['state that is not the list read from HEAD', (st: ExecutionStep[]) => { st[3].state = [1, 2]; }, /state \[1,2\] != values from HEAD/],
    ['a wrong `changed`', (st: ExecutionStep[]) => { st[2].list = { ...st[2].list!, changed: { kind: 'head', from: null, to: 'n1' } }; }, /changed .* != actual/],
    ['two links changed in one step', (st: ExecutionStep[]) => { st[2].list = setHead(s2, id); st[2].state = valuesFromHead(st[2].list); }, /2 link\/HEAD\/TAIL changes/],
    ['a node changing value', (st: ExecutionStep[]) => { st[3].list = { ...s3, nodes: s3.nodes.map(n => (n.id === 'n1' ? { ...n, value: 5 } : n)) }; }, /n1 changed value 1 → 5/],
    ['an unfrozen snapshot', (st: ExecutionStep[]) => { st[1].list = { ...s1 }; }, /not frozen/],
    ['a transitional last step', (st: ExecutionStep[]) => { st.pop(); }, /detached nodes|ends at/],
  ])('detects %s', (_label, f, msg) => {
    expect(corrupt(f)).toMatch(msg);
  });
});
