import React from 'react';
import type { NumberCell } from '../../types/algorithm';

const CELL_TONE: Record<'changed' | 'current' | 'none', string> = {
  changed: 'bg-emerald-500/15 border-emerald-400 text-emerald-300 scale-105 shadow-lg shadow-emerald-500/10',
  current: 'bg-amber-500/15 border-amber-400/70 text-amber-200',
  none: 'bg-slate-900/80 border-slate-700 text-slate-300',
};

/** how a cell's role is said in words (the colour is never the only signal) */
const ROLE_TEXT = { changed: 'changed', current: 'in use' } as const;

const SIZE = {
  // the number algorithms' main view
  // (explicit line heights: a "—" or a placeholder can fall back to another font, which must not change a card's height)
  large: { box: 'min-w-[5.5rem] flex-1 sm:flex-none rounded-2xl px-4 py-3', value: 'text-2xl leading-8 sm:text-3xl sm:leading-9' },
  // beside an array's bars
  compact: { box: 'min-w-[4.5rem] rounded-xl px-3 py-1.5', value: 'text-lg leading-7' },
} as const;

/** One named value as a card (a <div> of <dt>/<dd>, so it belongs inside a <dl>): its name, its value and its role. */
export const ValueCard: React.FC<{ cell: NumberCell; transitionMs: number; size?: keyof typeof SIZE }> = ({ cell, transitionMs, size = 'large' }) => {
  const role = cell.role ?? 'none';
  return (
    <div
      data-number-cell={cell.name}
      data-role={cell.role ?? ''}
      style={{ transitionDuration: `${transitionMs}ms` }}
      className={`${SIZE[size].box} border text-center transition-[transform,background-color,border-color] motion-reduce:transition-none motion-reduce:scale-100 ${CELL_TONE[role]}`}
    >
      <dt className="text-[11px] leading-4 font-mono text-slate-400">{cell.name}</dt>
      <dd className={`${SIZE[size].value} font-mono font-bold text-ink tabular-nums`} data-number-value>
        {cell.value === null ? <span className="text-slate-500">—</span> : cell.value}
        {cell.value === null && <span className="sr-only">not set</span>}
      </dd>
      {/* the role line is always there, so a card keeps its height from step to step (the controls below never jump);
          without a role it is an invisible placeholder, hidden from assistive technology */}
      {cell.role ? (
        <dd className="text-[10px] leading-4 font-mono uppercase tracking-wide mt-0.5">{ROLE_TEXT[cell.role]}</dd>
      ) : (
        <dd aria-hidden="true" className="text-[10px] leading-4 font-mono uppercase tracking-wide mt-0.5 invisible">
          {'\u00a0'}
        </dd>
      )}
    </div>
  );
};
