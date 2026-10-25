import type { AlgorithmDefinition, ExecutionStep, NumberCell } from '../../types/algorithm';

/**
 * Boyer–Moore majority vote. Pass 1 pairs off different values: a candidate with a counter, replaced whenever the
 * counter is 0. If a majority exists (more than ⌊n/2⌋ copies) it is the final candidate, but the input may have none,
 * so pass 2 counts the candidate and reports it only when its frequency is greater than ⌊n/2⌋.
 */
function generateMajoritySteps(input: number[]): ExecutionStep[] {
  const nums = [...input];
  const n = nums.length;
  const half = Math.floor(n / 2);
  const steps: ExecutionStep[] = [];
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [...nums], ...s });

  // candidate is null until the first element is read (C, C++ and Java initialise it to 0, Python to None; the value
  // is never used before count == 0 replaces it)
  let candidate: number | null = null;
  let count = 0;
  type Roles = Record<string, NumberCell['role']>;
  const vote = (i: number | null, roles: Roles = {}): NumberCell[] => [
    { name: 'i', value: i, role: roles.i },
    { name: 'nums[i]', value: i === null || i >= n ? null : nums[i], role: roles['nums[i]'] },
    { name: 'candidate', value: candidate, role: roles.candidate },
    { name: 'count', value: count, role: roles.count },
  ];

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, 'n / 2': half },
    tracker: vote(null),
    message: `Majority element: is any value in more than ⌊${n}/2⌋ = ${half} positions?`,
    explanation:
      'Pass 1 (Boyer–Moore voting) finds the only possible majority value. Pass 2 counts it, because the input may have no majority.',
    actionLabel: 'Initialize',
  });

  push({
    type: 'assign',
    codeRef: 'init-vars',
    variables: { candidate: 'none', count },
    tracker: vote(null, { candidate: 'changed', count: 'changed' }),
    message: 'candidate = none, count = 0',
    explanation: 'No candidate yet: with count = 0, the first element becomes the candidate.',
    actionLabel: 'Init',
  });

  // ── pass 1: voting ──
  for (let i = 0; ; i++) {
    const inLoop = i < n;
    push({
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { i, n, candidate: candidate ?? 'none', count },
      pointers: inLoop ? { i } : {},
      indices: inLoop ? [i] : [],
      tracker: vote(i, { i: 'changed' }),
      result: inLoop ? 'true' : 'false',
      message: `${i > 0 ? `i++ → i = ${i};  ` : ''}i < n?  ${i} < ${n} → ${inLoop}`,
      explanation: inLoop
        ? `Pass 1 reads index ${i} (value ${nums[i]}).`
        : n === 0
          ? 'The array is empty: there is no candidate.'
          : `Pass 1 is done: the candidate is ${candidate}. It is the only value that can be a majority, but it is not one yet — pass 2 checks.`,
      actionLabel: inLoop ? 'Loop TRUE' : 'Loop FALSE',
    });
    if (!inLoop) break;

    const x = nums[i];
    const empty = count === 0;
    push({
      type: 'condition',
      codeRef: 'check-zero',
      variables: { i, 'nums[i]': x, count },
      pointers: { i },
      indices: [i],
      tracker: vote(i, { count: 'current' }),
      comparedValues: { val1: count, val2: 0 },
      result: empty ? 'true' : 'false',
      message: `count == 0?  ${count} == 0 → ${empty}`,
      explanation: empty
        ? i === 0
          ? 'No candidate yet, so nums[i] becomes the candidate.'
          : `Every earlier copy of the candidate has been cancelled by a different value, so nums[${i}] = ${x} becomes the new candidate.`
        : `The candidate ${candidate} still has ${count} uncancelled vote${count === 1 ? '' : 's'}; it stays.`,
      actionLabel: empty ? 'Condition TRUE' : 'Condition FALSE',
    });

    if (empty) {
      candidate = x;
      push({
        type: 'assign',
        codeRef: 'set-candidate',
        variables: { i, candidate },
        pointers: { i },
        indices: [i],
        tracker: vote(i, { 'nums[i]': 'current', candidate: 'changed' }),
        message: `candidate = nums[${i}] = ${x}`,
        explanation: `${x} is the candidate now.`,
        actionLabel: 'New candidate',
      });
    }

    const same = x === candidate;
    push({
      type: 'compare',
      codeRef: 'check-match',
      variables: { i, 'nums[i]': x, candidate },
      pointers: { i },
      indices: [i],
      tracker: vote(i, { 'nums[i]': 'current', candidate: 'current' }),
      comparedValues: { val1: x, val2: candidate! },
      result: same ? 'true' : 'false',
      message: `nums[${i}] == candidate?  ${x} == ${candidate} → ${same}`,
      explanation: same ? `A vote for the candidate ${candidate}.` : `${x} differs from the candidate ${candidate}: the two cancel each other out.`,
      actionLabel: same ? 'Match' : 'No match',
    });

    count += same ? 1 : -1;
    push({
      type: same ? 'increment' : 'decrement',
      codeRef: same ? 'increment-count' : 'decrement-count',
      variables: { i, candidate, count },
      pointers: { i },
      indices: [i],
      tracker: vote(i, { count: 'changed' }),
      message: `count${same ? '++' : '--'} → count = ${count}`,
      explanation: same
        ? `The candidate ${candidate} has ${count} uncancelled vote${count === 1 ? '' : 's'}.`
        : count === 0
          ? `All of ${candidate}'s votes so far are cancelled; the next element becomes the candidate.`
          : `The candidate ${candidate} keeps ${count} uncancelled vote${count === 1 ? '' : 's'}.`,
      actionLabel: same ? 'count++' : 'count--',
    });
  }

  // ── pass 2: verification ──
  let freq = 0;
  const verify = (i: number | null, roles: Roles = {}): NumberCell[] => [
    { name: 'i', value: i, role: roles.i },
    { name: 'nums[i]', value: i === null || i >= n ? null : nums[i], role: roles['nums[i]'] },
    { name: 'candidate', value: candidate, role: roles.candidate },
    { name: 'freq', value: freq, role: roles.freq },
    { name: 'n / 2', value: half, role: roles['n / 2'] },
  ];
  const counted: number[] = [];

  push({
    type: 'assign',
    codeRef: 'init-freq',
    variables: { candidate: candidate ?? 'none', freq },
    tracker: verify(null, { freq: 'changed' }),
    message: 'freq = 0',
    explanation:
      n === 0
        ? 'Pass 2 has nothing to count.'
        : `Pass 2 counts how often the candidate ${candidate} occurs. Pass 1 alone cannot tell: an array without a majority still ends with a candidate.`,
    actionLabel: 'Init freq',
  });

  for (let i = 0; ; i++) {
    const inLoop = i < n;
    push({
      type: 'loop-condition',
      codeRef: 'verify-loop',
      variables: { i, n, candidate: candidate ?? 'none', freq },
      pointers: inLoop ? { i } : {},
      indices: inLoop ? [i] : [],
      tracker: verify(i, { i: 'changed' }),
      result: inLoop ? 'true' : 'false',
      message: `${i > 0 ? `i++ → i = ${i};  ` : ''}i < n?  ${i} < ${n} → ${inLoop}`,
      explanation: inLoop ? `Pass 2 reads index ${i} (value ${nums[i]}).` : `Pass 2 is done: ${candidate ?? 'the candidate'} occurs ${freq} time${freq === 1 ? '' : 's'}.`,
      actionLabel: inLoop ? 'Loop TRUE' : 'Loop FALSE',
    });
    if (!inLoop) break;

    const same = nums[i] === candidate;
    push({
      type: 'compare',
      codeRef: 'verify-match',
      variables: { i, 'nums[i]': nums[i], candidate },
      pointers: { i },
      indices: [i],
      tracker: verify(i, { 'nums[i]': 'current', candidate: 'current' }),
      comparedValues: { val1: nums[i], val2: candidate! },
      result: same ? 'true' : 'false',
      message: `nums[${i}] == candidate?  ${nums[i]} == ${candidate} → ${same}`,
      explanation: same ? `Another copy of ${candidate}.` : `Not a copy of ${candidate}.`,
      actionLabel: same ? 'Match' : 'No match',
    });
    if (same) {
      freq++;
      counted.push(i);
      push({
        type: 'increment',
        codeRef: 'increment-freq',
        variables: { i, candidate, freq },
        pointers: { i },
        indices: [i],
        tracker: verify(i, { freq: 'changed' }),
        message: `freq++ → freq = ${freq}`,
        explanation: `${candidate} has been counted ${freq} time${freq === 1 ? '' : 's'} so far.`,
        actionLabel: 'freq++',
      });
    }
  }

  const isMajority = freq > half;
  push({
    type: 'condition',
    codeRef: 'check-majority',
    variables: { candidate: candidate ?? 'none', freq, 'n / 2': half },
    tracker: verify(null, { freq: 'current', 'n / 2': 'current' }),
    comparedValues: { val1: freq, val2: half },
    result: isMajority ? 'true' : 'false',
    message: `freq > n / 2?  ${freq} > ⌊${n}/2⌋ = ${half} → ${isMajority}`,
    explanation: isMajority
      ? `${candidate} fills ${freq} of ${n} positions, more than half.`
      : n === 0
        ? 'An empty array has no majority element.'
        : `${candidate} fills only ${freq} of ${n} positions; a majority needs more than ${half}. No value can do better, because any majority would have been the candidate.`,
    actionLabel: isMajority ? 'Condition TRUE' : 'Condition FALSE',
  });

  push(
    isMajority
      ? {
          type: 'found',
          codeRef: 'return-majority',
          variables: { candidate, freq },
          indices: [...counted],
          sortedIndices: [...counted],
          tracker: verify(null, { candidate: 'current' }),
          message: `Return ${candidate}`,
          explanation: `${candidate} is the majority element.`,
          actionLabel: 'Majority',
        }
      : {
          type: 'not-found',
          codeRef: 'return-none',
          variables: { candidate: candidate ?? 'none', freq },
          tracker: verify(null),
          message: 'Return none: no majority element',
          explanation: 'No value occurs more than ⌊n/2⌋ times.',
          actionLabel: 'No majority',
        }
  );

  push({
    type: 'complete',
    codeRef: isMajority ? 'return-majority' : 'return-none',
    variables: { candidate: candidate ?? 'none', freq, 'n / 2': half },
    sortedIndices: isMajority ? [...counted] : [],
    tracker: verify(null),
    outcomeText: isMajority
      ? `Majority element: ${candidate} (${freq} of ${n}, more than ⌊${n}/2⌋ = ${half})`
      : n === 0
        ? 'No majority element: the array is empty'
        : `No majority element: the candidate ${candidate} occurs ${freq} of ${n} times, not more than ⌊${n}/2⌋ = ${half}`,
    message: isMajority ? `Done — majority ${candidate}` : 'Done — no majority',
    explanation: 'Two passes over the array: O(n) time. Only candidate, count and freq are kept: O(1) extra space.',
    actionLabel: 'Complete',
  });

  return steps;
}

export const majorityElementDefinition: AlgorithmDefinition = {
  id: 'majority-element',
  name: 'Majority Element',
  category: 'ARRAYS',
  subtitle: 'Boyer–Moore voting finds the only possible majority, then a second pass verifies it.',
  description:
    'A majority element occurs more than ⌊n/2⌋ times. Boyer–Moore voting keeps one candidate and a counter, cancelling each pair of different values, so a majority (if any) survives as the candidate. A second pass counts it, because the input may have no majority.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'Finding a value that fills more than half of an array, in constant extra space',
  },
  defaultInput: [2, 2, 1, 1, 1, 2, 2],
  positionPointers: ['i'],

  code: {
    c: `#include <stdbool.h>

bool majorityElement(const int nums[], int n, int *majority) {
    int candidate = 0, count = 0;
    for (int i = 0; i < n; i++) {
        if (count == 0)
            candidate = nums[i];
        if (nums[i] == candidate)
            count++;
        else
            count--;
    }
    int freq = 0;
    for (int i = 0; i < n; i++)
        if (nums[i] == candidate)
            freq++;
    if (freq > n / 2) {
        *majority = candidate;
        return true;
    }
    return false;
}`,
    cpp: `bool majorityElement(const vector<int>& nums, int& majority) {
    int candidate = 0, count = 0;
    for (size_t i = 0; i < nums.size(); i++) {
        if (count == 0)
            candidate = nums[i];
        if (nums[i] == candidate)
            count++;
        else
            count--;
    }
    int freq = 0;
    for (size_t i = 0; i < nums.size(); i++)
        if (nums[i] == candidate)
            freq++;
    if (freq > (int)nums.size() / 2) {
        majority = candidate;
        return true;
    }
    return false;
}`,
    java: `public class MajorityElement {
    public static Integer majorityElement(int[] nums) {
        int candidate = 0, count = 0;
        for (int i = 0; i < nums.length; i++) {
            if (count == 0)
                candidate = nums[i];
            if (nums[i] == candidate)
                count++;
            else
                count--;
        }
        int freq = 0;
        for (int i = 0; i < nums.length; i++)
            if (nums[i] == candidate)
                freq++;
        if (freq > nums.length / 2)
            return candidate;
        return null;
    }
}`,
    python: `def majority_element(nums):
    candidate, count = None, 0
    for i in range(len(nums)):
        if count == 0:
            candidate = nums[i]
        if nums[i] == candidate:
            count += 1
        else:
            count -= 1
    freq = 0
    for i in range(len(nums)):
        if nums[i] == candidate:
            freq += 1
    if freq > len(nums) // 2:
        return candidate
    return None`,
  },

  lineMap: {
    c: {
      'fn-entry': 3, 'init-vars': 4, 'loop-condition': 5, 'check-zero': 6, 'set-candidate': 7, 'check-match': 8,
      'increment-count': 9, 'decrement-count': 11, 'init-freq': 13, 'verify-loop': 14, 'verify-match': 15,
      'increment-freq': 16, 'check-majority': 17, 'return-majority': 19, 'return-none': 21,
    },
    cpp: {
      'fn-entry': 1, 'init-vars': 2, 'loop-condition': 3, 'check-zero': 4, 'set-candidate': 5, 'check-match': 6,
      'increment-count': 7, 'decrement-count': 9, 'init-freq': 11, 'verify-loop': 12, 'verify-match': 13,
      'increment-freq': 14, 'check-majority': 15, 'return-majority': 17, 'return-none': 19,
    },
    java: {
      'fn-entry': 2, 'init-vars': 3, 'loop-condition': 4, 'check-zero': 5, 'set-candidate': 6, 'check-match': 7,
      'increment-count': 8, 'decrement-count': 10, 'init-freq': 12, 'verify-loop': 13, 'verify-match': 14,
      'increment-freq': 15, 'check-majority': 16, 'return-majority': 17, 'return-none': 18,
    },
    python: {
      'fn-entry': 1, 'init-vars': 2, 'loop-condition': 3, 'check-zero': 4, 'set-candidate': 5, 'check-match': 6,
      'increment-count': 7, 'decrement-count': 9, 'init-freq': 10, 'verify-loop': 11, 'verify-match': 12,
      'increment-freq': 13, 'check-majority': 14, 'return-majority': 15, 'return-none': 16,
    },
  },

  // C and C++ store the answer in the out-parameter on the line before `return true;`
  lineLeads: {
    c: { 'return-majority': 1 },
    cpp: { 'return-majority': 1 },
  },

  generateSteps: generateMajoritySteps,
};
