import React from 'react';
import { CheckCircle2, XCircle, Equal } from 'lucide-react';
import type { CharMark, ExecutionStep, TextRow } from '../../types/algorithm';
import { ValueCard } from './ValueCards';

interface TextVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

const MARK_TONE: Record<CharMark | 'none', string> = {
  current: 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold',
  compare: 'bg-sky-500/15 border-sky-400/70 text-sky-200',
  match: 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300',
  mismatch: 'bg-rose-500/20 border-rose-400 text-rose-300 font-bold',
  skipped: 'bg-slate-900/40 border-dashed border-slate-700 text-slate-400 line-through',
  done: 'bg-slate-900/60 border-slate-700 text-slate-400',
  none: 'bg-slate-900/80 border-slate-700 text-slate-200',
};

/** how each mark is said (the colour is never the only signal) */
const MARK_TEXT: Record<CharMark, string> = {
  current: 'current',
  compare: 'compared with',
  match: 'matched',
  mismatch: 'mismatch',
  skipped: 'skipped',
  done: 'done',
};

const STACK_ACTION = {
  push: { text: 'pushed', tone: 'text-emerald-300' },
  pop: { text: 'popped', tone: 'text-amber-200' },
  mismatch: { text: 'top does not match', tone: 'text-rose-300' },
  empty: { text: 'empty', tone: 'text-slate-400' },
} as const;

const RESULT_TONE = {
  yes: { tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', Icon: CheckCircle2 },
  no: { tone: 'bg-rose-500/15 border-rose-500/40 text-rose-300', Icon: XCircle },
  answer: { tone: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300', Icon: Equal },
} as const;

/** a cell column: the first column of every row is kept for a pointer before the string (index -1) */
const CELL = 'w-6 sm:w-7 shrink-0';

const shown = (c: string) => (c === ' ' ? '␣' : c);
const spoken = (c: string) => (c === ' ' ? 'space' : c);

/** "matched at 0, 1; current at 2" — what the marks of a row say, for assistive technology */
function describeMarks(row: TextRow): string {
  const groups = new Map<CharMark, number[]>();
  for (const m of row.marks ?? []) groups.set(m.mark, [...(groups.get(m.mark) ?? []), m.index]);
  return [...groups].map(([mark, indices]) => `${MARK_TEXT[mark]} at ${indices.join(', ')}`).join('; ');
}

const Row: React.FC<{ row: TextRow; columns: number; transitionMs: number }> = ({ row, columns, transitionMs }) => {
  const offset = row.offset ?? 0;
  const markAt = new Map((row.marks ?? []).map(m => [m.index, m.mark]));
  const pointersAt = new Map<number, string[]>();
  for (const p of row.pointers ?? []) pointersAt.set(p.index, [...(pointersAt.get(p.index) ?? []), p.name]);
  // grid column c holds character c - 1 - offset (column 0 and the columns before offset are empty)
  const indexOf = (c: number) => c - 1 - offset;
  const pointerText = (row.pointers ?? []).map(p => `${p.name} at ${p.index}`).join(', ');
  const marksText = describeMarks(row);

  return (
    <div role="group" aria-label={`${row.name} = ${JSON.stringify(row.text)}`} data-testid="text-row" data-row={row.name} className="flex items-start gap-2">
      <span className="w-28 sm:w-32 shrink-0 pt-2 text-[11px] font-mono text-slate-400 text-right truncate" aria-hidden="true" title={row.name}>
        {row.name}
      </span>
      <div className="flex flex-col">
        <div className="flex gap-0.5" aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => {
            const i = indexOf(c);
            if (i < 0 || i >= row.text.length) return <span key={c} className={`${CELL} h-9`} />;
            const mark = markAt.get(i);
            return (
              <span
                key={c}
                data-index={i}
                data-char={row.text[i]}
                data-mark={mark ?? ''}
                style={{ transitionDuration: `${transitionMs}ms` }}
                className={`${CELL} h-9 rounded-md border flex items-center justify-center text-sm font-mono transition-colors motion-reduce:transition-none ${MARK_TONE[mark ?? 'none']}`}
              >
                {shown(row.text[i])}
              </span>
            );
          })}
        </div>
        <div className="flex gap-0.5" aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => {
            const i = indexOf(c);
            return (
              <span key={c} className={`${CELL} text-center text-[9px] leading-3 font-mono text-slate-500`}>
                {i >= 0 && i < row.text.length ? i : ''}
              </span>
            );
          })}
        </div>
        {(row.pointers?.length ?? 0) > 0 && (
          <div className="flex gap-0.5" aria-hidden="true">
            {Array.from({ length: columns }, (_, c) => {
              const names = pointersAt.get(indexOf(c));
              return (
                <span key={c} className={`${CELL} text-center text-[10px] leading-4 font-mono font-bold text-cyan-300 whitespace-nowrap overflow-visible`}>
                  {names ? (
                    <span data-pointer={names.join(',')} data-index={indexOf(c)}>
                      ▲<br />
                      {names.join(',')}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <span className="sr-only">
        {row.name}: {row.text.length === 0 ? 'empty' : [...row.text].map(spoken).join(' ')}.{pointerText ? ` ${pointerText}.` : ''}
        {marksText ? ` ${marksText}.` : ''}
      </span>
    </div>
  );
};

/**
 * Text algorithms (visual: 'text'): the step's strings as rows of character cells, aligned on a shared grid (a needle
 * under its alignment, binary digits by place), with pointers under them; the stack and the named values beside them;
 * and the final answer. Everything shown comes from the step itself (ExecutionStep.text).
 */
export const TextVisualizer: React.FC<TextVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.text;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  // one column for a pointer before the strings, the widest row, and one for a pointer just past its end
  const columns = 2 + Math.max(0, ...view.rows.map(r => (r.offset ?? 0) + r.text.length));
  const result = view.result ? RESULT_TONE[view.result.kind] : null;
  const action = view.stack?.action ? STACK_ACTION[view.stack.action] : null;

  return (
    <div className="w-full flex flex-col gap-2" data-testid="text-visualizer" data-result={view.result?.kind ?? ''}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-5 relative overflow-hidden shadow-inner flex flex-col items-center justify-center gap-5">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="text-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}

        {/* long strings scroll sideways here instead of widening the page; focusable so keyboard users can scroll it */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Strings at this step"
          data-testid="text-rows"
          className="relative z-10 max-w-full overflow-x-auto pb-1 flex flex-col gap-3 rounded-lg"
        >
          {view.rows.map(row => (
            <Row key={row.name} row={row} columns={columns} transitionMs={transitionMs} />
          ))}
        </div>

        {view.stack && (
          <div className="relative z-10 flex flex-wrap items-center justify-center gap-2" data-testid="text-stack" data-action={view.stack.action ?? ''}>
            <span className="text-[11px] font-mono text-slate-400">stack (bottom → top):</span>
            <ol aria-label={`Stack, bottom to top: ${view.stack.items.length ? view.stack.items.join(' ') : 'empty'}`} className="flex items-center gap-1">
              {view.stack.items.length === 0 && <li className="text-[11px] font-mono text-slate-500">empty</li>}
              {view.stack.items.map((item, k) => {
                const top = k === view.stack!.items.length - 1;
                return (
                  <li
                    key={k}
                    data-stack-item={item}
                    data-top={top ? 'true' : 'false'}
                    className={`w-7 h-8 flex items-center justify-center rounded-md border font-mono text-sm ${
                      top
                        ? view.stack!.action === 'mismatch'
                          ? 'bg-rose-500/20 border-rose-400 text-rose-300 font-bold'
                          : 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                        : 'bg-slate-900/80 border-slate-700 text-slate-200'
                    }`}
                  >
                    {item}
                    {top && <span className="sr-only"> (top)</span>}
                  </li>
                );
              })}
            </ol>
            {action && <span className={`text-[11px] font-mono font-bold ${action.tone}`}>{action.text}</span>}
          </div>
        )}

        {view.cells && (
          <dl aria-label="Values at this step" className="relative z-10 w-full flex flex-wrap justify-center gap-2">
            {view.cells.map(cell => (
              <ValueCard key={cell.name} cell={cell} transitionMs={transitionMs} size="compact" />
            ))}
          </dl>
        )}
      </div>

      {view.result && result && (
        <div
          role="status"
          data-testid="text-result"
          data-result-kind={view.result.kind}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold ${result.tone}`}
        >
          <result.Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          {view.result.text}
        </div>
      )}
    </div>
  );
};
