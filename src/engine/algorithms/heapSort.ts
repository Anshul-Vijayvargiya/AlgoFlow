import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';

/**
 * Heap Sort trace (recursive max-heap).
 *
 * Every event below corresponds to a statement the displayed listings really execute:
 *   heapSort:  n → build loop (condition / call heapify / i--) → extract loop (condition / swap arr[0] ↔ arr[i] /
 *              call heapify(arr, i, 0) / i--), including the FALSE check that ends each loop
 *   heapify:   largest = i → l = 2i+1 → r = 2i+2 → left-child check (→ largest = l) → right-child check
 *              (→ largest = r) → largest != i (→ swap → recursive call)
 *
 * The child checks short-circuit like the code: when a child index is outside the heap (l >= n), arr[l] is never read,
 * so that step has no comparedValues and no highlighted child bar. heapify is void and falls off its end: there is no
 * return step, and the `stack` variable shows the frame has been popped. A call is the call statement, followed by
 * the callee's first statement (no step for the function header).
 *
 * sortedIndices only holds final positions: an index is added when the extraction swap moves the current maximum there.
 * The "locked" annotation that follows has no codeRef (no statement runs). extraInfo.subRange is the active heap
 * [0..heapSize-1]; bars past it are already sorted.
 */
function generateHeapSortSteps(input: number[]): ExecutionStep[] {
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
  /** the active heap [0..size-1]; omitted for an empty heap */
  const heap = (size: number) => (size > 0 ? { subRange: [0, size - 1] as [number, number] } : undefined);

  stack.push('heapSort');
  emit({
    type: 'init',
    codeRef: 'init-n',
    variables: { n, stack: stackStr() },
    message: `Initialize heapSort — array of ${n} elements`,
    explanation:
      'Heap Sort first arranges the array into a max-heap (every parent ≥ its children), then repeatedly moves the maximum to the end.',
    actionLabel: 'Initialize',
  });

  /** heapify(arr, size, i): sift arr[i] down until the subtree rooted at i is a max-heap */
  function heapify(size: number, i: number) {
    let largest = i;
    emit({
      type: 'assign',
      codeRef: 'set-largest',
      variables: { n: size, i, largest, stack: stackStr() },
      pointers: { i, largest },
      indices: [i],
      extraInfo: heap(size),
      message: `largest = i = ${i}  (value ${arr[i]})`,
      explanation: `Assume the parent at index ${i} is the largest of itself and its children.`,
      actionLabel: 'largest = i',
    });

    const l = 2 * i + 1;
    const r = 2 * i + 2;
    // A child index is only a position in this heap when it is < size; past it the bar belongs to the sorted part.
    const childPointers = () => ({ i, ...(l < size ? { l } : {}), ...(r < size ? { r } : {}), largest });
    emit({
      type: 'assign',
      codeRef: 'set-left',
      variables: { n: size, i, l, stack: stackStr() },
      pointers: childPointers(),
      indices: l < size ? [l] : [],
      extraInfo: heap(size),
      message: `l = 2 * ${i} + 1 = ${l}`,
      explanation: l < size ? `The left child of index ${i} is at index ${l}.` : `Index ${l} is outside the heap (size ${size}): no left child.`,
      actionLabel: 'l = 2i+1',
    });
    emit({
      type: 'assign',
      codeRef: 'set-right',
      variables: { n: size, i, l, r, stack: stackStr() },
      pointers: childPointers(),
      indices: r < size ? [r] : [],
      extraInfo: heap(size),
      message: `r = 2 * ${i} + 2 = ${r}`,
      explanation: r < size ? `The right child of index ${i} is at index ${r}.` : `Index ${r} is outside the heap (size ${size}): no right child.`,
      actionLabel: 'r = 2i+2',
    });

    for (const side of ['left', 'right'] as const) {
      const c = side === 'left' ? l : r;
      const name = side === 'left' ? 'l' : 'r';
      const exists = c < size;
      const greater = exists && arr[c] > arr[largest];
      emit({
        type: 'condition',
        codeRef: side === 'left' ? 'check-left' : 'check-right',
        variables: exists
          ? { n: size, [name]: c, largest, [`arr[${name}]`]: arr[c], 'arr[largest]': arr[largest], stack: stackStr() }
          : { n: size, [name]: c, largest, stack: stackStr() },
        pointers: childPointers(),
        // a missing child is never read: only the current largest is looked at, and nothing is "compared"
        indices: exists ? [c, largest] : [largest],
        ...(exists ? { comparedValues: { val1: arr[c], val2: arr[largest] } } : {}),
        result: greater ? 'true' : 'false',
        extraInfo: heap(size),
        message: exists
          ? `${name}=${c} < n=${size} && arr[${c}]=${arr[c]} > arr[largest=${largest}]=${arr[largest]} → ${greater ? 'TRUE' : 'FALSE'}`
          : `${name}=${c} < n=${size} → FALSE — no ${side} child, arr[${c}] is not read`,
        explanation: !exists
          ? `The ${side} child index ${c} is outside the heap, so the && stops before comparing anything.`
          : greater
            ? `The ${side} child ${arr[c]} is larger than ${arr[largest]}.`
            : `The ${side} child ${arr[c]} is not larger than ${arr[largest]}.`,
        actionLabel: greater ? 'Condition TRUE' : 'Condition FALSE',
      });
      if (greater) {
        largest = c;
        emit({
          type: 'assign',
          codeRef: side === 'left' ? 'take-left' : 'take-right',
          variables: { n: size, i, largest, 'arr[largest]': arr[largest], stack: stackStr() },
          pointers: childPointers(),
          indices: [largest],
          extraInfo: heap(size),
          message: `largest = ${name} = ${c}  (value ${arr[c]})`,
          explanation: `The ${side} child is the largest so far.`,
          actionLabel: `largest = ${name}`,
        });
      }
    }

    const needsSwap = largest !== i;
    emit({
      type: 'condition',
      codeRef: 'check-swap',
      variables: { n: size, i, largest, stack: stackStr() },
      pointers: childPointers(),
      indices: needsSwap ? [i, largest] : [i],
      result: needsSwap ? 'true' : 'false',
      extraInfo: heap(size),
      message: `largest(${largest}) != i(${i}) → ${needsSwap ? 'TRUE — swap needed' : 'FALSE — this subtree is a max-heap'}`,
      explanation: needsSwap
        ? `A child (${arr[largest]}) is larger than the parent (${arr[i]}), so they are swapped.`
        : `The parent ${arr[i]} is at least as large as its children. heapify returns.`,
      actionLabel: needsSwap ? 'Swap Check TRUE' : 'Heap OK',
    });
    if (!needsSwap) return;

    [arr[i], arr[largest]] = [arr[largest], arr[i]];
    emit({
      type: 'swap',
      codeRef: 'do-swap',
      variables: { n: size, i, largest, 'arr[i]': arr[i], 'arr[largest]': arr[largest], stack: stackStr() },
      pointers: childPointers(),
      indices: [i, largest],
      extraInfo: heap(size),
      message: `Swapped arr[${i}] ↔ arr[${largest}]  (now: ${arr[i]}, ${arr[largest]})`,
      explanation: `The larger child ${arr[i]} moves up. The old parent ${arr[largest]} may still be smaller than its new children, so heapify continues at index ${largest}.`,
      actionLabel: 'Swap',
    });

    emit({
      type: 'loop-start',
      codeRef: 'call-recurse',
      variables: { n: size, largest, stack: stackStr() },
      pointers: { largest },
      indices: [largest],
      extraInfo: heap(size),
      message: `Call heapify(arr, ${size}, ${largest})`,
      explanation: `Repair the subtree rooted at index ${largest}.`,
      actionLabel: 'Recurse',
    });
    stack.push(`heapify(${size},${largest})`);
    heapify(size, largest);
    stack.pop();
  }

  // ── Build the max-heap: for (i = n/2 - 1; i >= 0; i--) heapify(arr, n, i)
  for (let i = Math.floor(n / 2) - 1; ; i--) {
    const go = i >= 0;
    emit({
      type: 'loop-condition',
      codeRef: 'build-loop',
      variables: { i, n, stack: stackStr() },
      pointers: { i },
      indices: go ? [i] : [],
      result: go ? 'true' : 'false',
      extraInfo: heap(n),
      message: `Build heap: i=${i} >= 0 → ${go ? 'true' : 'false'}${go ? '' : ' — max-heap built'}`,
      explanation: go
        ? `Index ${i} is a parent (it has at least one child). Sift it down so its subtree becomes a max-heap.`
        : n > 1
          ? `Every parent has been sifted down: the array is a max-heap, so arr[0] = ${arr[0]} is the maximum.`
          : `With ${n} element${n === 1 ? '' : 's'} there is no parent to sift down.`,
      actionLabel: go ? `Build i=${i}` : 'Build End',
    });
    if (!go) break;

    emit({
      type: 'loop-start',
      codeRef: 'call-build',
      variables: { n, i, stack: stackStr() },
      pointers: { i },
      indices: [i],
      extraInfo: heap(n),
      message: `Call heapify(arr, ${n}, ${i})`,
      explanation: `Sift arr[${i}] = ${arr[i]} down within the whole array (heap size ${n}).`,
      actionLabel: 'Call heapify',
    });
    stack.push(`heapify(${n},${i})`);
    heapify(n, i);
    stack.pop();

    emit({
      type: 'decrement',
      codeRef: 'build-loop',
      variables: { i: i - 1, n, stack: stackStr() },
      pointers: { i: i - 1 },
      extraInfo: heap(n),
      message: `i-- → i=${i - 1}`,
      explanation: `Move to the previous parent.`,
      actionLabel: 'i--',
    });
  }

  // ── Extract: for (i = n - 1; i > 0; i--) { swap(arr[0], arr[i]); heapify(arr, i, 0); }
  for (let i = n - 1; ; i--) {
    const go = i > 0;
    emit({
      type: 'loop-condition',
      codeRef: 'extract-loop',
      variables: { i, stack: stackStr() },
      pointers: { i },
      indices: go ? [0, i] : [],
      result: go ? 'true' : 'false',
      extraInfo: heap(go ? i + 1 : 0),
      message: `Extract: i=${i} > 0 → ${go ? 'true' : 'false'}${go ? '' : ' — all maxima extracted'}`,
      explanation: go
        ? `The heap is arr[0..${i}]. Its maximum arr[0] = ${arr[0]} belongs at index ${i}.`
        : n > 1
          ? `Only the root is left in the heap, and it is the smallest element. The array is sorted.`
          : `With ${n} element${n === 1 ? '' : 's'} there is nothing to extract.`,
      actionLabel: go ? `Extract i=${i}` : 'Extract End',
    });
    if (!go) break;

    const max = arr[0];
    [arr[0], arr[i]] = [arr[i], arr[0]];
    emit({
      type: 'swap',
      codeRef: 'extract-swap',
      variables: { i, 'arr[0]': arr[0], 'arr[i]': arr[i], stack: stackStr() },
      pointers: { i },
      indices: [0, i],
      extraInfo: heap(i + 1),
      message: `Swapped arr[0] ↔ arr[${i}] — maximum ${max} moves to index ${i}`,
      explanation: `The largest remaining value goes to the end of the heap, which is its final position.`,
      actionLabel: 'Extract Max',
    });

    sortedIndices.push(i);
    emit({
      type: 'sorted',
      // No codeRef: this step explains why the bar is final; no statement runs (the code panel highlights nothing)
      variables: { sortedIndex: i, value: arr[i], stack: stackStr() },
      indices: [i],
      extraInfo: heap(i),
      message: `Element ${arr[i]} locked at index ${i} (sorted)`,
      explanation: `Index ${i} is in its final sorted position. The heap shrinks to arr[0..${i - 1}].`,
      actionLabel: 'Element Sorted',
    });

    emit({
      type: 'loop-start',
      codeRef: 'call-extract',
      variables: { n: i, i, stack: stackStr() },
      pointers: { i },
      indices: [0],
      extraInfo: heap(i),
      message: `Call heapify(arr, ${i}, 0)`,
      explanation: `The new root ${arr[0]} may be smaller than its children: repair the heap of size ${i}.`,
      actionLabel: 'Call heapify',
    });
    stack.push(`heapify(${i},0)`);
    heapify(i, 0);
    stack.pop();

    emit({
      type: 'decrement',
      codeRef: 'extract-loop',
      variables: { i: i - 1, stack: stackStr() },
      pointers: { i: i - 1 },
      extraInfo: heap(i),
      message: `i-- → i=${i - 1}`,
      explanation: `The next maximum goes one position further left.`,
      actionLabel: 'i--',
    });
  }

  stack.pop();
  sortedIndices.length = 0;
  sortedIndices.push(...Array.from({ length: n }, (_, k) => k));
  emit({
    type: 'complete',
    codeRef: 'fn-exit',
    variables: { n, stack: stackStr() },
    message: 'Heap Sort complete — array fully sorted!',
    explanation: 'Every maximum was moved to its final position; the last element left in the heap is the minimum.',
    actionLabel: 'Complete',
  });

  return steps;
}

export const heapSortDefinition: AlgorithmDefinition = {
  id: 'heap-sort',
  name: 'Heap Sort',
  category: 'SORTING',
  subtitle: 'Builds a max-heap, then repeatedly moves the maximum to the end in O(n log n) time.',
  description:
    'Heap Sort arranges the array into a max-heap, where every parent is at least as large as its children, so the maximum is at the root. It then swaps the root to the end, shrinks the heap by one and repairs it, until the heap is empty.',
  complexity: {
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(log n)',
    bestFor: 'Guaranteed O(n log n) in-place sorting when the worst case matters',
  },
  defaultInput: [4, 10, 3, 5, 1, 8, 9],

  code: {
    cpp: `void heapify(vector<int>& arr, int n, int i) {
    int largest = i;
    int l = 2 * i + 1;
    int r = 2 * i + 2;
    if (l < n && arr[l] > arr[largest]) largest = l;
    if (r < n && arr[r] > arr[largest]) largest = r;
    if (largest != i) {
        swap(arr[i], arr[largest]);
        heapify(arr, n, largest);
    }
}

void heapSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = n / 2 - 1; i >= 0; i--)
        heapify(arr, n, i);
    for (int i = n - 1; i > 0; i--) {
        swap(arr[0], arr[i]);
        heapify(arr, i, 0);
    }
}`,
    c: `void heapify(int arr[], int n, int i) {
    int largest = i;
    int l = 2 * i + 1;
    int r = 2 * i + 2;
    if (l < n && arr[l] > arr[largest]) largest = l;
    if (r < n && arr[r] > arr[largest]) largest = r;
    if (largest != i) {
        int temp = arr[i];
        arr[i] = arr[largest];
        arr[largest] = temp;
        heapify(arr, n, largest);
    }
}

void heapSort(int arr[], int n) {
    for (int i = n / 2 - 1; i >= 0; i--)
        heapify(arr, n, i);
    for (int i = n - 1; i > 0; i--) {
        int temp = arr[0];
        arr[0] = arr[i];
        arr[i] = temp;
        heapify(arr, i, 0);
    }
}`,
    java: `public class HeapSort {
    public static void heapSort(int[] arr) {
        int n = arr.length;
        for (int i = n / 2 - 1; i >= 0; i--)
            heapify(arr, n, i);
        for (int i = n - 1; i > 0; i--) {
            int temp = arr[0];
            arr[0] = arr[i];
            arr[i] = temp;
            heapify(arr, i, 0);
        }
    }

    private static void heapify(int[] arr, int n, int i) {
        int largest = i;
        int l = 2 * i + 1;
        int r = 2 * i + 2;
        if (l < n && arr[l] > arr[largest]) largest = l;
        if (r < n && arr[r] > arr[largest]) largest = r;
        if (largest != i) {
            int temp = arr[i];
            arr[i] = arr[largest];
            arr[largest] = temp;
            heapify(arr, n, largest);
        }
    }
}`,
    python: `def heapify(arr, n, i):
    largest = i
    l = 2 * i + 1
    r = 2 * i + 2
    if l < n and arr[l] > arr[largest]:
        largest = l
    if r < n and arr[r] > arr[largest]:
        largest = r
    if largest != i:
        arr[i], arr[largest] = arr[largest], arr[i]
        heapify(arr, n, largest)

def heap_sort(arr):
    n = len(arr)
    for i in range(n // 2 - 1, -1, -1):
        heapify(arr, n, i)
    for i in range(n - 1, 0, -1):
        arr[0], arr[i] = arr[i], arr[0]
        heapify(arr, i, 0)
    return arr`,
  },

  lineMap: {
    // C++ and Java write `if (child < n && arr[child] > arr[largest]) largest = child;` on one line, so the check and
    // the assignment it guards share that line there; Python puts the assignment on its own line.
    cpp: {
      'init-n': 14,
      'fn-exit': 13,
      'build-loop': 15,
      'call-build': 16,
      'extract-loop': 17,
      'extract-swap': 18,
      'call-extract': 19,
      'set-largest': 2,
      'set-left': 3,
      'set-right': 4,
      'check-left': 5,
      'take-left': 5,
      'check-right': 6,
      'take-right': 6,
      'check-swap': 7,
      'do-swap': 8,
      'call-recurse': 9,
    },
    c: {
      // the statement that sets n (in C, n is a parameter, so the signature)
      'init-n': 15,
      'fn-exit': 15,
      'build-loop': 16,
      'call-build': 17,
      'extract-loop': 18,
      'extract-swap': 19,
      'call-extract': 22,
      'set-largest': 2,
      'set-left': 3,
      'set-right': 4,
      'check-left': 5,
      'take-left': 5,
      'check-right': 6,
      'take-right': 6,
      'check-swap': 7,
      'do-swap': 8,
      'call-recurse': 11,
    },
    java: {
      'init-n': 3,
      'fn-exit': 2,
      'build-loop': 4,
      'call-build': 5,
      'extract-loop': 6,
      'extract-swap': 7,
      'call-extract': 10,
      'set-largest': 15,
      'set-left': 16,
      'set-right': 17,
      'check-left': 18,
      'take-left': 18,
      'check-right': 19,
      'take-right': 19,
      'check-swap': 20,
      'do-swap': 21,
      'call-recurse': 24,
    },
    python: {
      'init-n': 14,
      'fn-exit': 20,
      'build-loop': 15,
      'call-build': 16,
      'extract-loop': 17,
      'extract-swap': 18,
      'call-extract': 19,
      'set-largest': 2,
      'set-left': 3,
      'set-right': 4,
      'check-left': 5,
      'take-left': 6,
      'check-right': 7,
      'take-right': 8,
      'check-swap': 9,
      'do-swap': 10,
      'call-recurse': 11,
    },
  },

  // C and Java swap through a temporary over three lines (int temp = …; a = b; b = temp;); C++ calls swap() and
  // Python uses a tuple assignment on one line. The single swap step (already post-swap) highlights all three.
  lineSpans: {
    c: { 'do-swap': 3, 'extract-swap': 3 },
    java: { 'do-swap': 3, 'extract-swap': 3 },
  },

  generateSteps: generateHeapSortSteps,
};
