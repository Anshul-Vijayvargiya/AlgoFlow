import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Subarray Sum Equals K through the real UI: the numbers and k are typed into their fields; what each step shows (every
 * cell and prefix sum and its state, the five value cards, the map with its lookup or write, the lanes of the subarrays
 * this step counted, the display-only list, the step's description and the highlighted line) is checked against the
 * engine's own trace for the same input. The counts themselves are checked against a direct search over every
 * subarray, and the four listings are compiled and run, in the unit tests (subarraySumK.test.ts,
 * scripts/__tests__/subarraySumKListings.test.ts).
 */
const ID = 'array-subarray-sum-k' as const;
const engine = (nums: readonly number[], k: number) => definition(ID).generateSteps([...nums], { target: k });
const field = (page: Page) => page.locator('#array-input');
const kField = (page: Page) => page.locator('#target-input');
const card = (page: Page, name: string) => page.locator(`[data-testid="ssk-values"] [data-name="${name}"]`);

async function enter(page: Page, nums: readonly number[], k: number) {
  await field(page).fill(nums.join(', '));
  await kField(page).fill(String(k));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(nums, k).length));
}

interface SskUi {
  step: number;
  line: number | null;
  operation: string;
  cells: string[];
  prefixes: string[];
  cards: string[];
  map: string[];
  lookup: string;
  write: string;
  lanes: string[];
  listed: string[];
  note: string;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<SskUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
    const read = (): SskUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const lookup = q('ssk-lookup')?.dataset;
      const write = q('ssk-write')?.dataset;
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        operation: q('ssk-visualizer')?.dataset.operation ?? '',
        cells: all('[data-testid="ssk-array"] [data-index]').map(e => `${e.dataset.index}=${e.dataset.value}:${e.dataset.tone}`),
        prefixes: all('[data-testid="ssk-prefixes"] [data-p]').map(e => `${e.dataset.p}=${e.dataset.value}:${e.dataset.tone}`),
        cards: all('[data-testid="ssk-values"] [data-name]').map(e => `${e.dataset.name}=${e.dataset.value}:${e.dataset.active}`),
        map: all('[data-testid="ssk-map"] [data-key][data-count]').map(e => `${e.dataset.key}:${e.dataset.count}:${e.dataset.mark}`),
        lookup: lookup ? `${lookup.key}:${lookup.found}:${lookup.occurrences}` : '',
        write: write ? `${write.key}:${write.kind}` : '',
        lanes: all('[data-lane]').map(e => e.dataset.lane ?? ''),
        listed: all('[data-match]').map(e => e.dataset.match ?? ''),
        note: q('ssk-note')?.textContent ?? '',
        result: q('ssk-result')?.textContent ?? null,
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

const SETS: Record<string, string> = { 'init-count': 'count', 'init-prefix': 'prefix', 'add-prefix': 'prefix', 'calc-need': 'need', lookup: 'count' };

/** what the engine's step says the page shows, in the collector's shape */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, x: number): SskUi {
  const v = s.prefixMap!;
  const n = v.nums.length;
  const current = v.i !== null && v.i < n && v.operation !== 'start' && v.operation !== 'done' ? v.i : null;
  const here = v.matchesHere;
  const tone = (p: number) => (p === current ? 'current' : here.some(r => p >= r.start && p <= r.end) ? 'match' : v.operation === 'done' || (v.i !== null && p < v.i) ? 'seen' : 'waiting');
  const P = [0];
  for (const value of v.nums) P.push(P[P.length - 1] + value);
  const computed = current !== null && ['add-prefix', 'calc-need', 'lookup'].includes(v.operation) ? current + 1 : null;
  const ptone = (p: number) => (here.some(r => r.start === p) ? 'start' : p === computed ? 'current' : p < v.recorded ? 'recorded' : 'waiting');
  const value = { k: v.k, 'nums[i]': current === null ? null : v.nums[current], prefix: v.prefix, need: v.need, count: v.count } as Record<string, number | null>;
  const mark = (key: number) => (v.lookup?.found && v.lookup.key === key ? 'found' : v.write?.key === key ? v.write.kind : '');
  return {
    step: x + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    operation: v.operation,
    cells: v.nums.map((num, p) => `${p}=${num}:${tone(p)}`),
    prefixes: P.map((sum, p) => `${p}=${sum}:${ptone(p)}`),
    cards: ['k', 'nums[i]', 'prefix', 'need', 'count'].map(c => `${c}=${value[c] ?? ''}:${SETS[v.operation] === c}`),
    map: (v.freq ?? []).map(e => `${e.key}:${e.count}:${mark(e.key)}`),
    lookup: v.lookup ? `${v.lookup.key}:${v.lookup.found}:${v.lookup.occurrences}` : '',
    write: v.write ? `${v.write.key}:${v.write.kind}` : '',
    lanes: here.map(r => `${r.start}-${r.end}`),
    listed: v.matches.map(r => `${r.start}-${r.end}`),
    note: s.message,
    result: v.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Subarray Sum Equals K', () => {
  test('listed under ARRAYS right after Two Sum; opens its own view with [1, 2, 3] and k = 3', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('Two Sum')).toBeLessThan(at('Subarray Sum Equals K'));
    expect(at('Subarray Sum Equals K')).toBeLessThan(at('Majority Element'));
    expect(at('Prefix Sum')).toBeLessThan(at('Two Sum'));
    await expect(app.sidebar.getByRole('button', { name: 'Subarray Sum Equals K', exact: true })).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Subarray Sum Equals K');
    await expect(page.getByTestId('ssk-visualizer')).toBeVisible();
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(field(page)).toHaveValue('1, 2, 3');
    await expect(kField(page)).toHaveValue('3');
    await expect(page.locator('#input-hint')).toContainText('Up to 10 whole numbers (-999 to 999)');
    await expect(page.locator('#input-hint')).toContainText('Count the subarrays whose numbers sum to this');
    await expect(page.getByTestId('ssk-display-only')).toContainText('Display only — the code does not store these subarrays; it only counts them');
    await expect(page.getByTestId('target-pill')).toHaveCount(0);
  });

  test('Two Sum and Subarray Sum Equals K each open their own view, and switching loads each example', async ({ app, page }) => {
    await app.selectAlgorithm('two-sum');
    await expect(app.heading).toHaveText('Two Sum');
    await expect(page.getByTestId('ssk-visualizer')).toHaveCount(0);
    await app.selectAlgorithm(ID);
    await expect(page.getByTestId('ssk-visualizer')).toBeVisible();
    await expect(field(page)).toHaveValue('1, 2, 3');
    await app.selectAlgorithm('two-sum');
    await expect(page.getByTestId('target-pill')).toHaveText('target = 9');
  });

  test('[1, 2, 3], k = 3: every step as traced, ending with 2', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine([1, 2, 3], 3);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, x) => x + 1));
    for (const [x, s] of steps.entries()) expect(shown[x], `step ${x + 1}: ${s.message}`).toEqual(expected('cpp', s, x));
    await expect(page.getByTestId('ssk-result')).toHaveAttribute('data-count', '2');
  });

  test('negatives, zeros, repeats and ten numbers: every step as traced', async ({ app, page }) => {
    test.slow();
    await app.selectAlgorithm(ID);
    for (const [nums, k] of [
      [[0, 0, 0], 0],
      [[1, -1, 0], 0],
      [[3, 4, 7, 2, -3, 1, 4, 2, -1, 1], 7],
    ] as const) {
      await enter(page, nums, k);
      const steps = engine(nums, k);
      const shown = await collect(page, steps.length);
      expect(shown).toHaveLength(steps.length);
      for (const [x, s] of steps.entries()) expect(shown[x], `[${nums}] k=${k} step ${x + 1}: ${s.message}`).toEqual(expected('cpp', s, x));
    }
  });

  test('a lookup that finds need: the map entry, the count card, the lane and why it sums to k', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine([1, 2, 3], 3);
    const index = steps.findIndex(s => s.codeRef === 'lookup' && s.prefixMap!.lookup!.found);
    await app.advance(index);
    await app.expectStep(index + 1);
    await expect(card(page, 'count')).toHaveAttribute('data-active', 'true');
    await expect(card(page, 'count')).toHaveAttribute('data-value', '1');
    await expect(page.getByTestId('ssk-lookup')).toContainText('look up need = 0: occurred once → count 0 + 1 = 1');
    await expect(page.locator('[data-key="0"][data-count]')).toHaveAttribute('data-mark', 'found');
    await expect(page.locator('[data-lane]')).toHaveCount(1);
    await expect(page.getByTestId('ssk-why')).toContainText('P0 = 0 = need → nums[0..1] = [1, 2] sums to P2 − P0 = 3 − 0 = 3');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the lookup and the store, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const def = definition(ID);
      const LOOKUP = { c: 'count += get(&freq, need);', cpp: 'count += freq.count(need) ? freq.at(need) : 0;', java: 'count += freq.getOrDefault(need, 0);', python: 'count += freq.get(need, 0)' }[lang];
      await expect(page.locator(`[data-line="${def.lineMap[lang].lookup}"]`)).toContainText(LOOKUP);
      await expect(page.locator(`[data-line="${def.lineMap[lang]['calc-need']}"]`)).toContainText('need = prefix - k');
      const steps = engine([1, 2, 3], 3);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [nums, k, count] of [
    [[1, 1, 1], 2, '2'],
    [[1, 2, 3], 3, '2'],
    [[1, -1, 0], 0, '3'],
    [[0, 0, 0], 0, '6'],
    [[-1, -1, 1], 0, '1'],
    [[1, 2, 3], 10, '0'],
    [[3], 3, '1'],
    [[], 0, '0'],
  ] as const) {
    test(`through the UI: [${nums.join(', ')}], k = ${k} → ${count}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, nums, k);
      await app.goToLastStep();
      await expect(page.getByTestId('ssk-result')).toHaveAttribute('data-count', count);
      await expect(card(page, 'count')).toHaveAttribute('data-value', count);
      await expect(page.locator('[data-match]')).toHaveCount(Number(count));
    });
  }

  test('more than 10 numbers, numbers or k out of range, decimals, or no k are refused', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [nums, k, message] of [
      ['1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11', '3', 'Too many values (11). The visualizer supports at most 10.'],
      ['1000', '3', 'out of range'],
      ['2.5', '3', 'is a decimal'],
      ['1, 2', '1000', 'out of range'],
      ['1, 2', '-1000', 'out of range'],
      ['1, 2', '1.5', 'is a decimal'],
      ['1, 2', '', 'Enter a value for "k"'],
    ]) {
      await field(page).fill(nums);
      await kField(page).fill(k);
      await expect(page.getByTestId('input-error'), `${nums} / ${k}`).toContainText(message);
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await field(page).fill('-999, 999, 0');
    await kField(page).fill('-999');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
  });

  test('Randomize draws numbers from -3 to 4, keeps k, and keeps the custom input for Restore', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [5, -7, 9], 2);
    for (let x = 0; x < 3; x++) {
      await app.randomizeButton.click();
      const raw = await field(page).inputValue();
      const values = raw.trim() === '' ? [] : raw.split(',').map(v => Number(v.trim()));
      expect(values.length).toBeLessThanOrEqual(10);
      expect(values.every(v => Number.isInteger(v) && v >= -3 && v <= 4), raw).toBe(true);
      await expect(kField(page)).toHaveValue('2');
      await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(values, 2).length));
    }
    await page.locator('#restore-input').click();
    await expect(field(page)).toHaveValue('5, -7, 9');
    await expect(page.getByTestId('ssk-input')).toHaveText('nums: [5, −7, 9], k = 2');
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): ten numbers, the prefix sums, the cards, the map and three lanes stay inside the screen`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      const nums = [-999, 999, 0, 0, -999, 999, 0, -999, 999, 0];
      await enter(page, nums, 0);
      const inside = async (selector: string, what: string) => {
        const boxes = await page.locator(selector).evaluateAll(els => els.map(e => JSON.parse(JSON.stringify(e.getBoundingClientRect())) as { left: number; right: number }));
        expect(boxes.length, what).toBeGreaterThan(0);
        for (const [x, b] of boxes.entries()) {
          expect(b.left, `${what} ${x}`).toBeGreaterThanOrEqual(0);
          expect(b.right, `${what} ${x}`).toBeLessThanOrEqual(width);
        }
      };
      const steps = engine(nums, 0);
      const index = steps.findIndex(s => s.codeRef === 'lookup' && s.prefixMap!.matchesHere.length >= 3);
      expect(index).toBeGreaterThan(0);
      await app.advance(index);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await inside('[data-testid="ssk-array"] [data-index]', 'cell');
      // a cell's number fits inside the cell ("−999" included)
      const spill = await page.locator('[data-testid="ssk-array"] [data-index]').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth).map(e => e.textContent));
      expect(spill, 'numbers wider than their cell').toEqual([]);
      await inside('[data-testid="ssk-prefixes"] [data-p]', 'prefix sum');
      await inside('[data-testid="ssk-values"] [data-name]', 'card');
      await inside('[data-testid="ssk-map"] [data-key][data-count]', 'map entry');
      await inside('[data-lane] [data-part]', 'lane');
      await inside('[data-testid="ssk-why"]', 'why');
      // the cards are two to a row
      const tops = await page.locator('[data-testid="ssk-values"] [data-name]').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(3);
      await app.goToLastStep();
      await expect(page.getByTestId('ssk-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on a miss, a hit with lanes, a repeated store and the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, [1, -1, 0], 0);
      const steps = engine([1, -1, 0], 0);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      let at = 0;
      for (const index of [
        steps.findIndex(s => s.codeRef === 'lookup' && !s.prefixMap!.lookup!.found),
        steps.findIndex(s => s.codeRef === 'lookup' && s.prefixMap!.lookup!.found),
        steps.findIndex(s => s.codeRef === 'store' && s.prefixMap!.write!.kind === 'increment'),
      ]) {
        expect(index).toBeGreaterThan(at);
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
