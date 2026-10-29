import type { AlgorithmDefinition, ExecutionStep, NumberCell } from '../../types/algorithm';

/**
 * Trapping Rain Water, two pointers. The water above bar i is min(highest bar on its left, highest on its right) −
 * height[i]. With `left` and `right` moving inward and leftMax / rightMax the highest bars passed on each side: when
 * height[left] < height[right], the right side already has a bar taller than height[left], so the lower of the two
 * maxima around `left` is leftMax — its water is decided by the left side alone, and `left` moves. Otherwise the same
 * holds for `right`. Each bar is decided once: O(n) time, O(1) extra space.
 */
function generateTrapSteps(input: number[]): ExecutionStep[] {
  const height = [...input];
  const n = height.length;
  // the UI validates this (inputSpec: no negative height); a direct call with anything else is refused
  if (height.some(h => !Number.isInteger(h) || h < 0)) {
    throw new RangeError('Trapping Rain Water needs whole-number heights, none negative.');
  }

  const steps: ExecutionStep[] = [];
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [...height], ...s });

  let left: number | null = null;
  let right: number | null = null;
  let leftMax: number | null = null;
  let rightMax: number | null = null;
  let water: number | null = null;
  // water decided above each bar (0 until decided, and 0 where none)
  const amounts: number[] = Array(n).fill(0);
  let here: number | null = null;

  type Roles = Partial<Record<'leftMax' | 'rightMax' | 'here' | 'water', NumberCell['role']>>;
  const cards = (roles: Roles = {}): NumberCell[] => [
    { name: 'leftMax', value: leftMax, role: roles.leftMax },
    { name: 'rightMax', value: rightMax, role: roles.rightMax },
    { name: 'trapped here', value: here, role: roles.here },
    { name: 'water', value: water, role: roles.water },
  ];
  const pointers = () => ({ ...(left !== null ? { left } : {}), ...(right !== null ? { right } : {}) });
  const waterView = (current?: number) => ({ amounts: [...amounts], ...(current !== undefined ? { current } : {}) });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n },
    tracker: cards(),
    water: waterView(),
    message: `Trapping Rain Water: ${n} bar${n === 1 ? '' : 's'} — how much rain stays between them?`,
    explanation:
      'Above each bar, water rises to the lower of the highest bar on its left and the highest bar on its right. Two pointers decide one bar per step from the outside in.',
    actionLabel: 'Initialize',
  });

  left = 0;
  right = n - 1;
  push({
    type: 'assign',
    codeRef: 'init-pointers',
    variables: { left, right },
    pointers: pointers(),
    tracker: cards(),
    water: waterView(),
    message: `left = 0, right = ${right}`,
    explanation: 'left starts at the first bar, right at the last.',
    actionLabel: 'Pointers',
  });

  leftMax = 0;
  rightMax = 0;
  water = 0;
  push({
    type: 'assign',
    codeRef: 'init-max',
    variables: { leftMax, rightMax, water },
    pointers: pointers(),
    tracker: cards({ leftMax: 'changed', rightMax: 'changed', water: 'changed' }),
    water: waterView(),
    message: 'leftMax = 0, rightMax = 0, water = 0',
    explanation: 'leftMax and rightMax are the highest bars passed so far on each side; water is the running total.',
    actionLabel: 'Init',
  });

  for (;;) {
    here = null;
    const go = left < right;
    push({
      type: 'loop-condition',
      codeRef: 'loop',
      variables: { left, right },
      pointers: pointers(),
      indices: go ? [left, right] : [],
      tracker: cards(),
      water: waterView(),
      result: go ? 'true' : 'false',
      message: `left < right?  ${left} < ${right} → ${go}`,
      explanation: go
        ? `Bars ${left} … ${right} are still undecided.`
        : n === 0
          ? 'There are no bars.'
          : `The pointers have met at bar ${Math.min(left, n - 1)}: it is the highest bar seen, so it holds no water. Every bar is decided.`,
      actionLabel: go ? 'Continue' : 'Pointers met',
    });
    if (!go) break;

    const leftLower = height[left] < height[right];
    push({
      type: 'compare',
      codeRef: 'compare-heights',
      variables: { left, right, 'height[left]': height[left], 'height[right]': height[right] },
      pointers: pointers(),
      indices: [left, right],
      comparedValues: { val1: height[left], val2: height[right] },
      tracker: cards(),
      water: waterView(),
      result: leftLower ? 'true' : 'false',
      message: `height[left] < height[right]?  ${height[left]} < ${height[right]} → ${leftLower}`,
      explanation: leftLower
        ? `The right side already has a bar of ${height[right]}, taller than bar ${left}. So the water at bar ${left} is limited by the left side only: it rises to leftMax. Decide bar ${left}.`
        : `The left side already has a bar of ${height[left]}, at least as tall as bar ${right}. So the water at bar ${right} is limited by the right side only: it rises to rightMax. Decide bar ${right}.`,
      actionLabel: leftLower ? 'Decide left' : 'Decide right',
    });

    const side = leftLower ? 'left' : 'right';
    const i = leftLower ? left : right;
    const max = leftLower ? leftMax : rightMax;
    const maxName = leftLower ? 'leftMax' : 'rightMax';
    const taller = height[i] >= max;
    push({
      type: 'condition',
      codeRef: `check-${side}-max`,
      variables: { [side]: i, [`height[${side}]`]: height[i], [maxName]: max },
      pointers: pointers(),
      indices: [i],
      tracker: cards({ [maxName]: 'current' } as Roles),
      water: waterView(i),
      result: taller ? 'true' : 'false',
      message: `height[${side}] >= ${maxName}?  ${height[i]} >= ${max} → ${taller}`,
      explanation: taller
        ? `Bar ${i} is at least as high as every bar before it on its side: water would run off over it. It holds nothing and becomes the new ${maxName}.`
        : `Bar ${i} is lower than ${maxName} = ${max}: water fills up to ${max} above it.`,
      actionLabel: taller ? `New ${maxName}` : 'Holds water',
    });

    if (taller) {
      if (leftLower) leftMax = height[i];
      else rightMax = height[i];
      here = 0;
      push({
        type: 'assign',
        codeRef: `update-${side}-max`,
        variables: { [maxName]: height[i] },
        pointers: pointers(),
        indices: [i],
        tracker: cards({ [maxName]: 'changed', here: 'changed' } as Roles),
        water: waterView(i),
        message: `${maxName} = height[${side}] = ${height[i]}`,
        explanation: `Bar ${i} traps no water.`,
        actionLabel: `${maxName} = ${height[i]}`,
      });
    } else {
      here = max - height[i];
      amounts[i] = here;
      const before = water;
      water += here;
      push({
        type: 'update',
        codeRef: `add-${side}-water`,
        variables: { water, [maxName]: max, [`height[${side}]`]: height[i] },
        pointers: pointers(),
        indices: [i],
        tracker: cards({ here: 'changed', water: 'changed' }),
        water: waterView(i),
        message: `water += ${maxName} - height[${side}]  →  ${before} + (${max} - ${height[i]}) = ${water}`,
        explanation: `Bar ${i} holds ${here} unit${here === 1 ? '' : 's'} of water.`,
        actionLabel: `+${here} water`,
      });
    }

    if (leftLower) left++;
    else right--;
    push({
      type: leftLower ? 'increment' : 'decrement',
      codeRef: `move-${side}`,
      variables: { left, right },
      pointers: pointers(),
      tracker: cards(),
      water: waterView(),
      message: leftLower ? `left = ${left}` : `right = ${right}`,
      explanation: `Bar ${i} is decided; move ${side} inward.`,
      actionLabel: leftLower ? 'left++' : 'right--',
    });
  }

  push({
    type: 'complete',
    codeRef: 'return',
    variables: { water },
    tracker: cards({ water: 'current' }),
    water: waterView(),
    outcomeText: `Trapped water: ${water} unit${water === 1 ? '' : 's'}`,
    message: `Return water = ${water}`,
    explanation: `Each bar was decided once, from the outside in: O(n) time. Only two pointers, two maxima and the total were kept: O(1) extra space.`,
    actionLabel: `Return ${water}`,
  });
  return steps;
}

export const trappingRainWaterDefinition: AlgorithmDefinition = {
  id: 'trapping-rain-water',
  name: 'Trapping Rain Water',
  category: 'ARRAYS',
  subtitle: 'Two pointers decide the lower side’s water, one bar per step.',
  description:
    'Trapping Rain Water (LeetCode 42): given bar heights, how much rain stays between them? Water above a bar rises to the lower of the highest bars on its two sides. Two pointers move inward; the side with the lower current bar is limited by its own running maximum (the other side already has a taller bar), so its water is decided and its pointer moves.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'Water between bars in one pass, without prefix-maximum arrays',
  },
  defaultInput: [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1],
  inputSpec: { minValue: 0 },
  positionPointers: ['left', 'right'],

  code: {
    c: `int trap(const int height[], int n) {
    int left = 0, right = n - 1;
    int leftMax = 0, rightMax = 0;
    int water = 0;
    while (left < right) {
        if (height[left] < height[right]) {
            if (height[left] >= leftMax) {
                leftMax = height[left];
            } else {
                water += leftMax - height[left];
            }
            left++;
        } else {
            if (height[right] >= rightMax) {
                rightMax = height[right];
            } else {
                water += rightMax - height[right];
            }
            right--;
        }
    }
    return water;
}`,
    cpp: `int trap(const vector<int>& height) {
    int left = 0, right = (int)height.size() - 1;
    int leftMax = 0, rightMax = 0;
    int water = 0;
    while (left < right) {
        if (height[left] < height[right]) {
            if (height[left] >= leftMax) {
                leftMax = height[left];
            } else {
                water += leftMax - height[left];
            }
            left++;
        } else {
            if (height[right] >= rightMax) {
                rightMax = height[right];
            } else {
                water += rightMax - height[right];
            }
            right--;
        }
    }
    return water;
}`,
    java: `public class TrappingRainWater {
    public static int trap(int[] height) {
        int left = 0, right = height.length - 1;
        int leftMax = 0, rightMax = 0;
        int water = 0;
        while (left < right) {
            if (height[left] < height[right]) {
                if (height[left] >= leftMax) {
                    leftMax = height[left];
                } else {
                    water += leftMax - height[left];
                }
                left++;
            } else {
                if (height[right] >= rightMax) {
                    rightMax = height[right];
                } else {
                    water += rightMax - height[right];
                }
                right--;
            }
        }
        return water;
    }
}`,
    python: `def trap(height):
    left, right = 0, len(height) - 1
    left_max = right_max = 0
    water = 0
    while left < right:
        if height[left] < height[right]:
            if height[left] >= left_max:
                left_max = height[left]
            else:
                water += left_max - height[left]
            left += 1
        else:
            if height[right] >= right_max:
                right_max = height[right]
            else:
                water += right_max - height[right]
            right -= 1
    return water`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'init-pointers': 2, 'init-max': 3, loop: 5, 'compare-heights': 6, 'check-left-max': 7, 'update-left-max': 8, 'add-left-water': 10, 'move-left': 12, 'check-right-max': 14, 'update-right-max': 15, 'add-right-water': 17, 'move-right': 19, return: 22 },
    cpp: { 'fn-entry': 1, 'init-pointers': 2, 'init-max': 3, loop: 5, 'compare-heights': 6, 'check-left-max': 7, 'update-left-max': 8, 'add-left-water': 10, 'move-left': 12, 'check-right-max': 14, 'update-right-max': 15, 'add-right-water': 17, 'move-right': 19, return: 22 },
    java: { 'fn-entry': 2, 'init-pointers': 3, 'init-max': 4, loop: 6, 'compare-heights': 7, 'check-left-max': 8, 'update-left-max': 9, 'add-left-water': 11, 'move-left': 13, 'check-right-max': 15, 'update-right-max': 16, 'add-right-water': 18, 'move-right': 20, return: 23 },
    python: { 'fn-entry': 1, 'init-pointers': 2, 'init-max': 3, loop: 5, 'compare-heights': 6, 'check-left-max': 7, 'update-left-max': 8, 'add-left-water': 10, 'move-left': 11, 'check-right-max': 13, 'update-right-max': 14, 'add-right-water': 16, 'move-right': 17, return: 18 },
  },
  // the two maxima and the total are set on two lines in every language
  lineSpans: { c: { 'init-max': 2 }, cpp: { 'init-max': 2 }, java: { 'init-max': 2 }, python: { 'init-max': 2 } },

  generateSteps: generateTrapSteps,
};
