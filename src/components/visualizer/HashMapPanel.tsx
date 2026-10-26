import React, { useLayoutEffect, useRef } from 'react';
import type { HashMapView } from '../../types/algorithm';

const ENTRY_TONE = {
  found: 'bg-emerald-500/15 border-emerald-400 text-emerald-300 font-bold',
  insert: 'bg-cyan-500/15 border-cyan-400 text-cyan-200 font-bold',
  update: 'bg-amber-500/15 border-amber-400 text-amber-200 font-bold',
  none: 'bg-slate-900/80 border-slate-700 text-slate-300',
} as const;

/** what happened to an entry at this step, in words (the colour is never the only signal) */
const MARK_TEXT = { found: 'found', insert: 'added', update: 'updated' } as const;

type MapShape = Pick<HashMapView, 'name' | 'keyLabel' | 'valueLabel'>;

/**
 * A hash map at the current step (ExecutionStep.hashMap): its entries in insertion order, the key this step looked up
 * (found, or not in the map) and the entry it wrote (added or updated). `map` is null on steps before the trace creates
 * it; the panel then keeps its place ("not created yet").
 *
 * The panel has the same height at every step, so nothing below it (the playback controls) moves during playback:
 * the entries sit in a fixed-height area that scrolls inside itself when they need more rows, and the lookup line is
 * always there (an invisible placeholder on steps without a lookup).
 */
export const HashMapPanel: React.FC<{ map: HashMapView | null; shape: MapShape; transitionMs: number }> = ({ map, shape, transitionMs }) => {
  const lookup = map?.lookup;
  const write = map?.write;
  const markOf = (key: number): keyof typeof MARK_TEXT | null =>
    lookup?.found && lookup.key === key ? 'found' : write?.key === key ? write.kind : null;
  const entriesRef = useRef<HTMLDivElement>(null);

  // keep the entry this step touched in view, scrolling only the entries area (never the page)
  useLayoutEffect(() => {
    const area = entriesRef.current;
    const marked = area?.querySelector<HTMLElement>('li[data-mark]:not([data-mark=""])');
    if (!area || !marked) return;
    const top = marked.offsetTop - area.offsetTop;
    if (top < area.scrollTop) area.scrollTop = top;
    else if (top + marked.offsetHeight > area.scrollTop + area.clientHeight) area.scrollTop = top + marked.offsetHeight - area.clientHeight;
  }, [map]);

  return (
    <section
      data-testid="hash-map"
      data-created={map ? 'true' : 'false'}
      aria-label={`Hash map ${shape.name} (${shape.keyLabel} → ${shape.valueLabel})`}
      className="flex-1 min-w-0 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2"
    >
      <p className="text-[11px] font-mono text-slate-400 mb-1.5">
        <span className="text-slate-300 font-bold">{shape.name}</span> · {shape.keyLabel} → {shape.valueLabel} ·{' '}
        <span data-testid="hash-map-size">
          {map ? `${map.entries.length} entr${map.entries.length === 1 ? 'y' : 'ies'}` : 'not created yet'}
        </span>
      </p>
      {/* three rows of entries; more scroll inside this area (focusable, so keyboard users can scroll it too) */}
      <div
        ref={entriesRef}
        role="group"
        aria-label={`${shape.name} entries`}
        tabIndex={0}
        data-testid="hash-map-entries"
        className="h-[4.75rem] overflow-y-auto rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
      >
        {!map || map.entries.length === 0 ? (
          <p className="text-[11px] font-mono text-slate-500">{map ? 'empty' : '—'}</p>
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
      </div>
      {lookup ? (
        <p data-testid="hash-lookup" data-found={lookup.found ? 'true' : 'false'} className="mt-1.5 text-[11px] font-mono text-slate-400">
          lookup {lookup.key}:{' '}
          {lookup.found ? (
            <span className="text-emerald-300 font-bold">found → {map!.entries.find(e => e.key === lookup.key)?.value}</span>
          ) : (
            <span className="text-rose-300 font-bold">not in {shape.name}</span>
          )}
        </p>
      ) : (
        <p aria-hidden="true" className="mt-1.5 text-[11px] font-mono invisible">
          {'\u00a0'}
        </p>
      )}
    </section>
  );
};
