import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Best Time to Buy and Sell Stock II through the real UI: the prices are typed into the array field; what each step shows
 * (every bar's state and labels, the change from the day before under each day, the pair being compared, the trades as
 * brackets, totalProfit, the step's description and the highlighted line) is checked against the engine's own trace for
 * the same prices. The profits themselves are checked against every buy / sell / wait sequence, and the four listings
 * are compiled and run, in the unit tests (buySellStockII.test.ts, scripts/__tests__/buySellStockIIListings.test.ts).
 */
const ID = 'array-buy-sell-stock-ii' as const;
const EXAMPLE = [7, 1, 5, 3, 6, 4];
const engine = (prices: readonly number[]) => definition(ID).generateSteps([...prices]);
const field = (page: Page) => page.locator('#array-input');
const bar = (page: Page, d: number) => page.locator(`[data-testid="stock2-chart"] [data-day="${d}"]`);
const chip = (page: Page, d: number) => page.locator(`[data-testid="stock2-chart"] [data-change="${d}"]`);

async function enter(page: Page, prices: readonly number[]) {
  await field(page).fill(prices.join(', '));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(prices).length));
}

interface Stock2Ui {
  step: number;
  line: number | null;
  operation: string;
  bars: string[];
  changes: string[];
  tags: string[];
  brackets: string;
  pair: string;
  total: string;
  trades: string[];
  note: string;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<Stock2Ui[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): Stock2Ui => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const pair = q('stock2-pair')?.dataset;
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        operation: q('stock2-visualizer')?.dataset.operation ?? '',
        bars: [...document.querySelectorAll<HTMLElement>('[data-testid="stock2-chart"] [data-day]')].map(e => `${e.dataset.day}=${e.dataset.price}:${e.dataset.tone}`),
        changes: [...document.querySelectorAll<HTMLElement>('[data-testid="stock2-chart"] [data-change]')].filter(e => e.dataset.kind).map(e => `${e.dataset.change}:${e.dataset.kind}:${e.dataset.counted}`),
        tags: [...document.querySelectorAll<HTMLElement>('[data-tags]')].map(e => `${e.dataset.tags}:${[...e.querySelectorAll<HTMLElement>('[data-tag]')].map(t => t.dataset.tag).join(',')}`),
        brackets: q('stock2-brackets')?.dataset.trades ?? '',
        pair: pair ? `${pair.from}-${pair.to}:${pair.delta}:${pair.kind}` : '',
        total: document.querySelector<HTMLElement>('[data-testid="stock2-vars"] [data-var="totalProfit"]')?.dataset.value ?? '',
        trades: [...document.querySelectorAll<HTMLElement>('[data-trade]')].map(e => `${e.dataset.buy}-${e.dataset.sell}:${e.dataset.profit}:${e.dataset.open}`),
        note: q('stock2-note')?.textContent ?? '',
        result: q('stock2-result')?.textContent ?? null,
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
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): Stock2Ui {
  const v = s.stockII!;
  const n = v.prices.length;
  const pair = v.i !== null && v.i < n && !['start', 'done', 'init'].includes(v.operation) ? [v.i - 1, v.i] : null;
  const reached = v.operation === 'done' ? n : v.i ?? 0;
  const trades = [...v.trades.map(t => ({ ...t, open: false })), ...(v.open ? [{ ...v.open, open: true }] : [])];
  const tone = (d: number) => {
    if (pair && pair.includes(d)) return 'pair';
    for (const t of trades) {
      if (d === t.buyDay) return 'buy';
      if (d === t.sellDay) return t.open ? 'holding' : 'sell';
    }
    return d < reached || (pair && d < pair[0]) ? 'checked' : 'waiting';
  };
  const tagsOf = (d: number) => {
    const out: string[] = [];
    if (pair?.[0] === d) out.push('i-1');
    if (pair?.[1] === d) out.push('i');
    for (const t of trades) {
      if (d === t.buyDay) out.push('buy');
      if (d === t.sellDay) out.push(t.open ? 'holding' : 'sell');
    }
    return out.join(',');
  };
  const kind = (c: number) => (c > 0 ? 'rise' : c < 0 ? 'fall' : 'flat');
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    operation: v.operation,
    bars: v.prices.map((p, d) => `${d}=${p}:${tone(d)}`),
    changes: v.gains.map(g => `${g.day}:${kind(g.change)}:${g.counted}`),
    tags: v.prices.map((_, d) => `${d}:${tagsOf(d)}`),
    brackets: trades.map(t => `${t.buyDay}-${t.sellDay}${t.open ? '*' : ''}`).join(','),
    pair: pair && v.change !== null ? `${pair[0]}-${pair[1]}:${v.change}:${kind(v.change)}` : '',
    total: v.totalProfit === null ? '' : String(v.totalProfit),
    trades: trades.map(t => `${t.buyDay}-${t.sellDay}:${t.profit}:${t.open}`),
    note: s.message,
    result: v.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Best Time to Buy and Sell Stock II', () => {
  test('listed under ARRAYS right after Stock I (not Coming Soon); opens its own chart with [7, 1, 5, 3, 6, 4]', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('Sort Colors')).toBeLessThan(at('Best Time to Buy and Sell Stock'));
    expect(at('Best Time to Buy and Sell Stock')).toBeLessThan(at('Best Time to Buy and Sell Stock II'));
    expect(at('Best Time to Buy and Sell Stock II')).toBeLessThan(at('STRINGS'));
    await expect(app.sidebar.getByRole('button', { name: 'Best Time to Buy and Sell Stock II', exact: true })).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Best Time to Buy and Sell Stock II');
    await expect(page.getByTestId('stock2-visualizer')).toBeVisible();
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(field(page)).toHaveValue('7, 1, 5, 3, 6, 4');
    await expect(page.locator('[data-testid="stock2-chart"] [data-day]')).toHaveCount(6);
    await expect(page.locator('#input-hint')).toContainText('1 to 10 whole numbers (0 to 999)');
    await expect(page.getByTestId('stock2-display-only')).toContainText('Display only — the code does not store these trades; it keeps only totalProfit');
    // its own view: not Stock I's chart, not the shared bars
    await expect(page.getByTestId('stock-visualizer')).toHaveCount(0);
    await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
    // Stock I is still selectable by its own name and keeps its own view
    await app.selectAlgorithm('array-buy-sell-stock');
    await expect(app.heading).toHaveText('Best Time to Buy and Sell Stock');
    await expect(page.getByTestId('stock-visualizer')).toBeVisible();
    await expect(page.getByTestId('stock2-visualizer')).toHaveCount(0);
  });

  test('[7, 1, 5, 3, 6, 4]: every step as traced, ending with 7 from two trades', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('stock2-result')).toHaveText('Maximum profit 7 from 2 trades: buy day 1 at 1 → sell day 2 at 5 (+4), buy day 3 at 3 → sell day 4 at 6 (+3)');
    await expect(page.getByTestId('stock2-result')).toHaveAttribute('data-trades', '1-2,3-4');
  });

  test('a run of rises, a flat day and ten days: every step as traced', async ({ app, page }) => {
    test.slow();
    await app.selectAlgorithm(ID);
    for (const prices of [[1, 2, 3, 4, 5], [1, 2, 2, 3], [1, 3, 5, 4, 6, 8, 8, 9, 2, 3]]) {
      await enter(page, prices);
      const steps = engine(prices);
      const shown = await collect(page, steps.length);
      expect(shown).toHaveLength(steps.length);
      for (const [k, s] of steps.entries()) expect(shown[k], `[${prices}] step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    }
  });

  test('rises are counted and grow one trade; a fall is skipped and completes it; the run is shown to equal one trade', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [1, 3, 5, 2]);
    const steps = engine([1, 3, 5, 2]);
    const go = async (index: number) => {
      await app.advance(index - ((await app.stepNumber()) - 1));
      await app.expectStep(index + 1);
    };
    const nth = (ref: string, k: number) => steps.indexOf(steps.filter(s => s.codeRef === ref)[k]);
    await go(nth('check-rise', 0));
    await expect(chip(page, 1)).toHaveAttribute('data-kind', 'rise');
    await expect(chip(page, 1)).toHaveText('+2');
    await expect(page.getByTestId('stock2-pair')).toContainText('day 0 → day 1: 3 − 1 = +2');
    await expect(bar(page, 0)).toHaveAttribute('data-tone', 'pair');
    await go(nth('add-gain', 1));
    await expect(page.getByTestId('stock2-brackets')).toHaveAttribute('data-trades', '0-2*');
    await expect(page.locator('[data-bracket-end="holding"]')).toHaveCount(1);
    await expect(page.getByTestId('stock2-run')).toContainText('+2 +2 = 4 = 5 − 1: the same as one trade, buy on day 0, sell on day 2 (still rising)');
    await expect(page.getByTestId('stock2-sum')).toContainText('rises counted: 2 + 2 = 4');
    await go(nth('check-rise', 2));
    await expect(chip(page, 3)).toHaveAttribute('data-kind', 'fall');
    await expect(chip(page, 3)).toHaveAttribute('data-counted', 'false');
    await expect(page.getByTestId('stock2-brackets')).toHaveAttribute('data-trades', '0-2');
    await expect(page.locator('[data-bracket-end="sell"]')).toHaveCount(1);
    await expect(page.locator('[data-trade="0"]')).toContainText('trade 1: buy day 0 at 1 → sell day 2 at 5 (+4)');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the greedy loop, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const def = definition(ID);
      const ADD = { c: 'totalProfit += prices[i] - prices[i - 1];', cpp: 'totalProfit += prices[i] - prices[i - 1];', java: 'totalProfit += prices[i] - prices[i - 1];', python: 'total_profit += prices[i] - prices[i - 1]' };
      const CHECK = { c: 'if (prices[i] > prices[i - 1]) {', cpp: 'if (prices[i] > prices[i - 1]) {', java: 'if (prices[i] > prices[i - 1]) {', python: 'if prices[i] > prices[i - 1]:' };
      await expect(page.locator(`[data-line="${def.lineMap[lang]['add-gain']}"]`)).toContainText(ADD[lang]);
      await expect(page.locator(`[data-line="${def.lineMap[lang]['check-rise']}"]`)).toContainText(CHECK[lang]);
      const steps = engine(EXAMPLE);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [prices, message, trades] of [
    [[7], 'No profit possible: there is only one day', ''],
    [[7, 6, 4, 3, 1], 'No profit possible: the price never rises from one day to the next', ''],
    [[1, 2, 3, 4, 5], 'Maximum profit 4 from 1 trade: buy day 0 at 1 → sell day 4 at 5 (+4)', '0-4'],
    [[1, 5, 1, 5], 'Maximum profit 8 from 2 trades: buy day 0 at 1 → sell day 1 at 5 (+4), buy day 2 at 1 → sell day 3 at 5 (+4)', '0-1,2-3'],
    [[2, 2, 2, 2], 'No profit possible: the price never rises from one day to the next', ''],
    [[1, 2, 2, 3], 'Maximum profit 2 from 2 trades: buy day 0 at 1 → sell day 1 at 2 (+1), buy day 2 at 2 → sell day 3 at 3 (+1)', '0-1,2-3'],
    [[3, 1, 4, 2, 6], 'Maximum profit 7 from 2 trades: buy day 1 at 1 → sell day 2 at 4 (+3), buy day 3 at 2 → sell day 4 at 6 (+4)', '1-2,3-4'],
    [[0, 999, 0, 999], 'Maximum profit 1998 from 2 trades: buy day 0 at 0 → sell day 1 at 999 (+999), buy day 2 at 0 → sell day 3 at 999 (+999)', '0-1,2-3'],
  ] as const) {
    test(`through the UI: [${prices.join(', ')}] → ${message.split(':')[0]}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, prices);
      await app.goToLastStep();
      await expect(page.getByTestId('stock2-result')).toHaveText(message);
      await expect(page.getByTestId('stock2-result')).toHaveAttribute('data-trades', trades);
      await expect(page.locator('[data-testid="stock2-chart"] [data-day][data-tone="waiting"]')).toHaveCount(0);
      await expect(page.getByTestId('stock2-brackets')).toHaveCount(trades === '' ? 0 : 1);
      await expect(page.locator('[data-bracket-end="sell"]')).toHaveCount(trades === '' ? 0 : trades.split(',').length);
      await expect(page.locator('[data-bracket-end="holding"]')).toHaveCount(0);
    });
  }

  test('an empty list, more than 10 prices, negative or too large prices, or not whole numbers are refused with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [bad, message] of [
      ['', 'needs at least 1'],
      ['1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11', 'Too many values (11). The visualizer supports at most 10.'],
      ['3, -1', 'Value 2 (-1) is below 0: Best Time to Buy and Sell Stock II takes values from 0 to 999.'],
      ['1000', 'out of range'],
      ['2.5', 'is a decimal'],
      ['2, x', 'is not a whole number'],
    ]) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toContainText(message);
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await expect(page.locator('[data-testid="stock2-chart"] [data-day]')).toHaveCount(6);
    await field(page).fill('999, 0');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Randomize draws prices from 1 to 20 and keeps the custom prices for Restore', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [9, 999, 0, 12]);
    for (let k = 0; k < 3; k++) {
      await app.randomizeButton.click();
      const values = (await field(page).inputValue()).split(',').map(v => Number(v.trim()));
      expect(values.length).toBeGreaterThanOrEqual(1);
      expect(values.length).toBeLessThanOrEqual(10);
      expect(values.every(v => Number.isInteger(v) && v >= 1 && v <= 20), values.join(',')).toBe(true);
      await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(values).length));
    }
    await page.locator('#restore-input').click();
    await expect(field(page)).toHaveValue('9, 999, 0, 12');
    await expect(page.getByTestId('stock2-input')).toHaveText('prices: [9, 999, 0, 12]');
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine([9, 999, 0, 12]).length));
  });

  test('another algorithm\'s array does not carry in; Stock I with the same prices still gives its one-trade answer', async ({ app, page }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([500, -3, 8, 1, 9, 2, 7, 3, 6, 4, 5, 0]);
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('7, 1, 5, 3, 6, 4');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await app.goToLastStep();
    await expect(page.getByTestId('stock2-result')).toHaveAttribute('data-profit', '7');
    await app.selectAlgorithm('array-buy-sell-stock');
    await expect(field(page)).toHaveValue('7, 1, 5, 3, 6, 4');
    await app.goToLastStep();
    await expect(page.getByTestId('stock-result')).toHaveText('Maximum profit 5: buy on day 1 at 1, sell on day 4 at 6');
  });

  test('Play runs to the result; Previous steps back; Reset returns to the prices as given', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('stock2-result')).toBeVisible({ timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine(EXAMPLE).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('stock2-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-testid="stock2-chart"] [data-day][data-tone="waiting"]')).toHaveCount(6);
    await expect(page.getByTestId('stock2-brackets')).toHaveCount(0);
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): ten days of three-digit prices, their changes and the trades stay inside the screen without scrolling`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      const prices = [400, 120, 399, 7, 250, 999, 31, 400, 268, 105];
      await enter(page, prices);
      const steps = engine(prices);
      const inside = async (selector: string, what: string) => {
        const boxes = await page.locator(selector).evaluateAll(els => els.map(e => JSON.parse(JSON.stringify(e.getBoundingClientRect())) as { left: number; right: number; width: number }));
        expect(boxes.length, what).toBeGreaterThan(0);
        for (const [k, b] of boxes.entries()) {
          expect(b.left, `${what} ${k}`).toBeGreaterThanOrEqual(0);
          expect(b.right, `${what} ${k}`).toBeLessThanOrEqual(width);
        }
      };
      await app.advance(steps.indexOf(steps.filter(s => s.codeRef === 'add-gain').at(-1)!));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await inside('[data-testid="stock2-chart"] [data-day]', 'bar');
      await inside('[data-change][data-kind]:not([data-kind=""])', 'change');
      await inside('[data-tags] [data-tag]', 'label');
      await inside('[data-bracket-end]', 'bracket end');
      await inside('[data-testid="stock2-pair"]', 'pair');
      await inside('[data-testid="stock2-note"] span', 'note');
      const fits = await page.locator('[data-change][data-kind]:not([data-kind=""])').evaluateAll(els => els.every(e => e.scrollWidth <= e.clientWidth + 1));
      expect(fits, 'a change chip overflows').toBe(true);
      await app.goToLastStep();
      await expect(page.getByTestId('stock2-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await inside('[data-testid="stock2-result"]', 'result');
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on a fall, a rise, an open run, a completed trade and the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, [7, 1, 3, 5, 2, 6]);
      const steps = engine([7, 1, 3, 5, 2, 6]);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const nth = (ref: string, k: number) => steps.indexOf(steps.filter(s => s.codeRef === ref)[k]);
      let at = 0;
      for (const index of [nth('check-rise', 0), nth('check-rise', 1), nth('add-gain', 1), nth('check-rise', 3)]) {
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
