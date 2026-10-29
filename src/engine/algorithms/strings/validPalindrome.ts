import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, NumberCell, TextView } from '../../../types/algorithm';
import { charText, marks, quoted, stepRecorder, textInputs } from './textInput';

const inputSpec: AlgorithmInputSpec = {
  texts: [
    {
      label: 's',
      hint: 'Any printable ASCII text, 1 to 32 characters, e.g. A man, a plan, a canal: Panama',
      defaultValue: 'A man, a plan, a canal: Panama',
      minLength: 1,
      maxLength: 32,
      chars: { pattern: '[ -~]', description: 'printable ASCII characters (letters, digits, spaces and punctuation)' },
    },
  ],
  textExamples: [['A man, a plan, a canal: Panama'], ['race a car'], [' '], ['No lemon, no melon'], ['0P'], ['Was it a car or a cat I saw?'], ['ab_a'], ['Madam']],
};

/** letters and digits count; everything else (spaces, punctuation) is skipped, as by isalnum */
const isAlnum = (c: string) => /^[A-Za-z0-9]$/.test(c);

/**
 * Valid Palindrome: two pointers from both ends move inwards, skipping characters that are not letters or digits and
 * comparing the rest without regard to case. O(n) time, O(1) space — no cleaned copy of the string is made.
 */
function generatePalindromeSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [s] = textInputs(inputSpec, params, 'Valid Palindrome');
  const n = s.length;
  const { steps, push } = stepRecorder();
  const skipped: number[] = [];
  const pairs: number[] = [];
  let left: number | null = null;
  let right: number | null = null;

  type Roles = Partial<Record<'left' | 'right', NumberCell['role']>>;
  const view = (roles: Roles = {}, focus: { left?: boolean; right?: boolean; outcome?: 'match' | 'mismatch' } = {}, result?: TextView['result']): TextView => ({
    rows: [
      {
        name: 's',
        text: s,
        pointers: [...(left !== null ? [{ name: 'left', index: left }] : []), ...(right !== null ? [{ name: 'right', index: right }] : [])],
        marks: marks(
          [skipped, 'skipped'],
          [pairs, 'match'],
          [focus.left && left !== null ? [left] : [], focus.outcome ?? 'current'],
          [focus.right && right !== null ? [right] : [], focus.outcome ?? 'compare']
        ),
      },
    ],
    cells: [
      { name: 'left', value: left, role: roles.left },
      { name: 'right', value: right, role: roles.right },
      { name: 's[left]', value: left !== null && left < n ? quoted(s[left]) : null },
      { name: 's[right]', value: right !== null && right >= 0 ? quoted(s[right]) : null },
    ],
    ...(result ? { result } : {}),
  });

  const finish = (codeRef: 'return-false' | 'return-true', yes: boolean, why: string, outcome?: 'mismatch') =>
    push({
      type: 'complete',
      codeRef,
      variables: { palindrome: yes },
      text: view({}, outcome ? { left: true, right: true, outcome } : {}, { kind: yes ? 'yes' : 'no', text: yes ? `${quoted(s)} is a palindrome` : `${quoted(s)} is not a palindrome` }),
      message: `Return ${yes ? 'true' : 'false'}`,
      explanation: `${why} Each character is visited at most once: O(n) time, O(1) space.`,
      actionLabel: yes ? 'Palindrome' : 'Not a palindrome',
      outcomeText: yes ? `${quoted(s)} is a palindrome` : `${quoted(s)} is not a palindrome`,
    });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { s },
    text: view(),
    message: `isPalindrome(${quoted(s)})`,
    explanation: 'Only letters and digits count, and case does not matter. Compare from both ends inwards, skipping everything else.',
    actionLabel: 'Start',
  });

  left = 0;
  right = n - 1;
  push({
    type: 'assign',
    codeRef: 'init-pointers',
    variables: { left, right },
    text: view({ left: 'changed', right: 'changed' }),
    message: `left = 0, right = ${right}`,
    explanation: 'left starts at the first character, right at the last.',
    actionLabel: 'Pointers',
  });

  for (;;) {
    const go = left < right;
    push({
      type: 'loop-condition',
      codeRef: 'loop',
      variables: { left, right },
      text: view({ left: 'current', right: 'current' }),
      result: go ? 'true' : 'false',
      message: `left < right?  ${left} < ${right} → ${go}`,
      explanation: go ? 'There are characters left to compare.' : 'The pointers have met: every pair matched.',
      actionLabel: go ? 'Continue' : 'Pointers met',
    });
    if (!go) break;

    const leftOther = !isAlnum(s[left]);
    push({
      type: 'condition',
      codeRef: 'check-left',
      variables: { left, 's[left]': s[left] },
      text: view({ left: 'current' }, { left: true }),
      result: leftOther ? 'true' : 'false',
      message: `s[left] is not alphanumeric?  ${charText(s[left])} → ${leftOther}`,
      explanation: leftOther ? `${charText(s[left])} is not a letter or digit: skip it.` : `${charText(s[left])} counts.`,
      actionLabel: leftOther ? 'Skip left' : 'Left counts',
    });
    if (leftOther) {
      skipped.push(left);
      left++;
      push({
        type: 'increment',
        codeRef: 'skip-left',
        variables: { left },
        text: view({ left: 'changed' }),
        message: `left = ${left}`,
        explanation: 'Move left past the skipped character.',
        actionLabel: 'left++',
      });
      continue;
    }

    const rightOther = !isAlnum(s[right]);
    push({
      type: 'condition',
      codeRef: 'check-right',
      variables: { right, 's[right]': s[right] },
      text: view({ right: 'current' }, { right: true }),
      result: rightOther ? 'true' : 'false',
      message: `s[right] is not alphanumeric?  ${charText(s[right])} → ${rightOther}`,
      explanation: rightOther ? `${charText(s[right])} is not a letter or digit: skip it.` : `${charText(s[right])} counts.`,
      actionLabel: rightOther ? 'Skip right' : 'Right counts',
    });
    if (rightOther) {
      skipped.push(right);
      right--;
      push({
        type: 'decrement',
        codeRef: 'skip-right',
        variables: { right },
        text: view({ right: 'changed' }),
        message: `right = ${right}`,
        explanation: 'Move right past the skipped character.',
        actionLabel: 'right--',
      });
      continue;
    }

    const l = s[left].toLowerCase();
    const r = s[right].toLowerCase();
    const differ = l !== r;
    push({
      type: 'compare',
      codeRef: 'compare',
      variables: { left, right, 'lower(s[left])': l, 'lower(s[right])': r },
      text: view({ left: 'current', right: 'current' }, { left: true, right: true, outcome: differ ? 'mismatch' : 'match' }),
      result: differ ? 'true' : 'false',
      message: `lower(s[left]) != lower(s[right])?  ${charText(l)} != ${charText(r)} → ${differ}`,
      explanation: differ ? `${charText(s[left])} and ${charText(s[right])} differ.` : `${charText(s[left])} and ${charText(s[right])} match${s[left] !== s[right] ? ' (ignoring case)' : ''}.`,
      actionLabel: differ ? 'Mismatch' : 'Match',
    });
    if (differ) {
      finish('return-false', false, `Index ${left} (${charText(s[left])}) and index ${right} (${charText(s[right])}) differ.`, 'mismatch');
      return steps;
    }

    pairs.push(left, right);
    left++;
    right--;
    push({
      type: 'update',
      codeRef: 'move-both',
      variables: { left, right },
      text: view({ left: 'changed', right: 'changed' }),
      message: `left = ${left}, right = ${right}`,
      explanation: 'The pair matched: move both pointers inwards.',
      actionLabel: 'left++, right--',
    });
  }

  finish('return-true', true, pairs.length ? `${pairs.length / 2} pair${pairs.length === 2 ? '' : 's'} matched.` : 'There were no two letters or digits to compare.');
  return steps;
}

export const validPalindromeDefinition: AlgorithmDefinition = {
  id: 'valid-palindrome',
  name: 'Valid Palindrome',
  category: 'STRINGS',
  visual: 'text',
  subtitle: 'Two pointers inwards, skipping non-alphanumerics.',
  description:
    'Valid Palindrome (LeetCode 125) checks whether a string reads the same forwards and backwards when only letters and digits count and case is ignored. Two pointers move inwards from both ends, skipping other characters and comparing the rest in lowercase.',
  complexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', bestFor: 'Palindrome checks without building a cleaned copy' },
  defaultInput: [],
  inputSpec,

  code: {
    c: `bool isPalindrome(const char *s) {
    int left = 0, right = strlen(s) - 1;
    while (left < right) {
        if (!isalnum(s[left])) {
            left++;
        } else if (!isalnum(s[right])) {
            right--;
        } else if (tolower(s[left]) != tolower(s[right])) {
            return false;
        } else {
            left++;
            right--;
        }
    }
    return true;
}`,
    cpp: `bool isPalindrome(string s) {
    int left = 0, right = (int)s.size() - 1;
    while (left < right) {
        if (!isalnum(s[left])) {
            left++;
        } else if (!isalnum(s[right])) {
            right--;
        } else if (tolower(s[left]) != tolower(s[right])) {
            return false;
        } else {
            left++;
            right--;
        }
    }
    return true;
}`,
    java: `public class ValidPalindrome {
    public static boolean isPalindrome(String s) {
        int left = 0, right = s.length() - 1;
        while (left < right) {
            if (!Character.isLetterOrDigit(s.charAt(left))) {
                left++;
            } else if (!Character.isLetterOrDigit(s.charAt(right))) {
                right--;
            } else if (Character.toLowerCase(s.charAt(left)) != Character.toLowerCase(s.charAt(right))) {
                return false;
            } else {
                left++;
                right--;
            }
        }
        return true;
    }
}`,
    python: `def is_palindrome(s):
    left, right = 0, len(s) - 1
    while left < right:
        if not s[left].isalnum():
            left += 1
        elif not s[right].isalnum():
            right -= 1
        elif s[left].lower() != s[right].lower():
            return False
        else:
            left += 1
            right -= 1
    return True`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'init-pointers': 2, loop: 3, 'check-left': 4, 'skip-left': 5, 'check-right': 6, 'skip-right': 7, compare: 8, 'return-false': 9, 'move-both': 11, 'return-true': 15 },
    cpp: { 'fn-entry': 1, 'init-pointers': 2, loop: 3, 'check-left': 4, 'skip-left': 5, 'check-right': 6, 'skip-right': 7, compare: 8, 'return-false': 9, 'move-both': 11, 'return-true': 15 },
    java: { 'fn-entry': 2, 'init-pointers': 3, loop: 4, 'check-left': 5, 'skip-left': 6, 'check-right': 7, 'skip-right': 8, compare: 9, 'return-false': 10, 'move-both': 12, 'return-true': 16 },
    python: { 'fn-entry': 1, 'init-pointers': 2, loop: 3, 'check-left': 4, 'skip-left': 5, 'check-right': 6, 'skip-right': 7, compare: 8, 'return-false': 9, 'move-both': 11, 'return-true': 13 },
  },
  // both pointers move in two statements on two lines
  lineSpans: { c: { 'move-both': 2 }, cpp: { 'move-both': 2 }, java: { 'move-both': 2 }, python: { 'move-both': 2 } },

  generateSteps: generatePalindromeSteps,
};
