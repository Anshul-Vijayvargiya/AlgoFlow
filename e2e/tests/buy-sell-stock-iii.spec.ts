import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Best Time to Buy and Sell Stock III through the real UI: the prices are typed into the array field; what each step
 * shows (every bar's state and labels, the four value cards, the update being made, the transactions behind sell2, the
 * step's description and the highlighted line) is checked against the engine's own trace for the same prices. The
 * profits themselves are checked against every one or two trades, and the four listings are compiled and run, in the
 * unit tests (buySellStockIII.test.ts, scripts/__tests__/buySellStockIIIListings.test.ts).
 */
const ID = 'array-buy-sell-stock-iii' as const;
const EXAMPLE = [3, 3, 5, 0, 0, 3, 1, 4];
const engine = (prices: readonly number[]) => definition(ID).generateSteps([...prices]);
const field = (page: Page) => page.locator('#array-input');
const card = (page: Page, state: string) => page.locator(`[data-testid="stock3-states"] [data-state="${state}"]`);

async function enter(page: Page, prices: readonly number[]) {
  await field(page).fill(prices.join(', '));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(prices).length));
}

interface Stock3Ui {
  step: number;
  line: number | null;
  operation: string;
  bars: string[];
  tags: string[];
  cards: string[];
  update: string;
  brackets: string;
  trades: string[];
  note: string;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<Stock3Ui[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): Stock3Ui => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const upd = q('stock3-update')?.dataset;
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        operation: q('stock3-visualizer')?.dataset.operation ?? '',
        bars: [...document.querySelectorAll<HTMLElement>('[data-testid="stock3-chart"] [data-day]')].map(e => `${e.dataset.day}=${e.dataset.price}:${e.dataset.tone}`),
        tags: [...document.querySelectorAll<HTMLElement>('[data-tags]')].map(e => `${e.dataset.tags}:${[...e.querySelectorAll<HTMLElement>('[data-tag]')].map(t => t.dataset.tag).join(',')}`),
        cards: [...document.querySelectorAll<HTMLElement>('[data-testid="stock3-states"] [data-state]')].map(e => `${e.dataset.state}=${e.dataset.value}:${e.dataset.active}:${e.dataset.changed}`),
        update: upd ? `${upd.state}:${upd.old}:${upd.candidate}:${upd.value}:${upd.changed}` : '',
        brackets: q('stock3-brackets')?.dataset.trades ?? '',
        trades: [...document.querySelectorAll<HTMLElement>('[data-trade]')].map(e => `${e.dataset.trade}:${e.dataset.buy}-${e.dataset.sell}:${e.dataset.profit}`),
        note: q('stock3-note')?.textContent ?? '',
        result: q('stock3-result')?.textContent ?? null,
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
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): Stock3Ui {
  const v = s.stockIII!;
  const n = v.prices.length;
  const current = v.i !== null && v.i < n && !['start', 'done', 'init'].includes(v.operation) ? v.i : null;
  const seen = v.operation === 'done' ? n : v.i !== null ? v.i : v.buy1 !== null ? 1 : 0;
  const trades = v.witnesses.sell2;
  const tone = (d: number) =>
    d === current ? 'current' : trades.some(t => t.buyDay === d) ? 'buy' : trades.some(t => t.sellDay === d) ? 'sell' : d < seen ? 'checked' : 'waiting';
  const tagsOf = (d: number) => {
    const out: string[] = [];
    if (d === current) out.push('i');
    trades.forEach((t, k2) => {
      if (t.buyDay === d) out.push(`buy${k2 + 1}`);
      if (t.sellDay === d) out.push(`sell${k2 + 1}`);
    });
    return out.join(',');
  };
  const upd = v.update;
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    operation: v.operation,
    bars: v.prices.map((p, d) => `${d}=${p}:${tone(d)}`),
    tags: v.prices.map((_, d) => `${d}:${tagsOf(d)}`),
    cards: (['buy1', 'sell1', 'buy2', 'sell2'] as const).map(st => `${st}=${v[st] ?? ''}:${upd?.state === st}:${upd?.state === st ? String(upd.changed) : ''}`),
    update: upd && upd.old !== null && current !== null ? `${upd.state}:${upd.old}:${upd.candidate}:${upd.value}:${upd.changed}` : '',
    brackets: trades.map(t => `${t.buyDay}-${t.sellDay}`).join(','),
    trades: trades.map((t, k2) => `${k2 + 1}:${t.buyDay}-${t.sellDay}:${t.profit}`),
    note: s.message,
    result: v.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Best Time to Buy and Sell Stock III', () => {
  test('listed under ARRAYS right after Stock II; opens its own view with [3, 3, 5, 0, 0, 3, 1, 4]', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('Best Time to Buy and Sell Stock II')).toBeLessThan(at('Best Time to Buy and Sell Stock III'));
    expect(at('Best Time to Buy and Sell Stock III')).toBeLessThan(at('STRINGS'));
    await expect(app.sidebar.getByRole('button', { name: 'Best Time to Buy and Sell Stock III', exact: true })).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Best Time to Buy and Sell Stock III');
    await expect(page.getByTestId('stock3-visualizer')).toBeVisible();
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(field(page)).toHaveValue('3, 3, 5, 0, 0, 3, 1, 4');
    await expect(page.locator('#input-hint')).toContainText('1 to 10 whole numbers (0 to 999)');
    await expect(page.getByTestId('stock3-display-only')).toContainText('Display only — the code does not store these transactions; it keeps only buy1, sell1, buy2 and sell2');
    await expect(page.getByTestId('stock-visualizer')).toHaveCount(0);
    await expect(page.getByTestId('stock2-visualizer')).toHaveCount(0);
  });

  test('the sidebar matcher tells Stock I, II and III apart: each opens its own view', async ({ app, page }) => {
    for (const [id, heading, view] of [
      ['array-buy-sell-stock-ii', 'Best Time to Buy and Sell Stock II', 'stock2-visualizer'],
      ['array-buy-sell-stock', 'Best Time to Buy and Sell Stock', 'stock-visualizer'],
      ['array-buy-sell-stock-iii', 'Best Time to Buy and Sell Stock III', 'stock3-visualizer'],
      ['array-buy-sell-stock-ii', 'Best Time to Buy and Sell Stock II', 'stock2-visualizer'],
    ] as const) {
      await app.selectAlgorithm(id);
      await expect(app.heading).toHaveText(heading);
      await expect(page.getByTestId(view)).toBeVisible();
    }
  });

  test('[3, 3, 5, 0, 0, 3, 1, 4]: every step as traced, ending with 6 from two transactions', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('stock3-result')).toHaveAttribute('data-profit', '6');
    await expect(page.getByTestId('stock3-result')).toHaveAttribute('data-trades', '0-2,3-7');
  });

  test('one trade, two trades, ten days: every step as traced', async ({ app, page }) => {
    test.slow();
    await app.selectAlgorithm(ID);
    for (const prices of [[1, 5, 2, 8], [1, 2, 3, 4, 5], [1, 2, 4, 2, 5, 7, 2, 4, 9, 0]]) {
      await enter(page, prices);
      const steps = engine(prices);
      const shown = await collect(page, steps.length);
      expect(shown).toHaveLength(steps.length);
      for (const [k, s] of steps.entries()) expect(shown[k], `[${prices}] step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    }
  });

  test('an update marks its card with the old value, the candidate and the winner', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [1, 5, 2, 8]);
    const steps = engine([1, 5, 2, 8]);
    const index = steps.findIndex(s => s.codeRef === 'update-sell1');
    await app.advance(index);
    await app.expectStep(index + 1);
    await expect(card(page, 'sell1')).toHaveAttribute('data-active', 'true');
    await expect(card(page, 'sell1')).toHaveAttribute('data-changed', 'true');
    await expect(page.getByTestId('stock3-update')).toContainText('sell1 = max(0, buy1 + prices[i] = 4) = 4');
    await expect(page.getByTestId('stock3-update')).toContainText('4 wins — sell1 improves');
    await expect(card(page, 'buy1')).toContainText('negative: the price paid');
    await expect(card(page, 'buy1')).toHaveAttribute('data-value', '-1');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the four updates, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const def = definition(ID);
      const MAX = { c: 'maxOf', cpp: 'max', java: 'Math.max', python: 'max' }[lang];
      await expect(page.locator(`[data-line="${def.lineMap[lang]['update-sell2']}"]`)).toContainText(`sell2 = ${MAX}(sell2, buy2 + prices[i])`);
      await expect(page.locator(`[data-line="${def.lineMap[lang]['update-buy1']}"]`)).toContainText(`buy1 = ${MAX}(buy1, -prices[i])`);
      const steps = engine(EXAMPLE);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [prices, profit, trades] of [
    [[1, 8], '7', '0-1'],
    [[1, 5, 2, 8], '10', '0-1,2-3'],
    [[7, 6, 4, 3, 1], '0', ''],
    [[2, 2, 2, 2], '0', ''],
    [[7], '0', ''],
    [[1, 2, 3, 4, 5], '4', '0-4'],
    [[0, 999, 0, 999], '1998', '0-1,2-3'],
  ] as const) {
    test(`through the UI: [${prices.join(', ')}] → ${profit}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, prices);
      await app.goToLastStep();
      await expect(page.getByTestId('stock3-result')).toHaveAttribute('data-profit', profit);
      await expect(page.getByTestId('stock3-result')).toHaveAttribute('data-trades', trades);
      await expect(page.getByTestId('stock3-brackets')).toHaveCount(trades === '' ? 0 : 1);
      await expect(page.locator('[data-bracket-end="sell"]')).toHaveCount(trades === '' ? 0 : trades.split(',').length);
      await expect(card(page, 'sell2')).toHaveAttribute('data-value', profit);
    });
  }

  test('an empty list, more than 10 prices, negative or too large prices, or not whole numbers are refused', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [bad, message] of [
      ['', 'needs at least 1'],
      ['1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11', 'Too many values (11). The visualizer supports at most 10.'],
      ['3, -1', 'Value 2 (-1) is below 0: Best Time to Buy and Sell Stock III takes values from 0 to 999.'],
      ['1000', 'out of range'],
      ['2.5', 'is a decimal'],
    ]) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toContainText(message);
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await field(page).fill('999, 0');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
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
    await expect(page.getByTestId('stock3-input')).toHaveText('prices: [9, 999, 0, 12]');
  });

  test('the same prices in Stock I, II and III: one trade, every rise, at most two trades', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await app.goToLastStep();
    await expect(page.getByTestId('stock3-result')).toHaveAttribute('data-profit', '6');
    // (enter() checks the step count against Stock III's own trace: Stock I and II get the prices typed directly)
    const type = async () => {
      await field(page).fill(EXAMPLE.join(', '));
      await page.locator('#apply-input').click();
      await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
      await expect(field(page)).toHaveValue(EXAMPLE.join(', '));
    };
    await app.selectAlgorithm('array-buy-sell-stock-ii');
    await type();
    await app.goToLastStep();
    await expect(page.getByTestId('stock2-result')).toHaveAttribute('data-profit', '8');
    await app.selectAlgorithm('array-buy-sell-stock');
    await type();
    await app.goToLastStep();
    await expect(page.getByTestId('stock-result')).toHaveAttribute('data-profit', '4');
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): ten days, the four cards and two transactions stay inside the screen`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      const prices = [400, 120, 399, 7, 250, 999, 31, 400, 268, 105];
      await enter(page, prices);
      const inside = async (selector: string, what: string) => {
        const boxes = await page.locator(selector).evaluateAll(els => els.map(e => JSON.parse(JSON.stringify(e.getBoundingClientRect())) as { left: number; right: number }));
        expect(boxes.length, what).toBeGreaterThan(0);
        for (const [k, b] of boxes.entries()) {
          expect(b.left, `${what} ${k}`).toBeGreaterThanOrEqual(0);
          expect(b.right, `${what} ${k}`).toBeLessThanOrEqual(width);
        }
      };
      const steps = engine(prices);
      await app.advance(steps.findIndex(s => s.codeRef === 'update-sell2' && s.stockIII!.witnesses.sell2.length === 2));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await inside('[data-testid="stock3-chart"] [data-day]', 'bar');
      await inside('[data-tags] [data-tag]', 'label');
      await inside('[data-testid="stock3-states"] [data-state]', 'card');
      await inside('[data-bracket-end]', 'bracket end');
      await inside('[data-testid="stock3-update"]', 'update');
      // the cards are two to a row
      const tops = await page.locator('[data-testid="stock3-states"] [data-state]').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(2);
      await app.goToLastStep();
      await expect(page.getByTestId('stock3-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on updates, two transactions and the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, [1, 5, 2, 8]);
      const steps = engine([1, 5, 2, 8]);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      let at = 0;
      for (const index of [steps.findIndex(s => s.codeRef === 'update-buy1'), steps.findIndex(s => s.codeRef === 'update-sell1'), steps.findLastIndex(s => s.codeRef === 'update-sell2')]) {
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
