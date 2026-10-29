import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, NumberCell, TextView } from '../../../types/algorithm';
import { charText, marks, quoted, range, stepRecorder, textInputs } from './textInput';

const LETTERS = { pattern: '[a-z]', description: 'lowercase letters a to z' } as const;

const inputSpec: AlgorithmInputSpec = {
  texts: [
    { label: 'haystack', hint: 'The text to search: 1 to 20 lowercase letters', defaultValue: 'sadbutsad', minLength: 1, maxLength: 20, chars: LETTERS },
    { label: 'needle', hint: 'The word to find: 1 to 10 lowercase letters', defaultValue: 'sad', minLength: 1, maxLength: 10, chars: LETTERS },
  ],
  textExamples: [['sadbutsad', 'sad'], ['leetcode', 'leeto'], ['hello', 'll'], ['mississippi', 'issip'], ['aaaaa', 'bba'], ['abc', 'c'], ['a', 'a'], ['abababc', 'abc']],
};

/**
 * Find the Index of the First Occurrence in a String (strStr), by brute force: try every alignment i of the needle
 * under the haystack, left to right, comparing characters until one differs or the whole needle matches. O(n·m) time
 * in the worst case, O(1) space.
 */
function generateStrStrSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [haystack, needle] = textInputs(inputSpec, params, 'Find the Index of the First Occurrence');
  const n = haystack.length;
  const m = needle.length;
  const { steps, push } = stepRecorder();
  let comparisons = 0;

  type Roles = Partial<Record<'i' | 'j', NumberCell['role']>>;
  /** at alignment i, j characters have matched; `last` is the outcome of comparing position j, if this step compares it */
  const view = (i: number | null, j: number | null, last: 'match' | 'mismatch' | null, roles: Roles = {}, result?: TextView['result']): TextView => {
    const matched = i !== null && j !== null ? j : 0;
    const comparing = i !== null && j !== null && j < m && last !== null;
    return {
      rows: [
        {
          name: 'haystack',
          text: haystack,
          pointers: i !== null ? [{ name: 'i', index: i }, ...(j !== null && j > 0 && j < m ? [{ name: 'i + j', index: i + j }] : [])] : [],
          marks: i === null ? [] : marks([range(i, i + matched - 1), 'match'], [comparing ? [i + j!] : [], last ?? 'compare']),
        },
        {
          name: 'needle',
          text: needle,
          offset: i ?? 0,
          pointers: j !== null ? [{ name: 'j', index: j }] : [],
          marks: i === null ? [] : marks([range(0, matched - 1), 'match'], [comparing ? [j!] : [], last ?? 'compare']),
        },
      ],
      cells: [
        { name: 'i', value: i, role: roles.i },
        { name: 'j', value: j, role: roles.j },
        { name: 'haystack[i + j]', value: comparing ? quoted(haystack[i! + j!]) : null },
        { name: 'needle[j]', value: comparing ? quoted(needle[j!]) : null },
      ],
      ...(result ? { result } : {}),
    };
  };

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { haystack, needle },
    text: view(null, null, null),
    message: `strStr(${quoted(haystack)}, ${quoted(needle)})`,
    explanation: 'Slide the needle along the haystack, one position at a time, and compare it character by character.',
    actionLabel: 'Start',
  });
  push({
    type: 'assign',
    codeRef: 'init-lengths',
    variables: { n, m },
    text: view(null, null, null),
    message: `n = ${n}, m = ${m}`,
    explanation: m > n ? `The needle is longer than the haystack: it cannot fit anywhere.` : `The needle fits at alignments 0 … ${n - m}.`,
    actionLabel: `n = ${n}, m = ${m}`,
  });

  for (let i = 0; ; i++) {
    const inLoop = i <= n - m;
    push({
      type: 'loop-condition',
      codeRef: 'outer-loop',
      variables: { i, 'n - m': n - m },
      text: view(inLoop ? i : null, null, null, { i: 'changed' }),
      result: inLoop ? 'true' : 'false',
      message: `i <= n - m?  ${i} <= ${n - m} → ${inLoop}`,
      explanation: inLoop ? `Try the needle starting at index ${i}.` : 'No alignment is left.',
      actionLabel: inLoop ? `Align at ${i}` : 'Loop ends',
    });
    if (!inLoop) break;

    let j = 0;
    push({
      type: 'assign',
      codeRef: 'reset-j',
      variables: { i, j },
      text: view(i, j, null, { j: 'changed' }),
      message: 'j = 0',
      explanation: `Compare from the needle's first character, under haystack[${i}].`,
      actionLabel: 'j = 0',
    });

    for (;;) {
      if (j === m) {
        push({
          type: 'loop-condition',
          codeRef: 'compare',
          variables: { i, j, m },
          text: view(i, j, null, { j: 'current' }),
          result: 'false',
          message: `j < m?  ${j} < ${m} → false`,
          explanation: 'Every character of the needle has matched.',
          actionLabel: 'All matched',
        });
        break;
      }
      const equal = haystack[i + j] === needle[j];
      comparisons++;
      push({
        type: 'compare',
        codeRef: 'compare',
        variables: { i, j, 'haystack[i + j]': haystack[i + j], 'needle[j]': needle[j] },
        text: view(i, j, equal ? 'match' : 'mismatch', { j: 'current' }),
        result: equal ? 'true' : 'false',
        message: `haystack[${i + j}] == needle[${j}]?  ${charText(haystack[i + j])} == ${charText(needle[j])} → ${equal}`,
        explanation: equal ? `They match: compare the next character.` : `They differ: the needle does not start at index ${i}.`,
        actionLabel: equal ? 'Match' : 'Mismatch',
      });
      if (!equal) break;
      j++;
      push({
        type: 'increment',
        codeRef: 'advance-j',
        variables: { i, j },
        text: view(i, j, null, { j: 'changed' }),
        message: `j = ${j}`,
        explanation: `${j} of ${m} character${m === 1 ? '' : 's'} matched at this alignment.`,
        actionLabel: 'j++',
      });
    }

    const full = j === m;
    push({
      type: 'condition',
      codeRef: 'check-full',
      variables: { j, m },
      text: view(i, j, null),
      result: full ? 'true' : 'false',
      message: `j == m?  ${j} == ${m} → ${full}`,
      explanation: full ? `The whole needle matched at index ${i}.` : `Only ${j} character${j === 1 ? '' : 's'} matched: move the needle one place right.`,
      actionLabel: full ? 'Found' : 'Not here',
    });
    if (full) {
      push({
        type: 'complete',
        codeRef: 'return-index',
        variables: { index: i },
        text: view(i, j, null, { i: 'current' }, { kind: 'answer', text: `${quoted(needle)} first occurs at index ${i}` }),
        message: `Return ${i}`,
        explanation: `${comparisons} character comparison${comparisons === 1 ? '' : 's'}. Brute force takes O(n·m) time in the worst case and O(1) space.`,
        actionLabel: `Return ${i}`,
        outcomeText: `${quoted(needle)} first occurs at index ${i}`,
      });
      return steps;
    }
  }

  push({
    type: 'complete',
    codeRef: 'return-not-found',
    variables: { index: -1 },
    text: view(null, null, null, {}, { kind: 'answer', text: `${quoted(needle)} does not occur in ${quoted(haystack)}: -1` }),
    message: 'Return -1',
    explanation: `${quoted(needle)} matched at no alignment (${comparisons} character comparison${comparisons === 1 ? '' : 's'}). Brute force takes O(n·m) time in the worst case and O(1) space.`,
    actionLabel: 'Return -1',
    outcomeText: `${quoted(needle)} does not occur in ${quoted(haystack)}: -1`,
  });
  return steps;
}

export const findFirstOccurrenceDefinition: AlgorithmDefinition = {
  id: 'find-first-occurrence',
  name: 'Find the Index of the First Occurrence',
  category: 'STRINGS',
  visual: 'text',
  subtitle: 'Slide the needle along the haystack, comparing as it goes.',
  description:
    'Find the Index of the First Occurrence in a String (LeetCode 28, strStr) returns where needle first appears in haystack, or -1. The brute-force search tries each alignment from the left and compares characters until one differs or the whole needle matches.',
  complexity: { best: 'O(m)', average: 'O(n·m)', worst: 'O(n·m)', space: 'O(1)', bestFor: 'Short patterns; the idea behind faster searches such as KMP' },
  defaultInput: [],
  inputSpec,

  code: {
    c: `int strStr(const char *haystack, const char *needle) {
    int n = strlen(haystack), m = strlen(needle);
    for (int i = 0; i <= n - m; i++) {
        int j = 0;
        while (j < m && haystack[i + j] == needle[j]) {
            j++;
        }
        if (j == m) {
            return i;
        }
    }
    return -1;
}`,
    cpp: `int strStr(string haystack, string needle) {
    int n = haystack.size(), m = needle.size();
    for (int i = 0; i <= n - m; i++) {
        int j = 0;
        while (j < m && haystack[i + j] == needle[j]) {
            j++;
        }
        if (j == m) {
            return i;
        }
    }
    return -1;
}`,
    java: `public class FindFirstOccurrence {
    public static int strStr(String haystack, String needle) {
        int n = haystack.length(), m = needle.length();
        for (int i = 0; i <= n - m; i++) {
            int j = 0;
            while (j < m && haystack.charAt(i + j) == needle.charAt(j)) {
                j++;
            }
            if (j == m) {
                return i;
            }
        }
        return -1;
    }
}`,
    python: `def str_str(haystack, needle):
    n, m = len(haystack), len(needle)
    for i in range(n - m + 1):
        j = 0
        while j < m and haystack[i + j] == needle[j]:
            j += 1
        if j == m:
            return i
    return -1`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'init-lengths': 2, 'outer-loop': 3, 'reset-j': 4, compare: 5, 'advance-j': 6, 'check-full': 8, 'return-index': 9, 'return-not-found': 12 },
    cpp: { 'fn-entry': 1, 'init-lengths': 2, 'outer-loop': 3, 'reset-j': 4, compare: 5, 'advance-j': 6, 'check-full': 8, 'return-index': 9, 'return-not-found': 12 },
    java: { 'fn-entry': 2, 'init-lengths': 3, 'outer-loop': 4, 'reset-j': 5, compare: 6, 'advance-j': 7, 'check-full': 9, 'return-index': 10, 'return-not-found': 13 },
    python: { 'fn-entry': 1, 'init-lengths': 2, 'outer-loop': 3, 'reset-j': 4, compare: 5, 'advance-j': 6, 'check-full': 7, 'return-index': 8, 'return-not-found': 9 },
  },

  generateSteps: generateStrStrSteps,
};
