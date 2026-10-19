import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';

/**
 * Quick Sort trace (Lomuto partition, last element as pivot).
 *
 * Every event below corresponds to a statement the displayed listings really execute:
 *   quickSort:  range check → call partition → assign pi → call left → call right
 *   partition:  pivot → i = low-1 → for-loop (init/condition/increment) → if compare
 *               → i++ → swap (ALWAYS executed, so self-swaps are shown) → pivot swap
 *               (ALWAYS executed) → return i+1
 *
 * Returns: `return i + 1` is an explicit step. quickSort is void and falls off its
 * end, so there is no step for it: control resumes at the caller's next statement and
 * the `stack` variable shows the frame has been popped.
 * Multi-line swaps (C/Java temp swap) are highlighted at their first line.
 */
function generateQuickSortSteps(input: number[]): ExecutionStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ExecutionStep[] = [];
  const sortedIndices: number[] = [];
  const stack: string[] = [];
  let id = 0;

  const emit = (s: Omit<ExecutionStep, 'id' | 'state' | 'sortedIndices'>) => {
    steps.push({ id: id++, state: [...arr], sortedIndices: [...sortedIndices], ...s });
  };
  const stackStr = () => stack.join(' › ');
  const range = (low: number, high: number) => (low < high ? [low, high] : low === high ? [low] : []);

  stack.push(`quickSort(${0},${n - 1})`);
  emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, low: 0, high: n - 1, stack: stackStr() },
    pointers: { low: 0, high: n - 1 },
    message: `Call quickSort(arr, 0, ${n - 1}) on ${n} element${n === 1 ? '' : 's'}`,
    explanation:
      'Quick Sort picks a pivot, partitions the range around it, then recursively sorts the left and right parts.',
    actionLabel: 'Initialize',
  });

  function partition(low: number, high: number): number {
    const pivot = arr[high];
    emit({
      type: 'assign',
      codeRef: 'pick-pivot',
      variables: { low, high, pivot, stack: stackStr() },
      pointers: { low, high },
      indices: [high],
      extraInfo: { pivotIndex: high, subRange: [low, high] },
      message: `pivot = arr[${high}] = ${pivot}`,
      explanation: `The last element of range [${low}..${high}] is the pivot. Elements ≤ ${pivot} will be moved to its left.`,
      actionLabel: 'Pick Pivot',
    });

    let i = low - 1;
    emit({
      type: 'assign',
      codeRef: 'init-i',
      variables: { low, high, pivot, i, stack: stackStr() },
      pointers: { i, low, high },
      extraInfo: { pivotIndex: high, subRange: [low, high] },
      message: `i = low - 1 = ${i}`,
      explanation: `i marks the end of the "≤ pivot" region. It starts just before the range (index ${i}).`,
      actionLabel: 'i = low-1',
    });

    for (let j = low; ; j++) {
      const inRange = j < high;
      emit({
        type: 'loop-condition',
        codeRef: 'loop-j',
        variables: { low, high, pivot, i, j, stack: stackStr() },
        pointers: { i, j },
        indices: inRange ? [j] : [],
        result: inRange ? 'true' : 'false',
        extraInfo: { pivotIndex: high, subRange: [low, high] },
        message: `for: j=${j} < high=${high} → ${inRange ? 'TRUE' : 'FALSE — scan finished'}`,
        explanation: inRange
          ? `Examining arr[${j}] = ${arr[j]}.`
          : `All elements before the pivot have been examined.`,
        actionLabel: inRange ? `j=${j}` : 'Loop End',
      });
      if (!inRange) break;

      const le = arr[j] <= pivot;
      emit({
        type: 'compare',
        codeRef: 'compare-pivot',
        variables: { j, i, 'arr[j]': arr[j], pivot, stack: stackStr() },
        pointers: { i, j },
        indices: [j, high],
        comparedValues: { val1: arr[j], val2: pivot },
        result: le ? 'true' : 'false',
        extraInfo: { pivotIndex: high, subRange: [low, high] },
        message: `arr[${j}]=${arr[j]} <= pivot=${pivot} → ${le ? 'TRUE' : 'FALSE'}`,
        explanation: le
          ? `${arr[j]} ≤ ${pivot}: it belongs in the left region, so i is incremented and arr[i] is swapped with arr[${j}].`
          : `${arr[j]} > ${pivot}: it stays where it is; j moves on.`,
        actionLabel: le ? 'Compare: ≤' : 'Compare: >',
      });

      if (le) {
        i++;
        emit({
          type: 'increment',
          codeRef: 'inc-i',
          variables: { i, j, stack: stackStr() },
          pointers: { i, j },
          indices: [i],
          extraInfo: { pivotIndex: high, subRange: [low, high] },
          message: `i++ → i=${i}`,
          explanation: `The left region now ends at index ${i}.`,
          actionLabel: 'i++',
        });

        const same = i === j;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        emit({
          type: 'swap',
          codeRef: 'swap-smaller',
          variables: { i, j, 'arr[i]': arr[i], 'arr[j]': arr[j], stack: stackStr() },
          pointers: { i, j },
          indices: [i, j],
          extraInfo: { pivotIndex: high, subRange: [low, high] },
          message: same
            ? `swap(arr[${i}], arr[${j}]) — same position, array unchanged`
            : `Swapped arr[${i}] ↔ arr[${j}]  (now ${arr[i]}, ${arr[j]})`,
          explanation: same
            ? `i and j are equal, so the swap exchanges an element with itself. The code still executes it.`
            : `Moved ${arr[i]} into the left region.`,
          actionLabel: same ? 'Swap (self)' : 'Swap',
        });
      }
    }

    const pivotPos = i + 1;
    [arr[pivotPos], arr[high]] = [arr[high], arr[pivotPos]];
    sortedIndices.push(pivotPos);
    emit({
      type: 'swap',
      codeRef: 'place-pivot',
      variables: { i, pivotPos, high, pivot, stack: stackStr() },
      pointers: { i },
      indices: [pivotPos, high],
      extraInfo: { pivotIndex: pivotPos, subRange: [low, high] },
      message:
        pivotPos === high
          ? `swap(arr[${pivotPos}], arr[${high}]) — pivot already in place, array unchanged`
          : `Pivot ${pivot} swapped from index ${high} to ${pivotPos}`,
      explanation: `Pivot ${pivot} is now at its final sorted position ${pivotPos}: everything left of it is ≤ ${pivot}, everything right is > ${pivot}.`,
      actionLabel: 'Place Pivot',
    });

    emit({
      type: 'return',
      codeRef: 'return-pivot',
      variables: { i, returnVal: pivotPos, stack: stackStr() },
      pointers: { i },
      indices: [pivotPos],
      extraInfo: { pivotIndex: pivotPos, subRange: [low, high] },
      message: `return i + 1 = ${pivotPos}`,
      explanation: `partition returns the pivot's final index ${pivotPos} to quickSort.`,
      actionLabel: 'Return',
    });
    return pivotPos;
  }

  function quickSort(low: number, high: number) {
    const go = low < high;
    // A single-element range is already in its final position (it is not touched by any later call).
    if (low === high && !sortedIndices.includes(low)) sortedIndices.push(low);
    emit({
      type: 'condition',
      codeRef: 'range-check',
      variables: { low, high, stack: stackStr() },
      pointers: { low, high },
      indices: range(low, high),
      result: go ? 'true' : 'false',
      extraInfo: { subRange: [low, high] },
      message: `if (low=${low} < high=${high}) → ${go ? 'TRUE' : 'FALSE'}`,
      explanation: go
        ? `Range [${low}..${high}] has ${high - low + 1} elements, so it must be partitioned.`
        : high < low
          ? `Empty range — nothing to do; quickSort returns.`
          : `Single element ${arr[low]} is already sorted; quickSort returns.`,
      actionLabel: go ? 'Range: TRUE' : 'Base Case',
    });
    if (!go) return;

    emit({
      type: 'loop-start',
      codeRef: 'call-partition',
      variables: { low, high, stack: stackStr() },
      pointers: { low, high },
      indices: [low, high],
      extraInfo: { subRange: [low, high] },
      message: `Call partition(arr, ${low}, ${high})`,
      explanation: `partition rearranges arr[${low}..${high}] around the pivot and reports where the pivot ends up.`,
      actionLabel: 'Call partition',
    });
    stack.push(`partition(${low},${high})`);
    const pi = partition(low, high);
    stack.pop();

    emit({
      type: 'assign',
      codeRef: 'call-partition',
      variables: { low, high, pi, stack: stackStr() },
      pointers: { low, high, pi },
      indices: [pi],
      extraInfo: { pivotIndex: pi, subRange: [low, high] },
      message: `pi = ${pi}`,
      explanation: `partition returned ${pi}. Left part: [${low}..${pi - 1}], right part: [${pi + 1}..${high}].`,
      actionLabel: 'pi = partition()',
    });

    emit({
      type: 'loop-start',
      codeRef: 'call-left',
      variables: { low, high, pi, stack: stackStr() },
      pointers: { low, high, pi },
      extraInfo: { pivotIndex: pi, subRange: [low, high] },
      message: `Call quickSort(arr, ${low}, ${pi - 1})`,
      explanation: `Recursively sort the part left of the pivot.`,
      actionLabel: 'Recurse left',
    });
    stack.push(`quickSort(${low},${pi - 1})`);
    quickSort(low, pi - 1);
    stack.pop();

    emit({
      type: 'loop-start',
      codeRef: 'call-right',
      variables: { low, high, pi, stack: stackStr() },
      pointers: { low, high, pi },
      extraInfo: { pivotIndex: pi, subRange: [low, high] },
      message: `Call quickSort(arr, ${pi + 1}, ${high})`,
      explanation: `The left call has returned. Now recursively sort the part right of the pivot.`,
      actionLabel: 'Recurse right',
    });
    stack.push(`quickSort(${pi + 1},${high})`);
    quickSort(pi + 1, high);
    stack.pop();
  }

  quickSort(0, n - 1);

  stack.pop();
  sortedIndices.length = 0;
  sortedIndices.push(...Array.from({ length: n }, (_, i) => i));
  emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { n, stack: stackStr() },
    message: 'Quick Sort complete — array fully sorted!',
    explanation: 'quickSort has returned from the top-level call; every pivot is in its final position.',
    actionLabel: 'Complete',
  });

  return steps;
}

export const quickSortDefinition: AlgorithmDefinition = {
  id: 'quick-sort',
  name: 'Quick Sort',
  category: 'SORTING',
  subtitle: 'Selects a pivot element and partitions array around it in O(n log n) average time.',
  description:
    'Quick Sort picks an element as pivot and partitions the given array around the picked pivot by placing the pivot at its correct position in sorted array.',
  complexity: {
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n²)',
    space: 'O(log n)',
    bestFor: 'In-place sorting of large datasets with low space overhead',
  },
  defaultInput: [10, 80, 30, 90, 40, 50, 70],

  code: {
    cpp: `int partition(vector<int>& arr, int low, int high) {
    int pivot = arr[high];
    int i = low - 1;
    for (int j = low; j < high; j++) {
        if (arr[j] <= pivot) {
            i++;
            swap(arr[i], arr[j]);
        }
    }
    swap(arr[i + 1], arr[high]);
    return i + 1;
}

void quickSort(vector<int>& arr, int low, int high) {
    if (low < high) {
        int pi = partition(arr, low, high);
        quickSort(arr, low, pi - 1);
        quickSort(arr, pi + 1, high);
    }
}`,
    c: `int partition(int arr[], int low, int high) {
    int pivot = arr[high];
    int i = low - 1;
    for (int j = low; j < high; j++) {
        if (arr[j] <= pivot) {
            i++;
            int temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
        }
    }
    int temp = arr[i + 1];
    arr[i + 1] = arr[high];
    arr[high] = temp;
    return i + 1;
}

void quickSort(int arr[], int low, int high) {
    if (low < high) {
        int pi = partition(arr, low, high);
        quickSort(arr, low, pi - 1);
        quickSort(arr, pi + 1, high);
    }
}`,
    java: `public class QuickSort {
    public static void quickSort(int[] arr, int low, int high) {
        if (low < high) {
            int pi = partition(arr, low, high);
            quickSort(arr, low, pi - 1);
            quickSort(arr, pi + 1, high);
        }
    }

    private static int partition(int[] arr, int low, int high) {
        int pivot = arr[high];
        int i = low - 1;
        for (int j = low; j < high; j++) {
            if (arr[j] <= pivot) {
                i++;
                int temp = arr[i];
                arr[i] = arr[j];
                arr[j] = temp;
            }
        }
        int temp = arr[i + 1];
        arr[i + 1] = arr[high];
        arr[high] = temp;
        return i + 1;
    }
}`,
    python: `def partition(arr, low, high):
    pivot = arr[high]
    i = low - 1
    for j in range(low, high):
        if arr[j] <= pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    arr[i + 1], arr[high] = arr[high], arr[i + 1]
    return i + 1

def quick_sort(arr, low, high):
    if low < high:
        pi = partition(arr, low, high)
        quick_sort(arr, low, pi - 1)
        quick_sort(arr, pi + 1, high)`,
  },

  lineMap: {
    cpp: {
      'fn-entry': 14,
      'range-check': 15,
      'call-partition': 16,
      'call-left': 17,
      'call-right': 18,
      'pick-pivot': 2,
      'init-i': 3,
      'loop-j': 4,
      'compare-pivot': 5,
      'inc-i': 6,
      'swap-smaller': 7,
      'place-pivot': 10,
      'return-pivot': 11,
    },
    c: {
      'fn-entry': 18,
      'range-check': 19,
      'call-partition': 20,
      'call-left': 21,
      'call-right': 22,
      'pick-pivot': 2,
      'init-i': 3,
      'loop-j': 4,
      'compare-pivot': 5,
      'inc-i': 6,
      'swap-smaller': 7,
      'place-pivot': 12,
      'return-pivot': 15,
    },
    java: {
      'fn-entry': 2,
      'range-check': 3,
      'call-partition': 4,
      'call-left': 5,
      'call-right': 6,
      'pick-pivot': 11,
      'init-i': 12,
      'loop-j': 13,
      'compare-pivot': 14,
      'inc-i': 15,
      'swap-smaller': 16,
      'place-pivot': 21,
      'return-pivot': 24,
    },
    python: {
      'fn-entry': 11,
      'range-check': 12,
      'call-partition': 13,
      'call-left': 14,
      'call-right': 15,
      'pick-pivot': 2,
      'init-i': 3,
      'loop-j': 4,
      'compare-pivot': 5,
      'inc-i': 6,
      'swap-smaller': 7,
      'place-pivot': 8,
      'return-pivot': 9,
    },
  },

  // C and Java swap through a temporary over three lines (int temp = …; a = b; b = temp;); C++ calls swap() and
  // Python uses a tuple assignment on one line. The single swap step (already post-swap) highlights all three.
  lineSpans: {
    c: { 'swap-smaller': 3, 'place-pivot': 3 },
    java: { 'swap-smaller': 3, 'place-pivot': 3 },
  },

  generateSteps: generateQuickSortSteps,
};
