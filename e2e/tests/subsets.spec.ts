import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Subsets through the real UI: the array is typed into the array field; what each step shows (the element being decided,
 * every tree node's state, the current subset and what happened to it, the call stack, the subsets saved, the two costs,
 * the result and the highlighted line) is checked against the engine's own trace for the same array. The subsets
 * themselves are checked against a bitmask reference in the unit tests (subsets.test.ts).
 */
const ID = 'backtracking-subsets' as const;
const engine = (nums: readonly number[]) => definition(ID).generateSteps([...nums]);
const field = (page: Page) => page.locator('#array-input');

async function enter(page: Page, nums: readonly number[]) {
  await field(page).fill(nums.join(', '));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(nums).length));
}

interface SubsetsUi {
  step: number;
  line: number | null;
  index: string;
  highlighted: string[];
  nodes: Record<string, string>;
  walked: string[];
  current: string;
  added: string;
  removed: string;
  calls: string[];
  subsets: string[];
  calls_made: string;
  copied: string;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<SubsetsUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): SubsetsUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        index: q('subsets-input')?.dataset.index ?? '',
        highlighted: [...document.querySelectorAll<HTMLElement>('[data-input-index][data-current="true"]')].map(e => e.dataset.inputIndex!),
        nodes: Object.fromEntries([...document.querySelectorAll<SVGGElement>('[data-tree-node]')].map(g => [g.dataset.treeNode!, `${g.dataset.state}:${g.dataset.saved}`])),
        walked: [...document.querySelectorAll<SVGGElement>('[data-edge][data-walked="true"]')].map(e => e.dataset.edge!).sort(),
        current: q('subsets-current')?.dataset.values ?? '',
        added: q('subsets-current')?.dataset.added ?? '',
        removed: q('subsets-current')?.dataset.removed ?? '',
        calls: [...document.querySelectorAll<HTMLElement>('[data-frame]')].map(f => `${f.dataset.frameI}:${f.dataset.frameNode}:${f.dataset.frameVia}:${f.dataset.frameStatus}`),
        subsets: [...document.querySelectorAll<HTMLElement>('[data-subset]')].map(e => e.dataset.subset!),
        calls_made: q('subsets-costs')?.dataset.calls ?? '',
        copied: q('subsets-costs')?.dataset.copied ?? '',
        result: q('subsets-result')?.textContent?.trim() ?? null,
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

/** every node's path of the tree for n elements */
function paths(n: number): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    if (p.length < n) {
      walk(`${p}I`);
      walk(`${p}E`);
    }
    out.push(p);
  };
  walk('');
  return out;
}

/** what the engine says a step shows, in the collector's shape */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): SubsetsUi {
  const v = s.subsets!;
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
    highlighted: v.index === null ? [] : [String(v.index)],
    nodes: Object.fromEntries(paths(n).map(p => [p, `${state(p)}:${saved(p)}`])),
    walked: paths(n).filter(p => p !== '' && state(p) !== 'unvisited').sort(),
    current: v.current.join(','),
    added: v.added === undefined ? '' : String(v.added),
    removed: v.removed === undefined ? '' : String(v.removed),
    calls: v.calls.map((c, i) => `${c.i}:${c.node}:${c.via}:${i === v.calls.length - 1 ? (c.returning ? 'returning' : 'active') : 'waiting'}`),
    subsets: v.subsets.map(x => x.join(',')),
    calls_made: String(v.callsMade),
    copied: String(v.elementsCopied),
    result: v.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Subsets (Power Set)', () => {
  test('listed under BACKTRACKING after N-Queens; opens the decision tree with [1, 2, 3] and the array form', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('BACKTRACKING')).toBeGreaterThan(-1);
    expect(at('BACKTRACKING')).toBeLessThan(at('N-Queens Problem'));
    expect(at('N-Queens Problem')).toBeLessThan(at('Subsets (Power Set)'));
    expect(at('Subsets (Power Set)')).toBeLessThan(at('BIT MANIPULATION'));
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Subsets (Power Set)');
    await expect(page.getByTestId('subsets-visualizer')).toBeVisible();
    await expect(field(page)).toHaveValue('1, 2, 3');
    await expect(page.locator('[data-tree-node]')).toHaveCount(15);
    await expect(page.locator('#input-hint')).toContainText('Up to 5 distinct whole numbers');
  });

  test('[1, 2, 3], every step as traced, ending with the subsets in the required order', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [1, 2, 3]);
    const steps = engine([1, 2, 3]);
    expect(steps).toHaveLength(61);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    expect(shown.at(-1)!.subsets).toEqual(['', '1', '1,2', '1,2,3', '1,3', '2', '2,3', '3']);
    await expect(page.getByTestId('subsets-result')).toHaveText('8 subsets of [1, 2, 3] (2^3 = 8)');
    await expect(page.getByTestId('subsets-costs')).toHaveAttribute('data-calls', '15');
    await expect(page.getByTestId('subsets-costs')).toHaveAttribute('data-copied', '12');
  });

  test('step by step: include, save, recurse; then the removal when backtracking, and the skip', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [4, 9]);
    const current = page.getByTestId('subsets-current');
    await app.advance(3); // include 4
    await expect(current).toHaveAttribute('data-values', '4');
    await expect(current).toContainText('+ 4 included');
    await app.next(); // save [4]
    await expect(page.locator('[data-subset]')).toHaveCount(2);
    await expect(page.locator('[data-subset]').last()).toHaveAttribute('data-newest', 'true');
    await app.next(); // dfs(1)
    await expect(page.locator('[data-frame]')).toHaveCount(2);
    const steps = engine([4, 9]);
    const pop = steps.findIndex(s => s.codeRef === 'pop');
    await app.advance(pop - 5);
    await app.expectStep(pop + 1);
    await expect(current).toHaveAttribute('data-values', '4');
    await expect(current).toHaveAttribute('data-removed', '9');
    await expect(current).toContainText('− 9 removed (backtracking)');
    await app.next(); // skip 9
    await expect(current).toHaveAttribute('data-values', '4');
    await expect(page.getByTestId('subsets-operation')).toHaveText('Skip 9');
    await expect(page.locator('[data-subset]'), 'nothing is saved on the skip').toHaveCount(3);
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the recursion, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      await enter(page, [1, 2]);
      const def = definition(ID);
      for (const [ref, code] of [
        ['include', lang === 'c' ? 'current[(*size)++] = nums[i]' : lang === 'cpp' ? 'current.push_back(nums[i])' : lang === 'java' ? 'current.add(nums[i])' : 'current.append(nums[i])'],
        ['pop', lang === 'c' ? '(*size)--' : lang === 'cpp' ? 'current.pop_back()' : lang === 'java' ? 'current.remove(current.size() - 1)' : 'current.pop()'],
        ['recurse-exclude', 'exclude nums[i]'],
      ] as const) {
        await expect(page.locator(`[data-line="${def.lineMap[lang]![ref]}"]`)).toContainText(code);
      }
      const steps = engine([1, 2]);
      expect(new Set(steps.map(s => s.codeRef)).size).toBe(Object.keys(def.lineMap[lang]!).length);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [name, nums, count, result] of [
    ['the empty array', [], 1, '1 subset of []: only the empty subset (2^0 = 1)'],
    ['one element', [7], 2, '2 subsets of [7] (2^1 = 2)'],
    ['two elements, out of order', [9, 4], 4, '4 subsets of [9, 4] (2^2 = 4)'],
    ['negative values', [-5, 0, 5], 8, '8 subsets of [-5, 0, 5] (2^3 = 8)'],
    ['the largest input', [1, 2, 3, 4, 5], 32, '32 subsets of [1, 2, 3, 4, 5] (2^5 = 32)'],
  ] as const) {
    test(`edge case through the UI: ${name}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, nums);
      await app.goToLastStep();
      await expect(page.locator('[data-subset]')).toHaveCount(count);
      await expect(page.getByTestId('subsets-result')).toHaveText(result);
      await expect(page.locator('[data-tree-node]')).toHaveCount(2 * count - 1);
    });
  }

  test('too many values, repeats and malformed input are refused next to the field with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [text, message] of [
      ['1, 2, 3, 4, 5, 6', 'Too many values (6). The visualizer supports at most 5.'],
      ['1, 2, 1', 'needs distinct values, but 1 appears more than once (values 1 and 3)'],
      ['1, x', 'not a whole number'],
      ['1000', 'out of range'],
    ]) {
      await field(page).fill(text);
      await expect(page.getByTestId('input-error')).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await field(page).fill('1, 2, 3, 4, 5');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Size offers only what fits; Randomize gives distinct values; a long array from another algorithm does not carry in', async ({ app, page }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([5, 5, 1, 2, 3, 4, 8, 9]);
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('1, 2, 3');
    await expect(page.getByTestId('input-issue')).toHaveCount(0);
    const sizes = await page.getByRole('combobox', { name: 'Array size' }).locator('option').allTextContents();
    expect(sizes.every(x => Number(x) <= 5)).toBe(true);
    await page.getByRole('combobox', { name: 'Array size' }).selectOption('5');
    for (let k = 0; k < 5; k++) {
      await app.randomizeButton.click();
      const values = (await field(page).inputValue()).split(',').map(x => x.trim());
      expect(values).toHaveLength(5);
      expect(new Set(values).size).toBe(5);
    }
    await expect(page.locator('[data-tree-node]')).toHaveCount(63);
  });

  test('Play runs to the result; Previous, Next and Reset move through the steps', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [1, 2]);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('subsets-result')).toBeVisible({ timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(29);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('subsets-result')).toHaveCount(0);
    await app.next();
    await app.expectStep(total);
    await expect(page.getByTestId('subsets-result')).toBeVisible();
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-subset]')).toHaveCount(1);
    await expect(page.getByTestId('subsets-current')).toHaveAttribute('data-values', '');
  });

  test('the widest tree: it scrolls in its own area, keeps the running call in view, and never widens or scrolls the page', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [1, 2, 3, 4, 5]);
    const area = page.getByTestId('subsets-tree-scroll');
    const inArea = async () => {
      const a = (await area.boundingBox())!;
      const c = (await page.locator('[data-tree-node][data-state="current"] circle').boundingBox())!;
      return c.x >= a.x && c.x + c.width <= a.x + a.width;
    };
    expect(await area.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    const pageScroll = await page.evaluate(() => window.scrollX);
    // deep in the left of the tree, then the far right
    await app.advance(12);
    expect(await inArea(), 'left').toBe(true);
    await app.advance(engine([1, 2, 3, 4, 5]).length - 20);
    expect(await inArea(), 'right').toBe(true);
    expect(await area.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollX)).toBe(pageScroll);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('phone width: no horizontal page scroll, and the running call and the result can be reached', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm(ID);
    await enter(page, [1, 2, 3, 4]);
    await app.advance(14);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const a = (await page.getByTestId('subsets-tree-scroll').boundingBox())!;
    const c = (await page.locator('[data-tree-node][data-state="current"] circle').boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(a.x);
    expect(c.x + c.width).toBeLessThanOrEqual(a.x + a.width);
    await app.goToLastStep();
    const result = page.getByTestId('subsets-result');
    await result.scrollIntoViewIfNeeded();
    await expect(result).toBeInViewport({ ratio: 0.95 });
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA while saving, while backtracking and at the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, [1, 2, 3]);
      const steps = engine([1, 2, 3]);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const save = steps.findIndex(s => s.codeRef === 'save');
      const pop = steps.findIndex(s => s.codeRef === 'pop');
      await app.advance(save);
      await settle();
      expect(await violations(page), `${theme}: save`).toEqual([]);
      await app.advance(pop - save);
      await settle();
      expect(await violations(page), `${theme}: backtrack`).toEqual([]);
      await app.goToLastStep();
      await settle();
      expect(await violations(page), `${theme}: result`).toEqual([]);
    });
  }
});
