import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { validateAlgorithmInput, validateDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { MAX_DAYS } from '../algorithms/buySellStock';
import { LANGUAGES, makeRng } from './testUtils';
import type { ExecutionStep, StockView } from '../../types/algorithm';

const ID = 'array-buy-sell-stock' as const;
const def = getAlgorithmDefinition(ID)!;
const run = (prices: readonly number[]) => def.generateSteps([...prices]);
const view = (s: ExecutionStep) => s.stock!;
const last = (steps: ExecutionStep[]) => view(steps.at(-1)!);
const refs = (steps: ExecutionStep[]) => steps.map(s => s.codeRef);

/** an independent reference: every buy day before every sell day, and the best difference (0 if none is positive) */
function bruteForce(prices: readonly number[]): number {
  let best = 0;
  for (let b = 0; b < prices.length; b++) for (let s = b + 1; s < prices.length; s++) best = Math.max(best, prices[s] - prices[b]);
  return best;
}

/** seeded random price lists within the limits: 1 to 10 days; a third of them from a small range, so ties are common */
function randomPrices(count: number, seed: number): number[][] {
  const rng = makeRng(seed);
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  return Array.from({ length: count }, (_, c) => {
    const [low, high] = c % 3 === 0 ? [0, 3] : c % 3 === 1 ? [0, 999] : [1, 20];
    return Array.from({ length: int(1, MAX_DAYS) }, () => int(low, high));
  });
}
const RANDOM = randomPrices(300, 121);
const FIXED: number[][] = [
  [7, 1, 5, 3, 6, 4],
  [7, 6, 4, 3, 1],
  [5],
  [0],
  [1, 2],
  [2, 1],
  [3, 3, 3, 3],
  [1, 2, 3, 4, 5],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  [3, 8, 1, 2],
  [2, 4, 1, 7],
  [1, 5, 1, 5],
  [4, 1, 6, 1, 6],
  [0, 999],
  [999, 0, 999],
  [5, 0, 0, 3],
];
const ALL_INPUTS = [...FIXED, ...RANDOM];

describe('Best Time to Buy and Sell Stock: where it is listed and how it is drawn', () => {
  it('an ARRAYS algorithm right after Sort Colors, the last of ARRAYS; not Coming Soon', () => {
    const arrays = ALGORITHM_NAV.filter(a => a.category === 'ARRAYS').map(a => a.id);
    expect(arrays.indexOf(ID)).toBe(arrays.indexOf('array-sort-colors') + 1);
    expect(arrays.at(-1)).toBe(ID);
    expect(ALGORITHM_NAV.find(a => a.id === ID)).toMatchObject({ name: 'Best Time to Buy and Sell Stock', category: 'ARRAYS', implemented: true, subtitle: def.subtitle });
    expect(getAllAlgorithms().filter(d => d.id === ID)).toHaveLength(1);
  });

  it('drawn as a price chart, taking 1 to 10 whole prices from 0 to 999 through the array form; O(n) time and O(1) space', () => {
    expect(def).toMatchObject({ id: ID, category: 'ARRAYS', visual: 'stock', defaultInput: [7, 1, 5, 3, 6, 4] });
    expect(visualKindOf(def)).toBe('stock');
    expect(def.inputSpec).toEqual({ minLength: 1, maxLength: 10, minValue: 0, randomValues: [1, 20] });
    expect(MAX_DAYS).toBe(10);
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' });
    expect(getAllAlgorithms().filter(d => visualKindOf(d) === 'stock').map(d => d.id)).toEqual([ID]);
  });

  it('the listings keep two variables and one loop: no second array, no nested loop, no sorting, the same logic in all four', () => {
    for (const lang of LANGUAGES) {
      const code = def.code[lang];
      expect(code.match(/\bfor\b/g), lang).toHaveLength(1);
      expect(code, lang).toMatch(/if \(?prices\[i\] < (minPrice|min_price)\)?/);
      expect(code, lang).toMatch(/profit = prices\[i\] - (minPrice|min_price)/);
      expect(code, lang).toMatch(/if \(?profit > (maxProfit|max_profit)\)?/);
      expect(code, lang).not.toMatch(/sort|malloc|new int|vector<int> \w+[;(]|\[\]\s*=|= \[|min\(|max\(/i);
    }
    // the update of the minimum comes before the profit is computed, in every listing
    for (const lang of LANGUAGES) {
      const code = def.code[lang];
      expect(code.indexOf('prices[i] <'), lang).toBeLessThan(code.indexOf('profit = prices[i]'));
    }
  });
});

describe('Best Time to Buy and Sell Stock: results', () => {
  it('the example: [7, 1, 5, 3, 6, 4] → 5, buying on day 1 at 1 and selling on day 4 at 6', () => {
    const steps = run([7, 1, 5, 3, 6, 4]);
    expect(def.generateSteps([...def.defaultInput])).toEqual(steps);
    expect(last(steps).result).toEqual({ profit: 5, buyDay: 1, sellDay: 4, text: 'Maximum profit 5: buy on day 1 at 1, sell on day 4 at 6' });
    expect(steps.at(-1)!.outcomeText).toBe('Maximum profit 5: buy on day 1 at 1, sell on day 4 at 6');
    expect(steps.at(-1)!.type).toBe('complete');
    // 5 + 5 per day after the first, plus one step per new minimum (day 1) and per better profit (days 2 and 4)
    expect(steps).toHaveLength(5 + 5 * 5 + 1 + 2);
  });

  it('one day, falling, flat, rising, a later minimum after the best sale, ties, zeros and the top price', () => {
    for (const [prices, profit, buy, sell] of [
      [[5], 0, null, null],
      [[0], 0, null, null],
      [[1, 2], 1, 0, 1],
      [[2, 1], 0, null, null],
      [[7, 6, 4, 3, 1], 0, null, null],
      [[3, 3, 3, 3], 0, null, null],
      [[1, 2, 3, 4, 5], 4, 0, 4],
      [[9, 8, 7, 6, 5, 4, 3, 2, 1, 0], 0, null, null],
      // the lowest price comes after the best sale: still 5 (3 → 8), not 1 (1 → 2)
      [[3, 8, 1, 2], 5, 0, 1],
      // a later, lower minimum gives the better trade
      [[2, 4, 1, 7], 6, 2, 3],
      // equal best profits: the earliest is kept
      [[1, 5, 1, 5], 4, 0, 1],
      [[4, 1, 6, 1, 6], 5, 1, 2],
      [[0, 999], 999, 0, 1],
      [[999, 0, 999], 999, 1, 2],
      [[5, 0, 0, 3], 3, 1, 3],
    ] as [number[], number, number | null, number | null][]) {
      const r = last(run(prices)).result!;
      expect([r.profit, r.buyDay, r.sellDay], JSON.stringify(prices)).toEqual([profit, buy, sell]);
    }
    expect(last(run([5])).result!.text).toBe('No profit possible: there is only one day');
    expect(last(run([7, 6, 4, 3, 1])).result!.text).toBe('No profit possible: the price never rises after a lower day');
    expect(last(run([3, 3, 3, 3])).result!.text).toBe('No profit possible: the price never rises after a lower day');
  });

  it('300 seeded random price lists (many with ties) and the fixed ones: the profit is the best over every buy-before-sell pair', () => {
    expect(RANDOM.some(p => p.length === 1) && RANDOM.some(p => p.length === MAX_DAYS)).toBe(true);
    for (const prices of ALL_INPUTS) {
      const v = last(run(prices));
      expect(v.result!.profit, JSON.stringify(prices)).toBe(bruteForce(prices));
      expect(v.maxProfit, JSON.stringify(prices)).toBe(v.result!.profit);
    }
  });
});

describe('Best Time to Buy and Sell Stock: the days shown (display only)', () => {
  it('on every step: buy before sell, the pair earns maxProfit, and no days while maxProfit is 0', () => {
    for (const prices of ALL_INPUTS) {
      for (const s of run(prices)) {
        const v = view(s);
        const where = `${JSON.stringify(prices)} step ${s.id} (${s.codeRef})`;
        if (v.maxProfit === null || v.maxProfit === 0) {
          expect([v.buyDay, v.sellDay], where).toEqual([null, null]);
        } else {
          expect(v.buyDay! < v.sellDay!, where).toBe(true);
          expect(prices[v.sellDay!] - prices[v.buyDay!], where).toBe(v.maxProfit);
          expect(v.sellDay! < (v.i ?? prices.length) || v.operation === 'update-profit', where).toBe(true);
        }
      }
    }
  });

  it('the day of the minimum holds minPrice, and is the earliest lowest price among the days checked', () => {
    for (const prices of ALL_INPUTS) {
      for (const s of run(prices)) {
        const v = view(s);
        const where = `${JSON.stringify(prices)} step ${s.id} (${s.codeRef})`;
        if (v.minPrice === null) {
          expect(v.minDay, where).toBeNull();
          continue;
        }
        expect(prices[v.minDay!], where).toBe(v.minPrice);
        // the days the minimum has been taken over: day 0, and day i once its check has decided (from the update or the
        // profit on); on the loop check and the check itself, only the days before i
        const seen = v.operation === 'done' ? prices.length : v.i === null ? 1 : ['loop', 'check-min'].includes(v.operation) ? v.i : v.i + 1;
        const window = prices.slice(0, Math.min(seen, prices.length));
        expect(v.minPrice, where).toBe(Math.min(...window));
        expect(v.minDay, where).toBe(window.indexOf(v.minPrice));
      }
    }
  });

  it('the final days match a brute-force search for the earliest best sale after the earliest lowest earlier price', () => {
    for (const prices of ALL_INPUTS) {
      const best = bruteForce(prices);
      const r = last(run(prices)).result!;
      if (best === 0) {
        expect([r.buyDay, r.sellDay]).toEqual([null, null]);
        continue;
      }
      let sell = -1;
      for (let s = 1; s < prices.length && sell < 0; s++) if (prices[s] - Math.min(...prices.slice(0, s)) === best) sell = s;
      const buy = prices.slice(0, sell).indexOf(Math.min(...prices.slice(0, sell)));
      expect([r.buyDay, r.sellDay], JSON.stringify(prices)).toEqual([buy, sell]);
    }
  });
});

describe('Best Time to Buy and Sell Stock: the steps', () => {
  it('[7, 1, 5] step by step: a new minimum on day 1, then a better profit on day 2', () => {
    const steps = run([7, 1, 5]);
    expect(refs(steps)).toEqual([
      'fn-entry',
      'init-min',
      'init-profit',
      'loop-condition',
      'check-min',
      'update-min',
      'compute-profit',
      'check-profit',
      'loop-condition',
      'loop-condition',
      'check-min',
      'compute-profit',
      'check-profit',
      'update-profit',
      'loop-condition',
      'loop-condition',
      'return-result',
    ]);
    expect(steps.map(s => s.message)).toEqual([
      'maxProfit([7, 1, 5]): buy on one day, sell on a later day',
      'minPrice = prices[0] = 7',
      'maxProfit = 0',
      'i=1 < n=3 → true',
      'prices[1]=1 < minPrice=7 → TRUE',
      'minPrice = prices[1] = 1',
      'profit = prices[1] - minPrice = 1 - 1 = 0',
      'profit=0 > maxProfit=0 → FALSE',
      'i++ → i=2',
      'i=2 < n=3 → true',
      'prices[2]=5 < minPrice=1 → FALSE',
      'profit = prices[2] - minPrice = 5 - 1 = 4',
      'profit=4 > maxProfit=0 → TRUE',
      'maxProfit = profit = 4',
      'i++ → i=3',
      'i=3 < n=3 → false — loop ends',
      'return maxProfit = 4',
    ]);
    expect(steps.map(s => [view(s).minPrice, view(s).profit, view(s).maxProfit])).toEqual([
      [null, null, null],
      [7, null, null],
      [7, null, 0],
      [7, null, 0],
      [7, null, 0],
      [1, null, 0],
      [1, 0, 0],
      [1, 0, 0],
      [1, null, 0],
      [1, null, 0],
      [1, null, 0],
      [1, 4, 0],
      [1, 4, 0],
      [1, 4, 4],
      [1, null, 4],
      [1, null, 4],
      [1, null, 4],
    ]);
    expect(steps.map(s => [view(s).minDay, view(s).buyDay, view(s).sellDay])).toEqual([
      [null, null, null],
      [0, null, null],
      [0, null, null],
      [0, null, null],
      [0, null, null],
      [1, null, null],
      [1, null, null],
      [1, null, null],
      [1, null, null],
      [1, null, null],
      [1, null, null],
      [1, null, null],
      [1, null, null],
      [1, 1, 2],
      [1, 1, 2],
      [1, 1, 2],
      [1, 1, 2],
    ]);
    expect(view(steps[5])).toMatchObject({ operation: 'update-min', newMin: true, moved: 'minPrice' });
    expect(view(steps[6])).toMatchObject({ operation: 'compute-profit', newMin: true, moved: 'profit' });
    expect(view(steps[11]).newMin).toBeUndefined();
    expect(view(steps[13])).toMatchObject({ operation: 'update-profit', improved: true, moved: 'maxProfit' });
  });

  it('one day: the loop does not run and the answer is 0', () => {
    expect(refs(run([5]))).toEqual(['fn-entry', 'init-min', 'init-profit', 'loop-condition', 'return-result']);
    expect(run([5])[3].message).toBe('i=1 < n=1 → false — loop ends');
  });

  it('on every input: the step count, ids, state, and the variables at each loop check', () => {
    for (const prices of ALL_INPUTS) {
      const steps = run(prices);
      const where = JSON.stringify(prices);
      const newMins = steps.filter(s => s.codeRef === 'update-min').length;
      const better = steps.filter(s => s.codeRef === 'update-profit').length;
      expect(steps, where).toHaveLength(5 + 5 * (prices.length - 1) + newMins + better);
      expect(steps.every((s, k) => s.id === k && s.message.length > 0 && (s.explanation ?? '').length > 0), where).toBe(true);
      expect(steps.every(s => JSON.stringify(s.state) === JSON.stringify(prices) && JSON.stringify(view(s).prices) === JSON.stringify(prices)), where).toBe(true);
      for (const s of steps) {
        const v = view(s);
        if (s.codeRef === 'compute-profit') expect(v.profit, where).toBe(prices[v.i!] - v.minPrice!);
        if (s.type !== 'loop-condition') continue;
        const i = v.i!;
        expect(v.minPrice, `${where} i=${i}`).toBe(Math.min(...prices.slice(0, i)));
        expect(v.maxProfit, `${where} i=${i}`).toBe(bruteForce(prices.slice(0, i)));
        expect(v.profit).toBeNull();
      }
      // the minimum never rises; the best profit never falls
      const mins = steps.map(s => view(s).minPrice).filter((x): x is number => x !== null);
      const bests = steps.map(s => view(s).maxProfit).filter((x): x is number => x !== null);
      expect(mins.every((m, k) => k === 0 || m <= mins[k - 1]), where).toBe(true);
      expect(bests.every((b, k) => k === 0 || b >= bests[k - 1]), where).toBe(true);
    }
  });

  it('a new minimum earns 0 on its day; equal prices and equal profits keep the earlier day', () => {
    for (const prices of ALL_INPUTS) {
      for (const s of run(prices)) {
        const v = view(s);
        if (v.operation === 'compute-profit' && v.newMin) expect(v.profit).toBe(0);
        if (v.operation === 'update-min') expect(v.minDay).toBe(v.i);
      }
    }
    const flat = run([3, 3]);
    expect(flat.find(s => s.codeRef === 'check-min')!.explanation).toBe('3 equals the lowest price: the earlier day is kept.');
    expect(last(flat).minDay).toBe(0);
    const equal = run([1, 5, 1, 5]).filter(s => s.codeRef === 'check-profit')[2];
    expect(equal.message).toBe('profit=4 > maxProfit=4 → FALSE');
    expect(equal.explanation).toBe('4 only equals the best profit: the earlier sale is kept.');
  });

  it('a zero profit that ties a zero best says no profitable trade has been found yet, never that an earlier sale is kept', () => {
    const checks = (prices: number[]) => run(prices).filter(s => s.codeRef === 'check-profit');
    // the example: day 1 is a new minimum, so its profit (0) only ties the best (0)
    const example = checks([7, 1, 5, 3, 6, 4]);
    expect(example[0].message).toBe('profit=0 > maxProfit=0 → FALSE');
    expect(example[0].explanation).toBe('Selling today earns 0. No profitable trade has been found yet.');
    // equal prices: no day is lower, and no day earns anything
    for (const prices of [[3, 3], [2, 2, 2, 2]]) {
      const all = checks(prices);
      expect(all).toHaveLength(prices.length - 1);
      for (const s of all) {
        expect(s.message, JSON.stringify(prices)).toBe('profit=0 > maxProfit=0 → FALSE');
        expect(s.explanation, JSON.stringify(prices)).toBe('Selling today earns 0. No profitable trade has been found yet.');
      }
      expect(last(run(prices)).result).toEqual({ profit: 0, buyDay: null, sellDay: null, text: 'No profit possible: the price never rises after a lower day' });
    }
    // with a positive best, a tie keeps the earlier trade, in words and in the days
    const positive = run([1, 5, 1, 5]);
    expect(positive.filter(s => s.codeRef === 'check-profit')[2].explanation).toBe('4 only equals the best profit: the earlier sale is kept.');
    expect([last(positive).buyDay, last(positive).sellDay]).toEqual([0, 1]);
    // nowhere in any trace is an earlier sale mentioned while the best is still 0
    for (const prices of ALL_INPUTS) {
      for (const s of run(prices)) {
        if (s.codeRef === 'check-profit' && view(s).maxProfit === 0) expect(s.explanation ?? '', JSON.stringify(prices)).not.toMatch(/earlier sale|earlier trade/);
      }
    }
  });
});

describe('Best Time to Buy and Sell Stock: snapshots are immutable', () => {
  const frozenDeep = (value: unknown): boolean =>
    value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value as object).every(frozenDeep));

  it('every view is frozen all the way down', () => {
    for (const prices of ALL_INPUTS.slice(0, 80)) {
      for (const s of run(prices)) {
        expect(frozenDeep(view(s)), `${JSON.stringify(prices)} step ${s.id}`).toBe(true);
        expect(Object.isFrozen(view(s).prices)).toBe(true);
      }
    }
  });

  it('a snapshot cannot be changed, later steps never change an earlier one, and the input array is not touched', () => {
    const input = [7, 1, 5, 3, 6, 4];
    const steps = def.generateSteps(input);
    expect(input).toEqual([7, 1, 5, 3, 6, 4]);
    const v: StockView = view(steps[12]);
    expect(() => (v.prices as number[]).push(9)).toThrow(TypeError);
    expect(() => ((v as { minPrice: number | null }).minPrice = 99)).toThrow(TypeError);
    expect(() => ((last(steps).result as { profit: number }).profit = 99)).toThrow(TypeError);
    expect(view(steps[2]).maxProfit).toBe(0);
    expect(view(steps[2]).buyDay).toBeNull();
    expect(last(steps).buyDay).toBe(1);
    const again = def.generateSteps([7, 1, 5, 3, 6, 4]);
    expect(again).toEqual(steps);
    expect(view(again[12])).not.toBe(v);
    steps[0].state.push(1);
    expect(view(steps[0]).prices).toEqual([7, 1, 5, 3, 6, 4]);
    expect(steps[1].state).toEqual([7, 1, 5, 3, 6, 4]);
  });
});

describe('Best Time to Buy and Sell Stock: code references', () => {
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
      'init-min': { c: 'int minPrice = prices[0];', cpp: 'int minPrice = prices[0];', java: 'int minPrice = prices[0];', python: 'min_price = prices[0]' },
      'init-profit': { c: 'int maxProfit = 0;', cpp: 'int maxProfit = 0;', java: 'int maxProfit = 0;', python: 'max_profit = 0' },
      'check-min': { c: 'if (prices[i] < minPrice) {', cpp: 'if (prices[i] < minPrice) {', java: 'if (prices[i] < minPrice) {', python: 'if prices[i] < min_price:' },
      'update-min': { c: 'minPrice = prices[i];', cpp: 'minPrice = prices[i];', java: 'minPrice = prices[i];', python: 'min_price = prices[i]' },
      'compute-profit': { c: 'int profit = prices[i] - minPrice;', cpp: 'int profit = prices[i] - minPrice;', java: 'int profit = prices[i] - minPrice;', python: 'profit = prices[i] - min_price' },
      'check-profit': { c: 'if (profit > maxProfit) {', cpp: 'if (profit > maxProfit) {', java: 'if (profit > maxProfit) {', python: 'if profit > max_profit:' },
      'update-profit': { c: 'maxProfit = profit;', cpp: 'maxProfit = profit;', java: 'maxProfit = profit;', python: 'max_profit = profit' },
      'return-result': { c: 'return maxProfit;', cpp: 'return maxProfit;', java: 'return maxProfit;', python: 'return max_profit' },
    };
    for (const lang of LANGUAGES) {
      for (const [ref, text] of Object.entries(want)) expect(line(lang, ref), `${lang} ${ref}`).toBe(text[lang]);
      expect(line(lang, 'loop-condition'), lang).toMatch(/^for /);
      expect(line(lang, 'fn-entry'), lang).toMatch(/max_?[Pp]rofit\(/);
    }
    expect(def.lineSpans).toBeUndefined();
    expect(def.lineLeads).toBeUndefined();
  });
});

describe('Best Time to Buy and Sell Stock: input', () => {
  it('1 to 10 whole prices from 0 to 999 are accepted; anything else is refused in words, and nothing is changed', () => {
    expect(validateAlgorithmInput(def, [7, 1, 5, 3, 6, 4], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, [0], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, Array(10).fill(999), null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, [], null)).toMatchObject({ ok: false, field: 'array', message: 'Best Time to Buy and Sell Stock needs at least 1 values; the array is empty.' });
    expect(validateAlgorithmInput(def, Array(11).fill(1), null)).toMatchObject({ ok: false, message: 'Too many values (11). The visualizer supports at most 10.' });
    expect(validateAlgorithmInput(def, [3, -1], null)).toMatchObject({ ok: false, field: 'array', message: 'Value 2 (-1) is below 0: Best Time to Buy and Sell Stock takes values from 0 to 999.' });
    expect(validateDraft(def, '7, 1, 5, 3, 6, 4', '')).toMatchObject({ ok: true, array: [7, 1, 5, 3, 6, 4] });
    expect(validateDraft(def, '[7,1,5,3,6,4]', '')).toMatchObject({ ok: true, array: [7, 1, 5, 3, 6, 4] });
    expect(validateDraft(def, '1000', '')).toMatchObject({ ok: false, field: 'array', message: expect.stringContaining('out of range') });
    expect(validateDraft(def, '2, 7.5', '')).toMatchObject({ ok: false, field: 'array', message: expect.stringContaining('is a decimal') });
    expect(validateDraft(def, '2, x', '')).toMatchObject({ ok: false, field: 'array', message: expect.stringContaining('is not a whole number') });
    expect(validateDraft(def, '', '')).toMatchObject({ ok: false, message: expect.stringContaining('needs at least 1') });
  });

  it('the generator refuses input the app would refuse', () => {
    for (const bad of [[], [-1], Array(11).fill(1)]) expect(() => run(bad), JSON.stringify(bad)).toThrow(RangeError);
    expect(buildExecution(ID, [-1], getAlgorithmDefinition).status).toBe('generator-error');
    expect(buildExecution(ID, [7, 1, 5, 3, 6, 4], getAlgorithmDefinition).status).toBe('ok');
  });

  it('it declares no maxValue, so the global maximum applies; other array algorithms keep their own limits', () => {
    expect(def.inputSpec!.maxValue).toBeUndefined();
    expect(validateAlgorithmInput(getAlgorithmDefinition('array-move-zeroes')!, [-999, 0, 999], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(getAlgorithmDefinition('array-sort-colors')!, [3], null).ok).toBe(false);
    expect(validateAlgorithmInput(getAlgorithmDefinition('maximum-subarray')!, [-5, 3], null)).toEqual({ ok: true });
  });
});
