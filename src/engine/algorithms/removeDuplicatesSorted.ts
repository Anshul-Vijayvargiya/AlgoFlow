import type { AlgorithmDefinition, ExecutionStep, NumberCell } from '../../types/algorithm';

/**
 * Remove Duplicates from Sorted Array, in place, two pointers. nums[0..slow] holds every distinct value seen so far
 * (the unique prefix); `fast` scans the rest. A value equal to nums[slow] is a duplicate (equal values are adjacent in
 * a sorted array) and is skipped; a different one is the next unique value: slow++ and nums[slow] = nums[fast]. The
 * answer is slow + 1 (0 for an empty array); what lies after the prefix is left over and not part of the result.
 */
function generateRemoveDuplicatesSteps(input: number[]): ExecutionStep[] {
  // Used exactly as given. The UI requires ascending (non-decreasing) input and never sorts silently (as for Binary
  // Search and Two Pointer); on unsorted input this traces what the listings do: remove ADJACENT duplicates only.
  const nums = [...input];
  const n = nums.length;
  const steps: ExecutionStep[] = [];
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [...nums], ...s });

  let slow: number | null = null;
  let fast: number | null = null;
  let skipped = 0;
  type Roles = Record<string, NumberCell['role']>;
  // the same six cards at every step (a stable layout); `unique` is slow + 1, the length of the prefix
  const cards = (roles: Roles = {}): NumberCell[] => [
    { name: 'slow', value: slow, role: roles.slow },
    { name: 'fast', value: fast !== null && fast < n ? fast : null, role: roles.fast },
    { name: 'nums[slow]', value: slow === null ? null : nums[slow], role: roles['nums[slow]'] },
    { name: 'nums[fast]', value: fast === null || fast >= n ? null : nums[fast], role: roles['nums[fast]'] },
    { name: 'unique', value: slow === null ? 0 : slow + 1, role: roles.unique },
    { name: 'skipped', value: skipped, role: roles.skipped },
  ];
  const kept = () => (slow === null ? [] : Array.from({ length: slow + 1 }, (_, k) => k));
  const both = () => ({ pointers: { slow: slow!, fast: fast! }, keptIndices: kept() });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n },
    tracker: cards(),
    message: `Remove duplicates in place: keep one copy of each value of [${nums.join(', ')}] at the front`,
    explanation:
      'The array is sorted, so equal values sit next to each other. A slow pointer marks the end of the unique prefix; a fast pointer scans ahead for the next different value.',
    actionLabel: 'Initialize',
  });

  const empty = n === 0;
  push({
    type: 'condition',
    codeRef: 'check-empty',
    variables: { n },
    tracker: cards(),
    result: empty ? 'true' : 'false',
    message: `n == 0?  ${n} == 0 → ${empty}`,
    explanation: empty ? 'An empty array has no values, so there is nothing to keep.' : 'There is at least one value; the first one is always unique.',
    actionLabel: empty ? 'Empty' : 'Not empty',
  });

  if (empty) {
    push({
      type: 'return',
      codeRef: 'return-empty',
      variables: { unique: 0 },
      tracker: cards({ unique: 'current' }),
      message: 'Return 0',
      explanation: 'No values: the unique prefix is empty.',
      actionLabel: 'Return 0',
    });
    push({
      type: 'complete',
      codeRef: 'return-empty',
      variables: { unique: 0 },
      tracker: cards(),
      outcomeText: '0 unique values: the array is empty',
      message: 'Done — 0 unique values',
      explanation: 'O(1): nothing to scan.',
      actionLabel: 'Complete',
    });
    return steps;
  }

  slow = 0;
  push({
    type: 'assign',
    codeRef: 'init-slow',
    variables: { slow },
    pointers: { slow },
    indices: [0],
    keptIndices: kept(),
    tracker: cards({ slow: 'changed', unique: 'changed' }),
    message: `slow = 0  (nums[0] = ${nums[0]} is kept)`,
    explanation: `The first value, ${nums[0]}, has no earlier copy: the unique prefix starts as [${nums[0]}].`,
    actionLabel: 'slow = 0',
  });

  for (fast = 1; ; fast++) {
    const inLoop = fast < n;
    push({
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { slow, fast, n },
      ...(inLoop ? both() : { pointers: { slow }, keptIndices: kept() }),
      indices: inLoop ? [fast] : [],
      tracker: cards({ fast: inLoop ? 'changed' : undefined }),
      result: inLoop ? 'true' : 'false',
      message: `${fast > 1 ? `fast++ → fast = ${fast};  ` : 'fast = 1;  '}fast < n?  ${fast} < ${n} → ${inLoop}`,
      explanation: inLoop
        ? `Look at nums[${fast}] = ${nums[fast]}.`
        : `Every value has been read: the unique prefix is nums[0..${slow}].`,
      actionLabel: inLoop ? 'Loop TRUE' : 'Loop FALSE',
    });
    if (!inLoop) break;

    const differs = nums[fast] !== nums[slow];
    if (!differs) skipped++;
    push({
      type: 'compare',
      codeRef: 'compare',
      variables: { slow, fast, 'nums[slow]': nums[slow], 'nums[fast]': nums[fast] },
      ...both(),
      indices: [slow, fast],
      comparedValues: { val1: nums[fast], val2: nums[slow] },
      tracker: cards({ 'nums[slow]': 'current', 'nums[fast]': 'current', skipped: differs ? undefined : 'changed' }),
      result: differs ? 'true' : 'false',
      message: `nums[fast] != nums[slow]?  ${nums[fast]} != ${nums[slow]} → ${differs}`,
      explanation: differs
        ? `${nums[fast]} is a new value: it goes right after the prefix.`
        : `${nums[fast]} is a duplicate of the last kept value: skip it (${skipped} skipped so far).`,
      actionLabel: differs ? 'New value' : 'Duplicate — skip',
    });
    if (!differs) continue;

    slow++;
    push({
      type: 'increment',
      codeRef: 'increment-slow',
      variables: { slow, fast },
      pointers: { slow, fast },
      indices: [slow],
      keptIndices: kept().slice(0, -1),
      tracker: cards({ slow: 'changed' }),
      message: `slow++ → slow = ${slow}`,
      explanation:
        slow === fast
          ? `Index ${slow} is the next free slot; it already holds this value (no duplicate has been skipped yet).`
          : `Index ${slow} is the next free slot (it holds ${nums[slow]}, a copy that can be overwritten).`,
      actionLabel: 'slow++',
    });

    const overwritten = nums[slow];
    nums[slow] = nums[fast];
    push({
      type: 'assign',
      codeRef: 'write',
      variables: { slow, fast, 'nums[slow]': nums[slow] },
      ...both(),
      indices: [slow, fast],
      tracker: cards({ 'nums[slow]': 'changed', unique: 'changed' }),
      message: `nums[${slow}] = nums[${fast}] = ${nums[fast]}`,
      explanation:
        slow === fast
          ? `The value is already in place; the unique prefix is now [${nums.slice(0, slow + 1).join(', ')}].`
          : `${overwritten} at index ${slow} is replaced by ${nums[fast]}; the unique prefix is now [${nums.slice(0, slow + 1).join(', ')}].`,
      actionLabel: 'Write',
    });
  }

  const k = slow + 1;
  const prefix = nums.slice(0, k);
  // after the loop: the prefix is the result; anything after it is left over (dimmed)
  const end = { keptIndices: kept(), extraInfo: { subRange: [0, slow] as [number, number] } };
  push({
    type: 'return',
    codeRef: 'return',
    variables: { slow, unique: k },
    pointers: { slow },
    ...end,
    tracker: cards({ unique: 'current' }),
    message: `Return slow + 1 = ${k}`,
    explanation:
      k === n
        ? `All ${n} values were already distinct.`
        : `${k} unique value${k === 1 ? '' : 's'} [${prefix.join(', ')}]; the ${n - k} position${n - k === 1 ? '' : 's'} after the prefix ${n - k === 1 ? 'is' : 'are'} left over.`,
    actionLabel: `Return ${k}`,
  });

  fast = null;
  push({
    type: 'complete',
    codeRef: 'return',
    variables: { unique: k },
    ...end,
    tracker: cards(),
    outcomeText: `${k} unique value${k === 1 ? '' : 's'}: [${prefix.join(', ')}] (nums[0..${slow}])`,
    message: `Done — ${k} unique value${k === 1 ? '' : 's'}`,
    explanation: `One pass with two indices: O(n) time; the array is changed in place with no extra storage: O(1) extra space. ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped.`,
    actionLabel: 'Complete',
  });

  return steps;
}

export const removeDuplicatesSortedDefinition: AlgorithmDefinition = {
  id: 'remove-duplicates-sorted',
  name: 'Remove Duplicates from Sorted Array',
  category: 'ARRAYS',
  subtitle: 'A slow and a fast pointer keep one copy of each value at the front, in place.',
  description:
    'In a sorted array equal values are adjacent. A slow pointer ends the unique prefix; a fast pointer scans ahead and copies each new value right after the prefix. The answer is the prefix length; the array is changed in place.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'De-duplicating sorted data in place, in one pass',
  },
  defaultInput: [1, 1, 2, 2, 3],
  inputSpec: { sortedRequired: true, randomValues: [1, 9] },
  positionPointers: ['slow', 'fast'],

  code: {
    c: `int removeDuplicates(int nums[], int n) {
    if (n == 0)
        return 0;
    int slow = 0;
    for (int fast = 1; fast < n; fast++) {
        if (nums[fast] != nums[slow]) {
            slow++;
            nums[slow] = nums[fast];
        }
    }
    return slow + 1;
}`,
    cpp: `int removeDuplicates(vector<int>& nums) {
    if (nums.empty())
        return 0;
    int slow = 0;
    for (size_t fast = 1; fast < nums.size(); fast++) {
        if (nums[fast] != nums[slow]) {
            slow++;
            nums[slow] = nums[fast];
        }
    }
    return slow + 1;
}`,
    java: `public class RemoveDuplicates {
    public static int removeDuplicates(int[] nums) {
        if (nums.length == 0)
            return 0;
        int slow = 0;
        for (int fast = 1; fast < nums.length; fast++) {
            if (nums[fast] != nums[slow]) {
                slow++;
                nums[slow] = nums[fast];
            }
        }
        return slow + 1;
    }
}`,
    python: `def remove_duplicates(nums):
    if not nums:
        return 0
    slow = 0
    for fast in range(1, len(nums)):
        if nums[fast] != nums[slow]:
            slow += 1
            nums[slow] = nums[fast]
    return slow + 1`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 3, 'init-slow': 4, 'loop-condition': 5, compare: 6, 'increment-slow': 7, write: 8, return: 11 },
    cpp: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 3, 'init-slow': 4, 'loop-condition': 5, compare: 6, 'increment-slow': 7, write: 8, return: 11 },
    java: { 'fn-entry': 2, 'check-empty': 3, 'return-empty': 4, 'init-slow': 5, 'loop-condition': 6, compare: 7, 'increment-slow': 8, write: 9, return: 12 },
    python: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 3, 'init-slow': 4, 'loop-condition': 5, compare: 6, 'increment-slow': 7, write: 8, return: 9 },
  },

  generateSteps: generateRemoveDuplicatesSteps,
};
