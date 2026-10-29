import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type AlgorithmId, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import type { VisualizerApp } from '../support/visualizerApp';

/**
 * The binary searches over whole numbers (Fundamentals): Valid Perfect Square, Sqrt(x) and Arranging Coins, through
 * the real UI. Every expectation of what a step shows comes from the engine's own trace for the same input; the
 * answers themselves are covered by the unit tests (numberSearch.test.ts).
 */
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];
const SEARCHES = [
  { id: 'valid-perfect-square', field: 'num' },
  { id: 'sqrt-x', field: 'x' },
  { id: 'arranging-coins', field: 'n' },
] as const satisfies readonly { id: AlgorithmId; field: string }[];

const field = (page: Page, name: string) => page.locator(`#number-input-${name}`);
const visualize = (page: Page) => page.locator('#apply-input');

async function enter(app: VisualizerApp, name: string, value: number | string, total: number) {
  await field(app.page, name).fill(String(value));
  await visualize(app.page).click();
  await app.expectStep(1);
  await app.expectTotal(total);
}

const engineCells = (s: ExecutionStep) =>
  Object.fromEntries((s.numbers?.cells ?? []).map(c => [c.name, { value: c.value === null ? '—' : String(c.value), role: c.role ?? '' }]));

/** what the search panel should show for an engine step (null before the search starts) */
const engineSearch = (s: ExecutionStep) => {
  const v = s.numbers?.search;
  if (!v) return null;
  const current = v.mid !== undefined && v.probes.length > 0 && v.probes[v.probes.length - 1].mid === v.mid ? v.probes.length - 1 : -1;
  return {
    lo: v.lo,
    hi: v.hi,
    mid: v.mid ?? null,
    range: v.lo > v.hi ? `Search over: lo = ${v.lo} > hi = ${v.hi}` : `Searching lo = ${v.lo} … hi = ${v.hi}${v.mid !== undefined ? `, mid = ${v.mid}` : ''}`,
    probes: v.probes.map((p, k) => ({ mid: p.mid, relation: p.relation, current: k === current, text: `mid = ${p.mid} · ${v.valueLabel} = ${p.value} ${p.relation} ${v.target}` })),
  };
};

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.locator('#header-theme-select').selectOption(theme);
  await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
}

test.describe('sidebar search', () => {
  test('each is found by name in the sidebar search and opens its own visualization', async ({ app, page }) => {
    for (const [query, heading] of [['perfect', 'Valid Perfect Square'], ['sqrt', 'Sqrt(x)'], ['coins', 'Arranging Coins']] as const) {
      const search = app.sidebar.getByRole('searchbox');
      await search.fill(query);
      const hit = app.sidebar.getByRole('button', { name: new RegExp(`^${heading.replace(/[()]/g, '\\$&')}`) });
      await expect(hit).toBeVisible();
      await hit.click();
      await expect(app.heading).toHaveText(heading);
      await expect(page.getByTestId('number-visualizer')).toBeVisible();
      await search.fill('');
    }
  });
});

for (const { id, field: name } of SEARCHES) {
  test.describe(definition(id).name, () => {
    test('every step: value cards, the range, mid and probes exactly as the engine traced them', async ({ app, page }) => {
      await app.selectAlgorithm(id);
      await expect(app.sizeSelect).toHaveCount(0);
      // 26: not a perfect square, √26 → 5, 26 coins → 6 rows; exercises both directions of the search
      const steps = definition(id).generateSteps([26]);
      await enter(app, name, 26, steps.length);
      const shown = await app.collectStates(steps.length);
      expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
      for (const [k, s] of steps.entries()) {
        const view = shown[k].numbers!;
        expect(view.cells, `step ${k + 1}`).toEqual(engineCells(s));
        expect(view.search, `step ${k + 1}`).toEqual(engineSearch(s));
        expect(view.operation, `step ${k + 1}`).toBe(s.actionLabel ?? null);
      }
      const end = steps[steps.length - 1].numbers!.result!;
      await expect(page.getByTestId('number-result')).toHaveAttribute('data-result-kind', end.kind);
      await expect(page.getByTestId('number-result')).toHaveText(end.text);
    });

    // one test per language (as for the Prime Number Checker), so each stays short on a slow browser
    for (const lang of LANGUAGES) {
      test(`the highlighted code line follows the trace (${lang})`, async ({ app }) => {
        await app.selectAlgorithm(id);
        await app.setLanguage(lang);
        // 16 (a perfect square: the early return), then 0 (a single probe)
        for (const v of [16, 0]) {
          const steps = definition(id).generateSteps([v]);
          await enter(app, name, v, steps.length);
          const lines = steps.map(s => resolveCodeRef(definition(id), lang, s.codeRef!));
          expect(lines.every(n => n !== null), `${lang}: every step has a line`).toBe(true);
          const states = await app.collectStates(steps.length);
          expect(states.map(u => u.activeLine?.n ?? null), `${v} ${lang}`).toEqual(lines);
        }
      });
    }

    test('2^31 - 1 runs, with exact 64-bit products; one more is refused next to the field', async ({ app, page }) => {
      await app.selectAlgorithm(id);
      const steps = definition(id).generateSteps([2147483647]);
      await enter(app, name, 2147483647, steps.length);
      await app.goToLastStep();
      await expect(page.getByTestId('number-result')).toHaveText(steps[steps.length - 1].numbers!.result!.text);
      const first = (await app.state()).numbers!.search!.probes[0];
      expect(first.text).toMatch(/^mid = 1073741823 · .* = (1152921502459363329|576460751766552576) > 2147483647$/);

      const input = field(page, name);
      for (const [text, message] of [
        ['2147483648', `"${name}" (2147483648) is out of range`],
        ['-1', `"${name}" (-1) is out of range`],
        ['4.5', 'is a decimal'],
        ['', `Enter a value for "${name}".`],
      ]) {
        await input.fill(text);
        await expect(app.inputError).toContainText(message);
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await expect(visualize(page)).toBeDisabled();
      }
      await input.fill('0');
      await expect(app.inputError).toHaveCount(0);
      await expect(visualize(page)).toBeEnabled();
    });
  });
}

test.describe('playback and layout', () => {
  test('Play runs Sqrt(x) to its answer; Previous steps back through the probes; Reset returns to the start', async ({ app, page }) => {
    await app.selectAlgorithm('sqrt-x');
    const total = definition('sqrt-x').generateSteps([8]).length;
    await app.setSpeed('fast');
    await app.play();
    await app.expectStep(total);
    await expect(page.getByTestId('number-result')).toHaveText('Sqrt(8) = 2: 2² = 4 ≤ 8 < 3² = 9.');
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('number-result')).toHaveCount(0);
    expect((await app.state()).numbers!.search!.range).toBe('Search over: lo = 3 > hi = 2');
    await app.reset();
    await app.expectStep(1);
    await expect(page.getByTestId('number-search')).toHaveCount(0);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe (${theme} theme): mid-search with probes`, async ({ app, page }) => {
      await setTheme(page, theme);
      await app.selectAlgorithm('valid-perfect-square');
      await app.advance(6);
      await expect(page.locator('[data-testid="number-search"] li')).not.toHaveCount(0);
      expect(await violations(page)).toEqual([]);
    });

    test(`axe (${theme} theme): the final answer`, async ({ app, page }) => {
      await setTheme(page, theme);
      await app.selectAlgorithm('arranging-coins');
      await app.goToLastStep();
      await expect(page.getByTestId('number-result')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }

  test('phone width: no horizontal scroll, even with 19-digit products', async ({ app, page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const { id, field: name } of SEARCHES) {
      await app.selectAlgorithm(id);
      await enter(app, name, 2147483647, definition(id).generateSteps([2147483647]).length);
      await app.goToLastStep();
      await expect(page.getByTestId('number-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), id).toBeLessThanOrEqual(375);
      const rights = await page
        .locator('[data-number-cell], [data-testid="number-search"] li, [data-testid="number-result"], #apply-input')
        .evaluateAll(els => els.map(e => e.getBoundingClientRect().right));
      for (const right of rights) expect(right, id).toBeLessThanOrEqual(375);
    }
  });
});
