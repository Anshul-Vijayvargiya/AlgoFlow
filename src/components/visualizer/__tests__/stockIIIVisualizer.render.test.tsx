import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { StockIIIVisualizer } from '../StockIIIVisualizer';
import { StockIIVisualizer } from '../StockIIVisualizer';
import { StockVisualizer } from '../StockVisualizer';

// The real StockIIIVisualizer for steps of the real trace: the price chart, the four value cards with the update being
// made, and the display-only transactions behind sell2 as brackets and as a list.
const run = (...prices: number[]) => getAlgorithmDefinition('array-buy-sell-stock-iii')!.generateSteps(prices);
const render = (s: ExecutionStep) => renderToStaticMarkup(<StockIIIVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/<!-- -->/g, '');
const text = (s: ExecutionStep) => decode(render(s).replace(/<[^>]+>/g, ''));
const bars = (html: string) => [...html.matchAll(/data-day="(\d+)" data-price="(\d+)" data-tone="([a-z]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}`);
/** the four cards, as "state=value" with * for the one updated (+ when it changed, = when kept) */
const cards = (html: string) =>
  [...html.matchAll(/data-state="([a-z0-9]+)" data-value="(-?\d*)" data-active="(true|false)" data-changed="(true|false|)"/g)].map(
    m => `${m[1]}=${m[2]}${m[3] === 'true' ? (m[4] === 'true' ? '+' : '=') : ''}`
  );
const tags = (html: string) =>
  [...html.matchAll(/data-tags="(\d+)"[^>]*>(.*?)<\/span><\/li>/g)].map(m => [m[1], [...m[2].matchAll(/data-tag="([a-z0-9]+)"/g)].map(t => t[1])] as const).filter(([, t]) => t.length).map(([d, t]) => `${d}:${t.join(',')}`);
const brackets = (html: string) => [...html.matchAll(/data-bracket="([^"]+)"/g)].map(m => m[1]);

const STEPS = run(1, 5, 2, 8);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('StockIIIVisualizer', () => {
  it('the first step: the bars, four empty cards in order, no transactions', () => {
    const html = decode(render(STEPS[0]));
    expect(bars(html)).toEqual(['0=1:waiting', '1=5:waiting', '2=2:waiting', '3=8:waiting']);
    expect(cards(html)).toEqual(['buy1=', 'sell1=', 'buy2=', 'sell2=']);
    expect(text(STEPS[0])).toContain('each day: buy1 → sell1 → buy2 → sell2, each from the one before, as just updated');
    expect(html).not.toContain('data-testid="stock3-brackets"');
    expect(html).not.toContain('data-testid="stock3-update"');
    expect(text(STEPS[0])).toContain('transactions behind sell2: none yet');
  });

  it('the buy cards are negative, shown with a true minus sign, and say why', () => {
    const s = at('init-sell2');
    const html = decode(render(s));
    // the step that sets sell2 marks its card as the one set
    expect(cards(html)).toEqual(['buy1=-1', 'sell1=0', 'buy2=-1', 'sell2=0+']);
    expect(text(s)).toContain('buy1−1cash after the 1st buy — negative: the price paid');
    expect(text(s)).toContain('buy2−1cash after the 2nd buy — the 1st profit less the price paid');
    expect(text(s)).toContain('holding since day 0 at 1');
    expect(text(s)).toContain('profit after the 2nd sale — the answer');
  });

  it('an update that improves: its card is marked, with the old value, the candidate and the winner', () => {
    const s = at('update-sell1', 0);
    const html = decode(render(s));
    expect(cards(html)).toEqual(['buy1=-1', 'sell1=4+', 'buy2=-1', 'sell2=0']);
    expect(html).toMatch(/data-testid="stock3-update" data-state="sell1" data-old="0" data-candidate="4" data-value="4" data-changed="true"/);
    expect(text(s)).toContain('sell1 = max(0, buy1 + prices[i] = 4) = 4');
    expect(text(s)).toContain('day 1, price 5: 4 wins — sell1 improves');
    expect(text(s)).toContain('day 0 → 1 (+4)');
  });

  it('an update that keeps the old value says so', () => {
    const s = at('update-buy1', 0);
    const html = decode(render(s));
    expect(cards(html)[0]).toBe('buy1=-1=');
    expect(html).toMatch(/data-testid="stock3-update" data-state="buy1" data-old="-1" data-candidate="-5" data-value="-1" data-changed="false"/);
    expect(text(s)).toContain('buy1 = max(−1, −prices[i] = −5) = −1');
    expect(text(s)).toContain('−1 stays — not beaten');
  });

  it('two transactions: numbered brackets from a dot on each buy day to an arrowhead on each sell day, never sharing a day', () => {
    const end = STEPS.at(-1)!;
    const html = decode(render(end));
    expect(html).toMatch(/data-testid="stock3-brackets" data-trades="0-1,2-3"/);
    expect(brackets(html)).toEqual(['1:buy', '1:sell', '2:buy', '2:sell']);
    expect(html.match(/data-bracket-end="buy"/g)).toHaveLength(2);
    expect(html.match(/data-bracket-end="sell" class="[^"]*border-l-purple-400"/g)).toHaveLength(2);
    expect(tags(html)).toEqual(['0:buy1', '1:sell1', '2:buy2', '3:sell2']);
    expect(bars(html)).toEqual(['0=1:buy', '1=5:sell', '2=2:buy', '3=8:sell']);
    expect(text(end)).toContain('transaction 1: buy day 0 at 1 → sell day 1 at 5 (+4)');
    expect(text(end)).toContain('transaction 2: buy day 2 at 2 → sell day 3 at 8 (+6)');
    expect(html).toMatch(/role="status" data-testid="stock3-result" data-profit="10" data-trades="0-1,2-3"/);
  });

  it('one transaction: one bracket, and the note that a second would not earn more', () => {
    const end = run(1, 2, 3, 4, 5).at(-1)!;
    const html = decode(render(end));
    expect(brackets(html)).toEqual(['1:buy', '1:between', '1:between', '1:between', '1:sell']);
    expect(text(end)).toContain('one transaction is enough here: a second would not earn more');
    expect(text(end)).toContain('Maximum profit 4 from 1 transaction');
  });

  it('no profit: no brackets at any step, no buy or sell label, and the result says why', () => {
    for (const prices of [[7, 6, 4, 3, 1], [2, 2, 2, 2], [7]]) {
      for (const s of run(...prices)) {
        const html = decode(render(s));
        expect(html, JSON.stringify(prices)).not.toContain('data-testid="stock3-brackets"');
        expect(html).not.toMatch(/data-tag="(buy|sell)\d"/);
      }
    }
    expect(text(run(7, 6, 4, 3, 1).at(-1)!)).toContain('No profit possible: the price never rises after a lower day');
  });

  it('the transactions are labelled display only, apart from the four variables; sell2 so far is shown', () => {
    const html = decode(render(STEPS.at(-1)!));
    const box = html.slice(html.indexOf('data-testid="stock3-display-only"'), html.indexOf('data-testid="stock3-legend"'));
    expect(box).toContain('Display only — the code does not store these transactions; it keeps only buy1, sell1, buy2 and sell2');
    expect(box).not.toContain('data-state=');
    expect(html.indexOf('data-testid="stock3-states"')).toBeLessThan(html.indexOf('data-testid="stock3-display-only"'));
    expect(html).toMatch(/data-testid="stock3-running" data-value="10"/);
  });

  it('a made-up step with overlapping or backwards transactions draws none of them, rather than a wrong history', () => {
    const base = STEPS.at(-1)!.stockIII!;
    for (const sell2 of [
      [{ buyDay: 0, sellDay: 2, profit: 1 }, { buyDay: 2, sellDay: 3, profit: 6 }],
      [{ buyDay: 3, sellDay: 1, profit: 3 }],
      [{ buyDay: 0, sellDay: 9, profit: 3 }],
    ]) {
      const fake: ExecutionStep = { id: 0, state: [1, 5, 2, 8], type: 'complete', message: 'made up', stockIII: { ...base, result: undefined, witnesses: { ...base.witnesses, sell2 } } };
      const html = decode(render(fake));
      expect(html, JSON.stringify(sell2)).not.toContain('data-testid="stock3-brackets"');
      expect(html).not.toContain('data-trade=');
      expect(text(fake)).toContain('transactions behind sell2: none yet');
    }
  });

  describe('a made-up history that could not have earned its value is never shown, in the cards, the chart or the list', () => {
    /** the history line under a card, or null when the card shows none */
    const caption = (html: string, state: string) => html.match(new RegExp(`data-caption="${state}"[^>]*>([^<]*)<`))?.[1] ?? null;
    const captions = (html: string) => Object.fromEntries((['buy1', 'sell1', 'buy2', 'sell2'] as const).map(s => [s, caption(html, s)]));
    /** the last step of a real run, with some of its display-only history replaced */
    const fake = (end: ExecutionStep, witnesses: Partial<NonNullable<ExecutionStep['stockIII']>['witnesses']>): ExecutionStep => {
      const v = end.stockIII!;
      return { id: 0, state: [...v.prices], type: 'complete', message: 'made up', stockIII: { ...v, result: undefined, witnesses: { ...v.witnesses, ...witnesses } } };
    };
    const END = STEPS.at(-1)!;
    // the real history at the end of [1, 5, 2, 8]: every card shows it
    const REAL = { buy1: 'holding since day 0 at 1', sell1: 'day 0 → 3 (+7)', buy2: 'day 0 → 1 (+4), then holding since day 2 at 2', sell2: 'day 0 → 1 (+4), day 2 → 3 (+6)' };

    it('a real history is still shown in full: every card, the brackets and the list', () => {
      const html = decode(render(END));
      expect(captions(html)).toEqual(REAL);
      expect(html).toMatch(/data-testid="stock3-brackets" data-trades="0-1,2-3"/);
      expect(html.match(/data-trade="\d"/g)).toHaveLength(2);
      // the first step that sets them: no sale yet, and both buys holding day 0
      expect(captions(decode(render(at('init-sell2'))))).toEqual({ buy1: 'holding since day 0 at 1', sell1: 'no sale yet', buy2: 'holding since day 0 at 1', sell2: 'no sale yet' });
    });

    const CASES: [string, Parameters<typeof fake>[1], ('buy1' | 'sell1' | 'buy2' | 'sell2')[]][] = [
      ['sell2: two trades sharing day 2', { sell2: [{ buyDay: 0, sellDay: 2, profit: 1 }, { buyDay: 2, sellDay: 3, profit: 6 }] }, ['sell2']],
      ['sell2: overlapping trades', { sell2: [{ buyDay: 0, sellDay: 3, profit: 7 }, { buyDay: 1, sellDay: 2, profit: -3 }] }, ['sell2']],
      ['sell2: profits that do not match the prices, though they add up to 10', { sell2: [{ buyDay: 0, sellDay: 1, profit: 5 }, { buyDay: 2, sellDay: 3, profit: 5 }] }, ['sell2']],
      ['sell2: one real trade that does not add up to 10', { sell2: [{ buyDay: 2, sellDay: 3, profit: 6 }] }, ['sell2']],
      ['sell1: a sale before its buy', { sell1: [{ buyDay: 3, sellDay: 0, profit: 7 }] }, ['sell1']],
      ['sell1: two trades, more than one sale can stand on', { sell1: [{ buyDay: 0, sellDay: 1, profit: 4 }, { buyDay: 2, sellDay: 3, profit: 6 }] }, ['sell1']],
      ['buy2: still holding a share bought on the day of the sale', { buy2: { done: [{ buyDay: 0, sellDay: 1, profit: 4 }], open: 1 } }, ['buy2']],
      ['buy2: a history that does not add up to 2', { buy2: { done: [{ buyDay: 0, sellDay: 1, profit: 4 }], open: 3 } }, ['buy2']],
      ['buy1: a day that does not exist', { buy1: { done: [], open: 9 } }, ['buy1']],
      [
        'buy2, sell1 and sell2 all made up at once',
        {
          sell1: [{ buyDay: 1, sellDay: 1, profit: 7 }],
          buy2: { done: [{ buyDay: 0, sellDay: 2, profit: 4 }], open: 2 },
          sell2: [{ buyDay: 0, sellDay: 1, profit: 4 }, { buyDay: 1, sellDay: 3, profit: 6 }],
        },
        ['sell1', 'buy2', 'sell2'],
      ],
    ];
    it.each(CASES)('%s: that card shows no history, the others keep theirs, and every value is still shown', (_, witnesses, broken) => {
      const html = decode(render(fake(END, witnesses)));
      expect(captions(html)).toEqual({ ...REAL, ...Object.fromEntries(broken.map(s => [s, null])) });
      // the four values come from the step, not from its history
      expect(cards(html)).toEqual(['buy1=-1', 'sell1=7', 'buy2=2', 'sell2=10']);
      expect(html).toMatch(/data-testid="stock3-running" data-value="10"/);
      if (broken.includes('sell2')) {
        expect(html).not.toContain('data-testid="stock3-brackets"');
        expect(html).not.toContain('data-trade=');
        expect(html).not.toMatch(/data-tag="(buy|sell)\d"/);
        expect(text(fake(END, witnesses))).toContain('transactions behind sell2: none yet');
        expect(text(fake(END, witnesses))).toContain('no transaction behind sell2 yet');
      } else {
        expect(html).toMatch(/data-testid="stock3-brackets" data-trades="0-1,2-3"/);
      }
    });

    it('a trade that earns 0 is never shown, even when the rest of the history adds up', () => {
      const end = run(3, 3, 1, 7).at(-1)!;
      expect(caption(decode(render(end)), 'sell2')).toBe('day 2 → 3 (+6)');
      const html = decode(render(fake(end, { sell2: [{ buyDay: 0, sellDay: 1, profit: 0 }, { buyDay: 2, sellDay: 3, profit: 6 }] })));
      expect(caption(html, 'sell2')).toBeNull();
      expect(html).toMatch(/data-state="sell2" data-value="6"/);
      expect(html).not.toContain('data-testid="stock3-brackets"');
      expect(html).not.toContain('data-trade=');
    });
  });

  it('screen readers get the prices, the four values, the update and the transactions in words; the chart is hidden', () => {
    const s = at('update-sell2', 1);
    const html = decode(render(s));
    expect(html).toMatch(/data-testid="stock3-chart" aria-hidden="true"/);
    expect(text(s)).toContain('buy1 = -1, sell1 = 4, buy2 = 2, sell2 = 4');
    expect(text(s)).toContain('sell2 = max(4, 4) = 4, kept.');
  });

  it('responsive: cards two to a row on a phone, four on wider screens; labels split word and number; bars share the width', () => {
    const html = decode(render(run(400, 120, 399, 7, 250, 999, 31, 400, 268, 105).at(-1)!));
    expect(html).toMatch(/<ol class="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">/);
    expect(html).toMatch(/data-tag="buy1" class="flex flex-col sm:flex-row[^"]*"><span>buy<\/span><span>1<\/span>/);
    expect(bars(html)).toHaveLength(10);
    expect(html).not.toContain('overflow-x-auto');
  });

  it('a step of another algorithm draws nothing, and Stock I and II ignore a Stock III step', () => {
    expect(renderToStaticMarkup(<StockIIIVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
    expect(renderToStaticMarkup(<StockIIIVisualizer currentStep={getAlgorithmDefinition('array-buy-sell-stock-ii')!.generateSteps([1, 2])[0]} />)).toBe('');
    expect(renderToStaticMarkup(<StockVisualizer currentStep={STEPS[0]} />)).toBe('');
    expect(renderToStaticMarkup(<StockIIVisualizer currentStep={STEPS[0]} />)).toBe('');
  });
});
