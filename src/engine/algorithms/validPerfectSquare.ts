import type { AlgorithmDefinition, ExecutionStep, NumberCell, NumberSearchProbe, NumberView } from '../../types/algorithm';
import { INT_MAX, exactValue, relationOf, searchView, singleWholeNumber } from './numberSearch';

/**
 * Valid Perfect Square: is num = k × k for some whole k? Binary search over 0 … num for k, without any square-root
 * function: mid × mid equal to num → yes; smaller → look higher; larger → look lower; an empty range → no.
 * mid × mid is a 64-bit product (long long / long), so it never overflows for num up to INT_MAX.
 */
function generatePerfectSquareSteps(input: number[]): ExecutionStep[] {
  const num = singleWholeNumber(input, 'Valid Perfect Square', 'num');
  const steps: ExecutionStep[] = [];
  const probes: NumberSearchProbe[] = [];
  let lo: number | null = null;
  let hi: number | null = null;
  let mid: number | null = null;
  let sq: number | string | null = null;

  type Roles = Record<string, NumberCell['role']>;
  const cells = (roles: Roles = {}): NumberCell[] => [
    { name: 'num', value: num },
    { name: 'lo', value: lo, role: roles.lo },
    { name: 'hi', value: hi, role: roles.hi },
    { name: 'mid', value: mid, role: roles.mid },
    { name: 'sq', value: sq, role: roles.sq },
  ];
  const view = (roles: Roles = {}, result?: NumberView['result']): NumberView => ({
    cells: cells(roles),
    ...(lo !== null && hi !== null ? { search: searchView(num, 'mid × mid', lo, hi, probes, mid ?? undefined) } : {}),
    ...(result ? { result } : {}),
  });
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [num], ...s });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { num },
    numbers: view(),
    message: `Is ${num} a perfect square?`,
    explanation: 'A perfect square is k × k for a whole k. Squares grow with k, so k can be found by binary search over 0 … num.',
    actionLabel: 'Initialize',
  });

  lo = 0;
  hi = num;
  push({
    type: 'assign',
    codeRef: 'init',
    variables: { lo, hi },
    numbers: view({ lo: 'changed', hi: 'changed' }),
    message: `lo = 0, hi = ${num}`,
    explanation: `If num is k × k, then k lies in 0 … ${num}.`,
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
      explanation: inLoop ? `${hi - lo + 1} candidate${hi === lo ? '' : 's'} left for k.` : `No whole k is left: ${num} is not a perfect square.`,
      actionLabel: inLoop ? 'Loop TRUE' : 'Loop FALSE',
    });
    if (!inLoop) break;

    mid = lo + Math.floor((hi - lo) / 2);
    sq = null;
    push({
      type: 'assign',
      codeRef: 'calc-mid',
      variables: { lo, hi, mid },
      numbers: view({ mid: 'changed' }),
      message: `mid = lo + (hi - lo) / 2 = ${lo} + (${hi} - ${lo}) / 2 = ${mid}`,
      explanation: 'The middle of the range (written lo + (hi - lo) / 2 so that lo + hi never overflows).',
      actionLabel: 'mid',
    });

    const square = BigInt(mid) * BigInt(mid);
    sq = exactValue(square);
    const relation = relationOf(square, num);
    probes.push({ mid, value: sq, relation });
    push({
      type: 'assign',
      codeRef: 'calc-square',
      variables: { mid, sq },
      numbers: view({ sq: 'changed', mid: 'current' }),
      message: `sq = mid × mid = ${mid} × ${mid} = ${sq}`,
      explanation: `${mid} squared is ${sq}, ${relation === '=' ? 'exactly' : relation === '<' ? 'less than' : 'more than'} ${num}.`,
      actionLabel: 'sq',
    });

    const equal = relation === '=';
    push({
      type: 'compare',
      codeRef: 'check-equal',
      variables: { sq, num },
      numbers: view({ sq: 'current' }),
      result: equal ? 'true' : 'false',
      message: `sq == num?  ${sq} == ${num} → ${equal}`,
      explanation: equal ? `${mid} × ${mid} is exactly ${num}.` : `Not equal, so ${mid} is not the root.`,
      actionLabel: equal ? 'Equal' : 'Not equal',
    });
    if (equal) {
      push({
        type: 'complete',
        codeRef: 'return-true',
        variables: { num, root: mid },
        numbers: view({ mid: 'current' }, { kind: 'yes', text: `${num} is a perfect square: ${mid} × ${mid} = ${num}.` }),
        message: 'Return true',
        explanation: `${probes.length} probe${probes.length === 1 ? '' : 's'}: O(log num) time, O(1) space.`,
        actionLabel: 'Return true',
      });
      return steps;
    }

    const less = relation === '<';
    push({
      type: 'compare',
      codeRef: 'check-less',
      variables: { sq, num },
      numbers: view({ sq: 'current' }),
      result: less ? 'true' : 'false',
      message: `sq < num?  ${sq} < ${num} → ${less}`,
      explanation: less ? `${mid} is too small: the root, if any, is above it.` : `${mid} is too large: the root, if any, is below it.`,
      actionLabel: less ? 'Too small' : 'Too large',
    });
    if (less) {
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
    sq = null;
  }

  // the range is empty: hi is the largest k with k × k < num, lo the smallest with k × k > num
  push({
    type: 'complete',
    codeRef: 'return-false',
    variables: { num },
    numbers: view({}, {
      kind: 'no',
      text: `${num} is not a perfect square: ${hi}² = ${exactValue(BigInt(hi) * BigInt(hi))} < ${num} < ${lo}² = ${exactValue(BigInt(lo) * BigInt(lo))}.`,
    }),
    message: 'Return false',
    explanation: `${probes.length} probe${probes.length === 1 ? '' : 's'}: O(log num) time, O(1) space.`,
    actionLabel: 'Return false',
  });
  return steps;
}

export const validPerfectSquareDefinition: AlgorithmDefinition = {
  id: 'valid-perfect-square',
  name: 'Valid Perfect Square',
  category: 'FUNDAMENTALS',
  visual: 'numbers',
  subtitle: 'Binary search for a whole k with k × k = num.',
  description:
    'A perfect square is k × k for some whole number k. Binary search over 0 … num compares mid × mid with num: equal means yes, smaller means look higher, larger means look lower, and an empty range means no. No square-root function is used, and the product is computed in 64 bits so it never overflows.',
  complexity: { best: 'O(1)', average: 'O(log num)', worst: 'O(log num)', space: 'O(1)', bestFor: 'Exact perfect-square checks without floating point' },
  defaultInput: [16],
  inputSpec: {
    numbers: [{ label: 'num', hint: `A whole number from 0 to ${INT_MAX.toLocaleString('en-US')} (2^31 - 1)`, min: 0, max: INT_MAX, random: [1, 400] }],
  },

  code: {
    c: `#include <stdbool.h>

bool isPerfectSquare(int num) {
    long long lo = 0, hi = num;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        long long sq = mid * mid;
        if (sq == num)
            return true;
        if (sq < num)
            lo = mid + 1;
        else
            hi = mid - 1;
    }
    return false;
}`,
    cpp: `bool isPerfectSquare(int num) {
    long long lo = 0, hi = num;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        long long sq = mid * mid;
        if (sq == num)
            return true;
        if (sq < num)
            lo = mid + 1;
        else
            hi = mid - 1;
    }
    return false;
}`,
    java: `public class PerfectSquare {
    public static boolean isPerfectSquare(int num) {
        long lo = 0, hi = num;
        while (lo <= hi) {
            long mid = lo + (hi - lo) / 2;
            long sq = mid * mid;
            if (sq == num)
                return true;
            if (sq < num)
                lo = mid + 1;
            else
                hi = mid - 1;
        }
        return false;
    }
}`,
    python: `def is_perfect_square(num):
    lo, hi = 0, num
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        sq = mid * mid
        if sq == num:
            return True
        if sq < num:
            lo = mid + 1
        else:
            hi = mid - 1
    return False`,
  },

  lineMap: {
    c: { 'fn-entry': 3, init: 4, 'loop-condition': 5, 'calc-mid': 6, 'calc-square': 7, 'check-equal': 8, 'return-true': 9, 'check-less': 10, 'move-lo': 11, 'move-hi': 13, 'return-false': 15 },
    cpp: { 'fn-entry': 1, init: 2, 'loop-condition': 3, 'calc-mid': 4, 'calc-square': 5, 'check-equal': 6, 'return-true': 7, 'check-less': 8, 'move-lo': 9, 'move-hi': 11, 'return-false': 13 },
    java: { 'fn-entry': 2, init: 3, 'loop-condition': 4, 'calc-mid': 5, 'calc-square': 6, 'check-equal': 7, 'return-true': 8, 'check-less': 9, 'move-lo': 10, 'move-hi': 12, 'return-false': 14 },
    python: { 'fn-entry': 1, init: 2, 'loop-condition': 3, 'calc-mid': 4, 'calc-square': 5, 'check-equal': 6, 'return-true': 7, 'check-less': 8, 'move-lo': 9, 'move-hi': 11, 'return-false': 12 },
  },

  generateSteps: generatePerfectSquareSteps,
};
