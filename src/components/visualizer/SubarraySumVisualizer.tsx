import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, PrefixMapRange, PrefixMapView } from '../../types/algorithm';

interface SubarraySumVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/** a number as shown: a true minus sign for negatives */
const num = (x: number) => (x < 0 ? `−${-x}` : String(x));
const list = (xs: readonly number[]) => `[${xs.map(num).join(', ')}]`;
const rangeWords = (nums: readonly number[], r: PrefixMapRange) => `nums[${r.start}..${r.end}] = ${list(nums.slice(r.start, r.end + 1))}`;

/** the running values shown as cards, in the order the loop body sets them */
const CARDS = ['k', 'nums[i]', 'prefix', 'need', 'count'] as const;
type Card = (typeof CARDS)[number];
const MEANING: Record<Card, string> = {
  k: 'the sum to find',
  'nums[i]': 'the number at i',
  prefix: 'sum of nums[0..i]',
  need: 'prefix − k: the earlier prefix sum to look for',
  count: 'subarrays found so far — the answer',
};
/** which card each step sets */
const SETS: Partial<Record<PrefixMapView['operation'], Card>> = {
  'init-count': 'count',
  'init-prefix': 'prefix',
  'add-prefix': 'prefix',
  'calc-need': 'need',
  lookup: 'count',
};

/** the number being processed, while the loop body runs */
const currentIndex = (view: PrefixMapView) =>
  view.i !== null && view.i < view.nums.length && view.operation !== 'start' && view.operation !== 'done' ? view.i : null;

/** P(0) .. P(n), computed here from the numbers themselves (P(j): the sum of the first j numbers) */
function prefixSums(nums: readonly number[]): number[] {
  const out = [0];
  for (const x of nums) out.push(out[out.length - 1] + x);
  return out;
}

/**
 * The subarrays a step may show, checked here against the numbers themselves rather than trusted: each is a real range
 * of whole positions inside the array, its numbers add up to exactly k, it ends no later than the number being
 * processed (exactly there for this step's matches), and none is listed twice; and there are exactly as many as the
 * count they stand behind. A step that breaks this (only a made-up one could) shows none of them rather than a wrong
 * history. count, the map and every value are always shown as the step gives them.
 */
function checked(view: PrefixMapView, ranges: readonly PrefixMapRange[], expected: number | null, endsAt: number | null, lastEnd: number | null): readonly PrefixMapRange[] {
  if (expected === null || ranges.length !== expected) return [];
  const n = view.nums.length;
  const seen = new Set<string>();
  for (const r of ranges) {
    const whole = Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.start <= r.end && r.end < n;
    if (!whole) return [];
    if (endsAt !== null && r.end !== endsAt) return [];
    if (lastEnd === null || r.end > lastEnd) return [];
    let sum = 0;
    for (let p = r.start; p <= r.end; p++) sum += view.nums[p];
    if (sum !== view.k) return [];
    const id = `${r.start}-${r.end}`;
    if (seen.has(id)) return [];
    seen.add(id);
  }
  return ranges;
}

/** the last position a counted subarray can end at on this step */
function lastCounted(view: PrefixMapView): number | null {
  if (view.operation === 'done') return view.nums.length - 1;
  if (view.i === null) return null;
  // once this index's lookup has been made (lookup, store), it may end at i; before that, at i - 1
  return view.operation === 'lookup' || view.operation === 'store' ? view.i : view.i - 1;
}

/**
 * Subarray Sum Equals K (visual: 'prefix-map'): the numbers as cells with the one being processed marked; under them,
 * one lane per subarray this step's lookup counted; the prefix sums P(0) .. P(n), those already recorded in the map, the
 * one just computed, and the earlier ones equal to need; the running values as cards (k, nums[i], prefix, need, count);
 * the map of prefix sums to how often each occurred, with the lookup or write this step made; why a match is a
 * subarray summing to k; and, marked DISPLAY ONLY because the code only counts them, every subarray counted so far.
 * Everything shown comes from the step itself (ExecutionStep.prefixMap); the subarrays are checked before they are drawn.
 */
export const SubarraySumVisualizer: React.FC<SubarraySumVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.prefixMap;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const { nums, k } = view;
  const n = nums.length;
  const at = currentIndex(view);
  const lookup = view.lookup;
  const write = view.write;
  const here = checked(view, view.matchesHere, view.operation === 'lookup' && lookup ? lookup.occurrences : 0, at, lastCounted(view));
  const all = checked(view, view.matches, view.count ?? 0, null, lastCounted(view));
  const allShown = all.length === view.matches.length && (view.count ?? 0) === view.matches.length;
  const P = prefixSums(nums);
  // P(i + 1) is computed by prefix += nums[i] and recorded by the store that follows
  const computed = at !== null && (view.operation === 'add-prefix' || view.operation === 'calc-need' || view.operation === 'lookup') ? at + 1 : null;
  const starts = new Set(here.map(r => r.start));
  const set = SETS[view.operation];
  const cardValue: Record<Card, number | null> = { k, 'nums[i]': at === null ? null : nums[at], prefix: view.prefix, need: view.need, count: view.count };

  const cellTone = (p: number) => (p === at ? 'current' : here.some(r => p >= r.start && p <= r.end) ? 'match' : view.operation === 'done' || (view.i !== null && p < view.i) ? 'seen' : 'waiting');
  const CELL: Record<string, string> = {
    current: 'bg-amber-500/25 border-amber-400',
    match: 'bg-emerald-500/20 border-emerald-400',
    seen: 'bg-slate-700/70 border-slate-500',
    waiting: 'bg-slate-900/40 border-dashed border-slate-500',
  };
  const prefixTone = (p: number) => (starts.has(p) ? 'start' : p === computed ? 'current' : p < view.recorded ? 'recorded' : 'waiting');
  const PREFIX: Record<string, string> = {
    start: 'bg-emerald-500/20 border-emerald-400',
    current: 'bg-amber-500/25 border-amber-400',
    recorded: 'bg-slate-800/80 border-slate-500',
    waiting: 'bg-slate-900/40 border-dashed border-slate-600',
  };
  const mark = (key: number) => (lookup && lookup.found && lookup.key === key ? 'found' : write?.key === key ? write.kind : '');
  const MARK: Record<string, string> = {
    found: 'bg-emerald-500/20 border-emerald-400 text-emerald-200',
    insert: 'bg-sky-500/15 border-sky-400 text-sky-200',
    increment: 'bg-amber-500/15 border-amber-400 text-amber-200',
    '': 'bg-slate-900/60 border-slate-600 text-slate-200',
  };

  return (
    <div className="w-full flex flex-col gap-2" data-testid="ssk-visualizer" data-length={n} data-operation={view.operation}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="ssk-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span
          data-testid="ssk-progress"
          className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300"
        >
          {view.result ? 'Done' : `k = ${num(k)}`}
        </span>

        {/* the numbers, the one being processed, and one lane per subarray this step counted */}
        <div className="relative z-10 w-full" data-testid="ssk-chart" aria-hidden="true">
          {n === 0 ? (
            <p className="text-center text-[11px] font-mono text-slate-400" data-testid="ssk-empty">
              nums is empty: no subarray to count
            </p>
          ) : (
            <ol className="flex justify-center gap-0.5 sm:gap-2 font-mono select-none" data-testid="ssk-array">
              {nums.map((x, p) => (
                <li key={p} className="flex-1 max-w-14 min-w-0 flex flex-col items-center leading-tight">
                  <span className="text-[10px] text-slate-400">{p}</span>
                  <span
                    data-index={p}
                    data-value={x}
                    data-tone={cellTone(p)}
                    style={{ transitionDuration: `${transitionMs}ms` }}
                    // on a phone ten cells share about 21px each: "−999" fits with a thin border and tight letters
                    className={`w-full h-9 flex items-center justify-center rounded-md border sm:border-2 text-[9px] sm:text-xs tracking-tighter sm:tracking-normal font-bold text-slate-100 tabular-nums transition-colors motion-reduce:transition-none ${CELL[cellTone(p)]}`}
                  >
                    {num(x)}
                  </span>
                  <span className="min-h-4 text-[10px] font-bold text-amber-300">{p === at ? '▲ i' : ''}</span>
                </li>
              ))}
            </ol>
          )}
          {here.length > 0 && (
            <div data-testid="ssk-brackets" data-ranges={here.map(r => `${r.start}-${r.end}`).join(',')} className="flex flex-col gap-1 pt-1">
              {here.map(r => (
                <ol key={`${r.start}-${r.end}`} data-lane={`${r.start}-${r.end}`} className="flex justify-center gap-0.5 sm:gap-2 select-none">
                  {nums.map((_, p) => {
                    const part = p < r.start || p > r.end ? 'out' : r.start === r.end ? 'only' : p === r.start ? 'start' : p === r.end ? 'end' : 'in';
                    return (
                      <li key={p} data-part={part} className="relative flex-1 max-w-14 h-2">
                        {part !== 'out' && (
                          <span
                            className={`absolute top-0 bottom-0 bg-emerald-400/80 ${part === 'start' || part === 'only' ? 'left-0 rounded-l-full' : '-left-px sm:-left-1'} ${part === 'end' || part === 'only' ? 'right-0 rounded-r-full' : '-right-px sm:-right-1'}`}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              ))}
            </div>
          )}
        </div>

        {/* the prefix sums: P(j) is the sum of the first j numbers; P(0) is the empty prefix */}
        <div className="relative z-10 flex flex-col gap-1" aria-hidden="true">
          <p className="text-center text-[10px] font-mono text-slate-400">prefix sums: P(j) = sum of the first j numbers; sum of nums[j..i] = P(i + 1) − P(j)</p>
          <ol className="flex flex-wrap justify-center gap-1 font-mono" data-testid="ssk-prefixes">
            {P.map((value, p) => (
              <li
                key={p}
                data-p={p}
                data-value={value}
                data-tone={prefixTone(p)}
                className={`min-w-11 px-1.5 py-0.5 rounded-md border text-center text-[10px] sm:text-[11px] leading-tight ${PREFIX[prefixTone(p)]}`}
              >
                <span className="block text-slate-400">P{p}</span>
                <span className="block font-bold text-slate-100 tabular-nums">{prefixTone(p) === 'waiting' ? '·' : num(value)}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="sr-only" data-testid="ssk-text">
          {`nums ${list(nums)}, k = ${k}. `}
          {at !== null ? `Index ${at}, nums[i] = ${nums[at]}. ` : ''}
          {`prefix = ${view.prefix ?? 'not set'}, need = ${view.need ?? 'not set'}, count = ${view.count ?? 'not set'}. `}
          {view.freq ? `The map: ${view.freq.map(e => `${e.key} occurred ${e.count} time${e.count === 1 ? '' : 's'}`).join('; ')}. ` : 'The map is not created yet. '}
          {lookup ? `Looked up ${lookup.key}: ${lookup.found ? `occurred ${lookup.occurrences} time${lookup.occurrences === 1 ? '' : 's'}` : 'not in the map'}. ` : ''}
          {here.length ? `Subarrays counted here: ${here.map(r => rangeWords(nums, r)).join('; ')}. ` : ''}
        </p>

        {/* the running values: the code's own variables */}
        <ol className="relative z-10 grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono" data-testid="ssk-values">
          {CARDS.map(c => {
            const v = cardValue[c];
            const active = set === c;
            return (
              <li
                key={c}
                data-name={c}
                data-value={v ?? ''}
                data-active={active ? 'true' : 'false'}
                className={`min-w-0 px-2 py-1.5 rounded-lg border-2 text-[11px] ${active ? 'bg-emerald-500/15 border-emerald-500' : 'bg-slate-900/60 border-slate-600'}`}
              >
                <p className="flex items-baseline justify-between gap-1">
                  <span className="font-bold text-sky-200">{c}</span>
                  <span className="font-bold text-slate-100 tabular-nums text-sm">{v === null ? '–' : num(v)}</span>
                </p>
                <p className="text-[10px] text-slate-400 leading-snug">{MEANING[c]}</p>
              </li>
            );
          })}
        </ol>

        {/* the map: prefix sum → how many times it has occurred */}
        <div className="relative z-10 flex flex-col gap-1 rounded-lg border border-slate-600 px-2 py-2 font-mono text-[11px]" data-testid="ssk-map" data-size={view.freq?.length ?? ''}>
          <p className="font-bold text-slate-300">freq: prefix sum → times it occurred</p>
          {view.freq === null ? (
            <p className="text-slate-400">not created yet</p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {view.freq.map(e => (
                <li
                  key={e.key}
                  data-key={e.key}
                  data-count={e.count}
                  data-mark={mark(e.key)}
                  style={{ transitionDuration: `${transitionMs}ms` }}
                  className={`px-1.5 py-0.5 rounded-md border tabular-nums transition-colors motion-reduce:transition-none ${MARK[mark(e.key)]}`}
                >
                  {num(e.key)} → {e.count}
                </li>
              ))}
            </ul>
          )}
          {lookup && (
            <p data-testid="ssk-lookup" data-key={lookup.key} data-found={lookup.found ? 'true' : 'false'} data-occurrences={lookup.occurrences} className="text-slate-400">
              look up need = {num(lookup.key)}:{' '}
              {lookup.found ? (
                <span className="text-emerald-300 font-bold">
                  occurred {lookup.occurrences === 1 ? 'once' : `${lookup.occurrences} times`} → count {num(lookup.countBefore)} + {lookup.occurrences} = {num(lookup.countBefore + lookup.occurrences)}
                </span>
              ) : (
                <span className="text-slate-200">not in the map → count stays {num(lookup.countBefore)}</span>
              )}
            </p>
          )}
          {write && (
            <p data-testid="ssk-write" data-key={write.key} data-kind={write.kind} className="text-slate-400">
              record prefix = {num(write.key)}: <span className="text-slate-200">{write.kind === 'insert' ? `new, now ${write.to}` : `${write.from} + 1 = ${write.to}`}</span>
            </p>
          )}
        </div>

        {/* why an earlier prefix sum equal to need is a subarray summing to k */}
        <div className="relative z-10 rounded-lg border border-slate-600 bg-slate-900/60 px-2 py-2 font-mono text-[11px] text-slate-300 flex flex-col gap-0.5" data-testid="ssk-why">
          <p>
            why: sum of nums[j..i] = P(i + 1) − P(j). It is k exactly when P(j) = prefix − k = need, so every earlier prefix sum equal to need starts one subarray
            that ends at i and sums to k. need is looked up before prefix is recorded, so no subarray is empty.
          </p>
          {here.map(r => (
            <p key={`${r.start}-${r.end}`} data-why={`${r.start}-${r.end}`} className="text-emerald-300 break-words">
              P{r.start} = {num(P[r.start])} = need → {rangeWords(nums, r)} sums to P{r.end + 1} − P{r.start} = {num(P[r.end + 1])} − {num(P[r.start])} = {num(k)}
            </p>
          ))}
        </div>

        {/* what this step did, in the trace's own words */}
        <div className="relative z-10 min-h-7 flex items-center justify-center" data-testid="ssk-note" data-kind={view.operation}>
          <span className="px-2 py-1 rounded-md border font-mono font-bold text-[11px] sm:text-xs text-center break-words bg-slate-800/80 border-slate-600 text-slate-200">{currentStep.message}</span>
        </div>

        {/* display only: the subarrays counted, which the code never records */}
        <div className="relative z-10 w-full flex flex-col gap-1 text-[11px] font-mono rounded-lg border border-dashed border-slate-500 px-2 py-2" data-testid="ssk-display-only">
          <p className="font-bold text-slate-300">Display only — the code does not store these subarrays; it only counts them</p>
          <p data-testid="ssk-running" data-value={view.count ?? ''} className="text-slate-400">
            count so far: <span className="text-slate-200 tabular-nums">{view.count === null ? '–' : num(view.count)}</span>
          </p>
          {!allShown ? (
            <p className="text-slate-400" data-testid="ssk-unshown">
              the subarrays behind count: <span className="text-slate-200">not shown for this step</span>
            </p>
          ) : all.length === 0 ? (
            <p className="text-slate-400">
              subarrays found: <span className="text-slate-200">none yet</span>
            </p>
          ) : (
            <ol className="flex flex-col gap-0.5" data-testid="ssk-matches">
              {all.map((r, x) => (
                <li key={`${r.start}-${r.end}`} data-match={`${r.start}-${r.end}`} className="text-slate-400 break-words">
                  {x + 1}: <span className="text-slate-200">{rangeWords(nums, r)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <p data-testid="ssk-input" className="relative z-10 text-[11px] font-mono text-slate-400 break-words">
          nums: <span className="text-slate-300">{list(nums)}</span>, k = <span className="text-slate-300">{num(k)}</span>
        </p>
      </div>

      {view.result && (
        <div
          role="status"
          data-testid="ssk-result"
          data-count={view.result.count}
          className="flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300 break-words"
        >
          <Equal className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{view.result.text}</span>
        </div>
      )}
    </div>
  );
};
