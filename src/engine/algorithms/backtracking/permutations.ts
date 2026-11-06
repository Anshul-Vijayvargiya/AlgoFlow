import type { AlgorithmDefinition, ExecutionStep, PermutationsCall, PermutationsView } from '../../../types/algorithm';
import { validateAlgorithmInput } from '../../inputParsing';

/**
 * Find All Permutations: every ordering of an array of distinct values, with recursive backtracking. Each call fills the
 * next position of the current permutation:
 *
 *   when it holds all n elements, save a copy and return;
 *   otherwise try each element from left to right, skipping those already used:
 *   mark it used, push it, fill the remaining positions, pop it and mark it unused (backtracking).
 *
 * Trying the elements in input order gives the permutations in lexicographic order of position: [1, 2, 3], [1, 3, 2],
 * [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1].
 *
 * Each of the n! results copies n elements, and each call that is not finished checks all n elements: both grow as
 * n × n!, so it takes O(n × n!) time. The recursion and used[] take O(n) space; the results take O(n × n!).
 *
 * The trace is made by running that recursion; every step keeps a copy of everything so far.
 */

/** 4 elements: 24 permutations, 65 tree nodes and 600 steps. 5 would be 120, 326 and 3,224, too wide to read. */
export const MAX_PERMUTATIONS_LENGTH = 4;

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

function generatePermutationsSteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(permutationsDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const nums = Object.freeze([...input]);
  const n = nums.length;
  const steps: ExecutionStep[] = [];
  const current: number[] = [];
  const used: boolean[] = nums.map(() => false);
  const calls: { -readonly [K in keyof PermutationsCall]: PermutationsCall[K] }[] = [];
  const finished: string[] = [];
  const saved: (readonly number[])[] = [];
  const savedAt: string[] = [];
  let callsMade = 0;
  let usedChecks = 0;
  let elementsCopied = 0;

  type Extra = Partial<Pick<PermutationsView, 'added' | 'removed' | 'skipped' | 'result'>>;
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'permutations'>, index: number | null, extra: Extra = {}) => {
    steps.push({
      id: steps.length,
      state: [],
      ...s,
      permutations: {
        nums,
        index,
        used: Object.freeze([...used]),
        current: Object.freeze([...current]),
        calls: calls.map(c => ({ ...c })),
        node: calls.at(-1)?.node ?? null,
        finished: [...finished],
        permutations: [...saved],
        savedAt: [...savedAt],
        callsMade,
        usedChecks,
        elementsCopied,
        ...extra,
      },
    });
  };

  const enter = (node: string, chosen: number | null) => {
    calls.push({ node, chosen });
    callsMade++;
  };
  const leave = () => {
    finished.push(calls.pop()!.node);
  };

  /** dfs(nums, used, current, result), as the listings write it */
  function dfs(node: string) {
    const frame = calls.at(-1)!;
    const full = current.length === n;
    push(
      {
        type: 'condition',
        codeRef: 'check-full',
        variables: { 'current size': current.length, n, current: list(current) },
        result: full ? 'true' : 'false',
        message: `current holds all n elements?  ${current.length} == ${n} → ${full}`,
        explanation: full
          ? `${list(current)} has all ${n} element${n === 1 ? '' : 's'}: it is a complete permutation.`
          : `Position ${current.length} of ${list(current)} is still open, so try every element that is not used yet.`,
        actionLabel: full ? 'Complete' : `Fill position ${current.length}`,
      },
      null
    );

    if (full) {
      saved.push(Object.freeze([...current]));
      savedAt.push(node);
      elementsCopied += n;
      push(
        {
          type: 'assign',
          codeRef: 'save',
          variables: { saved: list(current), 'permutations so far': saved.length, 'elements copied': elementsCopied },
          message: `save a copy of ${list(current)}`,
          explanation: `A copy is saved, costing ${n} element${n === 1 ? '' : 's'}, because current will keep changing as the search backtracks.`,
          actionLabel: 'Save copy',
        },
        null
      );
      frame.returning = true;
      push(
        {
          type: 'return',
          codeRef: 'return-full',
          variables: { current: list(current) },
          message: `return: ${list(current)} is done`,
          explanation: n === 0 ? 'The empty array has exactly one permutation: the empty one.' : 'Back to the caller, which will undo its last choice and try its next element.',
          actionLabel: 'Return',
        },
        null
      );
      return;
    }

    for (let i = 0; i < n; i++) {
      const value = nums[i];
      usedChecks++;
      const taken = used[i];
      push(
        {
          type: 'condition',
          codeRef: 'check-used',
          variables: { i, 'nums[i]': value, 'used[i]': String(taken), 'used checks': usedChecks },
          result: taken ? 'true' : 'false',
          message: `used[${i}]?  ${taken}: ${value} is ${taken ? 'already in current, skip it' : 'available'}`,
          explanation: taken
            ? `${value} is already in ${list(current)}, and a permutation holds each element once, so it is skipped.`
            : `${value} is not in ${list(current)} yet, so it can fill position ${current.length}.`,
          actionLabel: taken ? `Skip ${value}` : `${value} is free`,
        },
        i,
        taken ? { skipped: value } : {}
      );
      if (taken) continue;

      used[i] = true;
      push(
        {
          type: 'update',
          codeRef: 'mark',
          variables: { i, 'used[i]': 'true' },
          message: `used[${i}] = true`,
          explanation: `Mark ${value} as used, so the deeper calls will skip it.`,
          actionLabel: `Mark ${value}`,
        },
        i
      );

      current.push(value);
      push(
        {
          type: 'update',
          codeRef: 'push',
          variables: { pushed: value, current: list(current) },
          message: `push ${value}: current = ${list(current)}`,
          explanation: `${value} takes position ${current.length - 1}.`,
          actionLabel: `Push ${value}`,
        },
        i,
        { added: value }
      );

      const child = `${node}${i}`;
      enter(child, i);
      push(
        {
          type: 'update',
          codeRef: 'recurse',
          variables: { call: 'dfs', current: list(current), depth: current.length },
          message: `dfs, with current = ${list(current)}`,
          explanation: current.length === n ? 'Every position is filled, so the next call will save this permutation.' : `Fill the remaining ${n - current.length} position${n - current.length === 1 ? '' : 's'}. This call waits, keeping its place in the loop at index ${i}.`,
          actionLabel: 'Go deeper',
        },
        null
      );
      dfs(child);
      leave();

      current.pop();
      push(
        {
          type: 'update',
          codeRef: 'pop',
          variables: { popped: value, current: list(current) },
          message: `pop ${value}: current = ${list(current)}`,
          explanation: `Every permutation starting ${list([...current, value])} is done. Removing ${value} frees position ${current.length} for the next choice.`,
          actionLabel: `Pop ${value}`,
        },
        i,
        { removed: value }
      );

      used[i] = false;
      push(
        {
          type: 'update',
          codeRef: 'unmark',
          variables: { i, 'used[i]': 'false' },
          message: `used[${i}] = false`,
          explanation: `${value} is available again, so other branches can use it. used[] and current are now exactly as they were before choosing ${value}.`,
          actionLabel: `Unmark ${value}`,
        },
        i
      );
    }
  }

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { nums: list(nums), n },
      message: `permutations(${list(nums)}): nothing chosen, nothing used`,
      explanation: `Each position of a permutation can take any element not used yet. ${n} element${n === 1 ? '' : 's'} give ${n}! = ${factorial(n)} permutation${factorial(n) === 1 ? '' : 's'}.`,
      actionLabel: 'Start',
    },
    null
  );
  enter('', null);
  push(
    {
      type: 'update',
      codeRef: 'call-root',
      variables: { call: 'dfs', current: '[]' },
      message: 'dfs, with an empty current permutation',
      explanation: n === 0 ? 'The array has no element, so the empty permutation is already complete.' : 'Start at position 0, trying the elements from left to right.',
      actionLabel: 'dfs',
    },
    null
  );
  dfs('');
  leave();

  const count = saved.length;
  const text = n === 0 ? '1 permutation of []: the empty permutation (0! = 1)' : `${count} permutation${count === 1 ? '' : 's'} of ${list(nums)} (${n}! = ${count})`;
  push(
    {
      type: 'complete',
      codeRef: 'done',
      variables: { permutations: count, calls: callsMade, 'used checks': usedChecks, 'elements copied': elementsCopied },
      message: `return ${count} permutation${count === 1 ? '' : 's'}`,
      explanation: `${callsMade} recursive call${callsMade === 1 ? '' : 's'}, ${usedChecks} used[] check${usedChecks === 1 ? '' : 's'} and ${elementsCopied} element${elementsCopied === 1 ? '' : 's'} copied are separate costs. The checks and the copies both grow as n × n!, which gives the O(n × n!) time. The recursion and used[] take O(n) space; storing the permutations takes O(n × n!).`,
      actionLabel: 'Done',
      outcomeText: text,
    },
    null,
    { result: { text } }
  );
  return steps;
}

export const permutationsDefinition: AlgorithmDefinition = {
  id: 'backtracking-permutations',
  name: 'Find All Permutations',
  category: 'BACKTRACKING',
  visual: 'decision-tree',
  subtitle: 'Every ordering of an array: pick each unused element in turn, backtracking in between.',
  description:
    'Generates every ordering of an array of distinct values. A recursive backtracking search fills one position at a time: it tries the elements from left to right, skips those already used, marks the chosen one as used and pushes it, fills the remaining positions, then pops it and marks it unused again (backtracking). When all n positions are filled, a copy is saved, so n elements give exactly n! permutations. Each result copies n elements, and each unfinished call checks all n elements, so it takes O(n × n!) time. It uses O(n) auxiliary space for the recursion and used[], excluding the results, and O(n × n!) to store the permutations.',
  complexity: {
    best: 'O(n × n!)',
    average: 'O(n × n!)',
    worst: 'O(n × n!)',
    space: 'O(n)',
    bestFor: 'Generating every ordering; O(n) recursion space, plus O(n × n!) to store the permutations',
  },
  defaultInput: [1, 2, 3],
  inputSpec: {
    maxLength: MAX_PERMUTATIONS_LENGTH,
    distinctValues: true,
    randomValues: [1, 9],
  },

  code: {
    c: `#include <stdbool.h>
#include <string.h>

#define MAX_N 4

// used[i] says whether nums[i] is in current; current holds *size elements
void dfs(int nums[], int n, bool used[], int current[], int *size, int result[][MAX_N], int *count) {
    if (*size == n) {
        memcpy(result[*count], current, n * sizeof(int));  // save a copy
        (*count)++;
        return;
    }
    for (int i = 0; i < n; i++) {
        if (used[i]) {
            continue;
        }
        used[i] = true;
        current[(*size)++] = nums[i];  // push
        dfs(nums, n, used, current, size, result, count);
        (*size)--;  // pop
        used[i] = false;
    }
}

// result has room for n! permutations; returns how many there are
int permutations(int nums[], int n, int result[][MAX_N]) {
    bool used[MAX_N] = {false};
    int current[MAX_N];
    int size = 0;
    int count = 0;
    dfs(nums, n, used, current, &size, result, &count);
    return count;
}`,
    cpp: `#include <vector>
using namespace std;

void dfs(const vector<int>& nums, vector<bool>& used, vector<int>& current, vector<vector<int>>& result) {
    if (current.size() == nums.size()) {
        result.push_back(current);  // save a copy
        return;
    }
    for (size_t i = 0; i < nums.size(); i++) {
        if (used[i]) {
            continue;
        }
        used[i] = true;
        current.push_back(nums[i]);  // push
        dfs(nums, used, current, result);
        current.pop_back();  // pop
        used[i] = false;
    }
}

vector<vector<int>> permutations(const vector<int>& nums) {
    vector<vector<int>> result;
    vector<bool> used(nums.size(), false);
    vector<int> current;
    dfs(nums, used, current, result);
    return result;
}`,
    java: `import java.util.ArrayList;
import java.util.List;

public class Permutations {
    static void dfs(int[] nums, boolean[] used, List<Integer> current, List<List<Integer>> result) {
        if (current.size() == nums.length) {
            result.add(new ArrayList<>(current));  // save a copy
            return;
        }
        for (int i = 0; i < nums.length; i++) {
            if (used[i]) {
                continue;
            }
            used[i] = true;
            current.add(nums[i]);  // push
            dfs(nums, used, current, result);
            current.remove(current.size() - 1);  // pop
            used[i] = false;
        }
    }

    public static List<List<Integer>> permutations(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        dfs(nums, new boolean[nums.length], new ArrayList<>(), result);
        return result;
    }
}`,
    python: `def dfs(nums, used, current, result):
    if len(current) == len(nums):
        result.append(current[:])  # save a copy
        return
    for i in range(len(nums)):
        if used[i]:
            continue
        used[i] = True
        current.append(nums[i])  # push
        dfs(nums, used, current, result)
        current.pop()  # pop
        used[i] = False

def permutations(nums):
    result = []
    dfs(nums, [False] * len(nums), [], result)
    return result`,
  },

  lineMap: {
    c: { start: 27, 'call-root': 31, 'check-full': 8, save: 9, 'return-full': 11, 'check-used': 14, mark: 17, push: 18, recurse: 19, pop: 20, unmark: 21, done: 32 },
    cpp: { start: 23, 'call-root': 25, 'check-full': 5, save: 6, 'return-full': 7, 'check-used': 10, mark: 13, push: 14, recurse: 15, pop: 16, unmark: 17, done: 26 },
    java: { start: 23, 'call-root': 24, 'check-full': 6, save: 7, 'return-full': 8, 'check-used': 11, mark: 14, push: 15, recurse: 16, pop: 17, unmark: 18, done: 25 },
    python: { start: 15, 'call-root': 16, 'check-full': 2, save: 3, 'return-full': 4, 'check-used': 6, mark: 8, push: 9, recurse: 10, pop: 11, unmark: 12, done: 17 },
  },

  generateSteps: generatePermutationsSteps,
};
