import type { AlgorithmDefinition, ContainerSpan, ExecutionStep, NumberCell } from '../../types/algorithm';

/**
 * Container With Most Water, two pointers. The container between `left` and `right` holds
 * min(height[left], height[right]) × (right - left). The shorter line limits every container that keeps it and moves
 * the other end inward (narrower, never taller), so that line is dropped: its pointer moves. On equal heights the
 * right pointer moves (`else right--`). It ends when the pointers meet, after n - 1 containers.
 */
function generateContainerSteps(input: number[]): ExecutionStep[] {
  const height = [...input];
  const n = height.length;
  // the UI validates this (inputSpec: at least 2 values, none negative); a direct call with anything else is refused
  if (n < 2 || height.some(h => !Number.isInteger(h) || h < 0)) {
    throw new RangeError('Container With Most Water needs at least two whole-number heights, none negative.');
  }

  const steps: ExecutionStep[] = [];
  const push = (s: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [...height], ...s });

  let left = 0;
  let right = n - 1;
  // best starts as the outermost pair with area 0, exactly as `best = {0, left, right}` in every listing
  let best = { area: 0, left, right };
  let bestSpan: ContainerSpan | undefined;
  let width: number | null = null;
  let h: number | null = null;
  let area: number | null = null;

  type Roles = Record<string, NumberCell['role']>;
  const cards = (roles: Roles = {}): NumberCell[] => [
    { name: 'width', value: width, role: roles.width },
    { name: 'h', value: h, role: roles.h },
    { name: 'area', value: area, role: roles.area },
    { name: 'maxArea', value: best.area, role: roles.maxArea },
    { name: 'bestLeft', value: best.left, role: roles.best },
    { name: 'bestRight', value: best.right, role: roles.best },
  ];
  const span = (l: number, r: number): ContainerSpan => {
    const level = Math.min(height[l], height[r]);
    return { left: l, right: r, level, area: level * (r - l) };
  };
  /** the pair being looked at, drawn once its area is known (from the area step on), and the best so far */
  const view = (withCurrent: boolean) => ({ current: withCurrent ? span(left, right) : undefined, best: bestSpan });
  const at = () => ({ pointers: { left, right }, indices: [left, right] });

  push({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n },
    tracker: cards(),
    message: `Container With Most Water: ${n} lines — which two hold the most water?`,
    explanation:
      'A container is two lines and the x-axis; it holds (distance between the lines) × (the shorter line). Two pointers start at both ends and move inward.',
    actionLabel: 'Initialize',
  });

  push({
    type: 'assign',
    codeRef: 'init',
    variables: { left, right, maxArea: 0 },
    ...at(),
    tracker: cards({ maxArea: 'changed', best: 'changed' }),
    container: view(false),
    message: `left = 0, right = ${right}, best = (area 0, [0, ${right}])`,
    explanation: 'The widest container comes first. Nothing has been measured yet, so the best area is 0.',
    actionLabel: 'Init pointers',
  });

  for (;;) {
    const inLoop = left < right;
    width = h = area = null;
    push({
      type: 'loop-condition',
      codeRef: 'while-condition',
      variables: { left, right },
      ...(inLoop ? at() : { pointers: { left, right }, indices: [left] }),
      tracker: cards(),
      container: view(false),
      result: inLoop ? 'true' : 'false',
      message: `left < right?  ${left} < ${right} → ${inLoop}`,
      explanation: inLoop
        ? `Lines ${left} and ${right} form the next container.`
        : `The pointers have met: every pair that could beat the best has been measured (${n - 1} containers in all).`,
      actionLabel: inLoop ? 'While TRUE' : 'While FALSE',
    });
    if (!inLoop) break;

    width = right - left;
    push({
      type: 'assign',
      codeRef: 'calc-width',
      variables: { left, right, width },
      ...at(),
      tracker: cards({ width: 'changed' }),
      container: view(false),
      message: `width = right - left = ${right} - ${left} = ${width}`,
      explanation: `The lines are ${width} apart.`,
      actionLabel: 'Width',
    });

    h = Math.min(height[left], height[right]);
    push({
      type: 'assign',
      codeRef: 'calc-height',
      variables: { 'height[left]': height[left], 'height[right]': height[right], h },
      ...at(),
      comparedValues: { val1: height[left], val2: height[right] },
      tracker: cards({ h: 'changed', width: 'current' }),
      container: view(false),
      message: `h = min(height[${left}], height[${right}]) = min(${height[left]}, ${height[right]}) = ${h}`,
      explanation: `Water rises only to the shorter line, ${h}.`,
      actionLabel: 'Water level',
    });

    area = h * width;
    push({
      type: 'assign',
      codeRef: 'calc-area',
      variables: { width, h, area },
      ...at(),
      tracker: cards({ area: 'changed', width: 'current', h: 'current' }),
      container: view(true),
      message: `area = h × width = ${h} × ${width} = ${area}`,
      explanation: `This container holds ${area}.`,
      actionLabel: 'Area',
    });

    const better = area > best.area;
    push({
      type: 'condition',
      codeRef: 'check-best',
      variables: { area, maxArea: best.area },
      ...at(),
      comparedValues: { val1: area, val2: best.area },
      tracker: cards({ area: 'current', maxArea: 'current' }),
      container: view(true),
      result: better ? 'true' : 'false',
      message: `area > maxArea?  ${area} > ${best.area} → ${better}`,
      explanation: better
        ? `${area} beats the best so far (${best.area}).`
        : area === best.area
          ? `${area} only ties the best so far; the first pair found with this area is kept.`
          : `${area} is less than the best so far (${best.area}).`,
      actionLabel: better ? 'Condition TRUE' : 'Condition FALSE',
    });

    if (better) {
      best = { area, left, right };
      bestSpan = span(left, right);
      push({
        type: 'update',
        codeRef: 'update-best',
        variables: { maxArea: area, bestLeft: left, bestRight: right },
        ...at(),
        tracker: cards({ maxArea: 'changed', best: 'changed' }),
        container: view(true),
        message: `best = (area ${area}, [${left}, ${right}])`,
        explanation: `The best container so far: lines ${left} and ${right}, holding ${area}.`,
        actionLabel: 'New best',
      });
    }

    const leftShorter = height[left] < height[right];
    const equal = height[left] === height[right];
    push({
      type: 'condition',
      codeRef: 'compare-heights',
      variables: { 'height[left]': height[left], 'height[right]': height[right] },
      ...at(),
      comparedValues: { val1: height[left], val2: height[right] },
      tracker: cards(),
      container: view(true),
      result: leftShorter ? 'true' : 'false',
      message: `height[left] < height[right]?  ${height[left]} < ${height[right]} → ${leftShorter}`,
      explanation: leftShorter
        ? `The left line (${height[left]}) is shorter. Any other container that keeps it is narrower and still at most ${height[left]} tall, so none can beat ${area}: drop the left line.`
        : equal
          ? `Both lines are ${h} tall. Any container that keeps either of them and moves the other end inward is narrower and at most ${h} tall, so either line can go; this code moves right.`
          : `The right line (${height[right]}) is shorter. Any other container that keeps it is narrower and still at most ${height[right]} tall, so none can beat ${area}: drop the right line.`,
      actionLabel: leftShorter ? 'Left is shorter' : equal ? 'Equal heights' : 'Right is shorter',
    });

    if (leftShorter) left++;
    else right--;
    width = h = area = null;
    push({
      type: leftShorter ? 'increment' : 'decrement',
      codeRef: leftShorter ? 'move-left' : 'move-right',
      variables: { left, right },
      ...(left < right ? at() : { pointers: { left, right }, indices: [left] }),
      tracker: cards(),
      container: view(false),
      message: leftShorter ? `left++ → left = ${left}` : `right-- → right = ${right}`,
      explanation: leftShorter
        ? `The left pointer moves inward to line ${left} (height ${height[left]}).`
        : `The right pointer moves inward to line ${right} (height ${height[right]}).`,
      actionLabel: leftShorter ? 'left++' : 'right--',
    });
  }

  const winner = span(best.left, best.right);
  push({
    type: 'found',
    codeRef: 'return',
    variables: { maxArea: best.area, bestLeft: best.left, bestRight: best.right },
    pointers: { left: best.left, right: best.right },
    indices: [best.left, best.right],
    sortedIndices: [best.left, best.right],
    tracker: cards({ maxArea: 'current', best: 'current' }),
    container: { best: winner },
    message: `Return maxArea = ${best.area} (lines ${best.left} and ${best.right})`,
    explanation:
      best.area === 0
        ? 'Every container holds 0 (a line of height 0 is on one end of each); the outermost pair is reported.'
        : `Lines ${best.left} and ${best.right} (heights ${height[best.left]} and ${height[best.right]}, ${best.right - best.left} apart) hold the most water.`,
    actionLabel: 'Max area',
  });

  push({
    type: 'complete',
    codeRef: 'return',
    variables: { maxArea: best.area },
    sortedIndices: [best.left, best.right],
    tracker: cards(),
    container: { best: winner },
    outcomeText: `Max area ${best.area}: lines ${best.left} and ${best.right} (min(${height[best.left]}, ${height[best.right]}) × ${best.right - best.left})`,
    message: `Done — max area ${best.area}`,
    explanation: `One container per pointer move: ${n - 1} containers instead of all ${(n * (n - 1)) / 2} pairs, so O(n) time; only the pointers and the best are kept, so O(1) extra space.`,
    actionLabel: 'Complete',
  });

  return steps;
}

export const containerMostWaterDefinition: AlgorithmDefinition = {
  id: 'container-most-water',
  name: 'Container With Most Water',
  category: 'ARRAYS',
  subtitle: 'Two pointers move the shorter line inward to find the largest container in O(n).',
  description:
    'Given line heights, find two lines that hold the most water: (distance between them) × (the shorter line). Two pointers start at both ends; the shorter line can never be part of a larger container with a closer partner, so its pointer moves inward.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    bestFor: 'Maximising width × limiting height over pairs, in one pass',
  },
  defaultInput: [1, 8, 6, 2, 5, 4, 8, 3, 7],
  inputSpec: { minLength: 2, minValue: 0 },
  positionPointers: ['left', 'right'],

  code: {
    c: `typedef struct { int area, left, right; } Result;

Result maxArea(const int height[], int n) {
    int left = 0, right = n - 1;
    Result best = { 0, left, right };
    while (left < right) {
        int width = right - left;
        int h = height[left] < height[right] ? height[left] : height[right];
        int area = h * width;
        if (area > best.area)
            best = (Result){ area, left, right };
        if (height[left] < height[right])
            left++;
        else
            right--;
    }
    return best;
}`,
    cpp: `struct Result { int area, left, right; };

Result maxArea(const vector<int>& height) {
    int left = 0, right = (int)height.size() - 1;
    Result best = {0, left, right};
    while (left < right) {
        int width = right - left;
        int h = min(height[left], height[right]);
        int area = h * width;
        if (area > best.area)
            best = {area, left, right};
        if (height[left] < height[right])
            left++;
        else
            right--;
    }
    return best;
}`,
    java: `public class ContainerWithMostWater {
    /** returns { maxArea, bestLeft, bestRight } */
    public static int[] maxArea(int[] height) {
        int left = 0, right = height.length - 1;
        int[] best = { 0, left, right };
        while (left < right) {
            int width = right - left;
            int h = Math.min(height[left], height[right]);
            int area = h * width;
            if (area > best[0])
                best = new int[] { area, left, right };
            if (height[left] < height[right])
                left++;
            else
                right--;
        }
        return best;
    }
}`,
    python: `def max_area(height):
    left, right = 0, len(height) - 1
    best = (0, left, right)  # (area, left, right)
    while left < right:
        width = right - left
        h = min(height[left], height[right])
        area = h * width
        if area > best[0]:
            best = (area, left, right)
        if height[left] < height[right]:
            left += 1
        else:
            right -= 1
    return best`,
  },

  // C, C++ and Java share one layout; Python has no struct and no braces
  lineMap: {
    c: { 'fn-entry': 3, init: 4, 'while-condition': 6, 'calc-width': 7, 'calc-height': 8, 'calc-area': 9, 'check-best': 10, 'update-best': 11, 'compare-heights': 12, 'move-left': 13, 'move-right': 15, return: 17 },
    cpp: { 'fn-entry': 3, init: 4, 'while-condition': 6, 'calc-width': 7, 'calc-height': 8, 'calc-area': 9, 'check-best': 10, 'update-best': 11, 'compare-heights': 12, 'move-left': 13, 'move-right': 15, return: 17 },
    java: { 'fn-entry': 3, init: 4, 'while-condition': 6, 'calc-width': 7, 'calc-height': 8, 'calc-area': 9, 'check-best': 10, 'update-best': 11, 'compare-heights': 12, 'move-left': 13, 'move-right': 15, return: 17 },
    python: { 'fn-entry': 1, init: 2, 'while-condition': 4, 'calc-width': 5, 'calc-height': 6, 'calc-area': 7, 'check-best': 8, 'update-best': 9, 'compare-heights': 10, 'move-left': 11, 'move-right': 13, return: 14 },
  },

  // setting the pointers and the best pair is one step, written on two lines in every language
  lineSpans: {
    c: { init: 2 },
    cpp: { init: 2 },
    java: { init: 2 },
    python: { init: 2 },
  },

  generateSteps: generateContainerSteps,
};
