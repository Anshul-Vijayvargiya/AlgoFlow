import type { AlgorithmDefinition, ExecutionStep, NumberCell } from '../../types/algorithm';

/** the example nums2, shown with the default nums1 */
const MERGE_DEFAULT_SECOND = [2, 5, 6] as const;

/**
 * Merge Sorted Array, in place, backwards. nums1 holds m sorted values followed by n placeholders; nums2 holds n
 * sorted values. Three pointers start at the ends: i (last value of nums1), j (last of nums2) and k (last slot). The
 * larger of nums1[i] and nums2[j] goes to nums1[k]; its pointer and k move left. Writing from the back never
 * overwrites a value not yet merged (k ≥ i + j + 1). When nums2 runs out, nums1's remaining values are already in place.
 *
 * The input is nums1's m values; params.second is nums2 (n = its length). The trace's array is nums1 with its n
 * placeholders (0, as in the problem); nums2 is shown beside it as a buffer.
 */
function generateMergeSortedArraySteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  // Used exactly as given (the UI requires both arrays sorted ascending and never sorts silently). Without a second
  // array, the example nums2 is used, as other algorithms use their example target; null is refused.
  if (params?.second === null) throw new TypeError('Merge Sorted Array: nums2 is null; pass an array or omit it.');
  const nums2 = Array.isArray(params?.second) ? [...(params.second as number[])] : [...MERGE_DEFAULT_SECOND];
  const m = input.length;
  const n = nums2.length;
  const nums1 = [...input, ...Array<number>(n).fill(0)];
  const steps: ExecutionStep[] = [];

  let i = m - 1;
  let j = n - 1;
  let k = m + n - 1;
  let started = false;

  type Roles = Record<string, NumberCell['role']>;
  // the same five cards at every step (a stable layout); a pointer's card is "—" before it is set
  const cards = (roles: Roles = {}): NumberCell[] => [
    { name: 'i', value: started ? i : null, role: roles.i },
    { name: 'j', value: started ? j : null, role: roles.j },
    { name: 'k', value: started ? k : null, role: roles.k },
    { name: 'nums1[i]', value: started && i >= 0 ? nums1[i] : null, role: roles['nums1[i]'] },
    { name: 'nums2[j]', value: started && j >= 0 ? nums2[j] : null, role: roles['nums2[j]'] },
  ];
  /** positions k+1 .. m+n-1 hold their final values */
  const merged = () => Array.from({ length: m + n - 1 - k }, (_, d) => k + 1 + d);
  // nums2 beside the bars (an empty nums2 draws nothing: the explanation says it is empty)
  const buffer = () =>
    n === 0 ? [] : [{ name: 'nums2', label: 'nums2', cursorLabel: 'j', values: [...nums2], ...(started && j >= 0 ? { cursor: j } : {}) }];
  // nums1's own unmerged values are 0..i; the slots i+1..k are placeholders or stale copies, overwritten in turn; the
  // slots after k are final (drawn as sorted). No working range is set: the slot being written (k) is outside 0..i,
  // and a highlighted bar is never outside the step's range.
  const view = () => ({
    state: [...nums1],
    pointers: started ? { i, k } : {},
    sortedIndices: merged(),
    buffers: buffer(),
  });
  const push = (s: Omit<ExecutionStep, 'id' | 'state'> & { state?: number[] }) => steps.push({ id: steps.length, ...view(), ...s } as ExecutionStep);

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { m, n },
    tracker: cards(),
    message: `Merge nums2 [${nums2.join(', ')}] into nums1 [${nums1.join(', ')}] (m = ${m}, n = ${n})`,
    explanation:
      n === 0
        ? 'nums2 is empty: nums1 is already the merged array.'
        : `nums1 has room for ${m + n} values: its ${m} sorted value${m === 1 ? '' : 's'} and ${n} placeholder${n === 1 ? '' : 's'} at the end. Merging from the back fills the placeholders first, so no value is overwritten before it is merged.`,
    actionLabel: 'Initialize',
  });

  started = true;
  push({
    type: 'assign',
    codeRef: 'init-pointers',
    variables: { i, j, k },
    indices: [i, k].filter(x => x >= 0),
    tracker: cards({ i: 'changed', j: 'changed', k: 'changed' }),
    message: `i = m - 1 = ${i}, j = n - 1 = ${j}, k = m + n - 1 = ${k}`,
    explanation: 'i: the last value of nums1 still to merge; j: the last of nums2; k: the slot the next largest value goes to.',
    actionLabel: 'Init pointers',
  });

  for (;;) {
    const inLoop = j >= 0;
    push({
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { i, j, k },
      indices: inLoop ? [k] : [],
      tracker: cards({ j: 'current' }),
      result: inLoop ? 'true' : 'false',
      message: `j >= 0?  ${j} >= 0 → ${inLoop}`,
      explanation: inLoop
        ? `nums2[${j}] = ${nums2[j]} is not merged yet.`
        : i >= 0
          ? `nums2 is fully merged. nums1[0..${i}] were never moved: they are the smallest values and already in place.`
          : 'nums2 is fully merged.',
      actionLabel: inLoop ? 'Loop TRUE' : 'Loop FALSE',
    });
    if (!inLoop) break;

    const takeFirst = i >= 0 && nums1[i] > nums2[j];
    push({
      type: 'compare',
      codeRef: 'compare',
      variables: { i, j, ...(i >= 0 ? { 'nums1[i]': nums1[i] } : {}), 'nums2[j]': nums2[j] },
      indices: i >= 0 ? [i] : [],
      ...(i >= 0 ? { comparedValues: { val1: nums1[i], val2: nums2[j] } } : {}),
      tracker: cards({ 'nums1[i]': i >= 0 ? 'current' : undefined, 'nums2[j]': 'current' }),
      result: takeFirst ? 'true' : 'false',
      message:
        i >= 0
          ? `i >= 0 && nums1[i] > nums2[j]?  ${nums1[i]} > ${nums2[j]} → ${takeFirst}`
          : `i >= 0?  ${i} >= 0 → false (nums1 has no values left)`,
      explanation:
        i < 0
          ? `Every value of nums1 is merged, so nums2[${j}] = ${nums2[j]} comes next.`
          : takeFirst
            ? `${nums1[i]} is larger: it goes to slot ${k}.`
            : nums1[i] === nums2[j]
              ? `Equal values: nums2's ${nums2[j]} goes to slot ${k} (either order gives the same array).`
              : `${nums2[j]} is larger: it goes to slot ${k}.`,
      actionLabel: takeFirst ? 'Take nums1[i]' : 'Take nums2[j]',
    });

    if (takeFirst) {
      const value = nums1[i];
      nums1[k] = value;
      push({
        type: 'assign',
        codeRef: 'write-from-first',
        variables: { k, i, 'nums1[k]': value },
        indices: [k, i],
        tracker: cards({ k: 'current', 'nums1[i]': 'current' }),
        message: `nums1[${k}] = nums1[${i}] = ${value}`,
        explanation: `${value} moves from index ${i} to its final place, index ${k}.`,
        actionLabel: 'Write',
      });
      i--;
      push({
        type: 'decrement',
        codeRef: 'decrement-i',
        variables: { i },
        indices: i >= 0 ? [i] : [],
        tracker: cards({ i: 'changed' }),
        message: `i-- → i = ${i}`,
        explanation: i >= 0 ? `The next value of nums1 to merge is nums1[${i}] = ${nums1[i]}.` : 'nums1 has no values left to merge.',
        actionLabel: 'i--',
      });
    } else {
      const value = nums2[j];
      nums1[k] = value;
      push({
        type: 'assign',
        codeRef: 'write-from-second',
        variables: { k, j, 'nums1[k]': value },
        indices: [k],
        tracker: cards({ k: 'current', 'nums2[j]': 'current' }),
        message: `nums1[${k}] = nums2[${j}] = ${value}`,
        explanation: `${value} from nums2 goes to its final place, index ${k}.`,
        actionLabel: 'Write',
      });
      j--;
      push({
        type: 'decrement',
        codeRef: 'decrement-j',
        variables: { j },
        indices: [],
        tracker: cards({ j: 'changed' }),
        message: `j-- → j = ${j}`,
        explanation: j >= 0 ? `The next value of nums2 to merge is nums2[${j}] = ${nums2[j]}.` : 'Every value of nums2 is merged.',
        actionLabel: 'j--',
      });
    }

    k--;
    push({
      type: 'decrement',
      codeRef: 'decrement-k',
      variables: { k },
      indices: k >= 0 ? [k] : [],
      tracker: cards({ k: 'changed' }),
      message: `k-- → k = ${k}`,
      explanation: `Slots ${k + 1}..${m + n - 1} are final; the next value goes to slot ${k}.`,
      actionLabel: 'k--',
    });
  }

  // after the loop every position is final (the values left in nums1[0..i] were never moved)
  push({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { m, n },
    sortedIndices: nums1.map((_, x) => x),
    pointers: {},
    tracker: cards(),
    outcomeText: `Merged: [${nums1.join(', ')}]`,
    message: `Done — nums1 = [${nums1.join(', ')}]`,
    explanation: `Each of the m + n positions is written at most once: O(m + n) time; the merge happens inside nums1: O(1) extra space.`,
    actionLabel: 'Complete',
  });

  return steps;
}

export const mergeSortedArrayDefinition: AlgorithmDefinition = {
  id: 'merge-sorted-array',
  name: 'Merge Sorted Array',
  category: 'ARRAYS',
  subtitle: 'Three pointers merge nums2 into nums1 from the back, in place.',
  description:
    'Two sorted arrays: nums1 with m values followed by n empty slots, and nums2 with n values. Comparing their last values and writing the larger into nums1’s last free slot merges them in place, without overwriting anything not yet merged.',
  complexity: {
    best: 'O(m + n)',
    average: 'O(m + n)',
    worst: 'O(m + n)',
    space: 'O(1)',
    bestFor: 'Merging a sorted array into another that has room for it, without extra memory',
  },
  defaultInput: [1, 2, 3],
  inputSpec: {
    sortedRequired: true,
    arrayLabel: 'nums1',
    secondArray: { label: 'nums2', hint: 'nums2 is merged into nums1 (m and n are the two lengths); either may be empty', defaultValue: MERGE_DEFAULT_SECOND },
  },
  positionPointers: ['i', 'k'],

  code: {
    c: `void merge(int nums1[], int m, int nums2[], int n) {
    int i = m - 1, j = n - 1, k = m + n - 1;
    while (j >= 0) {
        if (i >= 0 && nums1[i] > nums2[j]) {
            nums1[k] = nums1[i];
            i--;
        } else {
            nums1[k] = nums2[j];
            j--;
        }
        k--;
    }
}`,
    cpp: `void merge(vector<int>& nums1, int m, vector<int>& nums2, int n) {
    int i = m - 1, j = n - 1, k = m + n - 1;
    while (j >= 0) {
        if (i >= 0 && nums1[i] > nums2[j]) {
            nums1[k] = nums1[i];
            i--;
        } else {
            nums1[k] = nums2[j];
            j--;
        }
        k--;
    }
}`,
    java: `public class MergeSortedArray {
    public static void merge(int[] nums1, int m, int[] nums2, int n) {
        int i = m - 1, j = n - 1, k = m + n - 1;
        while (j >= 0) {
            if (i >= 0 && nums1[i] > nums2[j]) {
                nums1[k] = nums1[i];
                i--;
            } else {
                nums1[k] = nums2[j];
                j--;
            }
            k--;
        }
    }
}`,
    python: `def merge(nums1, m, nums2, n):
    i, j, k = m - 1, n - 1, m + n - 1
    while j >= 0:
        if i >= 0 and nums1[i] > nums2[j]:
            nums1[k] = nums1[i]
            i -= 1
        else:
            nums1[k] = nums2[j]
            j -= 1
        k -= 1`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'init-pointers': 2, 'loop-condition': 3, compare: 4, 'write-from-first': 5, 'decrement-i': 6, 'write-from-second': 8, 'decrement-j': 9, 'decrement-k': 11 },
    cpp: { 'fn-entry': 1, 'init-pointers': 2, 'loop-condition': 3, compare: 4, 'write-from-first': 5, 'decrement-i': 6, 'write-from-second': 8, 'decrement-j': 9, 'decrement-k': 11 },
    java: { 'fn-entry': 2, 'init-pointers': 3, 'loop-condition': 4, compare: 5, 'write-from-first': 6, 'decrement-i': 7, 'write-from-second': 9, 'decrement-j': 10, 'decrement-k': 12 },
    python: { 'fn-entry': 1, 'init-pointers': 2, 'loop-condition': 3, compare: 4, 'write-from-first': 5, 'decrement-i': 6, 'write-from-second': 8, 'decrement-j': 9, 'decrement-k': 10 },
  },

  generateSteps: generateMergeSortedArraySteps,
};
