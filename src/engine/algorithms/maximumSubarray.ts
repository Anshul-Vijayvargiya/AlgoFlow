import type { AlgorithmDefinition, ExecutionStep, NumberCell } from '../../types/algorithm';

/**
 * Maximum Subarray, Kadane's algorithm. currentSum is the best sum of a subarray ending at i; it either extends the run
 * ending at i - 1 (currentSum + nums[i]) or starts afresh at i (nums[i]), whichever is larger — so a negative running
 * sum is dropped. maxSum keeps the best currentSum seen. Both start at nums[0], never 0, so an all-negative array
 * returns its largest element. Ties: a new run starts only when strictly better, and the best is replaced only by a
 * strictly larger sum, so the first (and shortest such) best subarray is reported. O(n) time, O(1) space.
 */
function generateKadaneSteps(input: number[]): ExecutionStep[] {
  const nums = [...input];
  const n = nums.length;
  // the UI validates this (inputSpec: at least one value); a direct call with anything else is refused
  if (n < 1 || nums.some(v => !Number.isInteger(v))) {
    throw new RangeError('Maximum Subarray needs at least one whole number (the subarray must be non-empty).');
  }

  const steps: ExecutionStep[] = [];
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [...nums], ...s });

  let currentSum: number | null = null;
  let maxSum: number | null = null;
  let start: number | null = null;
  let bestStart: number | null = null;
  let bestEnd: number | null = null;
  let i: number | null = null;

  type Roles = Partial<Record<'value' | 'currentSum' | 'maxSum' | 'start' | 'best', NumberCell['role']>>;
  const cards = (roles: Roles = {}): NumberCell[] => [
    { name: 'nums[i]', value: i !== null && i < n ? nums[i] : null, role: roles.value },
    { name: 'currentSum', value: currentSum, role: roles.currentSum },
    { name: 'maxSum', value: maxSum, role: roles.maxSum },
    { name: 'start', value: start, role: roles.start },
    { name: 'bestStart', value: bestStart, role: roles.best },
    { name: 'bestEnd', value: bestEnd, role: roles.best },
  ];
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);
  const slice = (from: number, to: number) => `[${nums.slice(from, to + 1).join(', ')}]`;
  /**
   * the current run nums[start..end], with everything outside it dimmed (while the loop checks and compares, it includes
   * nums[i], the value being considered), and the pointers start and i; i is the code's i, which may be n when the loop
   * ends (then listed off-array). Only i is drawn under the bars: start is the run's first bright bar and has a card.
   */
  const current = (end: number, at: number = end) => ({ pointers: { start: start!, i: at }, extraInfo: { subRange: [start!, end] as [number, number] } });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n },
    tracker: cards(),
    message: `Maximum Subarray: the contiguous, non-empty run of ${n} value${n === 1 ? '' : 's'} with the largest sum`,
    explanation:
      "Kadane's algorithm walks the array once, keeping the best sum of a run that ends at the current index, and the best sum seen anywhere.",
    actionLabel: 'Initialize',
  });

  currentSum = nums[0];
  maxSum = nums[0];
  push({
    type: 'assign',
    codeRef: 'init-sums',
    variables: { currentSum, maxSum },
    indices: [0],
    tracker: cards({ currentSum: 'changed', maxSum: 'changed' }),
    message: `currentSum = maxSum = nums[0] = ${nums[0]}`,
    explanation:
      'Both start at the first value, not at 0: the subarray must contain at least one value, so for an all-negative array the answer is a negative number.',
    actionLabel: 'Init sums',
  });

  start = 0;
  bestStart = 0;
  bestEnd = 0;
  push({
    type: 'assign',
    codeRef: 'init-bounds',
    variables: { start, bestStart, bestEnd },
    ...current(0),
    tracker: cards({ start: 'changed', best: 'changed' }),
    message: 'start = bestStart = bestEnd = 0',
    explanation: `The current run and the best run are both nums[0..0] = ${slice(0, 0)}, with sum ${nums[0]}.`,
    actionLabel: 'Init bounds',
  });

  for (i = 1; ; i++) {
    const inLoop = i < n;
    push({
      type: 'loop-condition',
      codeRef: 'loop',
      variables: { i, n },
      ...current(Math.min(i, n - 1), i),
      ...(inLoop ? { indices: [i] } : {}),
      tracker: cards(),
      result: inLoop ? 'true' : 'false',
      message: `i < n?  ${i} < ${n} → ${inLoop}`,
      explanation: inLoop ? `Next value: nums[${i}] = ${nums[i]}.` : `Every value has been considered. The best run is nums[${bestStart}..${bestEnd}] with sum ${maxSum}.`,
      actionLabel: inLoop ? `i = ${i}` : 'Loop ends',
    });
    if (!inLoop) break;

    const extended = currentSum + nums[i];
    const restart = extended < nums[i];
    push({
      type: 'compare',
      codeRef: 'compare',
      variables: { i, currentSum, 'nums[i]': nums[i], 'currentSum + nums[i]': extended },
      ...current(i, i),
      indices: [i],
      comparedValues: { val1: extended, val2: nums[i] },
      tracker: cards({ value: 'current', currentSum: 'current' }),
      result: restart ? 'true' : 'false',
      message: `currentSum + nums[i] < nums[i]?  ${currentSum} + ${nums[i]} = ${extended} < ${nums[i]} → ${restart}`,
      explanation: restart
        ? `The run so far sums to ${currentSum} < 0: it only lowers whatever follows it, so a new run starting at ${i} is better.`
        : `Extending the run nums[${start}..${i - 1}] (sum ${currentSum}) gives ${extended}, at least as much as starting over with ${nums[i]}.`,
      actionLabel: restart ? 'Start new' : 'Extend',
    });

    const before = currentSum;
    if (restart) {
      currentSum = nums[i];
      start = i;
      push({
        type: 'update',
        codeRef: 'start-new',
        variables: { currentSum, start },
        ...current(i),
        indices: [i],
        tracker: cards({ currentSum: 'changed', start: 'changed' }),
        message: `currentSum = nums[${i}] = ${currentSum}, start = ${i}`,
        explanation: `The previous run (sum ${before}) is dropped; the current run is now nums[${i}..${i}] = ${slice(i, i)}.`,
        actionLabel: 'New run',
      });
    } else {
      currentSum += nums[i];
      push({
        type: 'update',
        codeRef: 'extend',
        variables: { currentSum },
        ...current(i),
        indices: [i],
        tracker: cards({ currentSum: 'changed' }),
        message: `currentSum += nums[${i}]  →  ${before} + ${nums[i]} = ${currentSum}`,
        explanation: `The current run is now nums[${start}..${i}] = ${slice(start, i)}.`,
        actionLabel: 'Extend run',
      });
    }

    const better = currentSum > maxSum;
    push({
      type: 'condition',
      codeRef: 'check-max',
      variables: { currentSum, maxSum },
      ...current(i),
      indices: range(start, i),
      tracker: cards({ currentSum: 'current', maxSum: 'current' }),
      result: better ? 'true' : 'false',
      message: `currentSum > maxSum?  ${currentSum} > ${maxSum} → ${better}`,
      explanation: better
        ? `nums[${start}..${i}] sums to more than the best so far.`
        : `The best is still nums[${bestStart}..${bestEnd}] = ${slice(bestStart, bestEnd)} with sum ${maxSum}.`,
      actionLabel: better ? 'New best' : 'Keep best',
    });

    if (better) {
      const previous = maxSum;
      maxSum = currentSum;
      bestStart = start;
      bestEnd = i;
      push({
        type: 'update',
        codeRef: 'update-max',
        variables: { maxSum, bestStart, bestEnd },
        ...current(i),
        // the new best run lights up
        indices: range(bestStart, bestEnd),
        tracker: cards({ maxSum: 'changed', best: 'changed' }),
        message: `maxSum = ${maxSum}, bestStart = ${bestStart}, bestEnd = ${bestEnd}`,
        explanation: `The best run is now nums[${bestStart}..${bestEnd}] = ${slice(bestStart, bestEnd)} with sum ${maxSum} (was ${previous}).`,
        actionLabel: 'Update best',
      });
    }
  }

  const best = range(bestStart, bestEnd);
  const answer = `nums[${bestStart}..${bestEnd}] = ${slice(bestStart, bestEnd)}`;
  push({
    type: 'found',
    codeRef: 'return',
    variables: { maxSum, bestStart, bestEnd },
    indices: best,
    sortedIndices: best,
    tracker: cards({ maxSum: 'current', best: 'current' }),
    message: `Return maxSum = ${maxSum}, subarray ${answer}`,
    explanation:
      bestStart === bestEnd && maxSum < 0
        ? `Every value is negative, so any longer run only adds more negatives: the best non-empty subarray is the single largest value, ${maxSum}.`
        : `${answer} has the largest sum of any contiguous subarray: ${maxSum}.`,
    actionLabel: 'Max sum',
  });

  push({
    type: 'complete',
    codeRef: 'return',
    variables: { maxSum },
    sortedIndices: best,
    tracker: cards(),
    outcomeText: `Max sum ${maxSum}: ${answer}`,
    message: `Done — max sum ${maxSum}`,
    explanation: `One pass over ${n} value${n === 1 ? '' : 's'}: O(n) time. Only two sums and three indices are kept: O(1) extra space.`,
    actionLabel: 'Complete',
  });

  return steps;
}

export const maximumSubarrayDefinition: AlgorithmDefinition = {
  id: 'maximum-subarray',
  name: 'Maximum Subarray',
  category: 'ARRAYS',
  subtitle: "Kadane's algorithm: extend the run or start over, in one pass.",
  description:
    "Maximum Subarray (LeetCode 53): the contiguous, non-empty subarray with the largest sum. Kadane's algorithm keeps the best sum of a run ending at each index — extend the previous run, or start a new one when the previous run's sum is negative — and the best sum seen anywhere. Both start at the first value, so an all-negative array returns its largest element.",
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'Best contiguous run in one pass (profits, signal gains)',
  },
  defaultInput: [-2, 1, -3, 4, -1, 2, 1, -5, 4],
  // non-empty; Randomize mixes negative and positive values so runs are both extended and restarted
  inputSpec: { minLength: 1, randomValues: [-20, 20] },
  // start is not drawn as a chip: on 16 narrow bars (phones) it would overlap i on the next bar
  positionPointers: ['i'],

  code: {
    c: `typedef struct { int sum, start, end; } Result;

Result maxSubArray(const int nums[], int n) {
    int currentSum = nums[0], maxSum = nums[0];
    int start = 0, bestStart = 0, bestEnd = 0;
    for (int i = 1; i < n; i++) {
        if (currentSum + nums[i] < nums[i]) {
            currentSum = nums[i];
            start = i;
        } else {
            currentSum += nums[i];
        }
        if (currentSum > maxSum) {
            maxSum = currentSum;
            bestStart = start;
            bestEnd = i;
        }
    }
    return (Result){ maxSum, bestStart, bestEnd };
}`,
    cpp: `struct Result { int sum, start, end; };

Result maxSubArray(const vector<int>& nums) {
    int currentSum = nums[0], maxSum = nums[0];
    int start = 0, bestStart = 0, bestEnd = 0;
    for (int i = 1; i < (int)nums.size(); i++) {
        if (currentSum + nums[i] < nums[i]) {
            currentSum = nums[i];
            start = i;
        } else {
            currentSum += nums[i];
        }
        if (currentSum > maxSum) {
            maxSum = currentSum;
            bestStart = start;
            bestEnd = i;
        }
    }
    return {maxSum, bestStart, bestEnd};
}`,
    java: `public class MaximumSubarray {
    /** returns { maxSum, bestStart, bestEnd } */
    public static int[] maxSubArray(int[] nums) {
        int currentSum = nums[0], maxSum = nums[0];
        int start = 0, bestStart = 0, bestEnd = 0;
        for (int i = 1; i < nums.length; i++) {
            if (currentSum + nums[i] < nums[i]) {
                currentSum = nums[i];
                start = i;
            } else {
                currentSum += nums[i];
            }
            if (currentSum > maxSum) {
                maxSum = currentSum;
                bestStart = start;
                bestEnd = i;
            }
        }
        return new int[] { maxSum, bestStart, bestEnd };
    }
}`,
    python: `def max_sub_array(nums):
    current_sum = max_sum = nums[0]
    start = best_start = best_end = 0
    for i in range(1, len(nums)):
        if current_sum + nums[i] < nums[i]:
            current_sum = nums[i]
            start = i
        else:
            current_sum += nums[i]
        if current_sum > max_sum:
            max_sum = current_sum
            best_start, best_end = start, i
    return max_sum, best_start, best_end`,
  },

  // C, C++ and Java share one layout; Python has no struct and no braces
  lineMap: {
    c: { 'fn-entry': 3, 'init-sums': 4, 'init-bounds': 5, loop: 6, compare: 7, 'start-new': 8, extend: 11, 'check-max': 13, 'update-max': 14, return: 19 },
    cpp: { 'fn-entry': 3, 'init-sums': 4, 'init-bounds': 5, loop: 6, compare: 7, 'start-new': 8, extend: 11, 'check-max': 13, 'update-max': 14, return: 19 },
    java: { 'fn-entry': 3, 'init-sums': 4, 'init-bounds': 5, loop: 6, compare: 7, 'start-new': 8, extend: 11, 'check-max': 13, 'update-max': 14, return: 19 },
    python: { 'fn-entry': 1, 'init-sums': 2, 'init-bounds': 3, loop: 4, compare: 5, 'start-new': 6, extend: 9, 'check-max': 10, 'update-max': 11, return: 13 },
  },
  // a new run sets the sum and its start on two lines; a new best sets the sum and both ends on three (Python: two)
  lineSpans: {
    c: { 'start-new': 2, 'update-max': 3 },
    cpp: { 'start-new': 2, 'update-max': 3 },
    java: { 'start-new': 2, 'update-max': 3 },
    python: { 'start-new': 2, 'update-max': 2 },
  },

  generateSteps: generateKadaneSteps,
};
