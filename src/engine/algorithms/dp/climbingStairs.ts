import type { AlgorithmDefinition, ExecutionStep, StairsStage, StairsView } from '../../../types/algorithm';
import { validateAlgorithmInput } from '../../inputParsing';

/**
 * Climbing Stairs (LeetCode 70) with bottom-up dynamic programming in O(1) space:
 *
 *   if (n <= 2) return n;
 *   prev2 = 1; prev1 = 2;
 *   for i = 3 .. n:
 *     current = prev1 + prev2;
 *     prev2 = prev1;
 *     prev1 = current;
 *   return prev1;
 *
 * The code keeps only two variables. The history list the visualizer shows (ways(1) = 1, ways(2) = 2, …) is DISPLAY
 * ONLY: it is built by the trace from each step, never by the listings. prev2 is ways(i - 2), prev1 is ways(i - 1), and
 * current is ways(i).
 *
 * Each pass of the loop is O(1) work, with O(1) space for the two variables: O(n) time in total.
 */

export const MIN_N = 1;
export const MAX_N = 10;

function generateClimbingStairsSteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(climbingStairsDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const n = input[0];
  const steps: ExecutionStep[] = [];
  /** ways(step) for every value established so far: the display-only history, never stored by the code */
  const history: { step: number; ways: number }[] = [];
  let prev2: number | null = null;
  let prev1: number | null = null;
  let current: number | null = null;
  /** which ways(step) prev2 and prev1 hold */
  let prev2Of: number | null = null;
  let prev1Of: number | null = null;
  let i: number | null = null;
  let stage: StairsStage = 'start';

  type Extra = Partial<Pick<StairsView, 'highlight' | 'addition' | 'result'>>;
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'stairs'>, extra: Extra = {}) => {
    steps.push({
      id: steps.length,
      state: [],
      ...s,
      stairs: { n, prev2, prev1, current, prev2Of, prev1Of, i, stage, history: Object.freeze(history.map(h => Object.freeze({ ...h }))), ...extra },
    });
  };

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n },
    message: `climbStairs(${n}): count the distinct ways to reach step ${n}`,
    explanation:
      n === 1
        ? 'There is one step: one way (one 1-step).'
        : n === 2
          ? 'There are two steps: two ways (1 + 1, or 2).'
          : `From any step i, you came either from step i - 1 (one 1-step) or from step i - 2 (one 2-step), so ways(i) = ways(i - 1) + ways(i - 2).`,
    actionLabel: 'climbStairs(n)',
  });

  const smallReturn = n <= 2;
  push({
    type: 'condition',
    codeRef: 'base-check',
    variables: { n },
    result: smallReturn ? 'true' : 'false',
    message: `n=${n} <= 2 → ${smallReturn ? 'TRUE — return n' : 'FALSE — fall through to the loop'}`,
    explanation: smallReturn
      ? `For n = 1 and n = 2 the answer is n itself, so no loop is needed.`
      : 'More than two steps: initialise the two rolling variables and go through the loop.',
    actionLabel: smallReturn ? 'Base case' : 'Not a base case',
  });

  if (smallReturn) {
    const value = n;
    history.push({ step: n, ways: n });
    const text = `Climbing a ${n}-step staircase has ${value} distinct way${value === 1 ? '' : 's'}.`;
    stage = 'done';
    push(
      {
        type: 'complete',
        codeRef: 'base-return',
        variables: { n, result: value },
        message: `return ${value}`,
        explanation: `The answer for n = ${n} is n itself: O(1) time and space.`,
        actionLabel: `Return ${value}`,
        outcomeText: text,
      },
      { highlight: 'base', result: { value, text } }
    );
    return steps;
  }

  stage = 'base';
  prev2 = 1;
  prev2Of = 1;
  history.push({ step: 1, ways: 1 });
  push(
    {
      type: 'assign',
      codeRef: 'set-prev2',
      variables: { prev2 },
      message: 'prev2 = 1 — ways(1)',
      explanation: 'One step, one way: this is ways(1).',
      actionLabel: 'prev2 = 1',
    },
    { highlight: 'prev2' }
  );
  prev1 = 2;
  prev1Of = 2;
  history.push({ step: 2, ways: 2 });
  push(
    {
      type: 'assign',
      codeRef: 'set-prev1',
      variables: { prev1 },
      message: 'prev1 = 2 — ways(2)',
      explanation: 'Two steps, two ways (1 + 1, or 2): this is ways(2).',
      actionLabel: 'prev1 = 2',
    },
    { highlight: 'prev1' }
  );

  stage = 'loop';
  for (let k = 3; ; k++) {
    i = k;
    const go = k <= n;
    push(
      {
        type: 'loop-condition',
        codeRef: 'loop-condition',
        variables: { i: k, n },
        result: go ? 'true' : 'false',
        message: `i=${k} <= n=${n} → ${go ? 'true' : 'false'}${go ? '' : ' — loop ends'}`,
        explanation: go
          ? `Compute ways(${k}) from ways(${k - 1}) = ${prev1} and ways(${k - 2}) = ${prev2}.`
          : `Every ways(3) … ways(${n}) is computed. prev1 holds ways(${n}) = ${prev1}, the answer.`,
        actionLabel: go ? `i = ${k}` : 'Loop done',
      },
      { highlight: go ? 'loop' : 'result' }
    );
    if (!go) break;

    current = prev1! + prev2!;
    history.push({ step: k, ways: current });
    push(
      {
        type: 'assign',
        codeRef: 'compute-current',
        variables: { i: k, prev1, prev2, current },
        message: `current = prev1 + prev2 = ${prev1} + ${prev2} = ${current}`,
        explanation: `ways(${k}) = ways(${k - 1}) + ways(${k - 2}) = ${prev1} + ${prev2} = ${current}.`,
        actionLabel: `ways(${k}) = ${current}`,
      },
      { highlight: 'current', addition: { prev1: prev1!, prev2: prev2!, current } }
    );

    prev2 = prev1;
    prev2Of = k - 1;
    push(
      {
        type: 'assign',
        codeRef: 'shift-prev2',
        variables: { i: k, prev2 },
        message: `prev2 = prev1 = ${prev2}`,
        explanation: `prev2 now holds ways(${k - 1}): the next pass will treat it as ways(i - 2).`,
        actionLabel: 'prev2 = prev1',
      },
      { highlight: 'prev2' }
    );
    prev1 = current;
    prev1Of = k;
    push(
      {
        type: 'assign',
        codeRef: 'shift-prev1',
        variables: { i: k, prev1 },
        message: `prev1 = current = ${prev1}`,
        explanation: `prev1 now holds ways(${k}): the next pass will treat it as ways(i - 1). current is forgotten.`,
        actionLabel: 'prev1 = current',
      },
      { highlight: 'prev1' }
    );
    current = null;

    i = k + 1;
    push({
      type: 'increment',
      codeRef: 'loop-condition',
      variables: { i: k + 1, n },
      message: `i++ → i=${k + 1}`,
      explanation: 'Move to the next step.',
      actionLabel: 'i++',
    });
  }

  i = null;
  stage = 'done';
  const value = prev1!;
  const text = `Climbing a ${n}-step staircase has ${value} distinct way${value === 1 ? '' : 's'}.`;
  push(
    {
      type: 'complete',
      codeRef: 'loop-return',
      variables: { n, result: value },
      message: `return prev1 = ${value}`,
      explanation: `prev1 is ways(${n}). ${n - 2} pass${n - 2 === 1 ? '' : 'es'} of O(1) work: O(n) time, and O(1) space for the two variables.`,
      actionLabel: `Return ${value}`,
      outcomeText: text,
    },
    { highlight: 'result', result: { value, text } }
  );
  return steps;
}

export const climbingStairsDefinition: AlgorithmDefinition = {
  id: 'dp-climbing-stairs',
  name: 'Climbing Stairs',
  category: 'DP',
  visual: 'stairs',
  subtitle: 'Count the ways to the top: ways(i) = ways(i − 1) + ways(i − 2), kept in two rolling variables.',
  description:
    'Counts the distinct ways to climb n steps of a staircase, taking 1 or 2 steps at a time (LeetCode 70). From step i you came either from step i - 1 (one 1-step) or from step i - 2 (one 2-step), so ways(i) = ways(i - 1) + ways(i - 2), with ways(1) = 1 and ways(2) = 2. Bottom-up DP in O(1) space keeps only two rolling variables: prev2 holds ways(i - 2) and prev1 holds ways(i - 1). Each pass of the loop computes current = prev1 + prev2, shifts prev2 = prev1 and prev1 = current, and moves on. O(n) time, O(1) space (no array is stored). n = 1 and n = 2 return n directly.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'Bottom-up DP when each answer depends on only the two before it: no array needed',
  },
  defaultInput: [5],
  inputSpec: {
    numbers: [{ label: 'n', hint: `The number of steps: ${MIN_N} to ${MAX_N}`, min: MIN_N, max: MAX_N, random: [3, 8] }],
  },

  code: {
    c: `int climbStairs(int n) {
    if (n <= 2) return n;
    int prev2 = 1;
    int prev1 = 2;
    for (int i = 3; i <= n; i++) {
        int current = prev1 + prev2;
        prev2 = prev1;
        prev1 = current;
    }
    return prev1;
}`,
    cpp: `int climbStairs(int n) {
    if (n <= 2) return n;
    int prev2 = 1;
    int prev1 = 2;
    for (int i = 3; i <= n; i++) {
        int current = prev1 + prev2;
        prev2 = prev1;
        prev1 = current;
    }
    return prev1;
}`,
    java: `public class ClimbingStairs {
    public static int climbStairs(int n) {
        if (n <= 2) return n;
        int prev2 = 1;
        int prev1 = 2;
        for (int i = 3; i <= n; i++) {
            int current = prev1 + prev2;
            prev2 = prev1;
            prev1 = current;
        }
        return prev1;
    }
}`,
    python: `def climb_stairs(n):
    if n <= 2:
        return n
    prev2 = 1
    prev1 = 2
    for i in range(3, n + 1):
        current = prev1 + prev2
        prev2 = prev1
        prev1 = current
    return prev1`,
  },

  // C and C++ are line for line the same; Java wraps the function in a class (one line down); Python puts the base
  // case's return on its own line
  lineMap: {
    c: { 'fn-entry': 1, 'base-check': 2, 'base-return': 2, 'set-prev2': 3, 'set-prev1': 4, 'loop-condition': 5, 'compute-current': 6, 'shift-prev2': 7, 'shift-prev1': 8, 'loop-return': 10 },
    cpp: { 'fn-entry': 1, 'base-check': 2, 'base-return': 2, 'set-prev2': 3, 'set-prev1': 4, 'loop-condition': 5, 'compute-current': 6, 'shift-prev2': 7, 'shift-prev1': 8, 'loop-return': 10 },
    java: { 'fn-entry': 2, 'base-check': 3, 'base-return': 3, 'set-prev2': 4, 'set-prev1': 5, 'loop-condition': 6, 'compute-current': 7, 'shift-prev2': 8, 'shift-prev1': 9, 'loop-return': 11 },
    python: { 'fn-entry': 1, 'base-check': 2, 'base-return': 3, 'set-prev2': 4, 'set-prev1': 5, 'loop-condition': 6, 'compute-current': 7, 'shift-prev2': 8, 'shift-prev1': 9, 'loop-return': 10 },
  },

  generateSteps: generateClimbingStairsSteps,
};
