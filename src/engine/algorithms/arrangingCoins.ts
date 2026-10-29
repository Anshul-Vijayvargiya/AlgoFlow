import type { AlgorithmDefinition, ExecutionStep, NumberCell, NumberSearchProbe, NumberView } from '../../types/algorithm';
import { INT_MAX, exactValue, relationOf, searchView, singleWholeNumber } from './numberSearch';

/**
 * Arranging Coins: row k of a staircase holds k coins, so k complete rows need k × (k + 1) / 2 coins. The answer is
 * the largest k with k × (k + 1) / 2 ≤ n, found by binary search over 0 … n (the count grows with k). The product is
 * computed in 64 bits (long long / long), so it never overflows for n up to INT_MAX.
 */
function generateArrangingCoinsSteps(input: number[]): ExecutionStep[] {
  const n = singleWholeNumber(input, 'Arranging Coins', 'n');
  const steps: ExecutionStep[] = [];
  const probes: NumberSearchProbe[] = [];
  let lo: number | null = null;
  let hi: number | null = null;
  let mid: number | null = null;
  let ans: number | null = null;
  let coins: number | string | null = null;

  type Roles = Record<string, NumberCell['role']>;
  const cells = (roles: Roles = {}): NumberCell[] => [
    { name: 'n', value: n },
    { name: 'lo', value: lo, role: roles.lo },
    { name: 'hi', value: hi, role: roles.hi },
    { name: 'mid', value: mid, role: roles.mid },
    { name: 'coins', value: coins, role: roles.coins },
    { name: 'ans', value: ans, role: roles.ans },
  ];
  const label = 'mid(mid+1)/2';
  const view = (roles: Roles = {}, result?: NumberView['result']): NumberView => ({
    cells: cells(roles),
    ...(lo !== null && hi !== null ? { search: searchView(n, label, lo, hi, probes, mid ?? undefined) } : {}),
    ...(result ? { result } : {}),
  });
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [n], ...s });
  const staircase = (k: number) => BigInt(k) * BigInt(k + 1) / 2n;

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n },
    numbers: view(),
    message: `${n} coins: how many complete staircase rows (row k holds k coins)?`,
    explanation: 'k complete rows use 1 + 2 + … + k = k × (k + 1) / 2 coins. That count grows with k, so the largest k that fits can be found by binary search.',
    actionLabel: 'Initialize',
  });

  lo = 0;
  hi = n;
  ans = 0;
  push({
    type: 'assign',
    codeRef: 'init',
    variables: { lo, hi, ans },
    numbers: view({ lo: 'changed', hi: 'changed', ans: 'changed' }),
    message: `lo = 0, hi = ${n}, ans = 0`,
    explanation: `The answer lies in 0 … ${n} (0 rows always fit). ans keeps the most rows found to fit so far.`,
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
      explanation: inLoop ? `${hi - lo + 1} row count${hi === lo ? '' : 's'} left to try.` : `The range is empty: ${ans} complete row${ans === 1 ? '' : 's'} is the most that fits.`,
      actionLabel: inLoop ? 'Loop TRUE' : 'Loop FALSE',
    });
    if (!inLoop) break;

    mid = lo + Math.floor((hi - lo) / 2);
    coins = null;
    push({
      type: 'assign',
      codeRef: 'calc-mid',
      variables: { lo, hi, mid },
      numbers: view({ mid: 'changed' }),
      message: `mid = lo + (hi - lo) / 2 = ${lo} + (${hi} - ${lo}) / 2 = ${mid}`,
      explanation: 'The middle of the range (written lo + (hi - lo) / 2 so that lo + hi never overflows).',
      actionLabel: 'mid',
    });

    const needed = staircase(mid);
    coins = exactValue(needed);
    probes.push({ mid, value: coins, relation: relationOf(needed, n) });
    push({
      type: 'assign',
      codeRef: 'calc-coins',
      variables: { mid, coins },
      numbers: view({ coins: 'changed', mid: 'current' }),
      message: `coins = mid × (mid + 1) / 2 = ${mid} × ${mid + 1} / 2 = ${coins}`,
      explanation: `${mid} complete row${mid === 1 ? '' : 's'} need${mid === 1 ? 's' : ''} ${coins} coin${coins === 1 ? '' : 's'}.`,
      actionLabel: 'coins',
    });

    const fits = needed <= BigInt(n);
    push({
      type: 'compare',
      codeRef: 'compare',
      variables: { coins, n },
      numbers: view({ coins: 'current' }),
      result: fits ? 'true' : 'false',
      message: `coins <= n?  ${coins} <= ${n} → ${fits}`,
      explanation: fits ? `${mid} rows fit: a candidate. More may fit too.` : `${mid} rows need too many coins, and so does every larger count.`,
      actionLabel: fits ? 'Fits' : 'Too many',
    });

    if (fits) {
      ans = mid;
      push({
        type: 'assign',
        codeRef: 'update-ans',
        variables: { ans },
        numbers: view({ ans: 'changed' }),
        message: `ans = mid = ${mid}`,
        explanation: `${mid} rows is the best so far.`,
        actionLabel: 'ans = mid',
      });
      lo = mid + 1;
      push({
        type: 'assign',
        codeRef: 'move-lo',
        variables: { lo, hi },
        numbers: view({ lo: 'changed' }),
        message: `lo = mid + 1 = ${lo}`,
        explanation: `Try more rows: ${lo} … ${hi}.`,
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
        explanation: `Try fewer rows: ${lo} … ${hi}.`,
        actionLabel: 'hi = mid - 1',
      });
    }
    mid = null;
    coins = null;
  }

  const used = staircase(ans);
  push({
    type: 'complete',
    codeRef: 'return',
    variables: { n, ans },
    numbers: view({ ans: 'current' }, {
      kind: 'answer',
      text: `${n} coins make ${ans} complete row${ans === 1 ? '' : 's'}: ${ans} row${ans === 1 ? '' : 's'} use ${exactValue(used)}; ${ans + 1} would need ${exactValue(staircase(ans + 1))}.`,
    }),
    message: `Return ans = ${ans}`,
    explanation: `${probes.length} probe${probes.length === 1 ? '' : 's'}: O(log n) time, O(1) space. ${exactValue(BigInt(n) - used)} coin${BigInt(n) - used === 1n ? '' : 's'} left over in an incomplete row.`,
    actionLabel: `Return ${ans}`,
  });
  return steps;
}

export const arrangingCoinsDefinition: AlgorithmDefinition = {
  id: 'arranging-coins',
  name: 'Arranging Coins',
  category: 'FUNDAMENTALS',
  visual: 'numbers',
  subtitle: 'Binary search for the most complete staircase rows n coins can fill.',
  description:
    'Row k of a staircase holds k coins, so k complete rows need k × (k + 1) / 2 coins. A binary search over 0 … n keeps the largest k whose staircase fits in n. The product is computed in 64 bits so it never overflows.',
  complexity: { best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)', space: 'O(1)', bestFor: 'Largest k under a growing formula, without solving a quadratic' },
  defaultInput: [8],
  inputSpec: {
    numbers: [{ label: 'n', hint: `A whole number of coins from 0 to ${INT_MAX.toLocaleString('en-US')} (2^31 - 1)`, min: 0, max: INT_MAX, random: [0, 100] }],
  },

  code: {
    c: `int arrangeCoins(int n) {
    long long lo = 0, hi = n, ans = 0;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        long long coins = mid * (mid + 1) / 2;
        if (coins <= n) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return (int)ans;
}`,
    cpp: `int arrangeCoins(int n) {
    long long lo = 0, hi = n, ans = 0;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        long long coins = mid * (mid + 1) / 2;
        if (coins <= n) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return (int)ans;
}`,
    java: `public class ArrangingCoins {
    public static int arrangeCoins(int n) {
        long lo = 0, hi = n, ans = 0;
        while (lo <= hi) {
            long mid = lo + (hi - lo) / 2;
            long coins = mid * (mid + 1) / 2;
            if (coins <= n) {
                ans = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return (int) ans;
    }
}`,
    python: `def arrange_coins(n):
    lo, hi, ans = 0, n, 0
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        coins = mid * (mid + 1) // 2
        if coins <= n:
            ans = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return ans`,
  },

  lineMap: {
    c: { 'fn-entry': 1, init: 2, 'loop-condition': 3, 'calc-mid': 4, 'calc-coins': 5, compare: 6, 'update-ans': 7, 'move-lo': 8, 'move-hi': 10, return: 13 },
    cpp: { 'fn-entry': 1, init: 2, 'loop-condition': 3, 'calc-mid': 4, 'calc-coins': 5, compare: 6, 'update-ans': 7, 'move-lo': 8, 'move-hi': 10, return: 13 },
    java: { 'fn-entry': 2, init: 3, 'loop-condition': 4, 'calc-mid': 5, 'calc-coins': 6, compare: 7, 'update-ans': 8, 'move-lo': 9, 'move-hi': 11, return: 14 },
    python: { 'fn-entry': 1, init: 2, 'loop-condition': 3, 'calc-mid': 4, 'calc-coins': 5, compare: 6, 'update-ans': 7, 'move-lo': 8, 'move-hi': 10, return: 11 },
  },

  generateSteps: generateArrangingCoinsSteps,
};
