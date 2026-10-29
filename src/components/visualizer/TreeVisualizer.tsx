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

type NodeState = 'current' | 'visited' | 'waiting' | 'unvisited';

const NODE_TONE: Record<NodeState, { circle: string; text: string }> = {
  current: { circle: 'fill-amber-500/25 stroke-amber-400', text: 'fill-amber-200' },
  visited: { circle: 'fill-emerald-500/20 stroke-emerald-500', text: 'fill-emerald-300' },
  waiting: { circle: 'fill-sky-500/15 stroke-sky-400', text: 'fill-sky-200' },
  unvisited: { circle: 'fill-slate-900 stroke-slate-600', text: 'fill-slate-200' },
};

/** how each state is said (the colour is never the only signal) */
const STATE_TEXT: Record<NodeState, string> = { current: 'current', visited: 'visited', waiting: 'waiting', unvisited: 'not visited yet' };

const ordinal = (k: number) => `${k}${k % 10 === 1 && k % 100 !== 11 ? 'st' : k % 10 === 2 && k % 100 !== 12 ? 'nd' : k % 10 === 3 && k % 100 !== 13 ? 'rd' : 'th'}`;

/** the state a node is drawn in: what this step works on, then what was visited, then what waits in the stack/queue */
function nodeStates(view: TreeView): Record<string, NodeState> {
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
 * the output so far. Everything shown comes from the step itself (ExecutionStep.tree).
 */
export const TreeVisualizer: React.FC<TreeVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.tree;
  const layout = useMemo(() => (view ? layoutTree(view) : {}), [view]);
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const byId = new Map(view.nodes.map(n => [n.id, n]));
  const value = (id: string) => byId.get(id)!.value;
  const states = nodeStates(view);
  const order = new Map(view.visited.map((id, k) => [id, k + 1]));
  const levels = Math.max(0, ...Object.values(layout).map(p => p.depth + 1));
  const width = view.nodes.length * COL + 2 * PAD;
  const height = levels * ROW + 2 * PAD;
  const at = (id: string) => ({ x: PAD + layout[id].x * COL + COL / 2, y: PAD + layout[id].depth * ROW + R });
  const pointersAt = new Map<string, string[]>();
  for (const p of view.pointers ?? []) if (p.node) pointersAt.set(p.node, [...(pointersAt.get(p.node) ?? []), p.name]);
  const nullPointers = (view.pointers ?? []).filter(p => p.node === null).map(p => p.name);
  const container = view.stack ? { kind: 'stack' as const, ...view.stack } : view.queue ? { kind: 'queue' as const, ...view.queue } : null;

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
                  const reached = states[child] === 'visited' || states[child] === 'current';
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
                      className={reached ? 'stroke-emerald-500/70' : 'stroke-slate-600'}
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
            </svg>
          </div>
        )}

        {/* the tree for assistive technology: each node, its children and its state */}
        <ul className="sr-only" aria-label="Nodes at this step">
          {view.nodes.map(n => (
            <li key={n.id}>
              Node {n.value}: {STATE_TEXT[states[n.id]]}
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
          <div className="flex flex-wrap items-center gap-2" data-testid="tree-output">
            <span className="text-slate-400">output:</span>
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
