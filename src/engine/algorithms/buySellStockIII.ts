import type { AlgorithmDefinition, ExecutionStep, StockIIIOperation, StockIIIState, StockIIITrade, StockIIIView, StockIIIWitness } from '../../types/algorithm';
import { validateAlgorithmInput } from '../inputParsing';

/**
 * Best Time to Buy and Sell Stock III (LeetCode 123): at most two trades, holding at most one share, selling before
 * buying again. Four running values, updated in order for each day:
 *
 *   buy1 = -prices[0]; sell1 = 0; buy2 = -prices[0]; sell2 = 0
 *   for i = 1 .. n - 1:
 *     buy1  = max(buy1,  -prices[i])          the most cash after the first buy (negative: the price paid)
 *     sell1 = max(sell1, buy1 + prices[i])    the most profit after the first sale
 *     buy2  = max(buy2,  sell1 - prices[i])   the most cash after the second buy: the first profit, less the price
 *     sell2 = max(sell2, buy2 + prices[i])    the most profit after the second sale: the answer
 *   return sell2
 *
 * Each line reads the value the line before it has just written for the same day. That also allows a buy and a sale on
 * the same day, which earns 0, so the answer is unchanged. Starting both buys at -prices[0] (bought on day 0) needs no
 * "minus infinity", so no sum can overflow. sell2 is never below sell1 or 0: one trade, or none, is covered.
 *
 * DISPLAY ONLY (built by the trace, never by the listings, and never read back into the four values): the trades behind
 * each value. A value's trades change only when the value strictly increases, and they always earn exactly that value:
 * buy1 holds the day it bought on; sell1 the trade it sold; buy2 the trades of sell1 it builds on and the day of its own
 * buy; sell2 its trades. Two cases keep every trade a real buy before a sale, with no two trades sharing a day:
 * - when buy2 buys on the same day sell1 sold, selling and buying again is the same as holding: the first trade's buy
 *   becomes buy2's buy, with no completed trade before it (its value is the same: -prices[that buy]);
 * - when sell2 sells on the same day buy2 bought, that last trade earns 0: it is left out (sell2 then earns exactly the
 *   trades it builds on).
 *
 * Each pass of the loop is O(1) work, with O(1) space for the four values: O(n) time in total.
 */

export const MAX_DAYS = 10;
export const STATES: readonly StockIIIState[] = ['buy1', 'sell1', 'buy2', 'sell2'];

/** freezes a value and everything inside it */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value as object)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;
/** -price without a negative zero */
const neg = (price: number) => (price === 0 ? 0 : -price);
const word = (k: number) => `${k} transaction${k === 1 ? '' : 's'}`;

/** the expression of each update, and what its candidate reads */
const EXPRESSION: Record<StockIIIState, string> = {
  buy1: '-prices[i]',
  sell1: 'buy1 + prices[i]',
  buy2: 'sell1 - prices[i]',
  sell2: 'buy2 + prices[i]',
};
const MEANING: Record<StockIIIState, string> = {
  buy1: 'the most cash after the first buy (negative: the price paid)',
  sell1: 'the most profit after the first sale',
  buy2: 'the most cash after the second buy (the first profit, less the price paid)',
  sell2: 'the most profit after the second sale: the answer',
};

function generateBuySellStockIIISteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(buySellStockIIIDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const prices = deepFreeze([...input]);
  const n = prices.length;
  const steps: ExecutionStep[] = [];
  let i: number | null = null;
  const value: Record<StockIIIState, number | null> = { buy1: null, sell1: null, buy2: null, sell2: null };
  // DISPLAY ONLY: the trades behind each value; set with the value, changed only when it strictly increases
  const witness: { buy1: number | null; sell1: StockIIITrade[]; buy2: { done: StockIIITrade[]; open: number } | null; sell2: StockIIITrade[] } = {
    buy1: null,
    sell1: [],
    buy2: null,
    sell2: [],
  };

  type Extra = Partial<Pick<StockIIIView, 'update' | 'result'>>;
  const push = (operation: StockIIIOperation, s: Omit<ExecutionStep, 'id' | 'state' | 'stockIII'>, extra: Extra = {}) => {
    const witnesses: StockIIIWitness = {
      buy1: witness.buy1 === null ? null : { done: [], open: witness.buy1 },
      sell1: witness.sell1.map(t => ({ ...t })),
      buy2: witness.buy2 ? { done: witness.buy2.done.map(t => ({ ...t })), open: witness.buy2.open } : null,
      sell2: witness.sell2.map(t => ({ ...t })),
    };
    const view: StockIIIView = { prices, i, ...value, operation, witnesses, ...extra };
    steps.push({ id: steps.length, state: [...prices], ...s, stockIII: deepFreeze(view) });
  };

  push('start', {
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, prices: list(prices) },
    message: `maxProfit(${list(prices)}): at most two trades, one share at a time`,
    explanation:
      n === 1
        ? 'There is only one day: nothing can be sold after buying, so the profit is 0.'
        : 'Four running values track the best position after each action: first buy, first sale, second buy, second sale. Each day updates them in that order.',
    actionLabel: 'maxProfit(prices)',
  });

  const p0 = prices[0];
  for (const state of STATES) {
    const start = state === 'buy1' || state === 'buy2' ? neg(p0) : 0;
    value[state] = start;
    if (state === 'buy1') witness.buy1 = 0;
    if (state === 'buy2') witness.buy2 = { done: [], open: 0 };
    push(
      'init',
      {
        type: 'assign',
        codeRef: `init-${state}`,
        variables: { [state]: start },
        message: state === 'buy1' || state === 'buy2' ? `${state} = -prices[0] = ${start}` : `${state} = 0`,
        explanation:
          state === 'buy1'
            ? `Buying on day 0 at ${p0} leaves ${start}: ${MEANING.buy1}.`
            : state === 'buy2'
              ? `Also ${start}: with no profit yet, the second buy starts as buying on day 0 too.`
              : `${state} is ${MEANING[state]}. Nothing has been sold yet: 0.`,
        actionLabel: `${state} = ${start}`,
      },
      { update: { state, old: null, candidate: start, value: start, changed: true } }
    );
  }

  for (let k = 1; ; k++) {
    i = k;
    const go = k < n;
    push('loop', {
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { i: k, n },
      result: go ? 'true' : 'false',
      message: `i=${k} < n=${n} → ${go ? 'true' : 'false'}${go ? '' : ' — loop ends'}`,
      explanation: go ? `Day ${k}: the price is ${prices[k]}. Update the four values in order.` : `Every day has been seen. sell2 holds the answer: ${value.sell2}.`,
      actionLabel: go ? `Day ${k}` : 'Loop done',
    });
    if (!go) break;

    const price = prices[k];
    for (const state of STATES) {
      const old = value[state]!;
      const candidate =
        state === 'buy1' ? neg(price) : state === 'sell1' ? value.buy1! + price : state === 'buy2' ? value.sell1! - price : value.buy2! + price;
      const changed = candidate > old;
      const next = Math.max(old, candidate);
      value[state] = next;
      if (changed) {
        if (state === 'buy1') witness.buy1 = k;
        if (state === 'sell1') witness.sell1 = [{ buyDay: witness.buy1!, sellDay: k, profit: price - prices[witness.buy1!] }];
        if (state === 'buy2') {
          const done = witness.sell1.map(t => ({ ...t }));
          const last = done.at(-1);
          // selling and buying again on the same day is holding: keep the first trade's buy as the open position
          witness.buy2 = last && last.sellDay === k ? { done: done.slice(0, -1), open: last.buyDay } : { done, open: k };
        }
        if (state === 'sell2') {
          const { done, open } = witness.buy2!;
          // a trade bought and sold on the same day earns 0: it is left out
          witness.sell2 = open === k ? done.map(t => ({ ...t })) : [...done.map(t => ({ ...t })), { buyDay: open, sellDay: k, profit: price - prices[open] }];
        }
      }
      const shown = (x: number) => (x < 0 ? `(${x})` : String(x));
      const evaluated =
        state === 'buy1' ? `-${price}` : state === 'sell1' ? `${shown(value.buy1!)} + ${price}` : state === 'buy2' ? `${value.sell1} - ${price}` : `${shown(value.buy2!)} + ${price}`;
      push(
        state,
        {
          type: 'assign',
          codeRef: `update-${state}`,
          variables: { i: k, 'prices[i]': price, [state]: next, candidate },
          message: `${state} = max(${old}, ${EXPRESSION[state]} = ${evaluated} = ${candidate}) = ${next}${changed ? '' : ' — kept'}`,
          explanation: changed
            ? `${candidate} is more than ${old}: ${state}, ${MEANING[state]}, improves on day ${k}.`
            : `${candidate} is not more than ${old}: ${state} stays.`,
          actionLabel: `${state} ${changed ? '↑' : '='} ${next}`,
        },
        { update: { state, old, candidate, value: next, changed } }
      );
    }

    i = k + 1;
    push('loop', {
      type: 'increment',
      codeRef: 'loop-condition',
      variables: { i: k + 1, n },
      message: `i++ → i=${k + 1}`,
      explanation: 'Move to the next day.',
      actionLabel: 'i++',
    });
  }

  i = null;
  const profit = value.sell2!;
  const trades = witness.sell2.map(t => ({ ...t }));
  const text =
    profit === 0
      ? n === 1
        ? 'No profit possible: there is only one day'
        : 'No profit possible: the price never rises after a lower day'
      : `Maximum profit ${profit} from ${word(trades.length)}: ${trades.map(t => `buy day ${t.buyDay} at ${prices[t.buyDay]} → sell day ${t.sellDay} at ${prices[t.sellDay]} (+${t.profit})`).join(', ')}`;
  push(
    'done',
    {
      type: 'complete',
      codeRef: 'return-result',
      variables: { n, result: profit },
      message: `return sell2 = ${profit}`,
      explanation: `${n - 1} pass${n - 1 === 1 ? '' : 'es'} of O(1) work: O(n) time, and O(1) space for the four values.`,
      actionLabel: `Return ${profit}`,
      outcomeText: text,
    },
    { result: { profit, trades, text } }
  );
  return steps;
}

const CODE = {
  c: `int maxOf(int a, int b) {
    return a > b ? a : b;
}

int maxProfit(int* prices, int pricesSize) {
    int buy1 = -prices[0];
    int sell1 = 0;
    int buy2 = -prices[0];
    int sell2 = 0;
    for (int i = 1; i < pricesSize; i++) {
        buy1 = maxOf(buy1, -prices[i]);
        sell1 = maxOf(sell1, buy1 + prices[i]);
        buy2 = maxOf(buy2, sell1 - prices[i]);
        sell2 = maxOf(sell2, buy2 + prices[i]);
    }
    return sell2;
}`,
  cpp: `#include <algorithm>
#include <vector>
using namespace std;

int maxProfit(vector<int>& prices) {
    int buy1 = -prices[0];
    int sell1 = 0;
    int buy2 = -prices[0];
    int sell2 = 0;
    for (int i = 1; i < (int)prices.size(); i++) {
        buy1 = max(buy1, -prices[i]);
        sell1 = max(sell1, buy1 + prices[i]);
        buy2 = max(buy2, sell1 - prices[i]);
        sell2 = max(sell2, buy2 + prices[i]);
    }
    return sell2;
}`,
  java: `public class BestTimeToBuyAndSellStockIII {
    public static int maxProfit(int[] prices) {
        int buy1 = -prices[0];
        int sell1 = 0;
        int buy2 = -prices[0];
        int sell2 = 0;
        for (int i = 1; i < prices.length; i++) {
            buy1 = Math.max(buy1, -prices[i]);
            sell1 = Math.max(sell1, buy1 + prices[i]);
            buy2 = Math.max(buy2, sell1 - prices[i]);
            sell2 = Math.max(sell2, buy2 + prices[i]);
        }
        return sell2;
    }
}`,
  python: `def max_profit(prices):
    buy1 = -prices[0]
    sell1 = 0
    buy2 = -prices[0]
    sell2 = 0
    for i in range(1, len(prices)):
        buy1 = max(buy1, -prices[i])
        sell1 = max(sell1, buy1 + prices[i])
        buy2 = max(buy2, sell1 - prices[i])
        sell2 = max(sell2, buy2 + prices[i])
    return sell2`,
};

/** the 1-based line of a listing whose text is exactly `text`, apart from indentation */
function lineOf(code: string, text: string): number {
  const k = code.split('\n').findIndex(line => line.trim() === text);
  if (k < 0) throw new Error(`Best Time to Buy and Sell Stock III: no line "${text}" in its listing`);
  return k + 1;
}
const MAX_CALL = { c: 'maxOf', cpp: 'max', java: 'Math.max', python: 'max' } as const;
const END = { c: ';', cpp: ';', java: ';', python: '' } as const;
const DECL = { c: 'int ', cpp: 'int ', java: 'int ', python: '' } as const;
const HEADER = {
  c: 'int maxProfit(int* prices, int pricesSize) {',
  cpp: 'int maxProfit(vector<int>& prices) {',
  java: 'public static int maxProfit(int[] prices) {',
  python: 'def max_profit(prices):',
} as const;
const LOOP = {
  c: 'for (int i = 1; i < pricesSize; i++) {',
  cpp: 'for (int i = 1; i < (int)prices.size(); i++) {',
  java: 'for (int i = 1; i < prices.length; i++) {',
  python: 'for i in range(1, len(prices)):',
} as const;
function lines(lang: keyof typeof CODE): Record<string, number> {
  const code = CODE[lang];
  const at = (text: string) => lineOf(code, text);
  const map: Record<string, number> = { 'fn-entry': at(HEADER[lang]), 'loop-condition': at(LOOP[lang]), 'return-result': at(`return sell2${END[lang]}`) };
  for (const state of STATES) {
    map[`init-${state}`] = at(`${DECL[lang]}${state} = ${state.startsWith('buy') ? '-prices[0]' : '0'}${END[lang]}`);
    map[`update-${state}`] = at(`${state} = ${MAX_CALL[lang]}(${state}, ${EXPRESSION[state]})${END[lang]}`);
  }
  return map;
}

export const buySellStockIIIDefinition: AlgorithmDefinition = {
  id: 'array-buy-sell-stock-iii',
  name: 'Best Time to Buy and Sell Stock III',
  category: 'ARRAYS',
  visual: 'stock-iii',
  subtitle: 'At most two trades: four running values for the first buy, first sale, second buy and second sale.',
  description:
    "Given each day's price of a stock, find the most profit from at most two trades, holding at most one share and selling before buying again (LeetCode 123). Four running values are kept: buy1, the most cash after the first buy (negative, as the price is paid); sell1, the most profit after the first sale; buy2, the most cash after the second buy (the first profit less the price paid); and sell2, the most profit after the second sale. For each day they are updated in that order, each from the one before it: buy1 = max(buy1, -price), sell1 = max(sell1, buy1 + price), buy2 = max(buy2, sell1 - price), sell2 = max(sell2, buy2 + price). sell2 is the answer; it is never below sell1, so one trade or none is covered. One pass: O(n) time and O(1) space. The trades the visualizer marks are for display only; the code keeps only the four values.",
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'A fixed number of trades: one running value per action, each built from the one before',
  },
  defaultInput: [3, 3, 5, 0, 0, 3, 1, 4],
  inputSpec: {
    minLength: 1,
    maxLength: MAX_DAYS,
    minValue: 0,
    randomValues: [1, 20],
  },

  code: CODE,

  // looked up from the listing text, so a line moved in a listing cannot leave a step pointing at another line
  lineMap: { c: lines('c'), cpp: lines('cpp'), java: lines('java'), python: lines('python') },

  generateSteps: generateBuySellStockIIISteps,
};
