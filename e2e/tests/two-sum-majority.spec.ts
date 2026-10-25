import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, engineSteps, type AlgorithmId, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import type { UiState, VisualizerApp } from '../support/visualizerApp';

/**
 * Two Sum (hash map) and Majority Element (Boyer–Moore voting) through the real UI. What each step shows is checked
 * against the engine's own trace for the same input (UI-to-engine consistency); the algorithms' correctness is
 * covered by the unit tests (twoSum.test.ts, majorityElement.test.ts, compiled listings checked against them).
 */
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];

/** the value cards the engine step describes: name → { value, role } */
const engineCards = (s: ExecutionStep) =>
  Object.fromEntries((s.tracker ?? []).map(c => [c.name, { value: c.value === null ? '—' : String(c.value), role: c.role ?? '' }]));
/** the hash map the engine step describes, as the panel draws it */
const engineMap = (s: ExecutionStep) =>
  s.hashMap
    ? s.hashMap.entries.map(e => ({
        key: e.key,
        value: e.value,
        mark: s.hashMap!.lookup?.found && s.hashMap!.lookup.key === e.key ? 'found' : s.hashMap!.write?.key === e.key ? s.hashMap!.write.kind : '',
      }))
    : null;
const barPointers = (u: UiState) => u.bars.filter(b => b.pointers.length).map(b => `${b.pointers.join('+')}@${b.index}`);
const enginePointers = (s: ExecutionStep) => Object.entries(s.pointers ?? {}).map(([name, i]) => `${name}@${i}`).sort();

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

test.describe('ARRAYS in the sidebar', () => {
  test('Two Sum and Majority Element are listed in ARRAYS after the existing entries; the category order is unchanged', async ({ app }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (s: string) => text.indexOf(s);
    expect(at('Two Pointer')).toBeLessThan(at('Prefix Sum'));
    expect(at('Prefix Sum')).toBeLessThan(at('Two Sum'));
    expect(at('Two Sum')).toBeLessThan(at('Majority Element'));
    expect(at('Majority Element')).toBeLessThan(at('LINKED LIST'));
    expect(at('ARRAYS')).toBeGreaterThan(at('SEARCHING'));
  });
});

test.describe('Two Sum', () => {
  test('the example: every step shows i, the complement, the lookup and the map as the engine has them; then the pair', async ({ app, page }) => {
    await app.selectAlgorithm('two-sum');
    const steps = engineSteps('two-sum', [3, 8, 11, 5, 2, 7, 4], 9);
    await app.expectTotal(steps.length);
    await expect(page.getByTestId('target-pill')).toHaveText('target = 9');

    const shown = await app.collectStates(steps.length);
    for (const [k, s] of steps.entries()) {
      const u = shown[k];
      expect(u.step, `step ${k + 1}`).toBe(k + 1);
      expect(u.tracker, `step ${k + 1} cards`).toEqual(engineCards(s));
      expect(u.hashMap?.entries ?? null, `step ${k + 1} map`).toEqual(engineMap(s));
      expect(barPointers(u).sort(), `step ${k + 1} pointers`).toEqual(enginePointers(s));
      if (s.codeRef === 'lookup') expect(u.hashMap!.lookup, `step ${k + 1}`).toMatchObject({ found: s.result === 'true' });
    }
    const lookups = shown.filter((_, k) => steps[k].codeRef === 'lookup').map(u => u.hashMap!.lookup!.text);
    expect(lookups).toEqual(['lookup 6: not in seen', 'lookup 1: not in seen', 'lookup -2: not in seen', 'lookup 4: not in seen', 'lookup 7: not in seen', 'lookup 2: found → 4']);

    const end = shown.at(-1)!;
    expect(end.outcome).toEqual({ kind: 'found', text: 'Pair found: indices [4, 5] — 2 + 7 = 9' });
    expect(end.bars.filter(b => b.role === 'found').map(b => b.index)).toEqual([4, 5]);
  });

  test('duplicates and negatives: [-3, 4, -3, 7] with target -6 returns [0, 2]; a repeated value is updated', async ({ app, page }) => {
    await app.selectAlgorithm('two-sum');
    await app.enterAndVisualize([-3, 4, -3, 7], -6);
    await app.goToLastStep();
    await expect(app.outcome).toHaveText('Pair found: indices [0, 2] — -3 + -3 = -6');

    await app.enterAndVisualize([4, 1, 4], 100);
    const steps = engineSteps('two-sum', [4, 1, 4], 100);
    const shown = await app.collectStates(steps.length);
    const update = steps.findIndex(s => s.codeRef === 'store' && s.hashMap?.write?.kind === 'update');
    expect(shown[update].hashMap!.entries).toEqual([{ key: 4, value: 2, mark: 'update' }, { key: 1, value: 1, mark: '' }]);
    await expect(app.outcome).toHaveText('No pair sums to 100');
    expect(shown.at(-1)!.outcome?.kind).toBe('not-found');
    // back at the update step, the entry says so in words
    await app.reset();
    await app.advance(update);
    await expect(page.locator('[data-testid="hash-map"] li[data-key="4"]')).toHaveText('4 → 2updated');
  });

  for (const lang of LANGUAGES) {
    test(`the highlighted code line follows the trace (${lang})`, async ({ app }) => {
      await app.selectAlgorithm('two-sum');
      // the example (a pair), then no pair
      await expectCodeLines(app, 'two-sum', lang, engineSteps('two-sum', [3, 8, 11, 5, 2, 7, 4], 9));
      await app.enterAndVisualize([1, 2], 9);
      await expectCodeLines(app, 'two-sum', lang, engineSteps('two-sum', [1, 2], 9));
    });
  }

  test('an invalid target is explained next to its field and cannot be visualized', async ({ app }) => {
    await app.selectAlgorithm('two-sum');
    await app.targetInput.fill('');
    await expect(app.inputError).toHaveText(/Enter a value for "Target sum"/);
    await expect(app.inputError).toHaveAttribute('data-field', 'target');
    await expect(app.targetInput).toHaveAttribute('aria-invalid', 'true');
    await expect(app.visualizeButton).toBeDisabled();
    await app.targetInput.fill('2.5');
    await expect(app.inputError).toHaveText(/decimal/);
    // an unsorted array is fine for Two Sum (no "Sort a copy" here)
    await app.type([9, 1, 5], 6);
    await expect(app.inputError).toHaveCount(0);
    await expect(app.sortCopyButton).toHaveCount(0);
    await expect(app.visualizeButton).toBeEnabled();
  });

  test('Randomize replaces a custom array but keeps the target; Restore brings the array back', async ({ app }) => {
    await app.selectAlgorithm('two-sum');
    await app.enterAndVisualize([4, 4, 4], 8);
    await app.randomizeButton.click();
    await expect(app.inputNotice).toBeVisible();
    await expect(app.targetInput).toHaveValue('8');
    await app.restoreButton.click();
    await app.expectBars([4, 4, 4]);
  });
});

test.describe('Majority Element', () => {
  test('the example: candidate and count through pass 1, freq through pass 2, then the majority', async ({ app }) => {
    await app.selectAlgorithm('majority-element');
    await expect(app.targetInput).toHaveCount(0);
    const steps = engineSteps('majority-element', [2, 2, 1, 1, 1, 2, 2]);
    await app.expectTotal(steps.length);

    const shown = await app.collectStates(steps.length);
    for (const [k, s] of steps.entries()) {
      expect(shown[k].tracker, `step ${k + 1} cards`).toEqual(engineCards(s));
      expect(barPointers(shown[k]).sort(), `step ${k + 1} pointers`).toEqual(enginePointers(s));
      expect(shown[k].hashMap, `step ${k + 1}`).toBeNull();
    }
    // every candidate / count update, as the engine has it
    const updates = shown.filter((_, k) => ['set-candidate', 'increment-count', 'decrement-count'].includes(steps[k].codeRef!));
    expect(updates.map(u => `${u.tracker.candidate.value}/${u.tracker.count.value}`)).toEqual(['2/0', '2/1', '2/2', '2/1', '2/0', '1/0', '1/1', '1/0', '2/0', '2/1']);

    const end = shown.at(-1)!;
    expect(end.outcome).toEqual({ kind: 'found', text: 'Majority element: 2 (4 of 7, more than ⌊7/2⌋ = 3)' });
    expect(end.bars.filter(b => b.role === 'found').map(b => b.index)).toEqual([0, 1, 5, 6]);
  });

  test('no majority, a single element, and negatives', async ({ app }) => {
    await app.selectAlgorithm('majority-element');
    await app.enterAndVisualize([1, 1, 2, 2]);
    await app.goToLastStep();
    await expect(app.outcome).toHaveText(/^No majority element: the candidate \d occurs 2 of 4 times, not more than ⌊4\/2⌋ = 2$/);
    await expect(app.outcome).toHaveAttribute('data-outcome-kind', 'not-found');

    await app.enterAndVisualize([-5]);
    await app.goToLastStep();
    await expect(app.outcome).toHaveText('Majority element: -5 (1 of 1, more than ⌊1/2⌋ = 0)');

    await app.enterAndVisualize([-1, 3, -1, -1, 3]);
    await app.goToLastStep();
    await expect(app.outcome).toHaveText('Majority element: -1 (3 of 5, more than ⌊5/2⌋ = 2)');
  });

  for (const lang of LANGUAGES) {
    test(`the highlighted code line follows the trace (${lang})`, async ({ app }) => {
      await app.selectAlgorithm('majority-element');
      await expectCodeLines(app, 'majority-element', lang, engineSteps('majority-element', [2, 2, 1, 1, 1, 2, 2]));
      await app.enterAndVisualize([1, 2]);
      await expectCodeLines(app, 'majority-element', lang, engineSteps('majority-element', [1, 2]));
    });
  }

  test('Play runs to the result at the fast speed; Reset returns to step 1', async ({ app }) => {
    await app.selectAlgorithm('majority-element');
    await app.enterAndVisualize([3, 3, 4]);
    const total = await app.totalSteps();
    await app.setSpeed('fast');
    await app.play();
    await expect(app.stepCounter).toHaveAttribute('data-step', String(total), { timeout: total * 1000 + 10_000 });
    await expect(app.outcome).toHaveText('Majority element: 3 (2 of 3, more than ⌊3/2⌋ = 1)');
    await app.reset();
    await app.expectStep(1);
  });

  test('Pause holds the current step mid-trace', async ({ app }) => {
    await app.selectAlgorithm('majority-element');
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
});

test.describe('accessibility and layout', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`axe (${theme} theme): Two Sum mid-trace, with the map, a lookup and the code line active`, async ({ app, page }) => {
      await setTheme(page, theme);
      await app.selectAlgorithm('two-sum');
      await app.advance(9);
      await expect(page.getByTestId('hash-map')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test(`axe (${theme} theme): the Majority Element result`, async ({ app, page }) => {
      await setTheme(page, theme);
      await app.selectAlgorithm('majority-element');
      await app.goToLastStep();
      await expect(app.outcome).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }

  test('phone width: no horizontal scroll; the cards and the map fit', async ({ app, page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await app.selectAlgorithm('two-sum');
    await app.enterAndVisualize([-999, 512, 340, -12, 999, 77, 8, -450, 31, 600, -5, 14, 250, -88, 61, 3], 1);
    await app.goToLastStep();
    await expect(page.getByTestId('hash-map')).toBeVisible();
    for (const id of ['two-sum', 'majority-element'] as const) {
      if (id === 'majority-element') {
        await app.selectAlgorithm(id);
        await app.goToLastStep();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth), id).toBeLessThanOrEqual(375);
      const rights = await page.locator('[data-testid="tracker"] [data-number-cell], [data-testid="hash-map"]').evaluateAll(els => els.map(e => e.getBoundingClientRect().right));
      for (const right of rights) expect(right, id).toBeLessThanOrEqual(375);
    }
  });
});
