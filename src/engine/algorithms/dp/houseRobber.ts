import type { AlgorithmDefinition, ExecutionStep, HouseRobberOperation, HouseRobberView } from '../../../types/algorithm';
import { validateAlgorithmInput } from '../../inputParsing';

/**
 * House Robber (LeetCode 198) with bottom-up dynamic programming in O(1) space:
 *
 *   prev2 = 0; prev1 = 0;
 *   for i = 0 .. n - 1:
 *     current = max(prev1, nums[i] + prev2);
 *     prev2 = prev1;
 *     prev1 = current;
 *   return prev1;
 *
 * prev1 is the most money from the houses before house i, and prev2 the most from the houses before house i - 1. House
 * i can be robbed only if house i - 1 is not, so robbing it gives nums[i] + prev2; skipping it keeps prev1. The larger
 * of the two is the most money from houses 0 to i. Both start at 0 (no houses, no money), so one house and two houses
 * need no case of their own.
 *
 * The one max(...) statement is three steps here, all on its line: the rob choice, the skip choice and the comparison.
 * When the two are equal, max returns prev1: a tie skips the house.
 *
 * The code keeps only prev2, prev1 and current. Two things the visualizer shows are DISPLAY ONLY, built by the trace and
 * never by the listings: `best`, the most money after each house processed (every value current has had), and
 * `selected`, one set of houses that reaches the latest of those amounts. The set is read back from `best`: going from
 * the last house processed towards the first, a house whose best equals the best before it was skipped (this is how a
 * tie skips, as in the code); otherwise it was robbed, and the house before it is passed over.
 *
 * Each pass of the loop is O(1) work, with O(1) space for the three variables: O(n) time in total.
 */

export const MAX_HOUSES = 10;
export const MAX_MONEY = 400;

/** freezes a value and everything inside it */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value as object)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/**
 * DISPLAY ONLY: one set of houses whose money adds up to the last value of `best`, with no two next to each other.
 * best[k] is the most money from houses 0 to k; a house whose best is the same as the best before it was skipped.
 */
export function selectedHouses(best: readonly number[]): number[] {
  const houses: number[] = [];
  for (let k = best.length - 1; k >= 0; ) {
    const before = k > 0 ? best[k - 1] : 0;
    if (best[k] === before) {
      k -= 1;
    } else {
      houses.push(k);
      k -= 2;
    }
  }
  return houses.reverse();
}

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;
/** "house 0", "houses 0 and 2", "houses 0, 2 and 4" */
const housesText = (houses: readonly number[]) =>
  houses.length === 1 ? `house ${houses[0]}` : `houses ${houses.slice(0, -1).join(', ')} and ${houses[houses.length - 1]}`;
/** which houses a best amount covers: "no houses", "house 0", "houses 0 to 2" */
const upTo = (last: number) => (last < 0 ? 'no houses' : last === 0 ? 'house 0' : `houses 0 to ${last}`);

function generateHouseRobberSteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(houseRobberDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const nums = deepFreeze([...input]);
  const n = nums.length;
  const steps: ExecutionStep[] = [];
  /** DISPLAY ONLY: every value current has had, one per house processed */
  const best: number[] = [];
  let prev2: number | null = null;
  let prev1: number | null = null;
  let current: number | null = null;
  let i: number | null = null;
  let choice: HouseRobberView['choice'];

  type Extra = Partial<Pick<HouseRobberView, 'blocked' | 'moved' | 'result'>>;
  const push = (operation: HouseRobberOperation, s: Omit<ExecutionStep, 'id' | 'state' | 'houseRobber'>, extra: Extra = {}) => {
    const view: HouseRobberView = {
      nums,
      i,
      prev2,
      prev1,
      current,
      operation,
      best: [...best],
      selected: selectedHouses(best),
      ...(choice ? { choice: { ...choice } } : {}),
      ...extra,
    };
    steps.push({ id: steps.length, state: [...nums], ...s, houseRobber: deepFreeze(view) });
  };

  push('start', {
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, nums: list(nums) },
    message: `rob(${list(nums)}): the most money from houses that are not next to each other`,
    explanation: `There ${n === 1 ? 'is 1 house' : `are ${n} houses`} in a row. Robbing two houses next to each other sets off the alarm, so for every house the choice is: rob it and leave the one before it, or skip it.`,
    actionLabel: 'rob(nums)',
  });

  prev2 = 0;
  push(
    'init',
    {
      type: 'assign',
      codeRef: 'init-prev2',
      variables: { prev2 },
      message: 'prev2 = 0',
      explanation: 'prev2 is the most money from the houses up to two before the current one. Before the first house there are none: 0.',
      actionLabel: 'prev2 = 0',
    },
    { moved: 'prev2' }
  );
  prev1 = 0;
  push(
    'init',
    {
      type: 'assign',
      codeRef: 'init-prev1',
      variables: { prev2, prev1 },
      message: 'prev1 = 0',
      explanation: 'prev1 is the most money from the houses up to the one before the current one. Before the first house there are none: 0.',
      actionLabel: 'prev1 = 0',
    },
    { moved: 'prev1' }
  );

  for (let k = 0; ; k++) {
    i = k;
    current = null;
    choice = undefined;
    const go = k < n;
    push('loop', {
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { i: k, n },
      result: go ? 'true' : 'false',
      message: `i=${k} < n=${n} → ${go ? 'true' : 'false'}${go ? '' : ' — loop ends'}`,
      explanation: go
        ? `House ${k} holds ${nums[k]}. Rob it, or skip it?`
        : `Every house has been decided. prev1 holds the most money from ${upTo(n - 1)}: ${prev1}.`,
      actionLabel: go ? `House ${k}` : 'Loop done',
    });
    if (!go) break;

    const rob = nums[k] + prev2!;
    choice = { rob };
    push(
      'rob',
      {
        type: 'compare',
        codeRef: 'rob-choice',
        variables: { i: k, 'nums[i]': nums[k], prev2, rob },
        message: `rob house ${k}: nums[${k}] + prev2 = ${nums[k]} + ${prev2} = ${rob}`,
        explanation:
          k === 0
            ? `Robbing house 0 gives its ${nums[k]}. There is no house before it, so prev2 adds 0.`
            : `Robbing house ${k} means house ${k - 1} is left alone, so its ${nums[k]} is added to prev2 = ${prev2}, the most from ${upTo(k - 2)}.`,
        actionLabel: `Rob: ${rob}`,
      },
      k > 0 ? { blocked: k - 1 } : {}
    );

    const skip = prev1!;
    choice = { rob, skip };
    push('skip', {
      type: 'compare',
      codeRef: 'skip-choice',
      variables: { i: k, prev1, rob, skip },
      message: `skip house ${k}: prev1 = ${skip}`,
      explanation: `Skipping house ${k} keeps prev1 = ${skip}, the most from ${upTo(k - 1)}.`,
      actionLabel: `Skip: ${skip}`,
    });

    const winner = rob > skip ? 'rob' : 'skip';
    current = Math.max(skip, rob);
    choice = { rob, skip, winner };
    best.push(current);
    push('max', {
      type: 'assign',
      codeRef: 'take-max',
      variables: { i: k, prev1, 'nums[i] + prev2': rob, current },
      message: `current = max(${skip}, ${rob}) = ${current} — ${winner === 'rob' ? 'rob wins' : rob === skip ? 'equal: skip' : 'skip wins'}`,
      explanation:
        winner === 'rob'
          ? `Robbing house ${k} gives ${rob}, more than the ${skip} from skipping it. The most from ${upTo(k)} is ${current}.`
          : rob === skip
            ? `Both give ${current}: max keeps prev1, so house ${k} is skipped. The most from ${upTo(k)} is ${current}.`
            : `Skipping house ${k} keeps ${skip}, more than the ${rob} from robbing it. The most from ${upTo(k)} is ${current}.`,
      actionLabel: winner === 'rob' ? 'Rob wins' : rob === skip ? 'Equal: skip' : 'Skip wins',
    });

    prev2 = prev1;
    push(
      'shift',
      {
        type: 'assign',
        codeRef: 'shift-prev2',
        variables: { i: k, prev2, prev1 },
        message: `prev2 = prev1 = ${prev2}`,
        explanation: `prev2 takes the old prev1, the most from ${upTo(k - 1)}: for the next house, that is "up to two houses back".`,
        actionLabel: 'prev2 = prev1',
      },
      { moved: 'prev2' }
    );
    prev1 = current;
    push(
      'shift',
      {
        type: 'assign',
        codeRef: 'shift-prev1',
        variables: { i: k, prev2, prev1 },
        message: `prev1 = current = ${prev1}`,
        explanation: `prev1 now holds the most from ${upTo(k)}. Only prev2 and prev1 are kept: no array of answers is stored.`,
        actionLabel: 'prev1 = current',
      },
      { moved: 'prev1' }
    );

    i = k + 1;
    current = null;
    choice = undefined;
    push('loop', {
      type: 'increment',
      codeRef: 'loop-condition',
      variables: { i: k + 1, n },
      message: `i++ → i=${k + 1}`,
      explanation: 'Move to the next house.',
      actionLabel: 'i++',
    });
  }

  i = null;
  const amount = prev1!;
  const houses = selectedHouses(best);
  const text =
    houses.length === 0
      ? 'Maximum 0: no house holds any money'
      : `Maximum ${amount}: rob ${housesText(houses)} (${houses.map(h => nums[h]).join(' + ')}${houses.length > 1 ? ` = ${amount}` : ''})`;
  push(
    'done',
    {
      type: 'complete',
      codeRef: 'return-result',
      variables: { n, result: amount },
      message: `return prev1 = ${amount}`,
      explanation: `prev1 is the most money from ${upTo(n - 1)}. ${n} pass${n === 1 ? '' : 'es'} of O(1) work: O(n) time, and O(1) space for prev2, prev1 and current.`,
      actionLabel: `Return ${amount}`,
      outcomeText: text,
    },
    { result: { amount, houses, text } }
  );
  return steps;
}

export const houseRobberDefinition: AlgorithmDefinition = {
  id: 'dp-house-robber',
  name: 'House Robber',
  category: 'DP',
  visual: 'houses',
  subtitle: 'The most money from houses in a row without robbing two neighbours: rob or skip, kept in two rolling variables.',
  description:
    'Each house in a row holds some money, and robbing two houses next to each other sets off the alarm (LeetCode 198). For every house there are two choices: rob it, which adds its money to the most that could be taken up to two houses back, or skip it, which keeps the most taken up to the previous house. Bottom-up DP in O(1) space keeps only two rolling variables: prev2 (the most up to two houses back) and prev1 (the most up to the previous house). Each pass of the loop computes current = max(prev1, nums[i] + prev2), then shifts prev2 = prev1 and prev1 = current. Both start at 0, so a single house needs no special case, and a tie skips the house. O(n) time, O(1) space: no array of answers is stored. The amounts after each house and the houses robbed, which the visualizer shows, are for display only; the code never keeps them.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'A take-it-or-leave-it choice per item where taking one rules out its neighbour',
  },
  defaultInput: [2, 7, 9, 3, 1],
  inputSpec: {
    minLength: 1,
    maxLength: MAX_HOUSES,
    minValue: 0,
    maxValue: MAX_MONEY,
    randomValues: [1, 20],
  },

  code: {
    c: `int maxOf(int a, int b) {
    return a > b ? a : b;
}

int rob(int* nums, int numsSize) {
    int prev2 = 0;
    int prev1 = 0;
    for (int i = 0; i < numsSize; i++) {
        int current = maxOf(prev1, nums[i] + prev2);
        prev2 = prev1;
        prev1 = current;
    }
    return prev1;
}`,
    cpp: `#include <algorithm>
#include <vector>
using namespace std;

int rob(vector<int>& nums) {
    int prev2 = 0;
    int prev1 = 0;
    for (int i = 0; i < (int)nums.size(); i++) {
        int current = max(prev1, nums[i] + prev2);
        prev2 = prev1;
        prev1 = current;
    }
    return prev1;
}`,
    java: `public class HouseRobber {
    public static int rob(int[] nums) {
        int prev2 = 0;
        int prev1 = 0;
        for (int i = 0; i < nums.length; i++) {
            int current = Math.max(prev1, nums[i] + prev2);
            prev2 = prev1;
            prev1 = current;
        }
        return prev1;
    }
}`,
    python: `def rob(nums):
    prev2 = 0
    prev1 = 0
    for i in range(len(nums)):
        current = max(prev1, nums[i] + prev2)
        prev2 = prev1
        prev1 = current
    return prev1`,
  },

  // the rob choice, the skip choice and the comparison are the three parts of the one max(...) statement: one line.
  // C has a small maxOf helper above the function, and C++ its includes; Java wraps the function in a class
  lineMap: {
    c: { 'fn-entry': 5, 'init-prev2': 6, 'init-prev1': 7, 'loop-condition': 8, 'rob-choice': 9, 'skip-choice': 9, 'take-max': 9, 'shift-prev2': 10, 'shift-prev1': 11, 'return-result': 13 },
    cpp: { 'fn-entry': 5, 'init-prev2': 6, 'init-prev1': 7, 'loop-condition': 8, 'rob-choice': 9, 'skip-choice': 9, 'take-max': 9, 'shift-prev2': 10, 'shift-prev1': 11, 'return-result': 13 },
    java: { 'fn-entry': 2, 'init-prev2': 3, 'init-prev1': 4, 'loop-condition': 5, 'rob-choice': 6, 'skip-choice': 6, 'take-max': 6, 'shift-prev2': 7, 'shift-prev1': 8, 'return-result': 10 },
    python: { 'fn-entry': 1, 'init-prev2': 2, 'init-prev1': 3, 'loop-condition': 4, 'rob-choice': 5, 'skip-choice': 5, 'take-max': 5, 'shift-prev2': 6, 'shift-prev1': 7, 'return-result': 8 },
  },

  generateSteps: generateHouseRobberSteps,
};
