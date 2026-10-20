/**
 * Shared step builder for linked-list operation traces.
 *
 * Every step is emitted from the CURRENT snapshot, so `id`, `state` (values read from HEAD) and `list` are always
 * filled consistently: an operation cannot emit a step whose state and snapshot disagree.
 */
import type { ExecutionStep, ListSnapshot } from '../../types/algorithm';
import { defaultListIndex, lastListIndex } from '../inputParsing';
import { indexFromHead, nodeById, settle, valuesFromHead } from './listSnapshot';

export type ListStepFields = Omit<ExecutionStep, 'id' | 'state' | 'list'>;

export function createListTrace(initial: ListSnapshot) {
  const steps: ExecutionStep[] = [];
  let snap = initial;
  let fresh = true;
  return {
    steps,
    get snap() {
      return snap;
    },
    /** Replace the current snapshot (the result of a listSnapshot helper). */
    update(next: ListSnapshot) {
      snap = next;
      fresh = true;
    },
    /** A step not preceded by update() changed nothing, so it must not repeat the previous step's `changed`. */
    emit(fields: ListStepFields) {
      if (!fresh) snap = settle(snap);
      fresh = false;
      steps.push({ id: steps.length, state: valuesFromHead(snap), list: snap, ...fields });
    },
  };
}

/** HEAD-chain positions of the given nodes (nodes off the chain, and NULL, are skipped). */
export function positionsOf(s: ListSnapshot, ...ids: (string | null | undefined)[]): number[] {
  const out: number[] = [];
  for (const id of ids) {
    if (!id) continue;
    const k = indexFromHead(s, id);
    if (k >= 0 && !out.includes(k)) out.push(k);
  }
  return out;
}

/** "node 7 (position 2)", "node 9 (not in the list)" or "NULL": unambiguous even with duplicate values. */
export function describeNode(s: ListSnapshot, id: string | null): string {
  if (id === null) return 'NULL';
  const node = nodeById(s, id);
  if (!node) return 'NULL';
  const k = indexFromHead(s, id);
  return k >= 0 ? `node ${node.value} (position ${k})` : `node ${node.value} (not in the list)`;
}

/** The value a pointer currently refers to, for step variables; 'NULL' for NULL. */
export const valueAt = (s: ListSnapshot, id: string | null): number | 'NULL' => (id === null ? 'NULL' : nodeById(s, id)?.value ?? 'NULL');

/** Generators take a value only when it is a number; null is rejected (consistent with the search generators). */
export function readValueParam(params: Record<string, unknown> | undefined, name: string, fallback: number, op: string): number {
  const v = params?.value;
  if (v === null) throw new TypeError(`${op}: ${name} is null; pass a number or omit it.`);
  return v === undefined ? fallback : (v as number);
}

/**
 * The position for insert/delete at an index. The app rejects an invalid index before calling (validateAlgorithmInput),
 * so only a direct caller can pass one; the generator refuses it rather than tracing code that would crash. An omitted
 * index is the operation's default moved into range (defaultListIndex), as an omitted search target has a default.
 * insert: 0..length (length appends); delete: 0..length-1, so deleting from an empty list has no valid index.
 */
export function readIndexParam(
  params: Record<string, unknown> | undefined,
  spec: { defaultValue: number; bound: 'insert' | 'delete' },
  length: number,
  op: string
): number {
  const v = params?.index;
  if (v === null) throw new TypeError(`${op}: index is null; pass a number or omit it.`);
  const index = v === undefined ? defaultListIndex(spec, length) : (v as number);
  const last = lastListIndex(spec.bound, length);
  if (index === null) throw new RangeError(`${op}: the list is empty, so there is no node at any index.`);
  if (!Number.isInteger(index) || index < 0 || index > last) {
    throw new RangeError(`${op}: index ${index} is out of range for a list of ${length} node${length === 1 ? '' : 's'} (0 to ${last}).`);
  }
  return index;
}
