import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, NumberCell, TextView } from '../../../types/algorithm';
import { charText, marks, quoted, range, stepRecorder, textInputs } from './textInput';

/** the value of each Roman symbol */
export const ROMAN_VALUES: Readonly<Record<string, number>> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

const inputSpec: AlgorithmInputSpec = {
  texts: [
    {
      label: 's',
      hint: 'A Roman numeral from 1 to 3999 (I, V, X, L, C, D, M), e.g. MCMXCIV',
      defaultValue: 'MCMXCIV',
      minLength: 1,
      maxLength: 15,
      chars: { pattern: '[IVXLCDM]', description: 'the capital letters I, V, X, L, C, D and M' },
      rule: 'roman-numeral',
    },
  ],
  textExamples: [['III'], ['LVIII'], ['MCMXCIV'], ['IV'], ['XLII'], ['CDXLIV'], ['MMMCMXCIX'], ['IX']],
};

/**
 * Roman to Integer: read the symbols left to right; a symbol smaller than the one after it is subtracted (the I of
 * IV, the C of CM), every other symbol is added. One pass, O(n) time, O(1) space.
 */
function generateRomanSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [s] = textInputs(inputSpec, params, 'Roman to Integer');
  const n = s.length;
  const { steps, push } = stepRecorder();
  let total: number | null = null;

  type Roles = Partial<Record<'i' | 'value' | 'next' | 'total', NumberCell['role']>>;
  const view = (i: number | null, next: number | null, roles: Roles = {}, compareNext = false, result?: TextView['result']): TextView => ({
    rows: [
      {
        name: 's',
        text: s,
        pointers: i !== null && i <= n ? [{ name: 'i', index: i }] : [],
        marks: marks([range(0, (i ?? 0) - 1), 'done'], [i !== null && i < n ? [i] : [], 'current'], [compareNext && i !== null && i + 1 < n ? [i + 1] : [], 'compare']),
      },
    ],
    cells: [
      { name: 'i', value: i, role: roles.i },
      { name: 's[i]', value: i !== null && i < n ? quoted(s[i]) : null },
      { name: 'value', value: i !== null && i < n ? ROMAN_VALUES[s[i]] : null, role: roles.value },
      { name: 'next value', value: next, role: roles.next },
      { name: 'total', value: total, role: roles.total },
    ],
    ...(result ? { result } : {}),
  });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { s },
    text: view(null, null),
    message: `romanToInt(${quoted(s)})`,
    explanation: 'I = 1, V = 5, X = 10, L = 50, C = 100, D = 500, M = 1000. A symbol is subtracted when a larger one follows it (IV = 4, CM = 900); otherwise it is added.',
    actionLabel: 'Start',
  });

  total = 0;
  push({
    type: 'assign',
    codeRef: 'init-total',
    variables: { total },
    text: view(null, null, { total: 'changed' }),
    message: 'total = 0',
    explanation: 'total collects the value of the numeral, symbol by symbol, from left to right.',
    actionLabel: 'total = 0',
  });

  for (let i = 0; ; i++) {
    const inLoop = i < n;
    push({
      type: 'loop-condition',
      codeRef: 'loop',
      variables: { i, n },
      text: view(i, null, { i: 'changed' }),
      result: inLoop ? 'true' : 'false',
      message: `i < n?  ${i} < ${n} → ${inLoop}`,
      explanation: inLoop ? `Symbol ${i + 1} of ${n}: ${charText(s[i])}.` : `Every symbol has been read: total = ${total}.`,
      actionLabel: inLoop ? 'Next symbol' : 'Loop ends',
    });
    if (!inLoop) break;

    const value = ROMAN_VALUES[s[i]];
    push({
      type: 'assign',
      codeRef: 'read-value',
      variables: { i, value },
      text: view(i, null, { value: 'changed' }),
      message: `value = value of s[${i}] = ${s[i]} → ${value}`,
      explanation: `${s[i]} is worth ${value}.`,
      actionLabel: `${s[i]} = ${value}`,
    });

    const hasNext = i + 1 < n;
    const next = hasNext ? ROMAN_VALUES[s[i + 1]] : null;
    const subtract = hasNext && value < next!;
    push({
      type: 'compare',
      codeRef: 'compare-next',
      variables: { i, value, ...(hasNext ? { next } : {}) },
      text: view(i, next, { value: 'current', next: hasNext ? 'current' : undefined }, true),
      result: subtract ? 'true' : 'false',
      message: hasNext
        ? `i + 1 < n and value < next?  ${value} < ${next} (${s[i + 1]}) → ${subtract}`
        : `i + 1 < n?  ${i + 1} < ${n} → false: ${s[i]} is the last symbol`,
      explanation: subtract
        ? `A smaller symbol before a larger one is subtracted: ${s[i]}${s[i + 1]} means ${next} - ${value}.`
        : hasNext
          ? `${s[i]} (${value}) is not smaller than the next symbol ${s[i + 1]} (${next}), so it is added.`
          : 'Nothing follows the last symbol, so it is added.',
      actionLabel: subtract ? 'Subtract' : 'Add',
    });

    const before = total;
    total = subtract ? total - value : total + value;
    push({
      type: 'update',
      codeRef: subtract ? 'subtract' : 'add',
      variables: { total },
      text: view(i, next, { total: 'changed' }, subtract),
      message: subtract ? `total -= ${value}  →  ${before} - ${value} = ${total}` : `total += ${value}  →  ${before} + ${value} = ${total}`,
      explanation: subtract ? `${s[i]} is subtracted; the larger ${s[i + 1]} after it is added at the next step.` : `${s[i]} adds ${value}.`,
      actionLabel: subtract ? `total -= ${value}` : `total += ${value}`,
    });
  }

  push({
    type: 'complete',
    codeRef: 'return',
    variables: { total },
    text: view(n, null, { total: 'current' }, false, { kind: 'answer', text: `${s} = ${total}` }),
    message: `Return total = ${total}`,
    explanation: `${n} symbol${n === 1 ? '' : 's'}, each read once: O(n) time, O(1) extra space.`,
    actionLabel: `Return ${total}`,
    outcomeText: `${s} = ${total}`,
  });
  return steps;
}

export const romanToIntegerDefinition: AlgorithmDefinition = {
  id: 'roman-to-integer',
  name: 'Roman to Integer',
  category: 'STRINGS',
  visual: 'text',
  subtitle: 'Add each symbol, or subtract it when a larger one follows.',
  description:
    'Roman to Integer (LeetCode 13) converts a Roman numeral to its value. Reading left to right, a symbol is subtracted when the symbol after it is larger (IV = 4, CM = 900) and added otherwise, in a single pass.',
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', bestFor: 'Parsing numerals with subtractive pairs' },
  defaultInput: [],
  inputSpec,

  code: {
    c: `int symbolValue(char c) {
    switch (c) {
        case 'I': return 1;
        case 'V': return 5;
        case 'X': return 10;
        case 'L': return 50;
        case 'C': return 100;
        case 'D': return 500;
        case 'M': return 1000;
        default: return 0;
    }
}

int romanToInt(const char *s) {
    int n = strlen(s);
    int total = 0;
    for (int i = 0; i < n; i++) {
        int value = symbolValue(s[i]);
        if (i + 1 < n && value < symbolValue(s[i + 1])) {
            total -= value;
        } else {
            total += value;
        }
    }
    return total;
}`,
    cpp: `int romanToInt(string s) {
    unordered_map<char, int> values = {{'I', 1}, {'V', 5}, {'X', 10}, {'L', 50}, {'C', 100}, {'D', 500}, {'M', 1000}};
    int total = 0;
    for (int i = 0; i < (int)s.size(); i++) {
        int value = values[s[i]];
        if (i + 1 < (int)s.size() && value < values[s[i + 1]]) {
            total -= value;
        } else {
            total += value;
        }
    }
    return total;
}`,
    java: `import java.util.Map;

public class RomanToInteger {
    public static int romanToInt(String s) {
        Map<Character, Integer> values = Map.of('I', 1, 'V', 5, 'X', 10, 'L', 50, 'C', 100, 'D', 500, 'M', 1000);
        int total = 0;
        for (int i = 0; i < s.length(); i++) {
            int value = values.get(s.charAt(i));
            if (i + 1 < s.length() && value < values.get(s.charAt(i + 1))) {
                total -= value;
            } else {
                total += value;
            }
        }
        return total;
    }
}`,
    python: `def roman_to_int(s):
    values = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
    total = 0
    for i in range(len(s)):
        value = values[s[i]]
        if i + 1 < len(s) and value < values[s[i + 1]]:
            total -= value
        else:
            total += value
    return total`,
  },

  lineMap: {
    c: { 'fn-entry': 14, 'init-total': 16, loop: 17, 'read-value': 18, 'compare-next': 19, subtract: 20, add: 22, return: 25 },
    cpp: { 'fn-entry': 1, 'init-total': 3, loop: 4, 'read-value': 5, 'compare-next': 6, subtract: 7, add: 9, return: 12 },
    java: { 'fn-entry': 4, 'init-total': 6, loop: 7, 'read-value': 8, 'compare-next': 9, subtract: 10, add: 12, return: 15 },
    python: { 'fn-entry': 1, 'init-total': 3, loop: 4, 'read-value': 5, 'compare-next': 6, subtract: 7, add: 9, return: 10 },
  },

  generateSteps: generateRomanSteps,
};
