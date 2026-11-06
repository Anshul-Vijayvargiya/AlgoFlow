import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Find All Permutations through the real UI: the array is typed into the array field; what each step shows (used[] and
 * the element being looked at, the depth, every tree node's state, the current permutation and what happened to it, the
 * call stack, the permutations saved, the costs, the result and the highlighted line) is checked against the engine's own
 * trace for the same array. The permutations themselves are checked against a next-permutation reference in the unit
 * tests (permutations.test.ts).
 */
const ID = 'backtracking-permutations' as const;
const engine = (nums: readonly number[]) => definition(ID).generateSteps([...nums]);
const field = (page: Page) => page.locator('#array-input');

async function enter(page: Page, nums: readonly number[]) {
  await field(page).fill(nums.join(', '));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(nums).length));
}

interface PermutationsUi {
  step: number;
  line: number | null;
  index: string;
  cells: string[];
  depth: string;
  nodes: Record<string, string>;
  walked: string[];
  current: string;
  added: string;
  removed: string;
  skipped: string;
  calls: string[];
  permutations: string[];
  costs: string;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<PermutationsUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): PermutationsUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const costs = q('permutations-costs')?.dataset;
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        index: q('permutations-input')?.dataset.index ?? '',
        cells: [...document.querySelectorAll<HTMLElement>('[data-input-index]')].map(e => `${e.dataset.value}:${e.dataset.used}:${e.dataset.current}`),
        depth: q('permutations-depth')?.dataset.depth ?? '',
        nodes: Object.fromEntries([...document.querySelectorAll<SVGGElement>('[data-tree-node]')].map(g => [g.dataset.treeNode!, `${g.dataset.state}:${g.dataset.saved}`])),
        walked: [...document.querySelectorAll<SVGGElement>('[data-edge][data-walked="true"]')].map(e => e.dataset.edge!).sort(),
        current: q('permutations-current')?.dataset.values ?? '',
        added: q('permutations-current')?.dataset.added ?? '',
        removed: q('permutations-current')?.dataset.removed ?? '',
        skipped: q('permutations-current')?.dataset.skipped ?? '',
        calls: [...document.querySelectorAll<HTMLElement>('[data-frame]')].map(f => `${f.dataset.frameNode}:${f.dataset.frameChosen}:${f.dataset.frameStatus}`),
        permutations: [...document.querySelectorAll<HTMLElement>('[data-permutation]')].map(e => e.dataset.permutation!),
        costs: `${costs?.calls}/${costs?.checks}/${costs?.copied}`,
        result: q('permutations-result')?.textContent?.trim() ?? null,
      };
    };
    const states = [read()];
    for (let i = 1; i < count; i++) {
      const next = [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith('Next'));
      if (!next || next.disabled) break;
      const before = q('step-counter')?.getAttribute('data-step');
      next.click();
      for (let tries = 0; tries < 500 && q('step-counter')?.getAttribute('data-step') === before; tries++) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      states.push(read());
    }
    return states;
  }, count);

/** every node's name in the tree for n elements: the indices chosen, in order */
function paths(n: number): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    out.push(p);
    for (let i = 0; i < n; i++) if (!p.includes(String(i))) walk(`${p}${i}`);
  };
  walk('');
  return out;
}

/** what the engine says a step shows, in the collector's shape */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): PermutationsUi {
  const v = s.permutations!;
  const n = v.nums.length;
  const onPath = new Set(v.calls.map(c => c.node));
  const state = (p: string) => (p === v.node ? 'current' : onPath.has(p) ? 'path' : v.finished.includes(p) ? 'finished' : 'unvisited');
  const saved = (p: string) => {
    const at = v.savedAt.indexOf(p);
    return at === -1 ? '' : String(at + 1);
  };
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    index: v.index === null ? '' : String(v.index),
    cells: v.nums.map((x, i) => `${x}:${v.used[i]}:${i === v.index}`),
    depth: v.calls.length ? String(v.calls.length - 1) : '',
    nodes: Object.fromEntries(paths(n).map(p => [p, `${state(p)}:${saved(p)}`])),
    walked: paths(n).filter(p => p !== '' && state(p) !== 'unvisited').sort(),
    current: v.current.join(','),
    added: v.added === undefined ? '' : String(v.added),
    removed: v.removed === undefined ? '' : String(v.removed),
    skipped: v.skipped === undefined ? '' : String(v.skipped),
    calls: v.calls.map((c, i) => `${c.node}:${c.chosen ?? ''}:${i === v.calls.length - 1 ? (c.returning ? 'returning' : 'active') : 'waiting'}`),
    permutations: v.permutations.map(x => x.join(',')),
    costs: `${v.callsMade}/${v.usedChecks}/${v.elementsCopied}`,
    result: v.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Find All Permutations', () => {
  test('listed under BACKTRACKING after Subsets; opens its own decision tree with [1, 2, 3] and the array form', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('Subsets (Power Set)')).toBeGreaterThan(-1);
    expect(at('Subsets (Power Set)')).toBeLessThan(at('Find All Permutations'));
    expect(at('Find All Permutations')).toBeLessThan(at('BIT MANIPULATION'));
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Find All Permutations');
    await expect(page.getByTestId('permutations-visualizer')).toBeVisible();
    await expect(page.getByTestId('subsets-visualizer')).toHaveCount(0);
    await expect(field(page)).toHaveValue('1, 2, 3');
    await expect(page.locator('[data-tree-node]')).toHaveCount(16);
    await expect(page.locator('#input-hint')).toContainText('Up to 4 distinct whole numbers');
  });

  test('Subsets still draws its own tree, switching both ways', async ({ app, page }) => {
    await app.selectAlgorithm('backtracking-subsets');
    await expect(page.getByTestId('subsets-visualizer')).toBeVisible();
    await expect(page.getByTestId('permutations-visualizer')).toHaveCount(0);
    await expect(page.locator('[data-tree-node]')).toHaveCount(15);
    await app.selectAlgorithm(ID);
    await expect(page.getByTestId('permutations-visualizer')).toBeVisible();
    await expect(page.getByTestId('subsets-visualizer')).toHaveCount(0);
    await expect(page.locator('[data-tree-node]')).toHaveCount(16);
  });

  test('[1, 2, 3], every step as traced, ending with the permutations in the required order', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [1, 2, 3]);
    const steps = engine([1, 2, 3]);
    expect(steps).toHaveLength(136);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    expect(shown.at(-1)!.permutations).toEqual(['1,2,3', '1,3,2', '2,1,3', '2,3,1', '3,1,2', '3,2,1']);
    await expect(page.getByTestId('permutations-result')).toHaveText('6 permutations of [1, 2, 3] (3! = 6)');
    await expect(page.getByTestId('permutations-costs')).toHaveAttribute('data-calls', '16');
    await expect(page.getByTestId('permutations-costs')).toHaveAttribute('data-checks', '30');
    await expect(page.getByTestId('permutations-costs')).toHaveAttribute('data-copied', '18');
  });

  test('step by step: a used element is skipped; push, save, then pop and unmark restore the state', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [4, 9]);
    const current = page.getByTestId('permutations-current');
    const steps = engine([4, 9]);
    const cell = (k: number) => page.locator(`[data-input-index="${k}"]`);
    await app.advance(3); // used[0]? false
    await expect(cell(0)).toHaveAttribute('data-current', 'true');
    await expect(cell(0)).toHaveAttribute('data-used', 'false');
    await app.next(); // mark
    await expect(cell(0)).toHaveAttribute('data-used', 'true');
    await expect(cell(0)).toContainText('used');
    await app.next(); // push
    await expect(current).toHaveAttribute('data-values', '4');
    await expect(current).toContainText('+ 4 pushed');
    await app.advance(2); // recurse, then the check at the next depth
    await expect(page.getByTestId('permutations-depth')).toHaveAttribute('data-depth', '1');
    await app.next(); // used[0]? true: skipped
    await expect(current).toHaveAttribute('data-skipped', '4');
    await expect(current).toContainText('4 already used: skipped');
    const save = steps.findIndex(s => s.codeRef === 'save');
    await app.advance(save - 8);
    await app.expectStep(save + 1);
    await expect(page.locator('[data-permutation]')).toHaveText(['1: [4, 9]']);
    const pop = steps.findIndex(s => s.codeRef === 'pop');
    await app.advance(pop - save);
    await expect(current).toHaveAttribute('data-values', '4');
    await expect(current).toHaveAttribute('data-removed', '9');
    await expect(current).toContainText('− 9 popped (backtracking)');
    await expect(cell(1), 'still marked until the next statement').toHaveAttribute('data-used', 'true');
    await app.next(); // unmark
    await expect(cell(1)).toHaveAttribute('data-used', 'false');
    await expect(cell(1)).toContainText('free');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the recursion, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      await enter(page, [1, 2]);
      const def = definition(ID);
      for (const [ref, code] of [
        ['check-used', lang === 'python' ? 'if used[i]:' : 'if (used[i])'],
        ['mark', lang === 'python' ? 'used[i] = True' : 'used[i] = true'],
        ['push', lang === 'c' ? 'current[(*size)++] = nums[i]' : lang === 'cpp' ? 'current.push_back(nums[i])' : lang === 'java' ? 'current.add(nums[i])' : 'current.append(nums[i])'],
        ['pop', lang === 'c' ? '(*size)--' : lang === 'cpp' ? 'current.pop_back()' : lang === 'java' ? 'current.remove(current.size() - 1)' : 'current.pop()'],
        ['unmark', lang === 'python' ? 'used[i] = False' : 'used[i] = false'],
      ] as const) {
        await expect(page.locator(`[data-line="${def.lineMap[lang]![ref]}"]`)).toContainText(code);
      }
      const steps = engine([1, 2]);
      expect(new Set(steps.map(s => s.codeRef)).size).toBe(Object.keys(def.lineMap[lang]!).length);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [name, nums, count, nodes, result] of [
    ['the empty array', [], 1, 1, '1 permutation of []: the empty permutation (0! = 1)'],
    ['one element', [7], 1, 2, '1 permutation of [7] (1! = 1)'],
    ['two elements, out of order', [9, 4], 2, 5, '2 permutations of [9, 4] (2! = 2)'],
    ['negative values', [-5, 0, 5], 6, 16, '6 permutations of [-5, 0, 5] (3! = 6)'],
    ['the largest input', [1, 2, 3, 4], 24, 65, '24 permutations of [1, 2, 3, 4] (4! = 24)'],
  ] as const) {
    test(`edge case through the UI: ${name}`, async ({ app, page }) => {
      // the helper reads the whole page at every step, as in n-queens.spec.ts
      test.setTimeout(engine(nums).length * 250 + 30_000);
      await app.selectAlgorithm(ID);
      await enter(page, nums);
      await app.goToLastStep();
      await expect(page.locator('[data-permutation]')).toHaveCount(count);
      await expect(page.getByTestId('permutations-result')).toHaveText(result);
      await expect(page.locator('[data-tree-node]')).toHaveCount(nodes);
    });
  }

  test('too many values, repeats and malformed input are refused next to the field with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [text, message] of [
      ['1, 2, 3, 4, 5', 'Too many values (5). The visualizer supports at most 4.'],
      ['1, 2, 1', 'needs distinct values, but 1 appears more than once (values 1 and 3)'],
      ['1, x', 'not a whole number'],
      ['1000', 'out of range'],
    ]) {
      await field(page).fill(text);
      await expect(page.getByTestId('input-error')).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await field(page).fill('1, 2, 3, 4');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Size offers only what fits; Randomize gives distinct values; a longer array does not carry in, even from Subsets', async ({ app, page }) => {
    await app.selectAlgorithm('backtracking-subsets');
    await field(page).fill('1, 2, 3, 4, 5');
    await page.locator('#apply-input').click();
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('1, 2, 3');
    await expect(page.getByTestId('input-issue')).toHaveCount(0);
    const sizes = await page.getByRole('combobox', { name: 'Array size' }).locator('option').allTextContents();
    expect(sizes.every(x => Number(x) <= 4)).toBe(true);
    await page.getByRole('combobox', { name: 'Array size' }).selectOption('4');
    for (let k = 0; k < 5; k++) {
      await app.randomizeButton.click();
      const values = (await field(page).inputValue()).split(',').map(x => x.trim());
      expect(values).toHaveLength(4);
      expect(new Set(values).size).toBe(4);
    }
    await expect(page.locator('[data-tree-node]')).toHaveCount(65);
  });

  test('Play runs to the result; Previous, Next and Reset move through the steps', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [1, 2]);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('permutations-result')).toBeVisible({ timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(38);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('permutations-result')).toHaveCount(0);
    await app.next();
    await app.expectStep(total);
    await expect(page.getByTestId('permutations-result')).toBeVisible();
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-permutation]')).toHaveCount(0);
    await expect(page.getByTestId('permutations-current')).toHaveAttribute('data-values', '');
    await expect(page.locator('[data-used="true"]')).toHaveCount(0);
  });

  test('the widest tree: it scrolls in its own area, keeps the running call in view, and never widens or scrolls the page', async ({ app, page }) => {
    test.setTimeout(engine([1, 2, 3, 4]).length * 250 + 30_000);
    await app.selectAlgorithm(ID);
    await enter(page, [1, 2, 3, 4]);
    const area = page.getByTestId('permutations-tree-scroll');
    const inArea = async () => {
      const a = (await area.boundingBox())!;
      const c = (await page.locator('[data-tree-node][data-state="current"] circle').boundingBox())!;
      return c.x >= a.x && c.x + c.width <= a.x + a.width;
    };
    expect(await area.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    const pageScroll = await page.evaluate(() => window.scrollX);
    await app.advance(20);
    expect(await inArea(), 'left').toBe(true);
    await app.advance(engine([1, 2, 3, 4]).length - 30);
    expect(await inArea(), 'right').toBe(true);
    expect(await area.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollX)).toBe(pageScroll);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('phone width: no horizontal page scroll, and the running call and the result can be reached', async ({ app, page }) => {
    test.setTimeout(engine([1, 2, 3, 4]).length * 250 + 30_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm(ID);
    await enter(page, [1, 2, 3, 4]);
    await app.advance(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const a = (await page.getByTestId('permutations-tree-scroll').boundingBox())!;
    const c = (await page.locator('[data-tree-node][data-state="current"] circle').boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(a.x);
    expect(c.x + c.width).toBeLessThanOrEqual(a.x + a.width);
    await app.goToLastStep();
    const result = page.getByTestId('permutations-result');
    await result.scrollIntoViewIfNeeded();
    await expect(result).toBeInViewport({ ratio: 0.95 });
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA while skipping, while backtracking and at the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, [1, 2, 3]);
      const steps = engine([1, 2, 3]);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const skip = steps.findIndex(s => s.permutations!.skipped !== undefined);
      const pop = steps.findIndex(s => s.codeRef === 'pop');
      await app.advance(skip);
      await settle();
      expect(await violations(page), `${theme}: skip`).toEqual([]);
      await app.advance(pop - skip);
      await settle();
      expect(await violations(page), `${theme}: backtrack`).toEqual([]);
      await app.goToLastStep();
      await settle();
      expect(await violations(page), `${theme}: result`).toEqual([]);
    });
  }
});
