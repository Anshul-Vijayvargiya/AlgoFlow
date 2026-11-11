import type { AlgorithmDefinition, ExecutionStep, SortColorsOperation, SortColorsView } from '../../types/algorithm';
import { validateAlgorithmInput } from '../inputParsing';

/**
 * Sort Colors (LeetCode 75) with the Dutch National Flag algorithm: three pointers, one pass, in place.
 *
 *   low = 0; mid = 0; high = n - 1
 *   while mid <= high:
 *     if nums[mid] == 0:      swap(nums[low], nums[mid]); low++; mid++
 *     else if nums[mid] == 1: mid++
 *     else:                   swap(nums[mid], nums[high]); high--
 *
 * low is where the next 0 goes, mid is the value being checked and high is where the next 2 goes. At every check of the
 * loop condition nums[0 .. low - 1] holds only 0s, nums[low .. mid - 1] only 1s, nums[high + 1 .. n - 1] only 2s, and
 * nums[mid .. high] is not checked yet. After a 2 is swapped to the back, mid does NOT move: the value that came from
 * high has not been checked. After a 0 is swapped to the front, mid does move: the value that came from low is a 1 (or
 * the 0 itself when low == mid).
 *
 * O(n) time (each pass of the loop moves mid up or high down) and O(1) extra space (three indexes, swaps in place).
 * No sorting routine and no second array.
 */

export const MAX_LENGTH = 10;

type Pointer = 'low' | 'mid' | 'high';

function generateSortColorsSteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(sortColorsDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const nums = [...input];
  const n = nums.length;
  const steps: ExecutionStep[] = [];
  let low: number | null = null;
  let mid: number | null = null;
  let high: number | null = null;
  // what is known about the array, updated at the moment a value is placed (a swap) or confirmed (mid++ past a 1):
  // [0, zerosEnd) holds 0s, [zerosEnd, checkedEnd) holds 1s, [checkedEnd, twosStart) is not checked, [twosStart, n) holds 2s
  let zerosEnd = 0;
  let checkedEnd = 0;
  let twosStart = n;

  type Extra = { current?: SortColorsView['current']; swapped?: readonly [number, number]; moved?: readonly Pointer[]; result?: readonly number[] };
  /** a step with an immutable snapshot: the view and everything in it is frozen, and shares nothing with other steps */
  const push = (operation: SortColorsOperation, s: Omit<ExecutionStep, 'id' | 'state' | 'sortColors'>, extra: Extra = {}) => {
    const view: SortColorsView = {
      input: Object.freeze([...input]),
      nums: Object.freeze([...nums]),
      low,
      mid,
      high,
      operation,
      regions: Object.freeze({
        zeros: Object.freeze([0, zerosEnd] as const),
        ones: Object.freeze([zerosEnd, checkedEnd] as const),
        unknown: Object.freeze([checkedEnd, twosStart] as const),
        twos: Object.freeze([twosStart, n] as const),
      }),
      ...(extra.current ? { current: Object.freeze({ ...extra.current }) } : {}),
      ...(extra.swapped ? { swapped: Object.freeze([extra.swapped[0], extra.swapped[1]] as const) } : {}),
      ...(extra.moved ? { moved: Object.freeze([...extra.moved]) } : {}),
      ...(extra.result ? { result: Object.freeze([...extra.result]) } : {}),
    };
    steps.push({ id: steps.length, state: [...nums], ...s, sortColors: Object.freeze(view) });
  };
  const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

  push('start', {
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n },
    message: `sortColors(${list(nums)}): sort the 0s, 1s and 2s in place, in one pass`,
    explanation: 'Three pointers split the array into four parts: the 0s at the front, then the 1s, then the values not checked yet, then the 2s at the back.',
    actionLabel: 'sortColors(nums)',
  });

  low = 0;
  push(
    'init',
    {
      type: 'assign',
      codeRef: 'init-low',
      variables: { low },
      message: 'low = 0',
      explanation: 'low is where the next 0 goes. No 0 is placed yet.',
      actionLabel: 'low = 0',
    },
    { moved: ['low'] }
  );
  mid = 0;
  push(
    'init',
    {
      type: 'assign',
      codeRef: 'init-mid',
      variables: { mid },
      message: 'mid = 0',
      explanation: 'mid is the value being checked. It starts at the first value.',
      actionLabel: 'mid = 0',
    },
    { moved: ['mid'] }
  );
  high = n - 1;
  push(
    'init',
    {
      type: 'assign',
      codeRef: 'init-high',
      variables: { high, n },
      message: `high = n - 1 = ${high}`,
      explanation: 'high is where the next 2 goes. No 2 is placed yet.',
      actionLabel: `high = ${high}`,
    },
    { moved: ['high'] }
  );

  for (;;) {
    const go: boolean = mid <= high;
    push('loop', {
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { low, mid, high },
      result: go ? 'true' : 'false',
      message: `mid=${mid} <= high=${high} → ${go ? 'true' : 'false'}${go ? '' : ' — every value is checked'}`,
      explanation: go ? `Look at nums[${mid}] = ${nums[mid]}.` : 'mid has passed high: nothing is left between the 1s and the 2s.',
      actionLabel: go ? `mid = ${mid}` : 'Loop done',
    });
    if (!go) break;

    const m: number = mid;
    const value = nums[m];
    const current = { index: m, value };
    push(
      'check',
      {
        type: 'condition',
        codeRef: 'check-zero',
        variables: { mid: m, [`nums[${m}]`]: value },
        result: value === 0 ? 'true' : 'false',
        message: `nums[${m}]=${value} == 0 → ${value === 0 ? 'TRUE — a 0 goes to low' : 'FALSE'}`,
        explanation: value === 0 ? `A 0 belongs at the front: swap it with nums[low = ${low}].` : `Not a 0. Is it a 1?`,
        actionLabel: value === 0 ? 'It is a 0' : 'Not a 0',
      },
      { current }
    );

    if (value === 0) {
      const l: number = low;
      [nums[l], nums[m]] = [nums[m], nums[l]];
      // the 0 is now at low; the value that came back to mid is a 1 (or, when low == mid, the 0 itself)
      zerosEnd = l + 1;
      checkedEnd = m + 1;
      push(
        'swap-low',
        {
          type: 'swap',
          codeRef: 'swap-low',
          variables: { low: l, mid: m, [`nums[${l}]`]: nums[l], ...(l === m ? {} : { [`nums[${m}]`]: nums[m] }) },
          message: `swap nums[low=${l}] ↔ nums[mid=${m}] → ${list(nums)}`,
          explanation:
            l === m
              ? `low and mid are the same position: the 0 is already where it belongs, and swapping it with itself changes nothing.`
              : `The 0 moves to position ${l}, after the 0s before it. The 1 that was there moves to position ${m}.`,
          actionLabel: 'Swap low, mid',
        },
        { swapped: [l, m] }
      );
      low = l + 1;
      push(
        'advance-low',
        {
          type: 'increment',
          codeRef: 'advance-low',
          variables: { low },
          message: `low++ → low=${low}`,
          explanation: `Positions 0 to ${l} hold 0s. The next 0 goes to position ${low}.`,
          actionLabel: 'low++',
        },
        { moved: ['low'] }
      );
      mid = m + 1;
      push(
        'advance-mid',
        {
          type: 'increment',
          codeRef: 'advance-mid-zero',
          variables: { mid },
          message: `mid++ → mid=${mid}`,
          explanation: 'The value that came from low was already checked (it is a 1, or the 0 itself), so mid moves on.',
          actionLabel: 'mid++',
        },
        { moved: ['mid'] }
      );
      continue;
    }

    push(
      'check',
      {
        type: 'condition',
        codeRef: 'check-one',
        variables: { mid: m, [`nums[${m}]`]: value },
        result: value === 1 ? 'true' : 'false',
        message: `nums[${m}]=${value} == 1 → ${value === 1 ? 'TRUE — a 1 stays where it is' : 'FALSE — it is a 2'}`,
        explanation: value === 1 ? 'A 1 belongs in the middle, which is where it is: only mid moves.' : `A 2 belongs at the back: swap it with nums[high = ${high}].`,
        actionLabel: value === 1 ? 'It is a 1' : 'It is a 2',
      },
      { current }
    );

    if (value === 1) {
      mid = m + 1;
      checkedEnd = m + 1;
      push(
        'advance-mid',
        {
          type: 'increment',
          codeRef: 'advance-mid-one',
          variables: { mid },
          message: `mid++ → mid=${mid}`,
          explanation: `Positions ${low} to ${m} hold 1s.`,
          actionLabel: 'mid++',
        },
        { moved: ['mid'] }
      );
      continue;
    }

    const h: number = high;
    [nums[m], nums[h]] = [nums[h], nums[m]];
    // the 2 is now at high; the value that came to mid is not checked yet
    twosStart = h;
    push(
      'swap-high',
      {
        type: 'swap',
        codeRef: 'swap-high',
        variables: { mid: m, high: h, [`nums[${h}]`]: nums[h], ...(m === h ? {} : { [`nums[${m}]`]: nums[m] }) },
        message: `swap nums[mid=${m}] ↔ nums[high=${h}] → ${list(nums)}`,
        explanation:
          m === h
            ? `mid and high are the same position: the 2 is already where it belongs, and swapping it with itself changes nothing.`
            : `The 2 moves to position ${h}, before the 2s after it. The ${nums[m]} that was there moves to position ${m}, and is not checked yet.`,
        actionLabel: 'Swap mid, high',
      },
      { swapped: [m, h] }
    );
    high = h - 1;
    push(
      'retreat-high',
      {
        type: 'decrement',
        codeRef: 'retreat-high',
        variables: { high, mid: m },
        message: `high-- → high=${high}; mid stays at ${m}`,
        explanation:
          m === h
            ? `Positions ${h} to ${n - 1} hold 2s. mid does not move.`
            : `Positions ${h} to ${n - 1} hold 2s. mid does not move: nums[${m}] = ${nums[m]} came from the back and has not been checked.`,
        actionLabel: 'high--',
      },
      { moved: ['high'] }
    );
  }

  const count = (v: number) => nums.filter(x => x === v).length;
  const text = `Sorted in one pass: ${list(nums)}`;
  push(
    'done',
    {
      type: 'complete',
      codeRef: 'fn-exit',
      variables: { result: list(nums) },
      message: `Done — ${list(nums)}`,
      explanation: `${count(0)} zero${count(0) === 1 ? '' : 's'}, ${count(1)} one${count(1) === 1 ? '' : 's'} and ${count(2)} two${count(2) === 1 ? '' : 's'}, in order. One pass over ${n} value${n === 1 ? '' : 's'}: O(n) time, O(1) extra space.`,
      actionLabel: 'Done',
      outcomeText: text,
    },
    { result: nums }
  );
  return steps;
}

export const sortColorsDefinition: AlgorithmDefinition = {
  id: 'array-sort-colors',
  name: 'Sort Colors',
  category: 'ARRAYS',
  visual: 'flag-cells',
  subtitle: 'Dutch National Flag: three pointers sort the 0s, 1s and 2s in place, in one pass.',
  description:
    'Sorts an array of 0s, 1s and 2s in place, in one pass, without a sorting routine (LeetCode 75), using the Dutch National Flag algorithm. Three pointers split the array into four parts: the 0s before low, the 1s from low to mid, the values not checked yet from mid to high, and the 2s after high. Each pass of the loop looks at nums[mid]. A 0 is swapped with nums[low], and both low and mid move right. A 1 is already in place: only mid moves. A 2 is swapped with nums[high] and high moves left — mid stays, because the value that came from the back has not been checked yet. The loop ends when mid passes high. O(n) time and O(1) extra space.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'Sorting three distinct values (or partitioning around a pivot) in place, in one pass',
  },
  defaultInput: [2, 0, 2, 1, 1, 0],
  inputSpec: {
    minLength: 1,
    maxLength: MAX_LENGTH,
    minValue: 0,
    maxValue: 2,
    // Randomize: only the three colours
    randomValues: [0, 2],
  },

  code: {
    c: `void sortColors(int* nums, int numsSize) {
    int low = 0;
    int mid = 0;
    int high = numsSize - 1;
    while (mid <= high) {
        if (nums[mid] == 0) {
            int temp = nums[low];
            nums[low] = nums[mid];
            nums[mid] = temp;
            low++;
            mid++;
        } else if (nums[mid] == 1) {
            mid++;
        } else {
            int temp = nums[mid];
            nums[mid] = nums[high];
            nums[high] = temp;
            high--;
        }
    }
}`,
    cpp: `#include <utility>
#include <vector>
using namespace std;

void sortColors(vector<int>& nums) {
    int low = 0;
    int mid = 0;
    int high = (int)nums.size() - 1;
    while (mid <= high) {
        if (nums[mid] == 0) {
            swap(nums[low], nums[mid]);
            low++;
            mid++;
        } else if (nums[mid] == 1) {
            mid++;
        } else {
            swap(nums[mid], nums[high]);
            high--;
        }
    }
}`,
    java: `public class SortColors {
    public static void sortColors(int[] nums) {
        int low = 0;
        int mid = 0;
        int high = nums.length - 1;
        while (mid <= high) {
            if (nums[mid] == 0) {
                int temp = nums[low];
                nums[low] = nums[mid];
                nums[mid] = temp;
                low++;
                mid++;
            } else if (nums[mid] == 1) {
                mid++;
            } else {
                int temp = nums[mid];
                nums[mid] = nums[high];
                nums[high] = temp;
                high--;
            }
        }
    }
}`,
    python: `def sort_colors(nums):
    low = 0
    mid = 0
    high = len(nums) - 1
    while mid <= high:
        if nums[mid] == 0:
            nums[low], nums[mid] = nums[mid], nums[low]
            low += 1
            mid += 1
        elif nums[mid] == 1:
            mid += 1
        else:
            nums[mid], nums[high] = nums[high], nums[mid]
            high -= 1`,
  },

  // the functions return nothing (void in C, C++ and Java; no return in Python): the end is shown on the function's
  // header, as for Move Zeroes and the sorts
  lineMap: {
    c: {
      'fn-entry': 1, 'init-low': 2, 'init-mid': 3, 'init-high': 4, 'loop-condition': 5, 'check-zero': 6, 'swap-low': 7, 'advance-low': 10,
      'advance-mid-zero': 11, 'check-one': 12, 'advance-mid-one': 13, 'swap-high': 15, 'retreat-high': 18, 'fn-exit': 1,
    },
    cpp: {
      'fn-entry': 5, 'init-low': 6, 'init-mid': 7, 'init-high': 8, 'loop-condition': 9, 'check-zero': 10, 'swap-low': 11, 'advance-low': 12,
      'advance-mid-zero': 13, 'check-one': 14, 'advance-mid-one': 15, 'swap-high': 17, 'retreat-high': 18, 'fn-exit': 5,
    },
    java: {
      'fn-entry': 2, 'init-low': 3, 'init-mid': 4, 'init-high': 5, 'loop-condition': 6, 'check-zero': 7, 'swap-low': 8, 'advance-low': 11,
      'advance-mid-zero': 12, 'check-one': 13, 'advance-mid-one': 14, 'swap-high': 16, 'retreat-high': 19, 'fn-exit': 2,
    },
    python: {
      'fn-entry': 1, 'init-low': 2, 'init-mid': 3, 'init-high': 4, 'loop-condition': 5, 'check-zero': 6, 'swap-low': 7, 'advance-low': 8,
      'advance-mid-zero': 9, 'check-one': 10, 'advance-mid-one': 11, 'swap-high': 13, 'retreat-high': 14, 'fn-exit': 1,
    },
  },

  // C and Java swap through a temporary over three statements: each swap step highlights all three
  lineSpans: {
    c: { 'swap-low': 3, 'swap-high': 3 },
    java: { 'swap-low': 3, 'swap-high': 3 },
  },

  generateSteps: generateSortColorsSteps,
};
