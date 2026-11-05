import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * N-Queens through the real UI: n is typed into the number field; what each step shows (every square's state, the
 * square being checked, the queens, the call stack, the solutions and the highlighted line) is checked against the
 * engine's own trace for the same n. The solutions themselves are checked against a brute force for n ≤ 7 and the known
 * counts up to n = 8 in the unit tests (nQueens.test.ts).
 */
const ID = 'backtracking-n-queens' as const;
const engine = (n: number) => definition(ID).generateSteps([n]);
const field = (page: Page) => page.locator('#number-input-n');

async function enter(page: Page, n: number) {
  await field(page).fill(String(n));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(n).length));
}

interface BoardUi {
  step: number;
  line: number | null;
  squares: string[];
  focus: string;
  queens: string;
  calls: string[];
  solutions: string[];
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<BoardUi[]> =>
  page.evaluate(async count => {
    const read = (): BoardUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const focus = document.querySelector<HTMLElement>('[data-testid="board-focus"]')!;
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        squares: [...document.querySelectorAll<HTMLElement>('td[data-square]')].filter(td => td.dataset.square !== 'empty').map(td => `${td.dataset.row},${td.dataset.col}:${td.dataset.square}`),
        focus: `${focus.dataset.row}|${focus.dataset.col}|${focus.dataset.status}`,
        queens: document.querySelector<HTMLElement>('[data-testid="board-queens"]')!.dataset.queens!,
        calls: [...document.querySelectorAll<HTMLElement>('[data-frame-row]')].map(f => `${f.dataset.frameRow}:${f.dataset.frameStatus}`),
        solutions: [...document.querySelectorAll<HTMLElement>('[data-solution]')].map(s => s.dataset.solution!),
        result: document.querySelector('[data-testid="board-result"]')?.textContent?.trim() ?? null,
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

/** what the engine says a step shows, in the collector's shape */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): BoardUi {
  const b = s.board!;
  const squares: string[] = [];
  for (let r = 0; r < b.n; r++) {
    for (let c = 0; c < b.n; c++) {
      const state =
        b.cell && b.cell.row === r && b.cell.col === c ? b.cell.status : b.attacker && b.attacker.row === r && b.attacker.col === c ? 'attacker' : b.queens[r] === c ? 'queen' : 'empty';
      if (state !== 'empty') squares.push(`${r},${c}:${state}`);
    }
  }
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    squares,
    focus: b.cell ? `${b.cell.row}|${b.cell.col}|${b.cell.status}` : '||',
    queens: b.queens.join(','),
    calls: b.calls.map((r, i) => `${r}:${i === b.calls.length - 1 ? 'active' : 'waiting'}`),
    solutions: b.solutions.map(x => x.join(',')),
    result: s.type === 'complete' ? s.outcomeText! : null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('N-Queens Problem', () => {
  test('listed under BACKTRACKING; opens a 4 × 4 board with n = 4 in its field and no array size to choose', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('BACKTRACKING')).toBeLessThan(text.indexOf('N-Queens Problem'));
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('N-Queens Problem');
    await expect(page.getByTestId('board-visualizer')).toHaveAttribute('data-n', '4');
    await expect(page.locator('td[data-square]')).toHaveCount(16);
    await expect(field(page)).toHaveValue('4');
    await expect(app.sizeSelect).toHaveCount(0);
    await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
  });

  test('every step of n = 4: squares, square checked, queens, call stack, solutions and code line, as traced; 2 solutions', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(4);
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(steps.length));
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('board-result')).toHaveText('2 solutions for n = 4: [1, 3, 0, 2], [2, 0, 3, 1]');
  });

  for (const lang of ['c', 'java', 'python'] as const) {
    test(`the highlighted line follows the trace (${lang})`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      await enter(page, 4);
      const steps = engine(4);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(definition(ID), lang, s.codeRef)));
    });
  }

  // one test per board size, each stepping through its whole trace
  for (const [n, result] of [
    [1, '1 solution for n = 1: [0]'],
    [2, 'No solution for n = 2: 2 queens cannot be placed without attacking each other'],
    [3, 'No solution for n = 3: 3 queens cannot be placed without attacking each other'],
    [5, '10 solutions for n = 5: [0, 2, 4, 1, 3], [0, 3, 1, 4, 2], [1, 3, 0, 2, 4], [1, 4, 2, 0, 3], [2, 0, 3, 1, 4], [2, 4, 1, 3, 0], [3, 0, 2, 4, 1], [3, 1, 4, 2, 0], [4, 1, 3, 0, 2], [4, 2, 0, 3, 1]'],
  ] as const) {
    test(`n = ${n}: runs to its result`, async ({ app, page }) => {
      // stepping through the whole trace clicks Next once per step (940 steps for n = 5): the budget follows the length
      // (about 55 s in Chromium for n = 5; WebKit is two to three times slower)
      test.setTimeout(engine(n).length * 250 + 30_000);
      await app.selectAlgorithm(ID);
      await enter(page, n);
      await expect(page.locator('td[data-square]')).toHaveCount(n * n);
      await app.goToLastStep();
      await expect(page.getByTestId('board-result')).toHaveText(result);
      await expect(page.getByTestId('board-solutions')).toHaveAttribute('data-count', String(engine(n).at(-1)!.board!.solutions.length));
    });
  }

  test('n = 8: the whole trace is loaded (every try is a step), an 8 × 8 board is drawn, and the first steps play as traced', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, 8);
    await expect(page.locator('td[data-square]')).toHaveCount(64);
    const steps = engine(8);
    expect(steps.at(-1)!.board!.solutions).toHaveLength(92);
    const shown = await collect(page, 40);
    for (const [k, s] of steps.slice(0, 40).entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
  });

  test('n outside 1 to 8, or not a whole number, is refused next to the field with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const bad of ['0', '9', '-1', '2.5', '']) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toBeVisible();
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await field(page).fill('9');
    await expect(page.getByTestId('input-error')).toContainText('"n"');
    await field(page).fill('6');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Randomize picks a valid n and runs it', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await page.getByRole('button', { name: 'Randomize' }).click();
    const n = Number(await field(page).inputValue());
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(8);
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(n).length));
    await expect(page.locator('td[data-square]')).toHaveCount(n * n);
  });

  test('Play runs to the result; Previous steps back; Reset returns to an empty board', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, 3);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('board-result')).toHaveText('No solution for n = 3: 3 queens cannot be placed without attacking each other', { timeout: 30_000 });
    const total = await app.totalSteps();
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('board-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('td[data-square]:not([data-square="empty"])')).toHaveCount(0);
  });

  test('phone width: the 8 × 8 board fits, with no horizontal page scroll', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm(ID);
    await enter(page, 8);
    await app.advance(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const board = (await page.getByTestId('board').boundingBox())!;
    expect(board.x).toBeGreaterThanOrEqual(0);
    expect(board.x + board.width).toBeLessThanOrEqual(390);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA at a conflict, at a placement and at the end: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      const steps = engine(4);
      const conflict = steps.findIndex(s => s.codeRef === 'conflict-column');
      const place = steps.findIndex((s, k) => k > conflict && s.codeRef === 'place');
      for (const target of [conflict, place]) {
        await app.advance(target - ((await app.stepNumber()) - 1));
        await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
        expect(await violations(page), `${theme} step ${target + 1}`).toEqual([]);
      }
      await app.goToLastStep();
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      expect(await violations(page), `${theme} end`).toEqual([]);
    });
  }
});
