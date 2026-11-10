import type { AlgorithmDefinition, ExecutionStep, MoveZeroesView } from '../../types/algorithm';
import { validateAlgorithmInput } from '../inputParsing';

/**
 * Move Zeroes (LeetCode 283), in place with two pointers:
 *
 *   slow = 0
 *   for fast = 0 .. n - 1:
 *     if nums[fast] != 0:
 *       if slow != fast: swap(nums[slow], nums[fast])
 *       slow++
 *
 * slow is where the next non-zero value goes: nums[0 .. slow - 1] holds the non-zero values seen so far, in their
 * original order, and nums[slow .. fast - 1] holds only zeroes. fast scans every value once. A non-zero value at fast is
 * swapped into place (unless slow == fast: then it already is there, and no swap is made) and slow moves on. A zero is
 * skipped: fast moves on, slow stays, and the zero ends up after every non-zero value. Order is kept, because the
 * non-zero values are placed in the order fast meets them.
 *
 * O(n) time (fast passes once) and O(1) extra space (two indexes; the array is changed in place).
 */

export const MAX_LENGTH = 10;

function generateMoveZeroesSteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(moveZeroesDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const nums = [...input];
  const n = nums.length;
  const steps: ExecutionStep[] = [];
  let slow: number | null = null;
  let fast: number | null = null;

  type Extra = Partial<Pick<MoveZeroesView, 'examined' | 'pair' | 'swapped' | 'moved' | 'result'>>;
  /** a step with an immutable snapshot of the array: later steps never change an earlier one */
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'cells'>, extra: Extra = {}) => {
    steps.push({
      id: steps.length,
      state: [...nums],
      ...s,
      cells: {
        input: Object.freeze([...input]),
        nums: Object.freeze([...nums]),
        slow,
        fast: fast !== null && fast < n ? fast : null,
        kept: slow ?? 0,
        ...extra,
      },
    });
  };
  const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n },
    message: `moveZeroes(${list(nums)}): move every 0 to the end, keeping the order of the rest`,
    explanation: 'Two pointers walk the array once. slow marks where the next non-zero value goes; fast looks at each value in turn.',
    actionLabel: 'moveZeroes(nums)',
  });

  slow = 0;
  push(
    {
      type: 'assign',
      codeRef: 'init-slow',
      variables: { slow },
      message: 'slow = 0',
      explanation: 'No non-zero value is placed yet: the next one goes to position 0.',
      actionLabel: 'slow = 0',
    },
    { moved: 'slow' }
  );

  for (let f = 0; ; f++) {
    fast = f;
    const go = f < n;
    push(
      {
        type: 'loop-condition',
        codeRef: 'loop-condition',
        variables: { fast: f, n, slow },
        result: go ? 'true' : 'false',
        message: `fast=${f} < n=${n} → ${go ? 'true' : 'false'}${go ? '' : ' — every value is checked'}`,
        explanation: go
          ? `Look at nums[${f}] = ${nums[f]}.`
          : `The first ${slow} position${slow === 1 ? ' holds' : 's hold'} the non-zero values in order; the rest ${n - slow! === 1 ? 'is a zero' : 'are zeroes'}.`,
        actionLabel: go ? `fast = ${f}` : 'Loop done',
      },
      go ? { moved: 'fast' } : {}
    );
    if (!go) break;

    const zero = nums[f] === 0;
    push(
      {
        type: 'condition',
        codeRef: 'check-nonzero',
        variables: { fast: f, [`nums[${f}]`]: nums[f] },
        result: zero ? 'false' : 'true',
        message: `nums[${f}]=${nums[f]} != 0 → ${zero ? 'FALSE — a zero, skip it' : 'TRUE — a non-zero value'}`,
        explanation: zero
          ? `A zero stays where it is for now: slow does not move, so the next non-zero value will take its place.`
          : `A non-zero value goes to position slow = ${slow}.`,
        actionLabel: zero ? 'Zero: skip' : 'Non-zero',
      },
      { examined: { index: f, zero } }
    );

    if (!zero) {
      const same = slow === f;
      push(
        {
          type: 'condition',
          codeRef: 'check-distinct',
          variables: { slow, fast: f },
          result: same ? 'false' : 'true',
          message: `slow=${slow} != fast=${f} → ${same ? 'FALSE — already in place, no swap' : 'TRUE — swap'}`,
          explanation: same
            ? `slow and fast point at the same position: nums[${f}] is already where it belongs, so swapping it with itself would do nothing.`
            : `nums[${slow}] = ${nums[slow!]} is a zero (everything between slow and fast is), and nums[${f}] = ${nums[f]} moves to position ${slow}.`,
          actionLabel: same ? 'No swap needed' : 'Swap needed',
        },
        { examined: { index: f, zero }, pair: { slow: slow!, fast: f, same } }
      );

      if (!same) {
        const s = slow!;
        [nums[s], nums[f]] = [nums[f], nums[s]];
        push(
          {
            type: 'swap',
            codeRef: 'swap',
            variables: { slow: s, fast: f, [`nums[${s}]`]: nums[s], [`nums[${f}]`]: nums[f] },
            message: `swap nums[${s}] ↔ nums[${f}] → ${list(nums)}`,
            explanation: `${nums[s]} moves left to position ${s}, after the non-zero values before it; the zero moves right to position ${f}.`,
            actionLabel: 'Swap',
          },
          { swapped: [s, f] }
        );
      }

      slow = slow! + 1;
      push(
        {
          type: 'increment',
          codeRef: 'advance-slow',
          variables: { slow },
          message: `slow++ → slow=${slow}`,
          explanation: `Positions 0 to ${slow - 1} hold the non-zero values found so far, in order.`,
          actionLabel: 'slow++',
        },
        { moved: 'slow' }
      );
    }

    fast = f + 1;
    push({
      type: 'increment',
      codeRef: 'loop-condition',
      variables: { fast: f + 1, slow },
      message: `fast++ → fast=${f + 1}`,
      explanation: 'Move to the next value.',
      actionLabel: 'fast++',
    });
  }

  fast = null;
  const zeroes = n - slow!;
  const text = `Moved ${zeroes} zero${zeroes === 1 ? '' : 'es'} to the end: ${list(nums)}`;
  push(
    {
      type: 'complete',
      codeRef: 'fn-exit',
      variables: { result: list(nums) },
      message: `Done — ${list(nums)}`,
      explanation: `One pass over ${n} value${n === 1 ? '' : 's'}: O(n) time, O(1) extra space. The non-zero values keep their order.`,
      actionLabel: 'Done',
      outcomeText: text,
    },
    { result: Object.freeze([...nums]) }
  );
  return steps;
}

export const moveZeroesDefinition: AlgorithmDefinition = {
  id: 'array-move-zeroes',
  name: 'Move Zeroes',
  category: 'ARRAYS',
  visual: 'cells',
  subtitle: 'Two pointers, in place: non-zero values move left in order, zeroes end up at the back.',
  description:
    'Moves every 0 of an array to the end, in place, keeping the relative order of the non-zero values (LeetCode 283). Two pointers walk the array once: slow marks where the next non-zero value goes, and fast checks each value in turn. A zero is skipped (only fast moves). A non-zero value is swapped into position slow — unless slow and fast are the same position, where it already is — and slow moves on. Because the non-zero values are placed in the order fast meets them, their order is kept. O(n) time and O(1) extra space: no second array, no sorting, no filtering.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'In-place partitioning that keeps order: one pass, two pointers, swaps only when needed',
  },
  defaultInput: [0, 1, 0, 3, 12],
  inputSpec: {
    minLength: 1,
    maxLength: MAX_LENGTH,
    // Randomize: small values so zeroes show up often
    randomValues: [0, 4],
  },

  code: {
    c: `void moveZeroes(int* nums, int numsSize) {
    int slow = 0;
    for (int fast = 0; fast < numsSize; fast++) {
        if (nums[fast] != 0) {
            if (slow != fast) {
                int temp = nums[slow];
                nums[slow] = nums[fast];
                nums[fast] = temp;
            }
            slow++;
        }
    }
}`,
    cpp: `#include <utility>
#include <vector>
using namespace std;

void moveZeroes(vector<int>& nums) {
    int slow = 0;
    for (int fast = 0; fast < (int)nums.size(); fast++) {
        if (nums[fast] != 0) {
            if (slow != fast) {
                swap(nums[slow], nums[fast]);
            }
            slow++;
        }
    }
}`,
    java: `public class MoveZeroes {
    public static void moveZeroes(int[] nums) {
        int slow = 0;
        for (int fast = 0; fast < nums.length; fast++) {
            if (nums[fast] != 0) {
                if (slow != fast) {
                    int temp = nums[slow];
                    nums[slow] = nums[fast];
                    nums[fast] = temp;
                }
                slow++;
            }
        }
    }
}`,
    python: `def move_zeroes(nums):
    slow = 0
    for fast in range(len(nums)):
        if nums[fast] != 0:
            if slow != fast:
                nums[slow], nums[fast] = nums[fast], nums[slow]
            slow += 1`,
  },

  // the functions return nothing (void in C, C++ and Java; no return in Python): the end is shown on the function's
  // header, as for the sorts
  lineMap: {
    c: { 'fn-entry': 1, 'init-slow': 2, 'loop-condition': 3, 'check-nonzero': 4, 'check-distinct': 5, swap: 6, 'advance-slow': 10, 'fn-exit': 1 },
    cpp: { 'fn-entry': 5, 'init-slow': 6, 'loop-condition': 7, 'check-nonzero': 8, 'check-distinct': 9, swap: 10, 'advance-slow': 12, 'fn-exit': 5 },
    java: { 'fn-entry': 2, 'init-slow': 3, 'loop-condition': 4, 'check-nonzero': 5, 'check-distinct': 6, swap: 7, 'advance-slow': 11, 'fn-exit': 2 },
    python: { 'fn-entry': 1, 'init-slow': 2, 'loop-condition': 3, 'check-nonzero': 4, 'check-distinct': 5, swap: 6, 'advance-slow': 7, 'fn-exit': 1 },
  },

  // C and Java swap through a temporary over three statements: the swap step highlights all three
  lineSpans: {
    c: { swap: 3 },
    java: { swap: 3 },
  },

  generateSteps: generateMoveZeroesSteps,
};
