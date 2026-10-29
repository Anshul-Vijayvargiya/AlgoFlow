import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, NumberCell, TextView } from '../../../types/algorithm';
import { charText, marks, quoted, stepRecorder, textInputs } from './textInput';

const inputSpec: AlgorithmInputSpec = {
  texts: [
    {
      label: 's',
      hint: 'Words of letters separated by spaces, 1 to 32 characters with at least one word; leading and trailing spaces are kept',
      defaultValue: '   fly me   to   the moon  ',
      minLength: 1,
      maxLength: 32,
      chars: { pattern: '[A-Za-z ]', description: 'letters and spaces' },
      rule: 'has-word',
    },
  ],
  textExamples: [['Hello World'], ['   fly me   to   the moon  '], ['luffy is still joyboy'], ['a'], ['day  '], ['  single'], ['a b c d e']],
};

/**
 * Length of Last Word: from the end of the string, skip the trailing spaces, then count letters until a space or the
 * start. Only the last word and the spaces after it are read: O(n) time in the worst case, O(1) space.
 */
function generateLastWordSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [s] = textInputs(inputSpec, params, 'Length of Last Word');
  const n = s.length;
  const { steps, push } = stepRecorder();
  let length: number | null = null;
  const skipped: number[] = [];
  const counted: number[] = [];

  type Roles = Partial<Record<'i' | 'length', NumberCell['role']>>;
  const view = (i: number | null, roles: Roles = {}, current: 'current' | 'mismatch' = 'current', result?: TextView['result']): TextView => ({
    rows: [
      {
        name: 's',
        text: s,
        pointers: i !== null ? [{ name: 'i', index: i }] : [],
        marks: marks([skipped, 'skipped'], [counted, 'match'], [i !== null && i >= 0 && i < n ? [i] : [], current]),
      },
    ],
    cells: [
      { name: 'i', value: i, role: roles.i },
      { name: 's[i]', value: i !== null && i >= 0 && i < n ? quoted(s[i]) : null },
      { name: 'length', value: length, role: roles.length },
    ],
    ...(result ? { result } : {}),
  });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { s },
    text: view(null),
    message: `lengthOfLastWord(${quoted(s)})`,
    explanation: 'The last word is at the end, so scan backwards: first past any trailing spaces, then across the word.',
    actionLabel: 'Start',
  });

  let i = n - 1;
  push({
    type: 'assign',
    codeRef: 'init-i',
    variables: { i },
    text: view(i, { i: 'changed' }),
    message: `i = len(s) - 1 = ${i}`,
    explanation: 'Start at the last character.',
    actionLabel: `i = ${i}`,
  });

  for (;;) {
    const space = i >= 0 && s[i] === ' ';
    push({
      type: 'loop-condition',
      codeRef: 'skip-check',
      variables: { i, ...(i >= 0 ? { 's[i]': s[i] } : {}) },
      text: view(i, { i: 'current' }),
      result: space ? 'true' : 'false',
      message: i >= 0 ? `i >= 0 and s[i] == ' '?  s[${i}] = ${charText(s[i])} → ${space}` : `i >= 0?  ${i} >= 0 → false`,
      explanation: space ? 'A trailing space: skip it.' : `s[${i}] is a letter: the last word ends here.`,
      actionLabel: space ? 'Space' : 'Word found',
    });
    if (!space) break;
    skipped.push(i);
    i--;
    push({
      type: 'decrement',
      codeRef: 'skip',
      variables: { i },
      text: view(i, { i: 'changed' }),
      message: `i = ${i}`,
      explanation: `Skipped ${skipped.length} trailing space${skipped.length === 1 ? '' : 's'}.`,
      actionLabel: 'i--',
    });
  }

  length = 0;
  push({
    type: 'assign',
    codeRef: 'init-length',
    variables: { length, i },
    text: view(i, { length: 'changed' }),
    message: 'length = 0',
    explanation: `Count the letters of the last word, from index ${i} backwards.`,
    actionLabel: 'length = 0',
  });

  for (;;) {
    const letter = i >= 0 && s[i] !== ' ';
    push({
      type: 'loop-condition',
      codeRef: 'count-check',
      variables: { i, ...(i >= 0 ? { 's[i]': s[i] } : {}), length },
      text: view(i, { i: 'current' }, letter ? 'current' : 'mismatch'),
      result: letter ? 'true' : 'false',
      message: i >= 0 ? `i >= 0 and s[i] != ' '?  s[${i}] = ${charText(s[i])} → ${letter}` : `i >= 0?  ${i} >= 0 → false: the start of the string`,
      explanation: letter ? 'A letter of the last word: count it.' : i >= 0 ? 'A space: the last word starts just after it.' : 'The last word starts at the beginning of the string.',
      actionLabel: letter ? 'Letter' : 'Word ends',
    });
    if (!letter) break;
    counted.push(i);
    length++;
    i--;
    push({
      type: 'update',
      codeRef: 'count',
      variables: { length, i },
      text: view(i, { length: 'changed', i: 'changed' }),
      message: `length = ${length}, i = ${i}`,
      explanation: `${length} letter${length === 1 ? '' : 's'} counted.`,
      actionLabel: 'length++, i--',
    });
  }

  const word = s.slice(i + 1, i + 1 + length);
  // every position from the end down to i + 1, and the space the count stopped at (if it did not reach the start)
  const read = n - 1 - i + (i >= 0 ? 1 : 0);
  push({
    type: 'complete',
    codeRef: 'return',
    variables: { length },
    text: view(null, { length: 'current' }, 'current', { kind: 'answer', text: `The last word is ${quoted(word)}: length ${length}` }),
    message: `Return length = ${length}`,
    explanation: `${read} of ${n} character${n === 1 ? '' : 's'} read: O(n) time in the worst case, O(1) space.`,
    actionLabel: `Return ${length}`,
    outcomeText: `The last word is ${quoted(word)}: length ${length}`,
  });
  return steps;
}

export const lengthOfLastWordDefinition: AlgorithmDefinition = {
  id: 'length-of-last-word',
  name: 'Length of Last Word',
  category: 'STRINGS',
  visual: 'text',
  subtitle: 'Scan back past trailing spaces, then count the word.',
  description:
    'Length of Last Word (LeetCode 58) returns the length of the last word of a string of words and spaces. Scanning from the end, it skips the trailing spaces and then counts letters until a space or the start of the string.',
  complexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', bestFor: 'Reading only the end of a string' },
  defaultInput: [],
  inputSpec,

  code: {
    c: `int lengthOfLastWord(const char *s) {
    int i = strlen(s) - 1;
    while (i >= 0 && s[i] == ' ') {
        i--;
    }
    int length = 0;
    while (i >= 0 && s[i] != ' ') {
        length++;
        i--;
    }
    return length;
}`,
    cpp: `int lengthOfLastWord(string s) {
    int i = (int)s.size() - 1;
    while (i >= 0 && s[i] == ' ') {
        i--;
    }
    int length = 0;
    while (i >= 0 && s[i] != ' ') {
        length++;
        i--;
    }
    return length;
}`,
    java: `public class LengthOfLastWord {
    public static int lengthOfLastWord(String s) {
        int i = s.length() - 1;
        while (i >= 0 && s.charAt(i) == ' ') {
            i--;
        }
        int length = 0;
        while (i >= 0 && s.charAt(i) != ' ') {
            length++;
            i--;
        }
        return length;
    }
}`,
    python: `def length_of_last_word(s):
    i = len(s) - 1
    while i >= 0 and s[i] == ' ':
        i -= 1
    length = 0
    while i >= 0 and s[i] != ' ':
        length += 1
        i -= 1
    return length`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'init-i': 2, 'skip-check': 3, skip: 4, 'init-length': 6, 'count-check': 7, count: 8, return: 11 },
    cpp: { 'fn-entry': 1, 'init-i': 2, 'skip-check': 3, skip: 4, 'init-length': 6, 'count-check': 7, count: 8, return: 11 },
    java: { 'fn-entry': 2, 'init-i': 3, 'skip-check': 4, skip: 5, 'init-length': 7, 'count-check': 8, count: 9, return: 12 },
    python: { 'fn-entry': 1, 'init-i': 2, 'skip-check': 3, skip: 4, 'init-length': 5, 'count-check': 6, count: 7, return: 9 },
  },
  // the count step is two statements on two lines in every language: length += 1, then i -= 1
  lineSpans: { c: { count: 2 }, cpp: { count: 2 }, java: { count: 2 }, python: { count: 2 } },

  generateSteps: generateLastWordSteps,
};
