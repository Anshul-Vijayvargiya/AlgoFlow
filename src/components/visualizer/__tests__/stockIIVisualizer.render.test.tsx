import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { StockIIVisualizer } from '../StockIIVisualizer';
import { StockVisualizer } from '../StockVisualizer';

// The real StockIIVisualizer for steps of the real trace: the price chart, the change from the day before under each
// day, the pair being compared, the trades as brackets, totalProfit with the rises it adds up, and the display-only trades.
const run = (...prices: number[]) => getAlgorithmDefinition('array-buy-sell-stock-ii')!.generateSteps(prices);
const render = (s: ExecutionStep) => renderToStaticMarkup(<StockIIVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/<!-- -->/g, '');
/** the visible and screen-reader text of a step (tags are removed before "<" in a message is decoded) */
const text = (s: ExecutionStep) => decode(render(s).replace(/<[^>]+>/g, ''));
/** every bar as "day=price:tone" */
const bars = (html: string) => [...html.matchAll(/data-day="(\d+)" data-price="(\d+)" data-tone="([a-z]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}`);
/** every change chip that shows a change, as "day:kind:counted:text" (the sign and the digits are two spans) */
const changes = (html: string) =>
  [...html.matchAll(/data-change="(\d+)" data-kind="([a-z]*)" data-counted="(true|false|)" class="[^"]*">(.*?)<\/span><span data-tags/g)]
    .filter(m => m[2])
    .map(m => `${m[1]}:${m[2]}:${m[3]}:${m[4].replace(/<[^>]+>/g, '')}`);
/** the labels under each day that has any, as "day:i-1,buy" */
const tags = (html: string) =>
  [...html.matchAll(/data-tags="(\d+)"[^>]*>(.*?)<\/span><\/li>/g)].map(m => [m[1], [...m[2].matchAll(/data-tag="([a-z-0-9]+)"/g)].map(t => t[1])] as const).filter(([, t]) => t.length).map(([d, t]) => `${d}:${t.join(',')}`);
const brackets = (html: string) => [...html.matchAll(/data-bracket="([^"]+)"/g)].map(m => m[1]);
const legend = (html: string) => [...html.matchAll(/data-legend="([a-z]+)"/g)].map(m => m[1]);

const STEPS = run(7, 1, 5, 3, 6, 4);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('StockIIVisualizer', () => {
  it('the first step: one bar per day with its day and price, nothing compared, no trades', () => {
    const html = decode(render(STEPS[0]));
    expect(bars(html)).toEqual(['0=7:waiting', '1=1:waiting', '2=5:waiting', '3=3:waiting', '4=6:waiting', '5=4:waiting']);
    expect(changes(html)).toEqual([]);
    expect(html).not.toContain('data-testid="stock2-brackets"');
    expect(html).not.toContain('data-testid="stock2-pair"');
    expect(text(STEPS[0])).toContain('0 of 5 compared');
    expect(text(STEPS[0])).toContain('rises counted: none yet');
    expect(text(STEPS[0])).toContain('trades so far: none yet');
    expect(html).toMatch(/data-var="totalProfit" data-value="" data-moved="false"/);
    expect(html).not.toContain('data-testid="stock2-result"');
  });

  it('a fall: the pair is marked, its change is rose and skipped, nothing is added', () => {
    const s = at('check-rise', 0);
    const html = decode(render(s));
    expect(bars(html).slice(0, 2)).toEqual(['0=7:pair', '1=1:pair']);
    expect(tags(html)).toEqual(['0:i-1', '1:i']);
    expect(changes(html)).toEqual(['1:fall:false:−6']);
    expect(html).toMatch(/data-change="1" data-kind="fall" data-counted="false" class="[^"]*bg-rose-500\/15[^"]*ring-2 ring-amber-400"/);
    expect(html).toMatch(/data-testid="stock2-pair" data-from="0" data-to="1" data-delta="-6" data-kind="fall"/);
    expect(text(s)).toContain('day 0 → day 1: 1 − 7 = −6');
    expect(text(s)).toContain('a fall: skipped');
  });

  it('a rise: its change is green and counted, and the addition starts a trade, drawn as a dashed bracket while it may still grow', () => {
    const check = decode(render(at('check-rise', 1)));
    expect(changes(check)).toEqual(['1:fall:false:−6', '2:rise:true:+4']);
    expect(text(at('check-rise', 1))).toContain('a rise: counted');
    const add = decode(render(at('add-gain', 0)));
    expect(add).toMatch(/data-var="totalProfit" data-value="4" data-moved="true"/);
    expect(text(at('add-gain', 0))).toContain('rises counted: 4 = 4');
    expect(add).toMatch(/data-testid="stock2-brackets" data-trades="1-2\*"/);
    expect(brackets(add)).toEqual(['none', '0:buy:open', '0:sell:open', 'none', 'none', 'none']);
    expect(add).toMatch(/data-bracket-end="holding" class="[^"]*border-l-purple-400 opacity-60"/);
    expect(add).toMatch(/data-bracket="0:buy:open"[^>]*><span class="[^"]*border-t-2 border-dashed border-purple-400"/);
    expect(text(at('add-gain', 0))).toContain('rising: bought on day 1 at 1, 4 so far (up to day 2)');
  });

  it('a fall after a rise completes the trade: the bracket turns solid, with a dot at buy and an arrowhead at sell', () => {
    const s = at('check-rise', 2);
    const html = decode(render(s));
    expect(html).toMatch(/data-testid="stock2-brackets" data-trades="1-2"/);
    expect(brackets(html)).toEqual(['none', '0:buy', '0:sell', 'none', 'none', 'none']);
    expect(html).toMatch(/data-bracket="0:buy"[^>]*><span class="[^"]*border-t-2 border-solid border-slate-400"/);
    expect(html).toMatch(/data-bracket-end="buy" class="[^"]*rounded-full bg-emerald-400/);
    expect(html).toMatch(/data-bracket-end="sell" class="[^"]*w-0 h-0 border-y-\[7px\] border-y-transparent border-l-\[11px\] border-l-purple-400"/);
    expect(bars(html).slice(1, 3)).toEqual(['1=1:buy', '2=5:pair']);
    expect(text(s)).toContain('trade 1: buy day 1 at 1 → sell day 2 at 5 (+4)');
  });

  it('the end: two trades, both brackets, the counted rises adding up to the answer', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(bars(html)).toEqual(['0=7:checked', '1=1:buy', '2=5:sell', '3=3:buy', '4=6:sell', '5=4:checked']);
    expect(changes(html)).toEqual(['1:fall:false:−6', '2:rise:true:+4', '3:fall:false:−2', '4:rise:true:+3', '5:fall:false:−2']);
    expect(brackets(html)).toEqual(['none', '0:buy', '0:sell', '1:buy', '1:sell', 'none']);
    expect(text(STEPS.at(-1)!)).toContain('rises counted: 4 + 3 = 7');
    expect(html).toMatch(/role="status" data-testid="stock2-result" data-profit="7" data-trades="1-2,3-4"/);
    expect(text(STEPS.at(-1)!)).toContain('Maximum profit 7 from 2 trades: buy day 1 at 1 → sell day 2 at 5 (+4), buy day 3 at 3 → sell day 4 at 6 (+3)');
    expect(legend(html)).toEqual(['buy', 'sell', 'checked', 'changes']);
  });

  it('consecutive rises: one growing dashed bracket, with the rises shown to equal one trade from the bottom to the top', () => {
    const steps = run(1, 2, 3, 4, 5);
    const third = steps.filter(s => s.codeRef === 'add-gain')[2];
    const html = decode(render(third));
    expect(brackets(html)).toEqual(['0:buy:open', '0:between:open', '0:between:open', '0:sell:open', 'none']);
    expect(html).toMatch(/data-testid="stock2-run" data-buy="0" data-sell="3"/);
    expect(text(third)).toContain('+1 +1 +1 = 3 = 4 − 1: the same as one trade, buy on day 0, sell on day 3 (still rising)');
    expect(tags(html)).toEqual(['0:buy', '2:i-1', '3:i,holding']);
    const end = decode(render(steps.at(-1)!));
    expect(brackets(end)).toEqual(['0:buy', '0:between', '0:between', '0:between', '0:sell']);
    expect(end).not.toContain('data-testid="stock2-run"');
    // the step that completes it explains it too
    expect(text(steps.at(-2)!)).toContain('+1 +1 +1 +1 = 4 = 5 − 1: the same as one trade, buy on day 0, sell on day 4');
    // a single rise is not explained as a run
    expect(decode(render(steps.filter(s => s.codeRef === 'add-gain')[0]))).not.toContain('data-testid="stock2-run"');
  });

  it('a flat day: grey, skipped, and it ends the trade: [1, 2, 2, 3] shows two trades', () => {
    const steps = run(1, 2, 2, 3);
    const flat = steps.find(s => s.codeRef === 'check-rise' && s.stockII!.change === 0)!;
    const html = decode(render(flat));
    expect(changes(html)).toEqual(['1:rise:true:+1', '2:flat:false:0']);
    expect(html).toMatch(/data-change="2" data-kind="flat" data-counted="false" class="[^"]*bg-slate-800\/80/);
    expect(text(flat)).toContain('no change: skipped');
    expect(brackets(html)).toEqual(['0:buy', '0:sell', 'none', 'none']);
    const end = decode(render(steps.at(-1)!));
    expect(brackets(end)).toEqual(['0:buy', '0:sell', '1:buy', '1:sell']);
    expect(end).toMatch(/data-testid="stock2-result" data-profit="2" data-trades="0-1,2-3"/);
  });

  it('no profit: no brackets ever, no trades, and the result says why', () => {
    for (const prices of [[7], [7, 6, 4, 3, 1], [2, 2, 2, 2]]) {
      for (const s of run(...prices)) expect(decode(render(s)), JSON.stringify(prices)).not.toContain('data-testid="stock2-brackets"');
    }
    const falling = run(7, 6, 4, 3, 1);
    expect(text(falling.at(-1)!)).toContain('No profit possible: the price never rises from one day to the next');
    expect(decode(render(falling.at(-1)!))).toMatch(/data-testid="stock2-result" data-profit="0" data-trades=""/);
    expect(text(run(7).at(-1)!)).toContain('No profit possible: there is only one day');
  });

  it('the trades are labelled display only, apart from totalProfit', () => {
    const html = decode(render(STEPS.at(-1)!));
    const box = html.slice(html.indexOf('data-testid="stock2-display-only"'), html.indexOf('data-testid="stock2-legend"'));
    expect(box).toContain('Display only — the code does not store these trades; it keeps only totalProfit');
    expect(box).not.toContain('data-var=');
    expect(html.indexOf('data-testid="stock2-vars"')).toBeLessThan(html.indexOf('data-testid="stock2-display-only"'));
  });

  it('the step is described once, in its own words', () => {
    const s = at('add-gain', 0);
    expect(text(s).split('totalProfit += 5 - 1 → 4')).toHaveLength(2);
  });

  it('nothing is worked out here: the picture follows the step it is given', () => {
    const fake: ExecutionStep = {
      id: 0,
      state: [4, 9, 2],
      type: 'condition',
      message: 'made up',
      stockII: {
        prices: [4, 9, 2],
        i: 2,
        totalProfit: 50,
        operation: 'check-rise',
        prev: 9,
        cur: 2,
        change: -7,
        gains: [{ day: 1, change: 5, counted: true }],
        trades: [{ buyDay: 0, sellDay: 1, profit: 5 }],
        open: null,
      },
    };
    const html = decode(render(fake));
    expect(bars(html)).toEqual(['0=4:buy', '1=9:pair', '2=2:pair']);
    expect(html).toMatch(/data-var="totalProfit" data-value="50"/);
    expect(text(fake)).toContain('day 1 → day 2: 2 − 9 = −7');
    expect(text(fake)).toContain('made up');
  });

  it('screen readers get the prices, the changes and the trades in words; the chart is hidden from them', () => {
    const s = STEPS.at(-1)!;
    const html = decode(render(s));
    expect(html).toMatch(/data-testid="stock2-chart" aria-hidden="true"/);
    expect(text(s)).toContain('day 2 price 5, +4 from the day before (counted) (sell)');
    expect(text(s)).toContain('Shown for explanation only, not stored by the code: buy day 1 at 1 → sell day 2 at 5 (+4); buy day 3 at 3 → sell day 4 at 6 (+3).');
  });

  it('responsive: ten bars share the width; chips and labels share their columns; the variable keeps its value beside its name', () => {
    const html = decode(render(run(400, 120, 399, 7, 250, 999, 31, 400, 268, 105).at(-1)!));
    expect(bars(html)).toHaveLength(10);
    expect(changes(html)).toHaveLength(9);
    expect(html).toMatch(/<li class="flex-1 max-w-14 min-w-0 flex flex-col items-center leading-tight">/);
    expect(html).toMatch(/data-change="1" data-kind="fall" data-counted="false" class="[^"]*px-px sm:px-0.5[^"]*flex flex-col sm:flex-row[^"]*text-\[9px\] sm:text-\[10px\]/);
    // the sign and the digits are separate, so on a phone the sign sits above the digits
    expect(html).toMatch(/data-change="1" data-kind="fall" data-counted="false" class="[^"]*"><span>−<\/span><span>280<\/span><\/span>/);
    expect(html).not.toContain('overflow-x-auto');
    expect(html).toMatch(/<dt class="shrink-0 [^"]*">totalProfit<\/dt><dd class="shrink-0 whitespace-nowrap /);
  });

  it('a step of another algorithm draws nothing, and Stock I ignores a Stock II step', () => {
    expect(renderToStaticMarkup(<StockIIVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
    expect(renderToStaticMarkup(<StockIIVisualizer currentStep={getAlgorithmDefinition('array-buy-sell-stock')!.generateSteps([1, 2])[0]} />)).toBe('');
    expect(renderToStaticMarkup(<StockVisualizer currentStep={STEPS[0]} />)).toBe('');
  });
});
