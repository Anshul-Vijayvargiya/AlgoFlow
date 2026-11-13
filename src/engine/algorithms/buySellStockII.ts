import type { AlgorithmDefinition, ExecutionStep, StockIIOperation, StockIITrade, StockIIView } from '../../types/algorithm';
import { validateAlgorithmInput } from '../inputParsing';

/**
 * Best Time to Buy and Sell Stock II (LeetCode 122): any number of trades, holding at most one share at a time.
 *
 *   totalProfit = 0
 *   for i = 1 .. n - 1:
 *     if prices[i] > prices[i - 1]: totalProfit += prices[i] - prices[i - 1]
 *   return totalProfit
 *
 * Every rise from one day to the next can be earned by buying the day before and selling that day, and no trade can earn
 * more than the rises it spans: a trade from day b to day s earns prices[s] - prices[b], which is the sum of the day-to-day
 * changes between them, and leaving out the falls only makes that sum larger. So the answer is the sum of all the rises.
 * A run of rises adds up to one trade from the bottom of the run to its top: 1 → 3 → 5 earns 2 + 2 = 4 = 5 - 1.
 *
 * The code keeps only totalProfit. What the visualizer shows beyond it is DISPLAY ONLY, built by the trace and never by
 * the listings: `gains`, every day-to-day change seen so far and whether it was counted; `trades`, the trades completed so
 * far, each a run of counted rises (buy at the bottom of the run, sell at its top); and `open`, the run still rising. A
 * change that is not a rise (a fall, or the same price) ends the run, as the code's strict > does not count it.
 *
 * Each pass of the loop is O(1) work, with O(1) space for totalProfit: O(n) time in total.
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
const signed = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : '0');
const tradesWord = (k: number) => `${k} trade${k === 1 ? '' : 's'}`;

function generateBuySellStockIISteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(buySellStockIIDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const prices = deepFreeze([...input]);
  const n = prices.length;
  const steps: ExecutionStep[] = [];
  let i: number | null = null;
  let totalProfit: number | null = null;
  let pair: { prev: number; cur: number; change: number } | null = null;
  // DISPLAY ONLY: the changes seen so far, the trades completed so far and the run still rising
  const gains: { day: number; change: number; counted: boolean }[] = [];
  const trades: StockIITrade[] = [];
  let open: StockIITrade | null = null;

  type Extra = Partial<Pick<StockIIView, 'closed' | 'result'>>;
  const push = (operation: StockIIOperation, s: Omit<ExecutionStep, 'id' | 'state' | 'stockII'>, extra: Extra = {}) => {
    const view: StockIIView = {
      prices,
      i,
      totalProfit,
      operation,
      prev: pair?.prev ?? null,
      cur: pair?.cur ?? null,
      change: pair?.change ?? null,
      gains: gains.map(g => ({ ...g })),
      trades: trades.map(t => ({ ...t })),
      open: open ? { ...open } : null,
      ...extra,
    };
    steps.push({ id: steps.length, state: [...prices], ...s, stockII: deepFreeze(view) });
  };
  /** the run still rising ends: it becomes a completed trade */
  const closeRun = (): StockIITrade | undefined => {
    if (!open) return undefined;
    const done = open;
    trades.push(done);
    open = null;
    return done;
  };

  push('start', {
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, prices: list(prices) },
    message: `maxProfit(${list(prices)}): as many trades as you like, one share at a time`,
    explanation:
      n === 1
        ? 'There is only one day: nothing can be sold after buying, so the profit is 0.'
        : `Every rise from one day to the next can be earned by buying the day before and selling that day. Adding up all the rises over ${n} days gives the most profit.`,
    actionLabel: 'maxProfit(prices)',
  });

  totalProfit = 0;
  push('init', {
    type: 'assign',
    codeRef: 'init-total',
    variables: { totalProfit },
    message: 'totalProfit = 0',
    explanation: 'Nothing has been earned yet. Not trading at all earns 0, so the answer is never below 0.',
    actionLabel: 'totalProfit = 0',
  });

  for (let k = 1; ; k++) {
    i = k;
    pair = null;
    const go = k < n;
    if (!go) {
      const closed = closeRun();
      push(
        'loop',
        {
          type: 'loop-condition',
          codeRef: 'loop-condition',
          variables: { i: k, n },
          result: 'false',
          message: `i=${k} < n=${n} → false — loop ends`,
          explanation: closed
            ? `Every day has been compared. The last run of rises ends here: buy on day ${closed.buyDay}, sell on day ${closed.sellDay}. totalProfit is ${totalProfit}.`
            : `Every day has been compared. totalProfit is ${totalProfit}.`,
          actionLabel: 'Loop done',
        },
        closed ? { closed } : {}
      );
      break;
    }
    push('loop', {
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { i: k, n },
      result: 'true',
      message: `i=${k} < n=${n} → true`,
      explanation: `Compare day ${k} (price ${prices[k]}) with the day before it (price ${prices[k - 1]}).`,
      actionLabel: `Days ${k - 1}–${k}`,
    });

    const prev = prices[k - 1];
    const cur = prices[k];
    const change = cur - prev;
    pair = { prev, cur, change };
    const rise = cur > prev;
    gains.push({ day: k, change, counted: rise });
    const closed = rise ? undefined : closeRun();
    push(
      'check-rise',
      {
        type: 'condition',
        codeRef: 'check-rise',
        variables: { i: k, 'prices[i]': cur, 'prices[i - 1]': prev },
        result: rise ? 'true' : 'false',
        message: `prices[${k}]=${cur} > prices[${k - 1}]=${prev} → ${rise ? `TRUE (${signed(change)})` : 'FALSE'}`,
        explanation: rise
          ? `The price rises by ${change}: buying on day ${k - 1} and selling on day ${k} earns it.`
          : `${change === 0 ? 'The price stays the same' : `The price falls by ${-change}`}: there is nothing to earn from day ${k - 1} to day ${k}, so it is skipped.${
              closed ? ` The run of rises ends: buy on day ${closed.buyDay} at ${prices[closed.buyDay]}, sell on day ${closed.sellDay} at ${prices[closed.sellDay]}.` : ''
            }`,
        actionLabel: rise ? `Rise ${signed(change)}` : change === 0 ? 'No change' : `Fall ${signed(change)}`,
      },
      closed ? { closed } : {}
    );

    if (rise) {
      totalProfit += change;
      const extends_ = open !== null;
      open = open ? { buyDay: open.buyDay, sellDay: k, profit: open.profit + change } : { buyDay: k - 1, sellDay: k, profit: change };
      const run = gains.slice(gains.length - (k - open.buyDay)).map(g => g.change);
      push('add-gain', {
        type: 'update',
        codeRef: 'add-gain',
        variables: { i: k, change, totalProfit },
        message: `totalProfit += ${cur} - ${prev} → ${totalProfit}`,
        explanation: extends_
          ? `The rise continues: ${run.map(signed).join(' ')} = ${open.profit} = ${prices[k]} − ${prices[open.buyDay]}, the same as buying on day ${open.buyDay} at ${prices[open.buyDay]} and selling on day ${k} at ${prices[k]}.`
          : `${change} is earned: buy on day ${k - 1} at ${prev}, sell on day ${k} at ${cur}.`,
        actionLabel: `totalProfit = ${totalProfit}`,
      });
    }

    i = k + 1;
    pair = null;
    push('loop', {
      type: 'increment',
      codeRef: 'loop-condition',
      variables: { i: k + 1, n },
      message: `i++ → i=${k + 1}`,
      explanation: 'Move to the next pair of days.',
      actionLabel: 'i++',
    });
  }

  i = null;
  const value = totalProfit!;
  const text =
    value === 0
      ? n === 1
        ? 'No profit possible: there is only one day'
        : 'No profit possible: the price never rises from one day to the next'
      : `Maximum profit ${value} from ${tradesWord(trades.length)}: ${trades.map(t => `buy day ${t.buyDay} at ${prices[t.buyDay]} → sell day ${t.sellDay} at ${prices[t.sellDay]} (+${t.profit})`).join(', ')}`;
  push(
    'done',
    {
      type: 'complete',
      codeRef: 'return-result',
      variables: { n, result: value },
      message: `return totalProfit = ${value}`,
      explanation: `${n - 1} pass${n - 1 === 1 ? '' : 'es'} of O(1) work: O(n) time, and O(1) space for totalProfit.`,
      actionLabel: `Return ${value}`,
      outcomeText: text,
    },
    { result: { profit: value, trades: trades.map(t => ({ ...t })), text } }
  );
  return steps;
}

export const buySellStockIIDefinition: AlgorithmDefinition = {
  id: 'array-buy-sell-stock-ii',
  name: 'Best Time to Buy and Sell Stock II',
  category: 'ARRAYS',
  visual: 'stock-ii',
  subtitle: 'As many trades as you like: add up every rise from one day to the next.',
  description:
    "Given each day's price of a stock, find the most profit from as many trades as you like, holding at most one share at a time: you must sell before you buy again (LeetCode 122). Every rise from one day to the next can be earned by buying the day before and selling that day, and no trade earns more than the rises it spans, so the answer is the sum of all the rises. A run of rises is the same as one trade from the bottom of the run to its top: 1 → 3 → 5 earns 2 + 2 = 4 = 5 − 1. One pass, comparing each day with the day before: O(n) time and O(1) space. The trades the visualizer marks are for display only; the code keeps only the total.",
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'Collecting every gain when trades are unlimited: a greedy sum of the positive day-to-day changes',
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
    int totalProfit = 0;
    for (int i = 1; i < pricesSize; i++) {
        if (prices[i] > prices[i - 1]) {
            totalProfit += prices[i] - prices[i - 1];
        }
    }
    return totalProfit;
}`,
    cpp: `#include <vector>
using namespace std;

int maxProfit(vector<int>& prices) {
    int totalProfit = 0;
    for (int i = 1; i < (int)prices.size(); i++) {
        if (prices[i] > prices[i - 1]) {
            totalProfit += prices[i] - prices[i - 1];
        }
    }
    return totalProfit;
}`,
    java: `public class BestTimeToBuyAndSellStockII {
    public static int maxProfit(int[] prices) {
        int totalProfit = 0;
        for (int i = 1; i < prices.length; i++) {
            if (prices[i] > prices[i - 1]) {
                totalProfit += prices[i] - prices[i - 1];
            }
        }
        return totalProfit;
    }
}`,
    python: `def max_profit(prices):
    total_profit = 0
    for i in range(1, len(prices)):
        if prices[i] > prices[i - 1]:
            total_profit += prices[i] - prices[i - 1]
    return total_profit`,
  },

  // C, C++ and Java are line for line the same apart from the C++ includes (three lines) and the Java class (one line);
  // Python has no closing braces, so its return comes sooner
  lineMap: {
    c: { 'fn-entry': 1, 'init-total': 2, 'loop-condition': 3, 'check-rise': 4, 'add-gain': 5, 'return-result': 8 },
    cpp: { 'fn-entry': 4, 'init-total': 5, 'loop-condition': 6, 'check-rise': 7, 'add-gain': 8, 'return-result': 11 },
    java: { 'fn-entry': 2, 'init-total': 3, 'loop-condition': 4, 'check-rise': 5, 'add-gain': 6, 'return-result': 9 },
    python: { 'fn-entry': 1, 'init-total': 2, 'loop-condition': 3, 'check-rise': 4, 'add-gain': 5, 'return-result': 6 },
  },

  generateSteps: generateBuySellStockIISteps,
};
