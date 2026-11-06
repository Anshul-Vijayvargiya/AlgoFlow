import type { AlgorithmDefinition, ExecutionStep, SubsetsCall, SubsetsView } from '../../../types/algorithm';
import { validateAlgorithmInput } from '../../inputParsing';

/**
 * Subsets (the power set): every subset of an array of distinct values, with recursive backtracking. Each call decides
 * on one element:
 *
 *   save the empty subset first;
 *   dfs(i): when every element has been decided (i == n), return;
 *   include nums[i], save a copy of the current subset, and decide on the rest;
 *   remove nums[i] (backtracking), and decide on the rest without it.
 *
 * Each subset is saved exactly once, at the moment its last element is included, so the subsets come out in
 * lexicographic order of position: [], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]. Saving only when i == n would
 * visit the same tree but give another order.
 *
 * There are 2^(n+1) - 1 calls, each doing constant work apart from the copy, and the copies move n × 2^(n-1) elements:
 * O(n × 2^n) time, O(n) space for the recursion and the current subset, and O(n × 2^n) for the subsets themselves.
 *
 * The trace is made by running that recursion; every step keeps a copy of everything so far.
 */

/** 5 elements: 32 subsets and a decision tree of 63 nodes. One more would be too wide to read. */
export const MAX_SUBSETS_LENGTH = 5;

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

function generateSubsetsSteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(subsetsDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const nums = Object.freeze([...input]);
  const n = nums.length;
  const steps: ExecutionStep[] = [];
  const current: number[] = [];
  const calls: { -readonly [K in keyof SubsetsCall]: SubsetsCall[K] }[] = [];
  const finished: string[] = [];
  const saved: (readonly number[])[] = [];
  const savedAt: string[] = [];
  let callsMade = 0;
  let elementsCopied = 0;

  type Extra = Partial<Pick<SubsetsView, 'added' | 'removed' | 'result'>>;
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'subsets'>, index: number | null, extra: Extra = {}) => {
    steps.push({
      id: steps.length,
      state: [],
      ...s,
      subsets: {
        nums,
        index,
        current: Object.freeze([...current]),
        calls: calls.map(c => ({ ...c })),
        node: calls.at(-1)?.node ?? null,
        finished: [...finished],
        subsets: [...saved],
        savedAt: [...savedAt],
        callsMade,
        elementsCopied,
        ...extra,
      },
    });
  };

  const enter = (i: number, node: string, via: SubsetsCall['via']) => {
    calls.push({ i, node, via });
    callsMade++;
  };
  const leave = () => {
    finished.push(calls.pop()!.node);
  };

  /** dfs(nums, i, current, result), as the listings write it */
  function dfs(i: number, node: string) {
    const frame = calls.at(-1)!;
    const end = i === n;
    push(
      {
        type: 'condition',
        codeRef: 'check-end',
        variables: { i, n, current: list(current) },
        result: end ? 'true' : 'false',
        message: `dfs(${i}): i == n?  ${i} == ${n} → ${end}`,
        explanation: end
          ? `Every element has been decided, so this branch is finished. ${list(current)} was already saved when its last element was included, so there is nothing to save here.`
          : `Element ${nums[i]}, at index ${i}, has not been decided yet. Every subset either has it or does not, so this call tries both.`,
        actionLabel: end ? 'All decided' : `Decide on ${nums[i]}`,
      },
      end ? null : i
    );
    if (end) {
      frame.returning = true;
      push(
        {
          type: 'return',
          codeRef: 'return-end',
          variables: { i, current: list(current) },
          message: `return: dfs(${i}) ends`,
          explanation: 'Back to the caller, which will undo its last decision.',
          actionLabel: 'Return',
        },
        null
      );
      return;
    }

    const value = nums[i];
    current.push(value);
    push(
      {
        type: 'update',
        codeRef: 'include',
        variables: { i, 'nums[i]': value, current: list(current) },
        message: `include ${value}: current = ${list(current)}`,
        explanation: `First the branch with ${value}: it goes on the end of the current subset.`,
        actionLabel: `Include ${value}`,
      },
      i,
      { added: value }
    );

    saved.push(Object.freeze([...current]));
    savedAt.push(`${node}I`);
    elementsCopied += current.length;
    push(
      {
        type: 'assign',
        codeRef: 'save',
        variables: { saved: list(current), 'subsets so far': saved.length, 'elements copied': elementsCopied },
        message: `save a copy of ${list(current)}`,
        explanation: `${list(current)} is a new subset: it ends with ${value}, which has only just been included. A copy is saved, costing ${current.length} element${current.length === 1 ? '' : 's'}, because current will keep changing.`,
        actionLabel: 'Save copy',
      },
      i
    );

    enter(i + 1, `${node}I`, 'include');
    push(
      {
        type: 'update',
        codeRef: 'recurse-include',
        variables: { call: `dfs(${i + 1})`, current: list(current) },
        message: `dfs(${i + 1}), with ${value} in current`,
        explanation: i + 1 === n ? `No element is left to decide on with ${value} included.` : `Decide on the rest with ${value} included. This call waits until that is done.`,
        actionLabel: 'Go: included',
      },
      i + 1 === n ? null : i + 1
    );
    dfs(i + 1, `${node}I`);
    leave();

    current.pop();
    push(
      {
        type: 'update',
        codeRef: 'pop',
        variables: { removed: value, current: list(current) },
        message: `backtrack: remove ${value}, current = ${list(current)}`,
        explanation: `Every subset with ${value} on top of ${list(current)} is done. Removing ${value} puts current back exactly as it was before including it, so the next branch starts clean.`,
        actionLabel: `Remove ${value}`,
      },
      i,
      { removed: value }
    );

    enter(i + 1, `${node}E`, 'exclude');
    push(
      {
        type: 'update',
        codeRef: 'recurse-exclude',
        variables: { call: `dfs(${i + 1})`, current: list(current) },
        message: `exclude ${value}: dfs(${i + 1}), current stays ${list(current)}`,
        explanation: `Now the branch without ${value}. Nothing is saved: current is the same subset as before, which already has its copy.`,
        actionLabel: `Skip ${value}`,
      },
      i + 1 === n ? null : i + 1
    );
    dfs(i + 1, `${node}E`);
    leave();
  }

  saved.push(Object.freeze([]));
  savedAt.push('');
  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { nums: list(nums), n },
      message: `subsets(${list(nums)}): save the empty subset`,
      explanation: `Every array has the empty subset, so it is saved first. Then each element is decided in turn: included or skipped. ${n} element${n === 1 ? '' : 's'} give 2^${n} = ${2 ** n} subset${n === 0 ? '' : 's'}.`,
      actionLabel: 'Start',
    },
    null
  );
  enter(0, '', 'root');
  push(
    {
      type: 'update',
      codeRef: 'call-root',
      variables: { call: 'dfs(0)', current: '[]' },
      message: 'dfs(0), with an empty current subset',
      explanation: n === 0 ? 'The array has no element to decide on.' : `Start with the first element, ${nums[0]}.`,
      actionLabel: 'dfs(0)',
    },
    n === 0 ? null : 0
  );
  dfs(0, '');
  leave();

  const count = saved.length;
  const text = n === 0 ? '1 subset of []: only the empty subset (2^0 = 1)' : `${count} subsets of ${list(nums)} (2^${n} = ${count})`;
  push(
    {
      type: 'complete',
      codeRef: 'done',
      variables: { subsets: count, calls: callsMade, 'elements copied': elementsCopied },
      message: `return ${count} subset${count === 1 ? '' : 's'}`,
      explanation: `${callsMade} recursive calls did constant work each, and copying the subsets moved ${elementsCopied} element${elementsCopied === 1 ? '' : 's'}. These are separate costs: the calls grow as 2^n, while each copy can take up to n elements, which gives the O(n × 2^n) time. The recursion uses O(n) space; storing the subsets takes O(n × 2^n).`,
      actionLabel: 'Done',
      outcomeText: text,
    },
    null,
    { result: { text } }
  );
  return steps;
}

export const subsetsDefinition: AlgorithmDefinition = {
  id: 'backtracking-subsets',
  name: 'Subsets (Power Set)',
  category: 'BACKTRACKING',
  visual: 'decision-tree',
  subtitle: 'Every subset of an array: include or skip each element, backtracking in between.',
  description:
    'Generates every subset of an array of distinct values, also called its power set: the empty subset, each element alone, every combination and the whole array. A recursive backtracking search decides on one element at a time: include it, save a copy of the current subset and decide on the rest, then remove it again (backtracking) and decide on the rest without it. Each subset is saved once, when its last element is included, so n elements give exactly 2^n subsets. It makes 2^(n+1) - 1 recursive calls, and copying the subsets moves n × 2^(n-1) elements, so it takes O(n × 2^n) time. It uses O(n) auxiliary space for the recursion, excluding the results, and O(n × 2^n) to store the subsets.',
  complexity: {
    best: 'O(n × 2^n)',
    average: 'O(n × 2^n)',
    worst: 'O(n × 2^n)',
    space: 'O(n)',
    bestFor: 'Generating every combination; O(n) recursion space, plus O(n × 2^n) to store the subsets',
  },
  defaultInput: [1, 2, 3],
  inputSpec: {
    maxLength: MAX_SUBSETS_LENGTH,
    distinctValues: true,
    randomValues: [1, 9],
  },

  code: {
    c: `#include <string.h>

#define MAX_N 5

// current holds *size chosen elements; result[k] holds sizes[k] elements
void dfs(int nums[], int n, int i, int current[], int *size, int result[][MAX_N], int sizes[], int *count) {
    if (i == n) {
        return;
    }
    current[(*size)++] = nums[i];  // include nums[i]
    memcpy(result[*count], current, *size * sizeof(int));  // save a copy
    sizes[(*count)++] = *size;
    dfs(nums, n, i + 1, current, size, result, sizes, count);
    (*size)--;  // backtrack: remove nums[i]
    dfs(nums, n, i + 1, current, size, result, sizes, count);  // exclude nums[i]
}

// result has room for 2^n subsets; returns how many there are
int subsets(int nums[], int n, int result[][MAX_N], int sizes[]) {
    int current[MAX_N];
    int size = 0;
    int count = 0;
    sizes[count++] = 0;  // the empty subset
    dfs(nums, n, 0, current, &size, result, sizes, &count);
    return count;
}`,
    cpp: `#include <vector>
using namespace std;

void dfs(const vector<int>& nums, int i, vector<int>& current, vector<vector<int>>& result) {
    if (i == (int)nums.size()) {
        return;
    }
    current.push_back(nums[i]);  // include nums[i]
    result.push_back(current);  // save a copy
    dfs(nums, i + 1, current, result);
    current.pop_back();  // backtrack: remove nums[i]
    dfs(nums, i + 1, current, result);  // exclude nums[i]
}

vector<vector<int>> subsets(const vector<int>& nums) {
    vector<vector<int>> result;
    result.push_back({});  // the empty subset
    vector<int> current;
    dfs(nums, 0, current, result);
    return result;
}`,
    java: `import java.util.ArrayList;
import java.util.List;

public class Subsets {
    static void dfs(int[] nums, int i, List<Integer> current, List<List<Integer>> result) {
        if (i == nums.length) {
            return;
        }
        current.add(nums[i]);  // include nums[i]
        result.add(new ArrayList<>(current));  // save a copy
        dfs(nums, i + 1, current, result);
        current.remove(current.size() - 1);  // backtrack: remove nums[i]
        dfs(nums, i + 1, current, result);  // exclude nums[i]
    }

    public static List<List<Integer>> subsets(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        result.add(new ArrayList<>());  // the empty subset
        dfs(nums, 0, new ArrayList<>(), result);
        return result;
    }
}`,
    python: `def dfs(nums, i, current, result):
    if i == len(nums):
        return
    current.append(nums[i])  # include nums[i]
    result.append(current[:])  # save a copy
    dfs(nums, i + 1, current, result)
    current.pop()  # backtrack: remove nums[i]
    dfs(nums, i + 1, current, result)  # exclude nums[i]

def subsets(nums):
    result = [[]]  # the empty subset
    dfs(nums, 0, [], result)
    return result`,
  },

  lineMap: {
    c: { start: 23, 'call-root': 24, 'check-end': 7, 'return-end': 8, include: 10, save: 11, 'recurse-include': 13, pop: 14, 'recurse-exclude': 15, done: 25 },
    cpp: { start: 17, 'call-root': 19, 'check-end': 5, 'return-end': 6, include: 8, save: 9, 'recurse-include': 10, pop: 11, 'recurse-exclude': 12, done: 20 },
    java: { start: 18, 'call-root': 19, 'check-end': 6, 'return-end': 7, include: 9, save: 10, 'recurse-include': 11, pop: 12, 'recurse-exclude': 13, done: 20 },
    python: { start: 11, 'call-root': 12, 'check-end': 2, 'return-end': 3, include: 4, save: 5, 'recurse-include': 6, pop: 7, 'recurse-exclude': 8, done: 13 },
  },

  generateSteps: generateSubsetsSteps,
};
