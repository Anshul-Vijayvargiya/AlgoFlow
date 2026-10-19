import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';

function generateTwoPointerSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  // Used exactly as given. The technique requires ascending input; the UI validates that and never sorts silently.
  const arr = [...input];
  const n = arr.length;
  // A passed target is always used as given, including 0 (the UI validates it before calling). Without one, the
  // fallback is the endpoint sum, so the first pair matches; it may be 0. An empty array has no endpoints: 10.
  // null is not "no target": reject it, as Linear and Binary Search do, rather than fall back to another target.
  if (params?.target === null) throw new TypeError('Two Pointer: target is null; pass a number or omit it.');
  const target = (params?.target as number | undefined) ?? (n > 0 ? arr[0] + arr[n - 1] : 10);
  const steps: ExecutionStep[] = [];
  let id = 0;

  steps.push({
    id: id++,
    type: 'init',
    codeRef: 'fn-entry',
    state: [...arr],
    variables: { n, target },
    message: `Initialize Two-Pointer Pair Sum — target sum = ${target}`,
    explanation: 'The array must be sorted. Pointers start at left=0 (smallest element) and right=n-1 (largest element).',
    actionLabel: 'Initialize',
  });

  let left = 0;
  let right = n - 1;
  let found = false;

  steps.push({
    id: id++,
    type: 'assign',
    codeRef: 'init-pointers',
    state: [...arr],
    variables: { left, right, target },
    pointers: { left, right },
    indices: n > 0 ? [left, right] : [],
    message:
      n > 0
        ? `Set left = 0 (val ${arr[left]}), right = ${right} (val ${arr[right]})`
        : `Set left = 0, right = ${right} (empty array — no elements to point at)`,
    explanation:
      n > 0
        ? `Left pointer points to smallest value ${arr[left]}; right pointer points to largest value ${arr[right]}.`
        : `The array is empty, so right = -1 is before left and the loop will not run.`,
    actionLabel: 'Init Pointers',
  });

  // Every check the displayed code executes is its own step, in order: the loop condition (including the final FALSE
  // that ends the loop), then `sum == target`, then — only when that is false — `sum < target`.
  for (;;) {
    const loopTrue = left < right;
    const inArray = (k: number) => k >= 0 && k < n;
    steps.push({
      id: id++,
      type: 'loop-condition',
      codeRef: 'while-condition',
      state: [...arr],
      variables: { left, right, target },
      pointers: { left, right },
      indices: [...new Set([left, right])].filter(inArray),
      result: loopTrue ? 'true' : 'false',
      message: `while left(${left}) < right(${right}) → ${loopTrue ? 'true' : 'false'}`,
      explanation: loopTrue
        ? `The pointers have not met, so there is still a pair to check.`
        : `The pointers have met or crossed, so every possible pair has been ruled out. The loop ends.`,
      actionLabel: loopTrue ? 'While TRUE' : 'While FALSE',
    });
    if (!loopTrue) break;

    const currentSum = arr[left] + arr[right];

    steps.push({
      id: id++,
      type: 'assign',
      codeRef: 'calc-sum',
      state: [...arr],
      variables: { left, right, 'arr[left]': arr[left], 'arr[right]': arr[right], currentSum, target },
      pointers: { left, right },
      indices: [left, right],
      message: `sum = arr[${left}] + arr[${right}] = ${arr[left]} + ${arr[right]} = ${currentSum}`,
      explanation: `Adds the values at the two pointers. It is compared with the target ${target} next.`,
      actionLabel: 'Compute Sum',
    });

    const isMatch = currentSum === target;
    steps.push({
      id: id++,
      type: 'condition',
      codeRef: 'check-equal',
      state: [...arr],
      variables: { left, right, currentSum, target },
      pointers: { left, right },
      indices: [left, right],
      comparedValues: { val1: currentSum, val2: target },
      result: isMatch ? 'true' : 'false',
      message: `sum(${currentSum}) == target(${target}) → ${isMatch ? 'TRUE — pair found' : 'FALSE'}`,
      explanation: isMatch
        ? `The sum equals the target, so the pair at indices [${left}, ${right}] is returned.`
        : `The sum is not the target, so the code checks which pointer to move.`,
      actionLabel: isMatch ? 'Condition TRUE' : 'Condition FALSE',
    });

    if (isMatch) {
      found = true;
      steps.push({
        id: id++,
        type: 'found',
        codeRef: 'return-pair',
        state: [...arr],
        variables: { left, right, val1: arr[left], val2: arr[right], target },
        pointers: { left, right },
        indices: [left, right],
        sortedIndices: [left, right],
        message: `Found pair! indices [${left}, ${right}] → ${arr[left]} + ${arr[right]} = ${target} ✓`,
        explanation: 'Two-pointer pair search succeeded in O(n) time.',
        actionLabel: 'Pair Found',
      });
      break;
    }

    const isLess = currentSum < target;
    steps.push({
      id: id++,
      type: 'condition',
      codeRef: 'check-less',
      state: [...arr],
      variables: { left, right, currentSum, target },
      pointers: { left, right },
      indices: [left, right],
      comparedValues: { val1: currentSum, val2: target },
      result: isLess ? 'true' : 'false',
      message: `sum(${currentSum}) < target(${target}) → ${isLess ? 'TRUE — move left' : 'FALSE — move right'}`,
      explanation: isLess
        ? `The sum is too small. Moving left to a larger value (the array is ascending) increases it.`
        : `The sum is too large. Moving right to a smaller value decreases it.`,
      actionLabel: isLess ? 'Condition TRUE' : 'Condition FALSE',
    });

    if (isLess) {
      left++;
      steps.push({
        id: id++,
        type: 'increment',
        codeRef: 'increment-left',
        state: [...arr],
        variables: { left, right, target },
        pointers: { left, right },
        indices: [left, right],
        message: `left++ → left = ${left}`,
        explanation: `Moved left pointer to index ${left} (value ${arr[left]}).`,
        actionLabel: 'left++',
      });
    } else {
      right--;
      steps.push({
        id: id++,
        type: 'decrement',
        codeRef: 'decrement-right',
        state: [...arr],
        variables: { left, right, target },
        pointers: { left, right },
        indices: [left, right],
        message: `right-- → right = ${right}`,
        explanation: `Moved right pointer to index ${right} (value ${arr[right]}).`,
        actionLabel: 'right--',
      });
    }
  }

  if (!found) {
    steps.push({
      id: id++,
      type: 'not-found',
      codeRef: 'return-none',
      state: [...arr],
      variables: { target },
      message: `No pair found that sums to target ${target}`,
      explanation: 'Exhausted search space without finding matching target sum.',
      actionLabel: 'Not Found',
    });
  }

  steps.push({
    id: id++,
    type: 'complete',
    codeRef: 'fn-entry',
    state: [...arr],
    sortedIndices: found ? [left, right] : [],
    message: 'Two-Pointer execution complete!',
    explanation: 'Completed scanning sorted array.',
    actionLabel: 'Complete',
  });

  return steps;
}

export const twoPointerDefinition: AlgorithmDefinition = {
  id: 'two-pointer',
  name: 'Two Pointer Technique',
  category: 'ARRAYS',
  subtitle: 'Converging left and right pointers to find pairs in a sorted array in O(n) time.',
  description:
    'The Two-Pointer technique uses two references traversing a sorted array from opposite ends to find target pairs without nested loops.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'Searching pairs, subarray boundaries, and palindrome checking in linear time',
  },
  defaultInput: [2, 5, 8, 12, 15, 19, 24],
  // Problem solved: find two DIFFERENT positions left < right in an ascending array whose values sum to the target.
  inputSpec: {
    sortedRequired: true,
    target: { label: 'Target sum', hint: 'Find two elements whose sum equals this', defaultValue: 27 },
  },

  code: {
    cpp: `vector<int> twoSumSorted(vector<int>& arr, int target) {
    int left = 0, right = arr.size() - 1;
    while (left < right) {
        int sum = arr[left] + arr[right];
        if (sum == target) return {left, right};
        if (sum < target) left++;
        else right--;
    }
    return {};
}`,
    c: `bool twoSumSorted(int arr[], int n, int target, int* outLeft, int* outRight) {
    int left = 0, right = n - 1;
    while (left < right) {
        int sum = arr[left] + arr[right];
        if (sum == target) {
            *outLeft = left; *outRight = right;
            return true;
        }
        if (sum < target) left++;
        else right--;
    }
    return false;
}`,
    java: `public class TwoPointer {
    public static int[] twoSumSorted(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left < right) {
            int sum = arr[left] + arr[right];
            if (sum == target) return new int[]{left, right};
            if (sum < target) left++;
            else right--;
        }
        return new int[]{};
    }
}`,
    python: `def two_sum_sorted(arr, target):
    left, right = 0, len(arr) - 1
    while left < right:
        current_sum = arr[left] + arr[right]
        if current_sum == target:
            return (left, right)
        elif current_sum < target:
            left += 1
        else:
            right -= 1
    return None`,
  },

  lineMap: {
    // C++ and Java write `if (sum == target) return …;` and `if (sum < target) left++;` on one line each, so the
    // condition and the statement it guards share that line there.
    cpp: {
      'fn-entry': 1,
      'init-pointers': 2,
      'while-condition': 3,
      'calc-sum': 4,
      'check-equal': 5,
      'return-pair': 5,
      'check-less': 6,
      'increment-left': 6,
      'decrement-right': 7,
      'return-none': 9,
    },
    c: {
      'fn-entry': 1,
      'init-pointers': 2,
      'while-condition': 3,
      'calc-sum': 4,
      'check-equal': 5,
      'return-pair': 7,
      'check-less': 9,
      'increment-left': 9,
      'decrement-right': 10,
      'return-none': 12,
    },
    java: {
      'fn-entry': 2,
      'init-pointers': 3,
      'while-condition': 4,
      'calc-sum': 5,
      'check-equal': 6,
      'return-pair': 6,
      'check-less': 7,
      'increment-left': 7,
      'decrement-right': 8,
      'return-none': 10,
    },
    python: {
      'fn-entry': 1,
      'init-pointers': 2,
      'while-condition': 3,
      'calc-sum': 4,
      'check-equal': 5,
      'return-pair': 6,
      'check-less': 7,
      'increment-left': 8,
      'decrement-right': 10,
      'return-none': 11,
    },
  },

  // C writes the pair to its out-parameters on the line before `return true;`; the match step covers both, and its
  // mapped line stays on the return. C++, Java and Python return the pair in one statement.
  lineLeads: {
    c: { 'return-pair': 1 },
  },

  generateSteps: generateTwoPointerSteps,
};
