import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * House Robber through the real UI: the houses are typed into the array field; what each step shows (every house's place
 * in the plan and what the step does with it, the rob and skip choices, the three variables, the display-only history
 * and plan, the step's description and the highlighted line) is checked against the engine's own trace for the same
 * houses. The amounts themselves are checked against every set of non-adjacent houses, and the four listings are
 * compiled and run, in the unit tests (houseRobber.test.ts, scripts/__tests__/houseRobberListings.test.ts).
 */
const ID = 'dp-house-robber' as const;
const EXAMPLE = [2, 7, 9, 3, 1];
const engine = (nums: readonly number[]) => definition(ID).generateSteps([...nums]);
const field = (page: Page) => page.locator('#array-input');
const house = (page: Page, k: number) => page.locator(`[data-testid="houses-row"] [data-house="${k}"]`);
const variable = (page: Page, name: string) => page.locator(`[data-testid="houses-vars"] [data-var="${name}"]`);

async function enter(page: Page, nums: readonly number[]) {
  await field(page).fill(nums.join(', '));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(nums).length));
}

interface HousesUi {
  step: number;
  line: number | null;
  operation: string;
  houses: string[];
  choice: string;
  vars: string[];
  best: string;
  selected: string;
  note: string;
  action: string;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<HousesUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): HousesUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const choice = q('houses-choice')?.dataset;
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        operation: q('houses-visualizer')?.dataset.operation ?? '',
        houses: [...document.querySelectorAll<HTMLElement>('[data-testid="houses-row"] [data-house]')].map(e => `${e.dataset.house}=${e.dataset.value}:${e.dataset.plan}:${e.dataset.focus}`),
        choice: `${choice?.house}|${choice?.rob}|${choice?.skip}|${choice?.winner}`,
        vars: [...document.querySelectorAll<HTMLElement>('[data-testid="houses-vars"] [data-var]')].map(e => `${e.dataset.var}=${e.dataset.value}:${e.dataset.moved}`),
        best: q('houses-best')?.dataset.values ?? '',
        selected: `${q('houses-selected')?.dataset.houses}|${q('houses-selected')?.dataset.sum}`,
        note: q('houses-note')?.textContent ?? '',
        action: q('houses-operation')?.textContent ?? '',
        result: q('houses-result')?.textContent ?? null,
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
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): HousesUi {
  const v = s.houseRobber!;
  const n = v.nums.length;
  const plan = (h: number) => (h >= v.best.length ? 'waiting' : v.selected.includes(h) ? 'robbed' : 'skipped');
  const focus = (h: number) => (v.blocked === h ? 'blocked' : v.i === h && v.operation !== 'start' && v.operation !== 'done' ? 'current' : 'none');
  const shownHouse = v.choice && v.i !== null && v.i < n ? v.i : '';
  const moved = (name: 'prev2' | 'prev1' | 'current') => (v.moved === name || (name === 'current' && v.operation === 'max') ? 'true' : 'false');
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    operation: v.operation,
    houses: v.nums.map((money, h) => `${h}=${money}:${plan(h)}:${focus(h)}`),
    choice: `${shownHouse}|${v.choice?.rob ?? ''}|${v.choice?.skip ?? ''}|${v.choice?.winner ?? ''}`,
    vars: (['prev2', 'prev1', 'current'] as const).map(name => `${name}=${v[name] ?? ''}:${moved(name)}`),
    best: v.best.join(','),
    selected: `${v.selected.join(',')}|${v.selected.reduce((sum, h) => sum + v.nums[h], 0)}`,
    note: s.message,
    action: s.actionLabel ?? '',
    result: v.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('House Robber', () => {
  test('listed under DYNAMIC PROGRAMMING right after Climbing Stairs (not Coming Soon); opens its own row of houses with [2, 7, 9, 3, 1]', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('DYNAMIC PROGRAMMING')).toBeGreaterThan(-1);
    expect(at('DYNAMIC PROGRAMMING')).toBeLessThan(at('Climbing Stairs'));
    expect(at('Climbing Stairs')).toBeLessThan(at('House Robber'));
    expect(at('House Robber')).toBeLessThan(at('Fibonacci (DP)'));
    await expect(app.sidebar.getByRole('button', { name: 'House Robber', exact: true })).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('House Robber');
    await expect(page.getByTestId('houses-visualizer')).toBeVisible();
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(field(page)).toHaveValue('2, 7, 9, 3, 1');
    await expect(page.locator('[data-testid="houses-row"] [data-house]')).toHaveCount(5);
    await expect(page.locator('#input-hint')).toContainText('1 to 10 whole numbers (0 to 400)');
    await expect(page.getByTestId('houses-display-only')).toContainText('Display only — the code does not store these; it keeps only prev2 and prev1');
    // its own view: not bars, not the staircase of Climbing Stairs, not the cells of Sort Colors
    await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
    await expect(page.locator('[data-bar-index]')).toHaveCount(0);
    await expect(page.getByTestId('stairs-visualizer')).toHaveCount(0);
    await expect(page.getByTestId('flag-visualizer')).toHaveCount(0);
  });

  test('[2, 7, 9, 3, 1]: every step as traced, house by house, ending with 12 from houses 0, 2 and 4', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('houses-result')).toHaveText('Maximum 12: rob houses 0, 2 and 4 (2 + 9 + 1 = 12)');
    await expect(page.getByTestId('houses-result')).toHaveAttribute('data-houses', '0,2,4');
    await expect(page.locator('[data-house][data-plan="robbed"]')).toHaveCount(3);
  });

  test('ties, zeros and ten houses: every step as traced', async ({ app, page }) => {
    test.slow();
    await app.selectAlgorithm(ID);
    for (const nums of [[5, 5, 0, 5], [10, 1, 1, 10, 1, 1, 10, 400, 0, 3]]) {
      await enter(page, nums);
      const steps = engine(nums);
      const shown = await collect(page, steps.length);
      expect(shown).toHaveLength(steps.length);
      for (const [k, s] of steps.entries()) expect(shown[k], `[${nums}] step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    }
  });

  test('rob or skip: the neighbour is blocked on the rob choice, the winner is named, and the plan drops a house when a better one appears', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    const go = async (index: number) => {
      await app.advance(index - ((await app.stepNumber()) - 1));
      await app.expectStep(index + 1);
    };
    const nth = (ref: string, k: number) => steps.indexOf(steps.filter(s => s.codeRef === ref)[k]);
    // after two houses the plan is house 1 alone
    await go(nth('take-max', 1));
    await expect(house(page, 1)).toHaveAttribute('data-plan', 'robbed');
    await expect(house(page, 0)).toHaveAttribute('data-plan', 'skipped');
    // house 2: robbing it rules out house 1
    await go(nth('rob-choice', 2));
    await expect(house(page, 2)).toHaveAttribute('data-focus', 'current');
    await expect(house(page, 1)).toHaveAttribute('data-focus', 'blocked');
    await expect(page.locator('[data-focus-tag="1"]')).toHaveText('✕ blocked');
    await expect(page.locator('[data-choice="rob"]')).toContainText('nums[2] + prev2 = 9 + 2 = 11');
    await expect(page.locator('[data-choice="rob"]')).toContainText('house 1 cannot be robbed too');
    await app.next();
    await expect(page.locator('[data-choice="skip"]')).toContainText('prev1 = 7');
    await expect(house(page, 1)).toHaveAttribute('data-focus', 'none');
    await app.next();
    await expect(page.getByTestId('houses-verdict')).toHaveText('current = max(7, 11) = 11 — rob wins');
    await expect(page.locator('[data-choice="rob"]')).toHaveAttribute('data-wins', 'true');
    await expect(variable(page, 'current')).toHaveAttribute('data-value', '11');
    // the plan is now houses 0 and 2: house 1 is out again
    await expect(house(page, 0)).toHaveAttribute('data-plan', 'robbed');
    await expect(house(page, 1)).toHaveAttribute('data-plan', 'skipped');
    await expect(house(page, 2)).toHaveAttribute('data-plan', 'robbed');
    await expect(page.getByTestId('houses-selected')).toContainText('one way to reach 11: rob houses 0 and 2 (2 + 9 = 11)');
    await expect(page.getByTestId('houses-best')).toHaveAttribute('data-values', '2,7,11');
    // the two shifts
    await app.next();
    await expect(variable(page, 'prev2')).toHaveAttribute('data-value', '7');
    await expect(variable(page, 'prev2')).toHaveAttribute('data-moved', 'true');
    await app.next();
    await expect(variable(page, 'prev1')).toHaveAttribute('data-value', '11');
    // house 3: skipping keeps more
    await go(nth('take-max', 3));
    await expect(page.getByTestId('houses-verdict')).toHaveText('current = max(11, 10) = 11 — skip wins');
    await expect(page.locator('[data-choice="skip"]')).toHaveAttribute('data-wins', 'true');
    await expect(house(page, 3)).toHaveAttribute('data-plan', 'skipped');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the max line, and the highlighted line follows the trace (rob, skip and max on that one line)`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const def = definition(ID);
      const MAX = {
        c: 'int current = maxOf(prev1, nums[i] + prev2);',
        cpp: 'int current = max(prev1, nums[i] + prev2);',
        java: 'int current = Math.max(prev1, nums[i] + prev2);',
        python: 'current = max(prev1, nums[i] + prev2)',
      };
      const RETURN = { c: 'return prev1;', cpp: 'return prev1;', java: 'return prev1;', python: 'return prev1' };
      await expect(page.locator(`[data-line="${def.lineMap[lang]['take-max']}"]`)).toContainText(MAX[lang]);
      await expect(page.locator(`[data-line="${def.lineMap[lang]['return-result']}"]`)).toContainText(RETURN[lang]);
      const steps = engine(EXAMPLE);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
      // the three steps of a house's max line highlight the same line
      const k = steps.findIndex(s => s.codeRef === 'rob-choice');
      expect([shown[k].line, shown[k + 1].line, shown[k + 2].line]).toEqual(Array(3).fill(def.lineMap[lang]['take-max']));
    });
  }

  for (const [nums, message, houses] of [
    [[5], 'Maximum 5: rob house 0 (5)', '0'],
    [[0], 'Maximum 0: no house holds any money', ''],
    [[3, 8], 'Maximum 8: rob house 1 (8)', '1'],
    [[4, 4], 'Maximum 4: rob house 0 (4)', '0'],
    [[0, 0, 0, 0], 'Maximum 0: no house holds any money', ''],
    [[1, 2, 3, 4, 5, 6], 'Maximum 12: rob houses 1, 3 and 5 (2 + 4 + 6 = 12)', '1,3,5'],
    [[6, 5, 4, 3, 2, 1], 'Maximum 12: rob houses 0, 2 and 4 (6 + 4 + 2 = 12)', '0,2,4'],
    [[9, 1, 9, 1, 9, 1], 'Maximum 27: rob houses 0, 2 and 4 (9 + 9 + 9 = 27)', '0,2,4'],
    [[2, 1, 1, 2], 'Maximum 4: rob houses 0 and 3 (2 + 2 = 4)', '0,3'],
    [[400, 400, 400, 400, 400, 400, 400, 400, 400, 400], 'Maximum 2000: rob houses 0, 2, 4, 6 and 8 (400 + 400 + 400 + 400 + 400 = 2000)', '0,2,4,6,8'],
  ] as const) {
    test(`through the UI: [${nums.join(', ')}] → ${message.split(':')[0]}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, nums);
      await expect(page.locator('[data-house][data-plan="waiting"]')).toHaveCount(nums.length);
      await app.goToLastStep();
      await expect(page.getByTestId('houses-result')).toHaveText(message);
      await expect(page.getByTestId('houses-result')).toHaveAttribute('data-houses', houses);
      await expect(page.getByTestId('houses-input')).toHaveText(`nums: [${nums.join(', ')}]`);
      await expect(page.locator('[data-house][data-plan="waiting"]')).toHaveCount(0);
      const robbed = await page.locator('[data-house][data-plan="robbed"]').evaluateAll(els => els.map(e => Number(e.getAttribute('data-house'))));
      expect(robbed.join(',')).toBe(houses);
      // never two neighbours
      expect(robbed.every((k, j) => j === 0 || k - robbed[j - 1] >= 2)).toBe(true);
    });
  }

  test('an empty array, more than 10 values, values outside 0 to 400, or not whole numbers are refused with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [bad, message] of [
      ['', 'needs at least 1'],
      ['1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11', 'Too many values (11). The visualizer supports at most 10.'],
      ['3, -1', 'Value 2 (-1) is below 0: House Robber takes values from 0 to 400.'],
      ['401', 'Value 1 (401) is above 400: House Robber takes values from 0 to 400.'],
      ['1000', 'out of range'],
      ['2.5', 'is a decimal'],
      ['2, x', 'is not a whole number'],
    ]) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    // the trace on screen is still the valid one
    await expect(page.locator('[data-testid="houses-row"] [data-house]')).toHaveCount(5);
    await expect(page.getByTestId('houses-input')).toHaveText('nums: [2, 7, 9, 3, 1]');
    await field(page).fill('400, 0');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Size offers up to 10; Randomize draws amounts from 1 to 20 and keeps the custom houses for Restore', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [3, 400, 0, 12]);
    const sizes = await page.getByRole('combobox', { name: 'Array size' }).locator('option').allTextContents();
    expect(sizes.every(x => Number(x) <= 10)).toBe(true);
    for (let k = 0; k < 3; k++) {
      await app.randomizeButton.click();
      const values = (await field(page).inputValue()).split(',').map(v => Number(v.trim()));
      expect(values.length).toBeGreaterThanOrEqual(1);
      expect(values.length).toBeLessThanOrEqual(10);
      expect(values.every(v => Number.isInteger(v) && v >= 1 && v <= 20), values.join(',')).toBe(true);
      await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(values).length));
      await expect(page.locator('[data-testid="houses-row"] [data-house]')).toHaveCount(values.length);
    }
    await expect(page.getByTestId('input-notice')).toBeVisible();
    await page.locator('#restore-input').click();
    await expect(field(page)).toHaveValue('3, 400, 0, 12');
    await expect(page.getByTestId('input-notice')).toHaveCount(0);
    await expect(page.getByTestId('houses-input')).toHaveText('nums: [3, 400, 0, 12]');
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine([3, 400, 0, 12]).length));
  });

  test('other algorithms are unaffected: an array from another algorithm does not carry in, and Climbing Stairs and Sort Colors keep their own views', async ({ app, page }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([500, -3, 8, 1, 9, 2, 7, 3, 6, 4, 5, 0]);
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('2, 7, 9, 3, 1');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await enter(page, [400, 1, 400]);
    await app.selectAlgorithm('dp-climbing-stairs');
    await expect(page.getByTestId('stairs-visualizer')).toBeVisible();
    await expect(page.getByTestId('houses-visualizer')).toHaveCount(0);
    await app.selectAlgorithm('array-sort-colors');
    await expect(page.getByTestId('flag-visualizer')).toBeVisible();
    await expect(field(page)).toHaveValue('2, 0, 2, 1, 1, 0');
    await expect(page.locator('#input-hint')).toContainText('1 to 10 whole numbers (0 to 2)');
    await app.selectAlgorithm('array-move-zeroes');
    await expect(page.getByTestId('cells-visualizer')).toBeVisible();
    await expect(page.locator('#input-hint')).toContainText('1 to 10 whole numbers (-999 to 999)');
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('2, 7, 9, 3, 1');
    await expect(page.getByTestId('houses-visualizer')).toBeVisible();
  });

  test('Play runs to the result; Previous steps back; Reset returns to the houses as given', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('houses-result')).toHaveText('Maximum 12: rob houses 0, 2 and 4 (2 + 9 + 1 = 12)', { timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine(EXAMPLE).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('houses-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-house][data-plan="waiting"]')).toHaveCount(5);
    await expect(page.getByTestId('houses-best')).toHaveAttribute('data-values', '');
    await expect(variable(page, 'prev1')).toHaveAttribute('data-value', '');
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): ten houses of three digits, the choices and the history stay inside the screen, wrapping instead of scrolling`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      const nums = [400, 120, 399, 7, 250, 400, 31, 400, 268, 105];
      await enter(page, nums);
      const steps = engine(nums);
      const inside = async (selector: string, count: number, what: string) => {
        const boxes = await page
          .locator(selector)
          .evaluateAll(els => els.map(e => ({ fits: e.scrollWidth <= e.clientWidth, ...(JSON.parse(JSON.stringify(e.getBoundingClientRect())) as { left: number; right: number; width: number }) })));
        expect(boxes, what).toHaveLength(count);
        for (const [k, b] of boxes.entries()) {
          expect(b.width, `${what} ${k}`).toBeGreaterThan(0);
          expect(b.left, `${what} ${k}`).toBeGreaterThanOrEqual(0);
          expect(b.right, `${what} ${k}`).toBeLessThanOrEqual(width);
        }
        return boxes;
      };
      // a rob choice late in the row: the current house, the blocked neighbour and both choice boxes are shown
      await app.advance(steps.indexOf(steps.filter(s => s.codeRef === 'take-max')[7]));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const cells = await inside('[data-testid="houses-row"] [data-house]', 10, 'house');
      for (const [k, c] of cells.entries()) expect(c.fits, `house ${k}: the amount overflows`).toBe(true);
      await inside('[data-choice]', 2, 'choice');
      await inside('[data-testid="houses-verdict"]', 1, 'verdict');
      await inside('[data-best]', 8, 'best amount');
      await inside('[data-testid="houses-vars"] [data-var]', 3, 'variable');
      await inside('[data-testid="houses-note"] span', 1, 'note');
      await app.goToLastStep();
      await expect(page.getByTestId('houses-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await inside('[data-testid="houses-result"]', 1, 'result');
      await inside('[data-best]', 10, 'best amount');
      await expect(page.getByTestId('houses-result')).toHaveAttribute('data-amount', String(steps.at(-1)!.houseRobber!.result!.amount));
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on the current house, the blocked neighbour, both winners and the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      const steps = engine(EXAMPLE);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const nth = (ref: string, k: number) => steps.indexOf(steps.filter(s => s.codeRef === ref)[k]);
      let at = 0;
      for (const index of [nth('loop-condition', 0), nth('rob-choice', 2), nth('take-max', 2), nth('take-max', 3)]) {
        await app.advance(index - at);
        at = index;
        await settle();
        expect(await violations(page), `${theme}: step ${index + 1} (${steps[index].codeRef})`).toEqual([]);
      }
      await app.goToLastStep();
      await settle();
      expect(await violations(page), `${theme}: result`).toEqual([]);
    });
  }
});
