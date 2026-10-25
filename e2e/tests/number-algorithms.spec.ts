import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type AlgorithmId, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import type { VisualizerApp } from '../support/visualizerApp';

/**
 * The number algorithms (Fundamentals): Prime Number Checker and Swap of Two Numbers, through the real UI. Every
 * expectation of what a step shows comes from the engine's own trace for the same input (UI-to-engine consistency);
 * the algorithms' correctness is covered by the unit tests (primeCheck.test.ts, swapTwoNumbers.test.ts).
 */
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];

const field = (page: Page, name: string) => page.locator(`#number-input-${name}`);
const visualize = (page: Page) => page.locator('#apply-input');

/** types the values into the real fields and presses Visualize, then waits for the new trace's first step */
async function enter(app: VisualizerApp, values: Record<string, number | string>, total: number) {
  for (const [name, value] of Object.entries(values)) await field(app.page, name).fill(String(value));
  await visualize(app.page).click();
  await app.expectStep(1);
  await app.expectTotal(total);
}

const values = (c: Record<string, { value: string }>) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.value]));
/** the value cards as shown now: name → value text ("—" when not set yet) */
const cells = async (app: VisualizerApp) => values((await app.state()).numbers!.cells);
/** what the engine step says the cards show: name → { value, role } */
const engineCells = (s: ExecutionStep) =>
  Object.fromEntries((s.numbers?.cells ?? []).map(c => [c.name, { value: c.value === null ? '—' : String(c.value), role: c.role ?? '' }]));

/** walks the whole trace from step 1 (one in-page pass) and checks the highlighted code line of every step */
async function expectCodeLines(app: VisualizerApp, id: AlgorithmId, lang: ProgrammingLanguage, steps: ExecutionStep[]) {
  await app.setLanguage(lang);
  await app.reset();
  await app.expectStep(1);
  const lines = steps.map(s => resolveCodeRef(definition(id), lang, s.codeRef!));
  expect(lines.every(n => n !== null), `${lang}: every step has a line`).toBe(true);
  const shown = await app.collectStates(steps.length);
  expect(shown.map(u => u.activeLine?.n ?? null), lang).toEqual(lines);
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.locator('#header-theme-select').selectOption(theme);
  await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
}

test.describe('Fundamentals in the sidebar', () => {
  test('the category is listed last, after every existing one, with both algorithms in it', async ({ app }) => {
    const sidebar = app.sidebar;
    const names = await sidebar.getByRole('button').evaluateAll(els => els.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
    expect(names.slice(-2)).toEqual([expect.stringMatching(/^Prime Number Checker/), expect.stringMatching(/^Swap of Two Numbers/)]);
    const text = (await sidebar.textContent()) ?? '';
    expect(text.lastIndexOf('FUNDAMENTALS')).toBeGreaterThan(text.lastIndexOf('LINKED LIST'));
    await expect(sidebar).toContainText('2/2');
  });
});

test.describe('Prime Number Checker', () => {
  test('91: each divisor check shows i and n % i, highlights the current divisor, and ends "not prime: 7 × 13"', async ({ app, page }) => {
    await app.selectAlgorithm('prime-check');
    await expect(page.getByTestId('number-visualizer')).toBeVisible();
    // no Array size control for number inputs
    await expect(app.sizeSelect).toHaveCount(0);
    const steps = definition('prime-check').generateSteps([91]);
    await enter(app, { n: 91 }, steps.length);

    const shown = await app.collectStates(steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) {
      const view = shown[k].numbers!;
      expect(view.cells, `step ${k + 1}`).toEqual(engineCells(s));
      // the divisors tried so far, as the engine has them
      expect(view.divisors.map(d => d.divisor), `step ${k + 1}`).toEqual((s.numbers?.divisorChecks ?? []).map(c => c.divisor));
      if (s.codeRef === 'check-divisor') {
        const i = s.variables!.i as number;
        const current = view.divisors.filter(d => d.current);
        expect(current.map(d => d.divisor), `step ${k + 1}`).toEqual([i]);
        expect(current[0].text).toContain(`i = ${i} · n % i = ${91 % i}`);
      }
    }
    const result = page.getByTestId('number-result');
    await expect(result).toHaveAttribute('data-result-kind', 'not-prime');
    await expect(result).toContainText('91 is not prime: 91 = 7 × 13.');
    await expect(page.locator('[data-testid="divisor-checks"] li[data-divides="true"]')).toHaveAttribute('data-divisor', '7');
    await expect(page.locator('[data-testid="divisor-checks"] li')).toHaveCount(6);
  });

  test('a prime and n ≤ 1: the final result says so', async ({ app, page }) => {
    await app.selectAlgorithm('prime-check');
    const result = page.getByTestId('number-result');
    await enter(app, { n: 97 }, definition('prime-check').generateSteps([97]).length);
    await app.goToLastStep();
    await expect(result).toHaveAttribute('data-result-kind', 'prime');
    await expect(result).toContainText('97 is prime');

    await enter(app, { n: -7 }, 3);
    await app.goToLastStep();
    await expect(result).toContainText('-7 is not prime: numbers up to 1 are not prime.');
    await expect(page.locator('[data-testid="divisor-checks"] li')).toHaveCount(0);
  });

  for (const lang of LANGUAGES) {
    test(`the highlighted code line follows the trace (${lang})`, async ({ app }) => {
      await app.selectAlgorithm('prime-check');
      // 15 returns at a divisor, 29 leaves the loop and returns true, 1 returns at the first check
      for (const n of [15, 29, 1]) {
        const steps = definition('prime-check').generateSteps([n]);
        await enter(app, { n }, steps.length);
        await expectCodeLines(app, 'prime-check', lang, steps);
      }
    });
  }

  test('invalid values are explained next to the field and cannot be visualized', async ({ app, page }) => {
    await app.selectAlgorithm('prime-check');
    const n = field(page, 'n');
    for (const [text, message] of [
      ['', 'Enter a value for "n".'],
      ['seven', '"n" ("seven") is not a whole number.'],
      ['7.5', '"n" ("7.5") is a decimal — only whole numbers are supported.'],
      ['10001', '"n" (10001) is out of range — use values from -999 to 10000.'],
      ['-1000', '"n" (-1000) is out of range — use values from -999 to 10000.'],
    ]) {
      await n.fill(text);
      await expect(app.inputError).toHaveText(message);
      await expect(app.inputError).toHaveAttribute('data-field', 'n');
      await expect(n).toHaveAttribute('aria-invalid', 'true');
      await expect(visualize(page)).toBeDisabled();
    }
    // the running trace is untouched: still the default n = 29
    expect((await cells(app)).n).toBe('29');
    await n.fill('10000');
    await expect(app.inputError).toHaveCount(0);
    await expect(visualize(page)).toBeEnabled();
  });
});

test.describe('Swap of Two Numbers', () => {
  test('temp = a, a = b, b = temp: the values after each statement, Next and Previous', async ({ app, page }) => {
    await app.selectAlgorithm('swap-two-numbers');
    await expect(app.sizeSelect).toHaveCount(0);
    const steps = definition('swap-two-numbers').generateSteps([12, -4]);
    await enter(app, { a: 12, b: -4 }, steps.length);

    const shown = await app.collectStates(steps.length);
    expect(shown.map(u => u.numbers!.cells)).toEqual(steps.map(engineCells));
    expect(shown.slice(1, 4).map(u => u.numbers!.operation)).toEqual(['temp = a', 'a = b', 'b = temp']);
    expect(shown.map(u => values(u.numbers!.cells))).toEqual([
      { a: '12', b: '-4', temp: '—' },
      { a: '12', b: '-4', temp: '12' },
      { a: '-4', b: '-4', temp: '12' },
      { a: '-4', b: '12', temp: '12' },
      { a: '-4', b: '12', temp: '12' },
    ]);
    await expect(page.getByTestId('number-result')).toHaveAttribute('data-result-kind', 'swapped');
    await expect(page.getByTestId('number-result')).toContainText('Swapped: a = -4, b = 12 (they were a = 12, b = -4).');

    await app.previous();
    await app.previous();
    await app.expectStep(3);
    await expect(page.getByTestId('number-operation')).toHaveText('a = b');
    expect(await cells(app)).toEqual({ a: '-4', b: '-4', temp: '12' });
    await expect(page.getByTestId('number-result')).toHaveCount(0);
  });

  test('Play runs to the swapped values; Reset returns to the start', async ({ app, page }) => {
    await app.selectAlgorithm('swap-two-numbers');
    await app.setSpeed('fast');
    await app.play();
    await app.expectStep(5);
    await expect(page.getByTestId('number-result')).toContainText('Swapped: a = 9, b = 5');

    await app.reset();
    await app.expectStep(1);
    expect(await cells(app)).toEqual({ a: '5', b: '9', temp: '—' });

  });

  test('Pause holds the current step (on the longer Prime trace, so the pause lands mid-trace)', async ({ app }) => {
    // a 5-step swap can finish before a slow browser's Pause click lands, and Play at the end restarts from step 1
    await app.selectAlgorithm('prime-check');
    const total = await app.totalSteps();
    await app.setSpeed('medium');
    // observe the first step change (a MutationObserver: a poll can miss a 600 ms step), then pause
    const firstChange = app.recordStepChanges(1);
    await app.play();
    expect((await firstChange)[0].step).toBe(2);
    await app.pause();
    await expect(app.playButton).toBeVisible();
    const at = await app.stepNumber();
    expect(at, 'paused before the end').toBeLessThan(total);
    await app.expectNoStepChangeFor(1500);
    expect(await app.stepNumber()).toBe(at);
  });

  test('the highlighted code line follows the trace in C, C++, Java and Python', async ({ app }) => {
    await app.selectAlgorithm('swap-two-numbers');
    const steps = definition('swap-two-numbers').generateSteps([5, 9]);
    for (const lang of LANGUAGES) await expectCodeLines(app, 'swap-two-numbers', lang, steps);
  });

  test('both values are validated; an invalid b names b', async ({ app, page }) => {
    await app.selectAlgorithm('swap-two-numbers');
    await field(page, 'b').fill('1000');
    await expect(app.inputError).toHaveText('"b" (1000) is out of range — use values from -999 to 999.');
    await expect(app.inputError).toHaveAttribute('data-field', 'b');
    await expect(field(page, 'b')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'a')).toHaveAttribute('aria-invalid', 'false');
    await expect(visualize(page)).toBeDisabled();
  });

  test('Randomize replaces custom values and Restore brings them back', async ({ app, page }) => {
    await app.selectAlgorithm('swap-two-numbers');
    await enter(app, { a: -500, b: 700 }, 5);
    await page.getByRole('button', { name: /^Randomize/ }).click();
    await expect(app.inputNotice).toBeVisible();
    await app.restoreButton.click();
    await expect.poll(() => cells(app)).toEqual({ a: '-500', b: '700', temp: '—' });
  });
});

test.describe('accessibility and layout', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`axe (${theme} theme): a prime check mid-trace, with divisor checks and the code line active`, async ({ app, page }) => {
      await setTheme(page, theme);
      await app.selectAlgorithm('prime-check');
      await app.advance(5);
      await expect(page.locator('[data-testid="divisor-checks"] li')).not.toHaveCount(0);
      expect(await violations(page)).toEqual([]);
    });

    test(`axe (${theme} theme): the swapped result`, async ({ app, page }) => {
      await setTheme(page, theme);
      await app.selectAlgorithm('swap-two-numbers');
      await app.goToLastStep();
      await expect(page.getByTestId('number-result')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test(`axe (${theme} theme): an invalid value with its message`, async ({ app, page }) => {
      await setTheme(page, theme);
      await app.selectAlgorithm('swap-two-numbers');
      await field(page, 'a').fill('x');
      await expect(app.inputError).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }

  test('phone width: no horizontal scroll, the fields and value cards fit', async ({ app, page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const id of ['prime-check', 'swap-two-numbers'] as const) {
      await app.selectAlgorithm(id);
      await app.goToLastStep();
      await expect(page.getByTestId('number-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      const rights = await page.locator('[data-number-cell], #apply-input, input[id^="number-input-"]').evaluateAll(els => els.map(e => e.getBoundingClientRect().right));
      for (const right of rights) expect(right).toBeLessThanOrEqual(375);
    }
  });
});
