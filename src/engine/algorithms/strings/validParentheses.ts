import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, NumberCell, TextView } from '../../../types/algorithm';
import { charText, marks, quoted, range, stepRecorder, textInputs } from './textInput';

const OPENER: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };
const isOpen = (c: string) => c === '(' || c === '[' || c === '{';

const inputSpec: AlgorithmInputSpec = {
  texts: [
    {
      label: 's',
      hint: 'Brackets only: ( ) [ ] { }, 1 to 20 of them, e.g. ([]){}',
      defaultValue: '([]){}',
      minLength: 1,
      maxLength: 20,
      chars: { pattern: '[()\\[\\]{}]', description: 'the brackets ( ) [ ] { }' },
    },
  ],
  textExamples: [['()'], ['()[]{}'], ['(]'], ['([])'], ['([)]'], ['{[()()]}'], ['(('], ['){'], ['([]){}']],
};

/**
 * Valid Parentheses: push every opening bracket; a closing bracket must match the bracket on top of the stack, which is
 * then popped. A closing bracket with an empty stack or the wrong opener on top, or brackets still open at the end,
 * make the string invalid. O(n) time, O(n) space for the stack.
 */
function generateParenthesesSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [s] = textInputs(inputSpec, params, 'Valid Parentheses');
  const n = s.length;
  const { steps, push } = stepRecorder();
  // the stack holds the open brackets' positions, so a matched pair can be shown on the string
  const stack: number[] = [];
  const matched: number[] = [];

  type Roles = Partial<Record<'i' | 'ch' | 'top', NumberCell['role']>>;
  const view = (
    i: number | null,
    opts: { roles?: Roles; action?: NonNullable<TextView['stack']>['action']; bad?: number[]; result?: TextView['result'] } = {}
  ): TextView => ({
    rows: [
      {
        name: 's',
        text: s,
        pointers: i !== null ? [{ name: 'i', index: i }] : [],
        marks: marks(
          [range(0, (i ?? 0) - 1), 'done'],
          [matched, 'match'],
          [stack, 'compare'],
          [i !== null && i < n ? [i] : [], 'current'],
          [opts.bad ?? [], 'mismatch']
        ),
      },
    ],
    stack: { items: stack.map(p => s[p]), ...(opts.action ? { action: opts.action } : {}) },
    cells: [
      { name: 'i', value: i, role: opts.roles?.i },
      { name: 'ch', value: i !== null && i < n ? quoted(s[i]) : null, role: opts.roles?.ch },
      { name: 'top', value: stack.length ? quoted(s[stack[stack.length - 1]]) : null, role: opts.roles?.top },
    ],
    ...(opts.result ? { result: opts.result } : {}),
  });

  const finish = (codeRef: 'return-false' | 'return', valid: boolean, why: string, i: number | null, bad: number[] = []) =>
    push({
      type: 'complete',
      codeRef,
      variables: { valid },
      text: view(i, { bad, result: { kind: valid ? 'yes' : 'no', text: valid ? `${quoted(s)} is valid` : `${quoted(s)} is not valid` } }),
      message: `Return ${valid ? 'true' : 'false'}`,
      explanation: `${why} Each bracket is pushed and popped at most once: O(n) time, O(n) space for the stack.`,
      actionLabel: valid ? 'Valid' : 'Invalid',
      outcomeText: valid ? `${quoted(s)} is valid` : `${quoted(s)} is not valid`,
    });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { s },
    text: view(null),
    message: `isValid(${quoted(s)})`,
    explanation: 'Every closing bracket must close the most recent bracket still open — exactly what a stack gives.',
    actionLabel: 'Start',
  });
  push({
    type: 'assign',
    codeRef: 'init-stack',
    variables: { stack: [] },
    text: view(null, { action: 'empty' }),
    message: 'stack = []',
    explanation: 'The stack holds the brackets opened but not yet closed, the most recent on top.',
    actionLabel: 'Empty stack',
  });

  for (let i = 0; ; i++) {
    const inLoop = i < n;
    push({
      type: 'loop-condition',
      codeRef: 'loop',
      variables: inLoop ? { i, ch: s[i] } : { i, n },
      text: view(i, { roles: { i: 'changed', ch: 'changed' } }),
      result: inLoop ? 'true' : 'false',
      message: inLoop ? `ch = s[${i}] = ${charText(s[i])}` : `All ${n} brackets read`,
      explanation: inLoop ? `Bracket ${i + 1} of ${n}.` : stack.length === 0 ? 'Every bracket was closed.' : `${stack.length} bracket${stack.length === 1 ? ' is' : 's are'} still open.`,
      actionLabel: inLoop ? `ch = ${s[i]}` : 'Loop ends',
    });
    if (!inLoop) break;

    const ch = s[i];
    const opening = isOpen(ch);
    push({
      type: 'condition',
      codeRef: 'is-open',
      variables: { ch },
      text: view(i, { roles: { ch: 'current' } }),
      result: opening ? 'true' : 'false',
      message: `Is ${charText(ch)} an opening bracket? → ${opening}`,
      explanation: opening ? 'An opening bracket waits on the stack for its closing bracket.' : 'A closing bracket must close the bracket on top of the stack.',
      actionLabel: opening ? 'Opening' : 'Closing',
    });

    if (opening) {
      stack.push(i);
      push({
        type: 'update',
        codeRef: 'push',
        variables: { stack: stack.map(p => s[p]) },
        text: view(i, { action: 'push', roles: { top: 'changed' } }),
        message: `push ${charText(ch)}  →  stack = [${stack.map(p => s[p]).join(' ')}]`,
        explanation: `${charText(ch)} is now the most recent open bracket.`,
        actionLabel: `Push ${ch}`,
      });
      continue;
    }

    const empty = stack.length === 0;
    const top = empty ? null : s[stack[stack.length - 1]];
    const wrong = !empty && top !== OPENER[ch];
    push({
      type: 'compare',
      codeRef: 'check-close',
      variables: { ch, expected: OPENER[ch], ...(empty ? { stack: [] } : { top }) },
      text: view(i, { roles: { ch: 'current', top: empty ? undefined : 'current' }, ...(empty ? { action: 'empty' as const } : wrong ? { action: 'mismatch' as const } : {}), bad: empty || wrong ? [i, ...(wrong ? [stack[stack.length - 1]] : [])] : [] }),
      result: empty || wrong ? 'true' : 'false',
      message: empty
        ? `stack is empty → true: nothing for ${charText(ch)} to close`
        : `top != ${charText(OPENER[ch])}?  ${charText(top!)} != ${charText(OPENER[ch])} → ${wrong}`,
      explanation: empty
        ? `${charText(ch)} closes a bracket that was never opened.`
        : wrong
          ? `${charText(ch)} needs ${charText(OPENER[ch])} on top, but the most recent open bracket is ${charText(top!)}.`
          : `${charText(top!)} on top is the matching opener.`,
      actionLabel: empty ? 'Nothing to close' : wrong ? 'Mismatch' : 'Matches',
    });
    if (empty || wrong) {
      finish('return-false', false, empty ? `${charText(ch)} at index ${i} has nothing to close.` : `${charText(ch)} at index ${i} does not close ${charText(top!)}.`, i, [i, ...(wrong ? [stack[stack.length - 1]] : [])]);
      return steps;
    }

    matched.push(stack.pop()!, i);
    push({
      type: 'update',
      codeRef: 'pop',
      variables: { stack: stack.map(p => s[p]) },
      text: view(i, { action: 'pop', roles: { top: 'changed' } }),
      message: `pop ${charText(top!)}  →  stack = [${stack.map(p => s[p]).join(' ')}]`,
      explanation: `${charText(top!)} and ${charText(ch)} form a matched pair.`,
      actionLabel: `Pop ${top}`,
    });
  }

  const valid = stack.length === 0;
  finish('return', valid, valid ? 'The stack is empty: every bracket was closed in the right order.' : `The stack still holds ${stack.map(p => s[p]).join(' ')}: ${stack.length === 1 ? 'a bracket was' : 'brackets were'} never closed.`, n, valid ? [] : [...stack]);
  return steps;
}

export const validParenthesesDefinition: AlgorithmDefinition = {
  id: 'valid-parentheses',
  name: 'Valid Parentheses',
  category: 'STRINGS',
  visual: 'text',
  subtitle: 'A stack of open brackets; each closer must match the top.',
  description:
    'Valid Parentheses (LeetCode 20) checks that every bracket is closed by the same type of bracket, in the right order. A stack holds the open brackets: each closing bracket must match the one on top, and the stack must be empty at the end.',
  complexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)', space: 'O(n)', bestFor: 'Matching nested pairs with a stack' },
  defaultInput: [],
  inputSpec,

  code: {
    c: `char openerOf(char c) {
    return c == ')' ? '(' : c == ']' ? '[' : '{';
}

bool isValid(const char *s) {
    char stack[10000];
    int top = 0;
    for (int i = 0; s[i] != '\\0'; i++) {
        char ch = s[i];
        if (ch == '(' || ch == '[' || ch == '{') {
            stack[top++] = ch;
        } else if (top == 0 || stack[top - 1] != openerOf(ch)) {
            return false;
        } else {
            top--;
        }
    }
    return top == 0;
}`,
    cpp: `bool isValid(string s) {
    unordered_map<char, char> pairs = {{')', '('}, {']', '['}, {'}', '{'}};
    stack<char> st;
    for (char ch : s) {
        if (ch == '(' || ch == '[' || ch == '{') {
            st.push(ch);
        } else if (st.empty() || st.top() != pairs[ch]) {
            return false;
        } else {
            st.pop();
        }
    }
    return st.empty();
}`,
    java: `import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;

public class ValidParentheses {
    public static boolean isValid(String s) {
        Map<Character, Character> pairs = Map.of(')', '(', ']', '[', '}', '{');
        Deque<Character> stack = new ArrayDeque<>();
        for (char ch : s.toCharArray()) {
            if (ch == '(' || ch == '[' || ch == '{') {
                stack.push(ch);
            } else if (stack.isEmpty() || !stack.peek().equals(pairs.get(ch))) {
                return false;
            } else {
                stack.pop();
            }
        }
        return stack.isEmpty();
    }
}`,
    python: `def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in '([{':
            stack.append(ch)
        elif not stack or stack[-1] != pairs[ch]:
            return False
        else:
            stack.pop()
    return not stack`,
  },

  lineMap: {
    c: { 'fn-entry': 5, 'init-stack': 6, loop: 8, 'is-open': 10, push: 11, 'check-close': 12, 'return-false': 13, pop: 15, return: 18 },
    cpp: { 'fn-entry': 1, 'init-stack': 3, loop: 4, 'is-open': 5, push: 6, 'check-close': 7, 'return-false': 8, pop: 10, return: 13 },
    java: { 'fn-entry': 6, 'init-stack': 8, loop: 9, 'is-open': 10, push: 11, 'check-close': 12, 'return-false': 13, pop: 15, return: 18 },
    python: { 'fn-entry': 1, 'init-stack': 3, loop: 4, 'is-open': 5, push: 6, 'check-close': 7, 'return-false': 8, pop: 10, return: 11 },
  },
  // C: the stack is an array and its top index (2 lines); each character is read into ch on the line after the loop
  lineSpans: { c: { 'init-stack': 2, loop: 2 } },

  generateSteps: generateParenthesesSteps,
};
