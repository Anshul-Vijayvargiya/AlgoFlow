import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, StockView } from '../../types/algorithm';

interface StockVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/** height of the tallest bar, in px; every bar is drawn in proportion to it */
const CHART = 140;
/** a price of 0 still gets a sliver, so the day is visible */
const MIN_BAR = 3;

/**
 * how a day's bar is drawn. current: day i, being checked; sell / buy: the pair behind maxProfit; min: the day of the
 * lowest price so far; checked: an earlier day; waiting: not checked yet
 */
type Tone = 'current' | 'sell' | 'buy' | 'min' | 'checked' | 'waiting';

const TONE: Record<Tone, string> = {
  current: 'bg-amber-500/30 border-amber-400',
  sell: 'bg-purple-500/30 border-purple-400',
  buy: 'bg-emerald-500/30 border-emerald-400',
  min: 'bg-cyan-500/25 border-cyan-400',
  checked: 'bg-slate-700/70 border-slate-500',
  waiting: 'bg-slate-900/40 border-dashed border-slate-500',
};
/** the same colours for the legend's swatches and for text */
const TONE_TEXT_CLASS: Record<Tone, string> = {
  current: 'text-amber-300',
  sell: 'text-purple-300',
  buy: 'text-emerald-300',
  min: 'text-cyan-300',
  checked: 'text-slate-300',
  waiting: 'text-slate-300',
};

/** what a colour means, in words (the legend and screen readers never rely on colour alone) */
const TONE_TEXT: Record<Tone, string> = {
  current: 'day i: being checked',
  sell: 'sell day of the best trade so far',
  buy: 'buy day of the best trade so far',
  min: 'lowest price so far',
  checked: 'checked',
  waiting: 'not checked yet',
};

/** diagonal stripes in the theme's cyan: the lowest-price bar is told apart by pattern as well as colour */
const MIN_STRIPES: React.CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-cyan-400) 55%, transparent) 0 3px, transparent 3px 7px)',
};

const VARS = [
  { name: 'minPrice', text: 'lowest price so far' },
  { name: 'profit', text: "selling today, after buying at minPrice" },
  { name: 'maxProfit', text: 'best profit so far' },
] as const;

/** the day being checked, while the loop is on a day */
const currentDay = (view: StockView) =>
  view.i !== null && view.i < view.prices.length && view.operation !== 'start' && view.operation !== 'done' && view.operation !== 'init' ? view.i : null;

/** how many days have been looked at before the current one (all of them once the run is over) */
function checkedUpTo(view: StockView): number {
  if (view.operation === 'done') return view.prices.length;
  if (view.i !== null) return view.i;
  return view.minDay !== null ? 1 : 0;
}

function toneOf(view: StockView, day: number): Tone {
  if (day === currentDay(view)) return 'current';
  if (day === view.sellDay) return 'sell';
  if (day === view.buyDay) return 'buy';
  if (day === view.minDay) return 'min';
  return day < checkedUpTo(view) ? 'checked' : 'waiting';
}

/** the labels under a day: what it is to the code (i) and to the trade shown (min, buy, sell) */
function tagsOf(view: StockView, day: number): string[] {
  const tags: string[] = [];
  if (day === currentDay(view)) tags.push('i');
  if (day === view.minDay) tags.push('min');
  if (day === view.buyDay) tags.push('buy');
  if (day === view.sellDay) tags.push('sell');
  return tags;
}

const TAG_CLASS: Record<string, string> = { i: 'text-amber-300', min: 'text-cyan-300', buy: 'text-emerald-300', sell: 'text-purple-300' };

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

/** the day's profit, how it compares with the best so far, in words */
function profitVerdict(view: StockView): { kind: 'new-min' | 'better' | 'equal' | 'worse'; text: string } | null {
  if (view.profit === null || view.maxProfit === null) return null;
  if (view.newMin) return { kind: 'new-min', text: 'new minimum: selling today earns 0' };
  if (view.improved) return { kind: 'better', text: `the best profit so far` };
  if (view.profit > view.maxProfit) return { kind: 'better', text: `better than ${view.maxProfit}` };
  if (view.profit === view.maxProfit) {
    return { kind: 'equal', text: view.maxProfit === 0 ? 'no profitable trade has been found yet' : `only equals ${view.maxProfit}: the earlier trade is kept` };
  }
  return { kind: 'worse', text: `not better than ${view.maxProfit}` };
}

/**
 * Best Time to Buy and Sell Stock (visual: 'stock'): the prices as a chart, one bar per day with its day and price under
 * it; a dashed line at the lowest price so far; the day being checked, and its profit drawn as a span from that line up
 * to its price; the variables of the code; and, marked DISPLAY ONLY because the code keeps prices but not days, the day
 * of the lowest price and the buy and sell days of the best trade so far, joined by a bracket under the chart (a dot on
 * the buy day, an arrowhead on the sell day). Bars narrow on a phone, so ten days always fit
 * without scrolling. Everything shown comes from the step itself (ExecutionStep.stock and the step's message).
 */
export const StockVisualizer: React.FC<StockVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.stock;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const n = view.prices.length;
  const top = Math.max(...view.prices, 1);
  const height = (price: number) => Math.max(MIN_BAR, Math.round((price / top) * CHART));
  const level = (price: number) => Math.round((price / top) * CHART);
  const tones = view.prices.map((_, day) => toneOf(view, day));
  const shown = new Set(tones);
  const day = currentDay(view);
  const verdict = profitVerdict(view);
  const hasTrade = view.buyDay !== null && view.sellDay !== null;
  const value = (name: (typeof VARS)[number]['name']) => view[name];

  const described = view.prices
    .map((price, d) => {
      const tags = tagsOf(view, d);
      return `day ${d} price ${price}${tags.length ? ` (${tags.join(', ')})` : ''}, ${TONE_TEXT[tones[d]]}`;
    })
    .join('; ');

  return (
    <div className="w-full flex flex-col gap-2" data-testid="stock-visualizer" data-length={n} data-operation={view.operation}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="stock-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span
          data-testid="stock-progress"
          className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300"
        >
          {view.result ? 'Done' : `${Math.min(checkedUpTo(view), n)} of ${n} checked`}
        </span>

        {/* the chart: one bar per day, the lowest price so far as a dashed line, and today's profit as a span above it */}
        <div className="relative z-10 w-full" data-testid="stock-chart" aria-hidden="true">
          <div className="relative w-full" style={{ height: CHART }}>
            {/* no text on the line: the bars fill the width, so a label would sit on one of them; the day is tagged "min"
                under its bar and the price is minPrice in the variables */}
            {view.minPrice !== null && (
              <div
                data-testid="stock-min-line"
                data-price={view.minPrice}
                className="absolute inset-x-0 border-t-2 border-dashed border-cyan-400/70 pointer-events-none"
                style={{ bottom: level(view.minPrice) }}
              />
            )}
            <ol className="absolute inset-0 flex items-end justify-center gap-1 sm:gap-2 select-none">
              {view.prices.map((price, d) => (
                <li key={d} className="relative h-full flex-1 max-w-14 flex items-end justify-center">
                  <span
                    data-day={d}
                    data-price={price}
                    data-tone={tones[d]}
                    style={{ height: height(price), transitionDuration: `${transitionMs}ms`, ...(tones[d] === 'min' ? MIN_STRIPES : {}) }}
                    className={`w-full rounded-t-md border-2 transition-colors motion-reduce:transition-none ${TONE[tones[d]]}`}
                  />
                  {d === day && view.profit !== null && view.minPrice !== null && (
                    <span
                      data-testid="stock-profit-span"
                      data-from={view.minPrice}
                      data-to={price}
                      data-kind={verdict?.kind ?? ''}
                      className={`absolute left-1/2 -translate-x-1/2 rounded-sm ${verdict?.kind === 'better' ? 'w-1.5 bg-emerald-400' : verdict?.kind === 'new-min' ? 'w-1.5 bg-cyan-400' : 'w-2 bg-slate-100 border border-slate-900'}`}
                      style={{ bottom: level(view.minPrice), height: Math.max(2, level(price) - level(view.minPrice)) }}
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
          {/* under each bar: its day, its price and its labels; they share the bars' columns */}
          <ol className="flex justify-center gap-1 sm:gap-2 pt-1 font-mono select-none">
            {view.prices.map((price, d) => (
              <li key={d} className="flex-1 max-w-14 min-w-0 flex flex-col items-center leading-tight">
                <span className="text-[10px] text-slate-400">{d}</span>
                <span className="text-[11px] font-bold text-slate-200 tabular-nums">{price}</span>
                <span data-tags={d} className="min-h-10 flex flex-col items-center text-[10px] font-bold">
                  {tagsOf(view, d).map(t => (
                    <span key={t} data-tag={t} className={TAG_CLASS[t]}>
                      {t === 'i' ? '▲ i' : t}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
          {/* only for a valid trade: a buy day before its sell day (the trace never gives another, but nothing is assumed) */}
          {hasTrade && view.buyDay! < view.sellDay! && (
            <ol
              data-testid="stock-bracket"
              data-buy={view.buyDay}
              data-sell={view.sellDay}
              className="flex justify-center gap-1 sm:gap-2 select-none"
            >
              {view.prices.map((_, d) => {
                const part = d === view.buyDay ? 'buy' : d === view.sellDay ? 'sell' : d > view.buyDay! && d < view.sellDay! ? 'between' : 'none';
                return (
                  <li key={d} data-bracket={part} className="relative flex-1 max-w-14 h-4">
                    {part === 'buy' && <span className="absolute top-1/2 -translate-y-1/2 left-1/2 -right-0.5 sm:-right-1 h-0.5 bg-slate-400" />}
                    {part === 'between' && <span className="absolute top-1/2 -translate-y-1/2 -left-0.5 -right-0.5 sm:-left-1 sm:-right-1 h-0.5 bg-slate-400" />}
                    {part === 'sell' && <span className="absolute top-1/2 -translate-y-1/2 -left-0.5 sm:-left-1 right-1/2 h-0.5 bg-slate-400" />}
                    {part === 'buy' && (
                      <span data-bracket-end="buy" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-400 border-2 border-emerald-300" />
                    )}
                    {part === 'sell' && (
                      // an arrowhead drawn with borders: a "▶" character is shown as a colour emoji on some systems, ignoring the colour
                      <span data-bracket-end="sell" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 border-y-[7px] border-y-transparent border-l-[11px] border-l-purple-400" />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <p className="sr-only" data-testid="stock-text">
          The prices: {described}.{' '}
          {view.profit !== null && day !== null && `Selling on day ${day} earns ${view.prices[day]} − ${view.minPrice} = ${view.profit}${verdict ? `, ${verdict.text}` : ''}.`}{' '}
          {`Shown for explanation only, not stored by the code: ${hasTrade ? `the best trade so far buys on day ${view.buyDay} and sells on day ${view.sellDay}` : 'no trade has made money yet'}.`}
        </p>

        {/* today's profit, in numbers */}
        {view.profit !== null && day !== null && verdict && (
          <div
            data-testid="stock-profit"
            data-day={day}
            data-profit={view.profit}
            data-kind={verdict.kind}
            className={`relative z-10 self-center px-2 py-1 rounded-md border-2 font-mono text-[11px] text-center ${
              verdict.kind === 'better' ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : verdict.kind === 'new-min' ? 'bg-cyan-500/15 border-cyan-400 text-cyan-200' : 'bg-slate-800/80 border-slate-600 text-slate-200'
            }`}
          >
            <p className="font-bold tabular-nums">
              sell on day {day}: {view.prices[day]} − {view.minPrice} = {view.profit}
            </p>
            <p>{verdict.text}</p>
          </div>
        )}

        {/* the variables of the code: all it keeps. A name and its value never part; the meaning wraps beside them */}
        <dl className="relative z-10 flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-x-3 gap-y-1 text-[11px] font-mono" data-testid="stock-vars">
          {VARS.map(v => (
            <div key={v.name} data-var={v.name} data-value={value(v.name) ?? ''} data-moved={view.moved === v.name ? 'true' : 'false'} className="flex items-baseline gap-1">
              <dt className="shrink-0 font-bold text-sky-200">{v.name}</dt>
              <dd className="shrink-0 whitespace-nowrap text-slate-200 tabular-nums">= {value(v.name) ?? '–'}</dd>
              <dd className="min-w-0 text-slate-400">({v.text})</dd>
            </div>
          ))}
        </dl>

        {/* what this step did, in the trace's own words */}
        <div className="relative z-10 min-h-7 flex items-center justify-center" data-testid="stock-note" data-kind={view.operation}>
          <span className="px-2 py-1 rounded-md border font-mono font-bold text-[11px] sm:text-xs text-center break-words bg-slate-800/80 border-slate-600 text-slate-200">{currentStep.message}</span>
        </div>

        {/* display only: the days, which the code never records */}
        <div className="relative z-10 w-full flex flex-col gap-1 text-[11px] font-mono rounded-lg border border-dashed border-slate-500 px-2 py-2" data-testid="stock-display-only">
          <p className="font-bold text-slate-300">Display only — the code does not store these days; it keeps only minPrice and maxProfit</p>
          <p data-testid="stock-min-day" data-day={view.minDay ?? ''} className="text-slate-400 break-words">
            lowest price so far:{' '}
            <span className="text-slate-200">{view.minDay === null ? 'none yet' : `day ${view.minDay} at ${view.prices[view.minDay]}`}</span>
          </p>
          <p data-testid="stock-trade" data-buy={view.buyDay ?? ''} data-sell={view.sellDay ?? ''} className="text-slate-400 break-words">
            best trade so far:{' '}
            <span className="text-slate-200">
              {hasTrade
                ? `buy on day ${view.buyDay} at ${view.prices[view.buyDay!]}, sell on day ${view.sellDay} at ${view.prices[view.sellDay!]} (profit ${view.prices[view.sellDay!] - view.prices[view.buyDay!]})`
                : 'none yet: no sale has made money'}
            </span>
          </p>
        </div>

        {/* what the colours mean (only the states this step shows) */}
        <ul className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="stock-legend">
          {(Object.keys(TONE_TEXT) as Tone[])
            .filter(t => shown.has(t))
            .map(t => (
              <li key={t} data-legend={t} className={`flex items-center gap-1 ${TONE_TEXT_CLASS[t]}`}>
                <span className={`inline-block w-3 h-3 rounded border-2 ${TONE[t]}`} style={t === 'min' ? MIN_STRIPES : undefined} />
                <span className="text-slate-300">{TONE_TEXT[t]}</span>
              </li>
            ))}
        </ul>

        <p data-testid="stock-input" className="relative z-10 text-[11px] font-mono text-slate-400 break-words">
          prices: <span className="text-slate-300">{list(view.prices)}</span>
        </p>
      </div>

      {view.result && (
        <div
          role="status"
          data-testid="stock-result"
          data-profit={view.result.profit}
          data-buy={view.result.buyDay ?? ''}
          data-sell={view.result.sellDay ?? ''}
          className="flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300 break-words"
        >
          <Equal className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{view.result.text}</span>
        </div>
      )}
    </div>
  );
};
