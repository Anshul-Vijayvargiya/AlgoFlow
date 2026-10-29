import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, engineSteps, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import type { UiState, VisualizerApp } from '../support/visualizerApp';

/**
 * Trapping Rain Water through the real UI. What each step shows — the cards, the pointers, the message, the water
 * above each bar and the highlighted line — is checked against the engine's own trace for the same input; the totals
 * are checked against a reference in the unit tests (trappingRainWater.test.ts).
 */
const ID = 'trapping-rain-water' as const;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];
const EXAMPLE = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1];

const engineCards = (s: ExecutionStep) =>
  Object.fromEntries((s.tracker ?? []).map(c => [c.name, { value: c.value === null ? '—' : String(c.value), role: c.role ?? '' }]));
const barPointers = (u: UiState) => u.bars.filter(b => b.pointers.length).map(b => `${b.pointers.join('+')}@${b.index}`).sort();
const enginePointers = (s: ExecutionStep, n: number) => {
  const at = new Map<number, string[]>();
  for (const [name, i] of Object.entries(s.pointers ?? {})) if (i >= 0 && i < n) at.set(i, [...(at.get(i) ?? []), name]);
  return [...at].map(([i, names]) => `${names.join('+')}@${i}`).sort();
};
const engineWater = (s: ExecutionStep) => ({
  pools: s.water!.amounts.flatMap((a, i) => (a > 0 ? [[i, a]] : [])),
  current: s.water!.current ?? null,
});
const settle = (page: Page) =>
  page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));

/** the water drawn at this step and the next count - 1 (clicking the real Next button in the page) */
const collectWater = (page: Page, count: number) =>
  page.evaluate(async count => {
    const read = () => {
      const root = document.querySelector<HTMLElement>('[data-testid="water"]');
      return {
        pools: [...document.querySelectorAll<HTMLElement>('[data-water-index]')].map(p => [Number(p.dataset.waterIndex), Number(p.dataset.amount)]),
        current: root?.dataset.current ? Number(root.dataset.current) : null,
      };
    };
    const states = [read()];
    for (let i = 1; i < count; i++) {
      const next = [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith('Next'));
      if (!next || next.disabled) break;
      const before = document.querySelector('[data-testid="step-counter"]')?.getAttribute('data-step');
      next.click();
      for (let tries = 0; tries < 500 && document.querySelector('[data-testid="step-counter"]')?.getAttribute('data-step') === before; tries++) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      states.push(read());
    }
    return states;
  }, count);

async function expectCodeLines(app: VisualizerApp, lang: ProgrammingLanguage, steps: ExecutionStep[]) {
  await app.setLanguage(lang);
  await app.reset();
  await app.expectStep(1);
  const lines = steps.map(s => resolveCodeRef(definition(ID), lang, s.codeRef!));
  expect(lines.every(n => n !== null), `${lang}: every step has a line`).toBe(true);
  const shown = await app.collectStates(steps.length);
  expect(shown.map(u => u.activeLine?.n ?? null), lang).toEqual(lines);
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

/** the drawn bar of a column (the coloured block, not the label or the index row) */
const barBlock = (page: Page, i: number) => page.locator(`[data-bar-index="${i}"] > div:first-child > div:last-child`);

test.describe('Trapping Rain Water', () => {
  test('it is listed in ARRAYS after Merge Sorted Array, before STRINGS', async ({ app }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Merge Sorted Array')).toBeLessThan(text.indexOf('Trapping Rain Water'));
    expect(text.indexOf('Trapping Rain Water')).toBeLessThan(text.indexOf('STRINGS'));
  });

  test('the example: every step shows the cards, pointers, message and water the engine has; then 6 units', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await expect(app.targetInput).toHaveCount(0);
    const steps = engineSteps(ID, EXAMPLE);
    await app.expectTotal(steps.length);

    const shown = await app.collectStates(steps.length);
    for (const [k, s] of steps.entries()) {
      expect(shown[k].tracker, `step ${k + 1} cards`).toEqual(engineCards(s));
      expect(barPointers(shown[k]), `step ${k + 1} pointers`).toEqual(enginePointers(s, EXAMPLE.length));
      expect(shown[k].message, `step ${k + 1}`).toBe(s.message);
    }
    expect(shown.at(-1)!.outcome).toEqual({ kind: 'complete', text: 'Trapped water: 6 units' });

    await app.reset();
    await app.expectStep(1);
    const water = await collectWater(page, steps.length);
    expect(water).toEqual(steps.map(engineWater));
    expect(water.at(-1)!.pools).toEqual([[2, 1], [4, 1], [5, 2], [6, 1], [9, 1]]);
  });

  test('each pool sits on its own bar, inside the column, rising above the bar top', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([5, 0, 2, 0, 5]);
    await app.goToLastStep();
    await settle(page);
    // 5 − 0, 5 − 2, 5 − 0 above bars 1, 2 and 3
    await expect(page.locator('[data-water-index]')).toHaveCount(3);
    for (const [i, amount] of [[1, 5], [2, 3], [3, 5]]) {
      await expect
        .poll(async () => {
          const pool = (await page.locator(`[data-water-index="${i}"]`).boundingBox())!;
          const col = (await page.locator(`[data-bar-index="${i}"]`).boundingBox())!;
          const bar = (await barBlock(page, i).boundingBox())!;
          const off = (a: number, b: number) => Math.abs(a - b) < 1.5;
          return { 'within the column': off(pool.x, col.x) && off(pool.width, col.width), 'on the bar top': off(pool.y + pool.height, bar.y), 'above it': pool.height > 0 };
        }, { message: `pool ${i}` })
        .toEqual({ 'within the column': true, 'on the bar top': true, 'above it': true });
      await expect(page.locator(`[data-water-index="${i}"]`)).toHaveAttribute('data-amount', String(amount));
    }
    // the deepest pools rise to the walls' tops
    const wall = (await barBlock(page, 0).boundingBox())!;
    const deep = (await page.locator('[data-water-index="1"]').boundingBox())!;
    expect(Math.abs(deep.y - wall.y)).toBeLessThan(1.5);
  });

  for (const [name, heights, water] of [
    ['the second LeetCode example', [4, 2, 0, 3, 2, 5], 9],
    ['a flat profile', [3, 3, 3, 3], 0],
    ['strictly increasing', [1, 2, 3, 4, 5], 0],
    ['several basins with duplicate heights', [3, 0, 3, 0, 3], 6],
    ['a single bar', [7], 0],
  ] as const) {
    test(`result: ${name}`, async ({ app }) => {
      await app.selectAlgorithm(ID);
      await app.enterAndVisualize([...heights]);
      await app.goToLastStep();
      // none of these totals is 1, so the plural always applies
      await expect(app.outcome).toHaveText(`Trapped water: ${water} units`);
    });
  }

  test('a negative height or too many bars: explained on the array field, and Visualize is disabled', async ({ app }) => {
    await app.selectAlgorithm(ID);
    for (const [text, message] of [
      ['3, -1, 4', 'Value 2 (-1) is below 0: Trapping Rain Water takes values from 0 to 999.'],
      [Array(17).fill(1).join(', '), 'at most 16'],
    ]) {
      await app.type(text);
      await expect(app.inputError).toContainText(message);
      await expect(app.arrayInput).toHaveAttribute('aria-invalid', 'true');
      await expect(app.visualizeButton).toBeDisabled();
    }
    // the running trace is untouched
    await app.expectBars(EXAMPLE);
    await app.type('2, 0, 2');
    await expect(app.inputError).toHaveCount(0);
    await expect(app.visualizeButton).toBeEnabled();
  });

  for (const lang of LANGUAGES) {
    test(`the highlighted code line follows the trace (${lang})`, async ({ app }) => {
      await app.selectAlgorithm(ID);
      await expectCodeLines(app, lang, engineSteps(ID, EXAMPLE));
    });
  }

  test('Play runs to the result at the fast speed; Reset returns to step 1 with no water', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([2, 0, 2]);
    const total = await app.totalSteps();
    await app.setSpeed('fast');
    await app.play();
    await expect(app.stepCounter).toHaveAttribute('data-step', String(total), { timeout: total * 1000 + 10_000 });
    await expect(app.outcome).toHaveText('Trapped water: 2 units');
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-water-index]')).toHaveCount(0);
  });

  test('Randomize gives a valid run of non-negative heights; Restore brings a custom array back', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([0, 9, 0, 9]);
    await app.randomizeButton.click();
    await expect(app.inputNotice).toBeVisible();
    const values = await app.barValues();
    expect(values.every(v => v >= 0)).toBe(true);
    await expect(app.stepCounter).toHaveAttribute('data-total', String(engineSteps(ID, values).length));
    await app.restoreButton.click();
    await app.expectBars([0, 9, 0, 9]);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe (${theme} theme): mid-trace with water and the cards`, async ({ app, page }) => {
      await page.locator('#header-theme-select').selectOption(theme);
      await settle(page);
      await app.selectAlgorithm(ID);
      await app.advance(30);
      await expect(page.locator('[data-water-index]').first()).toBeAttached();
      await settle(page);
      expect(await violations(page)).toEqual([]);
    });
  }

  test('phone width: no horizontal scroll with 16 bars; the water stays inside the chart', async ({ app, page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([999, 0, 12, 450, 7, 7, 300, 2, 88, 999, 5, 60, 1, 640, 9, 700]);
    await app.goToLastStep();
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const chart = (await page.getByTestId('array-visualizer').boundingBox())!;
    const pools = await page.locator('[data-water-index]').all();
    expect(pools.length).toBeGreaterThan(0);
    for (const p of pools) {
      const box = (await p.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(chart.x);
      expect(box.x + box.width).toBeLessThanOrEqual(chart.x + chart.width);
      expect(box.y).toBeGreaterThanOrEqual(chart.y);
    }
  });
});
