import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Pascal's Triangle through the real UI: numRows is typed into the number field; what each step shows (every cell's value
 * and state, each row's state, the calculation, the rows built and the highlighted line) is checked against the engine's
 * own trace for the same numRows. The triangle itself is checked against the binomial coefficients, and the four
 * listings are compiled and run, in the unit tests (pascalsTriangle.test.ts, scripts/__tests__/pascalsTriangleListings.test.ts).
 */
const ID = 'dp-pascals-triangle' as const;
const engine = (numRows: number) => definition(ID).generateSteps([numRows]);
const field = (page: Page) => page.locator('#number-input-numRows');
const cell = (page: Page, r: number, c: number) => page.locator(`[data-tri-cell="${r},${c}"]`);

async function enter(page: Page, numRows: number) {
  await field(page).fill(String(numRows));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(numRows).length));
}

interface TriangleUi {
  step: number;
  line: number | null;
  cells: string[];
  rows: string[];
  calc: string;
  built: string;
  result: boolean;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<TriangleUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): TriangleUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        cells: [...document.querySelectorAll<HTMLElement>('[data-tri-cell]')].map(e => `${e.dataset.triCell}=${e.dataset.value}:${e.dataset.state}`),
        rows: [...document.querySelectorAll<HTMLElement>('[data-tri-row]')].map(e => `${e.dataset.triRow}:${e.dataset.rowState}`),
        calc: q('triangle-calc')?.dataset.kind ?? '',
        built: q('triangle-array')?.dataset.rowsBuilt ?? '',
        result: Boolean(q('triangle-result')),
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

/** what the engine says a step shows, in the collector's shape (the same rules as the visualizer) */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): TriangleUi {
  const v = s.triangle!;
  const isParent = (r: number, c: number) => Boolean(v.parents?.some(p => p.row === r && p.col === c));
  const cells: string[] = [];
  const rows: string[] = [];
  for (let r = 0; r < v.numRows; r++) {
    for (let c = 0; c <= r; c++) {
      let value: number | null = null;
      let state: string;
      if (r < v.triangle.length) {
        value = v.triangle[r][c];
        state = v.result ? 'result' : isParent(r, c) ? 'parent' : v.appended === r ? 'appended' : 'complete';
      } else if (v.row && r === v.i) {
        value = v.row[c];
        if (v.focus?.col === c) state = v.focus.kind === 'boundary' ? 'boundary' : v.focus.kind === 'assigned' ? 'assigned' : 'current';
        else state = value === null ? 'unset' : v.rowComplete ? 'row-complete' : 'set';
      } else state = 'pending';
      cells.push(`${r},${c}=${value ?? ''}:${state}`);
    }
    rows.push(
      `${r}:${v.result ? 'result' : r < v.triangle.length ? (v.appended === r ? 'appended' : 'complete') : v.row && r === v.i ? (v.rowComplete ? 'row-complete' : 'building') : 'pending'}`
    );
  }
  const calc = v.focus ? v.focus.kind : v.rowComplete && v.row ? 'row-complete' : v.appended !== undefined ? 'appended' : '';
  return { step: k + 1, line: resolveCodeRef(definition(ID), lang, s.codeRef), cells, rows, calc, built: String(v.triangle.length), result: Boolean(v.result) };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe("Pascal's Triangle", () => {
  test('listed under DYNAMIC PROGRAMMING (not Coming Soon); opens the triangle with numRows = 5', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('DYNAMIC PROGRAMMING')).toBeGreaterThan(-1);
    expect(at('DYNAMIC PROGRAMMING')).toBeLessThan(at("Pascal's Triangle"));
    expect(at("Pascal's Triangle")).toBeLessThan(at('Fibonacci (DP)'));
    expect(at('Longest Common Subsequence')).toBeLessThan(at('GREEDY'));
    const entry = app.sidebar.getByRole('button', { name: "Pascal's Triangle" });
    await expect(entry).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText("Pascal's Triangle");
    await expect(page.getByTestId('triangle-visualizer')).toBeVisible();
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(field(page)).toHaveValue('5');
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(5).length));
    await expect(page.locator('[data-tri-cell]')).toHaveCount(15);
    await expect(page.locator('[data-tri-cell][data-state="pending"]')).toHaveCount(15);
  });

  test('numRows = 4: every step as traced, cell by cell, ending with the triangle', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, 4);
    const steps = engine(4);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('triangle-result')).toHaveText("Pascal's Triangle with 4 rows: [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]]");
  });

  test('the example step by step: a boundary cell, the parents, their sum, the new cell, the completed row', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(5);
    const go = async (index: number) => {
      await app.advance(index - ((await app.stepNumber()) - 1));
      await app.expectStep(index + 1);
    };
    const at = (codeRef: string, i: number, j?: number) => steps.findIndex(s => s.codeRef === codeRef && s.triangle!.i === i && (j === undefined || s.triangle!.j === j));

    await go(at('set-first', 2));
    await expect(cell(page, 2, 0)).toHaveAttribute('data-state', 'boundary');
    await expect(page.getByTestId('triangle-calc')).toHaveText(/Boundary element = 1/);

    await go(at('read-parents', 4, 2));
    await expect(cell(page, 3, 1)).toHaveAttribute('data-state', 'parent');
    await expect(cell(page, 3, 2)).toHaveAttribute('data-state', 'parent');
    await expect(cell(page, 4, 2)).toHaveAttribute('data-state', 'current');
    await expect(cell(page, 4, 2)).toHaveText('?');
    await expect(page.getByTestId('triangle-calc')).toContainText('3 + 3 = ?');
    await app.next();
    await expect(page.getByTestId('triangle-calc')).toContainText('3 + 3 = 6');
    await app.next();
    await expect(cell(page, 4, 2)).toHaveAttribute('data-state', 'assigned');
    await expect(cell(page, 4, 2)).toHaveText('6');
    await app.next(); // j++: the parents are no longer marked
    await expect(cell(page, 3, 1)).toHaveAttribute('data-state', 'complete');
    await expect(cell(page, 4, 2)).toHaveAttribute('data-state', 'set');

    await go(steps.findIndex(s => s.triangle!.rowComplete && s.triangle!.i === 4));
    await expect(page.locator('[data-tri-row="4"]')).toHaveAttribute('data-row-state', 'row-complete');
    await expect(page.getByTestId('triangle-calc')).toContainText('Row 4 complete: [1, 4, 6, 4, 1]');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the listing, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      await enter(page, 3);
      const def = definition(ID);
      const SUM = { c: 'row[j] = triangle[i - 1][j - 1] + triangle[i - 1][j];', cpp: 'row[j] = triangle[i - 1][j - 1] + triangle[i - 1][j];', java: 'row.set(j, triangle.get(i - 1).get(j - 1) + triangle.get(i - 1).get(j));', python: 'row[j] = triangle[i - 1][j - 1] + triangle[i - 1][j]' };
      await expect(page.locator(`[data-line="${def.lineMap[lang]['assign-cell']}"]`)).toContainText(SUM[lang]);
      const steps = engine(3);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [numRows, last] of [
    [1, [1]],
    [2, [1, 1]],
    [7, [1, 6, 15, 20, 15, 6, 1]],
    [10, [1, 9, 36, 84, 126, 126, 84, 36, 9, 1]],
  ] as const) {
    test(`numRows = ${numRows} through the UI: the last row is ${last.join(' ')}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, numRows);
      await expect(page.locator('[data-tri-cell]')).toHaveCount((numRows * (numRows + 1)) / 2);
      await app.goToLastStep();
      await expect(page.getByTestId('triangle-result')).toBeVisible();
      await expect(page.locator('[data-tri-cell][data-state="result"]')).toHaveCount((numRows * (numRows + 1)) / 2);
      const values = await page.locator(`[data-tri-row="${numRows - 1}"] [data-tri-cell]`).evaluateAll(els => els.map(e => Number(e.getAttribute('data-value'))));
      expect(values).toEqual([...last]);
      await expect(page.getByTestId('triangle-array')).toHaveAttribute('data-rows-built', String(numRows));
    });
  }

  test('numRows outside 1 to 10, a decimal or anything not a whole number is refused next to the field with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [bad, message] of [
      ['0', '"numRows" (0) is out of range — use values from 1 to 10.'],
      ['11', '"numRows" (11) is out of range — use values from 1 to 10.'],
      ['-2', '"numRows" (-2) is out of range — use values from 1 to 10.'],
      ['2.5', 'is a decimal'],
      ['', 'Enter a value for "numRows".'],
      ['abc', 'is not a whole number'],
    ]) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    // the triangle drawn is still the last valid one
    await expect(page.locator('[data-tri-cell]')).toHaveCount(15);
    await field(page).fill('6');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Play runs to the result; Previous steps back; Reset returns to the empty triangle', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, 3);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('triangle-result')).toHaveText("Pascal's Triangle with 3 rows: [[1], [1, 1], [1, 2, 1]]", { timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine(3).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('triangle-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-tri-cell][data-state="pending"]')).toHaveCount(6);
    await expect(page.getByTestId('triangle-array')).toHaveAttribute('data-rows-built', '0');
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): ten rows fit, every number readable inside its cell, no horizontal page scroll`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      await enter(page, 10);
      await app.goToLastStep();
      await expect(page.getByTestId('triangle-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const grid = (await page.getByTestId('triangle-grid').boundingBox())!;
      expect(grid.x).toBeGreaterThanOrEqual(0);
      expect(grid.x + grid.width).toBeLessThanOrEqual(width);
      const boxes = await page.locator('[data-tri-cell]').evaluateAll(els =>
        els.map(e => ({ cell: e.getAttribute('data-tri-cell'), ...JSON.parse(JSON.stringify(e.getBoundingClientRect())), fits: e.scrollWidth <= e.clientWidth }))
      );
      expect(boxes).toHaveLength(55);
      for (const b of boxes) {
        expect(b.left, b.cell).toBeGreaterThanOrEqual(grid.x - 0.5);
        expect(b.right, b.cell).toBeLessThanOrEqual(grid.x + grid.width + 0.5);
        expect(b.fits, `${b.cell}: the number overflows its cell`).toBe(true);
      }
      // the bottom row is drawn whole, below the top row (nothing clipped)
      const top = (await cell(page, 0, 0).boundingBox())!;
      const bottom = (await cell(page, 9, 4).boundingBox())!;
      expect(bottom.y).toBeGreaterThan(top.y);
      await expect(cell(page, 9, 4)).toBeVisible();
      await expect(cell(page, 9, 4)).toHaveText('126');
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on a boundary cell, the parents and their sum, and the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      const steps = engine(5);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      let at = 0;
      for (const index of [steps.findIndex(s => s.codeRef === 'set-first' && s.triangle!.i === 2), steps.findIndex(s => s.codeRef === 'add-parents')]) {
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
