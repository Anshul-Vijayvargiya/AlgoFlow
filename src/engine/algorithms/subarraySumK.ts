import type { AlgorithmDefinition, ExecutionStep, PrefixMapEntry, PrefixMapOperation, PrefixMapRange, PrefixMapView } from '../../types/algorithm';
import { MAX_VALUE, MIN_VALUE, validateAlgorithmInput } from '../inputParsing';

/**
 * Subarray Sum Equals K (LeetCode 560): how many contiguous, non-empty subarrays of nums sum to k. Prefix sums and a
 * hash map of how often each prefix sum has occurred:
 *
 *   count = 0; prefix = 0; freq = {0: 1}
 *   for i = 0 .. n - 1:
 *     prefix += nums[i]              the sum of nums[0..i]
 *     need = prefix - k              an earlier prefix sum equal to need leaves exactly k after it
 *     count += freq.get(need, 0)     one subarray ending at i for each time need has occurred
 *     freq[prefix] += 1              record this prefix sum for the numbers still to come
 *   return count
 *
 * Why it works: with P(j) the sum of the first j numbers (P(0) = 0, the empty prefix), the sum of nums[j..i] is
 * P(i + 1) - P(j). It is k exactly when P(j) = P(i + 1) - k = need. The map holds how often each of P(0) .. P(i) has
 * occurred, so freq[need] is the number of starts j that make a subarray ending at i sum to k. The lookup comes before
 * the current prefix is recorded, so a subarray is never empty (with k = 0, need equals prefix itself). Negative
 * numbers and zeros are fine: nothing assumes the prefix sums rise.
 *
 * DISPLAY ONLY (built by the trace, never by the listings, and never read back into count): where each prefix sum
 * occurred, and from that the subarrays each lookup counts (from each earlier position holding need, to i).
 *
 * One pass of O(1) average work per number: O(n) time, and O(n) space for the map.
 */

export const MAX_NUMS = 10;
export const SUBARRAY_SUM_DEFAULT_K = 3;

/** freezes a value and everything inside it */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value as object)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;
/** a number as an operand: negatives in parentheses */
const operand = (x: number) => (x < 0 ? `(${x})` : String(x));
const plural = (c: number, one: string, many = `${one}s`) => `${c} ${c === 1 ? one : many}`;
/** nums[start..end] as written in the messages */
export const rangeText = (nums: readonly number[], r: PrefixMapRange) => `nums[${r.start}..${r.end}] = ${list(nums.slice(r.start, r.end + 1))}`;

function generateSubarraySumSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  // The UI always passes the validated k. Without one, the example k is used, as the other target-taking algorithms do;
  // null or a non-integer is refused rather than replaced by another k.
  const k = params?.target === undefined ? SUBARRAY_SUM_DEFAULT_K : params.target;
  if (typeof k !== 'number' || !Number.isInteger(k)) throw new TypeError('Subarray Sum Equals K: k must be a whole number.');
  if (k < MIN_VALUE || k > MAX_VALUE) throw new RangeError(`Subarray Sum Equals K: k (${k}) is out of range: use ${MIN_VALUE} to ${MAX_VALUE}.`);
  const check = validateAlgorithmInput(subarraySumKDefinition, input, k);
  if (!check.ok) throw new RangeError(check.message);
  const nums = deepFreeze([...input]);
  const n = nums.length;
  const steps: ExecutionStep[] = [];

  let i: number | null = null;
  let count: number | null = null;
  let prefix: number | null = null;
  let need: number | null = null;
  let freq: Map<number, number> | null = null;
  let recorded = 0;
  // DISPLAY ONLY: the positions j where each prefix sum P(j) occurred, and every subarray counted so far
  const positions = new Map<number, number[]>();
  const matches: PrefixMapRange[] = [];

  type Extra = Partial<Pick<PrefixMapView, 'lookup' | 'write' | 'matchesHere' | 'result'>>;
  const push = (operation: PrefixMapOperation, s: Omit<ExecutionStep, 'id' | 'state' | 'prefixMap'>, extra: Extra = {}) => {
    const entries: PrefixMapEntry[] | null = freq ? [...freq].map(([key, c]) => ({ key, count: c })) : null;
    const view: PrefixMapView = {
      nums,
      k: k as number,
      i,
      count,
      prefix,
      need,
      freq: entries,
      recorded,
      operation,
      matchesHere: [],
      matches: matches.map(r => ({ ...r })),
      ...extra,
    };
    steps.push({ id: steps.length, state: [...nums], ...s, prefixMap: deepFreeze(view) });
  };

  push('start', {
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, k, nums: list(nums) },
    message: `subarraySum(${list(nums)}, k = ${k}): count the subarrays that sum to ${k}`,
    explanation:
      n === 0
        ? 'The array is empty: there is no subarray, so the count stays 0.'
        : 'One pass keeps a running prefix sum and a map of how often each prefix sum has occurred. A subarray ending at i sums to k exactly when an earlier prefix sum equals prefix - k.',
    actionLabel: 'subarraySum(nums, k)',
  });

  count = 0;
  push('init-count', {
    type: 'assign',
    codeRef: 'init-count',
    variables: { count: 0 },
    message: 'count = 0',
    explanation: 'No subarray has been counted yet.',
    actionLabel: 'count = 0',
  });

  prefix = 0;
  push('init-prefix', {
    type: 'assign',
    codeRef: 'init-prefix',
    variables: { prefix: 0 },
    message: 'prefix = 0',
    explanation: 'The sum of no numbers yet: P(0), the empty prefix, is 0.',
    actionLabel: 'prefix = 0',
  });

  freq = new Map([[0, 1]]);
  recorded = 1;
  positions.set(0, [0]);
  push(
    'init-map',
    {
      type: 'assign',
      codeRef: 'init-map',
      variables: { 'freq[0]': 1 },
      message: 'freq = {0: 1}',
      explanation: 'The empty prefix sums to 0 and has occurred once. Recording it lets a subarray that starts at index 0 be counted: its sum is prefix - 0.',
      actionLabel: 'freq = {0: 1}',
    },
    { write: { key: 0, kind: 'insert', from: 0, to: 1 } }
  );

  for (let x = 0; ; x++) {
    i = x;
    const go = x < n;
    push('loop', {
      type: 'loop-condition',
      codeRef: 'loop-condition',
      variables: { i: x, n },
      result: go ? 'true' : 'false',
      message: `i=${x} < n=${n} → ${go ? 'true' : 'false'}${go ? '' : ' — loop ends'}`,
      explanation: go ? `Index ${x}: nums[${x}] = ${nums[x]}.` : `Every number has been seen. count holds the answer: ${count}.`,
      actionLabel: go ? `i = ${x}` : 'Loop done',
    });
    if (!go) break;

    const value = nums[x];
    const before: number = prefix;
    prefix = before + value;
    push('add-prefix', {
      type: 'assign',
      codeRef: 'add-prefix',
      variables: { i: x, 'nums[i]': value, prefix },
      message: `prefix = ${before} + nums[${x}] = ${before} + ${operand(value)} = ${prefix}`,
      explanation: `prefix is now P(${x + 1}), the sum of nums[0..${x}].`,
      actionLabel: `prefix = ${prefix}`,
    });

    const after: number = prefix;
    need = after - k;
    push('calc-need', {
      type: 'assign',
      codeRef: 'calc-need',
      variables: { i: x, prefix, k, need },
      message: `need = prefix - k = ${prefix} - ${operand(k)} = ${need}`,
      explanation: `A subarray ending at index ${x} sums to ${k} exactly when the prefix before it sums to ${prefix} - ${operand(k)} = ${need}.`,
      actionLabel: `need = ${need}`,
    });

    const wanted: number = need;
    const occurrences = freq.get(wanted) ?? 0;
    const countBefore: number = count;
    count = countBefore + occurrences;
    const here = (positions.get(need) ?? []).map(j => ({ start: j, end: x }));
    matches.push(...here.map(r => ({ ...r })));
    push(
      'lookup',
      {
        type: 'assign',
        codeRef: 'lookup',
        variables: { i: x, need, [`freq[${need}]`]: occurrences, count },
        message:
          occurrences > 0
            ? `count += freq[${need}] = ${countBefore} + ${occurrences} = ${count}`
            : `freq has no ${need}: count += 0 → count = ${count}`,
        explanation:
          occurrences > 0
            ? `${need} has occurred ${occurrences === 1 ? 'once' : `${occurrences} times`} before index ${x}, so ${plural(occurrences, 'subarray')} ending at index ${x} ${occurrences === 1 ? 'sums' : 'sum'} to ${k}: ${here.map(r => rangeText(nums, r)).join('; ')}.`
            : `No earlier prefix sum is ${need}, so no subarray ending at index ${x} sums to ${k}.`,
        actionLabel: `count += ${occurrences}`,
      },
      { lookup: { key: need, found: occurrences > 0, occurrences, countBefore }, matchesHere: here }
    );

    const from = freq.get(prefix) ?? 0;
    freq.set(prefix, from + 1);
    recorded++;
    positions.set(prefix, [...(positions.get(prefix) ?? []), x + 1]);
    push(
      'store',
      {
        type: 'update',
        codeRef: 'store',
        variables: { i: x, prefix, [`freq[${prefix}]`]: from + 1 },
        message: `freq[${prefix}] = ${from} + 1 = ${from + 1}`,
        explanation:
          from === 0
            ? `${prefix} is a new prefix sum: recorded once, for the numbers still to come.`
            : `${prefix} has occurred before: it is now recorded ${from + 1} times. Each occurrence can start a different subarray later.`,
        actionLabel: `freq[${prefix}] = ${from + 1}`,
      },
      { write: { key: prefix, kind: from === 0 ? 'insert' : 'increment', from, to: from + 1 } }
    );
  }

  i = null;
  const total = count;
  const SHOWN = 8;
  const text =
    n === 0
      ? 'The array is empty: no subarray, count 0'
      : total === 0
        ? `No subarray sums to ${k}`
        : `${plural(total, 'subarray')} ${total === 1 ? 'sums' : 'sum'} to ${k}: ${matches
            .slice(0, SHOWN)
            .map(r => rangeText(nums, r))
            .join(', ')}${matches.length > SHOWN ? `, and ${matches.length - SHOWN} more` : ''}`;
  push(
    'done',
    {
      type: 'complete',
      codeRef: 'return-result',
      variables: { n, k, result: total },
      message: `return count = ${total}`,
      explanation: `${plural(n, 'pass', 'passes')} of O(1) average work: O(n) time, and O(n) space for the map of prefix sums.`,
      actionLabel: `Return ${total}`,
      outcomeText: text,
    },
    { result: { count: total, text } }
  );
  return steps;
}

const CODE = {
  c: `#include <stdlib.h>

/* hash map prefix sum → how many times it has occurred (open addressing); a count of 0 is an empty slot */
typedef struct { int *keys, *counts; unsigned mask; } Map;

static Map newMap(int entries) {
    unsigned size = 1;
    while (size < 2u * (unsigned)entries) size *= 2;
    Map m = { malloc(size * sizeof(int)), calloc(size, sizeof(int)), size - 1 };
    return m;
}

static unsigned slot(const Map *m, int key) {
    unsigned h = (unsigned)key & m->mask;
    while (m->counts[h] != 0 && m->keys[h] != key) h = (h + 1) & m->mask;
    return h;
}

static int get(const Map *m, int key) {
    return m->counts[slot(m, key)];
}

static void add(Map *m, int key) {
    unsigned h = slot(m, key);
    m->keys[h] = key;
    m->counts[h]++;
}

int subarraySum(int* nums, int numsSize, int k) {
    int count = 0;
    int prefix = 0;
    Map freq = newMap(numsSize + 1);
    add(&freq, 0);
    for (int i = 0; i < numsSize; i++) {
        prefix += nums[i];
        int need = prefix - k;
        count += get(&freq, need);
        add(&freq, prefix);
    }
    free(freq.keys);
    free(freq.counts);
    return count;
}`,
  cpp: `#include <unordered_map>
#include <vector>
using namespace std;

int subarraySum(vector<int>& nums, int k) {
    int count = 0;
    int prefix = 0;
    unordered_map<int, int> freq = {{0, 1}};
    for (int i = 0; i < (int)nums.size(); i++) {
        prefix += nums[i];
        int need = prefix - k;
        count += freq.count(need) ? freq.at(need) : 0;
        freq[prefix]++;
    }
    return count;
}`,
  java: `import java.util.HashMap;
import java.util.Map;

public class SubarraySumEqualsK {
    public static int subarraySum(int[] nums, int k) {
        int count = 0;
        int prefix = 0;
        Map<Integer, Integer> freq = new HashMap<>();
        freq.put(0, 1);
        for (int i = 0; i < nums.length; i++) {
            prefix += nums[i];
            int need = prefix - k;
            count += freq.getOrDefault(need, 0);
            freq.put(prefix, freq.getOrDefault(prefix, 0) + 1);
        }
        return count;
    }
}`,
  python: `def subarray_sum(nums, k):
    count = 0
    prefix = 0
    freq = {0: 1}
    for i in range(len(nums)):
        prefix += nums[i]
        need = prefix - k
        count += freq.get(need, 0)
        freq[prefix] = freq.get(prefix, 0) + 1
    return count`,
};

/** the 1-based line of a listing whose text is exactly `text`, apart from indentation */
function lineOf(code: string, text: string): number {
  const at = code.split('\n').findIndex(line => line.trim() === text);
  if (at < 0) throw new Error(`Subarray Sum Equals K: no line "${text}" in its listing`);
  return at + 1;
}
type Lang = keyof typeof CODE;
const END: Record<Lang, string> = { c: ';', cpp: ';', java: ';', python: '' };
const DECL: Record<Lang, string> = { c: 'int ', cpp: 'int ', java: 'int ', python: '' };
const LINES: Record<Lang, Record<'fn-entry' | 'init-map' | 'loop-condition' | 'lookup' | 'store', string>> = {
  c: {
    'fn-entry': 'int subarraySum(int* nums, int numsSize, int k) {',
    'init-map': 'Map freq = newMap(numsSize + 1);',
    'loop-condition': 'for (int i = 0; i < numsSize; i++) {',
    lookup: 'count += get(&freq, need);',
    store: 'add(&freq, prefix);',
  },
  cpp: {
    'fn-entry': 'int subarraySum(vector<int>& nums, int k) {',
    'init-map': 'unordered_map<int, int> freq = {{0, 1}};',
    'loop-condition': 'for (int i = 0; i < (int)nums.size(); i++) {',
    lookup: 'count += freq.count(need) ? freq.at(need) : 0;',
    store: 'freq[prefix]++;',
  },
  java: {
    'fn-entry': 'public static int subarraySum(int[] nums, int k) {',
    'init-map': 'Map<Integer, Integer> freq = new HashMap<>();',
    'loop-condition': 'for (int i = 0; i < nums.length; i++) {',
    lookup: 'count += freq.getOrDefault(need, 0);',
    store: 'freq.put(prefix, freq.getOrDefault(prefix, 0) + 1);',
  },
  python: {
    'fn-entry': 'def subarray_sum(nums, k):',
    'init-map': 'freq = {0: 1}',
    'loop-condition': 'for i in range(len(nums)):',
    lookup: 'count += freq.get(need, 0)',
    store: 'freq[prefix] = freq.get(prefix, 0) + 1',
  },
};
function lines(lang: Lang): Record<string, number> {
  const at = (text: string) => lineOf(CODE[lang], text);
  return {
    ...Object.fromEntries(Object.entries(LINES[lang]).map(([ref, text]) => [ref, at(text)])),
    'init-count': at(`${DECL[lang]}count = 0${END[lang]}`),
    'init-prefix': at(`${DECL[lang]}prefix = 0${END[lang]}`),
    'add-prefix': at(`prefix += nums[i]${END[lang]}`),
    'calc-need': at(`${DECL[lang]}need = prefix - k${END[lang]}`),
    'return-result': at(`return count${END[lang]}`),
  };
}

export const subarraySumKDefinition: AlgorithmDefinition = {
  id: 'array-subarray-sum-k',
  name: 'Subarray Sum Equals K',
  category: 'ARRAYS',
  visual: 'prefix-map',
  subtitle: 'Prefix sums and a hash map of how often each occurred: count the subarrays summing to k in one pass.',
  description:
    'Count the contiguous, non-empty subarrays whose numbers sum to k (LeetCode 560). One pass keeps a running prefix sum and a hash map from each prefix sum to how many times it has occurred, starting with {0: 1} for the empty prefix. At index i, prefix becomes the sum of nums[0..i]; a subarray ending at i sums to k exactly when the prefix before it sums to prefix - k, so count grows by how often prefix - k has occurred. Only then is prefix recorded, so no subarray is empty. Negative numbers and zeros work, and every repeated prefix sum counts once per occurrence. O(n) time and O(n) space. The subarrays the visualizer marks are for display only; the code only counts them.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)',
    bestFor: 'Counting subarrays with a given sum, negative numbers included',
  },
  defaultInput: [1, 2, 3],
  inputSpec: {
    target: { label: 'k', hint: 'Count the subarrays whose numbers sum to this', defaultValue: SUBARRAY_SUM_DEFAULT_K },
    maxLength: MAX_NUMS,
    randomValues: [-3, 4],
  },

  code: CODE,

  // looked up from the listing text, so a line moved in a listing cannot leave a step pointing at another line
  lineMap: { c: lines('c'), cpp: lines('cpp'), java: lines('java'), python: lines('python') },
  // C and Java create the map and record P(0) in two statements; C frees the map just before returning
  lineSpans: { c: { 'init-map': 2 }, java: { 'init-map': 2 } },
  lineLeads: { c: { 'return-result': 2 } },

  generateSteps: generateSubarraySumSteps,
};
