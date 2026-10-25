import type { AlgorithmDefinition, ExecutionStep, HashMapView, NumberCell } from '../../types/algorithm';

/** the example target, shown with the default input */
const TWO_SUM_DEFAULT_TARGET = 9;

/**
 * Two Sum with a hash map: one left-to-right pass; for each nums[i], look up complement = target - nums[i] among the
 * EARLIER elements (value → index), then store nums[i] → i. Looking up before storing means an element is never
 * paired with itself; a repeated value overwrites its index, exactly as `seen[x] = i` does in every listing.
 */
function generateTwoSumSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const nums = [...input];
  const n = nums.length;
  // The UI always passes the validated target. Without one, the example target is used, as the other target-taking
  // algorithms do; null or a non-integer is refused rather than replaced by another target.
  const target = params?.target === undefined ? TWO_SUM_DEFAULT_TARGET : params.target;
  if (typeof target !== 'number' || !Number.isInteger(target)) throw new TypeError('Two Sum: target must be a whole number.');

  const steps: ExecutionStep[] = [];
  const seen = new Map<number, number>();
  const view = (extra: Partial<HashMapView> = {}): HashMapView => ({
    name: 'seen',
    keyLabel: 'value',
    valueLabel: 'index',
    entries: [...seen].map(([key, value]) => ({ key, value })),
    ...extra,
  });
  const cells = (i: number | null, complement: number | null, roles: Record<string, NumberCell['role']> = {}): NumberCell[] => [
    { name: 'target', value: target },
    { name: 'i', value: i, role: roles.i },
    { name: 'nums[i]', value: i === null || i >= n ? null : nums[i], role: roles['nums[i]'] },
    { name: 'complement', value: complement, role: roles.complement },
  ];
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [...nums], ...s });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, target },
    tracker: cells(null, null),
    message: `Two Sum: find two different indices whose values add up to ${target}`,
    explanation:
      'One pass from left to right. For each value, the hash map answers in O(1) on average whether its complement (target − value) appeared earlier.',
    actionLabel: 'Initialize',
  });

  push({
    type: 'assign',
    codeRef: 'init-map',
    variables: { n, target },
    tracker: cells(null, null),
    hashMap: view(),
    message: 'seen = {} (value → index)',
    explanation: 'An empty hash map. It will hold every value already visited, with the index where it was seen.',
    actionLabel: 'Create map',
  });

  let pair: [number, number] | null = null;
  for (let i = 0; ; i++) {
    const inLoop = i < n;
    push({
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { i, n, target },
      pointers: inLoop ? { i } : {},
      indices: inLoop ? [i] : [],
      tracker: cells(i, null, { i: 'changed' }),
      hashMap: view(),
      result: inLoop ? 'true' : 'false',
      message: `${i > 0 ? `i++ → i = ${i};  ` : ''}i < n?  ${i} < ${n} → ${inLoop}`,
      explanation: inLoop
        ? `Visit index ${i} (value ${nums[i]}).`
        : n === 0
          ? 'The array is empty, so there is no pair to find.'
          : `Every index has been visited and no earlier complement matched, so no pair sums to ${target}.`,
      actionLabel: inLoop ? 'Loop TRUE' : 'Loop FALSE',
    });
    if (!inLoop) break;

    const value = nums[i];
    const complement = target - value;
    push({
      type: 'assign',
      codeRef: 'calc-complement',
      variables: { i, 'nums[i]': value, complement, target },
      pointers: { i },
      indices: [i],
      tracker: cells(i, complement, { 'nums[i]': 'current', complement: 'changed' }),
      hashMap: view(),
      message: `complement = target - nums[${i}] = ${target} - ${value} = ${complement}`,
      explanation: `nums[${i}] = ${value} needs a partner of ${complement} to reach ${target}.`,
      actionLabel: 'Complement',
    });

    const j = seen.get(complement);
    const hit = j !== undefined;
    push({
      type: 'condition',
      codeRef: 'lookup',
      variables: { i, complement, target, ...(hit ? { 'seen[complement]': j } : {}) },
      pointers: hit ? { i, j } : { i },
      indices: hit ? [j, i] : [i],
      tracker: cells(i, complement, { complement: 'current' }),
      hashMap: view({ lookup: { key: complement, found: hit } }),
      result: hit ? 'true' : 'false',
      message: `${complement} in seen? → ${hit ? `true (index ${j})` : 'false'}`,
      explanation: hit
        ? `${complement} was seen at index ${j}, and nums[${j}] + nums[${i}] = ${complement} + ${value} = ${target}.`
        : complement === value
          ? `${complement} is nums[${i}] itself, but the map only holds earlier elements, so the same element is never used twice.`
          : `No earlier element has the value ${complement}.`,
      actionLabel: hit ? 'Lookup HIT' : 'Lookup MISS',
    });

    if (hit) {
      pair = [j, i];
      const others = otherPairs(nums, target, pair);
      push({
        type: 'found',
        codeRef: 'return-pair',
        variables: { j, i, 'nums[j]': nums[j], 'nums[i]': value, target },
        pointers: { j, i },
        indices: [j, i],
        sortedIndices: [j, i],
        tracker: cells(i, complement),
        hashMap: view({ lookup: { key: complement, found: true } }),
        message: `Return [${j}, ${i}]: nums[${j}] + nums[${i}] = ${nums[j]} + ${value} = ${target}`,
        explanation:
          others.length === 0
            ? 'The only pair that sums to the target.'
            : `The first pair the scan completes. ${others.length} other pair${others.length === 1 ? '' : 's'} also sum${others.length === 1 ? 's' : ''} to ${target} (e.g. [${others[0].join(', ')}]); one answer is enough, so the search stops here.`,
        actionLabel: 'Pair Found',
      });
      break;
    }

    const kind = seen.has(value) ? 'update' : 'insert';
    const previous = seen.get(value);
    seen.set(value, i);
    push({
      type: kind === 'insert' ? 'assign' : 'update',
      codeRef: 'store',
      variables: { i, 'nums[i]': value, target },
      pointers: { i },
      indices: [i],
      tracker: cells(i, complement, { 'nums[i]': 'current' }),
      hashMap: view({ write: { key: value, kind } }),
      message: `seen[${value}] = ${i}`,
      explanation:
        kind === 'insert'
          ? `Remember that ${value} is at index ${i}, so a later element needing ${value} finds it.`
          : `${value} was already in the map (index ${previous}); it now maps to the later index ${i}. Either index gives a valid pair, since the values are equal.`,
      actionLabel: kind === 'insert' ? 'Map insert' : 'Map update',
    });
  }

  if (!pair) {
    push({
      type: 'not-found',
      codeRef: 'return-none',
      variables: { target },
      tracker: cells(null, null),
      hashMap: view(),
      message: `No pair sums to ${target}`,
      explanation: n < 2 ? `A pair needs two elements; this array has ${n}.` : `None of the ${(n * (n - 1)) / 2} pairs sums to ${target}.`,
      actionLabel: 'Not Found',
    });
  }

  push({
    type: 'complete',
    codeRef: pair ? 'return-pair' : 'return-none',
    variables: { target },
    sortedIndices: pair ? [...pair] : [],
    tracker: pair ? cells(pair[1], target - nums[pair[1]]) : cells(null, null),
    hashMap: view(),
    outcomeText: pair
      ? `Pair found: indices [${pair[0]}, ${pair[1]}] — ${nums[pair[0]]} + ${nums[pair[1]]} = ${target}`
      : `No pair sums to ${target}`,
    message: pair ? `Done — indices [${pair[0]}, ${pair[1]}]` : 'Done — no pair',
    explanation: `One pass with O(1) average-time map operations: O(n) average time, and O(n) extra space for the map (here ${seen.size} entr${seen.size === 1 ? 'y' : 'ies'}).`,
    actionLabel: 'Complete',
  });

  return steps;
}

/** every other pair p < q with nums[p] + nums[q] = target, besides the returned one (for the explanation only) */
function otherPairs(nums: number[], target: number, [a, b]: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  for (let p = 0; p < nums.length; p++)
    for (let q = p + 1; q < nums.length; q++) if (nums[p] + nums[q] === target && !(p === a && q === b)) out.push([p, q]);
  return out;
}

export const twoSumDefinition: AlgorithmDefinition = {
  id: 'two-sum',
  name: 'Two Sum',
  category: 'ARRAYS',
  subtitle: 'A hash map of earlier values finds a pair summing to the target in one pass.',
  description:
    'Two Sum returns two different indices whose values add up to a target. A hash map from value to index lets each element ask, in O(1) on average, whether the value it needs (target − value) appeared earlier.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)',
    bestFor: 'Pair-sum lookups in unsorted arrays, in one pass',
  },
  defaultInput: [3, 8, 11, 5, 2, 7, 4],
  inputSpec: {
    target: { label: 'Target sum', hint: 'Find two different indices whose values add up to this', defaultValue: TWO_SUM_DEFAULT_TARGET },
  },
  positionPointers: ['i', 'j'],

  code: {
    c: `#include <stdbool.h>
#include <stdlib.h>

/* hash map value → index (open addressing); an empty slot has index -1 */
typedef struct { int *keys, *index; unsigned mask; } Map;

static unsigned slot(const Map *m, int key) {
    unsigned h = (unsigned)key & m->mask;
    while (m->index[h] != -1 && m->keys[h] != key) h = (h + 1) & m->mask;
    return h;
}

bool twoSum(const int nums[], int n, int target, int *outJ, int *outI) {
    unsigned size = 1;
    while (size < 2u * (unsigned)n) size *= 2;
    Map seen = { malloc(size * sizeof(int)), malloc(size * sizeof(int)), size - 1 };
    for (unsigned s = 0; s < size; s++) seen.index[s] = -1;
    for (int i = 0; i < n; i++) {
        int complement = target - nums[i];
        unsigned s = slot(&seen, complement);
        if (seen.index[s] != -1) {
            *outJ = seen.index[s]; *outI = i;
            free(seen.keys); free(seen.index);
            return true;
        }
        s = slot(&seen, nums[i]);
        seen.keys[s] = nums[i]; seen.index[s] = i;
    }
    free(seen.keys); free(seen.index);
    return false;
}`,
    cpp: `vector<int> twoSum(const vector<int>& nums, int target) {
    unordered_map<int, int> seen;  // value → index
    for (int i = 0; i < (int)nums.size(); i++) {
        int complement = target - nums[i];
        if (seen.count(complement))
            return {seen[complement], i};
        seen[nums[i]] = i;
    }
    return {};
}`,
    java: `import java.util.HashMap;
import java.util.Map;

public class TwoSum {
    public static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();  // value → index
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (seen.containsKey(complement))
                return new int[] { seen.get(complement), i };
            seen.put(nums[i], i);
        }
        return new int[0];
    }
}`,
    python: `def two_sum(nums, target):
    seen = {}  # value → index
    for i in range(len(nums)):
        complement = target - nums[i]
        if complement in seen:
            return seen[complement], i
        seen[nums[i]] = i
    return None`,
  },

  lineMap: {
    c: { 'fn-entry': 13, 'init-map': 16, 'loop-condition': 18, 'calc-complement': 19, lookup: 21, 'return-pair': 24, store: 27, 'return-none': 30 },
    cpp: { 'fn-entry': 1, 'init-map': 2, 'loop-condition': 3, 'calc-complement': 4, lookup: 5, 'return-pair': 6, store: 7, 'return-none': 9 },
    java: { 'fn-entry': 5, 'init-map': 6, 'loop-condition': 7, 'calc-complement': 8, lookup: 9, 'return-pair': 10, store: 11, 'return-none': 13 },
    python: { 'fn-entry': 1, 'init-map': 2, 'loop-condition': 3, 'calc-complement': 4, lookup: 5, 'return-pair': 6, store: 7, 'return-none': 8 },
  },

  // C has no built-in hash map: sizing and clearing the table belong to creating it, finding the complement's slot to
  // the lookup, writing the pair and freeing the table to the return, and finding the value's slot to the store.
  lineLeads: {
    c: { 'init-map': 2, lookup: 1, 'return-pair': 2, store: 1, 'return-none': 1 },
  },
  lineSpans: {
    c: { 'init-map': 2 },
  },

  generateSteps: generateTwoSumSteps,
};
