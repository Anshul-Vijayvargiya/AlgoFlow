import React, { useEffect, useRef } from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, PermutationsView } from '../../types/algorithm';

interface PermutationsVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/** column width per finished permutation, row height and node radius of the tree, in px */
const COL = 34;
const ROW = 58;
const R = 12;
const PAD = 16;

type NodeState = 'current' | 'path' | 'finished' | 'unvisited';

const NODE_TONE: Record<NodeState, { circle: string; text: string }> = {
  current: { circle: 'fill-amber-500/25 stroke-amber-400', text: 'fill-amber-200' },
  path: { circle: 'fill-sky-500/15 stroke-sky-400', text: 'fill-sky-200' },
  finished: { circle: 'fill-emerald-500/20 stroke-emerald-500', text: 'fill-emerald-300' },
  unvisited: { circle: 'fill-slate-900 stroke-slate-600', text: 'fill-slate-400' },
};

interface TreeNode {
  readonly path: string;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The whole decision tree for n elements, so nothing moves as the search runs. A node's path lists the input indices
 * chosen to reach it, so it has one child for each index not in its path: n - depth of them. The finished permutations
 * take one column each, in the order they are found; a parent sits midway above its first and last children.
 */
function layoutPermutationTree(n: number): { nodes: TreeNode[]; columns: number; width: number; height: number } {
  const nodes: TreeNode[] = [];
  let column = 0;
  const walk = (path: string): number => {
    const depth = path.length;
    const children = Array.from({ length: n }, (_, i) => String(i)).filter(i => !path.includes(i));
    let at: number;
    if (children.length === 0) {
      at = column++;
    } else {
      const columns = children.map(i => walk(`${path}${i}`));
      at = (columns[0] + columns[columns.length - 1]) / 2;
    }
    nodes.push({ path, depth, x: PAD + at * COL + COL / 2, y: PAD + depth * ROW + R });
    return at;
  };
  walk('');
  return { nodes, columns: column, width: column * COL + 2 * PAD, height: n * ROW + 2 * R + 2 * PAD };
}

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

/** what a node's path means: the values chosen to reach it, in order */
const chosenOf = (view: PermutationsView, path: string) => [...path].map(i => view.nums[Number(i)]);

/**
 * Find All Permutations (visual: 'decision-tree'): the input with what is used and what is being checked, the depth, the
 * decision tree (each level chooses one of the unused elements), the current permutation, the calls in progress, the
 * permutations saved and the separate costs. Everything shown comes from the step itself (ExecutionStep.permutations). A
 * wide tree scrolls inside its own area, keeping the running call in view.
 */
export const PermutationsVisualizer: React.FC<PermutationsVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.permutations;
  const scroller = useRef<HTMLDivElement>(null);
  const n = view?.nums.length ?? 0;
  const layout = React.useMemo(() => layoutPermutationTree(n), [n]);
  const running = view?.node ?? null;
  const runningX = running === null ? null : (layout.nodes.find(t => t.path === running)?.x ?? null);

  // the area's own scroll, never the page's
  useEffect(() => {
    const el = scroller.current;
    if (el && runningX !== null && el.scrollWidth > el.clientWidth) el.scrollLeft = runningX - el.clientWidth / 2;
  }, [runningX]);

  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const onPath = new Set(view.calls.map(c => c.node));
  const finished = new Set(view.finished);
  const savedIndex = new Map(view.savedAt.map((path, k) => [path, k]));
  const stateOf = (path: string): NodeState => (path === running ? 'current' : onPath.has(path) ? 'path' : finished.has(path) ? 'finished' : 'unvisited');
  const byPath = new Map(layout.nodes.map(t => [t.path, t]));
  const newest = view.permutations.length - 1;
  const totalCalls = layout.nodes.length;
  const totalChecks = (totalCalls - layout.columns) * n;
  const totalCopied = n * layout.columns;
  const position = view.calls.length > 0 ? view.calls.length - 1 : null;

  return (
    <div className="w-full flex flex-col gap-2" data-testid="permutations-visualizer">
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="permutations-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}

        {/* the input: what is used, what is free, and the element being looked at */}
        <div className="relative z-10 flex flex-wrap items-start gap-2 text-[11px] font-mono" data-testid="permutations-input" data-index={view.index ?? ''}>
          <span className="text-slate-400 pt-1.5">nums:</span>
          {n === 0 && <span className="text-slate-400 pt-1.5">[ ] (empty)</span>}
          <ol
            aria-label={`Input: ${view.nums.map((v, k) => `${v} ${view.used[k] ? 'used' : 'free'}`).join(', ') || 'empty'}${view.index !== null ? `; looking at index ${view.index}, value ${view.nums[view.index]}` : ''}`}
            className="flex flex-wrap items-start gap-1"
          >
            {view.nums.map((v, k) => {
              const looking = k === view.index;
              return (
                <li key={k} data-input-index={k} data-value={v} data-used={view.used[k] ? 'true' : 'false'} data-current={looking ? 'true' : 'false'} className="flex flex-col items-center gap-0.5">
                  <span
                    style={{ transitionDuration: `${transitionMs}ms` }}
                    className={`min-w-7 h-7 px-1 flex items-center justify-center rounded-md border font-bold transition-colors motion-reduce:transition-none ${
                      looking ? 'bg-amber-500/20 border-amber-400 text-amber-200' : view.used[k] ? 'bg-sky-500/15 border-sky-400 text-sky-200' : 'bg-slate-900/80 border-slate-700 text-slate-200'
                    }`}
                  >
                    {v}
                  </span>
                  <span className={`text-[10px] ${looking ? 'font-bold text-amber-200' : 'text-slate-400'}`} aria-hidden="true">
                    {k}
                  </span>
                  <span className={`text-[10px] ${view.used[k] ? 'font-bold text-sky-200' : 'text-slate-400'}`} aria-hidden="true">
                    {view.used[k] ? 'used' : 'free'}
                  </span>
                </li>
              );
            })}
          </ol>
          <span data-testid="permutations-depth" data-depth={position ?? ''} className="pt-1.5 text-slate-300">
            {position === null ? 'no call running' : position === n ? `depth ${position}: all ${n} positions filled` : `depth ${position}: filling position ${position} (0 to ${n - 1})`}
          </span>
        </div>

        {/* the decision tree; a wide one scrolls sideways here instead of widening the page. Focusable so keyboard users can scroll it */}
        <div ref={scroller} tabIndex={0} role="region" aria-label="Decision tree" data-testid="permutations-tree-scroll" className="relative z-10 max-w-full overflow-x-auto rounded-lg">
          <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true" data-testid="permutations-tree" className="block mx-auto">
            {layout.nodes
              .filter(t => t.path !== '')
              .map(child => {
                const parent = byPath.get(child.path.slice(0, -1))!;
                const walked = stateOf(child.path) !== 'unvisited';
                const value = view.nums[Number(child.path.at(-1))];
                // the edge stops at each node's rim, so it never crosses the number inside
                const length = Math.hypot(child.x - parent.x, child.y - parent.y);
                const rimX = ((child.x - parent.x) / length) * R;
                const rimY = ((child.y - parent.y) / length) * R;
                const onLeft = child.x <= parent.x;
                return (
                  <g key={child.path} data-edge={child.path} data-value={value} data-walked={walked ? 'true' : 'false'}>
                    <line
                      x1={parent.x + rimX}
                      y1={parent.y + rimY}
                      x2={child.x - rimX}
                      y2={child.y - rimY}
                      strokeWidth={2}
                      className={walked ? (onPath.has(child.path) ? 'stroke-sky-400' : 'stroke-emerald-500/70') : 'stroke-slate-600'}
                    />
                    <text
                      x={(parent.x + child.x) / 2 + (onLeft ? -3 : 3)}
                      y={(parent.y + child.y) / 2 - 3}
                      textAnchor={onLeft ? 'end' : 'start'}
                      className={`text-[10px] font-mono ${walked ? 'font-bold fill-slate-200' : 'fill-slate-400'}`}
                    >
                      {value}
                    </text>
                  </g>
                );
              })}
            {layout.nodes.map(t => {
              const state = stateOf(t.path);
              const saved = savedIndex.get(t.path);
              return (
                <g key={t.path || 'root'} data-tree-node={t.path} data-state={state} data-saved={saved === undefined ? '' : saved + 1}>
                  <circle
                    cx={t.x}
                    cy={t.y}
                    r={R}
                    strokeWidth={state === 'current' ? 3 : 2}
                    style={{ transitionDuration: `${transitionMs}ms` }}
                    className={`transition-colors motion-reduce:transition-none ${NODE_TONE[state].circle}`}
                  />
                  {/* the order this node's permutation was saved in */}
                  <text x={t.x} y={t.y} textAnchor="middle" dominantBaseline="central" className={`text-[10px] font-mono font-bold ${NODE_TONE[state].text}`}>
                    {saved === undefined ? '' : saved + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* the tree for assistive technology: where the search is now */}
        <p className="sr-only" data-testid="permutations-tree-text">
          {running === null ? 'No call is running.' : `Decision tree: running the call for ${list(chosenOf(view, running))}, at depth ${running.length} of ${n}.`} {view.calls.length} calls in progress,{' '}
          {view.finished.length} finished, {view.permutations.length} permutations saved.
        </p>

        <div className="relative z-10 w-full flex flex-col gap-2 text-[11px] font-mono">
          {/* the current permutation, with what this step did to it */}
          <div className="flex flex-wrap items-center gap-2" data-testid="permutations-current" data-values={view.current.join(',')} data-added={view.added ?? ''} data-removed={view.removed ?? ''} data-skipped={view.skipped ?? ''}>
            <span className="text-slate-400">current:</span>
            <ol aria-label={`Current permutation: ${list(view.current)}`} className="flex flex-wrap items-center gap-1">
              {view.current.length === 0 && <li className="text-slate-400">[ ]</li>}
              {view.current.map((v, k) => {
                const justAdded = view.added !== undefined && k === view.current.length - 1;
                return (
                  <li
                    key={k}
                    className={`min-w-7 h-7 px-1 flex items-center justify-center rounded-md border font-bold ${
                      justAdded ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-slate-900/80 border-slate-700 text-slate-200'
                    }`}
                  >
                    {v}
                  </li>
                );
              })}
            </ol>
            {view.added !== undefined && <span className="font-bold text-amber-200">+ {view.added} pushed</span>}
            {view.removed !== undefined && <span className="font-bold text-rose-200">− {view.removed} popped (backtracking)</span>}
            {view.skipped !== undefined && <span className="text-slate-300">{view.skipped} already used: skipped</span>}
          </div>

          {/* the dfs calls in progress, outermost first; a deep stack scrolls with the running call in view */}
          <div className="flex flex-col gap-1" data-testid="permutations-calls" data-depth={view.calls.length}>
            <span className="text-slate-400">call stack (outermost first):</span>
            <div tabIndex={0} role="region" aria-label="Call stack" className="max-h-44 overflow-y-auto flex flex-col-reverse rounded-md">
              <ol aria-label={`Calls in progress: ${view.calls.length || 'none'}`} className="flex flex-col gap-0.5">
                {view.calls.length === 0 && <li className="text-slate-400">no call in progress</li>}
                {view.calls.map((c, k) => {
                  const last = k === view.calls.length - 1;
                  const status = last ? (c.returning ? 'returning' : 'active') : 'waiting';
                  return (
                    <li
                      key={k}
                      data-frame={k}
                      data-frame-node={c.node}
                      data-frame-chosen={c.chosen ?? ''}
                      data-frame-status={status}
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
                      dfs: position {k}
                      {c.chosen !== null && <span> — after choosing {view.nums[c.chosen]}</span>}
                      {status === 'returning' && <span> ↩ returns</span>}
                      {status === 'waiting' && <span className="text-slate-400"> (waiting)</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          {/* the permutations saved so far, in order; the number matches the one on the tree */}
          <div className="flex flex-col gap-1" data-testid="permutations-results" data-count={view.permutations.length}>
            <span className="text-slate-400">
              permutations saved: {view.permutations.length} of {layout.columns}
            </span>
            {view.permutations.length > 0 && (
              <ol aria-label={`Permutations saved: ${view.permutations.map(list).join(', ')}`} className="flex flex-wrap items-center gap-1">
                {view.permutations.map((p, k) => (
                  <li
                    key={k}
                    data-permutation={p.join(',')}
                    data-newest={k === newest ? 'true' : 'false'}
                    className={`px-1.5 py-0.5 rounded-md border font-bold ${
                      k === newest && currentStep.type !== 'complete' ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                    }`}
                  >
                    <span className="font-normal opacity-80">{k + 1}: </span>
                    {list(p)}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* different costs, kept apart */}
          <dl className="flex flex-wrap gap-x-4 gap-y-1" data-testid="permutations-costs" data-calls={view.callsMade} data-checks={view.usedChecks} data-copied={view.elementsCopied}>
            <div className="flex gap-1">
              <dt className="text-slate-400">recursive calls:</dt>
              <dd className="font-bold text-cyan-300">
                {view.callsMade} of {totalCalls}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-slate-400">used[] checks:</dt>
              <dd className="font-bold text-cyan-300">
                {view.usedChecks} of {totalChecks}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-slate-400">elements copied into results:</dt>
              <dd className="font-bold text-cyan-300">
                {view.elementsCopied} of {totalCopied}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {view.result && (
        <div role="status" data-testid="permutations-result" className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300">
          <Equal className="w-4 h-4 shrink-0" aria-hidden="true" />
          {view.result.text}
        </div>
      )}
    </div>
  );
};
