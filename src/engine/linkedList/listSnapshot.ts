/**
 * Immutable linked-list snapshots for execution traces.
 *
 * Every helper returns a NEW frozen snapshot and never touches its argument, so a trace is a list of independent
 * frozen values: stepping backward or forward only changes which snapshot is shown, never a snapshot's contents.
 * Unchanged nodes are shared between snapshots (they are frozen, so sharing is safe).
 *
 * Node ids are `n1, n2, …` in creation order and are never reused, even after a node is freed.
 * `changed` records the single link / HEAD / TAIL change made by the step that produced the snapshot. attach / detach
 * keep it (they only record list membership as part of the same statement); every other helper clears it, so a
 * snapshot never carries a stale change from an earlier statement.
 */
import type { ListChange, ListNodeSnapshot, ListSnapshot } from '../../types/algorithm';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function freeze(s: Mutable<ListSnapshot>): ListSnapshot {
  if (s.changed === undefined) delete s.changed;
  for (const n of s.nodes) Object.freeze(n);
  Object.freeze(s.nodes);
  Object.freeze(s.pointers);
  Object.freeze(s.detached);
  if (s.changed) Object.freeze(s.changed);
  return Object.freeze(s);
}

/** A copy of `s` with the given fields replaced; `changed` is dropped unless given. */
function next(s: ListSnapshot, patch: Partial<Mutable<ListSnapshot>>): ListSnapshot {
  const { changed: _drop, ...rest } = s;
  return freeze({ ...rest, nodes: [...s.nodes], pointers: { ...s.pointers }, detached: [...s.detached], ...patch });
}

const idNumber = (id: string) => Number(id.slice(1));

function requireNode(s: ListSnapshot, id: string, what: string): ListNodeSnapshot {
  const node = s.nodes.find(n => n.id === id);
  if (!node) throw new Error(`${what}: node ${id} does not exist`);
  return node;
}
const requireRef = (s: ListSnapshot, id: string | null, what: string) => {
  if (id !== null) requireNode(s, id, what);
};

/** The empty list. */
export function emptyList(): ListSnapshot {
  return freeze({ nodes: [], head: null, tail: null, pointers: {}, detached: [], lastId: 0 });
}

/** A well-formed list holding `values` in order: n1 → n2 → … → NULL, HEAD = n1, TAIL = the last node. */
export function listFromValues(values: readonly number[]): ListSnapshot {
  const nodes = values.map((value, k) => ({ id: `n${k + 1}`, value, next: k + 1 < values.length ? `n${k + 2}` : null }));
  return freeze({
    nodes,
    head: nodes.length ? nodes[0].id : null,
    tail: nodes.length ? nodes[nodes.length - 1].id : null,
    pointers: {},
    detached: [],
    lastId: nodes.length,
  });
}

/** Allocates a new node (next = NULL) outside the list; returns the snapshot and the new node's id. */
export function createNode(s: ListSnapshot, value: number): { snapshot: ListSnapshot; id: string } {
  const id = `n${s.lastId + 1}`;
  return {
    id,
    snapshot: next(s, { nodes: [...s.nodes, { id, value, next: null }], detached: [...s.detached, id], lastId: s.lastId + 1 }),
  };
}

/** node.next = to (assigning the value it already has records no change) */
export function setNext(s: ListSnapshot, node: string, to: string | null): ListSnapshot {
  const from = requireNode(s, node, 'setNext').next;
  requireRef(s, to, 'setNext');
  const change: ListChange | undefined = from === to ? undefined : { kind: 'next', node, from, to };
  return next(s, { nodes: s.nodes.map(n => (n.id === node ? { ...n, next: to } : n)), changed: change });
}

/** HEAD = to (assigning the value it already has records no change) */
export function setHead(s: ListSnapshot, to: string | null): ListSnapshot {
  requireRef(s, to, 'setHead');
  return next(s, { head: to, changed: s.head === to ? undefined : { kind: 'head', from: s.head, to } });
}

/** TAIL = to (assigning the value it already has records no change) */
export function setTail(s: ListSnapshot, to: string | null): ListSnapshot {
  requireRef(s, to, 'setTail');
  return next(s, { tail: to, changed: s.tail === to ? undefined : { kind: 'tail', from: s.tail, to } });
}

/** A named code variable (curr, prev, …) now points at `to` (null = NULL). */
export function setPointer(s: ListSnapshot, name: string, to: string | null): ListSnapshot {
  requireRef(s, to, `setPointer(${name})`);
  return next(s, { pointers: { ...s.pointers, [name]: to } });
}

/** The same list, with no change recorded: for a step that only reads it (a condition, a return). */
export function settle(s: ListSnapshot): ListSnapshot {
  return s.changed ? next(s, {}) : s;
}

/** The variable goes out of scope (it is no longer drawn). */
export function dropPointer(s: ListSnapshot, name: string): ListSnapshot {
  const { [name]: _gone, ...pointers } = s.pointers;
  return next(s, { pointers });
}

/**
 * The node is now part of the list (it is reachable through a link or HEAD set by the same or a later step).
 * Part of the same statement as that link change, so `changed` is kept.
 */
export function attach(s: ListSnapshot, id: string): ListSnapshot {
  requireNode(s, id, 'attach');
  return next(s, { detached: s.detached.filter(d => d !== id), changed: s.changed });
}

/**
 * The node has been unlinked from the list but still exists (e.g. before free / before it becomes garbage).
 * Part of the same statement as the unlinking change, so `changed` is kept.
 */
export function detach(s: ListSnapshot, id: string): ListSnapshot {
  requireNode(s, id, 'detach');
  return next(s, { detached: s.detached.includes(id) ? [...s.detached] : [...s.detached, id], changed: s.changed });
}

/**
 * free(node) / the node becomes garbage: it disappears. It must already be unreachable (no link, HEAD or TAIL points to
 * it). Named variables that still held it are dropped rather than shown as dangling pointers.
 */
export function removeNode(s: ListSnapshot, id: string): ListSnapshot {
  requireNode(s, id, 'removeNode');
  if (s.head === id || s.tail === id || s.nodes.some(n => n.next === id)) {
    throw new Error(`removeNode: node ${id} is still referenced by HEAD, TAIL or a next link`);
  }
  const pointers = Object.fromEntries(Object.entries(s.pointers).filter(([, v]) => v !== id));
  return next(s, {
    nodes: s.nodes.filter(n => n.id !== id),
    detached: s.detached.filter(d => d !== id),
    pointers,
  });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const nodeById = (s: ListSnapshot, id: string) => s.nodes.find(n => n.id === id);

/** Node ids reachable from `start` by following next, in order (stops at NULL; throws on a cycle). */
export function chainFrom(s: ListSnapshot, start: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let id = start; id !== null; ) {
    if (seen.has(id)) throw new Error(`cycle through node ${id}`);
    seen.add(id);
    out.push(id);
    const node = nodeById(s, id);
    if (!node) break;
    id = node.next;
  }
  return out;
}

/** The values read from HEAD to NULL: what ExecutionStep.state holds for a linked-list step. */
export const valuesFromHead = (s: ListSnapshot): number[] => chainFrom(s, s.head).map(id => nodeById(s, id)!.value);

/** Position of a node counted from HEAD (0-based), or -1 when it is not on the HEAD chain. */
export const indexFromHead = (s: ListSnapshot, id: string) => chainFrom(s, s.head).indexOf(id);

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Problems with a snapshot (empty = valid).
 *
 * Always (every step):  unique ids; every link, HEAD, TAIL and pointer names an existing node or NULL; no cycles;
 *   every node is on the HEAD chain, held by TAIL or a named pointer, or detached (no orphan the program has lost
 *   track of); a detached node is not on the HEAD chain; `changed` refers to real nodes.
 * `stable: true` (start and end of an operation): additionally a well-formed list — HEAD and TAIL are both NULL or
 *   both set, the HEAD chain ends at TAIL, whose next is NULL, and nothing is detached.
 *
 * HEAD/TAIL agreement is a stable-only rule on purpose: code updates them in two statements (e.g. deleting the only
 * node sets head = NULL, then tail = NULL), so for one step they legitimately disagree. That is the program's real
 * state at that step, not a stale value.
 */
export function validateListSnapshot(s: ListSnapshot, opts: { stable?: boolean } = {}): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const n of s.nodes) {
    if (!/^n\d+$/.test(n.id)) problems.push(`node id "${n.id}" is not of the form n<number>`);
    if (ids.has(n.id)) problems.push(`duplicate node id ${n.id}`);
    ids.add(n.id);
    if (!Number.isInteger(n.value)) problems.push(`node ${n.id} has a non-integer value ${n.value}`);
    if (idNumber(n.id) > s.lastId) problems.push(`node ${n.id} is numbered above lastId ${s.lastId}`);
  }
  const exists = (id: string | null) => id === null || ids.has(id);
  for (const n of s.nodes) if (!exists(n.next)) problems.push(`node ${n.id}.next points to missing node ${n.next}`);
  if (!exists(s.head)) problems.push(`HEAD points to missing node ${s.head}`);
  if (!exists(s.tail)) problems.push(`TAIL points to missing node ${s.tail}`);
  for (const [name, id] of Object.entries(s.pointers)) if (!exists(id)) problems.push(`pointer ${name} points to missing node ${id}`);
  for (const d of s.detached) if (!ids.has(d)) problems.push(`detached node ${d} does not exist`);
  if (problems.length) return problems; // the checks below follow links

  for (const n of s.nodes) {
    try {
      chainFrom(s, n.id);
    } catch (e) {
      problems.push((e as Error).message);
      return problems;
    }
  }

  const onList = new Set(chainFrom(s, s.head));
  for (const d of s.detached) if (onList.has(d)) problems.push(`detached node ${d} is on the HEAD chain`);
  const held = new Set<string>(onList);
  for (const id of [...Object.values(s.pointers), s.tail, ...s.detached]) {
    if (id !== null) for (const c of chainFrom(s, id)) held.add(c);
  }
  for (const n of s.nodes) if (!held.has(n.id)) problems.push(`node ${n.id} is unreachable (not on the list, not detached, no pointer holds it)`);

  if (s.changed) {
    const c = s.changed;
    if (c.kind === 'next' && !ids.has(c.node)) problems.push(`changed link names missing node ${c.node}`);
  }

  if (opts.stable) {
    const chain = [...onList];
    if ((s.head === null) !== (s.tail === null)) problems.push(`HEAD is ${s.head ?? 'NULL'} but TAIL is ${s.tail ?? 'NULL'}`);
    if (s.detached.length) problems.push(`stable list has detached nodes: ${s.detached.join(', ')}`);
    if (chain.length && chain[chain.length - 1] !== s.tail) problems.push(`TAIL is ${s.tail} but the list from HEAD ends at ${chain[chain.length - 1]}`);
    if (s.tail !== null && nodeById(s, s.tail)!.next !== null) problems.push(`TAIL ${s.tail} has a non-NULL next`);
    if (chain.length !== s.nodes.length) problems.push(`stable list has ${s.nodes.length} nodes but only ${chain.length} are reachable from HEAD`);
  }
  return problems;
}
