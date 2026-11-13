import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, StockIITrade, StockIIView } from '../../types/algorithm';

interface StockIIVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/** height of the tallest bar, in px; every bar is drawn in proportion to it */
const CHART = 140;
/** a price of 0 still gets a sliver, so the day is visible */
const MIN_BAR = 3;

/**
 * how a day's bar is drawn. pair: one of the two days being compared; buy: the buy day of a trade (completed or still
 * rising); sell: the sell day of a completed trade; holding: the top so far of the run still rising; checked: compared
 * already; waiting: not reached yet
 */
type Tone = 'pair' | 'buy' | 'sell' | 'holding' | 'checked' | 'waiting';

const TONE: Record<Tone, string> = {
  pair: 'bg-amber-500/30 border-amber-400',
  buy: 'bg-emerald-500/30 border-emerald-400',
  sell: 'bg-purple-500/30 border-purple-400',
  holding: 'bg-purple-500/15 border-dashed border-purple-400',
  checked: 'bg-slate-700/70 border-slate-500',
  waiting: 'bg-slate-900/40 border-dashed border-slate-500',
};
const TONE_TEXT_CLASS: Record<Tone, string> = {
  pair: 'text-amber-300',
  buy: 'text-emerald-300',
  sell: 'text-purple-300',
  holding: 'text-purple-300',
  checked: 'text-slate-300',
  waiting: 'text-slate-300',
};
/** what a colour means, in words (the legend and screen readers never rely on colour alone) */
const TONE_TEXT: Record<Tone, string> = {
  pair: 'the two days being compared',
  buy: 'buy day of a trade',
  sell: 'sell day of a trade',
  holding: 'top so far of the rise still going',
  checked: 'checked',
  waiting: 'not reached yet',
};

/** a day-to-day change: a rise is counted, a fall or no change is skipped */
type ChangeKind = 'rise' | 'fall' | 'flat';
const CHANGE_TONE: Record<ChangeKind, string> = {
  rise: 'bg-emerald-500/15 border-emerald-500 text-emerald-300',
  fall: 'bg-rose-500/15 border-rose-400 text-rose-200',
  flat: 'bg-slate-800/80 border-slate-500 text-slate-300',
};
const changeKind = (change: number): ChangeKind => (change > 0 ? 'rise' : change < 0 ? 'fall' : 'flat');
const signed = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : '0');

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

/** the pair being compared, while the loop is on it: days i - 1 and i */
const comparedPair = (view: StockIIView): readonly [number, number] | null =>
  view.i !== null && view.i < view.prices.length && view.operation !== 'start' && view.operation !== 'done' && view.operation !== 'init' ? [view.i - 1, view.i] : null;

/** how many days have been reached: day 0 once the loop starts, and every day up to i */
function reachedUpTo(view: StockIIView): number {
  if (view.operation === 'done') return view.prices.length;
  if (view.i !== null) return view.i;
  return 0;
}

/** every trade shown: the completed ones, then the run still rising */
const allTrades = (view: StockIIView): (StockIITrade & { open: boolean })[] => [
  ...view.trades.map(t => ({ ...t, open: false })),
  ...(view.open ? [{ ...view.open, open: true }] : []),
];

function toneOf(view: StockIIView, day: number): Tone {
  const pair = comparedPair(view);
  if (pair && pair.includes(day)) return 'pair';
  for (const t of allTrades(view)) {
    if (day === t.buyDay) return 'buy';
    if (day === t.sellDay) return t.open ? 'holding' : 'sell';
  }
  return day < reachedUpTo(view) || (pair && day < pair[0]) ? 'checked' : 'waiting';
}

/** the labels under a day: the two days being compared, and the ends of a trade */
function tagsOf(view: StockIIView, day: number): string[] {
  const tags: string[] = [];
  const pair = comparedPair(view);
  if (pair?.[0] === day) tags.push('i-1');
  if (pair?.[1] === day) tags.push('i');
  for (const t of allTrades(view)) {
    if (day === t.buyDay) tags.push('buy');
    if (day === t.sellDay) tags.push(t.open ? 'holding' : 'sell');
  }
  return tags;
}
const TAG_TEXT: Record<string, string> = { 'i-1': '▲ i−1', i: '▲ i', buy: 'buy', sell: 'sell', holding: 'holding' };
const TAG_CLASS: Record<string, string> = { 'i-1': 'text-amber-300', i: 'text-amber-300', buy: 'text-emerald-300', sell: 'text-purple-300', holding: 'text-purple-300' };

/** the rises that make up a trade, in order */
const risesOf = (view: StockIIView, t: StockIITrade) => view.gains.filter(g => g.day > t.buyDay && g.day <= t.sellDay).map(g => g.change);

/**
 * Best Time to Buy and Sell Stock II (visual: 'stock-ii'): the prices as a chart, one bar per day with its day and price
 * under it and, under that, the change from the day before (a rise counted, a fall or no change skipped); the two days
 * being compared; the trades so far as brackets under the chart (a dot on the buy day, an arrowhead on the sell day; the
 * run still rising dashed); totalProfit with the rises it adds up; and, marked DISPLAY ONLY because the code keeps only
 * the total, the trades. A run of rises is shown to equal one trade from its bottom to its top. Bars narrow on a phone,
 * so ten days always fit without scrolling. Everything shown comes from the step itself (ExecutionStep.stockII).
 */
export const StockIIVisualizer: React.FC<StockIIVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.stockII;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const n = view.prices.length;
  const top = Math.max(...view.prices, 1);
  const height = (price: number) => Math.max(MIN_BAR, Math.round((price / top) * CHART));
  const tones = view.prices.map((_, d) => toneOf(view, d));
  const shown = new Set(tones);
  const pair = comparedPair(view);
  const trades = allTrades(view);
  const changeOf = (day: number) => view.gains.find(g => g.day === day);
  const counted = view.gains.filter(g => g.counted).map(g => g.change);
  /** the trade covering a day (they never overlap), and which part of its bracket the day draws */
  const bracketAt = (day: number) => {
    const k = trades.findIndex(t => day >= t.buyDay && day <= t.sellDay);
    if (k < 0) return null;
    const t = trades[k];
    return { trade: t, index: k, part: day === t.buyDay ? 'buy' : day === t.sellDay ? 'sell' : 'between' } as const;
  };
  // the run explained: the one still rising when it has two rises or more, else the one this step completed
  const explained = view.open && risesOf(view, view.open).length >= 2 ? { ...view.open, open: true } : view.closed && risesOf(view, view.closed).length >= 2 ? { ...view.closed, open: false } : null;

  const described = view.prices
    .map((price, d) => {
      const g = changeOf(d);
      const tags = tagsOf(view, d);
      return `day ${d} price ${price}${g ? `, ${signed(g.change)} from the day before (${g.counted ? 'counted' : 'skipped'})` : ''}${tags.length ? ` (${tags.map(t => TAG_TEXT[t].replace('▲ ', '')).join(', ')})` : ''}`;
    })
    .join('; ');
  const tradeText = (t: StockIITrade) => `buy day ${t.buyDay} at ${view.prices[t.buyDay]} → sell day ${t.sellDay} at ${view.prices[t.sellDay]} (+${t.profit})`;

  return (
    <div className="w-full flex flex-col gap-2" data-testid="stock2-visualizer" data-length={n} data-operation={view.operation}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="stock2-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span
          data-testid="stock2-progress"
          className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300"
        >
          {view.result ? 'Done' : `${view.gains.length} of ${Math.max(n - 1, 0)} compared`}
        </span>

        {/* the chart: one bar per day; under it the day, the price, the change from the day before and the labels; then the trades */}
        <div className="relative z-10 w-full" data-testid="stock2-chart" aria-hidden="true">
          <ol className="flex items-end justify-center gap-1 sm:gap-2 select-none" style={{ height: CHART }}>
            {view.prices.map((price, d) => (
              <li key={d} className="relative h-full flex-1 max-w-14 flex items-end justify-center">
                <span
                  data-day={d}
                  data-price={price}
                  data-tone={tones[d]}
                  style={{ height: height(price), transitionDuration: `${transitionMs}ms` }}
                  className={`w-full rounded-t-md border-2 transition-colors motion-reduce:transition-none ${TONE[tones[d]]}`}
                />
              </li>
            ))}
          </ol>
          <ol className="flex justify-center gap-1 sm:gap-2 pt-1 font-mono select-none">
            {view.prices.map((price, d) => {
              const g = changeOf(d);
              const live = pair?.[1] === d;
              return (
                <li key={d} className="flex-1 max-w-14 min-w-0 flex flex-col items-center leading-tight">
                  <span className="text-[10px] text-slate-400">{d}</span>
                  <span className="text-[11px] font-bold text-slate-200 tabular-nums">{price}</span>
                  <span
                    data-change={d}
                    data-kind={g ? changeKind(g.change) : ''}
                    data-counted={g ? String(g.counted) : ''}
                    className={`mt-0.5 min-h-4 min-w-0 max-w-full px-px sm:px-0.5 rounded border flex flex-col sm:flex-row items-center leading-none sm:leading-tight text-[9px] sm:text-[10px] font-bold tabular-nums ${
                      g ? CHANGE_TONE[changeKind(g.change)] : 'border-transparent'
                    }${live ? ' ring-2 ring-amber-400' : ''}`}
                  >
                    {/* on a phone the sign sits above the digits, so a chip is never wider than three digits */}
                    {g && g.change !== 0 && <span>{g.change > 0 ? '+' : '−'}</span>}
                    {g && <span>{Math.abs(g.change)}</span>}
                  </span>
                  <span data-tags={d} className="min-h-10 flex flex-col items-center text-center text-[9px] sm:text-[10px] font-bold">
                    {tagsOf(view, d).map(t => (
                      <span key={t} data-tag={t} className={TAG_CLASS[t]}>
                        {/* "holding" is wider than a column on a phone: it is shortened there */}
                        {t === 'holding' ? (
                          <>
                            <span className="sm:hidden">hold</span>
                            <span className="hidden sm:inline">holding</span>
                          </>
                        ) : (
                          TAG_TEXT[t]
                        )}
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
          {/* the trades: one bracket per trade, from a dot on its buy day to an arrowhead on its sell day; the run still rising is dashed */}
          {trades.length > 0 && (
            <ol data-testid="stock2-brackets" data-trades={trades.map(t => `${t.buyDay}-${t.sellDay}${t.open ? '*' : ''}`).join(',')} className="flex justify-center gap-1 sm:gap-2 select-none">
              {view.prices.map((_, d) => {
                const at = bracketAt(d);
                const line = at?.trade.open ? 'border-t-2 border-dashed border-purple-400' : 'border-t-2 border-solid border-slate-400';
                return (
                  <li key={d} data-bracket={at ? `${at.index}:${at.part}${at.trade.open ? ':open' : ''}` : 'none'} className="relative flex-1 max-w-14 h-4">
                    {at?.part === 'buy' && <span className={`absolute top-1/2 left-1/2 -right-0.5 sm:-right-1 ${line}`} />}
                    {at?.part === 'between' && <span className={`absolute top-1/2 -left-0.5 -right-0.5 sm:-left-1 sm:-right-1 ${line}`} />}
                    {at?.part === 'sell' && <span className={`absolute top-1/2 -left-0.5 sm:-left-1 right-1/2 ${line}`} />}
                    {at?.part === 'buy' && (
                      <span data-bracket-end="buy" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-400 border-2 border-emerald-300" />
                    )}
                    {at?.part === 'sell' && (
                      // an arrowhead drawn with borders (a character could be drawn as a colour emoji); hollow while the run is still rising
                      <span
                        data-bracket-end={at.trade.open ? 'holding' : 'sell'}
                        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 border-y-[7px] border-y-transparent border-l-[11px] border-l-purple-400${at.trade.open ? ' opacity-60' : ''}`}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <p className="sr-only" data-testid="stock2-text">
          The prices: {described}.{' '}
          {pair && view.change !== null && `Comparing day ${pair[0]} and day ${pair[1]}: ${signed(view.change)}, ${view.change > 0 ? 'counted' : 'skipped'}.`}{' '}
          {`Shown for explanation only, not stored by the code: ${trades.length ? trades.map(t => (t.open ? `rising since day ${t.buyDay}, ${t.profit} so far` : tradeText(t))).join('; ') : 'no trade yet'}.`}
        </p>

        {/* the pair being compared, in numbers */}
        {pair && view.change !== null && view.prev !== null && view.cur !== null && (
          <div
            data-testid="stock2-pair"
            data-from={pair[0]}
            data-to={pair[1]}
            data-delta={view.change}
            data-kind={changeKind(view.change)}
            className={`relative z-10 self-center px-2 py-1 rounded-md border-2 font-mono text-[11px] text-center ${CHANGE_TONE[changeKind(view.change)]}`}
          >
            <p className="font-bold tabular-nums">
              day {pair[0]} → day {pair[1]}: {view.cur} − {view.prev} = {signed(view.change)}
            </p>
            <p>{view.change > 0 ? 'a rise: counted' : view.change < 0 ? 'a fall: skipped' : 'no change: skipped'}</p>
          </div>
        )}

        {/* the variable of the code, and the rises it adds up */}
        <dl className="relative z-10 flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-x-3 gap-y-1 text-[11px] font-mono" data-testid="stock2-vars">
          <div data-var="totalProfit" data-value={view.totalProfit ?? ''} data-moved={view.operation === 'add-gain' ? 'true' : 'false'} className="flex items-baseline gap-1">
            <dt className="shrink-0 font-bold text-sky-200">totalProfit</dt>
            <dd className="shrink-0 whitespace-nowrap text-slate-200 tabular-nums">= {view.totalProfit ?? '–'}</dd>
            <dd className="min-w-0 text-slate-400">(the sum of the rises counted)</dd>
          </div>
        </dl>
        <p data-testid="stock2-sum" data-values={counted.join(',')} className="relative z-10 text-center text-[11px] font-mono text-slate-400 break-words">
          rises counted: <span className="text-slate-200 tabular-nums">{counted.length === 0 ? 'none yet' : `${counted.join(' + ')} = ${counted.reduce((a, b) => a + b, 0)}`}</span>
        </p>

        {/* why a run of rises is one trade */}
        {explained && (
          <p data-testid="stock2-run" data-buy={explained.buyDay} data-sell={explained.sellDay} className="relative z-10 self-center px-2 py-1 rounded-md border border-dashed border-purple-400 font-mono text-[11px] text-center text-slate-200 break-words">
            {risesOf(view, explained).map(signed).join(' ')} = {explained.profit} = {view.prices[explained.sellDay]} − {view.prices[explained.buyDay]}: the same as one trade, buy on day {explained.buyDay}, sell on day{' '}
            {explained.sellDay}
            {explained.open ? ' (still rising)' : ''}
          </p>
        )}

        {/* what this step did, in the trace's own words */}
        <div className="relative z-10 min-h-7 flex items-center justify-center" data-testid="stock2-note" data-kind={view.operation}>
          <span className="px-2 py-1 rounded-md border font-mono font-bold text-[11px] sm:text-xs text-center break-words bg-slate-800/80 border-slate-600 text-slate-200">{currentStep.message}</span>
        </div>

        {/* display only: the trades, which the code never records */}
        <div className="relative z-10 w-full flex flex-col gap-1 text-[11px] font-mono rounded-lg border border-dashed border-slate-500 px-2 py-2" data-testid="stock2-display-only">
          <p className="font-bold text-slate-300">Display only — the code does not store these trades; it keeps only totalProfit</p>
          {trades.length === 0 && <p className="text-slate-400">trades so far: <span className="text-slate-200">none yet</span></p>}
          {trades.length > 0 && (
            <ol className="flex flex-col gap-0.5" data-testid="stock2-trades">
              {trades.map((t, k) => (
                <li key={k} data-trade={k} data-buy={t.buyDay} data-sell={t.sellDay} data-profit={t.profit} data-open={String(t.open)} className="text-slate-400 break-words">
                  {t.open ? 'rising: ' : `trade ${k + 1}: `}
                  <span className="text-slate-200">
                    {t.open ? `bought on day ${t.buyDay} at ${view.prices[t.buyDay]}, ${t.profit} so far (up to day ${t.sellDay})` : tradeText(t)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* what the colours mean (only the states this step shows) */}
        <ul className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="stock2-legend">
          {(Object.keys(TONE_TEXT) as Tone[])
            .filter(t => shown.has(t))
            .map(t => (
              <li key={t} data-legend={t} className={`flex items-center gap-1 ${TONE_TEXT_CLASS[t]}`}>
                <span className={`inline-block w-3 h-3 rounded border-2 ${TONE[t]}`} />
                <span className="text-slate-300">{TONE_TEXT[t]}</span>
              </li>
            ))}
          {view.gains.length > 0 && (
            <li data-legend="changes" className="text-slate-300">
              {/* one text run: a flex gap would put spaces before the commas */}
              <span>
                change from the day before: <span className="text-emerald-300">rise counted</span>, <span className="text-rose-200">fall skipped</span>, <span>0 skipped</span>
              </span>
            </li>
          )}
        </ul>

        <p data-testid="stock2-input" className="relative z-10 text-[11px] font-mono text-slate-400 break-words">
          prices: <span className="text-slate-300">{list(view.prices)}</span>
        </p>
      </div>

      {view.result && (
        <div
          role="status"
          data-testid="stock2-result"
          data-profit={view.result.profit}
          data-trades={view.result.trades.map(t => `${t.buyDay}-${t.sellDay}`).join(',')}
          className="flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300 break-words"
        >
          <Equal className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{view.result.text}</span>
        </div>
      )}
    </div>
  );
};
