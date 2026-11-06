import React, { useEffect, useRef } from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, SubsetsView } from '../../types/algorithm';

interface SubsetsVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/** column width per bottom-row node, row height and node radius of the tree, in px */
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

const STATE_TEXT: Record<NodeState, string> = {
  current: 'running now',
  path: 'its call is waiting',
  finished: 'finished',
  unvisited: 'not reached yet',
};

interface TreeNode {
  readonly path: string;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The whole decision tree for n elements, so nothing moves as the search runs: a node's path says what was decided (I
 * include, E exclude). The bottom row takes one column each, include on the left; a parent sits midway above its children.
 */
function layoutDecisionTree(n: number): { nodes: TreeNode[]; width: number; height: number } {
  const nodes: TreeNode[] = [];
  const columns = 2 ** n;
  const walk = (path: string): number => {
    const depth = path.length;
    const column = depth === n ? [...path].reduce((c, d) => c * 2 + (d === 'E' ? 1 : 0), 0) : (walk(`${path}I`) + walk(`${path}E`)) / 2;
    nodes.push({ path, depth, x: PAD + column * COL + COL / 2, y: PAD + depth * ROW + R });
    return column;
  };
  walk('');
  return { nodes, width: columns * COL + 2 * PAD, height: n * ROW + 2 * R + 2 * PAD };
}

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

/** what a node's path means: the elements included to reach it */
const subsetOf = (view: SubsetsView, path: string) => [...path].flatMap((d, i) => (d === 'I' ? [view.nums[i]] : []));

/**
 * Subsets (visual: 'decision-tree'): the input with the element being decided, the include / exclude tree, the current
 * subset, the calls in progress, the subsets saved so far and the two separate costs. Everything shown comes from the
 * step itself (ExecutionStep.subsets). A wide tree scrolls inside its own area, keeping the running call in view.
 */
export const SubsetsVisualizer: React.FC<SubsetsVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.subsets;
  const scroller = useRef<HTMLDivElement>(null);
  const n = view?.nums.length ?? 0;
  const layout = React.useMemo(() => layoutDecisionTree(n), [n]);
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
  const newest = view.subsets.length - 1;

  return (
    <div className="w-full flex flex-col gap-2" data-testid="subsets-visualizer">
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="subsets-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}

        {/* the input, with the element being decided */}
        <div className="relative z-10 flex flex-wrap items-start gap-2 text-[11px] font-mono" data-testid="subsets-input" data-index={view.index ?? ''}>
          <span className="text-slate-400 pt-1.5">nums:</span>
          {n === 0 && <span className="text-slate-400 pt-1.5">[ ] (empty)</span>}
          <ol aria-label={`Input: ${list(view.nums)}${view.index !== null ? `; deciding on index ${view.index}, value ${view.nums[view.index]}` : ''}`} className="flex flex-wrap items-start gap-1">
            {view.nums.map((v, k) => (
              <li key={k} data-input-index={k} data-value={v} data-current={k === view.index ? 'true' : 'false'} className="flex flex-col items-center gap-0.5">
                <span
                  style={{ transitionDuration: `${transitionMs}ms` }}
                  className={`min-w-7 h-7 px-1 flex items-center justify-center rounded-md border font-bold transition-colors motion-reduce:transition-none ${
                    k === view.index ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-slate-900/80 border-slate-700 text-slate-200'
                  }`}
                >
                  {v}
                </span>
                <span className={`text-[10px] ${k === view.index ? 'font-bold text-amber-200' : 'text-slate-400'}`} aria-hidden="true">
                  {k}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* the decision tree; a wide one scrolls sideways here instead of widening the page. Focusable so keyboard users can scroll it */}
        <div ref={scroller} tabIndex={0} role="region" aria-label="Decision tree" data-testid="subsets-tree-scroll" className="relative z-10 max-w-full overflow-x-auto rounded-lg">
          <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true" data-testid="subsets-tree" className="block mx-auto">
            {layout.nodes
              .filter(t => t.depth < n)
              .flatMap(t =>
                (['I', 'E'] as const).map(choice => {
                  const child = byPath.get(`${t.path}${choice}`)!;
                  const walked = stateOf(child.path) !== 'unvisited';
                  const midX = (t.x + child.x) / 2;
                  const midY = (t.y + child.y) / 2;
                  const include = choice === 'I';
                  // the edge stops at each node's rim, so it never crosses the number inside
                  const length = Math.hypot(child.x - t.x, child.y - t.y);
                  const rimX = ((child.x - t.x) / length) * R;
                  const rimY = ((child.y - t.y) / length) * R;
                  return (
                    <g key={child.path} data-edge={child.path} data-choice={include ? 'include' : 'exclude'} data-walked={walked ? 'true' : 'false'}>
                      <line
                        x1={t.x + rimX}
                        y1={t.y + rimY}
                        x2={child.x - rimX}
                        y2={child.y - rimY}
                        strokeWidth={2}
                        strokeDasharray={include ? undefined : '4 3'}
                        className={walked ? (onPath.has(child.path) ? 'stroke-sky-400' : 'stroke-emerald-500/70') : 'stroke-slate-600'}
                      />
                      <text x={midX + (include ? -3 : 3)} y={midY - 3} textAnchor={include ? 'end' : 'start'} className={`text-[9px] font-mono ${walked ? 'font-bold fill-slate-200' : 'fill-slate-400'}`}>
                        {include ? `+${view.nums[t.depth]}` : 'skip'}
                      </text>
                    </g>
                  );
                })
              )}
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
                  {/* the order this node's subset was saved in */}
                  <text x={t.x} y={t.y} textAnchor="middle" dominantBaseline="central" className={`text-[10px] font-mono font-bold ${NODE_TONE[state].text}`}>
                    {saved === undefined ? '' : saved + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* the tree for assistive technology: where the search is now */}
        <p className="sr-only" data-testid="subsets-tree-text">
          {running === null
            ? 'No call is running.'
            : `Decision tree: ${STATE_TEXT.current}, the call for ${list(subsetOf(view, running))} at depth ${running.length} of ${n}.`}{' '}
          {view.calls.length} calls in progress, {view.finished.length} finished, {view.subsets.length} subsets saved.
        </p>

        <div className="relative z-10 w-full flex flex-col gap-2 text-[11px] font-mono">
          {/* the current subset, with what this step did to it */}
          <div className="flex flex-wrap items-center gap-2" data-testid="subsets-current" data-values={view.current.join(',')} data-added={view.added ?? ''} data-removed={view.removed ?? ''}>
            <span className="text-slate-400">current:</span>
            <ol aria-label={`Current subset: ${list(view.current)}`} className="flex flex-wrap items-center gap-1">
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
            {view.added !== undefined && <span className="font-bold text-amber-200">+ {view.added} included</span>}
            {view.removed !== undefined && <span className="font-bold text-rose-200">− {view.removed} removed (backtracking)</span>}
          </div>

          {/* the dfs calls in progress, outermost first; a deep stack scrolls with the running call in view */}
          <div className="flex flex-col gap-1" data-testid="subsets-calls" data-depth={view.calls.length}>
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
                      data-frame-i={c.i}
                      data-frame-node={c.node}
                      data-frame-via={c.via}
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
                      dfs({c.i})
                      {c.via !== 'root' && <span> — {c.via === 'include' ? `with ${view.nums[c.i - 1]}` : `without ${view.nums[c.i - 1]}`}</span>}
                      {status === 'returning' && <span> ↩ returns</span>}
                      {status === 'waiting' && <span className="text-slate-400"> (waiting)</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          {/* the subsets saved so far, in order; the number matches the one on the tree */}
          <div className="flex flex-col gap-1" data-testid="subsets-results" data-count={view.subsets.length}>
            <span className="text-slate-400">
              subsets saved: {view.subsets.length} of {2 ** n}
            </span>
            <ol aria-label={`Subsets saved: ${view.subsets.map(list).join(', ')}`} className="flex flex-wrap items-center gap-1">
              {view.subsets.map((s, k) => (
                <li
                  key={k}
                  data-subset={s.join(',')}
                  data-newest={k === newest ? 'true' : 'false'}
                  className={`px-1.5 py-0.5 rounded-md border font-bold ${
                    k === newest && currentStep.type !== 'complete' ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  }`}
                >
                  <span className="font-normal opacity-80">{k + 1}: </span>
                  {list(s)}
                </li>
              ))}
            </ol>
          </div>

          {/* two different costs, kept apart */}
          <dl className="flex flex-wrap gap-x-4 gap-y-1" data-testid="subsets-costs" data-calls={view.callsMade} data-copied={view.elementsCopied}>
            <div className="flex gap-1">
              <dt className="text-slate-400">recursive calls:</dt>
              <dd className="font-bold text-cyan-300">
                {view.callsMade} of {2 ** (n + 1) - 1}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-slate-400">elements copied into results:</dt>
              <dd className="font-bold text-cyan-300">
                {view.elementsCopied} of {n === 0 ? 0 : n * 2 ** (n - 1)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {view.result && (
        <div role="status" data-testid="subsets-result" className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300">
          <Equal className="w-4 h-4 shrink-0" aria-hidden="true" />
          {view.result.text}
        </div>
      )}
    </div>
  );
};
