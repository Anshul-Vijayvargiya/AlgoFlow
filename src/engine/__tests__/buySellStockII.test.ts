import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { validateAlgorithmInput, validateDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { MAX_DAYS } from '../algorithms/buySellStockII';
import { LANGUAGES, makeRng } from './testUtils';
import type { ExecutionStep, StockIITrade, StockIIView } from '../../types/algorithm';

const ID = 'array-buy-sell-stock-ii' as const;
const def = getAlgorithmDefinition(ID)!;
const run = (prices: readonly number[]) => def.generateSteps([...prices]);
const view = (s: ExecutionStep) => s.stockII!;
const last = (steps: ExecutionStep[]) => view(steps.at(-1)!);
const refs = (steps: ExecutionStep[]) => steps.map(s => s.codeRef);
const pairs = (trades: readonly StockIITrade[]) => trades.map(t => `${t.buyDay}-${t.sellDay}:${t.profit}`);

/**
 * An independent reference: every sequence of choices, day by day, holding at most one share: buy (if not holding),
 * sell (if holding) or wait. The best final cash over all of them. Nothing is shared with the greedy loop under test.
 */
function exhaustive(prices: readonly number[]): number {
  const go = (day: number, holding: boolean, cash: number): number => {
    if (day === prices.length) return holding ? -Infinity : cash;
    const wait = go(day + 1, holding, cash);
    const act = holding ? go(day + 1, false, cash + prices[day]) : go(day + 1, true, cash - prices[day]);
    return Math.max(wait, act);
  };
  return go(0, false, 0);
}

/** seeded random price lists within the limits: 1 to 10 days; a third of them from a small range, so flat days are common */
function randomPrices(count: number, seed: number): number[][] {
  const rng = makeRng(seed);
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  return Array.from({ length: count }, (_, c) => {
    const [low, high] = c % 3 === 0 ? [0, 3] : c % 3 === 1 ? [0, 999] : [1, 20];
    return Array.from({ length: int(1, MAX_DAYS) }, () => int(low, high));
  });
}
const RANDOM = randomPrices(300, 122);
const FIXED: number[][] = [
  [7, 1, 5, 3, 6, 4],
  [7],
  [7, 6, 4, 3, 1],
  [1, 2, 3, 4, 5],
  [1, 5, 1, 5],
  [2, 2, 2, 2],
  [1, 2, 2, 3],
  [3, 1, 4, 2, 6],
  [0, 999, 0, 999],
  [1, 2],
  [2, 1],
  [5, 5],
  [1, 3, 5, 4, 6, 8, 8, 9, 2, 3],
  [999, 999, 999, 999, 999, 999, 999, 999, 999, 999],
];
const ALL_INPUTS = [...FIXED, ...RANDOM];

describe('Best Time to Buy and Sell Stock II: where it is listed and how it is drawn', () => {
  it('an ARRAYS algorithm right after Best Time to Buy and Sell Stock, the last of ARRAYS; not Coming Soon', () => {
    const arrays = ALGORITHM_NAV.filter(a => a.category === 'ARRAYS').map(a => a.id);
    expect(arrays.indexOf(ID)).toBe(arrays.indexOf('array-buy-sell-stock') + 1);
    expect(arrays.at(-1)).toBe(ID);
    expect(ALGORITHM_NAV.find(a => a.id === ID)).toMatchObject({ name: 'Best Time to Buy and Sell Stock II', category: 'ARRAYS', implemented: true, subtitle: def.subtitle });
    expect(getAllAlgorithms().filter(d => d.id === ID)).toHaveLength(1);
  });

  it('drawn as its own chart (stock-ii), with the same input rules as Stock I; O(n) time and O(1) space', () => {
    expect(def).toMatchObject({ id: ID, category: 'ARRAYS', visual: 'stock-ii', defaultInput: [7, 1, 5, 3, 6, 4] });
    expect(visualKindOf(def)).toBe('stock-ii');
    expect(def.inputSpec).toEqual({ minLength: 1, maxLength: 10, minValue: 0, randomValues: [1, 20] });
    expect(def.inputSpec).toEqual(getAlgorithmDefinition('array-buy-sell-stock')!.inputSpec);
    expect(MAX_DAYS).toBe(10);
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' });
    expect(getAllAlgorithms().filter(d => visualKindOf(d) === 'stock-ii').map(d => d.id)).toEqual([ID]);
    // Stock I keeps its own kind
    expect(visualKindOf(getAlgorithmDefinition('array-buy-sell-stock'))).toBe('stock');
  });

  it('the listings are one loop with one comparison of neighbouring days: no sorting, recursion, nested loop or extra array', () => {
    for (const lang of LANGUAGES) {
      const code = def.code[lang];
      expect(code.match(/\bfor\b/g), lang).toHaveLength(1);
      expect(code.match(/\bif\b/g), lang).toHaveLength(1);
      expect(code, lang).toMatch(/if \(?prices\[i\] > prices\[i - 1\]\)?/);
      expect(code, lang).toMatch(/(totalProfit|total_profit) \+= prices\[i\] - prices\[i - 1\]/);
      expect(code, lang).not.toMatch(/sort|malloc|new int|vector<int> \w+[;(]|\[\]\s*=|= \[|min\(|max\(|while/i);
      expect(code.match(/max_?[Pp]rofit\(/g), lang).toHaveLength(1);
    }
  });
});

describe('Best Time to Buy and Sell Stock II: results', () => {
  it('the example: [7, 1, 5, 3, 6, 4] → 7, from two trades: day 1 → 2 (+4) and day 3 → 4 (+3)', () => {
    const steps = run([7, 1, 5, 3, 6, 4]);
    expect(def.generateSteps([...def.defaultInput])).toEqual(steps);
    expect(last(steps).result).toEqual({
      profit: 7,
      trades: [
        { buyDay: 1, sellDay: 2, profit: 4 },
        { buyDay: 3, sellDay: 4, profit: 3 },
      ],
      text: 'Maximum profit 7 from 2 trades: buy day 1 at 1 → sell day 2 at 5 (+4), buy day 3 at 3 → sell day 4 at 6 (+3)',
    });
    expect(steps.at(-1)!.outcomeText).toBe(last(steps).result!.text);
    expect(steps.at(-1)!.type).toBe('complete');
    // 4 + 3 per pair of days + 1 per rise
    expect(steps).toHaveLength(4 + 3 * 5 + 2);
  });

  it('the audit cases, with their trades: falling, flat, rising, separate and merged runs', () => {
    for (const [prices, profit, trades] of [
      [[7], 0, []],
      [[7, 6, 4, 3, 1], 0, []],
      [[1, 2, 3, 4, 5], 4, ['0-4:4']],
      [[1, 5, 1, 5], 8, ['0-1:4', '2-3:4']],
      [[2, 2, 2, 2], 0, []],
      // a flat day ends the trade
      [[1, 2, 2, 3], 2, ['0-1:1', '2-3:1']],
      [[3, 1, 4, 2, 6], 7, ['1-2:3', '3-4:4']],
      [[0, 999, 0, 999], 1998, ['0-1:999', '2-3:999']],
      [[1, 2], 1, ['0-1:1']],
      [[2, 1], 0, []],
      [[5, 5], 0, []],
      [[1, 3, 5, 4, 6, 8, 8, 9, 2, 3], 10, ['0-2:4', '3-5:4', '6-7:1', '8-9:1']],
    ] as [number[], number, string[]][]) {
      const r = last(run(prices)).result!;
      expect([r.profit, pairs(r.trades)], JSON.stringify(prices)).toEqual([profit, trades]);
    }
    expect(last(run([7])).result!.text).toBe('No profit possible: there is only one day');
    expect(last(run([7, 6, 4, 3, 1])).result!.text).toBe('No profit possible: the price never rises from one day to the next');
    expect(last(run([2, 2, 2, 2])).result!.text).toBe('No profit possible: the price never rises from one day to the next');
    expect(last(run([1, 2, 3, 4, 5])).result!.text).toBe('Maximum profit 4 from 1 trade: buy day 0 at 1 → sell day 4 at 5 (+4)');
  });

  it('300 seeded random price lists and the fixed ones: the profit is the best over every buy / sell / wait sequence', () => {
    expect(RANDOM.some(p => p.length === 1) && RANDOM.some(p => p.length === MAX_DAYS)).toBe(true);
    for (const prices of ALL_INPUTS) {
      const v = last(run(prices));
      expect(v.result!.profit, JSON.stringify(prices)).toBe(exhaustive(prices));
      expect(v.totalProfit, JSON.stringify(prices)).toBe(v.result!.profit);
    }
  });
});

describe('Best Time to Buy and Sell Stock II: the trades shown (display only)', () => {
  const check = (prices: readonly number[], trades: readonly StockIITrade[], where: string) => {
    for (const [k, t] of trades.entries()) {
      expect(t.buyDay < t.sellDay, where).toBe(true);
      expect(t.profit, where).toBe(prices[t.sellDay] - prices[t.buyDay]);
      // a trade is a run of rises: every day inside it rises from the one before
      for (let d = t.buyDay + 1; d <= t.sellDay; d++) expect(prices[d] > prices[d - 1], `${where} trade ${k} day ${d}`).toBe(true);
      // never overlapping, in order, and not even touching: a sell day is never the next buy day
      if (k > 0) expect(t.buyDay > trades[k - 1].sellDay, where).toBe(true);
    }
  };

  it('on every step: trades in order, never overlapping, each a run of rises, and with the open run they add up to totalProfit', () => {
    for (const prices of ALL_INPUTS) {
      for (const s of run(prices)) {
        const v = view(s);
        const where = `${JSON.stringify(prices)} step ${s.id} (${s.codeRef})`;
        const all = [...v.trades, ...(v.open ? [v.open] : [])];
        check(prices, all, where);
        if (v.totalProfit !== null) expect(all.reduce((sum, t) => sum + t.profit, 0), where).toBe(v.totalProfit);
        // the counted gains are exactly the rises, and add up to totalProfit too; on the check of a rise the gain is shown
        // as counted one step before the addition, so it is ahead of totalProfit by exactly that change
        const ahead = v.operation === 'check-rise' && v.change! > 0 ? v.change! : 0;
        expect(v.gains.filter(g => g.counted).reduce((sum, g) => sum + g.change, 0), where).toBe((v.totalProfit ?? 0) + ahead);
        for (const g of v.gains) expect([g.change, g.counted], where).toEqual([prices[g.day] - prices[g.day - 1], prices[g.day] > prices[g.day - 1]]);
      }
    }
  });

  it('the final trades are the maximal runs of rises: each starts after a day that is not a rise and ends before one', () => {
    for (const prices of ALL_INPUTS) {
      const r = last(run(prices)).result!;
      check(prices, r.trades, JSON.stringify(prices));
      for (const t of r.trades) {
        if (t.buyDay > 0) expect(prices[t.buyDay] > prices[t.buyDay - 1], JSON.stringify(prices)).toBe(false);
        if (t.sellDay < prices.length - 1) expect(prices[t.sellDay + 1] > prices[t.sellDay], JSON.stringify(prices)).toBe(false);
      }
      // every rise is inside exactly one trade
      for (let d = 1; d < prices.length; d++) {
        const inside = r.trades.filter(t => d > t.buyDay && d <= t.sellDay).length;
        expect(inside, `${JSON.stringify(prices)} day ${d}`).toBe(prices[d] > prices[d - 1] ? 1 : 0);
      }
      if (r.profit === 0) expect(r.trades).toEqual([]);
    }
  });

  it('a flat day ends the trade: [1, 2, 2, 3] shows two trades, not one', () => {
    const steps = run([1, 2, 2, 3]);
    const flat = steps.find(s => s.codeRef === 'check-rise' && view(s).change === 0)!;
    expect(flat.message).toBe('prices[2]=2 > prices[1]=2 → FALSE');
    expect(view(flat).closed).toEqual({ buyDay: 0, sellDay: 1, profit: 1 });
    expect(view(flat)).toMatchObject({ trades: [{ buyDay: 0, sellDay: 1, profit: 1 }], open: null });
    expect(flat.explanation).toBe('The price stays the same: there is nothing to earn from day 1 to day 2, so it is skipped. The run of rises ends: buy on day 0 at 1, sell on day 1 at 2.');
    expect(pairs(last(steps).result!.trades)).toEqual(['0-1:1', '2-3:1']);
  });

  it('consecutive rises are one growing trade: [1, 2, 3, 4, 5] is open from day 0 and completed only at the end', () => {
    const steps = run([1, 2, 3, 4, 5]);
    const adds = steps.filter(s => s.codeRef === 'add-gain');
    expect(adds.map(s => view(s).open)).toEqual([
      { buyDay: 0, sellDay: 1, profit: 1 },
      { buyDay: 0, sellDay: 2, profit: 2 },
      { buyDay: 0, sellDay: 3, profit: 3 },
      { buyDay: 0, sellDay: 4, profit: 4 },
    ]);
    expect(adds.every(s => view(s).trades.length === 0)).toBe(true);
    expect(adds[2].explanation).toBe('The rise continues: +1 +1 +1 = 3 = 4 − 1, the same as buying on day 0 at 1 and selling on day 3 at 4.');
    const end = steps.at(-2)!;
    expect(end.message).toBe('i=5 < n=5 → false — loop ends');
    expect(view(end)).toMatchObject({ open: null, closed: { buyDay: 0, sellDay: 4, profit: 4 }, trades: [{ buyDay: 0, sellDay: 4, profit: 4 }] });
  });
});

describe('Best Time to Buy and Sell Stock II: the steps', () => {
  it('[1, 3, 2] step by step: a rise is added, a fall is skipped and ends the trade', () => {
    const steps = run([1, 3, 2]);
    expect(refs(steps)).toEqual(['fn-entry', 'init-total', 'loop-condition', 'check-rise', 'add-gain', 'loop-condition', 'loop-condition', 'check-rise', 'loop-condition', 'loop-condition', 'return-result']);
    expect(steps.map(s => s.message)).toEqual([
      'maxProfit([1, 3, 2]): as many trades as you like, one share at a time',
      'totalProfit = 0',
      'i=1 < n=3 → true',
      'prices[1]=3 > prices[0]=1 → TRUE (+2)',
      'totalProfit += 3 - 1 → 2',
      'i++ → i=2',
      'i=2 < n=3 → true',
      'prices[2]=2 > prices[1]=3 → FALSE',
      'i++ → i=3',
      'i=3 < n=3 → false — loop ends',
      'return totalProfit = 2',
    ]);
    expect(steps.map(s => [view(s).totalProfit, view(s).prev, view(s).cur, view(s).change])).toEqual([
      [null, null, null, null],
      [0, null, null, null],
      [0, null, null, null],
      [0, 1, 3, 2],
      [2, 1, 3, 2],
      [2, null, null, null],
      [2, null, null, null],
      [2, 3, 2, -1],
      [2, null, null, null],
      [2, null, null, null],
      [2, null, null, null],
    ]);
    expect(view(steps[7]).closed).toEqual({ buyDay: 0, sellDay: 1, profit: 2 });
    expect(steps[7].actionLabel).toBe('Fall −1');
    expect(view(steps[9]).closed).toBeUndefined();
  });

  it('one day: the loop does not run and the answer is 0', () => {
    expect(refs(run([7]))).toEqual(['fn-entry', 'init-total', 'loop-condition', 'return-result']);
  });

  it('on every input: the step count, ids, state, and totalProfit at each loop check', () => {
    for (const prices of ALL_INPUTS) {
      const steps = run(prices);
      const where = JSON.stringify(prices);
      const rises = prices.slice(1).filter((p, k) => p > prices[k]).length;
      expect(steps, where).toHaveLength(4 + 3 * (prices.length - 1) + rises);
      expect(steps.every((s, k) => s.id === k && s.message.length > 0 && (s.explanation ?? '').length > 0), where).toBe(true);
      expect(steps.every(s => JSON.stringify(s.state) === JSON.stringify(prices) && JSON.stringify(view(s).prices) === JSON.stringify(prices)), where).toBe(true);
      for (const s of steps) {
        const v = view(s);
        if (s.type !== 'loop-condition') continue;
        const i = v.i!;
        const expected = prices.slice(1, i).reduce((sum, p, k) => sum + Math.max(0, p - prices[k]), 0);
        expect(v.totalProfit, `${where} i=${i}`).toBe(expected);
        expect(v.gains.length, `${where} i=${i}`).toBe(i - 1);
        expect([v.prev, v.cur, v.change]).toEqual([null, null, null]);
      }
      const totals = steps.map(s => view(s).totalProfit).filter((x): x is number => x !== null);
      expect(totals.every((t, k) => k === 0 || t >= totals[k - 1]), where).toBe(true);
    }
  });
});

describe('Best Time to Buy and Sell Stock II: snapshots are immutable', () => {
  const frozenDeep = (value: unknown): boolean =>
    value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value as object).every(frozenDeep));

  it('every view is frozen all the way down', () => {
    for (const prices of ALL_INPUTS.slice(0, 80)) for (const s of run(prices)) expect(frozenDeep(view(s)), `${JSON.stringify(prices)} step ${s.id}`).toBe(true);
  });

  it('a snapshot cannot be changed, later steps never change an earlier one, and the input array is not touched', () => {
    const input = [7, 1, 5, 3, 6, 4];
    const steps = def.generateSteps(input);
    expect(input).toEqual([7, 1, 5, 3, 6, 4]);
    const v: StockIIView = view(steps[12]);
    expect(() => (v.prices as number[]).push(9)).toThrow(TypeError);
    expect(() => (v.gains as unknown[]).pop()).toThrow(TypeError);
    expect(() => ((v as { totalProfit: number | null }).totalProfit = 99)).toThrow(TypeError);
    expect(() => ((last(steps).result!.trades[0] as { profit: number }).profit = 99)).toThrow(TypeError);
    // step 2 is the first loop check, before any change is seen; step 3 is the first comparison
    expect(view(steps[2]).trades).toEqual([]);
    expect(view(steps[2]).gains).toEqual([]);
    expect(view(steps[3]).gains).toEqual([{ day: 1, change: -6, counted: false }]);
    expect(last(steps).trades).toHaveLength(2);
    const again = def.generateSteps([7, 1, 5, 3, 6, 4]);
    expect(again).toEqual(steps);
    expect(view(again[12])).not.toBe(v);
    steps[0].state.push(1);
    expect(view(steps[0]).prices).toEqual([7, 1, 5, 3, 6, 4]);
  });
});

describe('Best Time to Buy and Sell Stock II: code references', () => {
  it('every step names a line in all four listings, and every mapped reference is reached', () => {
    const seen = new Set<string>();
    for (const prices of ALL_INPUTS) for (const s of run(prices)) seen.add(s.codeRef ?? '(none)');
    for (const ref of seen) for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, ref), `${lang} ${ref}`).not.toBeNull();
    expect([...seen].sort()).toEqual(Object.keys(def.lineMap.c).sort());
    for (const lang of LANGUAGES) expect(Object.keys(def.lineMap[lang]).sort(), lang).toEqual(Object.keys(def.lineMap.c).sort());
  });

  it('each reference names the statement it describes', () => {
    const line = (lang: (typeof LANGUAGES)[number], ref: string) => def.code[lang].split('\n')[def.lineMap[lang][ref] - 1].trim();
    const want: Record<string, Record<(typeof LANGUAGES)[number], string>> = {
      'init-total': { c: 'int totalProfit = 0;', cpp: 'int totalProfit = 0;', java: 'int totalProfit = 0;', python: 'total_profit = 0' },
      'check-rise': { c: 'if (prices[i] > prices[i - 1]) {', cpp: 'if (prices[i] > prices[i - 1]) {', java: 'if (prices[i] > prices[i - 1]) {', python: 'if prices[i] > prices[i - 1]:' },
      'add-gain': {
        c: 'totalProfit += prices[i] - prices[i - 1];',
        cpp: 'totalProfit += prices[i] - prices[i - 1];',
        java: 'totalProfit += prices[i] - prices[i - 1];',
        python: 'total_profit += prices[i] - prices[i - 1]',
      },
      'return-result': { c: 'return totalProfit;', cpp: 'return totalProfit;', java: 'return totalProfit;', python: 'return total_profit' },
    };
    for (const lang of LANGUAGES) {
      for (const [ref, text] of Object.entries(want)) expect(line(lang, ref), `${lang} ${ref}`).toBe(text[lang]);
      expect(line(lang, 'loop-condition'), lang).toMatch(/^for /);
      expect(line(lang, 'fn-entry'), lang).toMatch(/max_?[Pp]rofit\(/);
    }
    expect(def.code.java).toContain('public class BestTimeToBuyAndSellStockII {');
    expect(def.lineSpans).toBeUndefined();
    expect(def.lineLeads).toBeUndefined();
  });
});

describe('Best Time to Buy and Sell Stock II: input', () => {
  it('1 to 10 whole prices from 0 to 999 are accepted; anything else is refused in words', () => {
    expect(validateAlgorithmInput(def, [7, 1, 5, 3, 6, 4], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, [0], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, Array(10).fill(999), null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, [], null)).toMatchObject({ ok: false, field: 'array', message: 'Best Time to Buy and Sell Stock II needs at least 1 values; the array is empty.' });
    expect(validateAlgorithmInput(def, Array(11).fill(1), null)).toMatchObject({ ok: false, message: 'Too many values (11). The visualizer supports at most 10.' });
    expect(validateAlgorithmInput(def, [3, -1], null)).toMatchObject({ ok: false, field: 'array', message: 'Value 2 (-1) is below 0: Best Time to Buy and Sell Stock II takes values from 0 to 999.' });
    expect(validateDraft(def, '1000', '')).toMatchObject({ ok: false, message: expect.stringContaining('out of range') });
    expect(validateDraft(def, '2, 7.5', '')).toMatchObject({ ok: false, message: expect.stringContaining('is a decimal') });
    expect(validateDraft(def, '2, x', '')).toMatchObject({ ok: false, message: expect.stringContaining('is not a whole number') });
  });

  it('the generator refuses input the app would refuse', () => {
    for (const bad of [[], [-1], Array(11).fill(1)]) expect(() => run(bad), JSON.stringify(bad)).toThrow(RangeError);
    expect(buildExecution(ID, [-1], getAlgorithmDefinition).status).toBe('generator-error');
    expect(buildExecution(ID, [7, 1, 5, 3, 6, 4], getAlgorithmDefinition).status).toBe('ok');
  });

  it('Stock I is unchanged: same answer for its own example, its own kind and its own last-step text', () => {
    const one = getAlgorithmDefinition('array-buy-sell-stock')!.generateSteps([7, 1, 5, 3, 6, 4]);
    expect(one.at(-1)!.stock!.result).toEqual({ profit: 5, buyDay: 1, sellDay: 4, text: 'Maximum profit 5: buy on day 1 at 1, sell on day 4 at 6' });
    expect(one.every(s => s.stockII === undefined)).toBe(true);
    expect(run([7, 1, 5, 3, 6, 4]).every(s => s.stock === undefined)).toBe(true);
  });
});
