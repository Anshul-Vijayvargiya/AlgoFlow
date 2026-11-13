import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Best Time to Buy and Sell Stock through the real UI: the prices are typed into the array field; what each step shows
 * (every bar's state and labels, the line at the lowest price, the day's profit, the variables, the display-only days,
 * the step's description and the highlighted line) is checked against the engine's own trace for the same prices. The
 * profits themselves are checked against every buy-before-sell pair, and the four listings are compiled and run, in the
 * unit tests (buySellStock.test.ts, scripts/__tests__/buySellStockListings.test.ts).
 */
const ID = 'array-buy-sell-stock' as const;
const EXAMPLE = [7, 1, 5, 3, 6, 4];
const engine = (prices: readonly number[]) => definition(ID).generateSteps([...prices]);
const field = (page: Page) => page.locator('#array-input');
const bar = (page: Page, d: number) => page.locator(`[data-testid="stock-chart"] [data-day="${d}"]`);
const variable = (page: Page, name: string) => page.locator(`[data-testid="stock-vars"] [data-var="${name}"]`);

async function enter(page: Page, prices: readonly number[]) {
  await field(page).fill(prices.join(', '));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(prices).length));
}

interface StockUi {
  step: number;
  line: number | null;
  operation: string;
  bars: string[];
  tags: string[];
  minLine: string;
  profit: string;
  vars: string[];
  minDay: string;
  trade: string;
  note: string;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<StockUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): StockUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const profit = q('stock-profit')?.dataset;
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        operation: q('stock-visualizer')?.dataset.operation ?? '',
        bars: [...document.querySelectorAll<HTMLElement>('[data-testid="stock-chart"] [data-day]')].map(e => `${e.dataset.day}=${e.dataset.price}:${e.dataset.tone}`),
        tags: [...document.querySelectorAll<HTMLElement>('[data-tags]')].map(e => `${e.dataset.tags}:${[...e.querySelectorAll<HTMLElement>('[data-tag]')].map(t => t.dataset.tag).join(',')}`),
        minLine: q('stock-min-line')?.dataset.price ?? '',
        profit: profit ? `${profit.day}|${profit.profit}|${profit.kind}` : '',
        vars: [...document.querySelectorAll<HTMLElement>('[data-testid="stock-vars"] [data-var]')].map(e => `${e.dataset.var}=${e.dataset.value}:${e.dataset.moved}`),
        minDay: q('stock-min-day')?.dataset.day ?? '',
        trade: `${q('stock-trade')?.dataset.buy}|${q('stock-trade')?.dataset.sell}`,
        note: q('stock-note')?.textContent ?? '',
        result: q('stock-result')?.textContent ?? null,
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
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): StockUi {
  const v = s.stock!;
  const n = v.prices.length;
  const current = v.i !== null && v.i < n && !['start', 'done', 'init'].includes(v.operation) ? v.i : null;
  const checkedUpTo = v.operation === 'done' ? n : v.i !== null ? v.i : v.minDay !== null ? 1 : 0;
  const tone = (d: number) =>
    d === current ? 'current' : d === v.sellDay ? 'sell' : d === v.buyDay ? 'buy' : d === v.minDay ? 'min' : d < checkedUpTo ? 'checked' : 'waiting';
  const tagsOf = (d: number) => [d === current && 'i', d === v.minDay && 'min', d === v.buyDay && 'buy', d === v.sellDay && 'sell'].filter(Boolean).join(',');
  const kind =
    v.profit === null || v.maxProfit === null ? null : v.newMin ? 'new-min' : v.improved || v.profit > v.maxProfit ? 'better' : v.profit === v.maxProfit ? 'equal' : 'worse';
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    operation: v.operation,
    bars: v.prices.map((p, d) => `${d}=${p}:${tone(d)}`),
    tags: v.prices.map((_, d) => `${d}:${tagsOf(d)}`),
    minLine: v.minPrice === null ? '' : String(v.minPrice),
    profit: kind && current !== null ? `${current}|${v.profit}|${kind}` : '',
    vars: (['minPrice', 'profit', 'maxProfit'] as const).map(name => `${name}=${v[name] ?? ''}:${v.moved === name ? 'true' : 'false'}`),
    minDay: v.minDay === null ? '' : String(v.minDay),
    trade: `${v.buyDay ?? ''}|${v.sellDay ?? ''}`,
    note: s.message,
    result: v.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Best Time to Buy and Sell Stock', () => {
  test('listed under ARRAYS right after Sort Colors (not Coming Soon); opens its own price chart with [7, 1, 5, 3, 6, 4]', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('ARRAYS')).toBeGreaterThan(-1);
    expect(at('Sort Colors')).toBeLessThan(at('Best Time to Buy and Sell Stock'));
    expect(at('Best Time to Buy and Sell Stock')).toBeLessThan(at('STRINGS'));
    await expect(app.sidebar.getByRole('button', { name: 'Best Time to Buy and Sell Stock', exact: true })).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Best Time to Buy and Sell Stock');
    await expect(page.getByTestId('stock-visualizer')).toBeVisible();
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(field(page)).toHaveValue('7, 1, 5, 3, 6, 4');
    await expect(page.locator('[data-testid="stock-chart"] [data-day]')).toHaveCount(6);
    await expect(page.locator('#input-hint')).toContainText('1 to 10 whole numbers (0 to 999)');
    await expect(page.getByTestId('stock-display-only')).toContainText('Display only — the code does not store these days; it keeps only minPrice and maxProfit');
    // its own view: not the shared bars, not Sort Colors' cells
    await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
    await expect(page.locator('[data-bar-index]')).toHaveCount(0);
    await expect(page.getByTestId('flag-visualizer')).toHaveCount(0);
  });

  test('[7, 1, 5, 3, 6, 4]: every step as traced, day by day, ending with profit 5 from day 1 to day 4', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('stock-result')).toHaveText('Maximum profit 5: buy on day 1 at 1, sell on day 4 at 6');
    await expect(page.getByTestId('stock-result')).toHaveAttribute('data-buy', '1');
    await expect(page.getByTestId('stock-result')).toHaveAttribute('data-sell', '4');
  });

  test('ties, a later minimum, zeros and ten days: every step as traced', async ({ app, page }) => {
    test.slow();
    await app.selectAlgorithm(ID);
    for (const prices of [[3, 8, 1, 2], [1, 5, 1, 5], [5, 0, 0, 3, 999, 2, 0, 998, 1, 4]]) {
      await enter(page, prices);
      const steps = engine(prices);
      const shown = await collect(page, steps.length);
      expect(shown).toHaveLength(steps.length);
      for (const [k, s] of steps.entries()) expect(shown[k], `[${prices}] step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    }
  });

  test('a new minimum moves the line and earns 0; a better profit moves the buy and sell days; a worse one does not', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    const go = async (index: number) => {
      await app.advance(index - ((await app.stepNumber()) - 1));
      await app.expectStep(index + 1);
    };
    const nth = (ref: string, k: number) => steps.indexOf(steps.filter(s => s.codeRef === ref)[k]);
    // day 1 sets a new minimum
    await go(nth('update-min', 0));
    await expect(page.getByTestId('stock-min-line')).toHaveAttribute('data-price', '1');
    await expect(bar(page, 1)).toHaveAttribute('data-tone', 'current');
    await expect(page.locator('[data-tags="1"]')).toContainText('min');
    await expect(variable(page, 'minPrice')).toHaveAttribute('data-value', '1');
    await app.next();
    await expect(page.getByTestId('stock-profit')).toHaveAttribute('data-kind', 'new-min');
    await expect(page.getByTestId('stock-profit')).toContainText('sell on day 1: 1 − 1 = 0');
    // day 2 beats the best profit
    await go(nth('check-profit', 1));
    await expect(page.getByTestId('stock-profit')).toHaveAttribute('data-kind', 'better');
    await expect(page.getByTestId('stock-profit-span')).toHaveAttribute('data-from', '1');
    await expect(page.getByTestId('stock-profit-span')).toHaveAttribute('data-to', '5');
    await expect(page.getByTestId('stock-trade')).toHaveAttribute('data-sell', '');
    await app.next();
    await expect(variable(page, 'maxProfit')).toHaveAttribute('data-value', '4');
    await expect(page.getByTestId('stock-trade')).toHaveAttribute('data-buy', '1');
    await expect(page.getByTestId('stock-trade')).toHaveAttribute('data-sell', '2');
    await expect(bar(page, 1)).toHaveAttribute('data-tone', 'buy');
    await expect(page.getByTestId('stock-trade')).toContainText('buy on day 1 at 1, sell on day 2 at 5 (profit 4)');
    // day 3 does not
    await go(nth('check-profit', 2));
    await expect(page.getByTestId('stock-profit')).toHaveAttribute('data-kind', 'worse');
    await expect(page.getByTestId('stock-profit')).toContainText('not better than 4');
    await expect(page.getByTestId('stock-trade')).toHaveAttribute('data-sell', '2');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the one-pass loop, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const def = definition(ID);
      const PROFIT = { c: 'int profit = prices[i] - minPrice;', cpp: 'int profit = prices[i] - minPrice;', java: 'int profit = prices[i] - minPrice;', python: 'profit = prices[i] - min_price' };
      const RETURN = { c: 'return maxProfit;', cpp: 'return maxProfit;', java: 'return maxProfit;', python: 'return max_profit' };
      await expect(page.locator(`[data-line="${def.lineMap[lang]['compute-profit']}"]`)).toContainText(PROFIT[lang]);
      await expect(page.locator(`[data-line="${def.lineMap[lang]['return-result']}"]`)).toContainText(RETURN[lang]);
      const steps = engine(EXAMPLE);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [prices, message, buy, sell] of [
    [[5], 'No profit possible: there is only one day', '', ''],
    [[1, 2], 'Maximum profit 1: buy on day 0 at 1, sell on day 1 at 2', '0', '1'],
    [[2, 1], 'No profit possible: the price never rises after a lower day', '', ''],
    [[7, 6, 4, 3, 1], 'No profit possible: the price never rises after a lower day', '', ''],
    [[3, 3, 3, 3], 'No profit possible: the price never rises after a lower day', '', ''],
    [[1, 2, 3, 4, 5], 'Maximum profit 4: buy on day 0 at 1, sell on day 4 at 5', '0', '4'],
    [[3, 8, 1, 2], 'Maximum profit 5: buy on day 0 at 3, sell on day 1 at 8', '0', '1'],
    [[2, 4, 1, 7], 'Maximum profit 6: buy on day 2 at 1, sell on day 3 at 7', '2', '3'],
    [[999, 0, 999], 'Maximum profit 999: buy on day 1 at 0, sell on day 2 at 999', '1', '2'],
  ] as const) {
    test(`through the UI: [${prices.join(', ')}] → ${message.split(':')[0]}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, prices);
      await app.goToLastStep();
      await expect(page.getByTestId('stock-result')).toHaveText(message);
      await expect(page.getByTestId('stock-result')).toHaveAttribute('data-buy', buy);
      await expect(page.getByTestId('stock-result')).toHaveAttribute('data-sell', sell);
      await expect(page.getByTestId('stock-input')).toHaveText(`prices: [${prices.join(', ')}]`);
      await expect(page.locator('[data-testid="stock-chart"] [data-day][data-tone="waiting"]')).toHaveCount(0);
      // no buy or sell label when nothing earns
      await expect(page.locator('[data-tag="buy"]')).toHaveCount(buy === '' ? 0 : 1);
      await expect(page.locator('[data-tag="sell"]')).toHaveCount(sell === '' ? 0 : 1);
    });
  }

  test('an empty list, more than 10 prices, negative or too large prices, or not whole numbers are refused with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [bad, message] of [
      ['', 'needs at least 1'],
      ['1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11', 'Too many values (11). The visualizer supports at most 10.'],
      ['3, -1', 'Value 2 (-1) is below 0: Best Time to Buy and Sell Stock takes values from 0 to 999.'],
      ['1000', 'out of range'],
      ['2.5', 'is a decimal'],
      ['2, x', 'is not a whole number'],
    ]) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await expect(page.locator('[data-testid="stock-chart"] [data-day]')).toHaveCount(6);
    await expect(page.getByTestId('stock-input')).toHaveText('prices: [7, 1, 5, 3, 6, 4]');
    await field(page).fill('999, 0');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Size offers up to 10; Randomize draws prices from 1 to 20 and keeps the custom prices for Restore', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [9, 999, 0, 12]);
    const sizes = await page.getByRole('combobox', { name: 'Array size' }).locator('option').allTextContents();
    expect(sizes.every(x => Number(x) <= 10)).toBe(true);
    for (let k = 0; k < 3; k++) {
      await app.randomizeButton.click();
      const values = (await field(page).inputValue()).split(',').map(v => Number(v.trim()));
      expect(values.length).toBeGreaterThanOrEqual(1);
      expect(values.length).toBeLessThanOrEqual(10);
      expect(values.every(v => Number.isInteger(v) && v >= 1 && v <= 20), values.join(',')).toBe(true);
      await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(values).length));
      await expect(page.locator('[data-testid="stock-chart"] [data-day]')).toHaveCount(values.length);
    }
    await expect(page.getByTestId('input-notice')).toBeVisible();
    await page.locator('#restore-input').click();
    await expect(field(page)).toHaveValue('9, 999, 0, 12');
    await expect(page.getByTestId('input-notice')).toHaveCount(0);
    await expect(page.getByTestId('stock-input')).toHaveText('prices: [9, 999, 0, 12]');
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine([9, 999, 0, 12]).length));
  });

  test('other algorithms are unaffected: an array from another algorithm does not carry in, and Sort Colors, Move Zeroes and Maximum Subarray keep their own views', async ({ app, page }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([500, -3, 8, 1, 9, 2, 7, 3, 6, 4, 5, 0]);
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('7, 1, 5, 3, 6, 4');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await enter(page, [9, 1, 9]);
    await app.selectAlgorithm('array-sort-colors');
    await expect(page.getByTestId('flag-visualizer')).toBeVisible();
    await expect(field(page)).toHaveValue('2, 0, 2, 1, 1, 0');
    await app.selectAlgorithm('array-move-zeroes');
    await expect(page.getByTestId('cells-visualizer')).toBeVisible();
    await expect(page.locator('#input-hint')).toContainText('1 to 10 whole numbers (-999 to 999)');
    await app.selectAlgorithm('maximum-subarray');
    await expect(page.getByTestId('stock-visualizer')).toHaveCount(0);
    await expect(page.locator('[data-bar-index]').first()).toBeVisible();
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('7, 1, 5, 3, 6, 4');
    await expect(page.getByTestId('stock-visualizer')).toBeVisible();
  });

  test('Play runs to the result; Previous steps back; Reset returns to the prices as given', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('stock-result')).toHaveText('Maximum profit 5: buy on day 1 at 1, sell on day 4 at 6', { timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine(EXAMPLE).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('stock-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-testid="stock-chart"] [data-day][data-tone="waiting"]')).toHaveCount(6);
    await expect(page.getByTestId('stock-min-line')).toHaveCount(0);
    await expect(variable(page, 'maxProfit')).toHaveAttribute('data-value', '');
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): ten days of three-digit prices, the profit and the days stay inside the screen without scrolling`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      const prices = [400, 120, 399, 7, 250, 999, 31, 400, 268, 105];
      await enter(page, prices);
      const steps = engine(prices);
      const inside = async (selector: string, count: number, what: string) => {
        const boxes = await page.locator(selector).evaluateAll(els => els.map(e => JSON.parse(JSON.stringify(e.getBoundingClientRect())) as { left: number; right: number; width: number }));
        expect(boxes, what).toHaveLength(count);
        for (const [k, b] of boxes.entries()) {
          expect(b.width, `${what} ${k}`).toBeGreaterThan(0);
          expect(b.left, `${what} ${k}`).toBeGreaterThanOrEqual(0);
          expect(b.right, `${what} ${k}`).toBeLessThanOrEqual(width);
        }
      };
      // a better profit late in the run: the profit span, the buy and sell labels and all ten bars are shown
      await app.advance(steps.indexOf(steps.filter(s => s.codeRef === 'check-profit').at(-1)!));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await inside('[data-testid="stock-chart"] [data-day]', 10, 'bar');
      // the labels drawn under the bars (a day with none has an empty, zero-width slot)
      const drawn = await page.locator('[data-tags] [data-tag]').count();
      expect(drawn).toBeGreaterThanOrEqual(3);
      await inside('[data-tags] [data-tag]', drawn, 'label');
      await inside('[data-testid="stock-profit"]', 1, 'profit');
      await inside('[data-testid="stock-vars"] [data-var]', 3, 'variable');
      await inside('[data-testid="stock-note"] span', 1, 'note');
      await inside('[data-testid="stock-trade"]', 1, 'trade');
      await app.goToLastStep();
      await expect(page.getByTestId('stock-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await inside('[data-testid="stock-result"]', 1, 'result');
      await expect(page.getByTestId('stock-result')).toHaveAttribute('data-profit', String(steps.at(-1)!.stock!.result!.profit));
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on a new minimum, a better and a worse profit, and the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      const steps = engine(EXAMPLE);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const nth = (ref: string, k: number) => steps.indexOf(steps.filter(s => s.codeRef === ref)[k]);
      let at = 0;
      for (const index of [nth('compute-profit', 0), nth('update-profit', 0), nth('check-profit', 2)]) {
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
