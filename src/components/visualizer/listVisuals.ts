/**
 * What the linked-list view draws for one step, derived ONLY from that step's snapshot (and, to mark nodes that were
 * just created or released, the previous step's snapshot). Nothing here runs or re-derives algorithm logic: the
 * engine's snapshot is the single source of truth, and this is layout over it.
 */
import type { ExecutionStep, ListChange, ListSnapshot } from '../../types/algorithm';
import { chainFrom, nodeById } from '../../engine/linkedList/listSnapshot';

export type ListNodeRole = 'default' | 'active' | 'compare' | 'found';

export interface ListNodeView {
  id: string;
  value: number;
  /** id of the node its next points to, or null for NULL */
  next: string | null;
  /** position counted from HEAD, or null when the node is not reachable from HEAD */
  position: number | null;
  role: ListNodeRole;
  /** not in the previous step's snapshot: created by this step */
  isNew: boolean;
  head: boolean;
  tail: boolean;
  /** named code variables (curr, prev, next, node, temp…) that point to this node */
  pointers: string[];
  /** this node's next pointer is the link this step changed */
  linkChanged: boolean;
}

/** A run of nodes that HEAD does not reach (a node outside the list, or the part a reversal has cut off). */
export interface ListSegmentView {
  nodes: ListNodeView[];
  /** where the last node's next points: NULL, or a node of the HEAD chain */
  end: { kind: 'null' } | { kind: 'node'; id: string; value: number; position: number };
  /** detached: the operation took the node out of the list (or has not put it in yet); unreachable: cut off from HEAD */
  reason: 'detached' | 'unreachable';
}

export interface ListView {
  /** the list as read from HEAD, in order */
  chain: ListNodeView[];
  segments: ListSegmentView[];
  /** named variables that are NULL (drawn at the NULL terminator) */
  nullPointers: string[];
  headNull: boolean;
  tailNull: boolean;
  /** the link / HEAD / TAIL change made by this step, from the snapshot's `changed` */
  change: ListChange | null;
  /** nodes in the previous snapshot that are gone now (freed / garbage) */
  released: { id: string; value: number }[];
  /** one-sentence text description for assistive technology */
  summary: string;
}

const pointersTo = (s: ListSnapshot, id: string | null) =>
  Object.entries(s.pointers)
    .filter(([, v]) => v === id)
    .map(([k]) => k);

/** Position of the found node on a final step, read from the trace's own `found` step (the step before it). */
export function listFoundPosition(steps: ExecutionStep[], index: number): number | null {
  const step = steps[index];
  const prev = steps[index - 1];
  if (step?.type !== 'complete' || prev?.type !== 'found') return null;
  return prev.indices?.[0] ?? null;
}

export function deriveListView(
  step: ExecutionStep,
  options: { previous?: ExecutionStep; foundPosition?: number | null } = {}
): ListView | null {
  const s = step.list;
  if (!s) return null;
  const before = options.previous?.list;
  const known = before ? new Set(before.nodes.map(n => n.id)) : null;
  const positions = new Set(step.indices ?? []);
  const role: ListNodeRole = step.type === 'found' ? 'found' : step.comparedValues ? 'compare' : 'active';
  const change = s.changed ?? null;

  const chainIds = chainFrom(s, s.head);
  const posOf = new Map(chainIds.map((id, k) => [id, k]));
  const view = (id: string): ListNodeView => {
    const n = nodeById(s, id)!;
    const position = posOf.get(id) ?? null;
    let r: ListNodeRole = 'default';
    if (position !== null && positions.has(position)) r = role;
    if (position !== null && options.foundPosition === position) r = 'found';
    return {
      id,
      value: n.value,
      next: n.next,
      position,
      role: r,
      isNew: known !== null && !known.has(id),
      head: s.head === id,
      tail: s.tail === id,
      pointers: pointersTo(s, id),
      linkChanged: change?.kind === 'next' && change.node === id,
    };
  };

  const chain = chainIds.map(view);

  // nodes HEAD does not reach, grouped into runs that follow next links
  const rest = s.nodes.filter(n => !posOf.has(n.id));
  const restIds = new Set(rest.map(n => n.id));
  const pointedFromRest = new Set(rest.map(n => n.next).filter((x): x is string => x !== null && restIds.has(x)));
  const segments: ListSegmentView[] = [];
  const placed = new Set<string>();
  for (const startNode of rest.filter(n => !pointedFromRest.has(n.id))) {
    const nodes: ListNodeView[] = [];
    let id: string | null = startNode.id;
    while (id !== null && restIds.has(id) && !placed.has(id)) {
      placed.add(id);
      nodes.push(view(id));
      id = nodeById(s, id)!.next;
    }
    const end: ListSegmentView['end'] =
      id !== null && posOf.has(id) ? { kind: 'node', id, value: nodeById(s, id)!.value, position: posOf.get(id)! } : { kind: 'null' };
    segments.push({ nodes, end, reason: s.detached.includes(startNode.id) ? 'detached' : 'unreachable' });
  }

  const released = before ? before.nodes.filter(n => !s.nodes.some(m => m.id === n.id)).map(n => ({ id: n.id, value: n.value })) : [];
  const nullPointers = pointersTo(s, null);

  const name = (id: string | null) => {
    if (id === null) return 'NULL';
    const k = posOf.get(id);
    return k === undefined ? `node ${nodeById(s, id)!.value} (outside the list)` : `node ${nodeById(s, id)!.value} at position ${k}`;
  };
  const parts = [
    chain.length ? `HEAD → ${chain.map(n => n.value).join(' → ')} → NULL` : 'HEAD → NULL, the list is empty',
    `TAIL → ${name(s.tail)}`,
    ...segments.map(g => `${g.reason === 'detached' ? 'Outside the list' : 'Not reachable from HEAD'}: ${g.nodes.map(n => n.value).join(' → ')}`),
    ...Object.entries(s.pointers).map(([k, v]) => `${k} → ${name(v)}`),
  ];

  return {
    chain,
    segments,
    nullPointers,
    headNull: s.head === null,
    tailNull: s.tail === null,
    change,
    released,
    summary: `${parts.join('. ')}.`,
  };
}

/** "4 → 7 → NULL" (or "NULL" for an empty list): the list read from HEAD, for text read-outs. */
export const listText = (values: number[]) => (values.length ? `${values.join(' → ')} → NULL` : 'NULL (empty)');
