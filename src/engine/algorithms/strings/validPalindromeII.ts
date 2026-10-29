import type { AlgorithmDefinition, AlgorithmInputSpec, CharMark, ExecutionStep, NumberCell, TextRow, TextView } from '../../../types/algorithm';
import { charText, quoted, stepRecorder, textInputs } from './textInput';

const inputSpec: AlgorithmInputSpec = {
  texts: [
    {
      label: 's',
      hint: 'Lowercase letters a to z, 1 to 24 of them, e.g. abca',
      defaultValue: 'abca',
      minLength: 1,
      maxLength: 24,
      chars: { pattern: '[a-z]', description: 'lowercase letters a to z' },
    },
  ],
  textExamples: [['abca'], ['abc'], ['racecar'], ['cbbcc'], ['deeee'], ['eeccccbebaeeabebccceea'], ['ebcbbececabbacecbbcbe'], ['ab']],
};

type CandidateState = 'checking' | 'true' | 'false' | 'not needed';

/** one deletion candidate: the range s[lo..hi] checked without the character at `deleted` */
interface Candidate {
  readonly side: 'left' | 'right';
  readonly deleted: number;
  readonly lo: number;
  readonly hi: number;
  i: number;
  j: number;
  matched: number[];
  mismatch: number[];
  state: CandidateState;
}

/**
 * Valid Palindrome II: two pointers from both ends. At the first mismatch, at most one deletion can fix it: the string
 * is a palindrome after deleting s[left] or s[right] exactly when s[left+1..right] or s[left..right-1] is one. Each
 * candidate is checked with the same two-pointer scan; `||` stops after the first that succeeds. O(n) time, O(1) space.
 */
function generateSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [s] = textInputs(inputSpec, params, 'Valid Palindrome II');
  const n = s.length;
  const { steps, push } = stepRecorder();
  const pairs: number[] = [];
  let mismatch: [number, number] | null = null;
  let left: number | null = null;
  let right: number | null = null;
  const candidates: Candidate[] = [];

  /** the outer pointers' row; a candidate under it, aligned at the range it checks */
  const mainRow = (focus: 'compare' | 'match' | 'mismatch' | null): TextRow => {
    const marks: { index: number; mark: CharMark }[] = pairs.map(index => ({ index, mark: 'match' as const }));
    if (mismatch) marks.push({ index: mismatch[0], mark: 'mismatch' }, { index: mismatch[1], mark: 'mismatch' });
    else if (focus && left !== null && right !== null && left < right) {
      marks.push({ index: left, mark: focus === 'compare' ? 'current' : focus }, { index: right, mark: focus === 'compare' ? 'compare' : focus });
    }
    return {
      name: 's',
      text: s,
      pointers: [...(left !== null ? [{ name: 'left', index: left }] : []), ...(right !== null ? [{ name: 'right', index: right }] : [])],
      marks: marks.sort((a, b) => a.index - b.index),
    };
  };
  const candidateRow = (c: Candidate, focus: 'match' | 'mismatch' | null): TextRow => {
    const marks: { index: number; mark: CharMark }[] = [...c.matched, ...c.mismatch].map(k => ({
      index: k - c.lo,
      mark: c.mismatch.includes(k) ? ('mismatch' as const) : ('match' as const),
    }));
    if (focus && c.i < c.j) marks.push({ index: c.i - c.lo, mark: focus }, { index: c.j - c.lo, mark: focus });
    return {
      name: `without s[${c.deleted}]`,
      text: s.slice(c.lo, c.hi + 1),
      offset: c.lo,
      pointers: c.state === 'not needed' ? [] : [{ name: 'i', index: c.i - c.lo }, { name: 'j', index: c.j - c.lo }],
      marks: marks.sort((a, b) => a.index - b.index),
    };
  };

  type Roles = Partial<Record<'left' | 'right' | 'i' | 'j', NumberCell['role']>>;
  const view = (
    opts: { roles?: Roles; main?: 'compare' | 'match' | 'mismatch' | null; active?: Candidate; focus?: 'match' | 'mismatch' | null; result?: TextView['result'] } = {}
  ): TextView => {
    const active = opts.active;
    const stateOf = (side: 'left' | 'right') => candidates.find(c => c.side === side)?.state ?? null;
    return {
      rows: [mainRow(opts.main ?? null), ...candidates.map(c => candidateRow(c, c === active ? (opts.focus ?? null) : null))],
      cells: [
        { name: 'left', value: left, role: opts.roles?.left },
        { name: 'right', value: right, role: opts.roles?.right },
        { name: 'i', value: active ? active.i : null, role: opts.roles?.i },
        { name: 'j', value: active ? active.j : null, role: opts.roles?.j },
        { name: 'delete left', value: stateOf('left'), role: active?.side === 'left' ? 'current' : undefined },
        { name: 'delete right', value: stateOf('right'), role: active?.side === 'right' ? 'current' : undefined },
      ],
      ...(opts.result ? { result: opts.result } : {}),
    };
  };

  const finish = (codeRef: string, ok: boolean, text: string, why: string) =>
    push({
      type: 'complete',
      codeRef,
      variables: { result: ok },
      text: view({ result: { kind: ok ? 'yes' : 'no', text } }),
      message: `Return ${ok}`,
      explanation: `${why} Every character is read at most twice (once by the outer scan, once by a candidate check): O(n) time, O(1) space.`,
      actionLabel: ok ? 'Valid' : 'Not valid',
      outcomeText: text,
    });

  /** isPalindromeRange(s, lo, hi), traced: returns whether s[lo..hi] reads the same both ways */
  const check = (c: Candidate): boolean => {
    candidates.push(c);
    const codeRef = c.side === 'left' ? 'try-skip-left' : 'try-skip-right';
    push({
      type: 'condition',
      codeRef,
      variables: { i: c.i, j: c.j },
      text: view({ active: c, roles: { i: 'changed', j: 'changed' } }),
      message: `isPalindromeRange(s, ${c.lo}, ${c.hi})  — delete s[${c.deleted}] = ${charText(s[c.deleted])}`,
      explanation:
        c.side === 'left'
          ? `Try deleting the left character of the mismatch: is s[${c.lo}..${c.hi}] = ${quoted(s.slice(c.lo, c.hi + 1))} a palindrome?`
          : `Deleting the left one did not work: try deleting the right character, s[${c.deleted}]. Is s[${c.lo}..${c.hi}] = ${quoted(s.slice(c.lo, c.hi + 1))} a palindrome?`,
      actionLabel: `Delete s[${c.deleted}]`,
    });
    for (;;) {
      const go = c.i < c.j;
      push({
        type: 'loop-condition',
        codeRef: 'range-loop',
        variables: { i: c.i, j: c.j },
        text: view({ active: c, roles: { i: 'current', j: 'current' } }),
        result: go ? 'true' : 'false',
        message: `i < j?  ${c.i} < ${c.j} → ${go}`,
        explanation: go ? 'Characters are left to compare in this range.' : 'The pointers have met: every pair in the range matched.',
        actionLabel: go ? 'Continue' : 'Range checked',
      });
      if (!go) break;
      const differ = s[c.i] !== s[c.j];
      if (differ) c.mismatch.push(c.i, c.j);
      push({
        type: 'compare',
        codeRef: 'range-compare',
        variables: { i: c.i, j: c.j, 's[i]': s[c.i], 's[j]': s[c.j] },
        text: view({ active: c, focus: differ ? null : 'match', roles: { i: 'current', j: 'current' } }),
        result: differ ? 'true' : 'false',
        message: `s[i] != s[j]?  ${charText(s[c.i])} != ${charText(s[c.j])} → ${differ}`,
        explanation: differ ? 'A second mismatch: this deletion does not make a palindrome.' : 'They match.',
        actionLabel: differ ? 'Mismatch' : 'Match',
      });
      if (differ) {
        c.state = 'false';
        push({
          type: 'return',
          codeRef: 'range-false',
          variables: { result: false },
          text: view({ active: c }),
          message: `isPalindromeRange returns false`,
          explanation: `Deleting s[${c.deleted}] leaves ${charText(s[c.i])} and ${charText(s[c.j])} facing each other.`,
          actionLabel: 'false',
        });
        return false;
      }
      c.matched.push(c.i, c.j);
      c.i++;
      c.j--;
      push({
        type: 'update',
        codeRef: 'range-move',
        variables: { i: c.i, j: c.j },
        text: view({ active: c, roles: { i: 'changed', j: 'changed' } }),
        message: `i = ${c.i}, j = ${c.j}`,
        explanation: 'Move both inwards.',
        actionLabel: 'i++, j--',
      });
    }
    c.state = 'true';
    push({
      type: 'return',
      codeRef: 'range-true',
      variables: { result: true },
      text: view({ active: c }),
      message: 'isPalindromeRange returns true',
      explanation: `Without s[${c.deleted}] = ${charText(s[c.deleted])} the string is a palindrome.`,
      actionLabel: 'true',
    });
    return true;
  };

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { s },
    text: view(),
    message: `validPalindrome(${quoted(s)})`,
    explanation: 'Can s become a palindrome by deleting at most one character? Compare from both ends; only the first mismatch needs a decision.',
    actionLabel: 'Start',
  });
  left = 0;
  right = n - 1;
  push({
    type: 'assign',
    codeRef: 'init-pointers',
    variables: { left, right },
    text: view({ roles: { left: 'changed', right: 'changed' } }),
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
      text: view({ roles: { left: 'current', right: 'current' } }),
      result: go ? 'true' : 'false',
      message: `left < right?  ${left} < ${right} → ${go}`,
      explanation: go ? 'There are characters left to compare.' : 'The pointers have met without a mismatch.',
      actionLabel: go ? 'Continue' : 'Pointers met',
    });
    if (!go) break;

    const differ = s[left] !== s[right];
    if (differ) mismatch = [left, right];
    push({
      type: 'compare',
      codeRef: 'compare',
      variables: { left, right, 's[left]': s[left], 's[right]': s[right] },
      text: view({ main: differ ? 'mismatch' : 'match', roles: { left: 'current', right: 'current' } }),
      result: differ ? 'true' : 'false',
      message: `s[left] != s[right]?  ${charText(s[left])} != ${charText(s[right])} → ${differ}`,
      explanation: differ
        ? `The first mismatch. One of index ${left} and index ${right} must be the deleted character: try each.`
        : `${charText(s[left])} matches: move both inwards.`,
      actionLabel: differ ? 'First mismatch' : 'Match',
    });

    if (differ) {
      const l = left;
      const r = right;
      const skipLeft: Candidate = { side: 'left', deleted: l, lo: l + 1, hi: r, i: l + 1, j: r, matched: [], mismatch: [], state: 'checking' };
      if (check(skipLeft)) {
        candidates.push({ side: 'right', deleted: r, lo: l, hi: r - 1, i: l, j: r - 1, matched: [], mismatch: [], state: 'not needed' });
        finish('try-skip-left', true, `${quoted(s)} becomes a palindrome by deleting ${charText(s[l])} at index ${l}`, `The first check succeeded, so || does not evaluate the second (deleting s[${r}]).`);
        return steps;
      }
      const skipRight: Candidate = { side: 'right', deleted: r, lo: l, hi: r - 1, i: l, j: r - 1, matched: [], mismatch: [], state: 'checking' };
      const ok = check(skipRight);
      finish(
        'try-skip-right',
        ok,
        ok ? `${quoted(s)} becomes a palindrome by deleting ${charText(s[r])} at index ${r}` : `${quoted(s)} cannot become a palindrome by deleting one character`,
        ok ? `Deleting s[${l}] did not work, deleting s[${r}] did.` : `Neither deleting s[${l}] nor deleting s[${r}] removes the mismatch.`
      );
      return steps;
    }

    pairs.push(left, right);
    left++;
    right--;
    push({
      type: 'update',
      codeRef: 'move-both',
      variables: { left, right },
      text: view({ roles: { left: 'changed', right: 'changed' } }),
      message: `left = ${left}, right = ${right}`,
      explanation: 'The pair matched: move both pointers inwards.',
      actionLabel: 'left++, right--',
    });
  }

  finish('return-true', true, `${quoted(s)} is already a palindrome: no deletion needed`, pairs.length ? `All ${pairs.length / 2} pair${pairs.length === 2 ? '' : 's'} matched.` : 'A single character is a palindrome.');
  return steps;
}

export const validPalindromeIIDefinition: AlgorithmDefinition = {
  id: 'valid-palindrome-ii',
  name: 'Valid Palindrome II',
  category: 'STRINGS',
  visual: 'text',
  subtitle: 'Two pointers; at the first mismatch, try deleting either side.',
  description:
    'Valid Palindrome II (LeetCode 680) asks whether a string can become a palindrome by deleting at most one character. Two pointers move inwards from both ends; at the first mismatch, one of the two characters must go, so the rest is a palindrome without s[left] or without s[right] — each checked with the same two-pointer scan.',
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', bestFor: 'Palindrome checks that tolerate one error' },
  defaultInput: [],
  inputSpec,

  code: {
    c: `bool isPalindromeRange(const char *s, int i, int j) {
    while (i < j) {
        if (s[i] != s[j]) {
            return false;
        }
        i++;
        j--;
    }
    return true;
}

bool validPalindrome(const char *s) {
    int left = 0, right = strlen(s) - 1;
    while (left < right) {
        if (s[left] != s[right]) {
            return isPalindromeRange(s, left + 1, right) ||
                   isPalindromeRange(s, left, right - 1);
        }
        left++;
        right--;
    }
    return true;
}`,
    cpp: `bool isPalindromeRange(const string& s, int i, int j) {
    while (i < j) {
        if (s[i] != s[j]) {
            return false;
        }
        i++;
        j--;
    }
    return true;
}

bool validPalindrome(string s) {
    int left = 0, right = (int)s.size() - 1;
    while (left < right) {
        if (s[left] != s[right]) {
            return isPalindromeRange(s, left + 1, right) ||
                   isPalindromeRange(s, left, right - 1);
        }
        left++;
        right--;
    }
    return true;
}`,
    java: `public class ValidPalindromeII {
    public static boolean validPalindrome(String s) {
        int left = 0, right = s.length() - 1;
        while (left < right) {
            if (s.charAt(left) != s.charAt(right)) {
                return isPalindromeRange(s, left + 1, right) ||
                       isPalindromeRange(s, left, right - 1);
            }
            left++;
            right--;
        }
        return true;
    }

    private static boolean isPalindromeRange(String s, int i, int j) {
        while (i < j) {
            if (s.charAt(i) != s.charAt(j)) {
                return false;
            }
            i++;
            j--;
        }
        return true;
    }
}`,
    python: `def valid_palindrome(s):
    left, right = 0, len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return (is_palindrome_range(s, left + 1, right) or
                    is_palindrome_range(s, left, right - 1))
        left += 1
        right -= 1
    return True

def is_palindrome_range(s, i, j):
    while i < j:
        if s[i] != s[j]:
            return False
        i += 1
        j -= 1
    return True`,
  },

  lineMap: {
    c: { 'fn-entry': 12, 'init-pointers': 13, loop: 14, compare: 15, 'try-skip-left': 16, 'try-skip-right': 17, 'move-both': 19, 'return-true': 22, 'range-loop': 2, 'range-compare': 3, 'range-false': 4, 'range-move': 6, 'range-true': 9 },
    cpp: { 'fn-entry': 12, 'init-pointers': 13, loop: 14, compare: 15, 'try-skip-left': 16, 'try-skip-right': 17, 'move-both': 19, 'return-true': 22, 'range-loop': 2, 'range-compare': 3, 'range-false': 4, 'range-move': 6, 'range-true': 9 },
    java: { 'fn-entry': 2, 'init-pointers': 3, loop: 4, compare: 5, 'try-skip-left': 6, 'try-skip-right': 7, 'move-both': 9, 'return-true': 12, 'range-loop': 16, 'range-compare': 17, 'range-false': 18, 'range-move': 20, 'range-true': 23 },
    python: { 'fn-entry': 1, 'init-pointers': 2, loop: 3, compare: 4, 'try-skip-left': 5, 'try-skip-right': 6, 'move-both': 7, 'return-true': 9, 'range-loop': 12, 'range-compare': 13, 'range-false': 14, 'range-move': 15, 'range-true': 17 },
  },
  // both pointers move in two statements on two lines, in the main loop and in the range check
  lineSpans: {
    c: { 'move-both': 2, 'range-move': 2 },
    cpp: { 'move-both': 2, 'range-move': 2 },
    java: { 'move-both': 2, 'range-move': 2 },
    python: { 'move-both': 2, 'range-move': 2 },
  },

  generateSteps,
};
