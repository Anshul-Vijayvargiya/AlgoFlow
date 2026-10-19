import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';

/**
 * Merge Sort trace — in-place (arr, l, r) variant with temporary `left` / `right` buffers.
 * All four displayed listings implement exactly this algorithm.
 *
 * Events follow the executed statements:
 *   mergeSort: base-case check → (return) → mid → call left → call right → call merge
 *   merge:     copy left buffer → copy right buffer → i,j,k init → main while (condition,
 *              compare, copy) → left-remainder while → right-remainder while
 *
 * The temporary buffers are provided structurally in `step.buffers` (with a cursor) and as text in
 * `variables` (`left`, `right`, `i`, `j`, `k`); the bars
 * always show `arr`. While merging, `arr[l..r]` is overwritten from the left, so a value
 * that was taken from the left buffer may no longer exist on any bar. For that reason a
 * compare step only highlights bars that really still hold a compared value:
 *   - the right element always (arr[m+1+j] is never overwritten before it is read), and
 *   - the left element only while j === 0 (no right element has been written yet).
 *
 * Returns: `return;` in the base case is an explicit step. mergeSort/merge otherwise fall off
 * their end (no statement), so control resumes at the caller's next statement and the `stack`
 * variable shows the frame has been popped. Multi-statement Python bodies (e.g. `arr[k] =
 * left[i]; i += 1; k += 1`) are highlighted at their first statement.
 */
function generateMergeSortSteps(input: number[]): ExecutionStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ExecutionStep[] = [];
  const stack: string[] = [];
  let id = 0;

  const emit = (s: Omit<ExecutionStep, 'id' | 'state'>) => {
    steps.push({ id: id++, state: [...arr], ...s });
  };
  const stackStr = () => stack.join(' › ');
  const fmt = (a: number[]) => `[${a.join(', ')}]`;
  const range = (l: number, r: number) => (l < r ? [l, r] : l === r ? [l] : []);

  stack.push(`mergeSort(0,${n - 1})`);
  emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, l: 0, r: n - 1, stack: stackStr() },
    pointers: { l: 0, r: n - 1 },
    message: `Call mergeSort(arr, 0, ${n - 1}) on ${n} element${n === 1 ? '' : 's'}`,
    explanation:
      'Merge Sort splits the range in half, recursively sorts both halves, then merges the two sorted halves.',
    actionLabel: 'Initialize',
  });

  function merge(l: number, m: number, r: number) {
    emit({
      type: 'loop-start',
      codeRef: 'call-merge',
      variables: { l, m, r, stack: stackStr() },
      pointers: { l, m, r },
      indices: [l, r],
      extraInfo: { subRange: [l, r] },
      message: `Call merge(arr, ${l}, ${m}, ${r})`,
      explanation: `Both halves [${l}..${m}] and [${m + 1}..${r}] are sorted. merge combines them into one sorted range.`,
      actionLabel: 'Call merge',
    });
    stack.push(`merge(${l},${m},${r})`);

    const left = arr.slice(l, m + 1);
    const right = arr.slice(m + 1, r + 1);

    emit({
      type: 'assign',
      codeRef: 'make-left',
      variables: { l, m, r, left: fmt(left), stack: stackStr() },
      pointers: { l, m, r },
      buffers: [{ name: 'left', values: [...left] }],
      indices: Array.from({ length: m - l + 1 }, (_, t) => l + t),
      extraInfo: { subRange: [l, r] },
      message: `left = copy of arr[${l}..${m}] = ${fmt(left)}`,
      explanation: `The left half is copied to a temporary buffer, because merging will overwrite arr[${l}..${r}].`,
      actionLabel: 'Copy left',
    });
    emit({
      type: 'assign',
      codeRef: 'make-right',
      variables: { l, m, r, left: fmt(left), right: fmt(right), stack: stackStr() },
      pointers: { l, m, r },
      buffers: [
        { name: 'left', values: [...left] },
        { name: 'right', values: [...right] },
      ],
      indices: Array.from({ length: r - m }, (_, t) => m + 1 + t),
      extraInfo: { subRange: [l, r] },
      message: `right = copy of arr[${m + 1}..${r}] = ${fmt(right)}`,
      explanation: `The right half is copied to a second temporary buffer.`,
      actionLabel: 'Copy right',
    });

    let i = 0;
    let j = 0;
    let k = l;
    // Buffers with their current cursors (i into left, j into right) — values only live here, not on any bar.
    const bufs = () => [
      { name: 'left', values: [...left], cursor: i },
      { name: 'right', values: [...right], cursor: j },
    ];
    const vars = () => ({ i, j, k, left: fmt(left), right: fmt(right), stack: stackStr() });
    // One step per index update, emitted after the variable changed. Python writes each on its own line
    // (`i += 1`, `k += 1`); C, C++ and Java map them to the `arr[k++] = L[i++]` statement that performs them.
    const ADVANCE_TEXT = {
      i: 'i walks to the next element of the left buffer.',
      j: 'j walks to the next element of the right buffer.',
      k: 'k moves to the next write position in arr.',
    };
    const advance = (codeRef: string, name: 'i' | 'j' | 'k') =>
      emit({
        type: 'increment',
        codeRef,
        variables: vars(),
        pointers: { k },
        buffers: bufs(),
        extraInfo: { subRange: [l, r] },
        message: `${name}++ → ${name} = ${{ i, j, k }[name]}`,
        explanation: ADVANCE_TEXT[name],
        actionLabel: `${name}++`,
      });

    emit({
      type: 'assign',
      codeRef: 'init-merge',
      variables: vars(),
      pointers: { k },
      buffers: bufs(),
      indices: [k],
      extraInfo: { subRange: [l, r] },
      message: `i = 0, j = 0, k = ${l}`,
      explanation: `i walks the left buffer, j walks the right buffer, k is the next write position in arr.`,
      actionLabel: 'Init i, j, k',
    });

    // while (i < left.size() && j < right.size())
    for (;;) {
      const go = i < left.length && j < right.length;
      emit({
        type: 'loop-condition',
        codeRef: 'merge-loop',
        variables: vars(),
        pointers: { k },
        buffers: bufs(),
        result: go ? 'true' : 'false',
        extraInfo: { subRange: [l, r] },
        message: `while i=${i} < ${left.length} && j=${j} < ${right.length} → ${go ? 'TRUE' : 'FALSE'}`,
        explanation: go
          ? `Both buffers still have elements to merge.`
          : `At least one buffer is exhausted; the remaining elements are copied below.`,
        actionLabel: go ? 'While TRUE' : 'While FALSE',
      });
      if (!go) break;

      const takeLeft = left[i] <= right[j];
      // arr[m+1+j] still holds right[j]; arr[l+i] still holds left[i] only if no right element was written yet.
      const highlighted = j === 0 ? [l + i, m + 1 + j] : [m + 1 + j];
      emit({
        type: 'compare',
        codeRef: 'compare-halves',
        variables: { ...vars(), 'left[i]': left[i], 'right[j]': right[j] },
        pointers: { k },
        buffers: bufs(),
        indices: highlighted,
        comparedValues: { val1: left[i], val2: right[j] },
        result: takeLeft ? 'true' : 'false',
        extraInfo: { subRange: [l, r] },
        message: `left[${i}]=${left[i]} <= right[${j}]=${right[j]} → ${takeLeft ? 'TRUE' : 'FALSE'}`,
        explanation:
          (takeLeft
            ? `${left[i]} ≤ ${right[j]}: take the element from the left buffer.`
            : `${left[i]} > ${right[j]}: take the element from the right buffer.`) +
          (j === 0
            ? ''
            : ` (The left value ${left[i]} lives only in the left buffer now, so only the right element's bar is highlighted.)`),
        actionLabel: takeLeft ? 'Compare: ≤' : 'Compare: >',
      });

      if (takeLeft) {
        arr[k] = left[i];
        emit({
          type: 'assign',
          codeRef: 'copy-left',
          variables: { ...vars(), 'arr[k]': arr[k] },
          pointers: { k },
          buffers: bufs(),
          indices: [k],
          extraInfo: { subRange: [l, r] },
          message: `arr[${k}] = left[${i}] = ${left[i]}`,
          explanation: `Wrote ${left[i]} from the left buffer to index ${k}, then i and k advance.`,
          actionLabel: 'Place left',
        });
        i++;
        advance('advance-i', 'i');
        k++;
        advance('advance-k-after-left', 'k');
      } else {
        arr[k] = right[j];
        emit({
          type: 'assign',
          codeRef: 'copy-right',
          variables: { ...vars(), 'arr[k]': arr[k] },
          pointers: { k },
          buffers: bufs(),
          indices: [k],
          extraInfo: { subRange: [l, r] },
          message: `arr[${k}] = right[${j}] = ${right[j]}`,
          explanation: `Wrote ${right[j]} from the right buffer to index ${k}, then j and k advance.`,
          actionLabel: 'Place right',
        });
        j++;
        advance('advance-j', 'j');
        k++;
        advance('advance-k-after-right', 'k');
      }
    }

    // while (i < left.size()) arr[k++] = left[i++];
    for (;;) {
      const go = i < left.length;
      emit({
        type: 'loop-condition',
        codeRef: 'left-loop',
        variables: vars(),
        pointers: { k },
        buffers: bufs(),
        result: go ? 'true' : 'false',
        extraInfo: { subRange: [l, r] },
        message: `while i=${i} < ${left.length} → ${go ? 'TRUE' : 'FALSE'}`,
        explanation: go
          ? `The right buffer is exhausted but the left buffer still has elements.`
          : `The left buffer has no remaining elements.`,
        actionLabel: go ? 'Left rest: TRUE' : 'Left rest: FALSE',
      });
      if (!go) break;
      arr[k] = left[i];
      emit({
        type: 'assign',
        codeRef: 'copy-remaining-left',
        variables: { ...vars(), 'arr[k]': arr[k] },
        pointers: { k },
        buffers: bufs(),
        indices: [k],
        extraInfo: { subRange: [l, r] },
        message: `arr[${k}] = left[${i}] = ${left[i]}  (remaining left)`,
        explanation: `Copying the leftover left element to index ${k}.`,
        actionLabel: 'Remaining left',
      });
      i++;
      advance('advance-i-rest', 'i');
      k++;
      advance('advance-k-left-rest', 'k');
    }

    // while (j < right.size()) arr[k++] = right[j++];
    for (;;) {
      const go = j < right.length;
      emit({
        type: 'loop-condition',
        codeRef: 'right-loop',
        variables: vars(),
        pointers: { k },
        buffers: bufs(),
        result: go ? 'true' : 'false',
        extraInfo: { subRange: [l, r] },
        message: `while j=${j} < ${right.length} → ${go ? 'TRUE' : 'FALSE'}`,
        explanation: go
          ? `The left buffer is exhausted but the right buffer still has elements.`
          : `The right buffer has no remaining elements. The range [${l}..${r}] is merged.`,
        actionLabel: go ? 'Right rest: TRUE' : 'Right rest: FALSE',
      });
      if (!go) break;
      arr[k] = right[j];
      emit({
        type: 'assign',
        codeRef: 'copy-remaining-right',
        variables: { ...vars(), 'arr[k]': arr[k] },
        pointers: { k },
        buffers: bufs(),
        indices: [k],
        extraInfo: { subRange: [l, r] },
        message: `arr[${k}] = right[${j}] = ${right[j]}  (remaining right)`,
        explanation: `Copying the leftover right element to index ${k}.`,
        actionLabel: 'Remaining right',
      });
      j++;
      advance('advance-j-rest', 'j');
      k++;
      advance('advance-k-right-rest', 'k');
    }

    stack.pop();
  }

  function mergeSort(l: number, r: number) {
    const base = l >= r;
    emit({
      type: 'condition',
      codeRef: 'base-case',
      variables: { l, r, stack: stackStr() },
      pointers: { l, r },
      indices: range(l, r),
      result: base ? 'true' : 'false',
      extraInfo: { subRange: [l, r] },
      message: `if (l=${l} >= r=${r}) → ${base ? 'TRUE' : 'FALSE'}`,
      explanation: base
        ? `The range has ${r < l ? 'no' : 'one'} element — it is already sorted.`
        : `The range [${l}..${r}] has ${r - l + 1} elements and must be split.`,
      actionLabel: base ? 'Base Case' : 'Split needed',
    });
    if (base) {
      emit({
        type: 'return',
        codeRef: 'base-return',
        variables: { l, r, stack: stackStr() },
        pointers: { l, r },
        indices: range(l, r),
        extraInfo: { subRange: [l, r] },
        message: `return — range [${l}..${r}] needs no work`,
        explanation: `The recursion bottoms out here and control returns to the caller.`,
        actionLabel: 'Return',
      });
      return;
    }

    const mid = Math.floor(l + (r - l) / 2);
    emit({
      type: 'assign',
      codeRef: 'split-range',
      variables: { l, r, mid, stack: stackStr() },
      pointers: { l, mid, r },
      indices: [...new Set([l, mid, r])],
      extraInfo: { subRange: [l, r] },
      message: `mid = l + (r - l) / 2 = ${mid}  → halves [${l}..${mid}] and [${mid + 1}..${r}]`,
      explanation: `Dividing a problem of size ${r - l + 1} into sizes ${mid - l + 1} and ${r - mid}.`,
      actionLabel: 'Divide',
    });

    emit({
      type: 'loop-start',
      codeRef: 'call-left',
      variables: { l, r, mid, stack: stackStr() },
      pointers: { l, mid, r },
      extraInfo: { subRange: [l, r] },
      message: `Call mergeSort(arr, ${l}, ${mid})`,
      explanation: `Recursively sort the left half [${l}..${mid}].`,
      actionLabel: 'Recurse left',
    });
    stack.push(`mergeSort(${l},${mid})`);
    mergeSort(l, mid);
    stack.pop();

    emit({
      type: 'loop-start',
      codeRef: 'call-right',
      variables: { l, r, mid, stack: stackStr() },
      pointers: { l, mid, r },
      extraInfo: { subRange: [l, r] },
      message: `Call mergeSort(arr, ${mid + 1}, ${r})`,
      explanation: `The left call has returned. Now recursively sort the right half [${mid + 1}..${r}].`,
      actionLabel: 'Recurse right',
    });
    stack.push(`mergeSort(${mid + 1},${r})`);
    mergeSort(mid + 1, r);
    stack.pop();

    merge(l, mid, r);
  }

  mergeSort(0, n - 1);

  stack.pop();
  emit({
    type: 'complete',
    codeRef: 'fn-entry',
    sortedIndices: Array.from({ length: n }, (_, i) => i),
    variables: { n, stack: stackStr() },
    message: 'Merge Sort complete — array fully sorted!',
    explanation: 'The top-level mergeSort call has returned; every range has been merged.',
    actionLabel: 'Complete',
  });

  return steps;
}

export const mergeSortDefinition: AlgorithmDefinition = {
  id: 'merge-sort',
  name: 'Merge Sort',
  category: 'SORTING',
  subtitle: 'Divide-and-conquer algorithm that recursively splits and merges sorted halves.',
  description:
    'Merge Sort repeatedly divides the array into two halves until each subarray contains a single element. It then merges adjacent sorted subarrays to produce a fully sorted array.',
  complexity: {
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    bestFor: 'Guaranteed O(n log n) performance and stable sorting requirements',
  },
  defaultInput: [9, 3, 7, 1, 5, 4, 8, 2],

  code: {
    cpp: `void merge(vector<int>& arr, int l, int m, int r) {
    vector<int> left(arr.begin() + l, arr.begin() + m + 1);
    vector<int> right(arr.begin() + m + 1, arr.begin() + r + 1);
    int i = 0, j = 0, k = l;
    while (i < left.size() && j < right.size()) {
        if (left[i] <= right[j]) arr[k++] = left[i++];
        else arr[k++] = right[j++];
    }
    while (i < left.size()) arr[k++] = left[i++];
    while (j < right.size()) arr[k++] = right[j++];
}

void mergeSort(vector<int>& arr, int l, int r) {
    if (l >= r) return;
    int mid = l + (r - l) / 2;
    mergeSort(arr, l, mid);
    mergeSort(arr, mid + 1, r);
    merge(arr, l, mid, r);
}`,
    c: `void merge(int arr[], int l, int m, int r) {
    int n1 = m - l + 1;
    int L[n1];
    for (int i = 0; i < n1; i++) L[i] = arr[l + i];
    int n2 = r - m;
    int R[n2];
    for (int j = 0; j < n2; j++) R[j] = arr[m + 1 + j];
    int i = 0, j = 0, k = l;
    while (i < n1 && j < n2) {
        if (L[i] <= R[j]) arr[k++] = L[i++];
        else arr[k++] = R[j++];
    }
    while (i < n1) arr[k++] = L[i++];
    while (j < n2) arr[k++] = R[j++];
}

void mergeSort(int arr[], int l, int r) {
    if (l >= r) return;
    int mid = l + (r - l) / 2;
    mergeSort(arr, l, mid);
    mergeSort(arr, mid + 1, r);
    merge(arr, l, mid, r);
}`,
    java: `public class MergeSort {
    public static void mergeSort(int[] arr, int l, int r) {
        if (l >= r) return;
        int mid = l + (r - l) / 2;
        mergeSort(arr, l, mid);
        mergeSort(arr, mid + 1, r);
        merge(arr, l, mid, r);
    }

    private static void merge(int[] arr, int l, int m, int r) {
        int[] left = Arrays.copyOfRange(arr, l, m + 1);
        int[] right = Arrays.copyOfRange(arr, m + 1, r + 1);
        int i = 0, j = 0, k = l;
        while (i < left.length && j < right.length) {
            if (left[i] <= right[j]) arr[k++] = left[i++];
            else arr[k++] = right[j++];
        }
        while (i < left.length) arr[k++] = left[i++];
        while (j < right.length) arr[k++] = right[j++];
    }
}`,
    python: `def merge(arr, l, m, r):
    left = arr[l:m + 1]
    right = arr[m + 1:r + 1]
    i, j, k = 0, 0, l
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            arr[k] = left[i]
            i += 1
        else:
            arr[k] = right[j]
            j += 1
        k += 1
    while i < len(left):
        arr[k] = left[i]
        i += 1
        k += 1
    while j < len(right):
        arr[k] = right[j]
        j += 1
        k += 1

def merge_sort(arr, l, r):
    if l >= r:
        return
    mid = l + (r - l) // 2
    merge_sort(arr, l, mid)
    merge_sort(arr, mid + 1, r)
    merge(arr, l, mid, r)`,
  },

  lineMap: {
    cpp: {
      'fn-entry': 13,
      'base-case': 14,
      'base-return': 14,
      'split-range': 15,
      'call-left': 16,
      'call-right': 17,
      'call-merge': 18,
      'make-left': 2,
      'make-right': 3,
      'init-merge': 4,
      'merge-loop': 5,
      'compare-halves': 6,
      'copy-left': 6,
      'copy-right': 7,
      'left-loop': 9,
      'copy-remaining-left': 9,
      'right-loop': 10,
      'copy-remaining-right': 10,
      'advance-i': 6,
      'advance-k-after-left': 6,
      'advance-j': 7,
      'advance-k-after-right': 7,
      'advance-i-rest': 9,
      'advance-k-left-rest': 9,
      'advance-j-rest': 10,
      'advance-k-right-rest': 10,
    },
    c: {
      'fn-entry': 17,
      'base-case': 18,
      'base-return': 18,
      'split-range': 19,
      'call-left': 20,
      'call-right': 21,
      'call-merge': 22,
      'make-left': 2,
      'make-right': 5,
      'init-merge': 8,
      'merge-loop': 9,
      'compare-halves': 10,
      'copy-left': 10,
      'copy-right': 11,
      'left-loop': 13,
      'copy-remaining-left': 13,
      'right-loop': 14,
      'copy-remaining-right': 14,
      'advance-i': 10,
      'advance-k-after-left': 10,
      'advance-j': 11,
      'advance-k-after-right': 11,
      'advance-i-rest': 13,
      'advance-k-left-rest': 13,
      'advance-j-rest': 14,
      'advance-k-right-rest': 14,
    },
    java: {
      'fn-entry': 2,
      'base-case': 3,
      'base-return': 3,
      'split-range': 4,
      'call-left': 5,
      'call-right': 6,
      'call-merge': 7,
      'make-left': 11,
      'make-right': 12,
      'init-merge': 13,
      'merge-loop': 14,
      'compare-halves': 15,
      'copy-left': 15,
      'copy-right': 16,
      'left-loop': 18,
      'copy-remaining-left': 18,
      'right-loop': 19,
      'copy-remaining-right': 19,
      'advance-i': 15,
      'advance-k-after-left': 15,
      'advance-j': 16,
      'advance-k-after-right': 16,
      'advance-i-rest': 18,
      'advance-k-left-rest': 18,
      'advance-j-rest': 19,
      'advance-k-right-rest': 19,
    },
    python: {
      'fn-entry': 22,
      'base-case': 23,
      'base-return': 24,
      'split-range': 25,
      'call-left': 26,
      'call-right': 27,
      'call-merge': 28,
      'make-left': 2,
      'make-right': 3,
      'init-merge': 4,
      'merge-loop': 5,
      'compare-halves': 6,
      'copy-left': 7,
      'copy-right': 10,
      'left-loop': 13,
      'copy-remaining-left': 14,
      'right-loop': 17,
      'copy-remaining-right': 18,
      'advance-i': 8,
      'advance-k-after-left': 12,
      'advance-j': 11,
      'advance-k-after-right': 12,
      'advance-i-rest': 15,
      'advance-k-left-rest': 16,
      'advance-j-rest': 19,
      'advance-k-right-rest': 20,
    },
  },

  // C sizes, declares and fills each buffer in three statements; C++, Java and Python create a buffer in one.
  lineSpans: {
    c: { 'make-left': 3, 'make-right': 3 },
  },

  generateSteps: generateMergeSortSteps,
};
