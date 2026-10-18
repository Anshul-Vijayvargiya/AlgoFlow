import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';

export const selectionSortDefinition: AlgorithmDefinition = {
  id: 'selection-sort',
  name: 'Selection Sort',
  category: 'SORTING',
  subtitle: 'Repeatedly finds the minimum element and places it at the front.',
  description:
    'Selection Sort divides the array into a sorted and unsorted portion. It repeatedly scans the unsorted portion for the minimum element and swaps it into the sorted boundary.',
  complexity: {
    best: 'O(n²)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    bestFor: 'Small arrays where memory writes are expensive',
  },
  defaultInput: [7, 4, 1, 8, 2],

  code: {
    cpp: `void selectionSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        if (minIdx != i) {
            swap(arr[i], arr[minIdx]);
        }
    }
}`,
    c: `void selectionSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        if (minIdx != i) {
            int temp = arr[i];
            arr[i] = arr[minIdx];
            arr[minIdx] = temp;
        }
    }
}`,
    java: `public class SelectionSort {
    public static void selectionSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            int minIdx = i;
            for (int j = i + 1; j < n; j++) {
                if (arr[j] < arr[minIdx]) {
                    minIdx = j;
                }
            }
            if (minIdx != i) {
                int temp = arr[i];
                arr[i] = arr[minIdx];
                arr[minIdx] = temp;
            }
        }
    }
}`,
    python: `def selection_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        min_idx = i
        for j in range(i + 1, n):
            if arr[j] < arr[min_idx]:
                min_idx = j
        if min_idx != i:
            arr[i], arr[min_idx] = arr[min_idx], arr[i]
    return arr`,
  },

  lineMap: {
    cpp: {
      'fn-entry': 1,
      'outer-loop': 3,
      'set-min': 4,
      'inner-loop': 5,
      'compare-min': 6,
      'update-min': 7,
      'check-swap': 10,
      'do-swap': 11,
    },
    c: {
      'fn-entry': 1,
      'outer-loop': 2,
      'set-min': 3,
      'inner-loop': 4,
      'compare-min': 5,
      'update-min': 6,
      'check-swap': 9,
      'do-swap': 10,
    },
    java: {
      'fn-entry': 2,
      'outer-loop': 4,
      'set-min': 5,
      'inner-loop': 6,
      'compare-min': 7,
      'update-min': 8,
      'check-swap': 11,
      'do-swap': 12,
    },
    python: {
      'fn-entry': 1,
      'outer-loop': 3,
      'set-min': 4,
      'inner-loop': 5,
      'compare-min': 6,
      'update-min': 7,
      'check-swap': 8,
      'do-swap': 9,
    },
  },

  generateSteps(input: number[]): ExecutionStep[] {
    const arr = [...input];
    const n = arr.length;
    const steps: ExecutionStep[] = [];
    const sortedIndices: number[] = [];
    let id = 0;

    steps.push({
      id: id++,
      type: 'init',
      codeRef: 'fn-entry',
      state: [...arr],
      variables: { n },
      message: `Initialize selectionSort — array of ${n} elements`,
      explanation: 'Selection sort repeatedly selects the minimum from the unsorted portion.',
      actionLabel: 'Initialize',
    });

    for (let i = 0; i < n - 1; i++) {
      steps.push({
        id: id++,
        type: 'loop-condition',
        codeRef: 'outer-loop',
        state: [...arr],
        variables: { i, 'n-1': n - 1 },
        pointers: { i },
        sortedIndices: [...sortedIndices],
        result: 'true',
        message: `Outer loop: i=${i} < ${n - 1} → true  (Pass ${i + 1})`,
        explanation: `Beginning pass ${i + 1}. Will find minimum element in arr[${i}..${n - 1}].`,
        actionLabel: `Outer Loop i=${i}`,
      });

      let minIdx = i;
      steps.push({
        id: id++,
        type: 'assign',
        codeRef: 'set-min',
        state: [...arr],
        variables: { i, minIdx, 'arr[minIdx]': arr[minIdx] },
        pointers: { i, minIdx },
        indices: [i],
        sortedIndices: [...sortedIndices],
        message: `Assume minIdx = ${i} (value = ${arr[i]})`,
        explanation: `Set the assumed minimum to the first unsorted index ${i}.`,
        actionLabel: 'Set minIdx',
      });

      for (let j = i + 1; j < n; j++) {
        steps.push({
          id: id++,
          type: 'loop-condition',
          codeRef: 'inner-loop',
          state: [...arr],
          variables: { j, n, minIdx },
          pointers: { i, j, minIdx },
          indices: [j, minIdx],
          sortedIndices: [...sortedIndices],
          result: 'true',
          message: `Inner loop: j=${j} < ${n} → true`,
          explanation: `Checking element at index ${j} against current minimum at index ${minIdx}.`,
          actionLabel: `Inner j=${j}`,
        });

        const isSmaller = arr[j] < arr[minIdx];
        steps.push({
          id: id++,
          type: 'condition',
          codeRef: 'compare-min',
          state: [...arr],
          variables: { j, 'arr[j]': arr[j], minIdx, 'arr[minIdx]': arr[minIdx] },
          pointers: { i, j, minIdx },
          indices: [j, minIdx],
          sortedIndices: [...sortedIndices],
          comparedValues: { val1: arr[j], val2: arr[minIdx] },
          result: isSmaller ? 'true' : 'false',
          message: `arr[${j}]=${arr[j]} < arr[minIdx=${minIdx}]=${arr[minIdx]} → ${isSmaller ? 'TRUE' : 'FALSE'}`,
          explanation: isSmaller
            ? `Found new minimum ${arr[j]} at index ${j}.`
            : `${arr[j]} ≥ current min ${arr[minIdx]}. No update.`,
          actionLabel: isSmaller ? 'New Min' : 'No Update',
        });

        if (isSmaller) {
          minIdx = j;
          steps.push({
            id: id++,
            type: 'assign',
            codeRef: 'update-min',
            state: [...arr],
            variables: { minIdx, 'arr[minIdx]': arr[minIdx] },
            pointers: { i, minIdx },
            indices: [minIdx],
            sortedIndices: [...sortedIndices],
            message: `Update minIdx = ${minIdx} (value = ${arr[minIdx]})`,
            explanation: `Updated minimum index to ${minIdx}.`,
            actionLabel: 'Update minIdx',
          });
        }
      }

      steps.push({
        id: id++,
        type: 'loop-condition',
        codeRef: 'inner-loop',
        state: [...arr],
        variables: { j: n, n, minIdx },
        sortedIndices: [...sortedIndices],
        result: 'false',
        message: `Inner loop: j=${n} < ${n} → false — scan complete`,
        explanation: `Minimum for pass ${i + 1} is value ${arr[minIdx]} at index ${minIdx}.`,
        actionLabel: 'Inner Loop End',
      });

      const needsSwap = minIdx !== i;
      steps.push({
        id: id++,
        type: 'condition',
        codeRef: 'check-swap',
        state: [...arr],
        variables: { i, minIdx },
        pointers: { i, minIdx },
        indices: [i, minIdx],
        sortedIndices: [...sortedIndices],
        result: needsSwap ? 'true' : 'false',
        message: `minIdx(${minIdx}) != i(${i}) → ${needsSwap ? 'TRUE — swap needed' : 'FALSE — already in place'}`,
        explanation: needsSwap
          ? `Swapping arr[${i}]=${arr[i]} with arr[${minIdx}]=${arr[minIdx]}.`
          : `Minimum is already at index ${i}. No swap needed.`,
        actionLabel: needsSwap ? 'Swap Check TRUE' : 'Already Minimum',
      });

      if (needsSwap) {
        [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
        steps.push({
          id: id++,
          type: 'swap',
          codeRef: 'do-swap',
          state: [...arr],
          variables: { i, minIdx, 'arr[i]': arr[i], 'arr[minIdx]': arr[minIdx] },
          pointers: { i, minIdx },
          indices: [i, minIdx],
          sortedIndices: [...sortedIndices],
          message: `Swapped arr[${i}] ↔ arr[${minIdx}]  (now: ${arr[i]}, ${arr[minIdx]})`,
          explanation: `Minimum element placed at index ${i}.`,
          actionLabel: 'Swap',
        });
      }

      sortedIndices.push(i);
      steps.push({
        id: id++,
        type: 'sorted',
        codeRef: 'outer-loop',
        state: [...arr],
        variables: { sortedIndex: i, value: arr[i] },
        indices: [i],
        sortedIndices: [...sortedIndices],
        message: `Element ${arr[i]} locked at index ${i} (sorted)`,
        explanation: `Index ${i} is in its final sorted position.`,
        actionLabel: 'Element Sorted',
      });
    }

    sortedIndices.push(n - 1);
    const allIdx = Array.from({ length: n }, (_, i) => i);
    steps.push({
      id: id++,
      type: 'complete',
      codeRef: 'fn-entry',
      state: [...arr],
      sortedIndices: allIdx,
      message: 'Selection Sort complete — array fully sorted!',
      explanation: 'Array is sorted. Total passes: n-1.',
      actionLabel: 'Complete',
    });

    return steps;
  },
};
