import type { AlgorithmDefinition, ExecutionStep, NumberCell } from '../../types/algorithm';

type OutputRow = NonNullable<ExecutionStep['buffers']>[number];

/**
 * Print Subarrays: every non-empty contiguous subarray arr[start..end], in start-then-end order, by three nested loops:
 * start picks the first index, end (from start on) the last, and k prints the elements between them one by one. The
 * array is only read. n(n + 1) / 2 subarrays holding n(n + 1)(n + 2) / 6 elements in all: O(n³) time; printing each
 * element directly keeps the extra space O(1).
 *
 * The bars are the array; start, end and k are drawn under them and the bars outside start..end are dimmed. The
 * subarray being printed is a row that fills in element by element; every subarray printed before it is a row of its
 * own. (Finished rows are shared by the steps that show them, so the trace keeps each one once, not once per step.)
 */
function generatePrintSubarraysSteps(input: number[]): ExecutionStep[] {
  if (input.some(v => !Number.isInteger(v))) throw new TypeError('Print Subarrays: every value must be a whole number.');
  const arr = [...input];
  const n = arr.length;
  const steps: ExecutionStep[] = [];
  /** the subarrays printed in full, each row built once */
  const done: OutputRow[] = [];
  /** the elements of the subarray being printed (null between subarrays) */
  let current: number[] | null = null;
  let start: number | null = null;
  let end: number | null = null;
  let k: number | null = null;

  type Roles = Partial<Record<'start' | 'end' | 'k' | 'length' | 'printed', NumberCell['role']>>;
  // each index reaches its loop's bound when the loop ends (start and end: n; k: end + 1); then it names no value
  const at = (x: number | null) => (x !== null && x < n ? arr[x] : null);
  const inRange = () => start !== null && end !== null && end < n;
  const cards = (roles: Roles = {}): NumberCell[] => [
    { name: 'arr[start]', value: at(start), role: roles.start },
    { name: 'arr[end]', value: inRange() ? arr[end!] : null, role: roles.end },
    { name: 'arr[k]', value: k !== null && end !== null && k <= end ? at(k) : null, role: roles.k },
    { name: 'length', value: inRange() ? end! - start! + 1 : null, role: roles.length },
    { name: 'printed', value: done.length, role: roles.printed },
  ];
  const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;
  const rows = (): OutputRow[] => [
    ...done,
    ...(current ? [{ name: `subarray-${done.length}`, label: `output[${done.length}] (printing)`, values: [...current] }] : []),
  ];
  const where = () => ({
    pointers: { ...(start !== null ? { start } : {}), ...(end !== null ? { end } : {}), ...(k !== null ? { k } : {}) },
    // the subarray start..end is the working range: the bars outside it are dimmed
    ...(inRange() ? { extraInfo: { subRange: [start!, end!] as [number, number] } } : {}),
  });
  const vars = (extra: Record<string, unknown> = {}) => ({
    n,
    ...(start !== null ? { start } : {}),
    ...(end !== null ? { end } : {}),
    ...(k !== null ? { k } : {}),
    printed: done.length,
    ...extra,
  });
  const range = () => Array.from({ length: end! - start! + 1 }, (_, d) => start! + d);
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [...arr], buffers: rows(), ...s });

  const total = (n * (n + 1)) / 2;
  push({
    type: 'init',
    codeRef: 'init-n',
    variables: { n },
    tracker: cards(),
    message: `n = ${n}: print every subarray of ${n} value${n === 1 ? '' : 's'}`,
    explanation:
      n === 0
        ? 'A subarray needs at least one value; the array is empty, so nothing will be printed.'
        : `A subarray is a contiguous run start..end. Each start has n − start choices of end, so ${n} values give ${n} × ${n + 1} / 2 = ${total} subarrays.`,
    actionLabel: 'Initialize',
  });

  // each increment happens on its own step (inc-start, inc-end, inc-k), so the loop headers only start the indices
  for (start = 0; ; ) {
    end = null;
    k = null;
    const outer = start < n;
    push({
      type: 'loop-condition',
      codeRef: 'outer-loop',
      variables: vars(),
      ...where(),
      indices: outer ? [start] : [],
      tracker: cards({ start: outer ? 'current' : undefined }),
      result: outer ? 'true' : 'false',
      message: `start < n?  ${start} < ${n} → ${outer}`,
      explanation: outer
        ? `Subarrays beginning at arr[${start}] = ${arr[start]} come next.`
        : n === 0
          ? 'The array is empty: there is no subarray to print.'
          : 'Every index has been the start of its subarrays. The loops are over.',
      actionLabel: outer ? `start = ${start}` : 'Loop ends',
    });
    if (!outer) break;

    end = start;
    push({
      type: 'assign',
      codeRef: 'init-end',
      variables: vars(),
      ...where(),
      indices: [start],
      tracker: cards({ end: 'changed', length: 'changed' }),
      message: `end = start = ${end}`,
      explanation: `The shortest subarray at index ${start} is arr[${start}] alone; end then grows one index at a time.`,
      actionLabel: 'Init end',
    });

    for (;;) {
      const inner = end < n;
      push({
        type: 'loop-condition',
        codeRef: 'inner-loop',
        variables: vars(),
        ...where(),
        indices: inner ? range() : [start],
        tracker: cards(),
        result: inner ? 'true' : 'false',
        message: `end < n?  ${end} < ${n} → ${inner}`,
        explanation: inner
          ? `Next subarray: arr[${start}..${end}], ${end - start + 1} value${end === start ? '' : 's'}.`
          : `Every subarray beginning at index ${start} has been printed.`,
        actionLabel: inner ? 'Next subarray' : 'end loop ends',
      });
      if (!inner) break;

      current = [];
      push({
        type: 'assign',
        codeRef: 'open',
        variables: vars(),
        ...where(),
        indices: range(),
        tracker: cards(),
        message: 'print "["',
        explanation: `Start printing subarray output[${done.length}]: arr[${start}..${end}].`,
        actionLabel: 'Open',
      });

      k = start;
      push({
        type: 'assign',
        codeRef: 'init-k',
        variables: vars(),
        ...where(),
        indices: [k],
        tracker: cards({ k: 'changed' }),
        message: `k = start = ${k}`,
        explanation: 'k walks the subarray from its first index to its last, printing each value.',
        actionLabel: 'Init k',
      });

      for (;;) {
        const elem = k <= end;
        push({
          type: 'loop-condition',
          codeRef: 'k-loop',
          variables: vars(),
          ...where(),
          indices: elem ? [k] : [],
          tracker: cards(),
          result: elem ? 'true' : 'false',
          message: `k <= end?  ${k} <= ${end} → ${elem}`,
          explanation: elem ? `arr[${k}] = ${arr[k]} is in the subarray.` : `k is past end: all ${end - start + 1} value${end === start ? '' : 's'} of the subarray are printed.`,
          actionLabel: elem ? 'Print next' : 'k loop ends',
        });
        if (!elem) break;

        current.push(arr[k]);
        push({
          type: 'assign',
          codeRef: 'print-elem',
          variables: vars({ 'arr[k]': arr[k] }),
          ...where(),
          indices: [k],
          tracker: cards({ k: 'current' }),
          message: `print ${k > start ? `", ${arr[k]}"` : `"${arr[k]}"`}`,
          explanation: k > start ? `A comma, then arr[${k}] = ${arr[k]}.` : `arr[${k}] = ${arr[k]} opens the subarray, with no comma before it.`,
          actionLabel: 'Print value',
        });

        k++;
        push({
          type: 'increment',
          codeRef: 'inc-k',
          variables: vars(),
          ...where(),
          indices: k <= end ? [k] : [],
          tracker: cards({ k: 'changed' }),
          message: `k++ → k = ${k}`,
          explanation: 'Move to the next value of the subarray.',
          actionLabel: 'k++',
        });
      }

      // the subarray is printed in full: from now on every step shares this one row
      done.push({ name: `subarray-${done.length}`, label: `output[${done.length}]`, values: current });
      current = null;
      k = null;
      push({
        type: 'assign',
        codeRef: 'close',
        variables: vars(),
        ...where(),
        indices: range(),
        tracker: cards({ printed: 'changed' }),
        message: `print "]"  → ${fmt(done.at(-1)!.values)}  (subarray ${done.length})`,
        explanation: `Subarray output[${done.length - 1}] is complete, and the line ends.`,
        actionLabel: 'Close',
      });

      end++;
      push({
        type: 'increment',
        codeRef: 'inc-end',
        variables: vars(),
        ...where(),
        indices: end < n ? range() : [],
        tracker: cards({ end: 'changed', length: 'changed' }),
        message: `end++ → end = ${end}`,
        explanation: end < n ? `The subarray grows by one value: arr[${end}] = ${arr[end]}.` : `end has passed the last index.`,
        actionLabel: 'end++',
      });
    }

    // end belonged to the loop that just ended
    end = null;
    start++;
    push({
      type: 'increment',
      codeRef: 'inc-start',
      variables: vars(),
      ...where(),
      indices: start < n ? [start] : [],
      tracker: cards({ start: 'changed' }),
      message: `start++ → start = ${start}`,
      explanation: 'Move on to the subarrays that begin one index later.',
      actionLabel: 'start++',
    });
  }

  start = null;
  end = null;
  k = null;
  const count = done.length;
  push({
    type: 'complete',
    codeRef: 'fn-exit',
    variables: { n, printed: count },
    tracker: cards({ printed: 'current' }),
    outcomeText:
      count > 0
        ? `${count} subarray${count === 1 ? '' : 's'} printed (n × (n + 1) / 2 with n = ${n})`
        : 'No subarrays: the array is empty',
    message: count > 0 ? `Done — ${count} subarray${count === 1 ? '' : 's'} printed` : 'Done — no subarray to print',
    explanation: `${count} subarrays holding ${(n * (n + 1) * (n + 2)) / 6} values in all are printed one value at a time: O(n³) time. Only start, end and k are kept (O(1) extra space); the rows shown here are the printed output, which the program itself does not store.`,
    actionLabel: 'Complete',
  });

  return steps;
}

export const printSubarraysDefinition: AlgorithmDefinition = {
  id: 'print-subarrays',
  name: 'Print Subarrays',
  category: 'ARRAYS',
  subtitle: 'Every contiguous start..end, printed value by value, in order.',
  description:
    'Print Subarrays prints every non-empty contiguous subarray arr[start..end]: the outer loop picks the start, the middle loop extends the end from start to the last index, and the inner loop prints the values between them. n values give n(n + 1) / 2 subarrays, in start-then-end order; the array is only read.',
  complexity: {
    best: 'O(n³)',
    average: 'O(n³)',
    worst: 'O(n³)',
    space: 'O(1)',
    bestFor:
      'Enumerating every contiguous range (brute-force subarray problems); printing values directly needs O(1) extra space, copying each subarray first O(n), and keeping every printed subarray O(n³)',
  },
  defaultInput: [1, 2, 3],
  positionPointers: ['start', 'end', 'k'],

  code: {
    c: `#include <stdio.h>

void printSubarrays(const int arr[], int n) {
    for (int start = 0; start < n; start++) {
        for (int end = start; end < n; end++) {
            printf("[");
            for (int k = start; k <= end; k++) {
                printf(k > start ? ", %d" : "%d", arr[k]);
            }
            printf("]\\n");
        }
    }
}`,
    cpp: `void printSubarrays(const vector<int>& arr) {
    int n = arr.size();
    for (int start = 0; start < n; start++) {
        for (int end = start; end < n; end++) {
            cout << "[";
            for (int k = start; k <= end; k++) {
                cout << (k > start ? ", " : "") << arr[k];
            }
            cout << "]\\n";
        }
    }
}`,
    java: `public class PrintSubarrays {
    public static void printSubarrays(int[] arr) {
        int n = arr.length;
        for (int start = 0; start < n; start++) {
            for (int end = start; end < n; end++) {
                System.out.print("[");
                for (int k = start; k <= end; k++) {
                    System.out.print((k > start ? ", " : "") + arr[k]);
                }
                System.out.println("]");
            }
        }
    }
}`,
    python: `def print_subarrays(arr):
    n = len(arr)
    for start in range(n):
        for end in range(start, n):
            print("[", end="")
            for k in range(start, end + 1):
                print(", " if k > start else "", arr[k], sep="", end="")
            print("]")`,
  },

  // The loop headers hold their start, test and step, so each loop's init / test / increment share its header. In C n
  // is a parameter (the signature). Nothing is returned: the trace ends on the signature, as Print All Pairs' does.
  lineMap: {
    c: {
      'init-n': 3, 'outer-loop': 4, 'inc-start': 4, 'init-end': 5, 'inner-loop': 5, 'inc-end': 5, open: 6,
      'init-k': 7, 'k-loop': 7, 'inc-k': 7, 'print-elem': 8, close: 10, 'fn-exit': 3,
    },
    cpp: {
      'init-n': 2, 'outer-loop': 3, 'inc-start': 3, 'init-end': 4, 'inner-loop': 4, 'inc-end': 4, open: 5,
      'init-k': 6, 'k-loop': 6, 'inc-k': 6, 'print-elem': 7, close: 9, 'fn-exit': 1,
    },
    java: {
      'init-n': 3, 'outer-loop': 4, 'inc-start': 4, 'init-end': 5, 'inner-loop': 5, 'inc-end': 5, open: 6,
      'init-k': 7, 'k-loop': 7, 'inc-k': 7, 'print-elem': 8, close: 10, 'fn-exit': 2,
    },
    python: {
      'init-n': 2, 'outer-loop': 3, 'inc-start': 3, 'init-end': 4, 'inner-loop': 4, 'inc-end': 4, open: 5,
      'init-k': 6, 'k-loop': 6, 'inc-k': 6, 'print-elem': 7, close: 8, 'fn-exit': 1,
    },
  },

  generateSteps: generatePrintSubarraysSteps,
};
