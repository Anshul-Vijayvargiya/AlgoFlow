import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';

function generateSteps(input: number[]): ExecutionStep[] {
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
    message: `Initialize bubbleSort — array of ${n} elements`,
    explanation: `Function entered with unsorted array of size ${n}. Ready to start pass iterations.`,
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
      explanation: `Starting pass ${i + 1}. Will push the next largest unsorted element to its correct position.`,
      actionLabel: `Outer Loop i=${i}`,
    });

    for (let j = 0; j < n - i - 1; j++) {
      const v1 = arr[j];
      const v2 = arr[j + 1];

      steps.push({
        id: id++,
        type: 'loop-condition',
        codeRef: 'inner-loop',
        state: [...arr],
        variables: { j, limit: n - i - 1 },
        pointers: { i, j, 'j+1': j + 1 },
        indices: [j, j + 1],
        sortedIndices: [...sortedIndices],
        result: 'true',
        message: `Inner loop: j=${j} < ${n - i - 1} → true`,
        explanation: `Focusing on adjacent elements at indices [${j}] and [${j + 1}].`,
        actionLabel: `Inner Loop j=${j}`,
      });

      steps.push({
        id: id++,
        type: 'compare',
        codeRef: 'compare-adjacent',
        state: [...arr],
        variables: { 'arr[j]': v1, 'arr[j+1]': v2, j },
        pointers: { i, j, 'j+1': j + 1 },
        indices: [j, j + 1],
        sortedIndices: [...sortedIndices],
        comparedValues: { val1: v1, val2: v2 },
        message: `Compare arr[${j}]=${v1} and arr[${j + 1}]=${v2}`,
        explanation: `Checking if ${v1} > ${v2}. If yes, they are out of order and must be swapped.`,
        actionLabel: 'Compare',
      });

      const conditionMet = v1 > v2;

      steps.push({
        id: id++,
        type: 'condition',
        codeRef: 'if-greater',
        state: [...arr],
        variables: { 'arr[j]': v1, 'arr[j+1]': v2, j },
        pointers: { i, j, 'j+1': j + 1 },
        indices: [j, j + 1],
        sortedIndices: [...sortedIndices],
        comparedValues: { val1: v1, val2: v2 },
        result: conditionMet ? 'true' : 'false',
        message: `${v1} > ${v2} is ${conditionMet ? 'TRUE — swap' : 'FALSE — no swap'}`,
        explanation: conditionMet
          ? `${v1} is greater than ${v2}. Elements are out of order → entering swap block.`
          : `${v1} ≤ ${v2}. Elements are in correct order → skipping swap.`,
        actionLabel: conditionMet ? 'Condition TRUE' : 'Condition FALSE',
      });

      if (conditionMet) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];

        steps.push({
          id: id++,
          type: 'swap',
          codeRef: 'do-swap',
          state: [...arr],
          variables: { 'arr[j]': arr[j], 'arr[j+1]': arr[j + 1], j },
          pointers: { i, j, 'j+1': j + 1 },
          indices: [j, j + 1],
          sortedIndices: [...sortedIndices],
          comparedValues: { val1: arr[j], val2: arr[j + 1] },
          message: `Swapped arr[${j}] ↔ arr[${j + 1}]  (now: ${arr[j]}, ${arr[j + 1]})`,
          explanation: `Values swapped. The larger element ${v1} moves right toward its sorted position.`,
          actionLabel: 'Swap',
        });
      }

      steps.push({
        id: id++,
        type: 'increment',
        codeRef: 'inner-loop',
        state: [...arr],
        variables: { j: j + 1 },
        pointers: { i, j: j + 1 },
        sortedIndices: [...sortedIndices],
        message: `j++ → j=${j + 1}`,
        explanation: `Moving to next adjacent pair.`,
        actionLabel: 'j++',
      });
    }

    steps.push({
      id: id++,
      type: 'loop-condition',
      codeRef: 'inner-loop',
      state: [...arr],
      variables: { j: n - i - 1, limit: n - i - 1 },
      pointers: { i },
      sortedIndices: [...sortedIndices],
      result: 'false',
      message: `Inner loop: j=${n - i - 1} < ${n - i - 1} → false — pass ${i + 1} complete`,
      explanation: `Inner loop ended. The largest unsorted element has bubbled to position ${n - i - 1}.`,
      actionLabel: 'Inner Loop End',
    });

    sortedIndices.push(n - i - 1);

    steps.push({
      id: id++,
      type: 'sorted',
      codeRef: 'outer-loop',
      state: [...arr],
      variables: { sortedIndex: n - i - 1, value: arr[n - i - 1] },
      indices: [n - i - 1],
      sortedIndices: [...sortedIndices],
      message: `Element ${arr[n - i - 1]} locked at index ${n - i - 1} (sorted)`,
      explanation: `Pass ${i + 1} finalized. Index ${n - i - 1} is permanently sorted.`,
      actionLabel: 'Element Sorted',
    });

    steps.push({
      id: id++,
      type: 'increment',
      codeRef: 'outer-loop',
      state: [...arr],
      variables: { i: i + 1 },
      pointers: { i: i + 1 },
      sortedIndices: [...sortedIndices],
      message: `i++ → i=${i + 1}`,
      explanation: `Starting next outer loop pass.`,
      actionLabel: 'i++',
    });
  }

  // The outer loop always runs to completion (the displayed code has no early exit).
  // `i` is n-1 after the last i++ when n >= 2; for n <= 1 the loop never ran, so i is still 0.
  const finalI = Math.max(0, n - 1);
  steps.push({
    id: id++,
    type: 'loop-condition',
    codeRef: 'outer-loop',
    state: [...arr],
    variables: { i: finalI, 'n-1': n - 1 },
    result: 'false',
    sortedIndices: [...sortedIndices],
    message: `Outer loop: i=${finalI} < ${n - 1} → false — all passes complete`,
    explanation: `Outer loop condition is false. All elements are sorted.`,
    actionLabel: 'Outer Loop End',
  });

  const allIdx = Array.from({ length: n }, (_, i) => i);
  steps.push({
    id: id++,
    type: 'complete',
    codeRef: 'fn-entry',
    state: [...arr],
    sortedIndices: allIdx,
    message: 'Bubble Sort complete — array fully sorted!',
    explanation: 'Array is sorted in non-decreasing order. Time complexity: O(n²).',
    actionLabel: 'Complete',
  });

  return steps;
}

export const bubbleSortDefinition: AlgorithmDefinition = {
  id: 'bubble-sort',
  name: 'Bubble Sort',
  category: 'SORTING',
  subtitle: 'Repeatedly swaps adjacent elements that are in the wrong order.',
  description:
    'Bubble Sort compares adjacent elements and swaps them if they are in the wrong order. After each pass, the largest unsorted element "bubbles up" to its correct position at the end of the array.',
  complexity: {
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    bestFor: 'Educational purposes and nearly-sorted small arrays',
  },
  defaultInput: [8, 3, 5, 1, 6],
  // `i` is the pass counter, not an array position; only j and j+1 are drawn under the bars.
  positionPointers: ['j', 'j+1'],

  code: {
    cpp: `void bubbleSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                swap(arr[j], arr[j + 1]);
            }
        }
    }
}`,
    c: `void bubbleSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}`,
    java: `public class BubbleSort {
    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }
    }
}`,
    python: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr`,
  },

  lineMap: {
    cpp: {
      'fn-entry': 1,
      'outer-loop': 3,
      'inner-loop': 4,
      'compare-adjacent': 5,
      'if-greater': 5,
      'do-swap': 6,
    },
    c: {
      'fn-entry': 1,
      'outer-loop': 2,
      'inner-loop': 3,
      'compare-adjacent': 4,
      'if-greater': 4,
      'do-swap': 5,
    },
    java: {
      'fn-entry': 2,
      'outer-loop': 4,
      'inner-loop': 5,
      'compare-adjacent': 6,
      'if-greater': 6,
      'do-swap': 7,
    },
    python: {
      'fn-entry': 1,
      'outer-loop': 3,
      'inner-loop': 4,
      'compare-adjacent': 5,
      'if-greater': 5,
      'do-swap': 6,
    },
  },

  generateSteps,
};
