import type { AlgorithmDefinition, ExecutionStep, NumberCell } from '../../types/algorithm';

/**
 * Print All Pairs in an Array: every pair (arr[i], arr[j]) with i < j, in index order, by two nested loops (j starts
 * at i + 1, so a pair is never printed with itself or reversed). The array is only read: no sorting, no sums. Equal
 * values at different indices still make pairs. n(n - 1) / 2 pairs; O(n²) time, O(1) extra space besides the output.
 *
 * The bars are the array; i and j are drawn under them, the two bars being paired are highlighted, and every pair
 * printed so far is listed beside the bars as its own row.
 */
function generatePrintAllPairsSteps(input: number[]): ExecutionStep[] {
  if (input.some(v => !Number.isInteger(v))) throw new TypeError('Print All Pairs: every value must be a whole number.');
  const arr = [...input];
  const n = arr.length;
  const steps: ExecutionStep[] = [];
  const pairs: [number, number][] = [];
  let i: number | null = null;
  let j: number | null = null;

  type Roles = Partial<Record<'i' | 'j' | 'printed', NumberCell['role']>>;
  // i reaches n when the outer loop ends, and j reaches n when an inner loop ends: neither names a value then
  const at = (k: number | null) => (k !== null && k < n ? arr[k] : null);
  const cards = (roles: Roles = {}): NumberCell[] => [
    { name: 'arr[i]', value: at(i), role: roles.i },
    { name: 'arr[j]', value: at(j), role: roles.j },
    { name: 'printed', value: pairs.length, role: roles.printed },
  ];
  const fmt = (p: readonly number[]) => `(${p.join(', ')})`;
  /** every pair printed so far, one row each */
  const rows = () => pairs.map((p, k) => ({ name: `pair-${k}`, label: `output[${k}]`, values: [...p] }));
  const where = () => ({ pointers: { ...(i !== null ? { i } : {}), ...(j !== null ? { j } : {}) } });
  const vars = (extra: Record<string, unknown> = {}) => ({
    n,
    ...(i !== null ? { i } : {}),
    ...(j !== null ? { j } : {}),
    printed: pairs.length,
    ...extra,
  });
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [...arr], buffers: rows(), ...s });

  push({
    type: 'init',
    codeRef: 'init-n',
    variables: { n },
    tracker: cards(),
    message: `n = ${n}: print every pair of ${n} value${n === 1 ? '' : 's'}`,
    explanation:
      n < 2
        ? `A pair needs two different positions; with ${n} value${n === 1 ? '' : 's'} there is none, so nothing will be printed.`
        : `Each value is paired with every value after it, so ${n} values give ${n} × ${n - 1} / 2 = ${(n * (n - 1)) / 2} pairs.`,
    actionLabel: 'Initialize',
  });

  // i++ happens on its own step (inc-i), so the loop header only starts i
  for (i = 0; ; ) {
    j = null;
    const outer = i < n;
    push({
      type: 'loop-condition',
      codeRef: 'outer-loop',
      variables: vars(),
      ...where(),
      indices: outer ? [i] : [],
      tracker: cards({ i: outer ? 'current' : undefined }),
      result: outer ? 'true' : 'false',
      message: `i < n?  ${i} < ${n} → ${outer}`,
      explanation: outer
        ? `arr[${i}] = ${arr[i]} is the first value of the next pairs.`
        : n === 0
          ? 'The array is empty: there is nothing to pair.'
          : 'Every index has been the first value of its pairs. The loops are over.',
      actionLabel: outer ? `i = ${i}` : 'Loop ends',
    });
    if (!outer) break;

    j = i + 1;
    push({
      type: 'assign',
      codeRef: 'init-j',
      variables: vars(),
      ...where(),
      indices: j < n ? [i, j] : [i],
      tracker: cards({ j: 'changed' }),
      message: `j = i + 1 = ${j}`,
      explanation: `j starts just after i: the values before index ${i + 1} have already been paired with arr[${i}], and arr[${i}] is never paired with itself.`,
      actionLabel: 'Init j',
    });

    for (;;) {
      const inner = j < n;
      push({
        type: 'loop-condition',
        codeRef: 'inner-loop',
        variables: vars(),
        ...where(),
        indices: inner ? [i, j] : [i],
        tracker: cards(),
        result: inner ? 'true' : 'false',
        message: `j < n?  ${j} < ${n} → ${inner}`,
        explanation: inner
          ? `Next pair: arr[${i}] = ${arr[i]} with arr[${j}] = ${arr[j]}.`
          : i === n - 1
            ? `arr[${i}] is the last value: nothing comes after it to pair with.`
            : `arr[${i}] = ${arr[i]} has been paired with every value after it.`,
        actionLabel: inner ? 'Pair next' : 'Inner ends',
      });
      if (!inner) break;

      const pair: [number, number] = [arr[i], arr[j]];
      pairs.push(pair);
      push({
        type: 'assign',
        codeRef: 'print',
        variables: vars({ 'arr[i]': pair[0], 'arr[j]': pair[1] }),
        ...where(),
        indices: [i, j],
        tracker: cards({ i: 'current', j: 'current', printed: 'changed' }),
        message: `print ${fmt(pair)}  (pair ${pairs.length})`,
        explanation: `Indices ${i} and ${j}: the value at the smaller index comes first. Printed as output[${pairs.length - 1}].`,
        actionLabel: 'Print pair',
      });

      j++;
      push({
        type: 'increment',
        codeRef: 'inc-j',
        variables: vars(),
        ...where(),
        indices: j < n ? [i, j] : [i],
        tracker: cards({ j: 'changed' }),
        message: `j++ → j = ${j}`,
        explanation: 'Move j to the next value after i.',
        actionLabel: 'j++',
      });
    }

    // j belonged to the inner loop that just ended
    j = null;
    i++;
    push({
      type: 'increment',
      codeRef: 'inc-i',
      variables: vars(),
      ...where(),
      indices: i < n ? [i] : [],
      tracker: cards({ i: 'changed' }),
      message: `i++ → i = ${i}`,
      explanation: 'Move on to the next first value.',
      actionLabel: 'i++',
    });
  }

  i = null;
  j = null;
  const k = pairs.length;
  push({
    type: 'complete',
    codeRef: 'fn-exit',
    variables: { n, printed: k },
    tracker: cards({ printed: 'current' }),
    outcomeText: k > 0 ? `${k} pair${k === 1 ? '' : 's'} printed (n × (n − 1) / 2 with n = ${n})` : `No pairs: ${n} value${n === 1 ? '' : 's'}`,
    message: k > 0 ? `Done — ${k} pair${k === 1 ? '' : 's'} printed` : 'Done — no pair to print',
    explanation: `Two nested loops visit each pair of indices i < j once: O(n²) time. Only i and j are kept (O(1) extra space); keeping all ${k} printed pairs would take O(n²).`,
    actionLabel: 'Complete',
  });

  return steps;
}

export const printAllPairsDefinition: AlgorithmDefinition = {
  id: 'print-all-pairs',
  name: 'Print All Pairs in an Array',
  category: 'ARRAYS',
  subtitle: 'Two nested loops print each pair i < j once, in order.',
  description:
    'Print All Pairs in an Array prints every pair (arr[i], arr[j]) of two different positions with i < j. The outer loop picks the first value; the inner loop starts just after it (j = i + 1), so no value is paired with itself and no pair is printed twice in reverse. The array is only read, in its own order: n values give n(n - 1) / 2 pairs.',
  complexity: {
    best: 'O(n²)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    bestFor: 'Generating every pair once (brute-force pair problems); O(n²) more space if the pairs are kept',
  },
  defaultInput: [10, 20, 30, 40],
  positionPointers: ['i', 'j'],

  code: {
    c: `#include <stdio.h>

void printAllPairs(const int arr[], int n) {
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            printf("(%d, %d)\\n", arr[i], arr[j]);
        }
    }
}`,
    cpp: `void printAllPairs(const vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            cout << "(" << arr[i] << ", " << arr[j] << ")\\n";
        }
    }
}`,
    java: `public class PrintAllPairs {
    public static void printAllPairs(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                System.out.println("(" + arr[i] + ", " + arr[j] + ")");
            }
        }
    }
}`,
    python: `def print_all_pairs(arr):
    n = len(arr)
    for i in range(n):
        for j in range(i + 1, n):
            print(f"({arr[i]}, {arr[j]})")`,
  },

  // The loop headers hold their start, test and step, so init-j, inner-loop and inc-j share the inner header (inc-i
  // the outer one). In C n is a parameter (the signature). Nothing is returned: the trace ends on the signature, as
  // Bubble Sort's does.
  lineMap: {
    c: { 'init-n': 3, 'outer-loop': 4, 'inc-i': 4, 'init-j': 5, 'inner-loop': 5, 'inc-j': 5, print: 6, 'fn-exit': 3 },
    cpp: { 'init-n': 2, 'outer-loop': 3, 'inc-i': 3, 'init-j': 4, 'inner-loop': 4, 'inc-j': 4, print: 5, 'fn-exit': 1 },
    java: { 'init-n': 3, 'outer-loop': 4, 'inc-i': 4, 'init-j': 5, 'inner-loop': 5, 'inc-j': 5, print: 6, 'fn-exit': 2 },
    python: { 'init-n': 2, 'outer-loop': 3, 'inc-i': 3, 'init-j': 4, 'inner-loop': 4, 'inc-j': 4, print: 5, 'fn-exit': 1 },
  },

  generateSteps: generatePrintAllPairsSteps,
};
