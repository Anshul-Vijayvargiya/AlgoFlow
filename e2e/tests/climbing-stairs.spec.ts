import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Climbing Stairs through the real UI: n is typed into the number field; what each step shows (every stair's state and
 * ways, the variable tags, the rolling variables, the history and the highlighted line) is checked against the engine's
 * own trace for the same n. The answers themselves are checked against counting the sequences directly, and the four
 * listings are compiled and run, in the unit tests (climbingStairs.test.ts, scripts/__tests__/climbingStairsListings.test.ts).
 */
const ID = 'dp-climbing-stairs' as const;
const engine = (n: number) => definition(ID).generateSteps([n]);
const field = (page: Page) => page.locator('#number-input-n');
const stair = (page: Page, k: number) => page.locator(`[data-stair="${k}"]`);
const variable = (page: Page, name: string) => page.locator(`[data-var="${name}"]`);

async function enter(page: Page, n: number) {
  await field(page).fill(String(n));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(n).length));
}

interface StairsUi {
  step: number;
  line: number | null;
  stairs: string[];
  tags: string[];
  vars: string[];
  history: string[];
  result: boolean;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<StairsUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): StairsUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        stairs: [...document.querySelectorAll<HTMLElement>('[data-stair]')].map(e => `${e.dataset.stair}=${e.dataset.ways}:${e.dataset.state}`),
        tags: [...document.querySelectorAll<HTMLElement>('[data-stair-tag]')].filter(e => e.textContent).map(e => `${e.dataset.stairTag}:${e.textContent}`),
        vars: [...document.querySelectorAll<HTMLElement>('[data-var]')].map(e => `${e.dataset.var}=${e.dataset.value}`),
        history: [...document.querySelectorAll<HTMLElement>('[data-history]')].map(e => e.dataset.history!),
        result: Boolean(q('stairs-result')),
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
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): StairsUi {
  const v = s.stairs!;
  const known = new Map(v.history.map(h => [h.step, h.ways]));
  const computing = v.stage === 'loop' && v.i !== null && v.i <= v.n ? v.i : null;
  const live = v.stage !== 'done';
  const stairs: string[] = [];
  const tags: string[] = [];
  for (let st = 1; st <= v.n; st++) {
    const state = v.result && st === v.n ? 'result' : computing === st ? 'current' : live && v.prev1Of === st ? 'prev1' : live && v.prev2Of === st ? 'prev2' : known.has(st) ? 'known' : 'unknown';
    stairs.push(`${st}=${known.get(st) ?? ''}:${state}`);
    const t = [live && v.prev2Of === st ? 'prev2' : '', live && v.prev1Of === st ? 'prev1' : '', computing === st ? 'i' : ''].filter(Boolean);
    if (t.length) tags.push(`${st}:${t.join(' ')}`);
  }
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    stairs,
    tags,
    vars: [`prev2=${v.prev2 ?? ''}`, `prev1=${v.prev1 ?? ''}`, `current=${v.current ?? ''}`],
    history: v.history.map(h => `${h.step},${h.ways}`),
    result: Boolean(v.result),
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Climbing Stairs', () => {
  test("listed under DYNAMIC PROGRAMMING after Pascal's Triangle II (not Coming Soon); opens the staircase with n = 5", async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('DYNAMIC PROGRAMMING')).toBeGreaterThan(-1);
    expect(at("Pascal's Triangle II")).toBeLessThan(at('Climbing Stairs'));
    expect(at('Climbing Stairs')).toBeLessThan(at('Fibonacci (DP)'));
    await expect(app.sidebar.getByRole('button', { name: 'Climbing Stairs', exact: true })).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Climbing Stairs');
    await expect(page.getByTestId('stairs-visualizer')).toBeVisible();
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(field(page)).toHaveValue('5');
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(5).length));
    await expect(page.locator('[data-stair]')).toHaveCount(5);
    await expect(page.locator('[data-stair][data-state="unknown"]')).toHaveCount(5);
  });

  test('n = 5: every step as traced, stair by stair, ending with 8 ways', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(5);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('stairs-result')).toHaveText('Climbing a 5-step staircase has 8 distinct ways.');
  });

  test('a pass step by step: step i computed from prev1 and prev2, then both shift up', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(5);
    const go = async (index: number) => {
      await app.advance(index - ((await app.stepNumber()) - 1));
      await app.expectStep(index + 1);
    };
    await go(steps.findIndex(s => s.codeRef === 'compute-current' && s.stairs!.i === 4));
    await expect(stair(page, 4)).toHaveAttribute('data-state', 'current');
    await expect(stair(page, 3)).toHaveAttribute('data-state', 'prev1');
    await expect(stair(page, 2)).toHaveAttribute('data-state', 'prev2');
    await expect(page.getByTestId('stairs-calc')).toHaveText('current = prev1 + prev2 = 3 + 2 = 5');
    await expect(variable(page, 'current')).toHaveAttribute('data-value', '5');
    await app.next(); // prev2 = prev1
    await expect(variable(page, 'prev2')).toHaveAttribute('data-value', '3');
    await app.next(); // prev1 = current
    await expect(variable(page, 'prev1')).toHaveAttribute('data-value', '5');
    await expect(page.locator('[data-stair-tag="4"]')).toHaveText('prev1 i');
    await expect(page.getByTestId('stairs-history')).toContainText('display only');
    await expect(page.locator('[data-history]')).toHaveCount(4);
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the two rolling variables, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      await enter(page, 4);
      const def = definition(ID);
      const SUM = { c: 'int current = prev1 + prev2;', cpp: 'int current = prev1 + prev2;', java: 'int current = prev1 + prev2;', python: 'current = prev1 + prev2' };
      await expect(page.locator(`[data-line="${def.lineMap[lang]['compute-current']}"]`)).toContainText(SUM[lang]);
      const steps = engine(4);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [n, ways] of [
    [1, 1],
    [2, 2],
    [3, 3],
    [10, 89],
  ] as const) {
    test(`n = ${n} through the UI: ${ways} way${ways === 1 ? '' : 's'}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, n);
      await expect(page.locator('[data-stair]')).toHaveCount(n);
      await app.goToLastStep();
      await expect(page.getByTestId('stairs-result')).toHaveText(`Climbing a ${n}-step staircase has ${ways} distinct way${ways === 1 ? '' : 's'}.`);
      await expect(stair(page, n)).toHaveAttribute('data-state', 'result');
      await expect(stair(page, n)).toHaveAttribute('data-ways', String(ways));
    });
  }

  test('n outside 1 to 10, a decimal or anything not a whole number is refused next to the field with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [bad, message] of [
      ['0', '"n" (0) is out of range — use values from 1 to 10.'],
      ['-2', '"n" (-2) is out of range — use values from 1 to 10.'],
      ['11', '"n" (11) is out of range — use values from 1 to 10.'],
      ['2.5', 'is a decimal'],
      ['', 'Enter a value for "n".'],
      ['abc', 'is not a whole number'],
    ]) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await expect(page.locator('[data-stair]')).toHaveCount(5);
    await field(page).fill('7');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Play runs to the result; Previous steps back; Reset returns to the empty staircase', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, 4);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('stairs-result')).toHaveText('Climbing a 4-step staircase has 5 distinct ways.', { timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine(4).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('stairs-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-stair][data-state="unknown"]')).toHaveCount(4);
    await expect(page.locator('[data-history]')).toHaveCount(0);
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): ten stairs fit, every value readable on its stair, no horizontal page scroll`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      await enter(page, 10);
      await app.goToLastStep();
      await expect(page.getByTestId('stairs-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const box = (await page.getByTestId('stairs-steps').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const fits = await page.locator('[data-stair]').evaluateAll(els => els.map(e => ({ k: e.getAttribute('data-stair'), fits: e.scrollWidth <= e.clientWidth })));
      expect(fits).toHaveLength(10);
      for (const f of fits) expect(f.fits, `stair ${f.k}: the value overflows`).toBe(true);
      await expect(stair(page, 10)).toHaveText('89');
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on the base values, a computation and the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      const steps = engine(5);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      let at = 0;
      for (const index of [steps.findIndex(s => s.codeRef === 'set-prev1'), steps.findIndex(s => s.codeRef === 'compute-current')]) {
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
