import type { AlgorithmDefinition, ExecutionStep, NumberCell, NumberSearchProbe, NumberView } from '../../types/algorithm';
import { INT_MAX, exactValue, relationOf, searchView, singleWholeNumber } from './numberSearch';

/**
 * Sqrt(x): the integer square root floor(√x), by binary search over 0 … x without any square-root function. A mid
 * with mid × mid ≤ x is a candidate (ans = mid; look higher); otherwise look lower. The last candidate is the answer.
 * mid × mid is a 64-bit product (long long / long), so it never overflows for x up to INT_MAX.
 */
function generateSqrtSteps(input: number[]): ExecutionStep[] {
  const x = singleWholeNumber(input, 'Sqrt(x)', 'x');
  const steps: ExecutionStep[] = [];
  const probes: NumberSearchProbe[] = [];
  let lo: number | null = null;
  let hi: number | null = null;
  let mid: number | null = null;
  let ans: number | null = null;
  let product: number | string | null = null;

  type Roles = Record<string, NumberCell['role']>;
  const cells = (roles: Roles = {}): NumberCell[] => [
    { name: 'x', value: x },
    { name: 'lo', value: lo, role: roles.lo },
    { name: 'hi', value: hi, role: roles.hi },
    { name: 'mid', value: mid, role: roles.mid },
    { name: 'mid × mid', value: product, role: roles.product },
    { name: 'ans', value: ans, role: roles.ans },
  ];
  const view = (roles: Roles = {}, result?: NumberView['result']): NumberView => ({
    cells: cells(roles),
    ...(lo !== null && hi !== null ? { search: searchView(x, 'mid × mid', lo, hi, probes, mid ?? undefined) } : {}),
    ...(result ? { result } : {}),
  });
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [x], ...s });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { x },
    numbers: view(),
    message: `Sqrt(${x}): the largest whole number whose square is at most ${x}`,
    explanation: 'Squares grow with the number, so the answer can be found by binary search over 0 … x, without any square-root function.',
    actionLabel: 'Initialize',
  });

  lo = 0;
  hi = x;
  ans = 0;
  push({
    type: 'assign',
    codeRef: 'init',
    variables: { lo, hi, ans },
    numbers: view({ lo: 'changed', hi: 'changed', ans: 'changed' }),
    message: `lo = 0, hi = ${x}, ans = 0`,
    explanation: `The answer lies in 0 … ${x}. ans keeps the best candidate found so far (0 always qualifies: 0 × 0 ≤ x).`,
    actionLabel: 'Init',
  });

  for (;;) {
    const inLoop = lo <= hi;
    push({
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { lo, hi },
      numbers: view({ lo: 'current', hi: 'current' }),
      result: inLoop ? 'true' : 'false',
      message: `lo <= hi?  ${lo} <= ${hi} → ${inLoop}`,
      explanation: inLoop ? `${hi - lo + 1} number${hi === lo ? '' : 's'} left to search.` : `The range is empty: ans = ${ans} is the largest whole number whose square is at most ${x}.`,
      actionLabel: inLoop ? 'Loop TRUE' : 'Loop FALSE',
    });
    if (!inLoop) break;

    mid = lo + Math.floor((hi - lo) / 2);
    product = null;
    push({
      type: 'assign',
      codeRef: 'calc-mid',
      variables: { lo, hi, mid },
      numbers: view({ mid: 'changed' }),
      message: `mid = lo + (hi - lo) / 2 = ${lo} + (${hi} - ${lo}) / 2 = ${mid}`,
      explanation: 'The middle of the range (written lo + (hi - lo) / 2 so that lo + hi never overflows).',
      actionLabel: 'mid',
    });

    const sq = BigInt(mid) * BigInt(mid);
    product = exactValue(sq);
    const fits = sq <= BigInt(x);
    probes.push({ mid, value: product, relation: relationOf(sq, x) });
    push({
      type: 'compare',
      codeRef: 'compare',
      variables: { mid, 'mid × mid': product, x },
      numbers: view({ product: 'changed', mid: 'current' }),
      result: fits ? 'true' : 'false',
      message: `mid × mid <= x?  ${mid} × ${mid} = ${product} <= ${x} → ${fits}`,
      explanation: fits
        ? `${mid} is small enough: a candidate. A larger one may fit too.`
        : `${mid} is too large, and so is everything above it.`,
      actionLabel: fits ? 'Fits' : 'Too large',
    });

    if (fits) {
      ans = mid;
      push({
        type: 'assign',
        codeRef: 'update-ans',
        variables: { ans },
        numbers: view({ ans: 'changed' }),
        message: `ans = mid = ${mid}`,
        explanation: `${mid} is the best candidate so far.`,
        actionLabel: 'ans = mid',
      });
      lo = mid + 1;
      push({
        type: 'assign',
        codeRef: 'move-lo',
        variables: { lo, hi },
        numbers: view({ lo: 'changed' }),
        message: `lo = mid + 1 = ${lo}`,
        explanation: `Search above ${mid}: ${lo} … ${hi}.`,
        actionLabel: 'lo = mid + 1',
      });
    } else {
      hi = mid - 1;
      push({
        type: 'assign',
        codeRef: 'move-hi',
        variables: { lo, hi },
        numbers: view({ hi: 'changed' }),
        message: `hi = mid - 1 = ${hi}`,
        explanation: `Search below ${mid}: ${lo} … ${hi}.`,
        actionLabel: 'hi = mid - 1',
      });
    }
    mid = null;
    product = null;
  }

  const next = BigInt(ans + 1) * BigInt(ans + 1);
  push({
    type: 'complete',
    codeRef: 'return',
    variables: { x, ans },
    numbers: view({ ans: 'current' }, {
      kind: 'answer',
      text: `Sqrt(${x}) = ${ans}: ${ans}² = ${exactValue(BigInt(ans) * BigInt(ans))} ≤ ${x} < ${ans + 1}² = ${exactValue(next)}.`,
    }),
    message: `Return ans = ${ans}`,
    explanation: `${probes.length} probe${probes.length === 1 ? '' : 's'} for a range of ${x + 1} number${x === 0 ? '' : 's'}: O(log x) time, O(1) space.`,
    actionLabel: `Return ${ans}`,
  });
  return steps;
}

export const sqrtXDefinition: AlgorithmDefinition = {
  id: 'sqrt-x',
  name: 'Sqrt(x)',
  category: 'FUNDAMENTALS',
  visual: 'numbers',
  subtitle: 'Binary search for the largest whole number whose square is at most x.',
  description:
    'Sqrt(x) returns floor(√x), the largest whole number whose square is at most x, without a square-root function. Squares grow with the number, so a binary search over 0 … x keeps the last mid with mid × mid ≤ x. The product is computed in 64 bits so it never overflows.',
  complexity: { best: 'O(log x)', average: 'O(log x)', worst: 'O(log x)', space: 'O(1)', bestFor: 'Integer square roots without floating point' },
  defaultInput: [8],
  inputSpec: {
    numbers: [{ label: 'x', hint: `A whole number from 0 to ${INT_MAX.toLocaleString('en-US')} (2^31 - 1)`, min: 0, max: INT_MAX, random: [0, 1000] }],
  },

  code: {
    c: `int mySqrt(int x) {
    long long lo = 0, hi = x, ans = 0;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        if (mid * mid <= x) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return (int)ans;
}`,
    cpp: `int mySqrt(int x) {
    long long lo = 0, hi = x, ans = 0;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        if (mid * mid <= x) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return (int)ans;
}`,
    java: `public class Sqrt {
    public static int mySqrt(int x) {
        long lo = 0, hi = x, ans = 0;
        while (lo <= hi) {
            long mid = lo + (hi - lo) / 2;
            if (mid * mid <= x) {
                ans = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return (int) ans;
    }
}`,
    python: `def my_sqrt(x):
    lo, hi, ans = 0, x, 0
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if mid * mid <= x:
            ans = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return ans`,
  },

  lineMap: {
    c: { 'fn-entry': 1, init: 2, 'loop-condition': 3, 'calc-mid': 4, compare: 5, 'update-ans': 6, 'move-lo': 7, 'move-hi': 9, return: 12 },
    cpp: { 'fn-entry': 1, init: 2, 'loop-condition': 3, 'calc-mid': 4, compare: 5, 'update-ans': 6, 'move-lo': 7, 'move-hi': 9, return: 12 },
    java: { 'fn-entry': 2, init: 3, 'loop-condition': 4, 'calc-mid': 5, compare: 6, 'update-ans': 7, 'move-lo': 8, 'move-hi': 10, return: 13 },
    python: { 'fn-entry': 1, init: 2, 'loop-condition': 3, 'calc-mid': 4, compare: 5, 'update-ans': 6, 'move-lo': 7, 'move-hi': 9, return: 10 },
  },

  generateSteps: generateSqrtSteps,
};
