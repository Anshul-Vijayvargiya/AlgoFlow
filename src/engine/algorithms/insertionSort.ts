import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';

export const insertionSortDefinition: AlgorithmDefinition = {
  id: 'insertion-sort',
  name: 'Insertion Sort',
  category: 'SORTING',
  subtitle: 'Builds the sorted array one element at a time, like sorting playing cards.',
  description:
    'Insertion Sort builds the final sorted array one item at a time. It takes each element and inserts it into its correct position within the already-sorted portion of the array.',
  complexity: {
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    bestFor: 'Nearly-sorted arrays and small datasets',
  },
  defaultInput: [6, 2, 8, 4, 3],

  code: {
    cpp: `void insertionSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
}`,
    c: `void insertionSort(int arr[], int n) {
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
}`,
    java: `public class InsertionSort {
    public static void insertionSort(int[] arr) {
        int n = arr.length;
        for (int i = 1; i < n; i++) {
            int key = arr[i];
            int j = i - 1;
            while (j >= 0 && arr[j] > key) {
                arr[j + 1] = arr[j];
                j--;
            }
            arr[j + 1] = key;
        }
    }
}`,
    python: `def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key
    return arr`,
  },

  lineMap: {
    cpp: {
      'fn-entry': 1,
      'outer-loop': 3,
      'pick-key': 4,
      'init-j': 5,
      'while-condition': 6,
      'shift-right': 7,
      'decrement-j': 8,
      'insert-key': 10,
    },
    c: {
      'fn-entry': 1,
      'outer-loop': 2,
      'pick-key': 3,
      'init-j': 4,
      'while-condition': 5,
      'shift-right': 6,
      'decrement-j': 7,
      'insert-key': 9,
    },
    java: {
      'fn-entry': 2,
      'outer-loop': 4,
      'pick-key': 5,
      'init-j': 6,
      'while-condition': 7,
      'shift-right': 8,
      'decrement-j': 9,
      'insert-key': 11,
    },
    python: {
      'fn-entry': 1,
      'outer-loop': 2,
      'pick-key': 3,
      'init-j': 4,
      'while-condition': 5,
      'shift-right': 6,
      'decrement-j': 7,
      'insert-key': 8,
    },
  },

  generateSteps(input: number[]): ExecutionStep[] {
    const arr = [...input];
    const n = arr.length;
    const steps: ExecutionStep[] = [];
    // Index 0 is trivially sorted — but only if the array has an element at index 0.
  const sortedIndices: number[] = n > 0 ? [0] : [];
    let id = 0;

    steps.push({
      id: id++,
      type: 'init',
      codeRef: 'fn-entry',
      state: [...arr],
      variables: { n },
      sortedIndices: [...sortedIndices],
      message: `Initialize insertionSort — array of ${n} elements`,
      explanation:
        n > 0
          ? `Index 0 (${arr[0]}) is initially considered sorted. We insert each subsequent element into its correct position.`
          : 'The array is empty, so there is nothing to sort.',
      actionLabel: 'Initialize',
    });

    for (let i = 1; i < n; i++) {
      steps.push({
        id: id++,
        type: 'loop-condition',
        codeRef: 'outer-loop',
        state: [...arr],
        variables: { i, n },
        pointers: { i },
        sortedIndices: [...sortedIndices],
        result: 'true',
        message: `Outer loop: i=${i} < ${n} → true`,
        explanation: `Processing element at index ${i} (value ${arr[i]}).`,
        actionLabel: `Loop i=${i}`,
      });

      const key = arr[i];

      steps.push({
        id: id++,
        type: 'assign',
        codeRef: 'pick-key',
        state: [...arr],
        variables: { i, key },
        pointers: { i },
        indices: [i],
        sortedIndices: [...sortedIndices],
        message: `key = arr[${i}] = ${key}`,
        explanation: `Saving element ${key} as the key to insert into the sorted portion.`,
        actionLabel: 'Pick key',
      });

      let j = i - 1;

      steps.push({
        id: id++,
        type: 'assign',
        codeRef: 'init-j',
        state: [...arr],
        variables: { i, key, j },
        pointers: { i, j },
        sortedIndices: [...sortedIndices],
        message: `j = i - 1 = ${j}`,
        explanation: `Comparing key ${key} with sorted elements starting from index ${j}.`,
        actionLabel: 'j = i-1',
      });

      while (j >= 0 && arr[j] > key) {
        const condTrue = true;
        steps.push({
          id: id++,
          type: 'condition',
          codeRef: 'while-condition',
          state: [...arr],
          variables: { j, 'arr[j]': arr[j], key },
          pointers: { i, j },
          indices: [j],
          comparedValues: { val1: arr[j], val2: key },
          sortedIndices: [...sortedIndices],
          result: condTrue ? 'true' : 'false',
          message: `while j=${j}≥0 && arr[${j}]=${arr[j]} > key=${key} → TRUE`,
          explanation: `${arr[j]} > ${key}. Shifting ${arr[j]} right to make space.`,
          actionLabel: 'While TRUE',
        });

        arr[j + 1] = arr[j];
        steps.push({
          id: id++,
          type: 'assign',
          codeRef: 'shift-right',
          state: [...arr],
          variables: { 'arr[j+1]': arr[j + 1], j: j + 1 },
          pointers: { i, j: j + 1 },
          indices: [j + 1],
          sortedIndices: [...sortedIndices],
          message: `arr[${j + 1}] = arr[${j}] = ${arr[j + 1]}  (shift right)`,
          explanation: `Moved ${arr[j + 1]} from index ${j} to ${j + 1}.`,
          actionLabel: 'Shift Right',
        });

        j--;
        steps.push({
          id: id++,
          type: 'decrement',
          codeRef: 'decrement-j',
          state: [...arr],
          variables: { j, key },
          pointers: { i, j },
          sortedIndices: [...sortedIndices],
          message: `j-- → j=${j}`,
          explanation: `Moving pointer j left.`,
          actionLabel: 'j--',
        });
      }

      const whyFalse = j < 0 ? `j=${j} < 0` : `arr[${j}]=${arr[j]} ≤ key=${key}`;
      steps.push({
        id: id++,
        type: 'condition',
        codeRef: 'while-condition',
        state: [...arr],
        variables: { j, key },
        pointers: { i, j },
        sortedIndices: [...sortedIndices],
        result: 'false',
        message: `while condition FALSE — ${whyFalse}`,
        explanation: `Insertion position found at index ${j + 1}.`,
        actionLabel: 'While FALSE',
      });

      arr[j + 1] = key;
      sortedIndices.push(i);

      steps.push({
        id: id++,
        type: 'assign',
        codeRef: 'insert-key',
        state: [...arr],
        variables: { insertPos: j + 1, key },
        pointers: { inserted: j + 1 },
        indices: [j + 1],
        sortedIndices: [...sortedIndices],
        message: `arr[${j + 1}] = key = ${key}  (inserted)`,
        explanation: `Key ${key} inserted at index ${j + 1}. Subarray [0..${i}] is now sorted.`,
        actionLabel: 'Insert key',
      });
    }

    steps.push({
      id: id++,
      type: 'loop-condition',
      codeRef: 'outer-loop',
      state: [...arr],
      variables: { i: n, n },
      result: 'false',
      sortedIndices: Array.from({ length: n }, (_, i) => i),
      message: `Outer loop: i=${n} < ${n} → false — all elements inserted`,
      explanation: 'Outer loop complete. Array is fully sorted.',
      actionLabel: 'Loop End',
    });

    steps.push({
      id: id++,
      type: 'complete',
      codeRef: 'fn-entry',
      state: [...arr],
      sortedIndices: Array.from({ length: n }, (_, i) => i),
      message: 'Insertion Sort complete — array fully sorted!',
      explanation: 'Each element was inserted into its correct position.',
      actionLabel: 'Complete',
    });

    return steps;
  },
};
