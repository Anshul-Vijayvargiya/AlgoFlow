import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, MaxHeapView } from '../../types/algorithm';

interface HeapVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/** width per bottom-level slot, row height and node radius of the tree, in px (the drawing scales down to fit) */
const SLOT = 54;
const ROW = 74;
const R = 19;
const PAD_X = 16;
/** room above the root for its index, and below the last level for pointer names */
const PAD_TOP = 22;
const PAD_BOTTOM = 24;

/**
 * compared: its value is being compared; swapped: this step swapped it; moved: popMax copied the last stone here;
 * leaving: the last slot, copied to the root and about to be removed; inserted: the stone just appended; focus: the
 * position being sifted (i); result: the last stone; normal: anything else
 */
type NodeState = 'compared' | 'swapped' | 'moved' | 'leaving' | 'inserted' | 'focus' | 'result' | 'normal';

const NODE_TONE: Record<NodeState, { circle: string; text: string; cell: string }> = {
  compared: { circle: 'fill-amber-500/25 stroke-amber-400', text: 'fill-amber-200', cell: 'bg-amber-500/20 border-amber-400 text-amber-200' },
  swapped: { circle: 'fill-rose-500/20 stroke-rose-400', text: 'fill-rose-200', cell: 'bg-rose-500/20 border-rose-400 text-rose-200' },
  moved: { circle: 'fill-purple-500/20 stroke-purple-400', text: 'fill-purple-200', cell: 'bg-purple-500/20 border-purple-400 text-purple-200' },
  leaving: { circle: 'fill-slate-900 stroke-slate-500', text: 'fill-slate-400', cell: 'bg-slate-900/80 border-dashed border-slate-500 text-slate-400' },
  inserted: { circle: 'fill-emerald-500/20 stroke-emerald-500', text: 'fill-emerald-300', cell: 'bg-emerald-500/15 border-emerald-500 text-emerald-300' },
  focus: { circle: 'fill-sky-500/15 stroke-sky-400', text: 'fill-sky-200', cell: 'bg-sky-500/15 border-sky-400 text-sky-200' },
  result: { circle: 'fill-emerald-500/20 stroke-emerald-500', text: 'fill-emerald-300', cell: 'bg-emerald-500/15 border-emerald-500 text-emerald-300' },
  normal: { circle: 'fill-slate-900 stroke-slate-600', text: 'fill-slate-200', cell: 'bg-slate-900/80 border-slate-700 text-slate-200' },
};

/** what a state means, in words (screen readers and the legend never rely on colour alone) */
const HEAP_STATE_TEXT: Record<Exclude<NodeState, 'normal'>, string> = {
  compared: 'being compared',
  swapped: 'just swapped',
  moved: 'moved to the root',
  leaving: 'about to be removed',
  inserted: 'just inserted',
  focus: 'being sifted',
  result: 'the last stone',
};

const PHASE_TEXT: Record<MaxHeapView['phase'], string> = {
  copy: 'Copy the stones',
  build: 'Build the max heap',
  smash: 'Smash the two heaviest',
  done: 'Done',
};

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;
const levelOf = (k: number) => Math.floor(Math.log2(k + 1));

/**
 * Where each heap position is drawn: level by level (heap[0] on top, the children of heap[k] are heap[2k+1] and
 * heap[2k+2]), each level's positions spread evenly. The layout depends only on the number of stones, which the heap
 * never exceeds, so a stone keeps its place for its position on every step.
 */
function layoutHeap(n: number) {
  const levels = Math.max(1, levelOf(Math.max(n, 1) - 1) + 1);
  const inner = Math.max(2 ** (levels - 1) * SLOT, 4 * SLOT);
  const width = inner + 2 * PAD_X;
  const height = PAD_TOP + (levels - 1) * ROW + 2 * R + PAD_BOTTOM;
  const at = (k: number) => {
    const d = levelOf(k);
    const p = k - (2 ** d - 1);
    return { x: PAD_X + ((p + 0.5) * inner) / 2 ** d, y: PAD_TOP + R + d * ROW };
  };
  return { width, height, at };
}

function nodeStates(view: MaxHeapView): NodeState[] {
  const focus = view.pointers.find(p => p.name === 'i')?.index;
  return view.heap.map((_, k) => {
    if (view.result && view.heap.length === 1) return 'result';
    if (view.swapped?.includes(k)) return 'swapped';
    if (view.moved && view.moved.to === k) return 'moved';
    if (view.moved && view.moved.from === k && view.moved.from !== view.moved.to) return 'leaving';
    if (view.inserted === k) return 'inserted';
    if (view.compared?.includes(k)) return 'compared';
    if (focus === k) return 'focus';
    return 'normal';
  });
}

/**
 * Last Stone Weight (visual: 'heap'): the max heap drawn as a binary tree (the main view) and, in sync, as its array,
 * with the index variables at their positions and what the step did (compared, swapped, moved to the root, inserted).
 * Beside it: the stones as given, the two stones of this round and their smash, the smashes so far and the calls in
 * progress. Everything shown comes from the step itself (ExecutionStep.heap).
 */
export const HeapVisualizer: React.FC<HeapVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.heap;
  const n = view?.stones.length ?? 0;
  const layout = React.useMemo(() => layoutHeap(n), [n]);
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const states = nodeStates(view);
  const pointersAt = (k: number) => view.pointers.filter(p => p.index === k).map(p => p.name);
  const edgeTone = (parent: number, child: number) => {
    const pair = (xs?: readonly number[]) => Boolean(xs && xs.length === 2 && xs.includes(parent) && xs.includes(child));
    return pair(view.swapped) ? 'stroke-rose-400' : pair(view.compared) ? 'stroke-amber-400' : 'stroke-slate-600';
  };
  const described = states.flatMap((s, k) => (s === 'normal' ? [] : [`heap[${k}] = ${view.heap[k]} ${HEAP_STATE_TEXT[s]}`]));
  const smash = view.smash;

  return (
    <div className="w-full flex flex-col gap-2" data-testid="heap-visualizer">
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="heap-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span data-testid="heap-phase" data-phase={view.phase} className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300">
          {PHASE_TEXT[view.phase]}
        </span>

        {/* the stones as given */}
        <div className="relative z-10 flex flex-wrap items-center gap-2 text-[11px] font-mono" data-testid="heap-stones">
          <span className="text-slate-400">stones:</span>
          {n === 0 && <span className="text-slate-400">[ ] (empty)</span>}
          <ol aria-label={`Stones as given: ${list(view.stones)}`} className="flex flex-wrap items-center gap-1">
            {view.stones.map((v, k) => (
              <li key={k} data-stone={v} className="min-w-7 h-7 px-1 flex items-center justify-center rounded-md border font-bold bg-slate-900/80 border-slate-700 text-slate-300">
                {v}
              </li>
            ))}
          </ol>
        </div>

        {/* the max heap as a binary tree: the main view. It scales down to fit; nothing scrolls */}
        <div className="relative z-10 w-full flex justify-center" data-testid="heap-tree-area">
          {view.heap.length === 0 ? (
            <p data-testid="heap-empty" className="py-8 text-sm font-mono text-slate-400">
              The heap is empty.
            </p>
          ) : (
            <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width={layout.width}
              height={layout.height}
              style={{ maxWidth: '100%', height: 'auto' }}
              aria-hidden="true"
              data-testid="heap-tree"
              className="block"
            >
              {view.heap.map((_, k) => {
                if (k === 0) return null;
                const parent = Math.floor((k - 1) / 2);
                const a = layout.at(parent);
                const b = layout.at(k);
                // the edge stops at each node's rim, so it never crosses the number inside
                const length = Math.hypot(b.x - a.x, b.y - a.y);
                const rx = ((b.x - a.x) / length) * R;
                const ry = ((b.y - a.y) / length) * R;
                const tone = edgeTone(parent, k);
                return (
                  <line
                    key={`e${k}`}
                    data-heap-edge={k}
                    data-tone={tone === 'stroke-slate-600' ? 'normal' : tone === 'stroke-rose-400' ? 'swapped' : 'compared'}
                    x1={a.x + rx}
                    y1={a.y + ry}
                    x2={b.x - rx}
                    y2={b.y - ry}
                    strokeWidth={tone === 'stroke-slate-600' ? 2 : 3}
                    strokeDasharray={states[k] === 'leaving' ? '4 3' : undefined}
                    className={tone}
                  />
                );
              })}
              {view.heap.map((v, k) => {
                const { x, y } = layout.at(k);
                const state = states[k];
                const names = pointersAt(k);
                return (
                  <g key={k} data-heap-node={k} data-value={v} data-state={state} data-pointers={names.join(',')}>
                    <circle
                      cx={x}
                      cy={y}
                      r={R}
                      strokeWidth={state === 'normal' ? 2 : 3}
                      strokeDasharray={state === 'leaving' ? '4 3' : undefined}
                      style={{ transitionDuration: `${transitionMs}ms` }}
                      className={`transition-colors motion-reduce:transition-none ${NODE_TONE[state].circle}`}
                    />
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className={`text-[13px] font-mono font-bold ${NODE_TONE[state].text}`}>
                      {v}
                    </text>
                    <text x={x} y={y - R - 5} textAnchor="middle" className="text-[9px] font-mono fill-slate-400">
                      [{k}]
                    </text>
                    {names.length > 0 && (
                      <text x={x} y={y + R + 13} textAnchor="middle" className="text-[10px] font-mono font-bold fill-sky-200">
                        {names.join(', ')}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* the tree for assistive technology */}
        <p className="sr-only" data-testid="heap-tree-text">
          {view.heap.length === 0
            ? 'The max heap is empty.'
            : `Max heap of ${view.heap.length} stone${view.heap.length === 1 ? '' : 's'}, root ${view.heap[0]}.${described.length ? ` ${described.join('; ')}.` : ''}`}
          {view.pointers.length > 0 && ` Index variables: ${view.pointers.map(p => `${p.name} = ${p.index}`).join(', ')}.`}
        </p>

        {/* the same heap as its array, in sync with the tree */}
        <div className="relative z-10 flex flex-wrap items-start gap-2 text-[11px] font-mono" data-testid="heap-array" data-values={view.heap.join(',')}>
          <span className="text-slate-400 pt-1.5">heap array:</span>
          {view.heap.length === 0 && <span className="text-slate-400 pt-1.5">[ ]</span>}
          <ol aria-label={`Heap array: ${list(view.heap)}`} className="flex flex-wrap items-start gap-1">
            {view.heap.map((v, k) => {
              const state = states[k];
              const names = pointersAt(k);
              return (
                <li key={k} data-heap-index={k} data-value={v} data-state={state} data-pointers={names.join(',')} className="flex flex-col items-center gap-0.5 min-w-8">
                  <span
                    style={{ transitionDuration: `${transitionMs}ms` }}
                    className={`min-w-8 h-8 px-1 flex items-center justify-center rounded-md border-2 font-bold transition-colors motion-reduce:transition-none ${NODE_TONE[state].cell}`}
                  >
                    {v}
                  </span>
                  <span className="text-[10px] text-slate-400" aria-hidden="true">
                    {k}
                  </span>
                  <span className="text-[10px] font-bold text-sky-200 min-h-3.5" aria-hidden="true">
                    {names.join(', ')}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* what the colours mean (only the states this step shows) */}
        {described.length > 0 && (
          <ul className="relative z-10 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="heap-legend">
            {(Object.keys(HEAP_STATE_TEXT) as (keyof typeof HEAP_STATE_TEXT)[])
              .filter(s => states.includes(s))
              .map(s => (
                <li key={s} data-legend={s} className="flex items-center gap-1 text-slate-300">
                  <span className={`inline-block w-3 h-3 rounded-full border-2 ${NODE_TONE[s].cell}`} />
                  {HEAP_STATE_TEXT[s]}
                </li>
              ))}
          </ul>
        )}

        <div className="relative z-10 w-full flex flex-col gap-2 text-[11px] font-mono">
          {/* this round's two stones and their smash */}
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="heap-smash"
            data-y={view.y ?? ''}
            data-x={view.x ?? ''}
            data-top={view.top ?? ''}
            data-popping={view.popping ?? ''}
            data-outcome={smash ? (smash.left === 0 ? 'equal' : 'unequal') : ''}
          >
            <span className="text-slate-400">smash:</span>
            <span className="flex items-center gap-1">
              <span className="text-slate-400">y (heaviest)</span>
              <span className={`min-w-8 h-7 px-1 flex items-center justify-center rounded-md border font-bold ${view.y !== null ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-slate-900/80 border-slate-700 text-slate-400'}`}>
                {view.y ?? '–'}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-slate-400">x (second)</span>
              <span className={`min-w-8 h-7 px-1 flex items-center justify-center rounded-md border font-bold ${view.x !== null ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-slate-900/80 border-slate-700 text-slate-400'}`}>
                {view.x ?? '–'}
              </span>
            </span>
            {view.popping && view.top !== null && (
              <span className="font-bold text-purple-200">
                popMax for {view.popping}: top = {view.top}
              </span>
            )}
            {smash && (
              <span data-testid="heap-smash-outcome" className={`font-bold ${smash.left === 0 ? 'text-rose-200' : 'text-emerald-300'}`}>
                {smash.left === 0
                  ? `${smash.y} = ${smash.x}: both destroyed, nothing goes back`
                  : `y − x = ${smash.y} − ${smash.x} = ${smash.left}: ${smash.x} destroyed, ${smash.left} goes back`}
              </span>
            )}
          </div>

          {/* the smashes so far */}
          <div className="flex flex-col gap-1" data-testid="heap-smashes" data-count={view.smashes.length}>
            <span className="text-slate-400">smashes so far: {view.smashes.length}</span>
            {view.smashes.length > 0 && (
              <ol aria-label={`Smashes so far: ${view.smashes.map(s => `${s.y} and ${s.x}, ${s.left === 0 ? 'both destroyed' : `${s.left} left`}`).join('; ')}`} className="flex flex-wrap items-center gap-1">
                {view.smashes.map((s, k) => (
                  <li key={k} data-smash={`${s.y},${s.x},${s.left}`} className="px-1.5 py-0.5 rounded-md border bg-slate-900/80 border-slate-700 text-slate-200">
                    <span className="opacity-80">{k + 1}: </span>
                    {s.y} vs {s.x} → {s.left === 0 ? 'both destroyed' : s.left}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* the calls in progress */}
          <p data-testid="heap-calls" data-depth={view.calls.length} className="text-slate-400 break-words">
            calls: <span className="text-slate-200">{view.calls.length ? view.calls.join(' › ') : 'none (returned)'}</span>
          </p>
        </div>
      </div>

      {view.result && (
        <div role="status" data-testid="heap-result" className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300">
          <Equal className="w-4 h-4 shrink-0" aria-hidden="true" />
          {view.result.text}
        </div>
      )}
    </div>
  );
};
