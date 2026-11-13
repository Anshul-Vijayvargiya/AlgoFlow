import type { AlgorithmDefinition, ExecutionStep, StockOperation, StockView } from '../../types/algorithm';
import { validateAlgorithmInput } from '../inputParsing';

/**
 * Best Time to Buy and Sell Stock (LeetCode 121): one pass, keeping the lowest price so far and the best profit so far.
 *
 *   minPrice = prices[0]; maxProfit = 0
 *   for i = 1 .. n - 1:
 *     if prices[i] < minPrice: minPrice = prices[i]
 *     profit = prices[i] - minPrice
 *     if profit > maxProfit: maxProfit = profit
 *   return maxProfit
 *
 * Selling on day i is best after buying at the lowest price before it, so the best sale on day i earns prices[i] -
 * minPrice. The minimum is updated before the profit is computed, so on a day that sets a new minimum the profit is 0 and
 * cannot improve on anything. Both comparisons are strict: the earliest lowest price is kept, and the earliest day with
 * the best profit. A single day, or prices that never rise, give 0.
 *
 * The code keeps only minPrice and maxProfit (and profit, for the day). The days the visualizer marks are DISPLAY ONLY,
 * built by the trace and never by the listings: minDay, the day of the current minPrice; and buyDay / sellDay, the pair
 * of days that earns maxProfit, set when maxProfit improves (none while it is 0: no sale makes money).
 *
 * Each pass of the loop is O(1) work, with O(1) space for the variables: O(n) time in total.
 */

export const MAX_DAYS = 10;

/** freezes a value and everything inside it */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value as object)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

function generateBuySellStockSteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(buySellStockDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const prices = deepFreeze([...input]);
  const n = prices.length;
  const steps: ExecutionStep[] = [];
  let i: number | null = null;
  let minPrice: number | null = null;
  let maxProfit: number | null = null;
  let profit: number | null = null;
  // DISPLAY ONLY: the day of the current minimum, and the pair of days behind maxProfit
  let minDay: number | null = null;
  let buyDay: number | null = null;
  let sellDay: number | null = null;

  type Extra = Partial<Pick<StockView, 'newMin' | 'improved' | 'moved' | 'result'>>;
  const push = (operation: StockOperation, s: Omit<ExecutionStep, 'id' | 'state' | 'stock'>, extra: Extra = {}) => {
    const view: StockView = { prices, i, minPrice, maxProfit, profit, operation, minDay, buyDay, sellDay, ...extra };
    steps.push({ id: steps.length, state: [...prices], ...s, stock: deepFreeze(view) });
  };

  push('start', {
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, prices: list(prices) },
    message: `maxProfit(${list(prices)}): buy on one day, sell on a later day`,
    explanation:
      n === 1
        ? 'There is only one day: nothing can be sold after buying, so the profit is 0.'
        : `For each day, the best sale is after buying at the lowest price before it. One pass over ${n} days keeps that lowest price and the best profit.`,
    actionLabel: 'maxProfit(prices)',
  });

  minPrice = prices[0];
  minDay = 0;
  push(
    'init',
    {
      type: 'assign',
      codeRef: 'init-min',
      variables: { minPrice },
      message: `minPrice = prices[0] = ${minPrice}`,
      explanation: `Day 0 is the only day seen so far, so its price ${minPrice} is the lowest.`,
      actionLabel: `minPrice = ${minPrice}`,
    },
    { moved: 'minPrice' }
  );
  maxProfit = 0;
  push(
    'init',
    {
      type: 'assign',
      codeRef: 'init-profit',
      variables: { minPrice, maxProfit },
      message: 'maxProfit = 0',
      explanation: 'No sale has been made yet. Not trading at all earns 0, so the answer is never below 0.',
      actionLabel: 'maxProfit = 0',
    },
    { moved: 'maxProfit' }
  );

  for (let k = 1; ; k++) {
    i = k;
    profit = null;
    const go = k < n;
    push('loop', {
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { i: k, n },
      result: go ? 'true' : 'false',
      message: `i=${k} < n=${n} → ${go ? 'true' : 'false'}${go ? '' : ' — loop ends'}`,
      explanation: go ? `Day ${k}: the price is ${prices[k]}.` : `Every day has been checked. maxProfit holds the best profit: ${maxProfit}.`,
      actionLabel: go ? `Day ${k}` : 'Loop done',
    });
    if (!go) break;

    const lower = prices[k] < minPrice!;
    push('check-min', {
      type: 'condition',
      codeRef: 'check-min',
      variables: { i: k, 'prices[i]': prices[k], minPrice },
      result: lower ? 'true' : 'false',
      message: `prices[${k}]=${prices[k]} < minPrice=${minPrice} → ${lower ? 'TRUE' : 'FALSE'}`,
      explanation: lower
        ? `${prices[k]} is lower than any earlier price: a later sale would earn more if bought here.`
        : prices[k] === minPrice
          ? `${prices[k]} equals the lowest price: the earlier day is kept.`
          : `${prices[k]} is not lower than ${minPrice}: the lowest price stays.`,
      actionLabel: lower ? 'New minimum' : 'Not lower',
    });
    if (lower) {
      minPrice = prices[k];
      minDay = k;
      push(
        'update-min',
        {
          type: 'assign',
          codeRef: 'update-min',
          variables: { i: k, minPrice },
          message: `minPrice = prices[${k}] = ${minPrice}`,
          explanation: `From now on, the best day to have bought is day ${k}, at ${minPrice}.`,
          actionLabel: `minPrice = ${minPrice}`,
        },
        { moved: 'minPrice', newMin: true }
      );
    }

    profit = prices[k] - minPrice!;
    push(
      'compute-profit',
      {
        type: 'assign',
        codeRef: 'compute-profit',
        variables: { i: k, 'prices[i]': prices[k], minPrice, profit },
        message: `profit = prices[${k}] - minPrice = ${prices[k]} - ${minPrice} = ${profit}`,
        explanation: lower
          ? `Day ${k} is the new minimum, so buying and selling on the same day earns 0.`
          : `Selling on day ${k} after buying at the lowest earlier price, ${minPrice}, earns ${profit}.`,
        actionLabel: `profit = ${profit}`,
      },
      { moved: 'profit', ...(lower ? { newMin: true } : {}) }
    );

    const better = profit > maxProfit!;
    push('check-profit', {
      type: 'condition',
      codeRef: 'check-profit',
      variables: { i: k, profit, maxProfit },
      result: better ? 'true' : 'false',
      message: `profit=${profit} > maxProfit=${maxProfit} → ${better ? 'TRUE' : 'FALSE'}`,
      explanation: better
        ? `${profit} is the best profit so far.`
        : profit === maxProfit
          ? maxProfit === 0
            ? 'Selling today earns 0. No profitable trade has been found yet.'
            : `${profit} only equals the best profit: the earlier sale is kept.`
          : `${profit} is not better than ${maxProfit}.`,
      actionLabel: better ? 'Better profit' : 'Not better',
    });
    if (better) {
      maxProfit = profit;
      buyDay = minDay;
      sellDay = k;
      push(
        'update-profit',
        {
          type: 'assign',
          codeRef: 'update-profit',
          variables: { i: k, maxProfit },
          message: `maxProfit = profit = ${maxProfit}`,
          explanation: `The best trade so far: buy on day ${buyDay} at ${prices[buyDay!]}, sell on day ${k} at ${prices[k]}.`,
          actionLabel: `maxProfit = ${maxProfit}`,
        },
        { moved: 'maxProfit', improved: true }
      );
    }

    i = k + 1;
    profit = null;
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
  const value = maxProfit!;
  const text =
    value === 0
      ? n === 1
        ? 'No profit possible: there is only one day'
        : 'No profit possible: the price never rises after a lower day'
      : `Maximum profit ${value}: buy on day ${buyDay} at ${prices[buyDay!]}, sell on day ${sellDay} at ${prices[sellDay!]}`;
  push(
    'done',
    {
      type: 'complete',
      codeRef: 'return-result',
      variables: { n, result: value },
      message: `return maxProfit = ${value}`,
      explanation: `${n - 1} pass${n - 1 === 1 ? '' : 'es'} of O(1) work: O(n) time, and O(1) space for minPrice, profit and maxProfit.`,
      actionLabel: `Return ${value}`,
      outcomeText: text,
    },
    { result: value === 0 ? { profit: 0, buyDay: null, sellDay: null, text } : { profit: value, buyDay, sellDay, text } }
  );
  return steps;
}

export const buySellStockDefinition: AlgorithmDefinition = {
  id: 'array-buy-sell-stock',
  name: 'Best Time to Buy and Sell Stock',
  category: 'ARRAYS',
  visual: 'stock',
  subtitle: 'One pass: keep the lowest price so far, and the best profit from selling today.',
  description:
    "Given each day's price of a stock, find the most profit from buying on one day and selling on a later day, or 0 if no sale makes money (LeetCode 121). The best sale on any day is after buying at the lowest price before it, so one pass is enough: minPrice keeps the lowest price so far, and each day's profit is today's price minus minPrice. The best of those is maxProfit. The minimum is updated before the profit is computed, so a day that sets a new minimum earns 0 that day. O(n) time and O(1) space: no second array and no pair of loops. The buy and sell days the visualizer marks are for display only; the code keeps only the prices of the trade, not its days.",
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'The best later-minus-earlier difference in one pass: carry the lowest value seen so far',
  },
  defaultInput: [7, 1, 5, 3, 6, 4],
  inputSpec: {
    minLength: 1,
    maxLength: MAX_DAYS,
    minValue: 0,
    randomValues: [1, 20],
  },

  code: {
    c: `int maxProfit(int* prices, int pricesSize) {
    int minPrice = prices[0];
    int maxProfit = 0;
    for (int i = 1; i < pricesSize; i++) {
        if (prices[i] < minPrice) {
            minPrice = prices[i];
        }
        int profit = prices[i] - minPrice;
        if (profit > maxProfit) {
            maxProfit = profit;
        }
    }
    return maxProfit;
}`,
    cpp: `#include <vector>
using namespace std;

int maxProfit(vector<int>& prices) {
    int minPrice = prices[0];
    int maxProfit = 0;
    for (int i = 1; i < (int)prices.size(); i++) {
        if (prices[i] < minPrice) {
            minPrice = prices[i];
        }
        int profit = prices[i] - minPrice;
        if (profit > maxProfit) {
            maxProfit = profit;
        }
    }
    return maxProfit;
}`,
    java: `public class BestTimeToBuyAndSellStock {
    public static int maxProfit(int[] prices) {
        int minPrice = prices[0];
        int maxProfit = 0;
        for (int i = 1; i < prices.length; i++) {
            if (prices[i] < minPrice) {
                minPrice = prices[i];
            }
            int profit = prices[i] - minPrice;
            if (profit > maxProfit) {
                maxProfit = profit;
            }
        }
        return maxProfit;
    }
}`,
    python: `def max_profit(prices):
    min_price = prices[0]
    max_profit = 0
    for i in range(1, len(prices)):
        if prices[i] < min_price:
            min_price = prices[i]
        profit = prices[i] - min_price
        if profit > max_profit:
            max_profit = profit
    return max_profit`,
  },

  // C, C++ and Java are line for line the same apart from the C++ includes (three lines) and the Java class (one line);
  // Python has no closing braces, so its later lines come sooner
  lineMap: {
    c: { 'fn-entry': 1, 'init-min': 2, 'init-profit': 3, 'loop-condition': 4, 'check-min': 5, 'update-min': 6, 'compute-profit': 8, 'check-profit': 9, 'update-profit': 10, 'return-result': 13 },
    cpp: { 'fn-entry': 4, 'init-min': 5, 'init-profit': 6, 'loop-condition': 7, 'check-min': 8, 'update-min': 9, 'compute-profit': 11, 'check-profit': 12, 'update-profit': 13, 'return-result': 16 },
    java: { 'fn-entry': 2, 'init-min': 3, 'init-profit': 4, 'loop-condition': 5, 'check-min': 6, 'update-min': 7, 'compute-profit': 9, 'check-profit': 10, 'update-profit': 11, 'return-result': 14 },
    python: { 'fn-entry': 1, 'init-min': 2, 'init-profit': 3, 'loop-condition': 4, 'check-min': 5, 'update-min': 6, 'compute-profit': 7, 'check-profit': 8, 'update-profit': 9, 'return-result': 10 },
  },

  generateSteps: generateBuySellStockSteps,
};
