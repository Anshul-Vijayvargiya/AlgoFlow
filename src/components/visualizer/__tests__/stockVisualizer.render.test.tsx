import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { StockVisualizer } from '../StockVisualizer';
import { SortColorsVisualizer } from '../SortColorsVisualizer';
import { HouseRobberVisualizer } from '../HouseRobberVisualizer';

// The real StockVisualizer for steps of the real trace: the price chart, the line at the lowest price, the day's profit
// span, the variables, and the display-only days.
const run = (...prices: number[]) => getAlgorithmDefinition('array-buy-sell-stock')!.generateSteps(prices);
const render = (s: ExecutionStep) => renderToStaticMarkup(<StockVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/<!-- -->/g, '');
/** the visible and screen-reader text of a step (tags are removed before "<" in a message is decoded) */
const text = (s: ExecutionStep) => decode(render(s).replace(/<[^>]+>/g, ''));
/** every bar as "day=price:tone" */
const bars = (html: string) => [...html.matchAll(/data-day="(\d+)" data-price="(\d+)" data-tone="([a-z]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}`);
/** the labels under each day that has any, as "day:i,min" */
const tags = (html: string) =>
  [...html.matchAll(/data-tags="(\d+)"[^>]*>(.*?)<\/span><\/li>/g)].map(m => [m[1], [...m[2].matchAll(/data-tag="([a-z]+)"/g)].map(t => t[1])] as const).filter(([, t]) => t.length).map(([d, t]) => `${d}:${t.join(',')}`);
const vars = (html: string) => [...html.matchAll(/data-var="([A-Za-z]+)" data-value="(\d*)" data-moved="(true|false)"/g)].map(m => `${m[1]}=${m[2]}${m[3] === 'true' ? '*' : ''}`);
const legend = (html: string) => [...html.matchAll(/data-legend="([a-z]+)"/g)].map(m => m[1]);
const heightOf = (html: string, day: number) => Number(html.match(new RegExp(`data-day="${day}" data-price="\\d+" data-tone="[a-z]+" style="height:(\\d+)px`))![1]);

const STEPS = run(7, 1, 5, 3, 6, 4);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('StockVisualizer', () => {
  it('the first step: one bar per day with its day and price, all unchecked, nothing set', () => {
    const html = decode(render(STEPS[0]));
    expect(bars(html)).toEqual(['0=7:waiting', '1=1:waiting', '2=5:waiting', '3=3:waiting', '4=6:waiting', '5=4:waiting']);
    expect(vars(html)).toEqual(['minPrice=', 'profit=', 'maxProfit=']);
    expect(html).not.toContain('data-testid="stock-min-line"');
    expect(html).not.toContain('data-testid="stock-profit"');
    expect(text(STEPS[0])).toContain('0 of 6 checked');
    expect(text(STEPS[0])).toContain('prices: [7, 1, 5, 3, 6, 4]');
    expect(html).not.toContain('data-testid="stock-result"');
    expect(legend(html)).toEqual(['waiting']);
  });

  it('bars are drawn in proportion to the highest price; a price of 0 still shows a sliver', () => {
    const html = decode(render(STEPS[0]));
    expect(heightOf(html, 0)).toBe(140);
    expect(heightOf(html, 1)).toBe(20);
    expect(heightOf(html, 4)).toBe(120);
    const zero = decode(render(run(0, 5)[0]));
    expect(heightOf(zero, 0)).toBe(3);
    expect(heightOf(zero, 1)).toBe(140);
    // all zeros: nothing to scale by, every bar a sliver
    expect(heightOf(decode(render(run(0, 0)[0])), 1)).toBe(3);
  });

  it('day 0 becomes the minimum, with a dashed line at its price', () => {
    const html = decode(render(at('init-min')));
    expect(bars(html)[0]).toBe('0=7:min');
    expect(tags(html)).toEqual(['0:min']);
    expect(html).toMatch(/data-testid="stock-min-line" data-price="7"[^>]*style="bottom:140px"><\/div>/);
    expect(vars(html)).toEqual(['minPrice=7*', 'profit=', 'maxProfit=']);
  });

  it('a new minimum: the day turns into the minimum, the line drops to it, and its profit is 0', () => {
    const update = decode(render(at('update-min', 0)));
    expect(bars(update).slice(0, 2)).toEqual(['0=7:checked', '1=1:current']);
    expect(tags(update)).toEqual(['1:i,min']);
    expect(update).toMatch(/data-testid="stock-min-line" data-price="1"[^>]*style="bottom:20px"/);
    expect(vars(update)).toEqual(['minPrice=1*', 'profit=', 'maxProfit=0']);
    const profit = decode(render(at('compute-profit', 0)));
    expect(profit).toMatch(/data-testid="stock-profit" data-day="1" data-profit="0" data-kind="new-min"/);
    expect(text(at('compute-profit', 0))).toContain('sell on day 1: 1 − 1 = 0');
    expect(text(at('compute-profit', 0))).toContain('new minimum: selling today earns 0');
    expect(profit).toMatch(/data-testid="stock-profit-span" data-from="1" data-to="1" data-kind="new-min" class="[^"]*bg-cyan-400/);
  });

  it("the day's profit: a span from the minimum up to today's price, green when it beats the best, grey when not", () => {
    const better = decode(render(at('check-profit', 1)));
    expect(better).toMatch(/data-testid="stock-profit-span" data-from="1" data-to="5" data-kind="better" class="[^"]*bg-emerald-400[^"]*" style="bottom:20px;height:80px"/);
    expect(text(at('check-profit', 1))).toContain('sell on day 2: 5 − 1 = 4');
    expect(text(at('check-profit', 1))).toContain('better than 0');
    const worse = decode(render(at('check-profit', 2)));
    expect(worse).toMatch(/data-testid="stock-profit" data-day="3" data-profit="2" data-kind="worse"/);
    // a light bar with a dark outline, wider than the others, so it reads on the amber bar of the current day
    expect(worse).toMatch(/data-testid="stock-profit-span"[^>]*data-kind="worse" class="[^"]*w-2 bg-slate-100 border border-slate-900"/);
    expect(text(at('check-profit', 2))).toContain('not better than 4');
    // an equal positive profit says the earlier trade is kept
    const equal = run(1, 5, 1, 5).filter(s => s.codeRef === 'check-profit')[2];
    expect(text(equal)).toContain('only equals 4: the earlier trade is kept');
    expect(decode(render(equal))).toMatch(/data-testid="stock-profit-span"[^>]*data-kind="equal" class="[^"]*w-2 bg-slate-100 border border-slate-900"/);
  });

  it('a zero profit that ties a zero best: no profitable trade has been found yet, and no earlier trade is mentioned', () => {
    for (const prices of [[3, 3], [2, 2, 2, 2]]) {
      for (const s of run(...prices).filter(x => x.codeRef === 'check-profit')) {
        expect(text(s), JSON.stringify(prices)).toContain('no profitable trade has been found yet');
        expect(text(s), JSON.stringify(prices)).not.toMatch(/earlier (trade|sale)/);
        expect(decode(render(s))).toMatch(/data-testid="stock-profit" data-day="\d" data-profit="0" data-kind="equal"/);
        expect(decode(render(s))).not.toContain('data-testid="stock-bracket"');
      }
    }
    // the example's day 1: on its comparison the profit 0 ties the best 0, which is said accurately, in the panel and in
    // the explanation
    const day1 = at('check-profit', 0);
    expect(text(day1)).toContain('sell on day 1: 1 − 1 = 0');
    expect(text(day1)).toContain('no profitable trade has been found yet');
    expect(text(day1)).not.toMatch(/earlier (trade|sale)/);
    expect(day1.explanation).toBe('Selling today earns 0. No profitable trade has been found yet.');
  });

  it('a better profit moves the buy and sell days, marked on the chart and in the display-only box', () => {
    const html = decode(render(at('update-profit', 0)));
    expect(bars(html).slice(0, 3)).toEqual(['0=7:checked', '1=1:buy', '2=5:current']);
    expect(tags(html)).toEqual(['1:min,buy', '2:i,sell']);
    expect(vars(html)).toEqual(['minPrice=1', 'profit=4', 'maxProfit=4*']);
    expect(text(at('update-profit', 0))).toContain('the best profit so far');
    expect(html).toMatch(/data-testid="stock-trade" data-buy="1" data-sell="2"/);
    expect(text(at('update-profit', 0))).toContain('best trade so far: buy on day 1 at 1, sell on day 2 at 5 (profit 4)');
    // later, day 4 takes over as the sell day
    const later = decode(render(at('update-profit', 1)));
    expect(tags(later)).toEqual(['1:min,buy', '4:i,sell']);
    expect(bars(later)[2]).toBe('2=5:checked');
  });

  it('the days are labelled display only, apart from the variables the code keeps; no days while nothing earns', () => {
    const html = decode(render(at('init-profit')));
    const box = html.slice(html.indexOf('data-testid="stock-display-only"'), html.indexOf('data-testid="stock-legend"'));
    expect(box).toContain('Display only — the code does not store these days; it keeps only minPrice and maxProfit');
    expect(box).not.toContain('data-var=');
    expect(html.indexOf('data-testid="stock-vars"')).toBeLessThan(html.indexOf('data-testid="stock-display-only"'));
    expect(text(at('init-profit'))).toContain('lowest price so far: day 0 at 7');
    expect(text(at('init-profit'))).toContain('best trade so far: none yet: no sale has made money');
    expect(html).toMatch(/data-testid="stock-trade" data-buy="" data-sell=""/);
  });

  it('the end: the best trade marked, the answer announced; falling prices end with no days at all', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(bars(html)).toEqual(['0=7:checked', '1=1:buy', '2=5:checked', '3=3:checked', '4=6:sell', '5=4:checked']);
    expect(tags(html)).toEqual(['1:min,buy', '4:sell']);
    expect(html).toMatch(/role="status" data-testid="stock-result" data-profit="5" data-buy="1" data-sell="4"/);
    expect(text(STEPS.at(-1)!)).toContain('Maximum profit 5: buy on day 1 at 1, sell on day 4 at 6');
    expect(html).toMatch(/data-testid="stock-progress"[^>]*>Done</);
    expect(legend(html)).toEqual(['sell', 'buy', 'checked']);
    const falling = run(7, 6, 4, 3, 1);
    const end = decode(render(falling.at(-1)!));
    expect(end).toMatch(/data-testid="stock-result" data-profit="0" data-buy="" data-sell=""/);
    expect(text(falling.at(-1)!)).toContain('No profit possible: the price never rises after a lower day');
    expect(end).not.toContain('data-tag="buy"');
    expect(end).not.toContain('data-tag="sell"');
    expect(tags(end)).toEqual(['4:min']);
  });

  it('a bracket joins the buy day to the sell day, in its own row under the labels: a dot at buy, an arrowhead at sell', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(html).toMatch(/data-testid="stock-bracket" data-buy="1" data-sell="4"/);
    const parts = [...html.matchAll(/data-bracket="([a-z]+)"/g)].map(m => m[1]);
    expect(parts).toEqual(['none', 'buy', 'between', 'between', 'sell', 'none']);
    expect(html.match(/data-bracket-end="buy" class="[^"]*rounded-full bg-emerald-400/)).not.toBeNull();
    // an arrowhead made of borders, not a "▶" character (which some systems draw as a colour emoji)
    expect(html).toMatch(/data-bracket-end="sell" class="[^"]*w-0 h-0 border-y-\[7px\] border-y-transparent border-l-\[11px\] border-l-purple-400"><\/span>/);
    expect(html).not.toContain('▶');
    // its row comes after the bars and after the labels under them, inside the chart: it crosses neither
    const chart = html.slice(html.indexOf('data-testid="stock-chart"'), html.indexOf('data-testid="stock-text"'));
    expect(chart.indexOf('data-testid="stock-bracket"')).toBeGreaterThan(chart.lastIndexOf('data-tags='));
    expect(chart.indexOf('data-testid="stock-bracket"')).toBeGreaterThan(chart.lastIndexOf('data-day='));
    // the line runs from the middle of the buy column into the gaps, through the days between, to the middle of the sell column
    expect(html).toMatch(/data-bracket="buy"[^>]*><span class="absolute top-1\/2 -translate-y-1\/2 left-1\/2 -right-0.5 sm:-right-1 h-0.5 bg-slate-400"/);
    expect(html).toMatch(/data-bracket="between"[^>]*><span class="absolute top-1\/2 -translate-y-1\/2 -left-0.5 -right-0.5 sm:-left-1 sm:-right-1 h-0.5 bg-slate-400"/);
    expect(html).toMatch(/data-bracket="sell"[^>]*><span class="absolute top-1\/2 -translate-y-1\/2 -left-0.5 sm:-left-1 right-1\/2 h-0.5 bg-slate-400"/);
    // neighbouring days: no days between
    const close = decode(render(at('update-profit', 0)));
    expect([...close.matchAll(/data-bracket="([a-z]+)"/g)].map(m => m[1])).toEqual(['none', 'buy', 'sell', 'none', 'none', 'none']);
  });

  it('the bracket appears only once a trade makes money: not before, and never when there is no profit', () => {
    for (const s of STEPS.slice(0, STEPS.findIndex(x => x.codeRef === 'update-profit'))) expect(decode(render(s)), `step ${s.id}`).not.toContain('data-testid="stock-bracket"');
    for (const s of STEPS.slice(STEPS.findIndex(x => x.codeRef === 'update-profit'))) expect(decode(render(s)), `step ${s.id}`).toContain('data-testid="stock-bracket"');
    for (const prices of [[5], [7, 6, 4, 3, 1], [3, 3], [2, 2, 2, 2]]) {
      for (const s of run(...prices)) expect(decode(render(s)), JSON.stringify(prices)).not.toContain('data-testid="stock-bracket"');
    }
  });

  it('buy and sell have their own colours (green and purple), with their words, in the bars, the labels and the legend', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(html).toMatch(/data-day="1" data-price="1" data-tone="buy"[^>]*class="[^"]*bg-emerald-500\/30 border-emerald-400"/);
    expect(html).toMatch(/data-day="4" data-price="6" data-tone="sell"[^>]*class="[^"]*bg-purple-500\/30 border-purple-400"/);
    expect(html).toMatch(/data-tag="buy" class="text-emerald-300">buy</);
    expect(html).toMatch(/data-tag="sell" class="text-purple-300">sell</);
    expect(html).toMatch(/data-legend="sell" class="[^"]*text-purple-300"/);
    expect(html).toMatch(/data-legend="buy" class="[^"]*text-emerald-300"/);
  });

  it("the lowest-price bar is striped in the theme's cyan, so it stands apart from checked bars by pattern too", () => {
    const html = decode(render(at('compute-profit', 1)));
    expect(html).toMatch(/data-day="1" data-price="1" data-tone="min" style="height:20px;transition-duration:300ms;background-image:repeating-linear-gradient\(135deg, color-mix\(in oklab, var\(--color-cyan-400\) 55%, transparent\) 0 3px, transparent 3px 7px\)"/);
    // checked and current bars are not striped
    expect(html).toMatch(/data-day="0" data-price="7" data-tone="checked" style="height:140px;transition-duration:300ms"/);
    expect(html.match(/repeating-linear-gradient/g)).toHaveLength(2);
    expect(html).toMatch(/data-legend="min"[^>]*><span class="[^"]*" style="background-image:repeating-linear-gradient/);
  });

  it('the step is described once, in its own words', () => {
    const s = at('check-profit', 1);
    expect(text(s).split('profit=4 > maxProfit=0 → TRUE')).toHaveLength(2);
    expect(decode(render(s))).toMatch(/data-testid="stock-note" data-kind="check-profit"/);
  });

  it('nothing is worked out here: the picture follows the step it is given, even one the algorithm would never produce', () => {
    const fake: ExecutionStep = {
      id: 0,
      state: [4, 9, 2],
      type: 'assign',
      message: 'made up',
      stock: { prices: [4, 9, 2], i: 1, minPrice: 2, maxProfit: 7, profit: 7, operation: 'check-profit', minDay: 2, buyDay: 2, sellDay: 0 },
    };
    const html = decode(render(fake));
    expect(bars(html)).toEqual(['0=4:sell', '1=9:current', '2=2:buy']);
    expect(tags(html)).toEqual(['0:sell', '1:i', '2:min,buy']);
    expect(vars(html)).toEqual(['minPrice=2', 'profit=7', 'maxProfit=7']);
    expect(text(fake)).toContain('made up');
    expect(text(fake)).toContain('only equals 7: the earlier trade is kept');
    // a sell day before the buy day is not a valid trade: no bracket is drawn for it
    expect(decode(render(fake))).not.toContain('data-testid="stock-bracket"');
    expect(html).not.toContain('data-testid="stock-result"');
  });

  it('screen readers get the prices, the day being checked and the days of the trade in words; the chart is hidden from them', () => {
    const s = at('update-profit', 0);
    const html = decode(render(s));
    expect(html).toMatch(/data-testid="stock-chart" aria-hidden="true"/);
    expect(html).toContain('The prices: day 0 price 7, checked; day 1 price 1 (min, buy), buy day of the best trade so far; day 2 price 5 (i, sell), day i: being checked;');
    expect(text(s)).toContain('Selling on day 2 earns 5 − 1 = 4, the best profit so far.');
    expect(text(s)).toContain('Shown for explanation only, not stored by the code: the best trade so far buys on day 1 and sells on day 2.');
  });

  it('responsive: ten bars share the width and narrow instead of scrolling; names and values of variables stay together', () => {
    const html = decode(render(run(400, 120, 399, 7, 250, 999, 31, 400, 268, 105).at(-1)!));
    expect(bars(html)).toHaveLength(10);
    expect(html).toMatch(/<li class="relative h-full flex-1 max-w-14 flex items-end justify-center">/);
    expect(html).toMatch(/<li class="flex-1 max-w-14 min-w-0 flex flex-col items-center leading-tight">/);
    expect(html).not.toContain('overflow-x-auto');
    expect(html).toMatch(/<dl class="[^"]*flex flex-col sm:flex-row sm:flex-wrap/);
    expect([...html.matchAll(/<dt class="shrink-0 [^"]*">(\w+)<\/dt><dd class="shrink-0 whitespace-nowrap /g)].map(m => m[1])).toEqual(['minPrice', 'profit', 'maxProfit']);
  });

  it('a step of another algorithm draws nothing, and the other visualizers ignore a stock step', () => {
    expect(renderToStaticMarkup(<StockVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
    expect(renderToStaticMarkup(<StockVisualizer currentStep={getAlgorithmDefinition('array-sort-colors')!.generateSteps([2, 0, 1])[0]} />)).toBe('');
    expect(renderToStaticMarkup(<SortColorsVisualizer currentStep={STEPS[0]} />)).toBe('');
    expect(renderToStaticMarkup(<HouseRobberVisualizer currentStep={STEPS[0]} />)).toBe('');
  });
});
