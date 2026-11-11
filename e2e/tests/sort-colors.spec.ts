import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Sort Colors through the real UI: the array is typed into the array field; what each step shows (every cell's value
 * and state, the three pointers, the regions, the step's description and the highlighted line) is checked against the
 * engine's own trace for the same array. The results themselves are checked against counting the values, and the four
 * listings are compiled and run, in the unit tests (sortColors.test.ts, scripts/__tests__/sortColorsListings.test.ts).
 */
const ID = 'array-sort-colors' as const;
const engine = (nums: readonly number[]) => definition(ID).generateSteps([...nums]);
const field = (page: Page) => page.locator('#array-input');
const cell = (page: Page, k: number) => page.locator(`[data-cell="${k}"]`);
const pointer = (page: Page, name: string) => page.locator(`[data-testid="flag-pointers"] [data-var="${name}"]`);

async function enter(page: Page, nums: readonly number[]) {
  await field(page).fill(nums.join(', '));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(nums).length));
}

interface FlagUi {
  step: number;
  line: number | null;
  cells: string[];
  pointers: string[];
  vars: string[];
  regions: string;
  operation: string;
  note: string;
  result: boolean;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<FlagUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): FlagUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const regions = q('flag-regions')?.dataset;
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        cells: [...document.querySelectorAll<HTMLElement>('[data-cell]')].map(e => `${e.dataset.cell}=${e.dataset.value}:${e.dataset.state}`),
        pointers: [...document.querySelectorAll<HTMLElement>('[data-pointer]')].map(e => `${e.closest<HTMLElement>('[data-pointers]')!.dataset.pointers}:${e.dataset.pointer}`),
        vars: [...document.querySelectorAll<HTMLElement>('[data-testid="flag-pointers"] [data-var]')].map(e => `${e.dataset.var}=${e.dataset.value}`),
        regions: `${regions?.zeros}|${regions?.ones}|${regions?.unknown}|${regions?.twos}`,
        operation: q('flag-note')?.dataset.kind ?? '',
        note: q('flag-note')?.textContent ?? '',
        result: Boolean(q('flag-result')),
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

/** what the engine's step says the page shows, in the collector's shape */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): FlagUi {
  const v = s.sortColors!;
  const inside = (c: number, [start, end]: readonly [number, number]) => c >= start && c < end;
  const cells = v.nums.map((value, c) => {
    const state = v.swapped?.includes(c) ? 'swapped' : v.current?.index === c ? 'current' : inside(c, v.regions.zeros) ? 'zero' : inside(c, v.regions.ones) ? 'one' : inside(c, v.regions.twos) ? 'two' : 'unknown';
    return `${c}=${value}:${state}`;
  });
  const pointers = v.nums.flatMap((_, c) => (['low', 'mid', 'high'] as const).filter(p => v[p] === c).map(p => `${c}:${p}`));
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    cells,
    pointers,
    vars: [`low=${v.low ?? ''}`, `mid=${v.mid ?? ''}`, `high=${v.high ?? ''}`],
    regions: [v.regions.zeros, v.regions.ones, v.regions.unknown, v.regions.twos].map(r => r.join(',')).join('|'),
    operation: v.operation,
    note: s.message,
    result: Boolean(v.result),
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Sort Colors', () => {
  test('listed under ARRAYS right after Move Zeroes (not Coming Soon); opens its own cells with [2, 0, 2, 1, 1, 0]', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('ARRAYS')).toBeGreaterThan(-1);
    expect(at('Move Zeroes')).toBeGreaterThan(-1);
    expect(at('Move Zeroes')).toBeLessThan(at('Sort Colors'));
    expect(at('Sort Colors')).toBeLessThan(at('STRINGS'));
    await expect(app.sidebar.getByRole('button', { name: 'Sort Colors', exact: true })).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Sort Colors');
    await expect(page.getByTestId('flag-visualizer')).toBeVisible();
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(field(page)).toHaveValue('2, 0, 2, 1, 1, 0');
    await expect(page.locator('[data-cell]')).toHaveCount(6);
    await expect(page.locator('#input-hint')).toContainText('1 to 10 whole numbers (0 to 2)');
    // its own indexed cells: not the bar view, and not Move Zeroes' view
    await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
    await expect(page.locator('[data-bar-index]')).toHaveCount(0);
    await expect(page.getByTestId('cells-visualizer')).toHaveCount(0);
  });

  test('[2, 0, 2, 1, 1, 0]: every step as traced, cell by cell, ending with [0, 0, 1, 1, 2, 2]', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine([2, 0, 2, 1, 1, 0]);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('flag-result')).toHaveText('Sorted in one pass: [0, 0, 1, 1, 2, 2]');
    await expect(page.getByTestId('flag-array')).toHaveAttribute('data-values', '0,0,1,1,2,2');
  });

  test('a 2 is swapped to high and mid stays; a 0 is swapped to low and both move; a 1 only moves mid', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [1, 2, 0]);
    const steps = engine([1, 2, 0]);
    const go = async (index: number) => {
      await app.advance(index - ((await app.stepNumber()) - 1));
      await app.expectStep(index + 1);
    };
    // nums[0] = 1: only mid moves
    await go(steps.findIndex(s => s.codeRef === 'advance-mid-one'));
    await expect(pointer(page, 'low')).toHaveAttribute('data-value', '0');
    await expect(pointer(page, 'mid')).toHaveAttribute('data-value', '1');
    await expect(pointer(page, 'high')).toHaveAttribute('data-value', '2');
    await expect(cell(page, 0)).toHaveAttribute('data-state', 'one');
    await expect(page.getByTestId('flag-array')).toHaveAttribute('data-values', '1,2,0');

    // nums[1] = 2: the current element, then swapped with high
    await go(steps.findIndex(s => s.codeRef === 'check-one' && s.sortColors!.current!.value === 2));
    await expect(cell(page, 1)).toHaveAttribute('data-state', 'current');
    await go(steps.findIndex(s => s.codeRef === 'swap-high'));
    await expect(cell(page, 1)).toHaveAttribute('data-state', 'swapped');
    await expect(cell(page, 2)).toHaveAttribute('data-state', 'swapped');
    await expect(page.getByTestId('flag-array')).toHaveAttribute('data-values', '1,0,2');
    await expect(page.locator('[data-pointers="1"] [data-pointer="mid"]')).toBeVisible();
    await expect(page.locator('[data-pointers="2"] [data-pointer="high"]')).toBeVisible();
    // high-- and mid stays at 1
    await app.next();
    await expect(pointer(page, 'high')).toHaveAttribute('data-value', '1');
    await expect(pointer(page, 'mid')).toHaveAttribute('data-value', '1');
    await expect(page.getByTestId('flag-note')).toContainText('mid stays at 1');
    await expect(cell(page, 2)).toHaveAttribute('data-state', 'two');
    // the loop goes on at the same mid: the 0 that came from the back is checked next
    await app.next();
    await app.next();
    await expect(page.getByTestId('flag-note')).toContainText('nums[1]=0 == 0');
    await expect(cell(page, 1)).toHaveAttribute('data-state', 'current');

    // the 0 is swapped with low; then low and mid both move
    await go(steps.findIndex(s => s.codeRef === 'swap-low'));
    await expect(page.getByTestId('flag-array')).toHaveAttribute('data-values', '0,1,2');
    await expect(cell(page, 0)).toHaveAttribute('data-state', 'swapped');
    await expect(cell(page, 1)).toHaveAttribute('data-state', 'swapped');
    await app.next();
    await app.next();
    await expect(pointer(page, 'low')).toHaveAttribute('data-value', '1');
    await expect(pointer(page, 'mid')).toHaveAttribute('data-value', '2');
    await expect(cell(page, 0)).toHaveAttribute('data-state', 'zero');
    await expect(cell(page, 1)).toHaveAttribute('data-state', 'one');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the three-pointer loop, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const def = definition(ID);
      const LOOP = { c: 'while (mid <= high) {', cpp: 'while (mid <= high) {', java: 'while (mid <= high) {', python: 'while mid <= high:' };
      const HIGH = { c: 'high--;', cpp: 'high--;', java: 'high--;', python: 'high -= 1' };
      await expect(page.locator(`[data-line="${def.lineMap[lang]['loop-condition']}"]`)).toContainText(LOOP[lang]);
      await expect(page.locator(`[data-line="${def.lineMap[lang]['retreat-high']}"]`)).toContainText(HIGH[lang]);
      const steps = engine([2, 0, 2, 1, 1, 0]);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [input, output] of [
    [[0], [0]],
    [[1], [1]],
    [[2], [2]],
    [[0, 0, 0], [0, 0, 0]],
    [[1, 1, 1], [1, 1, 1]],
    [[2, 2, 2], [2, 2, 2]],
    [[0, 1, 2], [0, 1, 2]],
    [[2, 1, 0], [0, 1, 2]],
    [[1, 0, 2], [0, 1, 2]],
    [[2, 2, 1, 0, 0, 1, 2, 0, 1, 1], [0, 0, 0, 1, 1, 1, 1, 2, 2, 2]],
  ] as const) {
    test(`through the UI: [${input.join(', ')}] → [${output.join(', ')}]`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, input);
      await app.goToLastStep();
      await expect(page.getByTestId('flag-result')).toHaveText(`Sorted in one pass: [${output.join(', ')}]`);
      await expect(page.getByTestId('flag-array')).toHaveAttribute('data-values', output.join(','));
      await expect(page.getByTestId('flag-input')).toHaveText(`input: [${input.join(', ')}]`);
      await expect(page.locator('[data-cell][data-state="unknown"]')).toHaveCount(0);
      await expect(page.locator('[data-cell][data-state="zero"]')).toHaveCount(output.filter(v => v === 0).length);
      await expect(page.locator('[data-cell][data-state="one"]')).toHaveCount(output.filter(v => v === 1).length);
      await expect(page.locator('[data-cell][data-state="two"]')).toHaveCount(output.filter(v => v === 2).length);
    });
  }

  test('an empty array, more than 10 values, values other than 0, 1 and 2, or not whole numbers are refused with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [bad, message] of [
      ['', 'needs at least 1'],
      ['0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1', 'Too many values (11). The visualizer supports at most 10.'],
      ['3', 'Value 1 (3) is above 2: Sort Colors takes values from 0 to 2.'],
      ['0, 1, 7', 'Value 3 (7) is above 2: Sort Colors takes values from 0 to 2.'],
      ['-1', 'Value 1 (-1) is below 0: Sort Colors takes values from 0 to 2.'],
      ['1000', 'out of range'],
      ['1.5', 'is a decimal'],
      ['1, x', 'is not a whole number'],
    ]) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    // the trace on screen is still the valid one
    await expect(page.locator('[data-cell]')).toHaveCount(6);
    await expect(page.getByTestId('flag-array')).toHaveAttribute('data-values', '2,0,2,1,1,0');
    await field(page).fill('2, 0');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Size offers up to 10 and Randomize draws only 0, 1 and 2; an array from another algorithm does not carry in', async ({ app, page }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([5, 0, 3, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('2, 0, 2, 1, 1, 0');
    const sizes = await page.getByRole('combobox', { name: 'Array size' }).locator('option').allTextContents();
    expect(sizes.every(x => Number(x) <= 10)).toBe(true);
    for (let k = 0; k < 3; k++) {
      await app.randomizeButton.click();
      const values = (await page.getByTestId('flag-array').getAttribute('data-values'))!.split(',').map(Number);
      expect(values.length).toBeGreaterThanOrEqual(1);
      expect(values.length).toBeLessThanOrEqual(10);
      expect(values.every(v => v === 0 || v === 1 || v === 2), values.join(',')).toBe(true);
      await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(values).length));
    }
  });

  test('Move Zeroes is unchanged: it still takes -999 to 999, says 1 to 10 values, keeps its own cells, and its array does not carry in here', async ({ app, page }) => {
    await app.selectAlgorithm('array-move-zeroes');
    await expect(page.locator('#input-hint')).toContainText('1 to 10 whole numbers (-999 to 999)');
    await field(page).fill('-999, 0, 999, 3');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await page.locator('#apply-input').click();
    await expect(page.getByTestId('cells-visualizer')).toBeVisible();
    await expect(page.getByTestId('flag-visualizer')).toHaveCount(0);
    await app.goToLastStep();
    await expect(page.getByTestId('cells-array')).toHaveAttribute('data-values', '-999,999,3,0');
    await expect(page.getByTestId('cells-result')).toHaveText('Moved 1 zero to the end: [-999, 999, 3, 0]');
    // 3 and -999 are not colours: Sort Colors loads its own example
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('2, 0, 2, 1, 1, 0');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.getByTestId('flag-visualizer')).toBeVisible();
    await expect(page.getByTestId('cells-visualizer')).toHaveCount(0);
  });

  test('Play runs to the result; Previous steps back; Reset returns to the input', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('flag-result')).toHaveText('Sorted in one pass: [0, 0, 1, 1, 2, 2]', { timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine([2, 0, 2, 1, 1, 0]).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('flag-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.getByTestId('flag-array')).toHaveAttribute('data-values', '2,0,2,1,1,0');
    await expect(page.locator('[data-pointer]')).toHaveCount(0);
    await expect(page.locator('[data-cell][data-state="unknown"]')).toHaveCount(6);
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): ten cells with all three pointers stay readable, wrapping instead of scrolling`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      const nums = [2, 2, 1, 0, 0, 1, 2, 0, 1, 1];
      await enter(page, nums);
      await app.advance(engine(nums).findIndex(s => s.codeRef === 'swap-high'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const boxes = await page.locator('[data-cell]').evaluateAll(els =>
        els.map(e => ({ k: e.getAttribute('data-cell'), fits: e.scrollWidth <= e.clientWidth, ...JSON.parse(JSON.stringify(e.getBoundingClientRect())) }))
      );
      expect(boxes).toHaveLength(10);
      for (const b of boxes) {
        expect(b.fits, `cell ${b.k}: the value overflows`).toBe(true);
        expect(b.left, `cell ${b.k}`).toBeGreaterThanOrEqual(0);
        expect(b.right, `cell ${b.k}`).toBeLessThanOrEqual(width);
      }
      // the pointer labels stay inside the screen too
      const tags = await page.locator('[data-pointer]').evaluateAll(els => els.map(e => ({ name: e.getAttribute('data-pointer'), ...JSON.parse(JSON.stringify(e.getBoundingClientRect())) })));
      expect(tags.map(t => t.name).sort()).toEqual(['high', 'low', 'mid']);
      for (const t of tags) {
        expect(t.left, `${t.name} label`).toBeGreaterThanOrEqual(0);
        expect(t.right, `${t.name} label`).toBeLessThanOrEqual(width);
      }
      await app.goToLastStep();
      await expect(page.getByTestId('flag-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.getByTestId('flag-array')).toHaveAttribute('data-values', '0,0,0,1,1,1,1,2,2,2');
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on the current element, a swap, the regions and the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      const steps = engine([2, 0, 2, 1, 1, 0]);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      let at = 0;
      for (const index of [steps.findIndex(s => s.codeRef === 'check-zero'), steps.findIndex(s => s.codeRef === 'swap-high'), steps.findIndex(s => s.codeRef === 'advance-mid-one')]) {
        await app.advance(index - at);
        at = index;
        await settle();
        expect(await violations(page), `${theme}: step ${index + 1}`).toEqual([]);
      }
      await app.goToLastStep();
      await settle();
      expect(await violations(page), `${theme}: result`).toEqual([]);
    });
  }
});
