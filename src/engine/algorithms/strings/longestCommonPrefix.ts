import type { AlgorithmDefinition, AlgorithmInputSpec, CharMark, ExecutionStep, NumberCell, TextView } from '../../../types/algorithm';
import { splitTextList } from '../../inputParsing';
import { charText, quoted, range, stepRecorder, textInputs } from './textInput';

const inputSpec: AlgorithmInputSpec = {
  texts: [
    {
      label: 'strs',
      hint: 'Words separated by commas (1 to 6 words of lowercase letters, up to 12 letters each; a word may be empty), e.g. flower, flow, flight',
      defaultValue: 'flower, flow, flight',
      minLength: 1,
      maxLength: 6,
      chars: { pattern: '[a-z]', description: 'lowercase letters a to z' },
      list: { itemMaxLength: 12 },
    },
  ],
  textExamples: [['flower, flow, flight'], ['dog, racecar, car'], ['interspecies, interstellar, interstate'], ['ab, a'], ['abc, abc, abc'], ['a'], ['cir, car'], ['reflower, flow, flight']],
};

/**
 * Longest Common Prefix, by vertical scanning: compare column i of the first word with column i of every other word;
 * the first word that ends there or has a different character ends the prefix. O(S) time for S characters in all,
 * O(1) extra space (the answer aside).
 */
function generateLcpSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [raw] = textInputs(inputSpec, params, 'Longest Common Prefix');
  const strs = splitTextList(raw);
  const first = strs[0];
  const k = strs.length;
  const { steps, push } = stepRecorder();

  // `confirmed` columns are common to every word; in column `col`, words 1 … matchedUpTo have matched so far
  let confirmed = 0;
  type Focus = { col: number; matchedUpTo: number; j?: number; outcome?: 'compare' | 'match' | 'mismatch' };
  type Roles = Partial<Record<'i' | 'j' | 'prefix', NumberCell['role']>>;
  const view = (i: number | null, j: number | null, focus: Focus | null, roles: Roles = {}, result?: TextView['result']): TextView => ({
    rows: strs.map((word, w) => {
      const rowMarks: { index: number; mark: CharMark }[] = range(0, Math.min(confirmed, word.length) - 1).map(index => ({ index, mark: 'match' as const }));
      if (focus && focus.col < word.length) {
        let mark: CharMark | null = null;
        if (w === 0) mark = 'current';
        else if (w <= focus.matchedUpTo) mark = 'match';
        else if (w === focus.j) mark = focus.outcome === 'mismatch' ? 'mismatch' : focus.outcome === 'match' ? 'match' : 'compare';
        if (mark) rowMarks.push({ index: focus.col, mark });
      }
      return {
        name: w === 0 ? 'strs[0] (first)' : `strs[${w}]`,
        text: word,
        pointers: i !== null && (w === 0 || w === j) ? [{ name: 'i', index: i }] : [],
        marks: rowMarks,
      };
    }),
    cells: [
      { name: 'i', value: i, role: roles.i },
      { name: 'j', value: j, role: roles.j },
      { name: 'prefix', value: quoted(first.slice(0, confirmed)), role: roles.prefix },
    ],
    ...(result ? { result } : {}),
  });

  const finish = (codeRef: 'return-prefix' | 'return-first', length: number, why: string, i: number | null, j: number | null, focus: Focus | null) => {
    const prefix = first.slice(0, length);
    push({
      type: 'complete',
      codeRef,
      variables: { prefix },
      text: view(i, j, focus, { prefix: 'current' }, { kind: 'answer', text: `Longest common prefix: ${quoted(prefix)}` }),
      message: codeRef === 'return-prefix' ? `Return first[0:${length}] = ${quoted(prefix)}` : `Return first = ${quoted(prefix)}`,
      explanation: `${why} Every character is compared at most once: O(S) time for S characters in all, O(1) extra space.`,
      actionLabel: `Return ${quoted(prefix)}`,
      outcomeText: `Longest common prefix: ${quoted(prefix)}`,
    });
  };

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { strs },
    text: view(null, null, null),
    message: `longestCommonPrefix([${strs.map(quoted).join(', ')}])`,
    explanation: 'The common prefix can be no longer than the first word, so check its characters column by column against every other word.',
    actionLabel: 'Start',
  });
  push({
    type: 'assign',
    codeRef: 'set-first',
    variables: { first },
    text: view(null, null, null),
    message: `first = strs[0] = ${quoted(first)}`,
    explanation: `${quoted(first)} has ${first.length} character${first.length === 1 ? '' : 's'}: the prefix has at most that many.`,
    actionLabel: 'first = strs[0]',
  });

  for (let i = 0; ; i++) {
    const inLoop = i < first.length;
    push({
      type: 'loop-condition',
      codeRef: 'outer-loop',
      variables: { i, 'len(first)': first.length },
      text: view(i, null, inLoop ? { col: i, matchedUpTo: 0 } : null, { i: 'changed' }),
      result: inLoop ? 'true' : 'false',
      message: `i < len(first)?  ${i} < ${first.length} → ${inLoop}`,
      explanation: inLoop ? `Column ${i}: does every word have ${charText(first[i])} at index ${i}?` : `Every character of ${quoted(first)} is in every word.`,
      actionLabel: inLoop ? `Column ${i}` : 'Loop ends',
    });
    if (!inLoop) {
      finish('return-first', first.length, `The whole first word ${quoted(first)} is a prefix of every word.`, i, null, null);
      return steps;
    }

    for (let j = 1; ; j++) {
      const more = j < k;
      push({
        type: 'loop-condition',
        codeRef: 'inner-loop',
        variables: { i, j, n: k },
        text: view(i, more ? j : null, { col: i, matchedUpTo: j - 1 }, { j: 'changed' }),
        result: more ? 'true' : 'false',
        message: `j < n?  ${j} < ${k} → ${more}`,
        explanation: more
          ? `Compare column ${i} of strs[${j}] = ${quoted(strs[j])}.`
          : k === 1
            ? 'There is only one word: each of its characters is common to all words.'
            : `Every word has ${charText(first[i])} at index ${i}: the prefix grows to ${quoted(first.slice(0, i + 1))}.`,
        actionLabel: more ? `Word ${j}` : 'Column matches',
      });
      if (!more) break;

      const word = strs[j];
      const ended = i === word.length;
      const differs = !ended && word[i] !== first[i];
      const stop = ended || differs;
      push({
        type: 'compare',
        codeRef: 'compare',
        variables: { i, j, ...(ended ? { 'len(strs[j])': word.length } : { 'strs[j][i]': word[i], 'first[i]': first[i] }) },
        text: view(i, j, { col: i, matchedUpTo: j - 1, j, outcome: stop ? 'mismatch' : 'match' }, { i: 'current', j: 'current' }),
        result: stop ? 'true' : 'false',
        message: ended
          ? `i == len(strs[${j}])?  ${i} == ${word.length} → true: ${quoted(word)} has no index ${i}`
          : `strs[${j}][${i}] != first[${i}]?  ${charText(word[i])} != ${charText(first[i])} → ${differs}`,
        explanation: ended
          ? `${quoted(word)} ends before column ${i}, so the prefix cannot be longer than ${i} character${i === 1 ? '' : 's'}.`
          : differs
            ? `The words differ at index ${i}: the prefix stops before it.`
            : `${quoted(word)} also has ${charText(first[i])} at index ${i}.`,
        actionLabel: stop ? 'Mismatch' : 'Match',
      });
      if (stop) {
        finish('return-prefix', i, ended ? `strs[${j}] ended at index ${i}.` : `strs[${j}] differs from the first word at index ${i}.`, i, j, { col: i, matchedUpTo: j - 1, j, outcome: 'mismatch' });
        return steps;
      }
    }
    confirmed = i + 1;
  }
}

export const longestCommonPrefixDefinition: AlgorithmDefinition = {
  id: 'longest-common-prefix',
  name: 'Longest Common Prefix',
  category: 'STRINGS',
  visual: 'text',
  subtitle: 'Scan column by column until a word ends or differs.',
  description:
    'Longest Common Prefix (LeetCode 14) finds the longest string that starts every word. Vertical scanning compares column i of the first word with column i of each other word, and stops at the first word that ends or has a different character there.',
  complexity: { best: 'O(n)', average: 'O(S)', worst: 'O(S)', space: 'O(1)', bestFor: 'Common prefixes of a few words (S = all characters)' },
  defaultInput: [],
  inputSpec,

  code: {
    c: `char *longestCommonPrefix(char **strs, int strsSize) {
    char *first = strs[0];
    int len = strlen(first);
    for (int i = 0; i < len; i++) {
        for (int j = 1; j < strsSize; j++) {
            if (strs[j][i] == '\\0' || strs[j][i] != first[i]) {
                return strndup(first, i);
            }
        }
    }
    return strndup(first, len);
}`,
    cpp: `string longestCommonPrefix(vector<string>& strs) {
    string first = strs[0];
    for (int i = 0; i < (int)first.size(); i++) {
        for (int j = 1; j < (int)strs.size(); j++) {
            if (i == (int)strs[j].size() || strs[j][i] != first[i]) {
                return first.substr(0, i);
            }
        }
    }
    return first;
}`,
    java: `public class LongestCommonPrefix {
    public static String longestCommonPrefix(String[] strs) {
        String first = strs[0];
        for (int i = 0; i < first.length(); i++) {
            for (int j = 1; j < strs.length; j++) {
                if (i == strs[j].length() || strs[j].charAt(i) != first.charAt(i)) {
                    return first.substring(0, i);
                }
            }
        }
        return first;
    }
}`,
    python: `def longest_common_prefix(strs):
    first = strs[0]
    for i in range(len(first)):
        for j in range(1, len(strs)):
            if i == len(strs[j]) or strs[j][i] != first[i]:
                return first[:i]
    return first`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'set-first': 2, 'outer-loop': 4, 'inner-loop': 5, compare: 6, 'return-prefix': 7, 'return-first': 11 },
    cpp: { 'fn-entry': 1, 'set-first': 2, 'outer-loop': 3, 'inner-loop': 4, compare: 5, 'return-prefix': 6, 'return-first': 10 },
    java: { 'fn-entry': 2, 'set-first': 3, 'outer-loop': 4, 'inner-loop': 5, compare: 6, 'return-prefix': 7, 'return-first': 11 },
    python: { 'fn-entry': 1, 'set-first': 2, 'outer-loop': 3, 'inner-loop': 4, compare: 5, 'return-prefix': 6, 'return-first': 7 },
  },
  // C keeps the first word's length in a variable on the next line
  lineSpans: { c: { 'set-first': 2 } },

  generateSteps: generateLcpSteps,
};
