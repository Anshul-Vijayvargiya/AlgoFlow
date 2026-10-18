import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';

export const binarySearchDefinition: AlgorithmDefinition = {
  id: 'binary-search',
  name: 'Binary Search',
  category: 'SEARCHING',
  subtitle: 'Eliminates half the search space at each step using a sorted array.',
  description:
    'Binary Search works on sorted arrays. It repeatedly divides the search interval in half. If the target is less than the mid element, it searches the left half; otherwise, the right half.',
  complexity: {
    best: 'O(1)',
    average: 'O(log n)',
    worst: 'O(log n)',
    space: 'O(1)',
    bestFor: 'Sorted arrays where fast lookup is critical',
  },
  defaultInput: [1, 3, 5, 7, 9, 11, 14],
  inputSpec: {
    sortedRequired: true,
    target: { label: 'Target value', hint: 'Value to search for', defaultValue: 7 },
  },

  code: {
    cpp: `int binarySearch(vector<int>& arr, int target) {
    int low = 0, high = arr.size() - 1;
    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target)
            low = mid + 1;
        else
            high = mid - 1;
    }
    return -1;
}`,
    c: `int binarySearch(int arr[], int n, int target) {
    int low = 0, high = n - 1;
    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target)
            low = mid + 1;
        else
            high = mid - 1;
    }
    return -1;
}`,
    java: `public class BinarySearch {
    public static int binarySearch(int[] arr, int target) {
        int low = 0, high = arr.length - 1;
        while (low <= high) {
            int mid = low + (high - low) / 2;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target)
                low = mid + 1;
            else
                high = mid - 1;
        }
        return -1;
    }
}`,
    python: `def binary_search(arr, target):
    low, high = 0, len(arr) - 1
    while low <= high:
        mid = low + (high - low) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1`,
  },

  lineMap: {
    cpp: {
      'fn-entry': 1,
      'init-bounds': 2,
      'while-condition': 3,
      'calc-mid': 4,
      'check-equal': 5,
      'return-index': 5,
      'check-less': 6,
      'update-low': 7,
      'update-high': 9,
      'return-not-found': 11,
    },
    c: {
      'fn-entry': 1,
      'init-bounds': 2,
      'while-condition': 3,
      'calc-mid': 4,
      'check-equal': 5,
      'return-index': 5,
      'check-less': 6,
      'update-low': 7,
      'update-high': 9,
      'return-not-found': 11,
    },
    java: {
      'fn-entry': 2,
      'init-bounds': 3,
      'while-condition': 4,
      'calc-mid': 5,
      'check-equal': 6,
      'return-index': 6,
      'check-less': 7,
      'update-low': 8,
      'update-high': 10,
      'return-not-found': 12,
    },
    python: {
      'fn-entry': 1,
      'init-bounds': 2,
      'while-condition': 3,
      'calc-mid': 4,
      'check-equal': 5,
      'return-index': 6,
      'check-less': 7,
      'update-low': 8,
      'update-high': 10,
      'return-not-found': 11,
    },
  },

  generateSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
    // The array is used exactly as given. Binary Search REQUIRES ascending input: the UI validates this and
    // never sorts for the user silently. A direct caller with unsorted input gets a faithful trace of the code.
    const arr = [...input];
    const isSorted = arr.every((v, i) => i === 0 || arr[i - 1] <= v);
    const n = arr.length;
    const target =
      params?.target !== undefined
        ? (params.target as number)
        : (arr[Math.floor(arr.length / 2)] ?? 0);
    const steps: ExecutionStep[] = [];
    let id = 0;
    let low = 0;
    let high = n - 1;
    let foundIndex = -1;

    steps.push({
      id: id++,
      type: 'init',
      codeRef: 'fn-entry',
      state: [...arr],
      variables: { n, target },
      message: `Initialize binarySearch — target = ${target}, array length = ${n}`,
      explanation: isSorted
        ? `Array is sorted. Searching for ${target} using divide-and-conquer.`
        : `Warning: the array is NOT sorted, so binary search may miss ${target} even if it is present.`,
      actionLabel: 'Initialize',
    });

    steps.push({
      id: id++,
      type: 'assign',
      codeRef: 'init-bounds',
      state: [...arr],
      variables: { low, high, target },
      pointers: { low, high },
      indices: n > 0 ? [low, high] : [],
      message: n > 0 ? `Set low=0, high=${high}` : `Set low=0, high=${high} (empty array — the range is empty)`,
      explanation: `Initial search range spans the entire array [0..${high}].`,
      actionLabel: 'Set Bounds',
    });

    while (low <= high) {
      steps.push({
        id: id++,
        type: 'loop-condition',
        codeRef: 'while-condition',
        state: [...arr],
        variables: { low, high, target },
        pointers: { low, high },
        result: 'true',
        message: `while low(${low}) <= high(${high}) → true`,
        explanation: `Search space is valid. Calculating midpoint.`,
        actionLabel: 'While TRUE',
      });

      const mid = Math.floor(low + (high - low) / 2);
      const midVal = arr[mid];

      steps.push({
        id: id++,
        type: 'assign',
        codeRef: 'calc-mid',
        state: [...arr],
        variables: { low, high, mid, 'arr[mid]': midVal, target },
        pointers: { low, mid, high },
        indices: [mid],
        message: `mid = low + (high-low)/2 = ${mid}  →  arr[mid] = ${midVal}`,
        explanation: `Midpoint index is ${mid} (value ${midVal}).`,
        actionLabel: 'Calc mid',
      });

      const isEqual = midVal === target;
      steps.push({
        id: id++,
        type: 'condition',
        codeRef: 'check-equal',
        state: [...arr],
        variables: { mid, 'arr[mid]': midVal, target },
        pointers: { low, mid, high },
        indices: [mid],
        comparedValues: { val1: midVal, val2: target },
        result: isEqual ? 'true' : 'false',
        message: `arr[mid]=${midVal} == target=${target} → ${isEqual ? 'TRUE — found!' : 'FALSE'}`,
        explanation: isEqual
          ? `Target found at index ${mid}!`
          : `${midVal} ≠ ${target}. Checking direction.`,
        actionLabel: isEqual ? 'Found!' : 'Not Equal',
      });

      if (isEqual) {
        foundIndex = mid;
        steps.push({
          id: id++,
          type: 'found',
          codeRef: 'return-index',
          state: [...arr],
          variables: { foundIndex: mid, target },
          pointers: { mid },
          indices: [mid],
          sortedIndices: [mid],
          message: `return ${mid}  ← target ${target} found at index ${mid} ✓`,
          explanation: `Returning index ${mid}. Binary search completed in O(log n) steps.`,
          actionLabel: 'Return Index',
        });
        break;
      }

      const isLess = midVal < target;
      steps.push({
        id: id++,
        type: 'condition',
        codeRef: 'check-less',
        state: [...arr],
        variables: { mid, 'arr[mid]': midVal, target },
        pointers: { low, mid, high },
        indices: [mid],
        comparedValues: { val1: midVal, val2: target },
        result: isLess ? 'true' : 'false',
        message: `arr[mid]=${midVal} < target=${target} → ${isLess ? 'TRUE — search right' : 'FALSE — search left'}`,
        explanation: isLess
          ? `Target is in the right half. Update low = mid + 1.`
          : `Target is in the left half. Update high = mid - 1.`,
        actionLabel: isLess ? 'Go Right' : 'Go Left',
      });

      if (isLess) {
        const oldLow = low;
        low = mid + 1;
        steps.push({
          id: id++,
          type: 'assign',
          codeRef: 'update-low',
          state: [...arr],
          variables: { low, high, target },
          pointers: { low, high },
          message: `low = mid+1 = ${low}  (was ${oldLow})`,
          explanation: `Eliminated left half. Search space is now [${low}..${high}].`,
          actionLabel: 'Update low',
        });
      } else {
        const oldHigh = high;
        high = mid - 1;
        steps.push({
          id: id++,
          type: 'assign',
          codeRef: 'update-high',
          state: [...arr],
          variables: { low, high, target },
          pointers: { low, high },
          message: `high = mid-1 = ${high}  (was ${oldHigh})`,
          explanation: `Eliminated right half. Search space is now [${low}..${high}].`,
          actionLabel: 'Update high',
        });
      }
    }

    if (foundIndex === -1) {
      steps.push({
        id: id++,
        type: 'loop-condition',
        codeRef: 'while-condition',
        state: [...arr],
        variables: { low, high, target },
        result: 'false',
        message: `while low(${low}) <= high(${high}) → false — search exhausted`,
        explanation: 'Search space empty. Target not found.',
        actionLabel: 'While FALSE',
      });

      steps.push({
        id: id++,
        type: 'not-found',
        codeRef: 'return-not-found',
        state: [...arr],
        variables: { target, returnVal: -1 },
        message: `return -1  ← target ${target} not found`,
        explanation: `Target ${target} is not in the sorted array.`,
        actionLabel: 'Not Found',
      });
    }

    steps.push({
      id: id++,
      type: 'complete',
      codeRef: 'fn-entry',
      state: [...arr],
      sortedIndices: foundIndex !== -1 ? [foundIndex] : [],
      message:
        foundIndex !== -1
          ? `Binary Search complete — found at index ${foundIndex}`
          : `Binary Search complete — target not present`,
      explanation: 'Binary search finished.',
      actionLabel: 'Complete',
    });

    return steps;
  },
};
