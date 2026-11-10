import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Pascal's Triangle II through the real UI: rowIndex is typed into the number field; what each step shows (every cell's
 * value and state, the j pointers, the calculation and the highlighted line) is checked against the engine's own trace
 * for the same rowIndex. The rows themselves are checked against the binomial coefficients, and the four listings are
 * compiled and run, in the unit tests (pascalsTriangleII.test.ts, scripts/__tests__/pascalsTriangleIIListings.test.ts).
 */
const ID = 'dp-pascals-triangle-ii' as const;
const engine = (rowIndex: number) => definition(ID).generateSteps([rowIndex]);
const field = (page: Page) => page.locator('#number-input-rowIndex');
const cell = (page: Page, k: number) => page.locator(`[data-dp-cell="${k}"]`);

async function enter(page: Page, rowIndex: number) {
  await field(page).fill(String(rowIndex));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(rowIndex).length));
}

interface RowUi {
  step: number;
  line: number | null;
  cells: string[];
  pointers: string[];
  calc: string;
  direction: boolean;
  result: boolean;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<RowUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): RowUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        cells: [...document.querySelectorAll<HTMLElement>('[data-dp-cell]')].map(e => `${e.dataset.dpCell}=${e.dataset.value}:${e.dataset.state}`),
        pointers: [...document.querySelectorAll<HTMLElement>('[data-dp-pointer]')].filter(e => e.textContent).map(e => `${e.dataset.dpPointer}:${e.textContent}`),
        calc: q('dp-row-calc')?.dataset.kind ?? '',
        direction: Boolean(q('dp-row-direction')),
        result: Boolean(q('dp-row-result')),
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
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): RowUi {
  const v = s.dpRow!;
  const backward = v.j !== null && v.i !== null && v.i >= 2 && !v.rowComplete;
  const cells = Array.from({ length: v.rowIndex + 1 }, (_, c) => {
    let state: string;
    if (c >= v.row.length) state = 'pending';
    else if (v.result) state = 'result';
    else if (v.rowComplete) state = 'row-complete';
    else if (v.focus?.index === c) state = v.focus.kind === 'appended' ? 'appended' : v.focus.kind === 'updated' ? 'updated' : 'current';
    else if (v.operands && v.focus && c === v.focus.index - 1) state = 'addend';
    else if (v.fresh.includes(c)) state = 'fresh';
    else if (backward && c >= 1 && c < v.i!) state = 'old';
    else state = 'normal';
    return `${c}=${state === 'pending' ? '' : v.row[c]}:${state}`;
  });
  const pointers = backward && v.j !== null ? [...(v.j >= 1 ? [`${v.j - 1}:j − 1`] : []), `${v.j}:j`] : [];
  const calc = v.focus ? v.focus.kind : v.rowComplete && v.i !== null ? 'row-complete' : '';
  return { step: k + 1, line: resolveCodeRef(definition(ID), lang, s.codeRef), cells, pointers, calc, direction: backward, result: Boolean(v.result) };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe("Pascal's Triangle II", () => {
  test("listed under DYNAMIC PROGRAMMING right after Pascal's Triangle (not Coming Soon); opens the row with rowIndex = 3", async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('DYNAMIC PROGRAMMING')).toBeGreaterThan(-1);
    expect(at('DYNAMIC PROGRAMMING')).toBeLessThan(at("Pascal's Triangle II"));
    expect(at("Pascal's Triangle II")).toBeLessThan(at('Fibonacci (DP)'));
    await expect(app.sidebar.getByRole('button', { name: "Pascal's Triangle II", exact: true })).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText("Pascal's Triangle II");
    await expect(page.getByTestId('dp-row-visualizer')).toBeVisible();
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(field(page)).toHaveValue('3');
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(3).length));
    await expect(page.locator('[data-dp-cell]')).toHaveCount(4);
    await expect(page.locator('[data-dp-cell][data-state="pending"]')).toHaveCount(4);
  });

  test('rowIndex = 4: every step as traced, cell by cell, ending with [1, 4, 6, 4, 1]', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, 4);
    const steps = engine(4);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('dp-row-result')).toHaveText("Row 4 of Pascal's Triangle: [1, 4, 6, 4, 1]");
  });

  test('the backward updates of row 3: row[2] first, then row[1], each adding the old value on its left', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(3);
    const go = async (index: number) => {
      await app.advance(index - ((await app.stepNumber()) - 1));
      await app.expectStep(index + 1);
    };
    const at = (codeRef: string, j: number) => steps.findIndex(s => s.codeRef === codeRef && s.dpRow!.i === 3 && s.dpRow!.j === j);

    await go(steps.findIndex(s => s.codeRef === 'append-one' && s.dpRow!.i === 3));
    await expect(cell(page, 3)).toHaveAttribute('data-state', 'appended');
    await expect(page.getByTestId('dp-row-calc')).toContainText('every row ends in 1');

    await go(at('read-values', 2));
    await expect(cell(page, 2)).toHaveAttribute('data-state', 'current');
    await expect(cell(page, 1)).toHaveAttribute('data-state', 'addend');
    await expect(page.getByTestId('dp-row-direction')).toBeVisible();
    await expect(page.locator('[data-dp-pointer="2"]')).toHaveText('j');
    await expect(page.locator('[data-dp-pointer="1"]')).toHaveText('j − 1');
    await app.next();
    await expect(page.getByTestId('dp-row-calc')).toHaveText(/row\[2\] = row\[2\] \+ row\[1\]\s+= 1 \+ 2\s+= 3/);
    await app.next();
    await expect(cell(page, 2)).toHaveAttribute('data-value', '3');
    await expect(cell(page, 2)).toHaveAttribute('data-state', 'updated');
    // row[1] is still 2 (the previous row): the next update, to its left, adds it
    await expect(cell(page, 1)).toHaveAttribute('data-value', '2');

    await go(at('update-cell', 1));
    await expect(cell(page, 1)).toHaveAttribute('data-value', '3');
    await expect(cell(page, 2)).toHaveAttribute('data-state', 'fresh');
    await expect(page.getByTestId('dp-row-array')).toHaveAttribute('data-values', '1,3,3,1');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the backward loop, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      await enter(page, 3);
      const def = definition(ID);
      const LOOP = { c: 'for (int j = i - 1; j >= 1; j--) {', cpp: 'for (int j = i - 1; j >= 1; j--) {', java: 'for (int j = i - 1; j >= 1; j--) {', python: 'for j in range(i - 1, 0, -1):' };
      await expect(page.locator(`[data-line="${def.lineMap[lang]['col-loop']}"]`)).toContainText(LOOP[lang]);
      const steps = engine(3);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [rowIndex, row] of [
    [0, [1]],
    [1, [1, 1]],
    [5, [1, 5, 10, 10, 5, 1]],
    [9, [1, 9, 36, 84, 126, 126, 84, 36, 9, 1]],
  ] as const) {
    test(`rowIndex = ${rowIndex} through the UI: ${row.join(', ')}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, rowIndex);
      await expect(page.locator('[data-dp-cell]')).toHaveCount(rowIndex + 1);
      await app.goToLastStep();
      await expect(page.getByTestId('dp-row-result')).toHaveText(`Row ${rowIndex} of Pascal's Triangle: [${row.join(', ')}]`);
      await expect(page.locator('[data-dp-cell][data-state="result"]')).toHaveCount(rowIndex + 1);
      await expect(page.getByTestId('dp-row-array')).toHaveAttribute('data-values', row.join(','));
    });
  }

  test('rowIndex outside 0 to 9, a decimal or anything not a whole number is refused next to the field with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [bad, message] of [
      ['-1', '"rowIndex" (-1) is out of range — use values from 0 to 9.'],
      ['10', '"rowIndex" (10) is out of range — use values from 0 to 9.'],
      ['1.5', 'is a decimal'],
      ['', 'Enter a value for "rowIndex".'],
      ['abc', 'is not a whole number'],
    ]) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await expect(page.locator('[data-dp-cell]')).toHaveCount(4);
    await field(page).fill('0');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Play runs to the result; Previous steps back; Reset returns to the empty row', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, 3);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('dp-row-result')).toHaveText("Row 3 of Pascal's Triangle: [1, 3, 3, 1]", { timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine(3).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('dp-row-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-dp-cell][data-state="pending"]')).toHaveCount(4);
    await expect(page.getByTestId('dp-row-array')).toHaveAttribute('data-values', '');
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): ten cells fit, every number readable inside its cell, no horizontal page scroll`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      await enter(page, 9);
      const steps = engine(9);
      // a step of the last pass: the calculation panel and the direction are shown too
      await app.advance(steps.findIndex(s => s.codeRef === 'add-values' && s.dpRow!.i === 9 && s.dpRow!.j === 4));
      await expect(page.getByTestId('dp-row-direction')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await app.goToLastStep();
      await expect(page.getByTestId('dp-row-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const cellsBox = (await page.getByTestId('dp-row-cells').boundingBox())!;
      expect(cellsBox.x).toBeGreaterThanOrEqual(0);
      expect(cellsBox.x + cellsBox.width).toBeLessThanOrEqual(width);
      const boxes = await page.locator('[data-dp-cell]').evaluateAll(els => els.map(e => ({ cell: e.getAttribute('data-dp-cell'), fits: e.scrollWidth <= e.clientWidth })));
      expect(boxes).toHaveLength(10);
      for (const b of boxes) expect(b.fits, `${b.cell}: the number overflows its cell`).toBe(true);
      await expect(cell(page, 4)).toHaveText('126');
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on a boundary insertion, an update and the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      const steps = engine(3);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      let at = 0;
      for (const index of [steps.findIndex(s => s.codeRef === 'append-one' && s.dpRow!.i === 3), steps.findIndex(s => s.codeRef === 'add-values' && s.dpRow!.i === 3)]) {
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
