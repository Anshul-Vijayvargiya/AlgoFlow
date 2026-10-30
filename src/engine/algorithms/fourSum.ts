import type { AlgorithmDefinition, ExecutionStep, NumberCell } from '../../types/algorithm';

const FOUR_SUM_DEFAULT_TARGET = 0;
/** four values this large still add up exactly as JavaScript numbers (|sum| ≤ 2^53) */
const FOUR_SUM_MAX_ABS = Math.floor(Number.MAX_SAFE_INTEGER / 4);

/**
 * 4Sum (LeetCode 18): every unique quadruplet [nums[i], nums[j], nums[left], nums[right]] that sums to target. Sort a
 * copy, fix i and then j in two nested loops, and close in on the last two values with two pointers: left = j + 1,
 * right = n - 1; a sum below target needs a larger value (left++), above it a smaller one (right--). Duplicates are
 * skipped at every level: a fixed i or j equal to the previous one, and, after a quadruplet is recorded, left and right
 * values equal to the ones just used. Two safe prunings at each fixed level: if even the smallest sum that can still
 * start here is above target, no later start can reach it either (break); if even the largest is below target, this
 * start cannot (continue). O(n³) time; O(1) extra space besides the copy and the output.
 *
 * The bars are the sorted copy (from the sort step on); i, j, left and right are drawn under them, the quadruplet being
 * evaluated is highlighted, and every quadruplet found so far is listed beside the bars as its own row.
 */
function generateFourSumSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  if (input.some(v => !Number.isInteger(v) || Math.abs(v) > FOUR_SUM_MAX_ABS)) {
    throw new TypeError('4Sum: every value must be a whole number small enough to add exactly.');
  }
  const target = params?.target === undefined || params.target === null ? FOUR_SUM_DEFAULT_TARGET : params.target;
  if (typeof target !== 'number' || !Number.isInteger(target) || Math.abs(target) > Number.MAX_SAFE_INTEGER) {
    throw new TypeError('4Sum: the target must be a whole number.');
  }
  const nums = [...input];
  const n = nums.length;
  const steps: ExecutionStep[] = [];

  const quads: [number, number, number, number][] = [];
  /** the sorted-array positions of each recorded quadruplet (only to light up the bars at the end) */
  const used = new Set<number>();
  let i: number | null = null;
  let j: number | null = null;
  let left: number | null = null;
  let right: number | null = null;
  let sum: number | null = null;

  type Roles = Partial<Record<'i' | 'j' | 'left' | 'right' | 'sum' | 'found', NumberCell['role']>>;
  // i and j may be past their loop's range once it ends, but stay inside the array; left and right always stay inside it
  const at = (k: number | null) => (k !== null && k >= 0 && k < n ? nums[k] : null);
  const cards = (roles: Roles = {}): NumberCell[] => [
    { name: 'nums[i]', value: at(i), role: roles.i },
    { name: 'nums[j]', value: at(j), role: roles.j },
    { name: 'nums[left]', value: at(left), role: roles.left },
    { name: 'nums[right]', value: at(right), role: roles.right },
    { name: 'sum', value: sum, role: roles.sum },
    { name: 'found', value: quads.length, role: roles.found },
  ];
  const fmt = (q: readonly number[]) => `[${q.join(', ')}]`;
  const plural = (k: number) => `${k} quadruplet${k === 1 ? '' : 's'}`;
  /** every quadruplet recorded so far, one row each */
  const rows = () => quads.map((q, k) => ({ name: `quadruplet-${k}`, label: `result[${k}]`, values: [...q] }));
  /** i, j, left and right as positions in the array (each only while it is set) */
  const where = () => ({
    pointers: {
      ...(i !== null ? { i } : {}),
      ...(j !== null ? { j } : {}),
      ...(left !== null ? { left } : {}),
      ...(right !== null ? { right } : {}),
    },
    // nothing before i can be used again; while the pointers are set, nothing after right is left to try either
    ...(i !== null && i < n ? { extraInfo: { subRange: [i, right !== null ? right : n - 1] as [number, number] } } : {}),
  });
  const vars = (extra: Record<string, unknown> = {}) => ({
    n,
    target,
    ...(i !== null ? { i } : {}),
    ...(j !== null ? { j } : {}),
    ...(left !== null ? { left } : {}),
    ...(right !== null ? { right } : {}),
    found: quads.length,
    ...extra,
  });
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => {
    // the working range always takes in the bars the step looks at (nums[j - 1], nums[right + 1]), so none is dimmed
    const range = s.extraInfo?.subRange;
    const extraInfo = range && s.indices?.length ? { subRange: [Math.min(range[0], ...s.indices), Math.max(range[1], ...s.indices)] as [number, number] } : s.extraInfo;
    steps.push({ id: steps.length, state: [...nums], buffers: rows(), ...s, ...(extraInfo ? { extraInfo } : {}) });
  };
  /** "a + b + c + d" for the values at these positions, and their sum */
  const terms = (ks: number[]) => ({ text: ks.map(k => nums[k]).join(' + '), total: ks.reduce((acc, k) => acc + nums[k], 0) });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, target },
    tracker: cards(),
    message: `4Sum: find every unique quadruplet of ${n} value${n === 1 ? '' : 's'} that sums to ${target}`,
    explanation:
      'Sort the values, fix the first two with two nested loops, and search the rest with two pointers moving towards each other. Equal values are skipped so no quadruplet is reported twice.',
    actionLabel: 'Initialize',
  });

  push({
    type: 'assign',
    codeRef: 'copy',
    variables: { n, target },
    tracker: cards(),
    message: `nums = a copy of the input: ${fmt(nums)}`,
    explanation: "The sort works on this copy, so the caller's array keeps its order.",
    actionLabel: 'Copy input',
  });

  const before = [...nums];
  nums.sort((a, b) => a - b);
  const changed = before.some((v, k) => v !== nums[k]);
  push({
    type: 'assign',
    codeRef: 'sort',
    variables: { n, target },
    indices: changed ? before.map((_, k) => k).filter(k => before[k] !== nums[k]) : [],
    tracker: cards(),
    message: `sort(nums) → ${fmt(nums)}`,
    explanation: changed
      ? 'Ascending order lets the pointers steer the sum: moving left right makes it larger, moving right left makes it smaller. Equal values are now next to each other, which makes duplicates easy to skip.'
      : 'The values were already in ascending order. Sorted, the pointers can steer the sum, and equal values sit next to each other.',
    actionLabel: 'Sort',
  });

  push({
    type: 'assign',
    codeRef: 'init-result',
    variables: { n, target },
    tracker: cards(),
    message: 'result = []',
    explanation: 'The quadruplets found go here, each one in ascending order.',
    actionLabel: 'Init result',
  });

  outer: for (i = 0; ; i++) {
    j = null;
    left = null;
    right = null;
    sum = null;
    const inLoop = i < n - 3;
    push({
      type: 'loop-condition',
      codeRef: 'outer-loop',
      variables: vars(),
      ...where(),
      indices: inLoop ? [i] : [],
      tracker: cards(),
      result: inLoop ? 'true' : 'false',
      message: `${i > 0 ? `i++ → i = ${i};  ` : ''}i < n - 3?  ${i} < ${n - 3} → ${inLoop}`,
      explanation: inLoop
        ? `Fix nums[${i}] = ${nums[i]} as the first value of the quadruplet; the other three come from the values after it.`
        : n < 4
          ? `A quadruplet needs four values; this array has ${n}.`
          : 'Fewer than four values remain from i on, so no new quadruplet can start here. The search is over.',
      actionLabel: inLoop ? `i = ${i}` : 'Loop ends',
    });
    if (!inLoop) break;

    const dupI = i > 0 && nums[i] === nums[i - 1];
    push({
      type: 'condition',
      codeRef: 'check-dup-i',
      variables: vars({ 'nums[i]': nums[i], ...(i > 0 ? { 'nums[i - 1]': nums[i - 1] } : {}) }),
      ...where(),
      indices: i > 0 ? [i - 1, i] : [i],
      ...(i > 0 ? { comparedValues: { val1: nums[i], val2: nums[i - 1] } } : {}),
      tracker: cards({ i: 'current' }),
      result: dupI ? 'true' : 'false',
      message:
        i === 0
          ? 'i > 0 and nums[i] == nums[i - 1]?  i = 0 → false'
          : `i > 0 and nums[i] == nums[i - 1]?  ${nums[i]} == ${nums[i - 1]} → ${dupI}`,
      explanation:
        i === 0
          ? 'The first value has no previous value to repeat.'
          : dupI
            ? `${nums[i]} was already fixed at index ${i - 1}: every quadruplet starting with it has been found, so this one would only repeat them.`
            : `${nums[i]} differs from the previous first value ${nums[i - 1]}, so it can start new quadruplets.`,
      actionLabel: dupI ? 'Duplicate' : 'New value',
    });
    if (dupI) {
      push({
        type: 'increment',
        codeRef: 'skip-i',
        variables: vars(),
        ...where(),
        indices: [i],
        tracker: cards({ i: 'current' }),
        message: `continue — skip the repeated ${nums[i]}`,
        explanation: 'Go straight on to the next first index.',
        actionLabel: 'Skip i',
      });
      continue;
    }

    // the smallest sum any quadruplet starting at i can have: the next three values
    const lowI = [i, i + 1, i + 2, i + 3];
    const minI = terms(lowI);
    const tooBigI = minI.total > target;
    push({
      type: 'condition',
      codeRef: 'check-min-i',
      variables: vars({ smallest: minI.total }),
      ...where(),
      indices: lowI,
      comparedValues: { val1: minI.total, val2: target },
      tracker: cards({ i: 'current' }),
      result: tooBigI ? 'true' : 'false',
      message: `nums[i] + nums[i + 1] + nums[i + 2] + nums[i + 3] > target?  ${minI.text} = ${minI.total} > ${target} → ${tooBigI}`,
      explanation: tooBigI
        ? `Even the four smallest values from index ${i} on sum to ${minI.total}, more than ${target}. Every later start is at least as large, so nothing more can be found.`
        : `The smallest sum starting at index ${i} is ${minI.total}, not above ${target}, so a quadruplet may still start here.`,
      actionLabel: tooBigI ? 'Too large' : 'Can reach',
    });
    if (tooBigI) {
      push({
        type: 'loop-condition',
        codeRef: 'stop-i',
        variables: vars(),
        ...where(),
        indices: [i],
        tracker: cards(),
        result: 'false',
        message: 'break — no quadruplet can start at or after this index',
        explanation: 'The values are ascending, so every later first value only makes the sum larger. The search stops early.',
        actionLabel: 'Break',
      });
      break;
    }

    // the largest sum any quadruplet starting at i can have: nums[i] and the three largest values
    const highI = [i, n - 3, n - 2, n - 1];
    const maxI = terms(highI);
    const tooSmallI = maxI.total < target;
    push({
      type: 'condition',
      codeRef: 'check-max-i',
      variables: vars({ largest: maxI.total }),
      ...where(),
      indices: highI,
      comparedValues: { val1: maxI.total, val2: target },
      tracker: cards({ i: 'current' }),
      result: tooSmallI ? 'true' : 'false',
      message: `nums[i] + nums[n - 3] + nums[n - 2] + nums[n - 1] < target?  ${maxI.text} = ${maxI.total} < ${target} → ${tooSmallI}`,
      explanation: tooSmallI
        ? `Even with the three largest values, nums[${i}] = ${nums[i]} only reaches ${maxI.total}, less than ${target}. A larger first value may still work, so try the next one.`
        : `With the three largest values the sum reaches ${maxI.total}, at least ${target}, so a quadruplet may start here.`,
      actionLabel: tooSmallI ? 'Too small' : 'Can reach',
    });
    if (tooSmallI) {
      push({
        type: 'increment',
        codeRef: 'skip-max-i',
        variables: vars(),
        ...where(),
        indices: [i],
        tracker: cards({ i: 'current' }),
        message: `continue — nums[${i}] = ${nums[i]} is too small to reach ${target}`,
        explanation: 'Go straight on to the next first index.',
        actionLabel: 'Skip i',
      });
      continue;
    }

    for (j = i + 1; ; j++) {
      left = null;
      right = null;
      sum = null;
      const jLoop = j < n - 2;
      push({
        type: 'loop-condition',
        codeRef: 'j-loop',
        variables: vars(),
        ...where(),
        indices: jLoop ? [i, j] : [i],
        tracker: cards(),
        result: jLoop ? 'true' : 'false',
        message: `${j > i + 1 ? `j++ → j = ${j};  ` : `j = i + 1 = ${j};  `}j < n - 2?  ${j} < ${n - 2} → ${jLoop}`,
        explanation: jLoop
          ? `Fix nums[${j}] = ${nums[j]} as the second value; the last two come from the values after it.`
          : `Every second value after index ${i} has been tried. Move on to the next first value.`,
        actionLabel: jLoop ? `j = ${j}` : 'j loop ends',
      });
      if (!jLoop) break;

      const dupJ = j > i + 1 && nums[j] === nums[j - 1];
      push({
        type: 'condition',
        codeRef: 'check-dup-j',
        variables: vars({ 'nums[j]': nums[j], ...(j > i + 1 ? { 'nums[j - 1]': nums[j - 1] } : {}) }),
        ...where(),
        indices: j > i + 1 ? [j - 1, j] : [j],
        ...(j > i + 1 ? { comparedValues: { val1: nums[j], val2: nums[j - 1] } } : {}),
        tracker: cards({ j: 'current' }),
        result: dupJ ? 'true' : 'false',
        message:
          j === i + 1
            ? 'j > i + 1 and nums[j] == nums[j - 1]?  j = i + 1 → false'
            : `j > i + 1 and nums[j] == nums[j - 1]?  ${nums[j]} == ${nums[j - 1]} → ${dupJ}`,
        explanation:
          j === i + 1
            ? 'The first second value for this i has no previous one to repeat.'
            : dupJ
              ? `${nums[j]} was already the second value at index ${j - 1}: with nums[${i}] = ${nums[i]} its quadruplets have been found.`
              : `${nums[j]} differs from the previous second value ${nums[j - 1]}, so it can give new quadruplets.`,
        actionLabel: dupJ ? 'Duplicate' : 'New value',
      });
      if (dupJ) {
        push({
          type: 'increment',
          codeRef: 'skip-j',
          variables: vars(),
          ...where(),
          indices: [j],
          tracker: cards({ j: 'current' }),
          message: `continue — skip the repeated ${nums[j]}`,
          explanation: 'Go straight on to the next second index.',
          actionLabel: 'Skip j',
        });
        continue;
      }

      const lowJ = [i, j, j + 1, j + 2];
      const minJ = terms(lowJ);
      const tooBigJ = minJ.total > target;
      push({
        type: 'condition',
        codeRef: 'check-min-j',
        variables: vars({ smallest: minJ.total }),
        ...where(),
        indices: lowJ,
        comparedValues: { val1: minJ.total, val2: target },
        tracker: cards({ i: 'current', j: 'current' }),
        result: tooBigJ ? 'true' : 'false',
        message: `nums[i] + nums[j] + nums[j + 1] + nums[j + 2] > target?  ${minJ.text} = ${minJ.total} > ${target} → ${tooBigJ}`,
        explanation: tooBigJ
          ? `With nums[${i}] and nums[${j}] fixed, even the two next values give ${minJ.total}, more than ${target}. A later j only makes it larger.`
          : `The smallest sum with this i and j is ${minJ.total}, not above ${target}, so a quadruplet may still use them.`,
        actionLabel: tooBigJ ? 'Too large' : 'Can reach',
      });
      if (tooBigJ) {
        push({
          type: 'loop-condition',
          codeRef: 'stop-j',
          variables: vars(),
          ...where(),
          indices: [j],
          tracker: cards(),
          result: 'false',
          message: `break — no quadruplet starting with nums[${i}] = ${nums[i]} can use j = ${j} or later`,
          explanation: 'The values are ascending, so every later second value only makes the sum larger. Move on to the next first value.',
          actionLabel: 'Break',
        });
        continue outer;
      }

      const highJ = [i, j, n - 2, n - 1];
      const maxJ = terms(highJ);
      const tooSmallJ = maxJ.total < target;
      push({
        type: 'condition',
        codeRef: 'check-max-j',
        variables: vars({ largest: maxJ.total }),
        ...where(),
        indices: highJ,
        comparedValues: { val1: maxJ.total, val2: target },
        tracker: cards({ i: 'current', j: 'current' }),
        result: tooSmallJ ? 'true' : 'false',
        message: `nums[i] + nums[j] + nums[n - 2] + nums[n - 1] < target?  ${maxJ.text} = ${maxJ.total} < ${target} → ${tooSmallJ}`,
        explanation: tooSmallJ
          ? `Even with the two largest values the sum is only ${maxJ.total}, less than ${target}. A larger second value may still work, so try the next j.`
          : `With the two largest values the sum reaches ${maxJ.total}, at least ${target}, so the pointers have something to find.`,
        actionLabel: tooSmallJ ? 'Too small' : 'Can reach',
      });
      if (tooSmallJ) {
        push({
          type: 'increment',
          codeRef: 'skip-max-j',
          variables: vars(),
          ...where(),
          indices: [j],
          tracker: cards({ j: 'current' }),
          message: `continue — nums[${j}] = ${nums[j]} is too small to reach ${target} with nums[${i}] = ${nums[i]}`,
          explanation: 'Go straight on to the next second index.',
          actionLabel: 'Skip j',
        });
        continue;
      }

      left = j + 1;
      right = n - 1;
      push({
        type: 'assign',
        codeRef: 'init-pointers',
        variables: vars(),
        ...where(),
        indices: [i, j, left, right],
        tracker: cards({ left: 'changed', right: 'changed' }),
        message: `left = j + 1 = ${left}, right = n - 1 = ${right}`,
        explanation: `Search the values after index ${j} from both ends: nums[${left}] = ${nums[left]} is the smallest, nums[${right}] = ${nums[right]} the largest.`,
        actionLabel: 'Init pointers',
      });

      for (;;) {
        const loopTrue = left < right;
        sum = null;
        push({
          type: 'loop-condition',
          codeRef: 'inner-loop',
          variables: vars(),
          ...where(),
          indices: [...new Set([i, j, left, right])],
          tracker: cards(),
          result: loopTrue ? 'true' : 'false',
          message: `left < right?  ${left} < ${right} → ${loopTrue}`,
          explanation: loopTrue
            ? `There is still a pair to try with nums[${i}] = ${nums[i]} and nums[${j}] = ${nums[j]}.`
            : `The pointers have met: every pair after index ${j} has been ruled in or out.`,
          actionLabel: loopTrue ? 'While TRUE' : 'While FALSE',
        });
        if (!loopTrue) break;

        const [a, b, c, d] = [nums[i], nums[j], nums[left], nums[right]];
        sum = a + b + c + d;
        push({
          type: 'assign',
          codeRef: 'calc-sum',
          variables: vars({ 'nums[i]': a, 'nums[j]': b, 'nums[left]': c, 'nums[right]': d, sum }),
          ...where(),
          indices: [i, j, left, right],
          tracker: cards({ i: 'current', j: 'current', left: 'current', right: 'current', sum: 'changed' }),
          message: `sum = nums[${i}] + nums[${j}] + nums[${left}] + nums[${right}] = ${a} + ${b} + ${c} + ${d} = ${sum}`,
          explanation: `The quadruplet [${a}, ${b}, ${c}, ${d}] is compared with the target ${target} next.`,
          actionLabel: 'Compute sum',
        });

        const hit = sum === target;
        push({
          type: 'condition',
          codeRef: 'check-target',
          variables: vars({ sum }),
          ...where(),
          indices: [i, j, left, right],
          comparedValues: { val1: sum, val2: target },
          tracker: cards({ sum: 'current' }),
          result: hit ? 'true' : 'false',
          message: `sum == target?  ${sum} == ${target} → ${hit}`,
          explanation: hit
            ? `[${a}, ${b}, ${c}, ${d}] sums to ${target}: a quadruplet.`
            : 'Not a quadruplet; whether the sum is below or above the target says which pointer to move.',
          actionLabel: hit ? 'Match' : 'No match',
        });

        if (hit) {
          quads.push([a, b, c, d]);
          used.add(i).add(j).add(left).add(right);
          push({
            type: 'assign',
            codeRef: 'record',
            variables: vars({ quadruplet: fmt([a, b, c, d]) }),
            ...where(),
            indices: [i, j, left, right],
            tracker: cards({ found: 'changed' }),
            message: `result.append([${a}, ${b}, ${c}, ${d}])  (${quads.length} found)`,
            explanation: `Recorded as result[${quads.length - 1}]. Both pointers now move inward, past this pair's values.`,
            actionLabel: 'Record quadruplet',
          });

          left++;
          push({
            type: 'increment',
            codeRef: 'found-left',
            variables: vars(),
            ...where(),
            indices: [left],
            tracker: cards({ left: 'changed' }),
            message: `left++ → left = ${left}`,
            explanation: `nums[${left - 1}] = ${c} has been used with ${a} and ${b}; move on.`,
            actionLabel: 'left++',
          });

          right--;
          push({
            type: 'decrement',
            codeRef: 'found-right',
            variables: vars(),
            ...where(),
            indices: [right],
            tracker: cards({ right: 'changed' }),
            message: `right-- → right = ${right}`,
            explanation: `With ${a}, ${b} and ${c} fixed, only ${d} completes the quadruplet, so nums[${right + 1}] = ${d} is done too.`,
            actionLabel: 'right--',
          });

          for (;;) {
            const repeat = left < right && nums[left] === nums[left - 1];
            push({
              type: 'loop-condition',
              codeRef: 'skip-left-check',
              variables: vars({ ...(left < right ? { 'nums[left]': nums[left], 'nums[left - 1]': nums[left - 1] } : {}) }),
              ...where(),
              indices: left < right ? [left - 1, left] : [],
              tracker: cards(),
              result: repeat ? 'true' : 'false',
              message:
                left < right
                  ? `left < right and nums[left] == nums[left - 1]?  ${nums[left]} == ${nums[left - 1]} → ${repeat}`
                  : `left < right and …?  ${left} < ${right} → false`,
              explanation: repeat
                ? `nums[${left}] = ${nums[left]} repeats the value just used, so it would give the same quadruplet again.`
                : left < right
                  ? `nums[${left}] = ${nums[left]} is a new value for left.`
                  : 'The pointers have met; nothing is left to skip.',
              actionLabel: repeat ? 'Repeat' : 'No repeat',
            });
            if (!repeat) break;
            left++;
            push({
              type: 'increment',
              codeRef: 'skip-left',
              variables: vars(),
              ...where(),
              indices: [left],
              tracker: cards({ left: 'changed' }),
              message: `left++ → left = ${left}  (skip duplicate ${nums[left - 1]})`,
              explanation: `Skip the repeated ${nums[left - 1]}.`,
              actionLabel: 'Skip left',
            });
          }

          for (;;) {
            const repeat = left < right && nums[right] === nums[right + 1];
            push({
              type: 'loop-condition',
              codeRef: 'skip-right-check',
              variables: vars({ ...(left < right ? { 'nums[right]': nums[right], 'nums[right + 1]': nums[right + 1] } : {}) }),
              ...where(),
              indices: left < right ? [right, right + 1] : [],
              tracker: cards(),
              result: repeat ? 'true' : 'false',
              message:
                left < right
                  ? `left < right and nums[right] == nums[right + 1]?  ${nums[right]} == ${nums[right + 1]} → ${repeat}`
                  : `left < right and …?  ${left} < ${right} → false`,
              explanation: repeat
                ? `nums[${right}] = ${nums[right]} repeats the value just used, so it would give the same quadruplet again.`
                : left < right
                  ? `nums[${right}] = ${nums[right]} is a new value for right.`
                  : 'The pointers have met; nothing is left to skip.',
              actionLabel: repeat ? 'Repeat' : 'No repeat',
            });
            if (!repeat) break;
            right--;
            push({
              type: 'decrement',
              codeRef: 'skip-right',
              variables: vars(),
              ...where(),
              indices: [right],
              tracker: cards({ right: 'changed' }),
              message: `right-- → right = ${right}  (skip duplicate ${nums[right + 1]})`,
              explanation: `Skip the repeated ${nums[right + 1]}.`,
              actionLabel: 'Skip right',
            });
          }
          continue;
        }

        const less = sum < target;
        push({
          type: 'condition',
          codeRef: 'check-less',
          variables: vars({ sum }),
          ...where(),
          indices: [i, j, left, right],
          comparedValues: { val1: sum, val2: target },
          tracker: cards({ sum: 'current' }),
          result: less ? 'true' : 'false',
          message: `sum < target?  ${sum} < ${target} → ${less ? 'true — move left' : 'false — move right'}`,
          explanation: less
            ? `${sum} is too small. A larger value at left (the array is ascending) raises the sum.`
            : `${sum} is too large. A smaller value at right lowers the sum.`,
          actionLabel: less ? 'Too small' : 'Too large',
        });

        if (less) {
          left++;
          push({
            type: 'increment',
            codeRef: 'move-left',
            variables: vars(),
            ...where(),
            indices: [left],
            tracker: cards({ left: 'changed' }),
            message: `left++ → left = ${left}`,
            explanation: `Every pair using nums[${left - 1}] = ${c} with this right value is too small, so drop it.`,
            actionLabel: 'left++',
          });
        } else {
          right--;
          push({
            type: 'decrement',
            codeRef: 'move-right',
            variables: vars(),
            ...where(),
            indices: [right],
            tracker: cards({ right: 'changed' }),
            message: `right-- → right = ${right}`,
            explanation: `Every pair using nums[${right + 1}] = ${d} with this left value is too large, so drop it.`,
            actionLabel: 'right--',
          });
        }
      }
    }
  }

  j = null;
  left = null;
  right = null;
  sum = null;
  const any = quads.length > 0;
  const list = quads.map(fmt).join(', ');
  const usedIndices = [...used].sort((x, y) => x - y);
  push({
    type: any ? 'found' : 'not-found',
    codeRef: 'return',
    variables: { n, target, found: quads.length },
    indices: usedIndices,
    sortedIndices: usedIndices,
    tracker: cards({ found: 'current' }),
    message: any ? `Return ${plural(quads.length)}: [${list}]` : `Return [] — no quadruplet sums to ${target}`,
    explanation: any
      ? `Each quadruplet sums to ${target} and none is repeated. The highlighted bars are the sorted values they use.`
      : n < 4
        ? `A quadruplet needs four values; this array has ${n}.`
        : `No four values of the array sum to ${target}.`,
    actionLabel: any ? 'Quadruplets found' : 'None found',
  });

  push({
    type: 'complete',
    codeRef: 'return',
    variables: { n, target, found: quads.length },
    sortedIndices: usedIndices,
    tracker: cards(),
    outcomeText: any ? `${plural(quads.length)} sum${quads.length === 1 ? 's' : ''} to ${target}: [${list}]` : `No quadruplet sums to ${target}`,
    message: any ? `Done — [${list}]` : 'Done — no quadruplet',
    explanation:
      'Sorting takes O(n log n); each pair of fixed values is followed by one two-pointer pass, O(n), so O(n³) in all. Besides the sorted copy and the result, only four indices are kept.',
    actionLabel: 'Complete',
  });

  return steps;
}

export const fourSumDefinition: AlgorithmDefinition = {
  id: 'four-sum',
  name: '4Sum',
  category: 'ARRAYS',
  subtitle: 'Sort, fix two values, and close in on the other two with two pointers.',
  description:
    '4Sum (LeetCode 18) returns every unique quadruplet of values, at four different indices, that sums to a target. Sorting a copy lets each pair of fixed values nums[i], nums[j] be completed by two pointers moving towards each other, steered by comparing the sum with the target; equal values are skipped at every level so no quadruplet appears twice, and a fixed value is skipped, or the search cut short, when the smallest or largest sum it allows cannot reach the target.',
  complexity: {
    best: 'O(n log n)',
    average: 'O(n³)',
    worst: 'O(n³)',
    space: 'O(n)',
    bestFor: 'All target-sum quadruplets without duplicates',
  },
  defaultInput: [1, 0, -1, 0, -2, 2],
  inputSpec: {
    target: { label: 'Target sum', hint: 'Find every unique set of four values that adds up to this', defaultValue: FOUR_SUM_DEFAULT_TARGET },
    // Randomize mixes negative and positive values so that quadruplets summing to the target exist
    randomValues: [-9, 9],
  },
  positionPointers: ['i', 'j', 'left', 'right'],

  code: {
    c: `#include <stdlib.h>
#include <string.h>

typedef struct { int a, b, c, d; } Quadruplet;

static int ascending(const void *x, const void *y) {
    int a = *(const int *)x, b = *(const int *)y;
    return (a > b) - (a < b);
}

/* writes the quadruplets to out (room for n * n * n is always enough); returns how many */
int fourSum(const int input[], int n, int target, Quadruplet out[]) {
    int *nums = malloc((n > 0 ? n : 1) * sizeof(int));
    memcpy(nums, input, n * sizeof(int));
    qsort(nums, n, sizeof(int), ascending);
    int count = 0;
    for (int i = 0; i < n - 3; i++) {
        if (i > 0 && nums[i] == nums[i - 1]) continue;
        if ((long long)nums[i] + nums[i + 1] + nums[i + 2] + nums[i + 3] > target) break;
        if ((long long)nums[i] + nums[n - 3] + nums[n - 2] + nums[n - 1] < target) continue;
        for (int j = i + 1; j < n - 2; j++) {
            if (j > i + 1 && nums[j] == nums[j - 1]) continue;
            if ((long long)nums[i] + nums[j] + nums[j + 1] + nums[j + 2] > target) break;
            if ((long long)nums[i] + nums[j] + nums[n - 2] + nums[n - 1] < target) continue;
            int left = j + 1, right = n - 1;
            while (left < right) {
                long long sum = (long long)nums[i] + nums[j] + nums[left] + nums[right];
                if (sum == target) {
                    out[count++] = (Quadruplet){ nums[i], nums[j], nums[left], nums[right] };
                    left++;
                    right--;
                    while (left < right && nums[left] == nums[left - 1]) left++;
                    while (left < right && nums[right] == nums[right + 1]) right--;
                } else if (sum < target) {
                    left++;
                } else {
                    right--;
                }
            }
        }
    }
    free(nums);
    return count;
}`,
    cpp: `vector<vector<int>> fourSum(const vector<int>& input, int target) {
    vector<int> nums(input);  // a copy: the caller's array is unchanged
    sort(nums.begin(), nums.end());
    int n = nums.size();
    vector<vector<int>> result;
    for (int i = 0; i < n - 3; i++) {
        if (i > 0 && nums[i] == nums[i - 1]) continue;
        if ((long long)nums[i] + nums[i + 1] + nums[i + 2] + nums[i + 3] > target) break;
        if ((long long)nums[i] + nums[n - 3] + nums[n - 2] + nums[n - 1] < target) continue;
        for (int j = i + 1; j < n - 2; j++) {
            if (j > i + 1 && nums[j] == nums[j - 1]) continue;
            if ((long long)nums[i] + nums[j] + nums[j + 1] + nums[j + 2] > target) break;
            if ((long long)nums[i] + nums[j] + nums[n - 2] + nums[n - 1] < target) continue;
            int left = j + 1, right = n - 1;
            while (left < right) {
                long long sum = (long long)nums[i] + nums[j] + nums[left] + nums[right];
                if (sum == target) {
                    result.push_back({nums[i], nums[j], nums[left], nums[right]});
                    left++;
                    right--;
                    while (left < right && nums[left] == nums[left - 1]) left++;
                    while (left < right && nums[right] == nums[right + 1]) right--;
                } else if (sum < target) {
                    left++;
                } else {
                    right--;
                }
            }
        }
    }
    return result;
}`,
    java: `import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class FourSum {
    public static List<List<Integer>> fourSum(int[] input, int target) {
        int[] nums = input.clone();  // a copy: the caller's array is unchanged
        Arrays.sort(nums);
        int n = nums.length;
        List<List<Integer>> result = new ArrayList<>();
        for (int i = 0; i < n - 3; i++) {
            if (i > 0 && nums[i] == nums[i - 1]) continue;
            if ((long) nums[i] + nums[i + 1] + nums[i + 2] + nums[i + 3] > target) break;
            if ((long) nums[i] + nums[n - 3] + nums[n - 2] + nums[n - 1] < target) continue;
            for (int j = i + 1; j < n - 2; j++) {
                if (j > i + 1 && nums[j] == nums[j - 1]) continue;
                if ((long) nums[i] + nums[j] + nums[j + 1] + nums[j + 2] > target) break;
                if ((long) nums[i] + nums[j] + nums[n - 2] + nums[n - 1] < target) continue;
                int left = j + 1, right = n - 1;
                while (left < right) {
                    long sum = (long) nums[i] + nums[j] + nums[left] + nums[right];
                    if (sum == target) {
                        result.add(Arrays.asList(nums[i], nums[j], nums[left], nums[right]));
                        left++;
                        right--;
                        while (left < right && nums[left] == nums[left - 1]) left++;
                        while (left < right && nums[right] == nums[right + 1]) right--;
                    } else if (sum < target) {
                        left++;
                    } else {
                        right--;
                    }
                }
            }
        }
        return result;
    }
}`,
    python: `def four_sum(nums, target):
    nums = list(nums)  # a copy: the caller's list is unchanged
    nums.sort()
    n = len(nums)
    result = []
    for i in range(n - 3):
        if i > 0 and nums[i] == nums[i - 1]:
            continue
        if nums[i] + nums[i + 1] + nums[i + 2] + nums[i + 3] > target:
            break
        if nums[i] + nums[n - 3] + nums[n - 2] + nums[n - 1] < target:
            continue
        for j in range(i + 1, n - 2):
            if j > i + 1 and nums[j] == nums[j - 1]:
                continue
            if nums[i] + nums[j] + nums[j + 1] + nums[j + 2] > target:
                break
            if nums[i] + nums[j] + nums[n - 2] + nums[n - 1] < target:
                continue
            left, right = j + 1, n - 1
            while left < right:
                total = nums[i] + nums[j] + nums[left] + nums[right]
                if total == target:
                    result.append([nums[i], nums[j], nums[left], nums[right]])
                    left += 1
                    right -= 1
                    while left < right and nums[left] == nums[left - 1]:
                        left += 1
                    while left < right and nums[right] == nums[right + 1]:
                        right -= 1
                elif total < target:
                    left += 1
                else:
                    right -= 1
    return result`,
  },

  // C++ and Java share one layout (Java five lines lower, for its imports and class); C has its helpers first and no
  // separate n. In the C-family listings `continue`, `break` and the duplicate-skipping increments sit on their
  // condition's line; Python gives each its own line.
  lineMap: {
    c: {
      'fn-entry': 12, copy: 14, sort: 15, 'init-result': 16, 'outer-loop': 17, 'check-dup-i': 18, 'skip-i': 18,
      'check-min-i': 19, 'stop-i': 19, 'check-max-i': 20, 'skip-max-i': 20, 'j-loop': 21, 'check-dup-j': 22, 'skip-j': 22,
      'check-min-j': 23, 'stop-j': 23, 'check-max-j': 24, 'skip-max-j': 24, 'init-pointers': 25, 'inner-loop': 26,
      'calc-sum': 27, 'check-target': 28, record: 29, 'found-left': 30, 'found-right': 31, 'skip-left-check': 32,
      'skip-left': 32, 'skip-right-check': 33, 'skip-right': 33, 'check-less': 34, 'move-left': 35, 'move-right': 37,
      return: 43,
    },
    cpp: {
      'fn-entry': 1, copy: 2, sort: 3, 'init-result': 5, 'outer-loop': 6, 'check-dup-i': 7, 'skip-i': 7,
      'check-min-i': 8, 'stop-i': 8, 'check-max-i': 9, 'skip-max-i': 9, 'j-loop': 10, 'check-dup-j': 11, 'skip-j': 11,
      'check-min-j': 12, 'stop-j': 12, 'check-max-j': 13, 'skip-max-j': 13, 'init-pointers': 14, 'inner-loop': 15,
      'calc-sum': 16, 'check-target': 17, record: 18, 'found-left': 19, 'found-right': 20, 'skip-left-check': 21,
      'skip-left': 21, 'skip-right-check': 22, 'skip-right': 22, 'check-less': 23, 'move-left': 24, 'move-right': 26,
      return: 31,
    },
    java: {
      'fn-entry': 6, copy: 7, sort: 8, 'init-result': 10, 'outer-loop': 11, 'check-dup-i': 12, 'skip-i': 12,
      'check-min-i': 13, 'stop-i': 13, 'check-max-i': 14, 'skip-max-i': 14, 'j-loop': 15, 'check-dup-j': 16, 'skip-j': 16,
      'check-min-j': 17, 'stop-j': 17, 'check-max-j': 18, 'skip-max-j': 18, 'init-pointers': 19, 'inner-loop': 20,
      'calc-sum': 21, 'check-target': 22, record: 23, 'found-left': 24, 'found-right': 25, 'skip-left-check': 26,
      'skip-left': 26, 'skip-right-check': 27, 'skip-right': 27, 'check-less': 28, 'move-left': 29, 'move-right': 31,
      return: 36,
    },
    python: {
      'fn-entry': 1, copy: 2, sort: 3, 'init-result': 5, 'outer-loop': 6, 'check-dup-i': 7, 'skip-i': 8,
      'check-min-i': 9, 'stop-i': 10, 'check-max-i': 11, 'skip-max-i': 12, 'j-loop': 13, 'check-dup-j': 14, 'skip-j': 15,
      'check-min-j': 16, 'stop-j': 17, 'check-max-j': 18, 'skip-max-j': 19, 'init-pointers': 20, 'inner-loop': 21,
      'calc-sum': 22, 'check-target': 23, record: 24, 'found-left': 25, 'found-right': 26, 'skip-left-check': 27,
      'skip-left': 28, 'skip-right-check': 29, 'skip-right': 30, 'check-less': 31, 'move-left': 32, 'move-right': 34,
      return: 35,
    },
  },
  // the result starts with n beside it (C takes n as a parameter); C allocates the copy before filling it, and frees it
  // before returning the count
  lineLeads: {
    c: { copy: 1, return: 1 },
    cpp: { 'init-result': 1 },
    java: { 'init-result': 1 },
    python: { 'init-result': 1 },
  },

  generateSteps: generateFourSumSteps,
};
