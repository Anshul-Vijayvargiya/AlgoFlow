import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Move Zeroes through the real UI: the array is typed into the array field; what each step shows (every cell's value
 * and state, the pointers, the decision note and the highlighted line) is checked against the engine's own trace for the
 * same array. The results themselves are checked against a filter-and-pad reference, and the four listings are compiled
 * and run, in the unit tests (moveZeroes.test.ts, scripts/__tests__/moveZeroesListings.test.ts).
 */
const ID = 'array-move-zeroes' as const;
const engine = (nums: readonly number[]) => definition(ID).generateSteps([...nums]);
const field = (page: Page) => page.locator('#array-input');
const cell = (page: Page, k: number) => page.locator(`[data-cell="${k}"]`);

async function enter(page: Page, nums: readonly number[]) {
  await field(page).fill(nums.join(', '));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(nums).length));
}

interface CellsUi {
  step: number;
  line: number | null;
  cells: string[];
  pointers: string[];
  note: string;
  result: boolean;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<CellsUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): CellsUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        cells: [...document.querySelectorAll<HTMLElement>('[data-cell]')].map(e => `${e.dataset.cell}=${e.dataset.value}:${e.dataset.state}`),
        pointers: [...document.querySelectorAll<HTMLElement>('[data-pointer]')].map(e => `${e.closest<HTMLElement>('[data-pointers]')!.dataset.pointers}:${e.dataset.pointer}`),
        note: q('cells-note')?.dataset.kind ?? '',
        result: Boolean(q('cells-result')),
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
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): CellsUi {
  const v = s.cells!;
  const cells = v.nums.map((value, c) => {
    let state: string;
    if (v.result) state = c < v.kept ? 'final-value' : 'final-zero';
    else if (v.swapped?.includes(c)) state = 'swapped';
    else if (v.pair?.same && v.pair.fast === c) state = 'in-place';
    else if (v.examined?.index === c) state = v.examined.zero ? 'zero-found' : 'nonzero-found';
    else if (c < v.kept) state = 'kept';
    else if (v.slow !== null && v.fast !== null && c >= v.slow && c < v.fast) state = 'gap';
    else if (v.fast !== null && c > v.fast) state = 'unvisited';
    else state = 'normal';
    return `${c}=${value}:${state}`;
  });
  const pointers = v.nums.flatMap((_, c) => [v.slow === c ? `${c}:slow` : '', v.fast === c ? `${c}:fast` : ''].filter(Boolean));
  const note = v.swapped
    ? 'swap'
    : v.pair
      ? v.pair.same
        ? 'in-place'
        : 'swap-needed'
      : v.examined
        ? v.examined.zero
          ? 'zero'
          : 'nonzero'
        : v.moved === 'slow' && v.slow !== null && v.slow > 0
          ? 'advance-slow'
          : '';
  return { step: k + 1, line: resolveCodeRef(definition(ID), lang, s.codeRef), cells, pointers, note, result: Boolean(v.result) };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Move Zeroes', () => {
  test('listed under ARRAYS after Remove Duplicates (not Coming Soon); opens the cells with [0, 1, 0, 3, 12]', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('ARRAYS')).toBeGreaterThan(-1);
    expect(at('Remove Duplicates from Sorted Array')).toBeLessThan(at('Move Zeroes'));
    expect(at('Move Zeroes')).toBeLessThan(at('STRINGS'));
    await expect(app.sidebar.getByRole('button', { name: 'Move Zeroes', exact: true })).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Move Zeroes');
    await expect(page.getByTestId('cells-visualizer')).toBeVisible();
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(field(page)).toHaveValue('0, 1, 0, 3, 12');
    await expect(page.locator('[data-cell]')).toHaveCount(5);
    // indexed cells, not the bar view
    await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
    await expect(page.locator('[data-bar-index]')).toHaveCount(0);
  });

  test('[0, 1, 0, 3, 12]: every step as traced, cell by cell, ending with [1, 3, 12, 0, 0]', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine([0, 1, 0, 3, 12]);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('cells-result')).toHaveText('Moved 2 zeroes to the end: [1, 3, 12, 0, 0]');
  });

  test('a zero skipped, a swap, and slow == fast with no swap', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine([0, 1, 0, 3, 12]);
    const go = async (index: number) => {
      await app.advance(index - ((await app.stepNumber()) - 1));
      await app.expectStep(index + 1);
    };
    await go(steps.findIndex(s => s.codeRef === 'check-nonzero'));
    await expect(cell(page, 0)).toHaveAttribute('data-state', 'zero-found');
    await expect(page.getByTestId('cells-note')).toContainText('a zero, skip it');

    await go(steps.findIndex(s => s.codeRef === 'swap'));
    await expect(cell(page, 0)).toHaveAttribute('data-state', 'swapped');
    await expect(cell(page, 1)).toHaveAttribute('data-state', 'swapped');
    await expect(page.getByTestId('cells-array')).toHaveAttribute('data-values', '1,0,0,3,12');
    await expect(page.locator('[data-pointers="0"] [data-pointer="slow"]')).toBeVisible();
    await expect(page.locator('[data-pointers="1"] [data-pointer="fast"]')).toBeVisible();

    // [5, 0]: 5 is already in place
    await enter(page, [5, 0]);
    const same = engine([5, 0]);
    await app.advance(same.findIndex(s => s.codeRef === 'check-distinct'));
    await expect(cell(page, 0)).toHaveAttribute('data-state', 'in-place');
    await expect(page.getByTestId('cells-note')).toContainText('already in place, no swap');
    await app.next();
    await expect(page.getByTestId('cells-array')).toHaveAttribute('data-values', '5,0');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the two-pointer loop, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const def = definition(ID);
      const CHECK = { c: 'if (slow != fast) {', cpp: 'if (slow != fast) {', java: 'if (slow != fast) {', python: 'if slow != fast:' };
      await expect(page.locator(`[data-line="${def.lineMap[lang]['check-distinct']}"]`)).toContainText(CHECK[lang]);
      const steps = engine([0, 1, 0, 3, 12]);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [name, input, output] of [
    ['zeroes at the beginning', [0, 0, 1], [1, 0, 0]],
    ['no zeroes', [1, 2, 3], [1, 2, 3]],
    ['all zeroes', [0, 0, 0], [0, 0, 0]],
    ['a single value', [0], [0]],
    ['negative values and the ends of the range', [0, -999, 0, 999, -5], [-999, 999, -5, 0, 0]],
  ] as const) {
    test(`through the UI, ${name}: [${input.join(', ')}] → [${output.join(', ')}]`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, input);
      await app.goToLastStep();
      await expect(page.getByTestId('cells-result')).toBeVisible();
      await expect(page.getByTestId('cells-array')).toHaveAttribute('data-values', output.join(','));
    });
  }

  test('an empty array, more than 10 values, values outside -999 to 999 or not whole numbers are refused with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [bad, message] of [
      ['', 'needs at least 1'],
      ['1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11', 'Too many values (11). The visualizer supports at most 10.'],
      ['1000', 'out of range'],
      ['1.5', 'is a decimal'],
      ['1, x', 'is not a whole number'],
    ]) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await expect(page.locator('[data-cell]')).toHaveCount(5);
    await field(page).fill('0, 2');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Size offers up to 10; an array from another algorithm does not carry in', async ({ app, page }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([5, 0, 3, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('0, 1, 0, 3, 12');
    const sizes = await page.getByRole('combobox', { name: 'Array size' }).locator('option').allTextContents();
    expect(sizes.every(x => Number(x) <= 10)).toBe(true);
  });

  test('Play runs to the result; Previous steps back; Reset returns to the input', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('cells-result')).toHaveText('Moved 2 zeroes to the end: [1, 3, 12, 0, 0]', { timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine([0, 1, 0, 3, 12]).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('cells-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.getByTestId('cells-array')).toHaveAttribute('data-values', '0,1,0,3,12');
    await expect(page.locator('[data-pointer]')).toHaveCount(0);
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): ten cells up to -999 stay readable, wrapping instead of scrolling`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      const nums = [-999, 0, 999, 0, -5, 0, 7, 0, 1, 0];
      await enter(page, nums);
      await app.advance(engine(nums).findIndex(s => s.codeRef === 'swap'));
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
      await app.goToLastStep();
      await expect(page.getByTestId('cells-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(cell(page, 0)).toHaveText('-999');
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on a zero, a swap and the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      const steps = engine([0, 1, 0, 3, 12]);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      let at = 0;
      for (const index of [steps.findIndex(s => s.codeRef === 'check-nonzero'), steps.findIndex(s => s.codeRef === 'swap')]) {
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
