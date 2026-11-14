import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, StockIIIState, StockIIITrade, StockIIIView } from '../../types/algorithm';

interface StockIIIVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/** height of the tallest bar, in px; every bar is drawn in proportion to it */
const CHART = 140;
/** a price of 0 still gets a sliver, so the day is visible */
const MIN_BAR = 3;

const STATES: readonly StockIIIState[] = ['buy1', 'sell1', 'buy2', 'sell2'];

/** what each running value means, in words; a buy value is negative because the price has been paid */
const MEANING: Record<StockIIIState, string> = {
  buy1: 'cash after the 1st buy — negative: the price paid',
  sell1: 'profit after the 1st sale',
  buy2: 'cash after the 2nd buy — the 1st profit less the price paid',
  sell2: 'profit after the 2nd sale — the answer',
};
/** the expression each update compares with the old value */
const EXPRESSION: Record<StockIIIState, string> = {
  buy1: '−prices[i]',
  sell1: 'buy1 + prices[i]',
  buy2: 'sell1 − prices[i]',
  sell2: 'buy2 + prices[i]',
};

/**
 * how a day's bar is drawn. current: day i; buy / sell: a day of a transaction behind sell2; checked: seen already;
 * waiting: not reached yet
 */
type Tone = 'current' | 'buy' | 'sell' | 'checked' | 'waiting';
const TONE: Record<Tone, string> = {
  current: 'bg-amber-500/30 border-amber-400',
  buy: 'bg-emerald-500/30 border-emerald-400',
  sell: 'bg-purple-500/30 border-purple-400',
  checked: 'bg-slate-700/70 border-slate-500',
  waiting: 'bg-slate-900/40 border-dashed border-slate-500',
};
const TONE_TEXT_CLASS: Record<Tone, string> = {
  current: 'text-amber-300',
  buy: 'text-emerald-300',
  sell: 'text-purple-300',
  checked: 'text-slate-300',
  waiting: 'text-slate-300',
};
const TONE_TEXT: Record<Tone, string> = {
  current: 'day i: being processed',
  buy: 'buy day of a transaction',
  sell: 'sell day of a transaction',
  checked: 'seen',
  waiting: 'not reached yet',
};

/** a number as shown: a true minus sign for negatives */
const num = (x: number) => (x < 0 ? `−${-x}` : String(x));
const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

/** the day being processed, while the loop is on a day */
const currentDay = (view: StockIIIView) =>
  view.i !== null && view.i < view.prices.length && view.operation !== 'start' && view.operation !== 'done' && view.operation !== 'init' ? view.i : null;

/** how many days have been seen: day 0 once the values are set, and every day up to i */
function seenUpTo(view: StockIIIView): number {
  if (view.operation === 'done') return view.prices.length;
  if (view.i !== null) return view.i;
  return view.buy1 !== null ? 1 : 0;
}

/** the most completed trades each value can stand on */
const MAX_DONE: Record<StockIIIState, number> = { buy1: 0, sell1: 1, buy2: 1, sell2: 2 };

const isDay = (view: StockIIIView, d: number) => Number.isInteger(d) && d >= 0 && d < view.prices.length;

/**
 * The history behind one value, or null when the step's history cannot be what earned it (only a made-up step could):
 * each trade a real buy strictly before its sale, on days that exist, in order with no two sharing a day, earning exactly
 * the difference of its two prices and more than 0; no more trades than the value allows; a share still held bought
 * strictly after the last sale; and all of it adding up exactly to the value. The chart, the list and the four cards all go
 * through this one check, so none of them shows a history the others reject. It only decides what is drawn: the values
 * themselves are always shown as the step gives them.
 */
function provenance(view: StockIIIView, state: StockIIIState): { done: readonly StockIIITrade[]; open: number | null } | null {
  const value = view[state];
  const w = view.witnesses;
  const held = state === 'buy1' || state === 'buy2' ? w[state] : null;
  const done = state === 'buy1' || state === 'buy2' ? (held?.done ?? []) : w[state];
  if (value === null) return held === null && done.length === 0 ? { done, open: null } : null;
  if ((state === 'buy1' || state === 'buy2') && held === null) return null;
  if (done.length > MAX_DONE[state]) return null;
  let last = -1;
  let earned = 0;
  for (const t of done) {
    const ok =
      isDay(view, t.buyDay) && isDay(view, t.sellDay) && t.buyDay > last && t.buyDay < t.sellDay && t.profit === view.prices[t.sellDay] - view.prices[t.buyDay] && t.profit > 0;
    if (!ok) return null;
    last = t.sellDay;
    earned += t.profit;
  }
  if (held) {
    if (!isDay(view, held.open) || held.open <= last) return null;
    earned -= view.prices[held.open];
  }
  return earned === value ? { done, open: held ? held.open : null } : null;
}

/** the transactions shown on the chart and listed: those behind sell2, or none when they fail the check above */
const shownTrades = (view: StockIIIView): readonly StockIIITrade[] => provenance(view, 'sell2')?.done ?? [];

function toneOf(view: StockIIIView, trades: readonly StockIIITrade[], day: number): Tone {
  if (day === currentDay(view)) return 'current';
  if (trades.some(t => t.buyDay === day)) return 'buy';
  if (trades.some(t => t.sellDay === day)) return 'sell';
  return day < seenUpTo(view) ? 'checked' : 'waiting';
}

/** the labels under a day: today, and the transaction ends ("buy" and its number) */
function tagsOf(view: StockIIIView, trades: readonly StockIIITrade[], day: number): { key: string; word: string; n?: number }[] {
  const tags: { key: string; word: string; n?: number }[] = [];
  if (day === currentDay(view)) tags.push({ key: 'i', word: '▲ i' });
  trades.forEach((t, k) => {
    if (t.buyDay === day) tags.push({ key: `buy${k + 1}`, word: 'buy', n: k + 1 });
    if (t.sellDay === day) tags.push({ key: `sell${k + 1}`, word: 'sell', n: k + 1 });
  });
  return tags;
}
const TAG_CLASS = (key: string) => (key === 'i' ? 'text-amber-300' : key.startsWith('buy') ? 'text-emerald-300' : 'text-purple-300');

/** the trades behind a value, in words, for its card; null when they fail the check, so the card shows no history */
function backing(view: StockIIIView, state: StockIIIState): string | null {
  const history = provenance(view, state);
  if (!history) return null;
  const trade = (t: StockIIITrade) => `day ${t.buyDay} → ${t.sellDay} (+${t.profit})`;
  if (history.open !== null) {
    return `${history.done.map(trade).join(', ')}${history.done.length ? ', then ' : ''}holding since day ${history.open} at ${view.prices[history.open]}`;
  }
  return history.done.length ? history.done.map(trade).join(', ') : 'no sale yet';
}

/**
 * Best Time to Buy and Sell Stock III (visual: 'stock-iii'): the prices as a chart, one bar per day with its day and price
 * under it; the four running values of the code as cards in the order they are updated (buy1, sell1, buy2, sell2), each
 * with its meaning, the one being updated showing its old value, the candidate and which won; and, marked DISPLAY ONLY
 * because the code keeps only the four values, the transactions behind sell2 as brackets under the chart (a dot on the
 * buy day, an arrowhead on the sell day, numbered 1 and 2) and listed. Bars narrow and the cards wrap two to a row on a
 * phone. Everything shown comes from the step itself (ExecutionStep.stockIII).
 */
export const StockIIIVisualizer: React.FC<StockIIIVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.stockIII;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const n = view.prices.length;
  const top = Math.max(...view.prices, 1);
  const height = (price: number) => Math.max(MIN_BAR, Math.round((price / top) * CHART));
  const trades = shownTrades(view);
  const tones = view.prices.map((_, d) => toneOf(view, trades, d));
  const shown = new Set(tones);
  const day = currentDay(view);
  const upd = view.update;
  const bracketAt = (d: number) => {
    const k = trades.findIndex(t => d >= t.buyDay && d <= t.sellDay);
    if (k < 0) return null;
    const t = trades[k];
    return { index: k, part: d === t.buyDay ? 'buy' : d === t.sellDay ? 'sell' : 'between' } as const;
  };
  const tradeText = (t: StockIIITrade) => `buy day ${t.buyDay} at ${view.prices[t.buyDay]} → sell day ${t.sellDay} at ${view.prices[t.sellDay]} (+${t.profit})`;
  const described = view.prices
    .map((price, d) => {
      const tags = tagsOf(view, trades, d).map(t => (t.n ? `${t.word} ${t.n}` : 'i'));
      return `day ${d} price ${price}${tags.length ? ` (${tags.join(', ')})` : ''}`;
    })
    .join('; ');

  return (
    <div className="w-full flex flex-col gap-2" data-testid="stock3-visualizer" data-length={n} data-operation={view.operation}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="stock3-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span
          data-testid="stock3-progress"
          className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300"
        >
          {view.result ? 'Done' : `${Math.min(seenUpTo(view), n)} of ${n} days`}
        </span>

        {/* the chart: one bar per day; under it the day, the price and the labels; then the transactions behind sell2 */}
        <div className="relative z-10 w-full" data-testid="stock3-chart" aria-hidden="true">
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
            {view.prices.map((price, d) => (
              <li key={d} className="flex-1 max-w-14 min-w-0 flex flex-col items-center leading-tight">
                <span className="text-[10px] text-slate-400">{d}</span>
                <span className="text-[11px] font-bold text-slate-200 tabular-nums">{price}</span>
                <span data-tags={d} className="min-h-10 flex flex-col items-center text-center text-[9px] sm:text-[10px] font-bold">
                  {tagsOf(view, trades, d).map(t => (
                    // the word and the transaction number are two lines on a phone, so a label never spills into the next column
                    <span key={t.key} data-tag={t.key} className={`flex flex-col sm:flex-row sm:gap-0.5 items-center leading-none sm:leading-tight ${TAG_CLASS(t.key)}`}>
                      <span>{t.word}</span>
                      {t.n !== undefined && <span>{t.n}</span>}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
          {trades.length > 0 && (
            <ol data-testid="stock3-brackets" data-trades={trades.map(t => `${t.buyDay}-${t.sellDay}`).join(',')} className="flex justify-center gap-1 sm:gap-2 select-none">
              {view.prices.map((_, d) => {
                const at = bracketAt(d);
                const line = 'border-t-2 border-solid border-slate-400';
                return (
                  <li key={d} data-bracket={at ? `${at.index + 1}:${at.part}` : 'none'} className="relative flex-1 max-w-14 h-4">
                    {at?.part === 'buy' && <span className={`absolute top-1/2 left-1/2 -right-0.5 sm:-right-1 ${line}`} />}
                    {at?.part === 'between' && <span className={`absolute top-1/2 -left-0.5 -right-0.5 sm:-left-1 sm:-right-1 ${line}`} />}
                    {at?.part === 'sell' && <span className={`absolute top-1/2 -left-0.5 sm:-left-1 right-1/2 ${line}`} />}
                    {at?.part === 'buy' && (
                      <span data-bracket-end="buy" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-400 border-2 border-emerald-300" />
                    )}
                    {at?.part === 'sell' && (
                      // an arrowhead drawn with borders (a character could be drawn as a colour emoji)
                      <span data-bracket-end="sell" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 border-y-[7px] border-y-transparent border-l-[11px] border-l-purple-400" />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <p className="sr-only" data-testid="stock3-text">
          The prices: {described}.{' '}
          {STATES.map(s => `${s} = ${view[s] === null ? 'not set' : view[s]}`).join(', ')}.{' '}
          {upd && upd.old !== null && `${upd.state} = max(${upd.old}, ${upd.candidate}) = ${upd.value}, ${upd.changed ? 'improved' : 'kept'}.`}{' '}
          {`Shown for explanation only, not stored by the code: ${trades.length ? trades.map(tradeText).join('; ') : 'no transaction behind sell2 yet'}.`}
        </p>

        {/* the four running values: the code's own variables, in the order they are updated */}
        <div className="relative z-10 flex flex-col gap-1" data-testid="stock3-states">
          <p className="text-center text-[10px] font-mono text-slate-400">each day: buy1 → sell1 → buy2 → sell2, each from the one before, as just updated</p>
          <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
            {STATES.map(s => {
              const active = upd?.state === s;
              const v = view[s];
              const caption = v === null ? null : backing(view, s);
              return (
                <li
                  key={s}
                  data-state={s}
                  data-value={v ?? ''}
                  data-active={active ? 'true' : 'false'}
                  data-changed={active ? String(upd!.changed) : ''}
                  className={`min-w-0 px-2 py-1.5 rounded-lg border-2 text-[11px] ${
                    active ? (upd!.changed ? 'bg-emerald-500/15 border-emerald-500' : 'bg-amber-500/15 border-amber-400') : 'bg-slate-900/60 border-slate-600'
                  }`}
                >
                  <p className="flex items-baseline justify-between gap-1">
                    <span className="font-bold text-sky-200">{s}</span>
                    <span className="font-bold text-slate-100 tabular-nums text-sm">{v === null ? '–' : num(v)}</span>
                  </p>
                  <p className="text-[10px] text-slate-400 leading-snug">{MEANING[s]}</p>
                  {caption !== null && (
                    <p data-caption={s} className="text-[10px] text-slate-300 leading-snug break-words">
                      {caption}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* the update this step made: old value, candidate and the winner */}
        {upd && upd.old !== null && day !== null && (
          <div
            data-testid="stock3-update"
            data-state={upd.state}
            data-old={upd.old}
            data-candidate={upd.candidate}
            data-value={upd.value}
            data-changed={String(upd.changed)}
            className={`relative z-10 self-center px-2 py-1 rounded-md border-2 font-mono text-[11px] text-center ${upd.changed ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : 'bg-slate-800/80 border-slate-600 text-slate-200'}`}
          >
            <p className="font-bold tabular-nums">
              {upd.state} = max({num(upd.old)}, {EXPRESSION[upd.state]} = {num(upd.candidate)}) = {num(upd.value)}
            </p>
            <p>
              day {day}, price {view.prices[day]}: {upd.changed ? `${num(upd.candidate)} wins — ${upd.state} improves` : `${num(upd.old)} stays — not beaten`}
            </p>
          </div>
        )}

        {/* what this step did, in the trace's own words */}
        <div className="relative z-10 min-h-7 flex items-center justify-center" data-testid="stock3-note" data-kind={view.operation}>
          <span className="px-2 py-1 rounded-md border font-mono font-bold text-[11px] sm:text-xs text-center break-words bg-slate-800/80 border-slate-600 text-slate-200">{currentStep.message}</span>
        </div>

        {/* display only: the transactions behind sell2, which the code never records */}
        <div className="relative z-10 w-full flex flex-col gap-1 text-[11px] font-mono rounded-lg border border-dashed border-slate-500 px-2 py-2" data-testid="stock3-display-only">
          <p className="font-bold text-slate-300">Display only — the code does not store these transactions; it keeps only buy1, sell1, buy2 and sell2</p>
          <p data-testid="stock3-running" data-value={view.sell2 ?? ''} className="text-slate-400">
            sell2 so far: <span className="text-slate-200 tabular-nums">{view.sell2 === null ? '–' : num(view.sell2)}</span>
          </p>
          {trades.length === 0 ? (
            <p className="text-slate-400">
              transactions behind sell2: <span className="text-slate-200">none yet</span>
            </p>
          ) : (
            <ol className="flex flex-col gap-0.5" data-testid="stock3-trades">
              {trades.map((t, k) => (
                <li key={k} data-trade={k + 1} data-buy={t.buyDay} data-sell={t.sellDay} data-profit={t.profit} className="text-slate-400 break-words">
                  transaction {k + 1}: <span className="text-slate-200">{tradeText(t)}</span>
                </li>
              ))}
              {trades.length === 1 && <li className="text-slate-400">one transaction is enough here: a second would not earn more</li>}
            </ol>
          )}
        </div>

        {/* what the colours mean (only the states this step shows) */}
        <ul className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="stock3-legend">
          {(Object.keys(TONE_TEXT) as Tone[])
            .filter(t => shown.has(t))
            .map(t => (
              <li key={t} data-legend={t} className={`flex items-center gap-1 ${TONE_TEXT_CLASS[t]}`}>
                <span className={`inline-block w-3 h-3 rounded border-2 ${TONE[t]}`} />
                <span className="text-slate-300">{TONE_TEXT[t]}</span>
              </li>
            ))}
        </ul>

        <p data-testid="stock3-input" className="relative z-10 text-[11px] font-mono text-slate-400 break-words">
          prices: <span className="text-slate-300">{list(view.prices)}</span>
        </p>
      </div>

      {view.result && (
        <div
          role="status"
          data-testid="stock3-result"
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
