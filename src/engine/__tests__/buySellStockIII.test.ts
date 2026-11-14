import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { validateAlgorithmInput, validateDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { MAX_DAYS, STATES } from '../algorithms/buySellStockIII';
import { LANGUAGES, makeRng } from './testUtils';
import type { ExecutionStep, StockIIITrade, StockIIIView } from '../../types/algorithm';

const ID = 'array-buy-sell-stock-iii' as const;
const def = getAlgorithmDefinition(ID)!;
const run = (prices: readonly number[]) => def.generateSteps([...prices]);
const view = (s: ExecutionStep) => s.stockIII!;
const last = (steps: ExecutionStep[]) => view(steps.at(-1)!);
const refs = (steps: ExecutionStep[]) => steps.map(s => s.codeRef);
const pairs = (trades: readonly StockIIITrade[]) => trades.map(t => `${t.buyDay}-${t.sellDay}:${t.profit}`);
const sum = (trades: readonly StockIIITrade[]) => trades.reduce((total, t) => total + t.profit, 0);

/**
 * An independent reference: every single trade, and every pair of trades b1 < s1 <= b2 < s2 (a sale and the next buy may
 * share a day here: that is never better than one longer trade, so it cannot inflate the answer). The best of them, or 0.
 */
function exhaustive(p: readonly number[]): number {
  let best = 0;
  for (let b1 = 0; b1 < p.length; b1++)
    for (let s1 = b1 + 1; s1 < p.length; s1++) {
      best = Math.max(best, p[s1] - p[b1]);
      for (let b2 = s1; b2 < p.length; b2++) for (let s2 = b2 + 1; s2 < p.length; s2++) best = Math.max(best, p[s1] - p[b1] + p[s2] - p[b2]);
    }
  return best;
}

/** valid display trades: real buys strictly before their sales, profits that match the prices, in order, no shared day */
function validTrades(p: readonly number[], trades: readonly StockIIITrade[], openAfter: number | null = null): boolean {
  let lastDay = -1;
  for (const t of trades) {
    if (!(t.buyDay < t.sellDay) || t.buyDay <= lastDay || t.profit !== p[t.sellDay] - p[t.buyDay] || t.profit <= 0) return false;
    lastDay = t.sellDay;
  }
  return openAfter === null || openAfter > lastDay;
}

function randomPrices(count: number, seed: number): number[][] {
  const rng = makeRng(seed);
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  return Array.from({ length: count }, (_, c) => {
    const [low, high] = c % 3 === 0 ? [0, 3] : c % 3 === 1 ? [0, 999] : [1, 20];
    return Array.from({ length: int(1, MAX_DAYS) }, () => int(low, high));
  });
}
const RANDOM = randomPrices(300, 123);
const FIXED: number[][] = [
  [3, 3, 5, 0, 0, 3, 1, 4],
  [1, 8],
  [1, 5, 2, 8],
  [7, 6, 4, 3, 1],
  [2, 2, 2, 2],
  [1, 2, 3, 4, 5],
  [7],
  [0, 999, 0, 999],
  [0, 0, 0],
  [999, 999],
  [1, 2, 4, 2, 5, 7, 2, 4, 9, 0],
  [3, 2, 6, 5, 0, 3],
  [5, 1, 5, 1, 5],
  [2, 1, 2, 0, 1],
  [1, 3, 1, 3, 1, 3],
];
const ALL_INPUTS = [...FIXED, ...RANDOM];

describe('Best Time to Buy and Sell Stock III: where it is listed and how it is drawn', () => {
  it('an ARRAYS algorithm right after Best Time to Buy and Sell Stock II, the last of ARRAYS; not Coming Soon', () => {
    const arrays = ALGORITHM_NAV.filter(a => a.category === 'ARRAYS').map(a => a.id);
    expect(arrays.indexOf(ID)).toBe(arrays.indexOf('array-buy-sell-stock-ii') + 1);
    expect(arrays.indexOf('array-buy-sell-stock-ii')).toBe(arrays.indexOf('array-buy-sell-stock') + 1);
    expect(arrays.at(-1)).toBe(ID);
    expect(ALGORITHM_NAV.find(a => a.id === ID)).toMatchObject({ name: 'Best Time to Buy and Sell Stock III', category: 'ARRAYS', implemented: true, subtitle: def.subtitle });
    expect(getAllAlgorithms().filter(d => d.id === ID)).toHaveLength(1);
  });

  it('drawn as its own kind (stock-iii), with the same input rules as Stock I and II; O(n) time and O(1) space', () => {
    expect(def).toMatchObject({ id: ID, category: 'ARRAYS', visual: 'stock-iii', defaultInput: [3, 3, 5, 0, 0, 3, 1, 4] });
    expect(visualKindOf(def)).toBe('stock-iii');
    expect(def.inputSpec).toEqual({ minLength: 1, maxLength: 10, minValue: 0, randomValues: [1, 20] });
    expect(def.inputSpec).toEqual(getAlgorithmDefinition('array-buy-sell-stock-ii')!.inputSpec);
    expect(MAX_DAYS).toBe(10);
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' });
    expect(getAllAlgorithms().filter(d => visualKindOf(d) === 'stock-iii').map(d => d.id)).toEqual([ID]);
    expect(visualKindOf(getAlgorithmDefinition('array-buy-sell-stock'))).toBe('stock');
    expect(visualKindOf(getAlgorithmDefinition('array-buy-sell-stock-ii'))).toBe('stock-ii');
  });

  it('the listings: four values started from day 0, one loop, four updates in order; no array, sorting, recursion or sentinel', () => {
    const MAX = { c: 'maxOf', cpp: 'max', java: 'Math.max', python: 'max' } as const;
    for (const lang of LANGUAGES) {
      const code = def.code[lang];
      expect(code.match(/\bfor\b/g), lang).toHaveLength(1);
      expect(code, lang).not.toMatch(/sort|malloc|new int|vector<int> \w+[;(]|\[\]\s*=|= \[|INT_MIN|MIN_VALUE|inf|while|maxProfit\(.*maxProfit\(/is);
      const body = code.slice(code.indexOf('maxProfit') >= 0 ? code.search(/max_?[Pp]rofit\(/) : 0);
      const order = ['buy1 = ', 'sell1 = ', 'buy2 = ', 'sell2 = '].map(s => body.lastIndexOf(s));
      expect(order, lang).toEqual([...order].sort((a, b) => a - b));
      expect(code, lang).toContain(`buy1 = ${MAX[lang]}(buy1, -prices[i])`);
      expect(code, lang).toContain(`sell1 = ${MAX[lang]}(sell1, buy1 + prices[i])`);
      expect(code, lang).toContain(`buy2 = ${MAX[lang]}(buy2, sell1 - prices[i])`);
      expect(code, lang).toContain(`sell2 = ${MAX[lang]}(sell2, buy2 + prices[i])`);
      expect(code.match(/= -prices\[0\]/g), lang).toHaveLength(2);
    }
    expect(def.code.c).toContain('int maxOf(int a, int b) {');
    expect(def.code.java).toContain('public class BestTimeToBuyAndSellStockIII {');
  });
});

describe('Best Time to Buy and Sell Stock III: results', () => {
  it('the cases agreed: [1, 8] → 7, [1, 5, 2, 8] → 10, the default → 6', () => {
    expect(last(run([1, 8])).result).toEqual({ profit: 7, trades: [{ buyDay: 0, sellDay: 1, profit: 7 }], text: 'Maximum profit 7 from 1 transaction: buy day 0 at 1 → sell day 1 at 8 (+7)' });
    expect(last(run([1, 5, 2, 8])).result).toEqual({
      profit: 10,
      trades: [
        { buyDay: 0, sellDay: 1, profit: 4 },
        { buyDay: 2, sellDay: 3, profit: 6 },
      ],
      text: 'Maximum profit 10 from 2 transactions: buy day 0 at 1 → sell day 1 at 5 (+4), buy day 2 at 2 → sell day 3 at 8 (+6)',
    });
    const steps = run([3, 3, 5, 0, 0, 3, 1, 4]);
    expect(def.generateSteps([...def.defaultInput])).toEqual(steps);
    expect(last(steps).result!.profit).toBe(6);
    // one of the optimal pairs: the one the four values record
    expect(pairs(last(steps).result!.trades)).toEqual(['0-2:2', '3-7:4']);
    expect(steps.at(-1)!.outcomeText).toBe(last(steps).result!.text);
    // 1 + 4 initialisations + 6 per day after the first + the last loop check + the return
    expect(steps).toHaveLength(7 + 6 * 7);
  });

  it('falling, flat, rising, one day, zeros, the top price, and one trade being best although two are allowed', () => {
    for (const [prices, profit, trades] of [
      [[7, 6, 4, 3, 1], 0, []],
      [[2, 2, 2, 2], 0, []],
      [[7], 0, []],
      [[0, 0, 0], 0, []],
      [[999, 999], 0, []],
      [[1, 2, 3, 4, 5], 4, ['0-4:4']],
      [[0, 999, 0, 999], 1998, ['0-1:999', '2-3:999']],
      [[5, 1, 5, 1, 5], 8, ['1-2:4', '3-4:4']],
      // three rises: only the best two are taken
      [[1, 3, 1, 3, 1, 3], 4, ['0-1:2', '2-3:2']],
      [[1, 2, 4, 2, 5, 7, 2, 4, 9, 0], 13, ['0-5:6', '6-8:7']],
    ] as [number[], number, string[]][]) {
      const r = last(run(prices)).result!;
      expect([r.profit, pairs(r.trades)], JSON.stringify(prices)).toEqual([profit, trades]);
    }
    expect(last(run([7])).result!.text).toBe('No profit possible: there is only one day');
    expect(last(run([7, 6, 4, 3, 1])).result!.text).toBe('No profit possible: the price never rises after a lower day');
    expect(last(run([1, 2, 3, 4, 5])).result!.text).toBe('Maximum profit 4 from 1 transaction: buy day 0 at 1 → sell day 4 at 5 (+4)');
  });

  it('300 seeded random price lists and the fixed ones: sell2 is the best over every one or two trades', () => {
    expect(RANDOM.some(p => p.length === 1) && RANDOM.some(p => p.length === MAX_DAYS)).toBe(true);
    for (const prices of ALL_INPUTS) {
      const v = last(run(prices));
      expect(v.result!.profit, JSON.stringify(prices)).toBe(exhaustive(prices));
      expect(v.sell2, JSON.stringify(prices)).toBe(v.result!.profit);
    }
  });
});

describe('Best Time to Buy and Sell Stock III: the four values, step by step', () => {
  it('[2, 4] step by step: four starting values, then one day of four updates in order', () => {
    const steps = run([2, 4]);
    expect(refs(steps)).toEqual([
      'fn-entry',
      'init-buy1',
      'init-sell1',
      'init-buy2',
      'init-sell2',
      'loop-condition',
      'update-buy1',
      'update-sell1',
      'update-buy2',
      'update-sell2',
      'loop-condition',
      'loop-condition',
      'return-result',
    ]);
    expect(steps.slice(1, 5).map(s => s.message)).toEqual(['buy1 = -prices[0] = -2', 'sell1 = 0', 'buy2 = -prices[0] = -2', 'sell2 = 0']);
    expect(steps.slice(6, 10).map(s => s.message)).toEqual([
      'buy1 = max(-2, -prices[i] = -4 = -4) = -2 — kept',
      'sell1 = max(0, buy1 + prices[i] = (-2) + 4 = 2) = 2',
      'buy2 = max(-2, sell1 - prices[i] = 2 - 4 = -2) = -2 — kept',
      'sell2 = max(0, buy2 + prices[i] = (-2) + 4 = 2) = 2',
    ]);
    expect(steps.slice(6, 10).map(s => view(s).update)).toEqual([
      { state: 'buy1', old: -2, candidate: -4, value: -2, changed: false },
      { state: 'sell1', old: 0, candidate: 2, value: 2, changed: true },
      { state: 'buy2', old: -2, candidate: -2, value: -2, changed: false },
      { state: 'sell2', old: 0, candidate: 2, value: 2, changed: true },
    ]);
    expect(last(steps)).toMatchObject({ buy1: -2, sell1: 2, buy2: -2, sell2: 2, operation: 'done' });
  });

  it('every update on every input: the candidate is its formula over the values just before, and the value is the max', () => {
    for (const prices of ALL_INPUTS) {
      const steps = run(prices);
      for (const [k, s] of steps.entries()) {
        const v = view(s);
        if (!v.update || v.update.old === null) continue;
        const before = view(steps[k - 1]);
        const price = prices[v.i!];
        const state = v.update.state;
        // (|| 0: -price is a negative zero when the price is 0; the engine never shows one)
        const candidate = (state === 'buy1' ? -price : state === 'sell1' ? before.buy1! + price : state === 'buy2' ? before.sell1! - price : before.buy2! + price) || 0;
        const where = `${JSON.stringify(prices)} step ${k} (${s.codeRef})`;
        expect(v.update.candidate, where).toBe(candidate);
        expect(v.update.old, where).toBe(before[state]);
        expect(v[state], where).toBe(Math.max(before[state]!, candidate));
        expect(v.update.changed, where).toBe(candidate > before[state]!);
        // the other three values are untouched by this step
        for (const other of STATES) if (other !== state) expect(v[other], where).toBe(before[other]);
      }
      // the ordering facts the answer relies on, at the end of every day
      for (const s of steps.filter(x => x.codeRef === 'update-sell2')) {
        const v = view(s);
        expect(v.sell2! >= v.sell1! && v.sell1! >= 0, JSON.stringify(prices)).toBe(true);
      }
    }
  });

  it('on every input: the step count, ids and state', () => {
    for (const prices of ALL_INPUTS) {
      const steps = run(prices);
      expect(steps, JSON.stringify(prices)).toHaveLength(7 + 6 * (prices.length - 1));
      expect(steps.every((s, k) => s.id === k && s.message.length > 0 && (s.explanation ?? '').length > 0)).toBe(true);
      expect(steps.every(s => JSON.stringify(s.state) === JSON.stringify(prices))).toBe(true);
      // no negative zero anywhere
      for (const s of steps) for (const st of STATES) if (view(s)[st] !== null) expect(Object.is(view(s)[st], -0), JSON.stringify(prices)).toBe(false);
    }
  });
});

describe('Best Time to Buy and Sell Stock III: the transactions shown (display only)', () => {
  it('on every step: each value is earned exactly by its trades, which are real, in order and never share a day', () => {
    for (const prices of ALL_INPUTS) {
      for (const s of run(prices)) {
        const v = view(s);
        const w = v.witnesses;
        const where = `${JSON.stringify(prices)} step ${s.id} (${s.codeRef})`;
        if (w.buy1) expect([w.buy1.done, v.buy1], where).toEqual([[], -prices[w.buy1.open] || 0]);
        if (v.sell1 !== null) {
          expect(sum(w.sell1), where).toBe(v.sell1);
          expect(w.sell1.length <= 1 && validTrades(prices, w.sell1), where).toBe(true);
        }
        if (w.buy2) {
          expect(sum(w.buy2.done) - prices[w.buy2.open] || 0, where).toBe(v.buy2);
          expect(w.buy2.done.length <= 1 && validTrades(prices, w.buy2.done, w.buy2.open), where).toBe(true);
        }
        if (v.sell2 !== null) {
          expect(sum(w.sell2), where).toBe(v.sell2);
          expect(w.sell2.length <= 2 && validTrades(prices, w.sell2), where).toBe(true);
        }
      }
    }
  });

  it('the result: zero, one or two trades that add up to the answer; none when the answer is 0', () => {
    for (const prices of ALL_INPUTS) {
      const r = last(run(prices)).result!;
      expect(sum(r.trades), JSON.stringify(prices)).toBe(r.profit);
      expect(validTrades(prices, r.trades) && r.trades.length <= 2, JSON.stringify(prices)).toBe(true);
      if (r.profit === 0) expect(r.trades).toEqual([]);
      else expect(r.trades.length).toBeGreaterThan(0);
    }
  });

  it('selling and buying again on the same day is shown as holding, not as two trades sharing the day', () => {
    // [1, 3, 5]: on day 1, sell1 sells at 3 and buy2 could buy again at 3: that is holding the first share
    const steps = run([1, 3, 5]);
    const buy2 = steps.filter(s => s.codeRef === 'update-buy2');
    for (const s of buy2) {
      const w = view(s).witnesses.buy2!;
      for (const t of w.done) expect(t.sellDay < w.open).toBe(true);
    }
    expect(pairs(last(steps).result!.trades)).toEqual(['0-2:4']);
    // a sale on the day of the second buy earns 0 and is left out
    for (const prices of ALL_INPUTS) for (const s of run(prices)) for (const t of view(s).witnesses.sell2) expect(t.buyDay < t.sellDay).toBe(true);
  });

  it('the trades never feed the values: the four values match a plain run of the recurrence on every input', () => {
    for (const prices of ALL_INPUTS) {
      let b1 = -prices[0], s1 = 0, b2 = -prices[0], s2 = 0;
      for (let i = 1; i < prices.length; i++) {
        b1 = Math.max(b1, -prices[i]);
        s1 = Math.max(s1, b1 + prices[i]);
        b2 = Math.max(b2, s1 - prices[i]);
        s2 = Math.max(s2, b2 + prices[i]);
      }
      expect([last(run(prices)).buy1, last(run(prices)).sell1, last(run(prices)).buy2, last(run(prices)).sell2], JSON.stringify(prices)).toEqual([b1 || 0, s1, b2 || 0, s2]);
    }
  });
});

describe('Best Time to Buy and Sell Stock III: snapshots are immutable', () => {
  const frozenDeep = (value: unknown): boolean =>
    value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value as object).every(frozenDeep));

  it('every view is frozen all the way down', () => {
    for (const prices of ALL_INPUTS.slice(0, 80)) for (const s of run(prices)) expect(frozenDeep(view(s)), `${JSON.stringify(prices)} step ${s.id}`).toBe(true);
  });

  it('a snapshot cannot be changed, later steps never change an earlier one, and the input array is not touched', () => {
    const input = [3, 3, 5, 0, 0, 3, 1, 4];
    const steps = def.generateSteps(input);
    expect(input).toEqual([3, 3, 5, 0, 0, 3, 1, 4]);
    const v: StockIIIView = view(steps[20]);
    expect(() => (v.prices as number[]).push(9)).toThrow(TypeError);
    expect(() => ((v as { sell2: number | null }).sell2 = 99)).toThrow(TypeError);
    expect(() => (v.witnesses.sell2 as StockIIITrade[]).pop()).toThrow(TypeError);
    expect(() => ((last(steps).result!.trades[0] as { profit: number }).profit = 99)).toThrow(TypeError);
    expect(view(steps[4]).witnesses.sell2).toEqual([]);
    expect(last(steps).witnesses.sell2).toHaveLength(2);
    expect(def.generateSteps([3, 3, 5, 0, 0, 3, 1, 4])).toEqual(steps);
  });
});

describe('Best Time to Buy and Sell Stock III: code references', () => {
  it('every step names a line in all four listings, and every mapped reference is reached', () => {
    const seen = new Set<string>();
    for (const prices of ALL_INPUTS) for (const s of run(prices)) seen.add(s.codeRef ?? '(none)');
    for (const ref of seen) for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, ref), `${lang} ${ref}`).not.toBeNull();
    expect([...seen].sort()).toEqual(Object.keys(def.lineMap.c).sort());
    for (const lang of LANGUAGES) expect(Object.keys(def.lineMap[lang]).sort(), lang).toEqual(Object.keys(def.lineMap.c).sort());
  });

  it('each reference names the statement it describes', () => {
    const line = (lang: (typeof LANGUAGES)[number], ref: string) => def.code[lang].split('\n')[def.lineMap[lang][ref] - 1].trim();
    for (const lang of LANGUAGES) {
      const end = lang === 'python' ? '' : ';';
      const decl = lang === 'python' ? '' : 'int ';
      const max = { c: 'maxOf', cpp: 'max', java: 'Math.max', python: 'max' }[lang];
      expect(line(lang, 'init-buy1')).toBe(`${decl}buy1 = -prices[0]${end}`);
      expect(line(lang, 'init-sell1')).toBe(`${decl}sell1 = 0${end}`);
      expect(line(lang, 'init-buy2')).toBe(`${decl}buy2 = -prices[0]${end}`);
      expect(line(lang, 'init-sell2')).toBe(`${decl}sell2 = 0${end}`);
      expect(line(lang, 'update-buy1')).toBe(`buy1 = ${max}(buy1, -prices[i])${end}`);
      expect(line(lang, 'update-sell1')).toBe(`sell1 = ${max}(sell1, buy1 + prices[i])${end}`);
      expect(line(lang, 'update-buy2')).toBe(`buy2 = ${max}(buy2, sell1 - prices[i])${end}`);
      expect(line(lang, 'update-sell2')).toBe(`sell2 = ${max}(sell2, buy2 + prices[i])${end}`);
      expect(line(lang, 'return-result')).toBe(`return sell2${end}`);
      expect(line(lang, 'loop-condition')).toMatch(/^for /);
      expect(line(lang, 'fn-entry')).toMatch(/max_?[Pp]rofit\(/);
    }
  });
});

describe('Best Time to Buy and Sell Stock III: input', () => {
  it('1 to 10 whole prices from 0 to 999; anything else is refused in words', () => {
    expect(validateAlgorithmInput(def, [3, 3, 5, 0, 0, 3, 1, 4], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, [0], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, Array(10).fill(999), null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, [], null)).toMatchObject({ ok: false, field: 'array', message: 'Best Time to Buy and Sell Stock III needs at least 1 values; the array is empty.' });
    expect(validateAlgorithmInput(def, Array(11).fill(1), null)).toMatchObject({ ok: false, message: 'Too many values (11). The visualizer supports at most 10.' });
    expect(validateAlgorithmInput(def, [3, -1], null)).toMatchObject({ ok: false, message: 'Value 2 (-1) is below 0: Best Time to Buy and Sell Stock III takes values from 0 to 999.' });
    expect(validateDraft(def, '1000', '')).toMatchObject({ ok: false, message: expect.stringContaining('out of range') });
    expect(validateDraft(def, '2, 7.5', '')).toMatchObject({ ok: false, message: expect.stringContaining('is a decimal') });
  });

  it('the generator refuses input the app would refuse; Stock I and II are unchanged', () => {
    for (const bad of [[], [-1], Array(11).fill(1)]) expect(() => run(bad), JSON.stringify(bad)).toThrow(RangeError);
    expect(buildExecution(ID, [-1], getAlgorithmDefinition).status).toBe('generator-error');
    expect(getAlgorithmDefinition('array-buy-sell-stock')!.generateSteps([3, 3, 5, 0, 0, 3, 1, 4]).at(-1)!.stock!.result!.profit).toBe(4);
    expect(getAlgorithmDefinition('array-buy-sell-stock-ii')!.generateSteps([3, 3, 5, 0, 0, 3, 1, 4]).at(-1)!.stockII!.result!.profit).toBe(8);
    expect(run([1, 2]).every(s => s.stock === undefined && s.stockII === undefined)).toBe(true);
  });
});
