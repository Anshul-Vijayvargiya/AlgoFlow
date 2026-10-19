import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';



export const linearSearchDefinition: AlgorithmDefinition = {
  id: 'linear-search',
  name: 'Linear Search',
  category: 'SEARCHING',
  subtitle: 'Scans every element from left to right until the target is found.',
  description:
    'Linear Search checks each element of the array one by one until it finds the target value or exhausts all elements. Simple but inefficient for large datasets — O(n) time.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'Unsorted arrays or when you need to find the first occurrence',
  },
  defaultInput: [4, 2, 9, 7, 5, 1, 8],
  // Works on any order; the input order is preserved exactly and the FIRST occurrence is reported.
  inputSpec: {
    target: { label: 'Target value', hint: 'Value to search for (first occurrence)', defaultValue: 7 },
  },

  code: {
    cpp: `int linearSearch(vector<int>& arr, int target) {
    for (int i = 0; i < arr.size(); i++) {
        if (arr[i] == target) {
            return i;
        }
    }
    return -1;
}`,
    c: `int linearSearch(int arr[], int n, int target) {
    for (int i = 0; i < n; i++) {
        if (arr[i] == target) {
            return i;
        }
    }
    return -1;
}`,
    java: `public class LinearSearch {
    public static int linearSearch(int[] arr, int target) {
        for (int i = 0; i < arr.length; i++) {
            if (arr[i] == target) {
                return i;
            }
        }
        return -1;
    }
}`,
    python: `def linear_search(arr, target):
    for i in range(len(arr)):
        if arr[i] == target:
            return i
    return -1`,
  },

  lineMap: {
    cpp: {
      'fn-entry': 1,
      'init-i': 2,
      'loop-condition': 2,
      'compare-target': 3,
      'if-match': 3,
      'return-index': 4,
      'increment-i': 2,
      'return-not-found': 7,
    },
    c: {
      'fn-entry': 1,
      'init-i': 2,
      'loop-condition': 2,
      'compare-target': 3,
      'if-match': 3,
      'return-index': 4,
      'increment-i': 2,
      'return-not-found': 7,
    },
    java: {
      'fn-entry': 2,
      'init-i': 3,
      'loop-condition': 3,
      'compare-target': 4,
      'if-match': 4,
      'return-index': 5,
      'increment-i': 3,
      'return-not-found': 8,
    },
    python: {
      'fn-entry': 1,
      'init-i': 2,
      'loop-condition': 2,
      'compare-target': 3,
      'if-match': 3,
      'return-index': 4,
      'increment-i': 2,
      'return-not-found': 5,
    },
  },

  generateSteps: (input: number[], params?: Record<string, unknown>) => {
    const arr = [...input];
    const n = arr.length;
    // null is not "no target": reject it rather than search for null. The app validates the target before calling, so
    // only a direct caller can get here; buildExecution reports the throw as a generator error.
    if (params?.target === null) throw new TypeError('Linear Search: target is null; pass a number or omit it.');
    const target =
      params?.target !== undefined
        ? (params.target as number)
        : (arr[Math.floor(arr.length / 2)] ?? 0);
    const steps: ExecutionStep[] = [];
    let stepId = 0;

    steps.push({
      id: stepId++,
      type: 'init',
      codeRef: 'fn-entry',
      state: [...arr],
      variables: { n, target },
      message: `Initialize linearSearch — target = ${target}, array length = ${n}`,
      explanation: 'We will scan the array left-to-right checking each element against the target.',
      actionLabel: 'Initialize',
    });

    steps.push({
      id: stepId++,
      type: 'assign',
      codeRef: 'init-i',
      state: [...arr],
      variables: { i: 0, target },
      pointers: { i: 0 },
      message: `Set i = 0  (start scanning from index 0)`,
      explanation: `The loop variable i starts at 0.`,
      actionLabel: 'i = 0',
    });

    let foundAt = -1;

    for (let i = 0; i < n; i++) {
      steps.push({
        id: stepId++,
        type: 'loop-condition',
        codeRef: 'loop-condition',
        state: [...arr],
        variables: { i, n, target },
        pointers: { i },
        indices: [i],
        result: 'true',
        message: `Loop condition: i=${i} < ${n} → true`,
        explanation: `Index ${i} is within bounds. Checking arr[${i}].`,
        actionLabel: `Loop i=${i}`,
      });

      const val = arr[i];

      steps.push({
        id: stepId++,
        type: 'compare',
        codeRef: 'compare-target',
        state: [...arr],
        variables: { i, 'arr[i]': val, target },
        pointers: { i },
        indices: [i],
        comparedValues: { val1: val, val2: target },
        message: `Compare arr[${i}] = ${val}  vs  target = ${target}`,
        explanation: `Checking whether the element at index ${i} (value ${val}) equals the target ${target}.`,
        actionLabel: 'Compare',
      });

      const isMatch = val === target;

      steps.push({
        id: stepId++,
        type: 'condition',
        codeRef: 'if-match',
        state: [...arr],
        variables: { i, 'arr[i]': val, target },
        pointers: { i },
        indices: [i],
        comparedValues: { val1: val, val2: target },
        result: isMatch ? 'true' : 'false',
        message: `arr[${i}]=${val} == target=${target} → ${isMatch ? 'TRUE' : 'FALSE'}`,
        explanation: isMatch
          ? `Element ${val} at index ${i} matches target ${target}. Returning the index.`
          : `${val} ≠ ${target}. Moving to next element.`,
        actionLabel: isMatch ? 'Match!' : 'No Match',
      });

      if (isMatch) {
        foundAt = i;
        steps.push({
          id: stepId++,
          type: 'found',
          codeRef: 'return-index',
          state: [...arr],
          variables: { foundIndex: i, target },
          pointers: { i },
          indices: [i],
          sortedIndices: [i],
          message: `return ${i}  ← target ${target} found at index ${i} ✓`,
          explanation: `Returning index ${i}. Linear search complete in ${i + 1} comparison(s).`,
          actionLabel: 'Return Index',
        });
        break;
      }

      steps.push({
        id: stepId++,
        type: 'increment',
        codeRef: 'increment-i',
        state: [...arr],
        variables: { i: i + 1, target },
        pointers: { i: i + 1 },
        message: `i++ → i=${i + 1}`,
        explanation: `Not found at index ${i}. Advancing to index ${i + 1}.`,
        actionLabel: 'i++',
      });
    }

    if (foundAt === -1) {
      steps.push({
        id: stepId++,
        type: 'loop-condition',
        codeRef: 'loop-condition',
        state: [...arr],
        variables: { i: n, n, target },
        result: 'false',
        message: `Loop condition: i=${n} < ${n} → false — all elements checked`,
        explanation: `Loop ended. No matching element found in the array.`,
        actionLabel: 'Loop End',
      });

      steps.push({
        id: stepId++,
        type: 'not-found',
        codeRef: 'return-not-found',
        state: [...arr],
        variables: { target, returnVal: -1 },
        message: `return -1  ← target ${target} not found in array`,
        explanation: `Target ${target} is not present. Returning -1.`,
        actionLabel: 'Not Found',
      });
    }

    steps.push({
      id: stepId++,
      type: 'complete',
      codeRef: 'fn-entry',
      state: [...arr],
      sortedIndices: foundAt !== -1 ? [foundAt] : [],
      message:
        foundAt !== -1
          ? `Linear Search complete — target ${target} found at index ${foundAt}`
          : `Linear Search complete — target ${target} not in array`,
      explanation: 'Linear search scanned the entire array.',
      actionLabel: 'Complete',
    });

    return steps;
  },
};
