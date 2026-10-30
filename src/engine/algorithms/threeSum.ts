import type { AlgorithmDefinition, ExecutionStep, NumberCell } from '../../types/algorithm';

/**
 * 3Sum (LeetCode 15): every unique triplet [nums[i], nums[left], nums[right]] that sums to zero. Sort a copy, fix each
 * i in turn and close in on the rest with two pointers: left = i + 1, right = n - 1; a sum below zero needs a larger
 * value (left++), above zero a smaller one (right--). Duplicates are skipped at both levels: a fixed value equal to the
 * previous one, and, after a triplet is recorded, left and right values equal to the ones just used. Once nums[i] > 0
 * every remaining value is positive, so no later i can reach zero. O(n²) time; O(1) extra space besides the copy and
 * the output.
 *
 * The bars are the sorted copy (from the sort step on); i, left and right are drawn under them, the triplet being
 * evaluated is highlighted, and every triplet found so far is listed beside the bars as its own row.
 */
function generateThreeSumSteps(input: number[]): ExecutionStep[] {
  if (input.some(v => !Number.isInteger(v))) throw new TypeError('3Sum: every value must be a whole number.');
  const nums = [...input];
  const n = nums.length;
  const steps: ExecutionStep[] = [];

  const triplets: [number, number, number][] = [];
  /** the sorted-array positions of each recorded triplet (only to light up the bars at the end) */
  const used = new Set<number>();
  let i: number | null = null;
  let left: number | null = null;
  let right: number | null = null;
  let sum: number | null = null;

  type Roles = Partial<Record<'i' | 'left' | 'right' | 'sum' | 'found', NumberCell['role']>>;
  // i may be past the array once the outer loop ends; left and right always stay inside it (left only moves while left < right ≤ n - 1)
  const at = (k: number | null) => (k !== null && k >= 0 && k < n ? nums[k] : null);
  const cards = (roles: Roles = {}): NumberCell[] => [
    { name: 'nums[i]', value: at(i), role: roles.i },
    { name: 'nums[left]', value: at(left), role: roles.left },
    { name: 'nums[right]', value: at(right), role: roles.right },
    { name: 'sum', value: sum, role: roles.sum },
    { name: 'found', value: triplets.length, role: roles.found },
  ];
  const fmt = (t: readonly number[]) => `[${t.join(', ')}]`;
  /** every triplet recorded so far, one row each */
  const rows = () => triplets.map((t, k) => ({ name: `triplet-${k}`, label: `result[${k}]`, values: [...t] }));
  /** i, left and right as positions in the array (left / right only while the pointers are set) */
  const where = () => ({
    pointers: { ...(i !== null ? { i } : {}), ...(left !== null ? { left } : {}), ...(right !== null ? { right } : {}) },
    // nothing before i can be used again; while the pointers are set, nothing after right is left to try either
    ...(i !== null && i < n ? { extraInfo: { subRange: [i, right !== null ? right : n - 1] as [number, number] } } : {}),
  });
  const vars = (extra: Record<string, unknown> = {}) => ({
    n,
    ...(i !== null ? { i } : {}),
    ...(left !== null ? { left } : {}),
    ...(right !== null ? { right } : {}),
    found: triplets.length,
    ...extra,
  });
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => {
    // the working range always takes in the bars the step looks at (nums[i - 1], nums[right + 1]), so none is dimmed
    const range = s.extraInfo?.subRange;
    const extraInfo = range && s.indices?.length ? { subRange: [Math.min(range[0], ...s.indices), Math.max(range[1], ...s.indices)] as [number, number] } : s.extraInfo;
    steps.push({ id: steps.length, state: [...nums], buffers: rows(), ...s, ...(extraInfo ? { extraInfo } : {}) });
  };

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n },
    tracker: cards(),
    message: `3Sum: find every unique triplet of ${n} value${n === 1 ? '' : 's'} that sums to 0`,
    explanation:
      'Sort the values, then fix one value at a time and search the rest with two pointers moving towards each other. Equal values are skipped so no triplet is reported twice.',
    actionLabel: 'Initialize',
  });

  push({
    type: 'assign',
    codeRef: 'copy',
    variables: { n },
    tracker: cards(),
    message: `nums = a copy of the input: ${fmt(nums)}`,
    explanation: "The sort works on this copy, so the caller's array keeps its order.",
    actionLabel: 'Copy input',
  });

  const before = [...nums];
  nums.sort((a, b) => a - b);
  const changed = before.some((v, k) => v !== nums[k]);
  push({
    type: 'assign',
    codeRef: 'sort',
    variables: { n },
    indices: changed ? before.map((_, k) => k).filter(k => before[k] !== nums[k]) : [],
    tracker: cards(),
    message: `sort(nums) → ${fmt(nums)}`,
    explanation: changed
      ? 'Ascending order lets the pointers steer the sum: moving left right makes it larger, moving right left makes it smaller. Equal values are now next to each other, which makes duplicates easy to skip.'
      : 'The values were already in ascending order. Sorted, the pointers can steer the sum, and equal values sit next to each other.',
    actionLabel: 'Sort',
  });

  push({
    type: 'assign',
    codeRef: 'init-result',
    variables: { n },
    tracker: cards(),
    message: 'result = []',
    explanation: 'The triplets found go here, each one in ascending order.',
    actionLabel: 'Init result',
  });

  for (i = 0; ; i++) {
    left = null;
    right = null;
    sum = null;
    const inLoop = i < n - 2;
    push({
      type: 'loop-condition',
      codeRef: 'outer-loop',
      variables: vars(),
      ...where(),
      indices: inLoop ? [i] : [],
      tracker: cards(),
      result: inLoop ? 'true' : 'false',
      message: `${i > 0 ? `i++ → i = ${i};  ` : ''}i < n - 2?  ${i} < ${n - 2} → ${inLoop}`,
      explanation: inLoop
        ? `Fix nums[${i}] = ${nums[i]} as the first value of the triplet; the other two come from the values after it.`
        : n < 3
          ? `A triplet needs three values; this array has ${n}.`
          : 'Fewer than three values remain after i, so no new triplet can start here. The search is over.',
      actionLabel: inLoop ? `i = ${i}` : 'Loop ends',
    });
    if (!inLoop) break;

    const duplicate = i > 0 && nums[i] === nums[i - 1];
    push({
      type: 'condition',
      codeRef: 'check-dup-i',
      variables: vars({ 'nums[i]': nums[i], ...(i > 0 ? { 'nums[i - 1]': nums[i - 1] } : {}) }),
      ...where(),
      indices: i > 0 ? [i - 1, i] : [i],
      ...(i > 0 ? { comparedValues: { val1: nums[i], val2: nums[i - 1] } } : {}),
      tracker: cards({ i: 'current' }),
      result: duplicate ? 'true' : 'false',
      message:
        i === 0
          ? 'i > 0 and nums[i] == nums[i - 1]?  i = 0 → false'
          : `i > 0 and nums[i] == nums[i - 1]?  ${nums[i]} == ${nums[i - 1]} → ${duplicate}`,
      explanation:
        i === 0
          ? 'The first value has no previous value to repeat.'
          : duplicate
            ? `${nums[i]} was already fixed at index ${i - 1}: every triplet starting with it has been found, so this one would only repeat them.`
            : `${nums[i]} differs from the previous fixed value ${nums[i - 1]}, so it can start new triplets.`,
      actionLabel: duplicate ? 'Duplicate' : 'New value',
    });

    if (duplicate) {
      push({
        type: 'increment',
        codeRef: 'skip-i',
        variables: vars(),
        ...where(),
        indices: [i],
        tracker: cards({ i: 'current' }),
        message: `continue — skip the repeated ${nums[i]}`,
        explanation: 'Go straight on to the next fixed index.',
        actionLabel: 'Skip i',
      });
      continue;
    }

    const positive = nums[i] > 0;
    push({
      type: 'condition',
      codeRef: 'check-positive',
      variables: vars({ 'nums[i]': nums[i] }),
      ...where(),
      indices: [i],
      tracker: cards({ i: 'current' }),
      result: positive ? 'true' : 'false',
      message: `nums[i] > 0?  ${nums[i]} > 0 → ${positive}`,
      explanation: positive
        ? `${nums[i]} is the smallest value left and it is positive, so any three of the remaining values sum to more than 0.`
        : `${nums[i]} is not positive, so larger values after it may still bring the sum back to 0.`,
      actionLabel: positive ? 'Positive' : 'Not positive',
    });

    if (positive) {
      push({
        type: 'loop-condition',
        codeRef: 'stop',
        variables: vars(),
        ...where(),
        indices: [i],
        tracker: cards(),
        result: 'false',
        message: 'break — no triplet can start at or after this index',
        explanation: 'The values are ascending, so every later fixed value is positive too. The loop stops early.',
        actionLabel: 'Break',
      });
      break;
    }

    left = i + 1;
    right = n - 1;
    push({
      type: 'assign',
      codeRef: 'init-pointers',
      variables: vars(),
      ...where(),
      indices: [i, left, right],
      tracker: cards({ left: 'changed', right: 'changed' }),
      message: `left = i + 1 = ${left}, right = n - 1 = ${right}`,
      explanation: `Search the values after index ${i} from both ends: nums[${left}] = ${nums[left]} is the smallest, nums[${right}] = ${nums[right]} the largest.`,
      actionLabel: 'Init pointers',
    });

    for (;;) {
      const loopTrue = left < right;
      sum = null;
      push({
        type: 'loop-condition',
        codeRef: 'inner-loop',
        variables: vars(),
        ...where(),
        indices: [...new Set([i, left, right])].filter(k => k < n),
        tracker: cards(),
        result: loopTrue ? 'true' : 'false',
        message: `left < right?  ${left} < ${right} → ${loopTrue}`,
        explanation: loopTrue
          ? `There is still a pair to try with nums[${i}] = ${nums[i]}.`
          : `The pointers have met: every pair after index ${i} has been ruled in or out.`,
        actionLabel: loopTrue ? 'While TRUE' : 'While FALSE',
      });
      if (!loopTrue) break;

      const [a, b, c] = [nums[i], nums[left], nums[right]];
      sum = a + b + c;
      push({
        type: 'assign',
        codeRef: 'calc-sum',
        variables: vars({ 'nums[i]': a, 'nums[left]': b, 'nums[right]': c, sum }),
        ...where(),
        indices: [i, left, right],
        tracker: cards({ i: 'current', left: 'current', right: 'current', sum: 'changed' }),
        message: `sum = nums[${i}] + nums[${left}] + nums[${right}] = ${a} + ${b} + ${c} = ${sum}`,
        explanation: `The triplet [${a}, ${b}, ${c}] is compared with 0 next.`,
        actionLabel: 'Compute sum',
      });

      const zero = sum === 0;
      push({
        type: 'condition',
        codeRef: 'check-zero',
        variables: vars({ sum }),
        ...where(),
        indices: [i, left, right],
        comparedValues: { val1: sum, val2: 0 },
        tracker: cards({ sum: 'current' }),
        result: zero ? 'true' : 'false',
        message: `sum == 0?  ${sum} == 0 → ${zero}`,
        explanation: zero ? `[${a}, ${b}, ${c}] sums to 0: a triplet.` : 'Not a triplet; the sign of the sum says which pointer to move.',
        actionLabel: zero ? 'Sum is 0' : 'Not 0',
      });

      if (zero) {
        triplets.push([a, b, c]);
        used.add(i).add(left).add(right);
        push({
          type: 'assign',
          codeRef: 'record',
          variables: vars({ triplet: fmt([a, b, c]) }),
          ...where(),
          indices: [i, left, right],
          tracker: cards({ found: 'changed' }),
          message: `result.append([${a}, ${b}, ${c}])  (${triplets.length} found)`,
          explanation: `Recorded as result[${triplets.length - 1}]. Both pointers now move inward, past this pair's values.`,
          actionLabel: 'Record triplet',
        });

        left++;
        push({
          type: 'increment',
          codeRef: 'found-left',
          variables: vars(),
          ...where(),
          indices: [left],
          tracker: cards({ left: 'changed' }),
          message: `left++ → left = ${left}`,
          explanation: `nums[${left - 1}] = ${b} has been used with nums[${i}] = ${a}; move on.`,
          actionLabel: 'left++',
        });

        right--;
        push({
          type: 'decrement',
          codeRef: 'found-right',
          variables: vars(),
          ...where(),
          indices: [right],
          tracker: cards({ right: 'changed' }),
          message: `right-- → right = ${right}`,
          explanation: `With ${a} and ${b} fixed, only ${c} completes the triplet, so nums[${right + 1}] = ${c} is done too.`,
          actionLabel: 'right--',
        });

        for (;;) {
          const repeat = left < right && nums[left] === nums[left - 1];
          push({
            type: 'loop-condition',
            codeRef: 'skip-left-check',
            variables: vars({ ...(left < right ? { 'nums[left]': nums[left], 'nums[left - 1]': nums[left - 1] } : {}) }),
            ...where(),
            indices: left < right ? [left - 1, left] : [],
            tracker: cards(),
            result: repeat ? 'true' : 'false',
            message:
              left < right
                ? `left < right and nums[left] == nums[left - 1]?  ${nums[left]} == ${nums[left - 1]} → ${repeat}`
                : `left < right and …?  ${left} < ${right} → false`,
            explanation: repeat
              ? `nums[${left}] = ${nums[left]} repeats the value just used, so it would give the same triplet again.`
              : left < right
                ? `nums[${left}] = ${nums[left]} is a new value for left.`
                : 'The pointers have met; nothing is left to skip.',
            actionLabel: repeat ? 'Repeat' : 'No repeat',
          });
          if (!repeat) break;
          left++;
          push({
            type: 'increment',
            codeRef: 'skip-left',
            variables: vars(),
            ...where(),
            indices: [left],
            tracker: cards({ left: 'changed' }),
            message: `left++ → left = ${left}  (skip duplicate ${nums[left - 1]})`,
            explanation: `Skip the repeated ${nums[left - 1]}.`,
            actionLabel: 'Skip left',
          });
        }

        for (;;) {
          const repeat = left < right && nums[right] === nums[right + 1];
          push({
            type: 'loop-condition',
            codeRef: 'skip-right-check',
            variables: vars({ ...(left < right ? { 'nums[right]': nums[right], 'nums[right + 1]': nums[right + 1] } : {}) }),
            ...where(),
            indices: left < right ? [right, right + 1] : [],
            tracker: cards(),
            result: repeat ? 'true' : 'false',
            message:
              left < right
                ? `left < right and nums[right] == nums[right + 1]?  ${nums[right]} == ${nums[right + 1]} → ${repeat}`
                : `left < right and …?  ${left} < ${right} → false`,
            explanation: repeat
              ? `nums[${right}] = ${nums[right]} repeats the value just used, so it would give the same triplet again.`
              : left < right
                ? `nums[${right}] = ${nums[right]} is a new value for right.`
                : 'The pointers have met; nothing is left to skip.',
            actionLabel: repeat ? 'Repeat' : 'No repeat',
          });
          if (!repeat) break;
          right--;
          push({
            type: 'decrement',
            codeRef: 'skip-right',
            variables: vars(),
            ...where(),
            indices: [right],
            tracker: cards({ right: 'changed' }),
            message: `right-- → right = ${right}  (skip duplicate ${nums[right + 1]})`,
            explanation: `Skip the repeated ${nums[right + 1]}.`,
            actionLabel: 'Skip right',
          });
        }
        continue;
      }

      const less = sum < 0;
      push({
        type: 'condition',
        codeRef: 'check-less',
        variables: vars({ sum }),
        ...where(),
        indices: [i, left, right],
        comparedValues: { val1: sum, val2: 0 },
        tracker: cards({ sum: 'current' }),
        result: less ? 'true' : 'false',
        message: `sum < 0?  ${sum} < 0 → ${less ? 'true — move left' : 'false — move right'}`,
        explanation: less
          ? `${sum} is too small. A larger value at left (the array is ascending) raises the sum.`
          : `${sum} is too large. A smaller value at right lowers the sum.`,
        actionLabel: less ? 'Too small' : 'Too large',
      });

      if (less) {
        left++;
        push({
          type: 'increment',
          codeRef: 'move-left',
          variables: vars(),
          ...where(),
          indices: [left],
          tracker: cards({ left: 'changed' }),
          message: `left++ → left = ${left}`,
          explanation: `Every pair using nums[${left - 1}] = ${b} with this right value is too small, so drop it.`,
          actionLabel: 'left++',
        });
      } else {
        right--;
        push({
          type: 'decrement',
          codeRef: 'move-right',
          variables: vars(),
          ...where(),
          indices: [right],
          tracker: cards({ right: 'changed' }),
          message: `right-- → right = ${right}`,
          explanation: `Every pair using nums[${right + 1}] = ${c} with this left value is too large, so drop it.`,
          actionLabel: 'right--',
        });
      }
    }
  }

  left = null;
  right = null;
  sum = null;
  const any = triplets.length > 0;
  const list = triplets.map(fmt).join(', ');
  const usedIndices = [...used].sort((x, y) => x - y);
  push({
    type: any ? 'found' : 'not-found',
    codeRef: 'return',
    variables: { n, found: triplets.length },
    indices: usedIndices,
    sortedIndices: usedIndices,
    tracker: cards({ found: 'current' }),
    message: any ? `Return ${triplets.length} triplet${triplets.length === 1 ? '' : 's'}: [${list}]` : 'Return [] — no triplet sums to 0',
    explanation: any
      ? `Each triplet sums to 0 and none is repeated. The highlighted bars are the sorted values they use.`
      : n < 3
        ? `A triplet needs three values; this array has ${n}.`
        : 'No three values of the array sum to 0.',
    actionLabel: any ? 'Triplets found' : 'None found',
  });

  push({
    type: 'complete',
    codeRef: 'return',
    variables: { n, found: triplets.length },
    sortedIndices: usedIndices,
    tracker: cards(),
    outcomeText: any ? `${triplets.length} triplet${triplets.length === 1 ? '' : 's'} sum${triplets.length === 1 ? 's' : ''} to 0: [${list}]` : 'No triplet sums to 0',
    message: any ? `Done — [${list}]` : 'Done — no triplet',
    explanation: `Sorting takes O(n log n); each fixed value is followed by one two-pointer pass, O(n), so O(n²) in all. Besides the sorted copy and the result, only three indices are kept.`,
    actionLabel: 'Complete',
  });

  return steps;
}

export const threeSumDefinition: AlgorithmDefinition = {
  id: 'three-sum',
  name: '3Sum',
  category: 'ARRAYS',
  subtitle: 'Sort, fix one value, and close in on the other two with two pointers.',
  description:
    '3Sum (LeetCode 15) returns every unique triplet of values that sums to zero, using three different indices. Sorting a copy lets each fixed value nums[i] be paired by two pointers moving towards each other, steered by the sign of the sum; equal values are skipped so no triplet appears twice, and the search stops once nums[i] is positive.',
  complexity: {
    best: 'O(n log n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(n)',
    bestFor: 'All zero-sum (or target-sum) triplets without duplicates',
  },
  defaultInput: [-1, 0, 1, 2, -1, -4],
  // Randomize mixes negative and positive values so that triplets exist
  inputSpec: { randomValues: [-9, 9] },
  positionPointers: ['i', 'left', 'right'],

  code: {
    c: `#include <stdlib.h>
#include <string.h>

typedef struct { int a, b, c; } Triplet;

static int ascending(const void *x, const void *y) {
    int a = *(const int *)x, b = *(const int *)y;
    return (a > b) - (a < b);
}

/* writes the triplets to out (room for n * n is always enough); returns how many */
int threeSum(const int input[], int n, Triplet out[]) {
    int *nums = malloc((n > 0 ? n : 1) * sizeof(int));
    memcpy(nums, input, n * sizeof(int));
    qsort(nums, n, sizeof(int), ascending);
    int count = 0;
    for (int i = 0; i < n - 2; i++) {
        if (i > 0 && nums[i] == nums[i - 1]) continue;
        if (nums[i] > 0) break;
        int left = i + 1, right = n - 1;
        while (left < right) {
            long long sum = (long long)nums[i] + nums[left] + nums[right];
            if (sum == 0) {
                out[count++] = (Triplet){ nums[i], nums[left], nums[right] };
                left++;
                right--;
                while (left < right && nums[left] == nums[left - 1]) left++;
                while (left < right && nums[right] == nums[right + 1]) right--;
            } else if (sum < 0) {
                left++;
            } else {
                right--;
            }
        }
    }
    free(nums);
    return count;
}`,
    cpp: `vector<vector<int>> threeSum(const vector<int>& input) {
    vector<int> nums(input);  // a copy: the caller's array is unchanged
    sort(nums.begin(), nums.end());
    int n = nums.size();
    vector<vector<int>> result;
    for (int i = 0; i < n - 2; i++) {
        if (i > 0 && nums[i] == nums[i - 1]) continue;
        if (nums[i] > 0) break;
        int left = i + 1, right = n - 1;
        while (left < right) {
            long long sum = (long long)nums[i] + nums[left] + nums[right];
            if (sum == 0) {
                result.push_back({nums[i], nums[left], nums[right]});
                left++;
                right--;
                while (left < right && nums[left] == nums[left - 1]) left++;
                while (left < right && nums[right] == nums[right + 1]) right--;
            } else if (sum < 0) {
                left++;
            } else {
                right--;
            }
        }
    }
    return result;
}`,
    java: `import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class ThreeSum {
    public static List<List<Integer>> threeSum(int[] input) {
        int[] nums = input.clone();  // a copy: the caller's array is unchanged
        Arrays.sort(nums);
        int n = nums.length;
        List<List<Integer>> result = new ArrayList<>();
        for (int i = 0; i < n - 2; i++) {
            if (i > 0 && nums[i] == nums[i - 1]) continue;
            if (nums[i] > 0) break;
            int left = i + 1, right = n - 1;
            while (left < right) {
                long sum = (long) nums[i] + nums[left] + nums[right];
                if (sum == 0) {
                    result.add(Arrays.asList(nums[i], nums[left], nums[right]));
                    left++;
                    right--;
                    while (left < right && nums[left] == nums[left - 1]) left++;
                    while (left < right && nums[right] == nums[right + 1]) right--;
                } else if (sum < 0) {
                    left++;
                } else {
                    right--;
                }
            }
        }
        return result;
    }
}`,
    python: `def three_sum(nums):
    nums = list(nums)  # a copy: the caller's list is unchanged
    nums.sort()
    n = len(nums)
    result = []
    for i in range(n - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue
        if nums[i] > 0:
            break
        left, right = i + 1, n - 1
        while left < right:
            total = nums[i] + nums[left] + nums[right]
            if total == 0:
                result.append([nums[i], nums[left], nums[right]])
                left += 1
                right -= 1
                while left < right and nums[left] == nums[left - 1]:
                    left += 1
                while left < right and nums[right] == nums[right + 1]:
                    right -= 1
            elif total < 0:
                left += 1
            else:
                right -= 1
    return result`,
  },

  // C++ and Java share one layout (Java three lines lower, for its imports and class); C has its helpers first. In the
  // C-family listings `continue`, `break` and the duplicate-skipping increments sit on their condition's line; Python
  // gives each its own line.
  lineMap: {
    c: {
      'fn-entry': 12, copy: 14, sort: 15, 'init-result': 16, 'outer-loop': 17, 'check-dup-i': 18, 'skip-i': 18,
      'check-positive': 19, stop: 19, 'init-pointers': 20, 'inner-loop': 21, 'calc-sum': 22, 'check-zero': 23,
      record: 24, 'found-left': 25, 'found-right': 26, 'skip-left-check': 27, 'skip-left': 27, 'skip-right-check': 28,
      'skip-right': 28, 'check-less': 29, 'move-left': 30, 'move-right': 32, return: 37,
    },
    cpp: {
      'fn-entry': 1, copy: 2, sort: 3, 'init-result': 5, 'outer-loop': 6, 'check-dup-i': 7, 'skip-i': 7,
      'check-positive': 8, stop: 8, 'init-pointers': 9, 'inner-loop': 10, 'calc-sum': 11, 'check-zero': 12,
      record: 13, 'found-left': 14, 'found-right': 15, 'skip-left-check': 16, 'skip-left': 16, 'skip-right-check': 17,
      'skip-right': 17, 'check-less': 18, 'move-left': 19, 'move-right': 21, return: 25,
    },
    java: {
      'fn-entry': 6, copy: 7, sort: 8, 'init-result': 10, 'outer-loop': 11, 'check-dup-i': 12, 'skip-i': 12,
      'check-positive': 13, stop: 13, 'init-pointers': 14, 'inner-loop': 15, 'calc-sum': 16, 'check-zero': 17,
      record: 18, 'found-left': 19, 'found-right': 20, 'skip-left-check': 21, 'skip-left': 21, 'skip-right-check': 22,
      'skip-right': 22, 'check-less': 23, 'move-left': 24, 'move-right': 26, return: 30,
    },
    python: {
      'fn-entry': 1, copy: 2, sort: 3, 'init-result': 5, 'outer-loop': 6, 'check-dup-i': 7, 'skip-i': 8,
      'check-positive': 9, stop: 10, 'init-pointers': 11, 'inner-loop': 12, 'calc-sum': 13, 'check-zero': 14,
      record: 15, 'found-left': 16, 'found-right': 17, 'skip-left-check': 18, 'skip-left': 19, 'skip-right-check': 20,
      'skip-right': 21, 'check-less': 22, 'move-left': 23, 'move-right': 25, return: 26,
    },
  },
  // the result starts with n beside it (C takes n as a parameter); C allocates the copy before filling it, and frees it
  // before returning the count
  lineLeads: {
    c: { copy: 1, return: 1 },
    cpp: { 'init-result': 1 },
    java: { 'init-result': 1 },
    python: { 'init-result': 1 },
  },

  generateSteps: generateThreeSumSteps,
};
