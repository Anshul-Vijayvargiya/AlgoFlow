import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, MergeKListsView, MergeKNode } from '../../types/algorithm';

interface MergeKListsVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/** width per bottom-level slot, row height and node radius of the heap tree, in px (the drawing scales down to fit) */
const SLOT = 54;
const ROW = 66;
const R = 21;
const PAD_X = 16;
/** room above the root for its index, and below the last level for pointer names */
const PAD_TOP = 22;
const PAD_BOTTOM = 24;

/**
 * where a node of an input list is. waiting: not reached yet; heap: in the min heap; taken: popped from the heap (held by
 * min or node) and not linked yet; merged: in the merged list
 */
type NodeStatus = 'waiting' | 'heap' | 'taken' | 'merged';

const STATUS_TONE: Record<NodeStatus, string> = {
  waiting: 'bg-slate-900/80 border-slate-700 text-slate-200',
  heap: 'bg-sky-500/15 border-sky-400 text-sky-200',
  taken: 'bg-amber-500/20 border-amber-400 text-amber-200',
  merged: 'bg-emerald-500/15 border-emerald-500 text-emerald-300',
};
/** the word under each node (never colour alone), and what it means in the legend */
const STATUS_WORD: Record<NodeStatus, string> = { waiting: '', heap: 'heap', taken: 'taken', merged: 'merged' };
const STATUS_TEXT: Record<NodeStatus, string> = {
  waiting: 'waiting in its list',
  heap: 'in the heap',
  taken: 'taken from the heap',
  merged: 'in the merged list',
};

/**
 * what a heap position shows. swapped: this step swapped it; moved: pop copied the last node here; leaving: the last
 * slot, about to be removed; inserted: the node just stored; compared: its value is being compared; min: the root pop is
 * taking; focus: the position being sifted (i); normal: anything else
 */
type HeapState = 'swapped' | 'moved' | 'leaving' | 'inserted' | 'compared' | 'min' | 'focus' | 'normal';

const HEAP_TONE: Record<HeapState, { circle: string; text: string; cell: string }> = {
  swapped: { circle: 'fill-rose-500/20 stroke-rose-400', text: 'fill-rose-200', cell: 'bg-rose-500/20 border-rose-400 text-rose-200' },
  moved: { circle: 'fill-purple-500/20 stroke-purple-400', text: 'fill-purple-200', cell: 'bg-purple-500/20 border-purple-400 text-purple-200' },
  leaving: { circle: 'fill-slate-900 stroke-slate-500', text: 'fill-slate-400', cell: 'bg-slate-900/80 border-dashed border-slate-500 text-slate-400' },
  inserted: { circle: 'fill-emerald-500/20 stroke-emerald-500', text: 'fill-emerald-300', cell: 'bg-emerald-500/15 border-emerald-500 text-emerald-300' },
  compared: { circle: 'fill-amber-500/25 stroke-amber-400', text: 'fill-amber-200', cell: 'bg-amber-500/20 border-amber-400 text-amber-200' },
  min: { circle: 'fill-amber-500/25 stroke-amber-400', text: 'fill-amber-200', cell: 'bg-amber-500/20 border-amber-400 text-amber-200' },
  focus: { circle: 'fill-sky-500/15 stroke-sky-400', text: 'fill-sky-200', cell: 'bg-sky-500/15 border-sky-400 text-sky-200' },
  normal: { circle: 'fill-slate-900 stroke-slate-600', text: 'fill-slate-200', cell: 'bg-slate-900/80 border-slate-700 text-slate-200' },
};

const HEAP_STATE_TEXT: Record<Exclude<HeapState, 'normal'>, string> = {
  swapped: 'just swapped',
  moved: 'moved to the root',
  leaving: 'about to leave the heap',
  inserted: 'just pushed',
  compared: 'being compared',
  min: 'the smallest: being taken',
  focus: 'being sifted',
};

/** a node of the merged list: linked by this step, or linked earlier */
type MergedState = 'linked' | 'merged';
const MERGED_TONE: Record<MergedState, string> = {
  linked: 'bg-purple-500/20 border-purple-400 text-purple-200',
  merged: 'bg-emerald-500/15 border-emerald-500 text-emerald-300',
};

/** each list's tag keeps one tint wherever its nodes go; the tag's text (L0, L1, …) is what identifies the list */
const LIST_TONE = ['text-cyan-300', 'text-amber-300', 'text-emerald-300', 'text-purple-400', 'text-rose-400'];
const listTone = (list: number) => LIST_TONE[list % LIST_TONE.length];

const PHASE_TEXT: Record<MergeKListsView['phase'], string> = {
  build: 'Push the heads',
  merge: 'Merge',
  done: 'Done',
};

const levelOf = (k: number) => Math.floor(Math.log2(k + 1));

/**
 * Where each heap position is drawn: level by level (heap[0] on top, the children of heap[k] are heap[2k+1] and
 * heap[2k+2]). The layout depends only on the number of lists, which the heap never exceeds, so a position keeps its
 * place on every step.
 */
function layoutHeap(capacity: number) {
  const levels = Math.max(1, levelOf(Math.max(capacity, 1) - 1) + 1);
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

function heapStates(view: MergeKListsView): HeapState[] {
  const focus = view.pointers.find(p => p.name === 'i')?.index;
  return view.heap.map((id, k) => {
    if (view.swapped?.includes(k)) return 'swapped';
    if (view.moved && view.moved.from === k) return 'leaving';
    if (view.moved && view.moved.to === k) return 'moved';
    if (view.inserted === k) return 'inserted';
    if (view.compared?.includes(k)) return 'compared';
    if (k === 0 && view.min === id) return 'min';
    if (focus === k) return 'focus';
    return 'normal';
  });
}

function nodeStatus(view: MergeKListsView, id: string): NodeStatus {
  if (view.merged.includes(id)) return 'merged';
  if (view.min === id || view.node === id) return 'taken';
  if (view.heap.includes(id)) return 'heap';
  return 'waiting';
}

/**
 * Merge k Sorted Lists (visual: 'k-lists'), in three parts: the input lists as given (each node marked waiting, in the
 * heap, taken or merged), the min heap of nodes as a tree and as its array (with the index variables and what the step
 * compared, swapped, moved or pushed), and the merged list growing from the dummy node (with tail and the node just
 * linked). Every node carries its list's tag (L0, L1, …) wherever it is shown. Everything shown comes from the step
 * itself (ExecutionStep.mergeK): nothing is merged or worked out here.
 */
export const MergeKListsVisualizer: React.FC<MergeKListsVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.mergeK;
  const capacity = Math.max(view?.lists.length ?? 0, 1);
  const layout = React.useMemo(() => layoutHeap(capacity), [capacity]);
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const byId = new Map(view.nodes.map(n => [n.id, n] as const));
  const node = (id: string): MergeKNode => byId.get(id) ?? { id, value: NaN, list: 0, index: 0, next: null };
  const named = (id: string) => `${node(id).value} (L${node(id).list})`;

  const statuses = new Map(view.nodes.map(n => [n.id, nodeStatus(view, n.id)] as const));
  const states = heapStates(view);
  const pointersAt = (k: number) => view.pointers.filter(p => p.index === k).map(p => p.name);
  const edgeTone = (parent: number, child: number) => {
    const pair = (xs?: readonly number[]) => Boolean(xs && xs.length === 2 && xs.includes(parent) && xs.includes(child));
    return pair(view.swapped) ? 'stroke-rose-400' : pair(view.compared) ? 'stroke-amber-400' : 'stroke-slate-600';
  };
  const mergedState = (id: string): MergedState => (view.linked === id ? 'linked' : 'merged');
  const marksAt = (id: string) => [...(view.tail === id ? ['tail'] : []), ...(view.node === id ? ['node'] : [])];
  const dummyMarks = view.tail === 'dummy' ? ['tail'] : [];
  const mergedValues = view.merged.map(id => node(id).value);

  const shownStatuses = (Object.keys(STATUS_TEXT) as NodeStatus[]).filter(s => [...statuses.values()].includes(s));
  const shownHeapStates = (Object.keys(HEAP_STATE_TEXT) as (keyof typeof HEAP_STATE_TEXT)[]).filter(s => states.includes(s));

  const vars: { name: string; value: string; text: string }[] = [
    { name: 'i', value: view.listIndex === null ? '' : String(view.listIndex), text: 'list being looked at' },
    { name: 'size', value: String(view.heap.length), text: 'nodes in the heap' },
    { name: 'min', value: view.min ? named(view.min) : '', text: 'taken by pop' },
    { name: 'node', value: view.node ? named(view.node) : '', text: 'the node to link' },
    { name: 'tail', value: view.tail === null ? '' : view.tail === 'dummy' ? 'dummy' : named(view.tail), text: 'end of the merged list' },
  ];

  const describedLists = view.lists.map((list, i) => `L${i}: ${list.length ? list.join(', ') : 'empty'}`).join('; ');
  const describedHeap = view.heap.map((id, k) => `heap[${k}] = ${named(id)}${states[k] === 'normal' ? '' : `, ${HEAP_STATE_TEXT[states[k] as keyof typeof HEAP_STATE_TEXT]}`}`).join('; ');
  const describedMerged = view.merged.map(id => `${named(id)}${view.linked === id ? ', just linked' : ''}`).join(', then ');

  return (
    <div className="w-full flex flex-col gap-2" data-testid="klists-visualizer" data-phase={view.phase} data-lists={view.lists.length} data-nodes={view.nodes.length}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col gap-4">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="klists-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span data-testid="klists-phase" data-phase={view.phase} className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300">
          {PHASE_TEXT[view.phase]}
        </span>

        <p className="sr-only" data-testid="klists-text">
          {view.lists.length === 0 ? 'There are no input lists.' : `Input lists: ${describedLists}.`} {view.heap.length === 0 ? 'The min heap is empty.' : `Min heap of ${view.heap.length}: ${describedHeap}.`}
          {view.pointers.length > 0 && ` Index variables: ${view.pointers.map(p => `${p.name} = ${p.index}`).join(', ')}.`}{' '}
          {!view.dummy ? 'The merged list is not started.' : view.merged.length === 0 ? 'The merged list is empty: only the dummy node.' : `Merged list after the dummy node: ${describedMerged}.`}
          {view.tail !== null && ` tail is at ${view.tail === 'dummy' ? 'the dummy node' : named(view.tail)}.`}
        </p>

        {/* A. the input lists, as given: one row per list */}
        <div className="relative z-10 flex flex-col gap-1.5 font-mono text-[11px]" data-testid="klists-inputs" aria-hidden="true">
          <h3 className="font-bold text-slate-300">Input lists (as given)</h3>
          {view.lists.length === 0 && (
            <p data-testid="klists-no-lists" className="text-slate-400">
              [ ] — no lists
            </p>
          )}
          <ol className="flex flex-col gap-1.5 select-none">
            {view.lists.map((list, i) => {
              const row = view.nodes.filter(n => n.list === i);
              return (
                <li key={i} data-list={i} data-length={list.length} data-current={view.listIndex === i ? 'true' : 'false'} className="flex flex-wrap items-start gap-x-1 gap-y-1">
                  <span data-list-tag={i} className={`w-6 shrink-0 h-8 flex items-center font-bold ${listTone(i)}`}>
                    L{i}
                  </span>
                  {row.map(n => {
                    const status = statuses.get(n.id)!;
                    return (
                      <span key={n.id} className="flex items-start gap-1">
                        <span className="flex flex-col items-center gap-0.5">
                          <span
                            data-node={n.id}
                            data-value={n.value}
                            data-status={status}
                            style={{ transitionDuration: `${transitionMs}ms` }}
                            className={`min-w-8 h-8 px-1 flex items-center justify-center rounded-md border-2 font-bold tabular-nums transition-colors motion-reduce:transition-none ${STATUS_TONE[status]}`}
                          >
                            {n.value}
                          </span>
                          <span className="text-[9px] leading-none min-h-2.5 text-slate-300">{STATUS_WORD[status]}</span>
                        </span>
                        <span className="h-8 flex items-center text-slate-400">→</span>
                      </span>
                    );
                  })}
                  <span data-list-end={i} className="h-8 flex items-center text-slate-400">
                    {list.length === 0 ? 'NULL (empty list)' : 'NULL'}
                  </span>
                  {view.listIndex === i && (
                    <span data-testid="klists-list-pointer" className="h-8 flex items-center font-bold text-sky-200">
                      ◀ i
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* B. the min heap of nodes: as a binary tree (it scales down to fit) and, in sync, as its array */}
        <div className="relative z-10 flex flex-col gap-1.5 font-mono text-[11px]" data-testid="klists-heap" data-size={view.heap.length} aria-hidden="true">
          <h3 className="font-bold text-slate-300">Min heap (one node per list at most)</h3>
          <div className="w-full flex justify-center" data-testid="klists-tree-area">
            {view.heap.length === 0 ? (
              <p data-testid="klists-heap-empty" className="py-6 text-sm text-slate-400">
                The heap is empty.
              </p>
            ) : (
              <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} style={{ maxWidth: '100%', height: 'auto' }} data-testid="klists-tree" className="block">
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
                {view.heap.map((id, k) => {
                  const { x, y } = layout.at(k);
                  const state = states[k];
                  const names = pointersAt(k);
                  const n = node(id);
                  // the index variables go under a node; a node with a child has edges leaving there, so its
                  // variables go beside it instead: left of the root, below and right of any other parent
                  const hasChild = 2 * k + 1 < view.heap.length;
                  const label = !hasChild
                    ? { x, y: y + R + 13, anchor: 'middle' as const }
                    : k === 0
                      ? { x: x - R - 6, y: y + 3, anchor: 'end' as const }
                      : { x: x + R * 0.75, y: y + R + 6, anchor: 'start' as const };
                  return (
                    <g key={k} data-heap-node={k} data-node-id={id} data-value={n.value} data-list={n.list} data-state={state} data-pointers={names.join(',')}>
                      <circle
                        cx={x}
                        cy={y}
                        r={R}
                        strokeWidth={state === 'normal' ? 2 : 3}
                        strokeDasharray={state === 'leaving' ? '4 3' : undefined}
                        style={{ transitionDuration: `${transitionMs}ms` }}
                        className={`transition-colors motion-reduce:transition-none ${HEAP_TONE[state].circle}`}
                      />
                      <text x={x} y={y - 4} textAnchor="middle" dominantBaseline="central" className={`text-[13px] font-mono font-bold ${HEAP_TONE[state].text}`}>
                        {n.value}
                      </text>
                      <text x={x} y={y + 11} textAnchor="middle" dominantBaseline="central" className={`text-[9px] font-mono font-bold ${HEAP_TONE[state].text}`}>
                        L{n.list}
                      </text>
                      <text x={x} y={y - R - 5} textAnchor="middle" className="text-[9px] font-mono fill-slate-400">
                        [{k}]
                      </text>
                      {names.length > 0 && (
                        <text x={label.x} y={label.y} textAnchor={label.anchor} data-pointer-label={hasChild ? 'beside' : 'below'} className="text-[10px] font-mono font-bold fill-sky-200">
                          {names.join(', ')}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          <div className="flex flex-wrap items-start gap-2" data-testid="klists-heap-array" data-values={view.heap.map(id => node(id).value).join(',')} data-ids={view.heap.join(',')}>
            <span className="text-slate-400 pt-1.5">heap array:</span>
            {view.heap.length === 0 && <span className="text-slate-400 pt-1.5">[ ]</span>}
            <ol className="flex flex-wrap items-start gap-1">
              {view.heap.map((id, k) => {
                const state = states[k];
                const names = pointersAt(k);
                const n = node(id);
                return (
                  <li key={k} data-heap-index={k} data-node-id={id} data-value={n.value} data-list={n.list} data-state={state} data-pointers={names.join(',')} className="flex flex-col items-center gap-0.5 min-w-9">
                    <span
                      style={{ transitionDuration: `${transitionMs}ms` }}
                      className={`min-w-9 h-8 px-1 flex items-center justify-center rounded-md border-2 font-bold tabular-nums transition-colors motion-reduce:transition-none ${HEAP_TONE[state].cell}`}
                    >
                      {n.value}
                    </span>
                    <span className={`text-[10px] font-bold leading-none ${listTone(n.list)}`}>L{n.list}</span>
                    <span className="text-[10px] leading-none text-slate-400">[{k}]</span>
                    <span className="text-[10px] font-bold leading-none text-sky-200 min-h-3">{names.join(', ')}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* C. the merged list: the dummy node, then the input nodes themselves in the order they were linked */}
        <div className="relative z-10 flex flex-col gap-1.5 font-mono text-[11px]" data-testid="klists-merged" data-values={mergedValues.join(',')} data-ids={view.merged.join(',')} data-tail={view.tail ?? ''} aria-hidden="true">
          <h3 className="font-bold text-slate-300">
            Merged list ({view.merged.length} of {view.nodes.length} nodes)
          </h3>
          {!view.dummy ? (
            <p data-testid="klists-merged-pending" className="text-slate-400">
              Not started: the dummy node is created once the heads are in the heap.
            </p>
          ) : (
            <ol className="flex flex-wrap items-start gap-x-1 gap-y-2 select-none">
              <li className="flex flex-col items-center gap-0.5">
                <span data-testid="klists-dummy" data-marks={dummyMarks.join(',')} className="h-8 px-1.5 flex items-center justify-center rounded-md border-2 border-dashed font-bold bg-slate-900/80 border-slate-500 text-slate-300">
                  dummy
                </span>
                <span className="text-[10px] font-bold leading-none min-h-3 text-cyan-300">{dummyMarks.length > 0 && '▲ tail'}</span>
              </li>
              {view.merged.map((id, k) => {
                const n = node(id);
                const state = mergedState(id);
                const marks = marksAt(id);
                return (
                  <li key={id} className="flex items-start gap-1">
                    <span className="h-8 flex items-center text-slate-400">→</span>
                    <span className="flex flex-col items-center gap-0.5">
                      <span
                        data-merged={k}
                        data-node-id={id}
                        data-value={n.value}
                        data-list={n.list}
                        data-state={state}
                        data-marks={marks.join(',')}
                        style={{ transitionDuration: `${transitionMs}ms` }}
                        className={`min-w-8 h-8 px-1 flex items-center justify-center rounded-md border-2 font-bold tabular-nums transition-colors motion-reduce:transition-none ${MERGED_TONE[state]}`}
                      >
                        {n.value}
                      </span>
                      <span className={`text-[10px] font-bold leading-none ${listTone(n.list)}`}>L{n.list}</span>
                      <span className="flex flex-col items-center text-[10px] font-bold leading-tight min-h-3">
                        {marks.map(m => (
                          <span key={m} data-mark={m} className={m === 'tail' ? 'text-cyan-300' : 'text-amber-300'}>
                            ▲ {m}
                          </span>
                        ))}
                      </span>
                    </span>
                  </li>
                );
              })}
              {view.result && (
                <li data-testid="klists-merged-end" className="h-8 flex items-center gap-1 text-slate-400">
                  <span>→</span> NULL
                </li>
              )}
            </ol>
          )}
        </div>

        {/* the variables of the code, as values */}
        <dl className="relative z-10 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono" data-testid="klists-vars">
          {vars.map(v => (
            <div key={v.name} data-var={v.name} data-value={v.value} className="flex items-baseline gap-1">
              <dt className="font-bold text-sky-200">{v.name}</dt>
              <dd className="text-slate-200 tabular-nums">= {v.value === '' ? '–' : v.value}</dd>
              <dd className="text-slate-400">({v.text})</dd>
            </div>
          ))}
        </dl>

        {/* what this step did, in the trace's own words */}
        <div className="relative z-10 min-h-7 flex items-center" data-testid="klists-note">
          <span className="px-2 py-1 rounded-md border font-mono font-bold text-[11px] sm:text-xs break-words bg-slate-800/80 border-slate-600 text-slate-200">{currentStep.message}</span>
        </div>

        {/* what the colours mean (only the states this step shows) */}
        <ul className="relative z-10 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="klists-legend">
          {shownStatuses.map(s => (
            <li key={s} data-legend={s} className="flex items-center gap-1 text-slate-300">
              <span className={`inline-block w-3 h-3 rounded border-2 ${STATUS_TONE[s]}`} />
              {STATUS_TEXT[s]}
            </li>
          ))}
          {shownHeapStates.map(s => (
            <li key={s} data-legend={`heap-${s}`} className="flex items-center gap-1 text-slate-300">
              <span className={`inline-block w-3 h-3 rounded-full border-2 ${HEAP_TONE[s].cell}`} />
              heap: {HEAP_STATE_TEXT[s]}
            </li>
          ))}
          {view.linked && (
            <li data-legend="linked" className="flex items-center gap-1 text-slate-300">
              <span className={`inline-block w-3 h-3 rounded border-2 ${MERGED_TONE.linked}`} />
              just linked
            </li>
          )}
        </ul>

        <p data-testid="klists-calls" data-depth={view.calls.length} className="relative z-10 text-[11px] font-mono text-slate-400 break-words">
          calls: <span className="text-slate-200">{view.calls.length ? view.calls.join(' › ') : 'none (returned)'}</span>
        </p>
      </div>

      {view.result && (
        <div role="status" data-testid="klists-result" className="flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300 break-words">
          <Equal className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{view.result.text}</span>
        </div>
      )}
    </div>
  );
};
