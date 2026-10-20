import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import { MessageSquare, ArrowRightLeft, Target, Layers, Variable, CheckCircle, XCircle } from 'lucide-react';
import type { ListSnapshot } from '../../types/algorithm';
import { indexFromHead, nodeById } from '../../engine/linkedList/listSnapshot';
import { listText } from './listVisuals';

/** "4 (#0)", "9 (outside the list)" or "NULL": where a list pointer points, read from the snapshot. */
const pointsTo = (s: ListSnapshot, id: string | null) => {
  if (id === null) return 'NULL';
  const k = indexFromHead(s, id);
  return `${nodeById(s, id)?.value} (${k >= 0 ? `#${k}` : 'outside the list'})`;
};

export const ExplanationPanel: React.FC = () => {
  const { steps, currentStepIndex } = useVisualizerStore();
  const reduceMotion = useReducedMotion();
  const currentStep = steps[currentStepIndex];

  if (!currentStep) return null;

  const {
    message,
    explanation,
    comparedValues,
    actionLabel = 'Execute',
    indices = [],
    state = [],
    type,
    variables,
    pointers,
    result,
  } = currentStep;

  // linked-list steps describe the list and its pointers; array steps the array and its indices
  const list = currentStep.list;
  const stateString = list ? listText(state) : `[${state.join(', ')}]`;

  // Dynamic styling per step type
  let badgeColor = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
  let accentColor = 'border-cyan-500/30';
  if (type === 'swap') { badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40'; accentColor = 'border-rose-500/30'; }
  if (type === 'compare' || type === 'condition') { badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40'; accentColor = 'border-amber-500/30'; }
  if (type === 'sorted' || type === 'found' || type === 'complete') { badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'; accentColor = 'border-emerald-500/30'; }
  if (type === 'loop-start' || type === 'loop-condition') { badgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/40'; accentColor = 'border-purple-500/30'; }

  // Build variables display - merge variables + pointers
  const varEntries = Object.entries(variables || {});
  const ptrEntries: [string, string | number][] = list
    ? [['HEAD', pointsTo(list, list.head)], ['TAIL', pointsTo(list, list.tail)], ...Object.entries(list.pointers).map(([k, v]): [string, string] => [k, pointsTo(list, v)])]
    : Object.entries(pointers || {});

  return (
    <div role="region" aria-label="Explanation" className={`bg-surface border rounded-2xl p-5 shadow-xl space-y-4 ${accentColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              WHAT'S HAPPENING?
            </h3>
            <p className="text-[11px] text-slate-400">
              Step {currentStepIndex + 1} of {steps.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* No AnimatePresence / exit animation: with mode="wait" the previous step's TRUE/FALSE stayed on screen
              for its whole exit (up to ~300 ms, longer than a fast step). A new result replaces the old one in the same
              render; only its entrance is animated, briefly, and not at all for users who prefer reduced motion. */}
          {result && (
            <motion.span
              key={result}
              data-testid="step-result"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.12 }}
              className={`flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${
                result === 'true'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}
            >
              {result === 'true'
                ? <CheckCircle className="w-3 h-3" />
                : <XCircle className="w-3 h-3" />
              }
              {result === 'true' ? 'TRUE' : 'FALSE'}
            </motion.span>
          )}
          <span className={`text-xs font-mono font-semibold px-3 py-1 rounded-full border ${badgeColor}`}>
            {actionLabel}
          </span>
        </div>
      </div>

      {/* Main Explanation Block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Step Message & Detail */}
        <div className="lg:col-span-2 space-y-2 bg-slate-900/60 p-4 rounded-xl border border-slate-800/60">
          <div data-testid="step-message" className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            {message}
          </div>
          <p data-testid="step-explanation" className="text-xs text-slate-400 leading-relaxed font-sans">
            {explanation}
          </p>

          {/* Live Variables / Pointers Row */}
          {(varEntries.length > 0 || ptrEntries.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {varEntries.map(([key, val]) => (
                <motion.span
                  key={key}
                  layout
                  className="flex items-center gap-1 text-[11px] font-mono bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded"
                >
                  <Variable className="w-3 h-3 text-purple-400 shrink-0" />
                  <span className="text-slate-400">{key}</span>
                  <span className="text-purple-300 font-bold">= {String(val)}</span>
                </motion.span>
              ))}
              {ptrEntries.map(([key, val]) => (
                <motion.span
                  key={`ptr-${key}`}
                  data-pointer-readout={key}
                  layout
                  className="flex items-center gap-1 text-[11px] font-mono bg-cyan-900/30 border border-cyan-700/40 px-2 py-0.5 rounded"
                >
                  <span className="text-cyan-500">{list ? '→' : '↓'}</span>
                  <span className="text-slate-400">{key}</span>
                  <span className="text-cyan-300 font-bold">{list ? '' : '= '}{val}</span>
                </motion.span>
              ))}
            </div>
          )}
        </div>

        {/* Right 1 Col: Dynamic Step Parameters */}
        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800/60 space-y-2 font-mono text-xs">
          {/* Comparing Values */}
          <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
            <span className="text-slate-400 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
              Comparing:
            </span>
            <span data-testid="comparing-values" className="text-amber-300 font-bold">
              {comparedValues ? `${comparedValues.val1} vs ${comparedValues.val2}` : 'N/A'}
            </span>
          </div>

          {/* Action */}
          <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-cyan-400" />
              Action:
            </span>
            <span className="text-cyan-300 font-bold capitalize">
              {type}
            </span>
          </div>

          {/* Indices */}
          <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              {list ? 'Positions:' : 'Indices:'}
            </span>
            <span data-testid="step-positions" className="text-purple-300 font-bold">
              {indices.length > 0 ? `[${indices.join(', ')}]` : 'None'}
            </span>
          </div>

          {/* Array State */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-slate-400">{list ? 'List:' : 'Array State:'}</span>
            <span data-testid="step-state" title={stateString} className={`text-emerald-400 font-bold ${list ? 'text-right break-words max-w-[180px]' : 'truncate max-w-[140px]'}`}>
              {stateString}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
