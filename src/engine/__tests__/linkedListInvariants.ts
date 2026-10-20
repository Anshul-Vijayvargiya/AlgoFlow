import { expect } from 'vitest';
import type { ExecutionStep, ListChange, ListSnapshot } from '../../types/algorithm';
import { validateListSnapshot, valuesFromHead } from '../linkedList/listSnapshot';

const deepFrozen = (s: ListSnapshot) =>
  Object.isFrozen(s) &&
  Object.isFrozen(s.nodes) &&
  s.nodes.every(n => Object.isFrozen(n)) &&
  Object.isFrozen(s.pointers) &&
  Object.isFrozen(s.detached) &&
  (!s.changed || Object.isFrozen(s.changed));

/** The link / HEAD / TAIL differences between two consecutive snapshots of the same trace. */
export function listDiff(prev: ListSnapshot, cur: ListSnapshot): ListChange[] {
  const out: ListChange[] = [];
  const before = new Map(prev.nodes.map(n => [n.id, n.next]));
  for (const n of cur.nodes) {
    if (before.has(n.id) && before.get(n.id) !== n.next) out.push({ kind: 'next', node: n.id, from: before.get(n.id)!, to: n.next });
  }
  if (prev.head !== cur.head) out.push({ kind: 'head', from: prev.head, to: cur.head });
  if (prev.tail !== cur.tail) out.push({ kind: 'tail', from: prev.tail, to: cur.tail });
  return out;
}

/**
 * Every problem with a linked-list trace (empty = valid). Shared by every linked-list operation's tests:
 *   - every step carries a deeply frozen snapshot that passes the structural rules; the first and last are stable
 *     (well-formed) lists
 *   - ExecutionStep.state is exactly the values read from HEAD
 *   - a node id keeps its value for the whole trace and is never reused after it is freed; lastId never decreases
 *   - a step makes at most one link / HEAD / TAIL change, and `changed` describes exactly that change (or is absent)
 */
export function listTraceProblems(steps: ExecutionStep[]): string[] {
  const problems: string[] = [];
  const valueOf = new Map<string, number>();
  const freed = new Set<string>();
  steps.forEach((s, k) => {
    const at = `step ${k} (${s.type}/${s.codeRef ?? '—'})`;
    if (s.id !== k) problems.push(`${at}: id ${s.id}`);
    const list = s.list;
    if (!list) {
      problems.push(`${at}: no list snapshot`);
      return;
    }
    if (!deepFrozen(list)) problems.push(`${at}: snapshot is not frozen`);
    const stable = k === 0 || k === steps.length - 1;
    for (const p of validateListSnapshot(list, { stable })) problems.push(`${at}: ${p}`);
    let fromHead: number[] | null = null;
    try {
      fromHead = valuesFromHead(list);
    } catch {
      /* reported by validateListSnapshot */
    }
    if (fromHead && JSON.stringify(s.state) !== JSON.stringify(fromHead)) {
      problems.push(`${at}: state ${JSON.stringify(s.state)} != values from HEAD ${JSON.stringify(fromHead)}`);
    }
    for (const n of list.nodes) {
      if (freed.has(n.id)) problems.push(`${at}: freed node id ${n.id} is used again`);
      if (valueOf.has(n.id) && valueOf.get(n.id) !== n.value) problems.push(`${at}: node ${n.id} changed value ${valueOf.get(n.id)} → ${n.value}`);
      valueOf.set(n.id, n.value);
    }
    const prev = steps[k - 1]?.list;
    if (prev) {
      if (list.lastId < prev.lastId) problems.push(`${at}: lastId went down ${prev.lastId} → ${list.lastId}`);
      for (const n of prev.nodes) if (!list.nodes.some(m => m.id === n.id)) freed.add(n.id);
      const diff = listDiff(prev, list);
      if (diff.length > 1) problems.push(`${at}: ${diff.length} link/HEAD/TAIL changes in one step: ${JSON.stringify(diff)}`);
      if (diff.length === 1 && JSON.stringify(list.changed) !== JSON.stringify(diff[0])) {
        problems.push(`${at}: changed ${JSON.stringify(list.changed)} != actual ${JSON.stringify(diff[0])}`);
      }
      if (diff.length === 0 && list.changed) problems.push(`${at}: changed ${JSON.stringify(list.changed)} but no link/HEAD/TAIL changed`);
    } else if (list.changed) {
      problems.push(`${at}: the first step reports a change`);
    }
  });
  return problems;
}

export function expectValidListTrace(steps: ExecutionStep[], label = 'trace') {
  expect(listTraceProblems(steps), label).toEqual([]);
}
