import React from 'react';
import type { NumberSearchView } from '../../types/algorithm';

/** where a value sits on the original range, in % (the whole bar when the range is a single number) */
const at = (v: number, from: number, to: number) => (to === from ? 0 : Math.max(0, Math.min(100, ((v - from) / (to - from)) * 100)));

const RELATION_TONE = {
  '<': 'border-cyan-500/40 text-cyan-200',
  '=': 'border-emerald-400 text-emerald-300 font-bold',
  '>': 'border-rose-500/40 text-rose-300',
} as const;

/**
 * Binary search over whole numbers (ExecutionStep.numbers.search): the range [lo, hi] still searched, drawn on the
 * original range with mid marked, and every probe so far (the mid tried, the value it gives, how that compares with the
 * target). The range is also given in words, so the bar is decoration.
 */
export const NumberSearchPanel: React.FC<{ search: NumberSearchView; transitionMs: number }> = ({ search, transitionMs }) => {
  const { from, to, lo, hi, mid, probes, target, valueLabel } = search;
  const over = lo > hi;
  const left = at(lo, from, to);
  const right = at(hi, from, to);
  const current = mid !== undefined && probes.length > 0 && probes[probes.length - 1].mid === mid ? probes.length - 1 : -1;

  return (
    <div className="relative z-10 w-full space-y-2" data-testid="number-search" data-lo={lo} data-hi={hi} data-mid={mid ?? ''}>
      <p className="text-center text-[11px] font-mono text-slate-400" data-testid="number-search-range">
        {over ? `Search over: lo = ${lo} > hi = ${hi}` : `Searching lo = ${lo} … hi = ${hi}${mid !== undefined ? `, mid = ${mid}` : ''}`}
      </p>
      <div aria-hidden="true" className="px-1">
        <div className="relative h-3 rounded-full bg-slate-800 overflow-visible">
          {!over && (
            <div
              data-testid="number-search-window"
              style={{ left: `${left}%`, width: `max(${right - left}%, 4px)`, transitionDuration: `${transitionMs}ms` }}
              className="absolute inset-y-0 rounded-full bg-cyan-500/40 border border-cyan-400/70 transition-[left,width] motion-reduce:transition-none"
            />
          )}
          {mid !== undefined && !over && (
            <div
              style={{ left: `${at(mid, from, to)}%`, transitionDuration: `${transitionMs}ms` }}
              className="absolute -top-1 -bottom-1 w-1 -translate-x-1/2 rounded bg-amber-400 transition-[left] motion-reduce:transition-none"
            />
          )}
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-mono text-slate-500">
          <span>{from}</span>
          <span>{to}</span>
        </div>
      </div>
      <p className="text-center text-[11px] font-mono text-slate-400">
        {probes.length === 0 ? 'No probes yet' : `Probes (${probes.length})`}
      </p>
      {probes.length > 0 && (
        <ol className="flex flex-wrap justify-center gap-1.5">
          {probes.map((p, k) => (
            <li
              key={k}
              data-mid={p.mid}
              data-relation={p.relation}
              data-current={k === current ? 'true' : 'false'}
              aria-current={k === current ? 'step' : undefined}
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono bg-slate-900/80 break-all ${RELATION_TONE[p.relation]} ${
                k === current ? 'ring-2 ring-amber-400/80' : ''
              }`}
            >
              mid = {p.mid} · {valueLabel} = {p.value} {p.relation} {target}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
