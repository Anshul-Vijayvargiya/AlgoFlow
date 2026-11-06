import React from 'react';
import { Equal } from 'lucide-react';
import type { BitRow, BitState, ExecutionStep } from '../../types/algorithm';

interface BitVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

const CELL_TONE: Record<BitState, string> = {
  unchanged: 'bg-slate-900/80 border-slate-700 text-slate-200',
  selected: 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold',
  set: 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold',
  cleared: 'bg-rose-500/15 border-rose-400 text-rose-200 font-bold',
  flipped: 'bg-sky-500/15 border-sky-400 text-sky-200 font-bold',
  shifted: 'bg-cyan-500/15 border-cyan-400 text-cyan-200',
  pending: 'bg-slate-900/40 border-dashed border-slate-700 text-slate-400',
};

/** how each state is said (the colour is never the only signal) */
const STATE_TEXT: Record<BitState, string> = {
  unchanged: 'unchanged',
  selected: 'selected',
  set: 'set to 1',
  cleared: 'cleared to 0',
  flipped: 'flipped',
  shifted: 'shifted',
  pending: 'not worked out yet',
};

const BYTES = [
  [31, 30, 29, 28, 27, 26, 25, 24],
  [23, 22, 21, 20, 19, 18, 17, 16],
  [15, 14, 13, 12, 11, 10, 9, 8],
  [7, 6, 5, 4, 3, 2, 1, 0],
];

const ROLE_TEXT: Record<BitRow['role'], string> = { input: 'input', mask: 'mask', intermediate: 'step', output: 'output' };

const stateAt = (row: BitRow, position: number): BitState =>
  row.pendingFrom !== undefined && position >= row.pendingFrom ? 'pending' : (row.states?.[position] ?? 'unchanged');
const bitOf = (row: BitRow, position: number) => (row.value >>> position) & 1;

/** the row's bits as text, position 31 first; a position not worked out yet is a dot */
const binaryOf = (row: BitRow) =>
  BYTES.flat()
    .map(p => (stateAt(row, p) === 'pending' ? '·' : String(bitOf(row, p))))
    .join('');

/** the positions in a state other than unchanged, for assistive technology */
function statesInWords(row: BitRow): string {
  const groups = new Map<BitState, number[]>();
  for (const p of BYTES.flat()) {
    const s = stateAt(row, p);
    if (s !== 'unchanged') groups.set(s, [...(groups.get(s) ?? []), p]);
  }
  return [...groups].map(([s, ps]) => `${STATE_TEXT[s]}: position${ps.length === 1 ? '' : 's'} ${ps.join(', ')}`).join('; ');
}

/**
 * Bit manipulation (visual: 'bits'): each 32-bit value of the current step as a row of bits, with its position labels
 * (0 is the rightmost), its signed and unsigned values and what each bit is doing. The four bytes wrap on a narrow screen
 * instead of widening the page. Everything shown comes from the step itself (ExecutionStep.bits).
 */
export const BitVisualizer: React.FC<BitVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.bits;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const used = [...new Set(view.rows.flatMap(row => BYTES.flat().map(p => stateAt(row, p))))].filter(s => s !== 'unchanged');

  return (
    <div className="w-full flex flex-col gap-2" data-testid="bit-visualizer">
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="bit-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}

        <p className="relative z-10 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] font-mono">
          <span data-testid="bit-expression" className="font-bold text-cyan-300">
            {view.operation}
          </span>
          <span data-testid="bit-interpretation" className="text-slate-400">
            {view.interpretation}; position 0 is the rightmost bit
          </span>
        </p>

        <div className="relative z-10 flex flex-col gap-3">
          {view.rows.map(row => {
            const done = row.pendingFrom === undefined;
            const words = statesInWords(row);
            return (
              <div
                key={row.id}
                data-testid="bit-row"
                data-row={row.id}
                data-role={row.role}
                data-signed={done ? row.value : ''}
                data-unsigned={done ? row.value >>> 0 : ''}
                data-binary={binaryOf(row)}
                className="flex flex-col gap-1"
              >
                <p className="flex flex-wrap items-baseline gap-x-3 text-[11px] font-mono">
                  <span className="font-bold text-slate-200">{row.label}</span>
                  <span className="text-slate-400">{ROLE_TEXT[row.role]}</span>
                  {done ? (
                    <>
                      <span className="text-slate-300">
                        signed: <span className="font-bold text-cyan-300">{row.value}</span>
                      </span>
                      <span className="text-slate-300">
                        unsigned: <span className="font-bold text-cyan-300">{row.value >>> 0}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">being worked out</span>
                  )}
                </p>
                <p className="sr-only">
                  {row.label}: {done ? `${row.value} as signed, ${row.value >>> 0} as unsigned` : 'being worked out'}; bits from position 31 to 0: {binaryOf(row)}.{words ? ` ${words}.` : ''}
                </p>
                <div aria-hidden="true" className="flex flex-wrap gap-x-2 gap-y-1">
                  {BYTES.map(byte => (
                    <div key={byte[0]} className="flex gap-px">
                      {byte.map(p => {
                        const state = stateAt(row, p);
                        return (
                          <span key={p} className="flex flex-col items-center">
                            <span className={`w-4 text-center text-[9px] leading-3 font-mono ${p === view.position ? 'font-bold text-amber-200' : 'text-slate-400'}`}>{p}</span>
                            <span
                              data-pos={p}
                              data-bit={state === 'pending' ? '' : bitOf(row, p)}
                              data-state={state}
                              style={{ transitionDuration: `${transitionMs}ms` }}
                              className={`w-4 h-6 flex items-center justify-center rounded-sm border text-[11px] font-mono transition-colors motion-reduce:transition-none ${CELL_TONE[state]}`}
                            >
                              {state === 'pending' ? '·' : bitOf(row, p)}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {view.discarded && view.discarded.length > 0 && (
          <p data-testid="bit-discarded" data-bits={view.discarded.join('')} className="relative z-10 text-[11px] font-mono text-slate-300">
            <span className="text-slate-400">discarded bits (first lost first): </span>
            <span className="font-bold line-through">{view.discarded.join(' ')}</span>
          </p>
        )}

        {used.length > 0 && (
          <ul data-testid="bit-legend" aria-label="What the highlighted bits mean" className="relative z-10 flex flex-wrap gap-2 text-[10px] font-mono text-slate-300">
            {used.map(s => (
              <li key={s} data-legend={s} className="flex items-center gap-1">
                <span aria-hidden="true" className={`w-3 h-3 rounded-sm border ${CELL_TONE[s]}`} />
                {STATE_TEXT[s]}
              </li>
            ))}
          </ul>
        )}
      </div>

      {view.result && (
        <div role="status" data-testid="bit-result" className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300">
          <Equal className="w-4 h-4 shrink-0" aria-hidden="true" />
          {view.result.text}
        </div>
      )}
    </div>
  );
};
