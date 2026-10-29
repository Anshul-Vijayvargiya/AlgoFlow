import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, NumberCell, TextView } from '../../../types/algorithm';
import { marks, quoted, range, stepRecorder, textInputs } from './textInput';

const BITS = { pattern: '[01]', description: 'the digits 0 and 1' } as const;

const inputSpec: AlgorithmInputSpec = {
  texts: [
    { label: 'a', hint: 'A binary number: 1 to 12 digits of 0 and 1, no leading zeros', defaultValue: '1010', minLength: 1, maxLength: 12, chars: BITS, rule: 'binary-number' },
    { label: 'b', hint: 'A binary number: 1 to 12 digits of 0 and 1, no leading zeros', defaultValue: '1011', minLength: 1, maxLength: 12, chars: BITS, rule: 'binary-number' },
  ],
  textExamples: [['11', '1'], ['1010', '1011'], ['0', '0'], ['1111', '1'], ['100', '110010'], ['1', '111'], ['101101', '11011']],
};

/**
 * Add Binary: add the two numbers digit by digit from the right, as on paper. Each column adds the carry and the
 * digits that exist; the column's bit is total % 2 and the new carry total / 2. The bits are produced lowest first and
 * reversed at the end. O(max(n, m)) time, O(max(n, m)) space for the result.
 */
function generateAddBinarySteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [a, b] = textInputs(inputSpec, params, 'Add Binary');
  const { steps, push } = stepRecorder();
  // every row is aligned on the rightmost (units) column; the sum can have one more digit than the longer input
  const width = Math.max(a.length, b.length) + 1;
  let i: number | null = null;
  let j: number | null = null;
  let carry: number | null = null;
  let total: number | null = null;
  // the bits produced so far, lowest first: exactly the code's result buffer before it is reversed
  let bits: string[] | null = null;

  type Roles = Partial<Record<'i' | 'j' | 'carry' | 'total', NumberCell['role']>>;
  /** `reading` marks the digits this step reads (at index i / j); `wrote` marks the bit just written */
  const view = (roles: Roles = {}, reading: { a?: number; b?: number } = {}, wrote = false, result?: TextView['result']): TextView => {
    const built = bits ? [...bits].reverse().join('') : '';
    return {
      rows: [
        {
          name: 'a',
          text: a,
          offset: width - a.length,
          pointers: i !== null ? [{ name: 'i', index: i }] : [],
          marks: marks([range((i ?? a.length - 1) + 1, a.length - 1), 'done'], [reading.a !== undefined ? [reading.a] : [], 'current']),
        },
        {
          name: 'b',
          text: b,
          offset: width - b.length,
          pointers: j !== null ? [{ name: 'j', index: j }] : [],
          marks: marks([range((j ?? b.length - 1) + 1, b.length - 1), 'done'], [reading.b !== undefined ? [reading.b] : [], 'current']),
        },
        {
          // shown by place value, under its column: the code keeps the bits lowest first and reverses them at the end
          name: 'result',
          text: built,
          offset: width - built.length,
          marks: marks([range(0, built.length - 1), 'match'], [wrote && built.length ? [0] : [], 'current']),
        },
      ],
      cells: [
        { name: 'i', value: i, role: roles.i },
        { name: 'j', value: j, role: roles.j },
        { name: 'carry', value: carry, role: roles.carry },
        { name: 'total', value: total, role: roles.total },
      ],
      ...(result ? { result } : {}),
    };
  };

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { a, b },
    text: view(),
    message: `addBinary(${quoted(a)}, ${quoted(b)})`,
    explanation: 'Add column by column from the right, carrying 1 whenever a column adds up to 2 or 3 — as in decimal addition, but in base 2.',
    actionLabel: 'Start',
  });

  i = a.length - 1;
  j = b.length - 1;
  push({
    type: 'assign',
    codeRef: 'init-pointers',
    variables: { i, j },
    text: view({ i: 'changed', j: 'changed' }),
    message: `i = ${i}, j = ${j}`,
    explanation: 'i and j start at the last (units) digit of a and b.',
    actionLabel: 'Pointers',
  });

  carry = 0;
  bits = [];
  push({
    type: 'assign',
    codeRef: 'init-carry',
    variables: { carry, result: '' },
    text: view({ carry: 'changed' }),
    message: 'carry = 0, result = empty',
    explanation: 'Nothing is carried into the first column; result collects the sum’s bits, lowest first.',
    actionLabel: 'carry = 0',
  });

  for (;;) {
    const go = i >= 0 || j >= 0 || carry > 0;
    push({
      type: 'loop-condition',
      codeRef: 'loop',
      variables: { i, j, carry },
      text: view({ i: 'current', j: 'current', carry: 'current' }),
      result: go ? 'true' : 'false',
      message: `i >= 0 or j >= 0 or carry?  ${i} >= 0 or ${j} >= 0 or ${carry} → ${go}`,
      explanation: go
        ? i < 0 && j < 0
          ? 'Both numbers are used up, but a carry is left: it becomes a new leading 1.'
          : `Column ${bits.length} (worth 2^${bits.length}).`
        : 'No digits and no carry are left.',
      actionLabel: go ? `Column ${bits.length}` : 'Loop ends',
    });
    if (!go) break;

    total = carry;
    push({
      type: 'assign',
      codeRef: 'start-total',
      variables: { total },
      text: view({ total: 'changed' }),
      message: `total = carry = ${carry}`,
      explanation: 'Start the column with the carry from the column to its right.',
      actionLabel: 'total = carry',
    });

    for (const side of ['a', 'b'] as const) {
      const pos: number = side === 'a' ? i : j;
      const has = pos >= 0;
      push({
        type: 'condition',
        codeRef: side === 'a' ? 'check-a' : 'check-b',
        variables: side === 'a' ? { i } : { j },
        text: view(side === 'a' ? { i: 'current' } : { j: 'current' }),
        result: has ? 'true' : 'false',
        message: `${side === 'a' ? 'i' : 'j'} >= 0?  ${pos} >= 0 → ${has}`,
        explanation: has ? `${side} has a digit in this column.` : `${side} has no more digits (its higher digits are 0).`,
        actionLabel: has ? `${side} has a digit` : `${side} is used up`,
      });
      if (!has) continue;
      const text = side === 'a' ? a : b;
      const digit = Number(text[pos]);
      const before: number = total;
      total += digit;
      if (side === 'a') i = pos - 1;
      else j = pos - 1;
      push({
        type: 'update',
        codeRef: side === 'a' ? 'add-a' : 'add-b',
        variables: { total, ...(side === 'a' ? { i } : { j }) },
        text: view({ total: 'changed', ...(side === 'a' ? { i: 'changed' as const } : { j: 'changed' as const }) }, side === 'a' ? { a: pos } : { b: pos }),
        message: `total += ${side}[${pos}]  →  ${before} + ${digit} = ${total};  ${side === 'a' ? 'i' : 'j'} = ${pos - 1}`,
        explanation: `${side}[${pos}] is ${digit}.`,
        actionLabel: `+ ${side}[${pos}]`,
      });
    }

    const bit = total % 2;
    bits.push(String(bit));
    push({
      type: 'assign',
      codeRef: 'write-bit',
      variables: { total, bit },
      text: view({ total: 'current' }, {}, true),
      message: `result.append(total % 2)  →  ${total} % 2 = ${bit}`,
      explanation: `The column's bit is ${bit}. (result keeps bits lowest first; here they are shown under their columns.)`,
      actionLabel: `Bit ${bit}`,
    });

    const before = carry;
    carry = Math.floor(total / 2);
    push({
      type: 'assign',
      codeRef: 'set-carry',
      variables: { carry },
      text: view({ carry: 'changed' }),
      message: `carry = total / 2 = ${total} / 2 = ${carry}`,
      explanation: carry ? `${total} is 2 or more: carry 1 into the next column.` : `Nothing to carry${before ? ' this time' : ''}.`,
      actionLabel: `carry = ${carry}`,
    });
    total = null;
  }

  const sum = [...bits].reverse().join('');
  push({
    type: 'complete',
    codeRef: 'return',
    variables: { result: sum },
    text: view({}, {}, false, { kind: 'answer', text: `${a} + ${b} = ${sum} (binary)` }),
    message: `Return reversed result = ${quoted(sum)}`,
    explanation: `${bits.length} column${bits.length === 1 ? '' : 's'}: O(max(n, m)) time, and O(max(n, m)) space for the result.`,
    actionLabel: `Return ${sum}`,
    outcomeText: `${a} + ${b} = ${sum} (binary)`,
  });
  return steps;
}

export const addBinaryDefinition: AlgorithmDefinition = {
  id: 'add-binary',
  name: 'Add Binary',
  category: 'STRINGS',
  visual: 'text',
  subtitle: 'Column addition from the right with a carry.',
  description:
    'Add Binary (LeetCode 67) adds two binary strings. Like column addition on paper, it walks both strings from the right: each column adds the carry and the available digits, writes total % 2 and carries total / 2. The bits come out lowest first and are reversed at the end.',
  complexity: { best: 'O(max(n, m))', average: 'O(max(n, m))', worst: 'O(max(n, m))', space: 'O(max(n, m))', bestFor: 'Adding numbers too long for an integer type' },
  defaultInput: [],
  inputSpec,

  code: {
    c: `void reverse(char *s, int n) {
    for (int l = 0, r = n - 1; l < r; l++, r--) {
        char t = s[l];
        s[l] = s[r];
        s[r] = t;
    }
}

char *addBinary(const char *a, const char *b) {
    int i = strlen(a) - 1, j = strlen(b) - 1;
    int carry = 0, k = 0;
    char *result = malloc((i > j ? i : j) + 3);
    while (i >= 0 || j >= 0 || carry) {
        int total = carry;
        if (i >= 0) {
            total += a[i--] - '0';
        }
        if (j >= 0) {
            total += b[j--] - '0';
        }
        result[k++] = '0' + total % 2;
        carry = total / 2;
    }
    result[k] = '\\0';
    reverse(result, k);
    return result;
}`,
    cpp: `string addBinary(string a, string b) {
    int i = (int)a.size() - 1, j = (int)b.size() - 1;
    int carry = 0;
    string result;
    while (i >= 0 || j >= 0 || carry) {
        int total = carry;
        if (i >= 0) {
            total += a[i--] - '0';
        }
        if (j >= 0) {
            total += b[j--] - '0';
        }
        result.push_back('0' + total % 2);
        carry = total / 2;
    }
    reverse(result.begin(), result.end());
    return result;
}`,
    java: `public class AddBinary {
    public static String addBinary(String a, String b) {
        int i = a.length() - 1, j = b.length() - 1;
        int carry = 0;
        StringBuilder result = new StringBuilder();
        while (i >= 0 || j >= 0 || carry > 0) {
            int total = carry;
            if (i >= 0) {
                total += a.charAt(i--) - '0';
            }
            if (j >= 0) {
                total += b.charAt(j--) - '0';
            }
            result.append(total % 2);
            carry = total / 2;
        }
        return result.reverse().toString();
    }
}`,
    python: `def add_binary(a, b):
    i, j = len(a) - 1, len(b) - 1
    carry = 0
    result = []
    while i >= 0 or j >= 0 or carry:
        total = carry
        if i >= 0:
            total += int(a[i])
            i -= 1
        if j >= 0:
            total += int(b[j])
            j -= 1
        result.append(str(total % 2))
        carry = total // 2
    return ''.join(reversed(result))`,
  },

  lineMap: {
    c: { 'fn-entry': 9, 'init-pointers': 10, 'init-carry': 11, loop: 13, 'start-total': 14, 'check-a': 15, 'add-a': 16, 'check-b': 18, 'add-b': 19, 'write-bit': 21, 'set-carry': 22, return: 26 },
    cpp: { 'fn-entry': 1, 'init-pointers': 2, 'init-carry': 3, loop: 5, 'start-total': 6, 'check-a': 7, 'add-a': 8, 'check-b': 10, 'add-b': 11, 'write-bit': 13, 'set-carry': 14, return: 17 },
    java: { 'fn-entry': 2, 'init-pointers': 3, 'init-carry': 4, loop: 6, 'start-total': 7, 'check-a': 8, 'add-a': 9, 'check-b': 11, 'add-b': 12, 'write-bit': 14, 'set-carry': 15, return: 17 },
    python: { 'fn-entry': 1, 'init-pointers': 2, 'init-carry': 3, loop: 5, 'start-total': 6, 'check-a': 7, 'add-a': 8, 'check-b': 10, 'add-b': 11, 'write-bit': 13, 'set-carry': 14, return: 15 },
  },
  // carry and the result buffer are declared on two lines; Python adds a digit and moves its pointer on two lines
  lineSpans: {
    c: { 'init-carry': 2 },
    cpp: { 'init-carry': 2 },
    java: { 'init-carry': 2 },
    python: { 'init-carry': 2, 'add-a': 2, 'add-b': 2 },
  },
  // C terminates and reverses the buffer, and C++ reverses it, just before returning it
  lineLeads: { c: { return: 2 }, cpp: { return: 1 } },

  generateSteps: generateAddBinarySteps,
};
