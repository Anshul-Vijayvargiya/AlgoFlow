import { describe, it, expect } from 'vitest';
import { containerMostWaterDefinition as cmw } from '../algorithms/containerMostWater';
import { buildExecution } from '../buildExecution';
import { resolveCodeRange, resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateDraft } from '../inputParsing';
import { deriveOutcome } from '../../components/visualizer/barVisuals';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// Container With Most Water, two pointers: width, h = min(...), area, the best so far, and which pointer moves.
const run = (height: number[]) => cmw.generateSteps([...height]);
const result = (steps: ExecutionStep[]) => {
  const v = steps.find(s => s.type === 'found')!.variables!;
  return { area: v.maxArea, left: v.bestLeft, right: v.bestRight };
};
/** an oracle written differently from the generator: every pair, by brute force */
const bruteForceMax = (h: number[]) => {
  let best = 0;
  for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) best = Math.max(best, Math.min(h[i], h[j]) * (j - i));
  return best;
};
const area = (h: number[], l: number, r: number) => Math.min(h[l], h[r]) * (r - l);
const moves = (steps: ExecutionStep[]) => steps.filter(s => s.codeRef === 'move-left' || s.codeRef === 'move-right').map(s => s.codeRef);

describe('Container With Most Water — answers', () => {
  it.each([
    ['the example', [1, 8, 6, 2, 5, 4, 8, 3, 7], 49, 1, 8],
    ['two lines', [1, 1], 1, 0, 1],
    ['equal heights: the outermost pair', [3, 3, 3, 3], 9, 0, 3],
    ['zero heights everywhere', [0, 0, 0], 0, 0, 2],
    ['a zero on one end', [0, 5, 4], 4, 1, 2],
    ['duplicates with a tall pair inside', [1, 9, 2, 9, 1], 18, 1, 3],
    ['increasing', [1, 2, 3, 4, 5], 6, 1, 4],
    ['decreasing', [5, 4, 3, 2, 1], 6, 0, 3],
    ['the best pair at the left end', [9, 9, 1, 1, 1], 9, 0, 1],
    ['the best pair at the right end', [1, 1, 1, 9, 9], 9, 3, 4],
    ['the best pair in the middle', [1, 2, 10, 1, 10, 2, 1], 20, 2, 4],
    ['the largest heights', [999, 0, 999], 1998, 0, 2],
  ])('%s', (_name, h, expectedArea, l, r) => {
    expect(result(run(h as number[]))).toEqual({ area: expectedArea, left: l, right: r });
  });

  it('agrees with checking every pair on 3,000 random arrays (zeros, duplicates, ties)', () => {
    const rng = makeRng(17);
    for (let k = 0; k < 3000; k++) {
      const top = [1, 3, 10, 999][k % 4];
      const h = Array.from({ length: 2 + Math.floor(rng() * 15) }, () => Math.floor(rng() * (top + 1)));
      const got = result(run(h));
      expect(got.area, JSON.stringify(h)).toBe(bruteForceMax(h));
      // the reported pair really holds that much
      expect(area(h, got.left as number, got.right as number), JSON.stringify(h)).toBe(got.area);
    }
  });

  it('a tie keeps the first pair found with the best area (`area > best`, not `>=`)', () => {
    // [2, 2, 1]: (0, 2) holds min(2, 1) × 2 = 2; the right line is shorter, so (0, 1) is next and also holds 2
    const steps = run([2, 2, 1]);
    const checks = steps.filter(s => s.codeRef === 'check-best');
    expect(checks.map(s => [s.variables!.area, s.result])).toEqual([[2, 'true'], [2, 'false']]);
    expect(checks[1].explanation).toBe('2 only ties the best so far; the first pair found with this area is kept.');
    expect(result(steps)).toEqual({ area: 2, left: 0, right: 2 });
  });
});

describe('Container With Most Water — steps', () => {
  it('each iteration: loop check, width, h, area, best?, (new best), which is shorter?, move', () => {
    const steps = run([1, 8, 6]);
    expect(steps.map(s => s.codeRef)).toEqual([
      'fn-entry', 'init',
      'while-condition', 'calc-width', 'calc-height', 'calc-area', 'check-best', 'update-best', 'compare-heights', 'move-left',
      'while-condition', 'calc-width', 'calc-height', 'calc-area', 'check-best', 'update-best', 'compare-heights', 'move-right',
      'while-condition', 'return', 'return',
    ]);
    const [width, h, a] = ['calc-width', 'calc-height', 'calc-area'].map(ref => steps.find(s => s.codeRef === ref)!);
    expect(width.message).toBe('width = right - left = 2 - 0 = 2');
    expect(h.message).toBe('h = min(height[0], height[2]) = min(1, 6) = 1');
    expect(a.message).toBe('area = h × width = 1 × 2 = 2');
  });

  it('the shorter line moves, and the explanation says why; equal heights move right', () => {
    const steps = run([2, 5, 3, 2]);
    // (0,3): equal → right--; (0,2): 2 < 3 → left++; (1,2): 5 > 3 → right--
    expect(moves(steps)).toEqual(['move-right', 'move-left', 'move-right']);
    const compares = steps.filter(s => s.codeRef === 'compare-heights');
    expect(compares[0].actionLabel).toBe('Equal heights');
    expect(compares[0].explanation).toContain('either line can go; this code moves right');
    expect(compares[1].explanation).toBe(
      'The left line (2) is shorter. Any other container that keeps it is narrower and still at most 2 tall, so none can beat 4: drop the left line.'
    );
    expect(compares[2].actionLabel).toBe('Right is shorter');
  });

  it('exactly n - 1 containers are measured, and the pointers end where they meet', () => {
    const rng = makeRng(4);
    for (let k = 0; k < 200; k++) {
      const h = Array.from({ length: 2 + Math.floor(rng() * 15) }, () => Math.floor(rng() * 50));
      const steps = run(h);
      expect(steps.filter(s => s.codeRef === 'calc-area')).toHaveLength(h.length - 1);
      const last = steps.filter(s => s.codeRef === 'while-condition').at(-1)!;
      expect(last.result).toBe('false');
      expect(last.variables!.left).toBe(last.variables!.right);
    }
  });

  it('the container: drawn from the area step until the move, with the best so far alongside', () => {
    const steps = run([1, 8, 6, 2, 5, 4, 8, 3, 7]);
    const areaStep = steps.find(s => s.codeRef === 'calc-area')!;
    expect(areaStep.container).toEqual({ current: { left: 0, right: 8, level: 1, area: 8 }, best: undefined });
    const firstBest = steps.find(s => s.codeRef === 'update-best')!;
    expect(firstBest.container!.best).toEqual({ left: 0, right: 8, level: 1, area: 8 });
    // before the area is known (width, h) only the best is drawn
    expect(steps.filter(s => s.codeRef === 'calc-width').every(s => s.container?.current === undefined)).toBe(true);
    // the best only ever grows
    const bests = steps.map(s => s.container?.best?.area ?? 0);
    expect(bests.every((b, k) => k === 0 || b >= bests[k - 1])).toBe(true);
  });

  it('the cards: width, h, area, maxArea and the best pair, marking what each step writes', () => {
    const steps = run([1, 8, 6]);
    const card = (s: ExecutionStep, name: string) => s.tracker!.find(c => c.name === name)!;
    const a = steps.find(s => s.codeRef === 'calc-area')!;
    expect(card(a, 'area')).toEqual({ name: 'area', value: 2, role: 'changed' });
    expect(card(a, 'width')).toMatchObject({ value: 2, role: 'current' });
    const upd = steps.find(s => s.codeRef === 'update-best')!;
    expect(card(upd, 'maxArea')).toMatchObject({ value: 2, role: 'changed' });
    expect(card(steps[0], 'width').value).toBeNull();
  });

  it('the end: the best pair is locked as found and the outcome gives the area and the indices', () => {
    const steps = run([1, 8, 6, 2, 5, 4, 8, 3, 7]);
    expect(steps.at(-2)).toMatchObject({ type: 'found', codeRef: 'return', sortedIndices: [1, 8] });
    expect(deriveOutcome(steps, steps.length - 1)).toBe('found');
    expect(steps.at(-1)!.outcomeText).toBe('Max area 49: lines 1 and 8 (min(8, 7) × 7)');
    expect(run([0, 0]).at(-2)!.explanation).toContain('Every container holds 0');
  });

  it('every step keeps the heights unchanged and is numbered from 0', () => {
    run([1, 8, 6, 2, 5]).forEach((s, k) => {
      expect(s.id).toBe(k);
      expect(s.state).toEqual([1, 8, 6, 2, 5]);
    });
  });
});

describe('Container With Most Water — complexity', () => {
  it('O(n) time: at most 8 steps per container plus a constant; O(1) space: a fixed set of tracked values', () => {
    for (const n of [2, 5, 10, 16]) {
      const h = Array.from({ length: n }, (_, i) => (i * 37) % 11);
      const steps = run(h);
      expect(steps.length).toBeLessThanOrEqual(8 * (n - 1) + 5);
      expect(new Set(steps.flatMap(s => (s.tracker ?? []).map(c => c.name))).size).toBe(6);
    }
    expect(cmw.complexity).toMatchObject({ worst: 'O(n)', space: 'O(1)' });
  });
});

describe('Container With Most Water — code lines in C, C++, Java and Python', () => {
  it('each step highlights its statement in every language', () => {
    const expected: Record<string, RegExp> = {
      'fn-entry': /max_?area\(/i,
      init: /left = 0|left, right = 0/,
      'while-condition': /while/,
      'calc-width': /width = right - left/,
      'calc-height': /h = /,
      'calc-area': /area = h \* width/,
      'check-best': /if \(?area > best/,
      'update-best': /best = /,
      'compare-heights': /height\[left\] < height\[right\]/,
      'move-left': /left(\+\+| \+= 1)/,
      'move-right': /right(--| -= 1)/,
      return: /return best/,
    };
    const refs = new Set([...run([1, 8, 6, 2, 5, 4, 8, 3, 7]), ...run([2, 2])].map(s => s.codeRef!));
    expect([...refs].sort()).toEqual(Object.keys(expected).sort());
    for (const lang of LANGUAGES) {
      const lines = codeLines(cmw, lang);
      for (const ref of refs) expect(lines[resolveCodeRef(cmw, lang, ref)! - 1], `${lang} ${ref}`).toMatch(expected[ref]);
      // the init step covers both lines: the pointers and the best pair
      const { start, end } = resolveCodeRange(cmw, lang, 'init')!;
      expect(end - start, lang).toBe(1);
      expect(lines.slice(start - 1, end).join('\n'), lang).toMatch(/left[\s\S]*best/);
    }
  });
});

describe('Container With Most Water — input', () => {
  it('needs at least two heights, none negative', () => {
    expect(validateAlgorithmInput(cmw, [0, 0], null).ok).toBe(true);
    expect(validateAlgorithmInput(cmw, [5], null)).toEqual({
      ok: false, canSortCopy: false, field: 'array', message: 'Container With Most Water needs at least 2 values; got 1.',
    });
    expect(validateAlgorithmInput(cmw, [], null)).toMatchObject({ message: 'Container With Most Water needs at least 2 values; the array is empty.' });
    expect(validateAlgorithmInput(cmw, [3, -1, 4], null)).toMatchObject({
      field: 'array', message: 'Value 2 (-1) is below 0: Container With Most Water takes values from 0 to 999.',
    });
  });

  it('typed text: the problem is reported on the array field (not as an order problem)', () => {
    expect(validateDraft(cmw, '4', '')).toMatchObject({ ok: false, field: 'array', canSortCopy: false });
    expect(validateDraft(cmw, '4, -2', '')).toMatchObject({ ok: false, field: 'array' });
    expect(validateDraft(cmw, '4, 0, 7', '')).toEqual({ ok: true, array: [4, 0, 7], target: null });
  });

  it('a direct call with an invalid input is refused, never a trace of something else', () => {
    for (const h of [[], [3], [3, -1], [1.5, 2]]) expect(() => cmw.generateSteps(h), JSON.stringify(h)).toThrow(RangeError);
    expect(buildExecution('container-most-water', [5]).status).toBe('generator-error');
    expect(buildExecution('container-most-water', [1, 8, 6, 2, 5, 4, 8, 3, 7]).status).toBe('ok');
  });
});
