import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, SearchX, Flag, Inbox, Trash2 } from 'lucide-react';
import type { ExecutionStep } from '../../types/algorithm';
import type { Outcome } from './barVisuals';
import { barTransitionMs } from './barVisuals';
import { deriveListView, type ListNodeView, type ListSegmentView, type ListView } from './listVisuals';

interface LinkedListVisualizerProps {
  currentStep: ExecutionStep;
  /** the step before it (marks nodes this step created or released); undefined on the first step */
  previousStep?: ExecutionStep;
  /** the found node's position on the final step of a search, read from the trace (listFoundPosition) */
  foundPosition?: number | null;
  outcome?: Outcome | null;
  /** label for the operation's value (e.g. "Target value", "New value"), shown when the step carries a value */
  valueLabel?: string;
  /** the operation takes a position (insert / delete at a position): show it */
  showPosition?: boolean;
  stepIntervalMs?: number;
}

const OUTCOME_TEXT: Record<Outcome, { tone: string; Icon: React.ElementType }> = {
  found: { tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', Icon: CheckCircle2 },
  'not-found': { tone: 'bg-rose-500/15 border-rose-500/40 text-rose-300', Icon: SearchX },
  complete: { tone: 'bg-slate-500/15 border-slate-500/40 text-slate-300', Icon: Flag },
  sorted: { tone: 'bg-slate-500/15 border-slate-500/40 text-slate-300', Icon: Flag },
  empty: { tone: 'bg-slate-500/15 border-slate-500/40 text-slate-300', Icon: Inbox },
};

function outcomeText(outcome: Outcome, foundPosition: number | null | undefined, size: number): string {
  if (outcome === 'found') return `Value found at position ${foundPosition}`;
  if (outcome === 'not-found') return 'Value not found — no node matched';
  if (outcome === 'empty') return 'Done — the list is empty';
  return `Done — the list has ${size} node${size === 1 ? '' : 's'}`;
}

const ROLE_STYLE: Record<ListNodeView['role'], string> = {
  default: 'border-cyan-500/40 bg-slate-900 text-cyan-100',
  active: 'border-cyan-300 bg-cyan-500/20 text-white ring-2 ring-cyan-300/60',
  compare: 'border-amber-300 bg-amber-500/20 text-amber-100 ring-2 ring-amber-300/60',
  found: 'border-emerald-300 bg-emerald-500/25 text-emerald-100 ring-2 ring-emerald-300/60',
};
/** a node drawn off the HEAD chain and not highlighted: dashed, rose when out of the list, amber when cut off from HEAD */
const OUTSIDE_STYLE: Record<ListSegmentView['reason'], string> = {
  detached: 'border-dashed border-rose-400/70 bg-slate-900 text-cyan-100',
  unreachable: 'border-dashed border-amber-400/70 bg-slate-900 text-cyan-100',
};
/** text badges, as on the array bars, so a compared or matching node is not marked by colour alone */
const ROLE_BADGE: Record<ListNodeView['role'], string> = { default: '', active: '', compare: 'COMPARE', found: 'MATCH' };
const ROLE_LABEL: Record<ListNodeView['role'], string> = { default: '', active: 'examined', compare: 'being compared', found: 'found' };

/** HEAD / TAIL markers; the one this step moved is highlighted and says so in text (not colour alone). */
const EndChip: React.FC<{ label: 'HEAD' | 'TAIL'; changed: boolean }> = ({ label, changed }) => (
  <span
    data-end-chip={label}
    data-changed={changed ? 'true' : 'false'}
    className={`px-1.5 rounded text-[10px] font-mono font-bold leading-4 border ${
      changed
        ? 'bg-amber-400 text-slate-950 border-amber-200'
        : label === 'HEAD'
          ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
          : 'bg-violet-500/20 text-violet-200 border-violet-400/50'
    }`}
  >
    {label}
    {changed && ' moved'}
  </span>
);

const PointerChip: React.FC<{ name: string }> = ({ name }) => (
  <span data-list-pointer={name} className="px-1.5 rounded text-[10px] font-mono leading-4 bg-slate-800 border border-slate-600 text-slate-200">
    {name}
  </span>
);

/** The arrow for a next link; the link this step changed is drawn thicker in amber and labelled. */
const Arrow: React.FC<{ from: string; to: string | null; changed: boolean }> = ({ from, to, changed }) => (
  <span
    aria-hidden="true"
    data-arrow-from={from}
    data-arrow-to={to ?? 'null'}
    data-changed={changed ? 'true' : 'false'}
    className="relative flex flex-col items-center justify-center w-7 sm:w-9 h-10 shrink-0"
  >
    <svg viewBox="0 0 36 12" className={`w-full ${changed ? 'text-amber-300' : 'text-slate-400'}`}>
      <line x1="1" y1="6" x2="29" y2="6" stroke="currentColor" strokeWidth={changed ? 3 : 1.5} />
      <path d="M28 1 L35 6 L28 11 Z" fill="currentColor" />
    </svg>
    {changed && <span className="absolute -bottom-3 whitespace-nowrap text-[9px] font-mono font-bold text-amber-300">new link</span>}
  </span>
);

function nodeLabel(n: ListNodeView, view: ListView, outside: NodeUnitProps['outside']): string {
  const nextName = (() => {
    if (n.next === null) return 'NULL';
    const target = [...view.chain, ...view.segments.flatMap(g => g.nodes)].find(m => m.id === n.next);
    return target ? `value ${target.value}${target.position !== null ? ` at position ${target.position}` : ''}` : 'NULL';
  })();
  const parts = [
    outside === 'detached' ? 'Outside the list' : outside === 'unreachable' ? 'Not reachable from HEAD' : `Position ${n.position}`,
    `value ${n.value}`,
    n.head && 'HEAD',
    n.tail && 'TAIL',
    ROLE_LABEL[n.role],
    n.isNew && 'just created',
    n.pointers.length > 0 && `pointer${n.pointers.length > 1 ? 's' : ''} ${n.pointers.join(', ')}`,
    `next → ${nextName}`,
    n.linkChanged && 'link just changed',
  ];
  return parts.filter(Boolean).join(', ');
}

interface NodeUnitProps {
  node: ListNodeView;
  view: ListView;
  /** drawn outside the HEAD chain: taken out of / not yet in the list (detached), or cut off from HEAD */
  outside: false | ListSegmentView['reason'];
  animate: boolean;
  transitionMs: number;
}

const NodeUnit: React.FC<NodeUnitProps> = ({ node, view, outside, animate, transitionMs }) => (
  <motion.div
    layout={animate ? 'position' : false}
    layoutId={animate ? `list-node-${node.id}` : undefined}
    transition={{ duration: transitionMs / 1000 }}
    className="flex flex-col items-center gap-1"
  >
    <div className="h-4 flex gap-1">
      {node.head && <EndChip label="HEAD" changed={view.change?.kind === 'head'} />}
      {node.tail && <EndChip label="TAIL" changed={view.change?.kind === 'tail'} />}
    </div>
    <div
      role="img"
      data-list-node={node.id}
      data-value={node.value}
      data-position={node.position ?? 'outside'}
      data-role={node.role}
      data-new={node.isNew ? 'true' : 'false'}
      data-head={node.head ? 'true' : 'false'}
      data-tail={node.tail ? 'true' : 'false'}
      data-pointers={node.pointers.join(',')}
      data-next={node.next ?? 'null'}
      data-link-changed={node.linkChanged ? 'true' : 'false'}
      aria-label={nodeLabel(node, view, outside)}
      className={`relative flex h-10 rounded-lg border-2 font-mono text-sm motion-safe:transition-colors motion-safe:duration-200 ${
        outside && node.role === 'default' ? OUTSIDE_STYLE[outside] : ROLE_STYLE[node.role]
      } ${node.isNew ? 'border-dashed' : ''}`}
    >
      <span className="px-2 sm:px-2.5 flex items-center font-bold">{node.value}</span>
      <span
        className={`w-5 sm:w-6 flex items-center justify-center border-l ${node.linkChanged ? 'border-amber-300 text-amber-300' : 'border-slate-500/50 text-slate-400'}`}
      >
        {node.next === null ? '∅' : '•'}
      </span>
      {node.isNew && (
        <span className="absolute -top-2 -right-2 px-1 rounded text-[9px] font-bold bg-sky-400 text-slate-950">NEW</span>
      )}
      {ROLE_BADGE[node.role] && (
        <span data-role-badge={node.role} className={`absolute -top-2 -left-2 px-1 rounded text-[9px] font-bold text-slate-950 ${node.role === 'found' ? 'bg-emerald-300' : 'bg-amber-300'}`}>
          {ROLE_BADGE[node.role]}
        </span>
      )}
    </div>
    <span className="h-3 text-[10px] leading-3 font-mono text-slate-400">{node.position !== null ? `#${node.position}` : ''}</span>
    <div className="min-h-4 flex flex-wrap justify-center gap-1 max-w-[5.5rem]">
      {node.pointers.map(p => (
        <PointerChip key={p} name={p} />
      ))}
    </div>
  </motion.div>
);

const NullBox: React.FC<{ view: ListView; main: boolean }> = ({ view, main }) => (
  <div className="flex flex-col items-center gap-1">
    <div className="h-4 flex gap-1">
      {main && view.headNull && <EndChip label="HEAD" changed={view.change?.kind === 'head'} />}
      {main && view.tailNull && <EndChip label="TAIL" changed={view.change?.kind === 'tail'} />}
    </div>
    <div
      data-testid={main ? 'null-terminator' : undefined}
      data-null-terminator={main ? 'main' : 'segment'}
      data-pointers={main ? view.nullPointers.join(',') : ''}
      className="h-10 px-2 flex items-center rounded-lg border border-slate-600 bg-slate-950 text-xs font-mono font-bold text-slate-300"
    >
      NULL
    </div>
    <span className="h-3" />
    <div className="min-h-4 flex flex-wrap justify-center gap-1 max-w-[5.5rem]">
      {main && view.nullPointers.map(p => <PointerChip key={p} name={p} />)}
    </div>
  </div>
);

const Segment: React.FC<{ segment: ListSegmentView; view: ListView; animate: boolean; transitionMs: number }> = ({
  segment,
  view,
  animate,
  transitionMs,
}) => (
  <div
    data-testid="list-segment"
    data-reason={segment.reason}
    className={`flex flex-col gap-1 rounded-xl border border-dashed px-3 py-2 ${
      segment.reason === 'detached' ? 'border-rose-400/40 bg-rose-500/5' : 'border-amber-400/40 bg-amber-500/5'
    }`}
  >
    <span className="text-[11px] font-mono text-slate-300">
      {segment.reason === 'detached' ? 'Outside the list' : 'Not reachable from HEAD'}
    </span>
    <ol className="flex flex-wrap items-start gap-y-2" aria-label={segment.reason === 'detached' ? 'Nodes outside the list' : 'Nodes not reachable from HEAD'}>
      {segment.nodes.map((n, k) => (
        <li key={n.id} className="flex items-start">
          <NodeUnit node={n} view={view} outside={segment.reason} animate={animate} transitionMs={transitionMs} />
          <span className="mt-5">
            <Arrow from={n.id} to={n.next} changed={n.linkChanged} />
          </span>
          {k === segment.nodes.length - 1 &&
            (segment.end.kind === 'null' ? (
              <span className="mt-5">
                <NullBox view={view} main={false} />
              </span>
            ) : (
              <span
                data-segment-end={segment.end.id}
                className="mt-[1.6rem] h-10 px-2 flex items-center rounded-lg border border-slate-600 text-[11px] font-mono text-slate-300"
              >
                {segment.end.value} (#{segment.end.position})
              </span>
            ))}
        </li>
      ))}
    </ol>
  </div>
);

export const LinkedListVisualizer: React.FC<LinkedListVisualizerProps> = ({
  currentStep,
  previousStep,
  foundPosition,
  outcome = null,
  valueLabel,
  showPosition = false,
  stepIntervalMs,
}) => {
  const reduceMotion = useReducedMotion();
  const view = deriveListView(currentStep, { previous: previousStep, foundPosition });
  if (!view) return null;
  const animate = !reduceMotion;
  const transitionMs = barTransitionMs(stepIntervalMs);
  const vars = currentStep.variables ?? {};
  const value = typeof vars.value === 'number' ? vars.value : undefined;
  const index = showPosition && typeof vars.index === 'number' ? vars.index : undefined;
  const outcomeInfo = outcome ? OUTCOME_TEXT[outcome] : null;

  return (
    <div className="w-full flex flex-col gap-2" data-testid="list-visualizer" data-outcome={outcome ?? ''}>
      <div className="w-full min-h-60 bg-[#0B0F19]/90 border border-cyan-500/15 rounded-2xl px-2 sm:px-6 pb-4 pt-10 flex flex-col gap-4 relative overflow-hidden shadow-inner">
        {(value !== undefined || index !== undefined) && (
          <div className="absolute top-2 left-3 flex gap-2 z-10">
            {value !== undefined && (
              <span data-testid="value-pill" className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200">
                {(valueLabel ?? 'value').toLowerCase()} = {value}
              </span>
            )}
            {index !== undefined && (
              <span data-testid="index-pill" className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-400/50 text-purple-200">
                position = {index}
              </span>
            )}
          </div>
        )}

        <p className="sr-only" data-testid="list-summary">
          {view.summary}
        </p>

        <ol
          aria-label="Linked list from HEAD"
          data-testid="list-chain"
          className="flex flex-wrap items-start justify-center gap-y-3"
        >
          {view.chain.map(n => (
            <li key={n.id} className="flex items-start">
              <NodeUnit node={n} view={view} outside={false} animate={animate} transitionMs={transitionMs} />
              <span className="mt-5">
                <Arrow from={n.id} to={n.next} changed={n.linkChanged} />
              </span>
            </li>
          ))}
          <li className="flex items-start">
            <NullBox view={view} main />
          </li>
        </ol>
        {view.chain.length === 0 && (
          <p data-testid="list-empty" className="text-center text-[11px] font-mono text-slate-400">
            The list is empty: HEAD is NULL.
          </p>
        )}

        {(view.segments.length > 0 || view.released.length > 0) && (
          <div className="flex flex-wrap justify-center gap-3">
            {view.segments.map(g => (
              <Segment key={g.nodes[0].id} segment={g} view={view} animate={animate} transitionMs={transitionMs} />
            ))}
            {view.released.map(r => (
              <div
                key={r.id}
                data-testid="released-node"
                data-value={r.value}
                className="flex items-center gap-2 rounded-xl border border-dashed border-slate-600 px-3 py-2 text-[11px] font-mono text-slate-300"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-300" aria-hidden="true" />
                <span>
                  node <span className="line-through">{r.value}</span> released
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {outcome && outcomeInfo && (
        <div
          role="status"
          data-testid="outcome-banner"
          data-outcome-kind={outcome}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold ${outcomeInfo.tone}`}
        >
          <outcomeInfo.Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          {outcomeText(outcome, foundPosition, currentStep.state.length)}
        </div>
      )}
    </div>
  );
};
