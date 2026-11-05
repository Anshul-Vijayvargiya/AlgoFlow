import React, { useMemo } from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, TreeView } from '../../types/algorithm';
import { layoutTree } from '../../engine/tree/binaryTree';

interface TreeVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/** column width, row height and node radius of the drawing, in px (one column per node, one row per level) */
const COL = 46;
const ROW = 66;
const R = 17;
const PAD = 26;

/** a tree deeper than this gets shorter rows, so a skewed BST (one node per level) stays on screen */
const COMPACT_AFTER_LEVELS = 6;
const COMPACT_ROW = 46;

/**
 * traversals: current, visited, waiting, unvisited; building a BST: current, path, inserted, duplicate, unvisited;
 * Print in Range: current, visited (printed), outside, pruned, waiting (its call is in progress), unvisited
 */
type NodeState = 'current' | 'visited' | 'waiting' | 'unvisited' | 'path' | 'inserted' | 'duplicate' | 'outside' | 'pruned';

const NODE_TONE: Record<NodeState, { circle: string; text: string }> = {
  current: { circle: 'fill-amber-500/25 stroke-amber-400', text: 'fill-amber-200' },
  visited: { circle: 'fill-emerald-500/20 stroke-emerald-500', text: 'fill-emerald-300' },
  waiting: { circle: 'fill-sky-500/15 stroke-sky-400', text: 'fill-sky-200' },
  unvisited: { circle: 'fill-slate-900 stroke-slate-600', text: 'fill-slate-200' },
  path: { circle: 'fill-sky-500/15 stroke-sky-400', text: 'fill-sky-200' },
  inserted: { circle: 'fill-emerald-500/20 stroke-emerald-500', text: 'fill-emerald-300' },
  duplicate: { circle: 'fill-rose-500/20 stroke-rose-400', text: 'fill-rose-200' },
  outside: { circle: 'fill-rose-500/15 stroke-rose-400', text: 'fill-rose-200' },
  pruned: { circle: 'fill-slate-900/40 stroke-slate-600', text: 'fill-slate-400' },
};

/** how each state is said (the colour is never the only signal) */
const STATE_TEXT: Record<NodeState, string> = {
  current: 'current',
  visited: 'visited',
  waiting: 'waiting',
  unvisited: 'not visited yet',
  path: 'on the search path',
  inserted: 'just inserted',
  duplicate: 'equal to the value (skipped)',
  outside: 'checked: outside the range, not printed',
  pruned: 'skipped: its subtree cannot hold a value in range',
};
/** building a BST, a node outside the search is simply part of the tree; in a range walk a visited node was printed */
const stateText = (s: NodeState, building: boolean, ranging = false) =>
  building && s === 'unvisited' ? 'in the tree' : ranging && s === 'visited' ? 'printed' : ranging && s === 'waiting' ? 'its call is waiting' : STATE_TEXT[s];

const ordinal = (k: number) => `${k}${k % 10 === 1 && k % 100 !== 11 ? 'st' : k % 10 === 2 && k % 100 !== 12 ? 'nd' : k % 10 === 3 && k % 100 !== 13 ? 'rd' : 'th'}`;

/**
 * the state a node is drawn in. Traversals: what this step works on, then what was visited, then what waits in the
 * stack / queue. Building a BST: the node just inserted or found equal, then the one being compared, then the nodes
 * the value has passed.
 */
function nodeStates(view: TreeView): Record<string, NodeState> {
  const build = view.build;
  if (build) {
    const path = new Set(build.path);
    return Object.fromEntries(
      view.nodes.map(n => [
        n.id,
        n.id === build.inserted ? 'inserted' : n.id === build.duplicate ? 'duplicate' : n.id === view.current ? 'current' : path.has(n.id) ? 'path' : 'unvisited',
      ])
    );
  }
  const range = view.range;
  if (range) {
    const printed = new Set(view.visited);
    const outside = new Set(range.outside);
    const pruned = new Set(range.pruned);
    const inCall = new Set(range.calls.flatMap(c => (c.node ? [c.node] : [])));
    return Object.fromEntries(
      view.nodes.map(n => [
        n.id,
        n.id === view.current ? 'current' : printed.has(n.id) ? 'visited' : outside.has(n.id) ? 'outside' : pruned.has(n.id) ? 'pruned' : inCall.has(n.id) ? 'waiting' : 'unvisited',
      ])
    );
  }
  const waiting = new Set([...(view.stack?.items ?? []), ...(view.queue?.items ?? [])]);
  const visited = new Set(view.visited);
  return Object.fromEntries(
    view.nodes.map(n => [n.id, n.id === view.current ? 'current' : visited.has(n.id) ? 'visited' : waiting.has(n.id) ? 'waiting' : 'unvisited'])
  );
}

const ACTION_TEXT = { push: 'pushed', pop: 'popped', peek: 'peeked', enqueue: 'enqueued', dequeue: 'dequeued' } as const;

/**
 * Tree algorithms (visual: 'tree'): the tree drawn with its edges, each node in its state (current, visited with its
 * order, waiting in the stack / queue, not visited yet), the pointer variables at their nodes, the stack or queue and
 * the output so far. Building a BST (tree.build), the tree is the one built so far: the node being compared, the
 * nodes the value has passed, the node just inserted or found equal, the empty child it goes into (dashed) and the
 * input in insertion order replace the traversal's states and output. Everything shown comes from the step itself
 * (ExecutionStep.tree).
 */
export const TreeVisualizer: React.FC<TreeVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.tree;
  const layout = useMemo(() => (view ? layoutTree(view) : {}), [view]);
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const byId = new Map(view.nodes.map(n => [n.id, n]));
  const states = nodeStates(view);
  const order = new Map(view.visited.map((id, k) => [id, k + 1]));
  const build = view.build;
  const building = Boolean(build);
  const onPath = build ? new Set(build.path) : null;
  // Print in Range: the range, the nodes skipped by pruning and the calls in progress
  const range = view.range;
  // Building a BST: the empty child the value goes into, drawn as a dashed node half a column beside its parent. (A
  // missing left child's inorder neighbour on that side is an ancestor, higher up, so nothing is drawn there.)
  const slot = build?.slot && build.slot.parent !== null && build.index !== null ? { parent: build.slot.parent, side: build.slot.side, value: build.values[build.index] } : null;
  const slotDepth = slot ? layout[slot.parent].depth + 1 : 0;
  const levels = Math.max(0, slot ? slotDepth + 1 : 0, ...Object.values(layout).map(p => p.depth + 1));
  const row = levels > COMPACT_AFTER_LEVELS ? COMPACT_ROW : ROW;
  const width = view.nodes.length * COL + 2 * PAD;
  const height = levels * row + 2 * PAD;
  const at = (id: string) => ({ x: PAD + layout[id].x * COL + COL / 2, y: PAD + layout[id].depth * row + R });
  const slotAt = slot ? { x: at(slot.parent).x + (slot.side === 'left' ? -COL / 2 : COL / 2), y: PAD + slotDepth * row + R } : null;
  const pointersAt = new Map<string, string[]>();
  for (const p of view.pointers ?? []) if (p.node) pointersAt.set(p.node, [...(pointersAt.get(p.node) ?? []), p.name]);
  const nullPointers = (view.pointers ?? []).filter(p => p.node === null).map(p => p.name);
  const container = view.stack ? { kind: 'stack' as const, ...view.stack } : view.queue ? { kind: 'queue' as const, ...view.queue } : null;
  // Recursive build: the base case's new node, returned but not linked yet, is drawn solid in the empty child's place
  const created = build?.created ?? null;
  const value = (id: string) => (id === created?.id ? created.value : byId.get(id)!.value);

  return (
    <div className="w-full flex flex-col gap-2" data-testid="tree-visualizer">
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col items-center gap-4">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="tree-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}

        {view.nodes.length === 0 ? (
          <p data-testid="tree-empty" className="relative z-10 py-10 text-sm font-mono text-slate-400">
            The tree is empty (root = null).
            {build?.slot?.side === 'root' &&
              build.index !== null &&
              (created ? ` New node ${created.value} created: it becomes the root once it is returned.` : ` ${build.values[build.index]} will become the root.`)}
          </p>
        ) : (
          // a wide tree scrolls sideways here instead of widening the page; focusable so keyboard users can scroll it
          <div tabIndex={0} role="region" aria-label="Binary tree" data-testid="tree-scroll" className="relative z-10 max-w-full overflow-x-auto rounded-lg">
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" data-testid="tree-svg" className="block mx-auto">
              {view.nodes.flatMap(n =>
                (['left', 'right'] as const).flatMap(side => {
                  const child = n[side];
                  if (!child) return [];
                  const a = at(n.id);
                  const b = at(child);
                  // traversals: the edges into visited nodes; building: the edges the value has walked down
                  const reached = onPath
                    ? onPath.has(n.id) && (onPath.has(child) || child === build!.inserted)
                    : range
                      ? ['visited', 'current', 'outside', 'waiting'].includes(states[child])
                      : states[child] === 'visited' || states[child] === 'current';
                  // Print in Range: the edge into a pruned subtree is dashed (never walked)
                  const cut = range !== undefined && states[child] === 'pruned';
                  return [
                    <line
                      key={`${n.id}-${child}`}
                      data-edge={`${n.id}-${child}`}
                      data-side={side}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      strokeWidth={2}
                      strokeDasharray={cut ? '4 4' : undefined}
                      data-pruned={cut ? 'true' : undefined}
                      className={reached ? 'stroke-emerald-500/70' : cut ? 'stroke-slate-700' : 'stroke-slate-600'}
                    />,
                  ];
                })
              )}
              {view.nodes.map(n => {
                const { x, y } = at(n.id);
                const s = states[n.id];
                const visit = order.get(n.id);
                const names = pointersAt.get(n.id);
                return (
                  <g
                    key={n.id}
                    data-node-id={n.id}
                    data-value={n.value}
                    data-state={s}
                    data-x={layout[n.id].x}
                    data-depth={layout[n.id].depth}
                    data-visit-order={visit ?? ''}
                    data-pointers={names?.join(',') ?? ''}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={R}
                      strokeWidth={s === 'current' ? 3 : 2}
                      strokeDasharray={s === 'pruned' ? '4 3' : undefined}
                      style={{ transitionDuration: `${transitionMs}ms` }}
                      className={`transition-colors motion-reduce:transition-none ${NODE_TONE[s].circle}`}
                    />
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className={`text-[12px] font-mono font-bold ${NODE_TONE[s].text}`}>
                      {n.value}
                    </text>
                    {visit !== undefined && (
                      <text x={x + R + 2} y={y - R + 2} className="text-[10px] font-mono font-bold fill-emerald-300">
                        {visit}
                      </text>
                    )}
                    {names && (
                      <text x={x} y={y + R + 13} textAnchor="middle" className="text-[10px] font-mono font-bold fill-cyan-300">
                        {names.join(', ')}
                      </text>
                    )}
                  </g>
                );
              })}
              {slot && slotAt && (
                <g data-testid="tree-slot" data-parent={slot.parent} data-side={slot.side} data-value={slot.value} data-created={created ? 'true' : 'false'}>
                  <line x1={at(slot.parent).x} y1={at(slot.parent).y} x2={slotAt.x} y2={slotAt.y} strokeWidth={2} strokeDasharray="4 3" className="stroke-amber-400/70" />
                  {/* dashed: the empty child; solid: the node created for it, linked once its call returns */}
                  <circle
                    cx={slotAt.x}
                    cy={slotAt.y}
                    r={R - 2}
                    strokeWidth={2}
                    strokeDasharray={created ? undefined : '4 3'}
                    className={created ? 'fill-amber-500/25 stroke-amber-400' : 'fill-amber-500/10 stroke-amber-400'}
                  />
                  <text x={slotAt.x} y={slotAt.y} textAnchor="middle" dominantBaseline="central" className="text-[11px] font-mono font-bold fill-amber-200">
                    {slot.value}
                  </text>
                </g>
              )}
            </svg>
          </div>
        )}

        {/* the tree for assistive technology: each node, its children and its state */}
        <ul className="sr-only" aria-label="Nodes at this step">
          {slot && (
            <li>
              {created ? `New node ${slot.value} created for` : `${slot.value} goes in`} the empty {slot.side} child of node {value(slot.parent)}.
            </li>
          )}
          {view.nodes.map(n => (
            <li key={n.id}>
              Node {n.value}: {stateText(states[n.id], building, Boolean(range))}
              {order.has(n.id) ? ` (${ordinal(order.get(n.id)!)} visited)` : ''}
              {pointersAt.has(n.id) ? `, ${pointersAt.get(n.id)!.join(' and ')} points here` : ''}; left child {n.left ? value(n.left) : 'none'}, right child{' '}
              {n.right ? value(n.right) : 'none'}.
            </li>
          ))}
        </ul>

        <div className="relative z-10 w-full flex flex-col gap-2 text-[11px] font-mono">
          {container && (
            <div className="flex flex-wrap items-center gap-2" data-testid={`tree-${container.kind}`} data-action={container.action ?? ''}>
              <span className="text-slate-400">{container.kind === 'stack' ? 'stack (bottom → top):' : 'queue (front → back):'}</span>
              <ol aria-label={`${container.kind === 'stack' ? 'Stack, bottom to top' : 'Queue, front to back'}: ${container.items.length ? container.items.map(value).join(', ') : 'empty'}`} className="flex flex-wrap items-center gap-1">
                {container.items.length === 0 && <li className="text-slate-500">empty</li>}
                {container.items.map((id, k) => {
                  const end = container.kind === 'stack' ? k === container.items.length - 1 : k === 0;
                  return (
                    <li
                      key={`${id}-${k}`}
                      data-item={id}
                      data-end={end ? 'true' : 'false'}
                      className={`min-w-7 h-7 px-1 flex items-center justify-center rounded-md border font-bold ${
                        end ? 'bg-sky-500/20 border-sky-400 text-sky-200' : 'bg-slate-900/80 border-slate-700 text-slate-200'
                      }`}
                    >
                      {value(id)}
                      {end && <span className="sr-only"> ({container.kind === 'stack' ? 'top' : 'front'})</span>}
                    </li>
                  );
                })}
              </ol>
              {container.action && <span className="font-bold text-amber-200">{ACTION_TEXT[container.action]}</span>}
            </div>
          )}
          {nullPointers.length > 0 && (
            <p data-testid="tree-null-pointers" className="text-slate-400">
              {nullPointers.map(n => `${n} = null`).join(', ')}
            </p>
          )}
          {range && (
            <>
              <p data-testid="tree-range" data-low={range.low} data-high={range.high} className="text-slate-300">
                <span className="text-slate-400">range: </span>
                <span className="font-bold text-cyan-300">
                  [{range.low}, {range.high}]
                </span>
                <span className="text-slate-400"> (low ≤ value ≤ high)</span>
              </p>
              {/* the printInRange calls in progress, outermost first; a deep stack scrolls with the running call in view */}
              <div className="flex flex-col gap-1" data-testid="tree-calls" data-depth={range.calls.length}>
                <span className="text-slate-400">call stack (outermost first):</span>
                <div tabIndex={0} role="region" aria-label="Call stack" className="max-h-44 overflow-y-auto flex flex-col-reverse rounded-md">
                  <ol aria-label={`Calls in progress: ${range.calls.length || 'none'}`} className="flex flex-col gap-0.5">
                    {range.calls.length === 0 && <li className="text-slate-500">no call in progress</li>}
                    {range.calls.map((f, k) => {
                      const active = k === range.calls.length - 1;
                      return (
                        <li
                          key={k}
                          data-frame={k}
                          data-frame-status={active ? 'active' : 'waiting'}
                          data-frame-node={f.node ?? 'null'}
                          data-frame-via={f.via}
                          style={{ marginLeft: `${Math.min(k, 8) * 10}px` }}
                          className={`w-fit px-1.5 py-0.5 rounded border ${active ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold' : 'bg-slate-900/80 border-slate-700 text-slate-300'}`}
                        >
                          {k > 0 && <span aria-hidden="true">└─ </span>}
                          printInRange({f.via === 'root' ? 'root' : `node.${f.via}`} = {f.node === null ? 'null' : value(f.node)}, {range.low}, {range.high})
                          {f.node === null && <span className="text-amber-300"> — empty subtree</span>}
                          {!active && <span className="text-slate-500"> (waiting)</span>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
              <p data-testid="tree-pruned" className="text-slate-400">
                skipped by pruning:{' '}
                {range.pruned.length ? <span className="text-slate-300">{range.pruned.map(value).join(', ')}</span> : <span className="text-slate-500">none yet</span>}
              </p>
            </>
          )}
          {build?.calls && (
            // the recursive build: the insert calls in progress, outermost first. A deep stack scrolls, and starts
            // scrolled to its end (column-reverse) so the running call is always in view.
            <div className="flex flex-col gap-1" data-testid="tree-calls" data-depth={build.calls.length}>
              <span className="text-slate-400">call stack (outermost first):</span>
              <div tabIndex={0} role="region" aria-label="Call stack" className="max-h-44 overflow-y-auto flex flex-col-reverse rounded-md">
                <ol aria-label={`Calls in progress: ${build.calls.length || 'none'}`} className="flex flex-col gap-0.5">
                  {build.calls.length === 0 && <li className="text-slate-500">buildBST — no insert call in progress</li>}
                  {build.calls.map((f, k) => {
                    const last = k === build.calls!.length - 1;
                    const status = last ? (f.returns ? 'returning' : 'active') : 'waiting';
                    const arg = `${f.via === 'root' ? 'root' : `node.${f.via}`} = ${f.node === null ? 'null' : value(f.node)}`;
                    const v = build.index !== null ? build.values[build.index] : '';
                    return (
                      <li
                        key={k}
                        data-frame={k}
                        data-frame-status={status}
                        data-frame-node={f.node ?? 'null'}
                        data-frame-via={f.via}
                        style={{ marginLeft: `${Math.min(k, 8) * 10}px` }}
                        className={`w-fit px-1.5 py-0.5 rounded border ${
                          status === 'active'
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                            : status === 'returning'
                              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                              : 'bg-slate-900/80 border-slate-700 text-slate-300'
                        }`}
                      >
                        {k > 0 && <span aria-hidden="true">└─ </span>}
                        insert({arg}, {v})
                        {f.node === null && !f.returns && <span className="text-amber-300"> — base case</span>}
                        {f.returns && <span> ↩ returns {f.returns === created?.id ? `new node ${value(f.returns)}` : `node ${value(f.returns)}`}</span>}
                        {status === 'waiting' && <span className="text-slate-500"> (waiting)</span>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          )}
          {build ? (
            // building a BST: the input in insertion order — inserted, skipped as a duplicate, current, still to come
            <div className="flex flex-wrap items-center gap-2" data-testid="tree-input">
              <span className="text-slate-400">insert in order:</span>
              <ol
                aria-label={`Values to insert: ${build.values.length ? build.values.join(', ') : 'none'}${build.index !== null ? `; now inserting ${build.values[build.index]}` : ''}`}
                className="flex flex-wrap items-center gap-1"
              >
                {build.values.length === 0 && <li className="text-slate-500">[ ]</li>}
                {build.values.map((v, k) => {
                  // no index: before the first value nothing is handled; on the last step (with the result) everything is
                  const handled = build.index ?? (view.result ? build.values.length : 0);
                  const status = k === build.index ? 'current' : build.skipped.includes(k) ? 'skipped' : k < handled ? 'done' : 'pending';
                  return (
                    <li
                      key={k}
                      data-input-index={k}
                      data-input-status={status}
                      className={`min-w-7 h-7 px-1 flex items-center justify-center rounded-md border font-bold ${
                        status === 'current'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : status === 'done'
                            ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                            : status === 'skipped'
                              ? 'bg-rose-500/10 border-rose-400/50 text-rose-300 line-through'
                              : 'bg-slate-900/80 border-slate-700 text-slate-400'
                      }`}
                    >
                      {v}
                      {status === 'skipped' && <span className="sr-only"> (duplicate, skipped)</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
          <div className="flex flex-wrap items-center gap-2" data-testid="tree-output">
            <span className="text-slate-400">{range ? 'printed:' : 'output:'}</span>
            <ol aria-label={`Output so far: ${view.visited.length ? view.visited.map(value).join(', ') : 'nothing yet'}`} className="flex flex-wrap items-center gap-1">
              {view.visited.length === 0 && <li className="text-slate-500">[ ]</li>}
              {view.visited.map((id, k) => (
                <li
                  key={id}
                  data-output={value(id)}
                  className={`min-w-7 h-7 px-1 flex items-center justify-center rounded-md border font-bold ${
                    k === view.visited.length - 1 && id === view.current ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  }`}
                >
                  {value(id)}
                </li>
              ))}
            </ol>
          </div>
          )}
        </div>
      </div>

      {view.result && (
        <div
          role="status"
          data-testid="tree-result"
          className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
        >
          <Equal className="w-4 h-4 shrink-0" aria-hidden="true" />
          {view.result.text}
        </div>
      )}
    </div>
  );
};
