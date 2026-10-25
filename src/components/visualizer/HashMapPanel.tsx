import React from 'react';
import type { HashMapView } from '../../types/algorithm';

const ENTRY_TONE = {
  found: 'bg-emerald-500/15 border-emerald-400 text-emerald-300 font-bold',
  insert: 'bg-cyan-500/15 border-cyan-400 text-cyan-200 font-bold',
  update: 'bg-amber-500/15 border-amber-400 text-amber-200 font-bold',
  none: 'bg-slate-900/80 border-slate-700 text-slate-300',
} as const;

/** what happened to an entry at this step, in words (the colour is never the only signal) */
const MARK_TEXT = { found: 'found', insert: 'added', update: 'updated' } as const;

/**
 * A hash map at the current step (ExecutionStep.hashMap): its entries in insertion order, the key this step looked up
 * (found, or not in the map) and the entry it wrote (added or updated).
 */
export const HashMapPanel: React.FC<{ map: HashMapView; transitionMs: number }> = ({ map, transitionMs }) => {
  const { lookup, write } = map;
  const markOf = (key: number): keyof typeof MARK_TEXT | null =>
    lookup?.found && lookup.key === key ? 'found' : write?.key === key ? write.kind : null;

  return (
    <section
      data-testid="hash-map"
      aria-label={`Hash map ${map.name} (${map.keyLabel} → ${map.valueLabel})`}
      className="flex-1 min-w-0 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2"
    >
      <p className="text-[11px] font-mono text-slate-400 mb-1.5">
        <span className="text-slate-300 font-bold">{map.name}</span> · {map.keyLabel} → {map.valueLabel} ·{' '}
        <span data-testid="hash-map-size">
          {map.entries.length} entr{map.entries.length === 1 ? 'y' : 'ies'}
        </span>
      </p>
      {map.entries.length === 0 ? (
        <p className="text-[11px] font-mono text-slate-500">empty</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {map.entries.map(e => {
            const mark = markOf(e.key);
            return (
              <li
                key={e.key}
                data-key={e.key}
                data-value={e.value}
                data-mark={mark ?? ''}
                style={{ transitionDuration: `${transitionMs}ms` }}
                className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono tabular-nums transition-colors motion-reduce:transition-none ${ENTRY_TONE[mark ?? 'none']}`}
              >
                {e.key} → {e.value}
                {mark && <span className="ml-1 text-[9px] uppercase tracking-wide">{MARK_TEXT[mark]}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {lookup && (
        <p data-testid="hash-lookup" data-found={lookup.found ? 'true' : 'false'} className="mt-1.5 text-[11px] font-mono text-slate-400">
          lookup {lookup.key}:{' '}
          {lookup.found ? (
            <span className="text-emerald-300 font-bold">
              found → {map.entries.find(e => e.key === lookup.key)?.value}
            </span>
          ) : (
            <span className="text-rose-300 font-bold">not in {map.name}</span>
          )}
        </p>
      )}
    </section>
  );
};
