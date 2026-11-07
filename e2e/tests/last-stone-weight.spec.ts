import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Last Stone Weight through the real UI: the stones are typed into the array field; what each step shows (the phase, every
 * heap position in the tree and in the array with its state and index variables, the two stones of the round, the smash,
 * the smashes so far, the calls in progress, the result and the highlighted line) is checked against the engine's own
 * trace for the same stones. The answers themselves are checked against a sorting reference, and the four listings are
 * compiled and run, in the unit tests (lastStoneWeight.test.ts, scripts/__tests__/lastStoneWeightListings.test.ts).
 *
 * Walks through every step use three stones at most: long Next-click walks time out in slower browsers.
 */
const ID = 'heap-last-stone-weight' as const;
const engine = (stones: readonly number[]) => definition(ID).generateSteps([...stones]);
const field = (page: Page) => page.locator('#array-input');

async function enter(page: Page, stones: readonly number[]) {
  await field(page).fill(stones.join(', '));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(stones).length));
}

interface HeapUi {
  step: number;
  line: number | null;
  phase: string;
  tree: string[];
  array: string[];
  smash: string;
  smashes: string[];
  depth: string;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<HeapUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const read = (): HeapUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const smash = q('heap-smash');
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        phase: q('heap-phase')?.dataset.phase ?? '',
        tree: [...document.querySelectorAll<SVGGElement>('[data-heap-node]')].map(g => `${g.dataset.heapNode}=${g.dataset.value}:${g.dataset.state}:${g.dataset.pointers}`),
        array: [...document.querySelectorAll<HTMLElement>('[data-heap-index]')].map(e => `${e.dataset.heapIndex}=${e.dataset.value}:${e.dataset.state}:${e.dataset.pointers}`),
        smash: smash ? `${smash.dataset.y}|${smash.dataset.x}|${smash.dataset.top}|${smash.dataset.popping}|${smash.dataset.outcome}` : '',
        smashes: [...document.querySelectorAll<HTMLElement>('[data-smash]')].map(e => e.dataset.smash!),
        depth: q('heap-calls')?.dataset.depth ?? '',
        result: q('heap-result')?.textContent?.trim() ?? null,
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

/** a position's state, as the engine's step says (the same rules as the visualizer) */
function stateOf(s: ExecutionStep, k: number): string {
  const v = s.heap!;
  if (v.result && v.heap.length === 1) return 'result';
  if (v.swapped?.includes(k)) return 'swapped';
  if (v.moved && v.moved.to === k) return 'moved';
  if (v.moved && v.moved.from === k && v.moved.from !== v.moved.to) return 'leaving';
  if (v.inserted === k) return 'inserted';
  if (v.compared?.includes(k)) return 'compared';
  if (v.pointers.find(p => p.name === 'i')?.index === k) return 'focus';
  return 'normal';
}

/** what the engine says a step shows, in the collector's shape */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): HeapUi {
  const v = s.heap!;
  const positions = v.heap.map((value, i) => `${i}=${value}:${stateOf(s, i)}:${v.pointers.filter(p => p.index === i).map(p => p.name).join(',')}`);
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    phase: v.phase,
    tree: positions,
    array: positions,
    smash: `${v.y ?? ''}|${v.x ?? ''}|${v.top ?? ''}|${v.popping ?? ''}|${v.smash ? (v.smash.left === 0 ? 'equal' : 'unequal') : ''}`,
    smashes: v.smashes.map(m => `${m.y},${m.x},${m.left}`),
    depth: String(v.calls.length),
    result: v.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Last Stone Weight', () => {
  test('listed under HEAP & PRIORITY QUEUE, after TREES; opens the max heap with the example and the array form', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('TREES')).toBeGreaterThan(-1);
    expect(at('TREES')).toBeLessThan(at('HEAP & PRIORITY QUEUE'));
    expect(at('HEAP & PRIORITY QUEUE')).toBeLessThan(at('Last Stone Weight'));
    expect(at('Last Stone Weight')).toBeLessThan(at('GRAPHS'));
    expect(at('Heap Sort')).toBeLessThan(at('TREES'));
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Last Stone Weight');
    await expect(page.getByTestId('heap-visualizer')).toBeVisible();
    await expect(field(page)).toHaveValue('2, 7, 4, 1, 8, 1');
    // the heap starts empty; the stones go in one at a time
    await expect(page.locator('[data-stone]')).toHaveCount(6);
    await expect(page.getByTestId('heap-empty')).toBeVisible();
    await expect(page.locator('[data-heap-index]')).toHaveCount(0);
    await expect(page.locator('#input-hint')).toContainText('Up to 10 whole numbers (1 to 999)');
  });

  test('[2, 7, 4]: every step as traced, in the tree and the array, ending with the last stone', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [2, 7, 4]);
    const steps = engine([2, 7, 4]);
    expect(steps.length).toBeLessThan(150);
    // an inserted stone moves up, popMax moves the last stone to the root, unequal stones leave a difference that moves up
    for (const ref of ['su-swap@stone', 'pop-move-last@y', 'insert-diff', 'su-swap@diff']) expect(steps.some(s => s.codeRef === ref), ref).toBe(true);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('heap-result')).toHaveText('The last stone weighs 1');
  });

  test('the example step by step: a stone moving up while building, popMax, the smash and the new stone', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine([2, 7, 4, 1, 8, 1]);
    const node = (k: number) => page.locator(`[data-heap-node="${k}"]`);
    const cell = (k: number) => page.locator(`[data-heap-index="${k}"]`);
    const go = async (index: number) => {
      await app.advance(index - ((await app.stepNumber()) - 1));
      await app.expectStep(index + 1);
    };

    // inserting 7 under 2: 7 is heavier, so they swap
    await go(steps.findIndex(s => s.codeRef === 'su-swap@stone'));
    await expect(page.getByTestId('heap-operation')).toHaveText('Swap up');
    await expect(node(0)).toHaveAttribute('data-state', 'swapped');
    await expect(node(1)).toHaveAttribute('data-state', 'swapped');
    await expect(cell(0)).toHaveAttribute('data-value', '7');
    await expect(page.getByTestId('heap-legend')).toContainText('just swapped');

    await go(steps.findIndex(s => s.codeRef === 'build-loop' && s.result === 'false'));
    await expect(page.getByTestId('heap-array')).toHaveAttribute('data-values', '8,7,4,1,2,1');

    await go(steps.findIndex(s => s.codeRef === 'pop-move-last@y'));
    await expect(node(0)).toHaveAttribute('data-state', 'moved');
    await expect(node(5)).toHaveAttribute('data-state', 'leaving');
    await expect(page.getByTestId('heap-smash')).toContainText('popMax for y: max = 8');
    await app.next(); // the last slot goes
    await expect(page.locator('[data-heap-node]')).toHaveCount(5);

    await go(steps.findIndex(s => s.codeRef === 'check-equal'));
    await expect(page.getByTestId('heap-smash')).toHaveAttribute('data-outcome', 'unequal');
    await expect(page.getByTestId('heap-smash-outcome')).toHaveText('y − x = 8 − 7 = 1: 7 destroyed, 1 goes back');
    await go(steps.findIndex(s => s.codeRef === 'ins-store@diff')); // insert stores y - x in the first free slot
    await expect(node(4)).toHaveAttribute('data-state', 'inserted');
    await expect(node(4)).toHaveAttribute('data-value', '1');
    await expect(page.locator('[data-smash]')).toHaveCount(1);
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows its listing, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      await enter(page, [9, 4, 4]);
      const def = definition(ID);
      // C writes the heap out; the others highlight the library call a step inside insert or popMax belongs to
      const LINES: Record<typeof lang, [string, string][]> = {
        c: [['sd-check-left@y', 'heap[l] > heap[largest]'], ['su-check@stone', 'heap[parent] >= heap[i]'], ['pop-shrink@y', 'heap[0] = heap[--(*size)];']],
        cpp: [['sd-check-left@y', 'pq.pop();'], ['su-check@stone', 'pq.push(s);'], ['pop-max@y', 'int y = pq.top();']],
        java: [['sd-check-left@y', 'int y = pq.poll();'], ['su-check@stone', 'pq.add(s);'], ['su-check@diff', 'pq.add(y - x);']],
        python: [['sd-check-left@y', 'y = -heapq.heappop(heap)'], ['su-check@stone', 'heapq.heapify(heap)'], ['su-check@diff', 'heapq.heappush(heap, -(y - x))']],
      };
      for (const [ref, code] of [...LINES[lang], ['check-equal', 'y != x']]) {
        await expect(page.locator(`[data-line="${def.lineMap[lang]![ref]}"]`)).toContainText(code);
      }
      const steps = engine([9, 4, 4]);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [name, stones, result] of [
    ['no stones', [], 'No stones at all: the answer is 0'],
    ['one stone', [5], 'The last stone weighs 5'],
    ['two equal stones', [4, 4], 'No stone is left: the answer is 0'],
    ['two unequal stones', [9, 3], 'The last stone weighs 6'],
    ['three equal stones', [3, 3, 3], 'The last stone weighs 3'],
  ] as const) {
    test(`edge case through the UI: ${name}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, stones);
      await app.goToLastStep();
      await expect(page.getByTestId('heap-result')).toHaveText(result);
      await expect(page.locator('[data-heap-node]')).toHaveCount(result.includes('answer is 0') ? 0 : 1);
      if (result.includes('answer is 0')) await expect(page.getByTestId('heap-empty')).toBeVisible();
    });
  }

  test('the largest input: 10 stones, a heap of four levels, every position drawn', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const stones = [999, 1, 500, 250, 125, 62, 31, 15, 7, 3];
    await enter(page, stones);
    await expect(page.locator('[data-stone]')).toHaveCount(10);
    await expect(page.getByTestId('heap-array')).toHaveAttribute('data-values', '');
    const steps = engine(stones);
    expect(steps.length).toBeLessThanOrEqual(750);
    await app.advance(steps.findIndex(s => s.codeRef === 'build-loop' && s.result === 'false'));
    await expect(page.locator('[data-heap-node]')).toHaveCount(10);
    await expect(page.getByTestId('heap-array')).toHaveAttribute('data-values', steps.find(s => s.codeRef === 'build-loop' && s.result === 'false')!.heap!.heap.join(','));
  });

  test('too many stones, 0, negative or malformed weights are refused next to the field with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [text, message] of [
      ['1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11', 'Too many values (11). The visualizer supports at most 10.'],
      ['3, 0, 2', 'Value 2 (0) is below 1: Last Stone Weight takes values from 1 to 999.'],
      ['-4', 'is below 1'],
      ['1, x', 'not a whole number'],
      ['1000', 'out of range'],
    ]) {
      await field(page).fill(text);
      await expect(page.getByTestId('input-error')).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await field(page).fill('1, 2, 3, 4, 5, 6, 7, 8, 9, 10');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Size offers up to 10; Randomize gives weights from 1 to 20; an array from another algorithm does not carry in', async ({ app, page }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([5, -2, 0, 9, 1, 2, 3, 4, 5, 6, 7, 8]);
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue('2, 7, 4, 1, 8, 1');
    await expect(page.getByTestId('input-issue')).toHaveCount(0);
    const sizes = await page.getByRole('combobox', { name: 'Array size' }).locator('option').allTextContents();
    expect(sizes.every(x => Number(x) <= 10)).toBe(true);
    await page.getByRole('combobox', { name: 'Array size' }).selectOption('10');
    for (let k = 0; k < 5; k++) {
      await app.randomizeButton.click();
      const values = (await field(page).inputValue()).split(',').map(x => Number(x.trim()));
      expect(values).toHaveLength(10);
      expect(values.every(v => Number.isInteger(v) && v >= 1 && v <= 20)).toBe(true);
    }
    await expect(page.locator('[data-stone]')).toHaveCount(10);
  });

  test('Play runs to the result; Previous, Next and Reset move through the steps', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, [9, 3]);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('heap-result')).toBeVisible({ timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine([9, 3]).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('heap-result')).toHaveCount(0);
    await app.next();
    await app.expectStep(total);
    await expect(page.getByTestId('heap-result')).toHaveText('The last stone weighs 6');
    await app.reset();
    await app.expectStep(1);
    await expect(page.getByTestId('heap-array')).toHaveAttribute('data-values', '');
    await expect(page.locator('[data-stone]')).toHaveCount(2);
    await expect(page.locator('[data-smash]')).toHaveCount(0);
  });

  test('phone width: no horizontal page scroll; the 10-stone tree scales down to fit, and the result can be reached', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm(ID);
    const stones = [999, 1, 500, 250, 125, 62, 31, 15, 7, 3];
    await enter(page, stones);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // the heap starts empty: the full tree is there once every stone is in
    await app.advance(engine(stones).findIndex(s => s.codeRef === 'build-loop' && s.result === 'false'));
    await expect(page.locator('[data-heap-node]')).toHaveCount(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const tree = (await page.getByTestId('heap-tree').boundingBox())!;
    expect(tree.x).toBeGreaterThanOrEqual(0);
    expect(tree.x + tree.width).toBeLessThanOrEqual(390);
    for (const k of [7, 9]) {
      const leaf = (await page.locator(`[data-heap-node="${k}"] circle`).boundingBox())!;
      expect(leaf.x).toBeGreaterThanOrEqual(tree.x);
      expect(leaf.x + leaf.width).toBeLessThanOrEqual(tree.x + tree.width + 0.5);
    }
    await enter(page, [9, 3]);
    await app.goToLastStep();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const result = page.getByTestId('heap-result');
    await result.scrollIntoViewIfNeeded();
    await expect(result).toBeInViewport({ ratio: 0.95 });
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA while swapping, moving the last stone to the root, inserting and at the result: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, [2, 7, 4]);
      const steps = engine([2, 7, 4]);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      let at = 0;
      for (const ref of ['su-swap@stone', 'pop-move-last@y', 'ins-store@diff']) {
        const index = steps.findIndex(s => s.codeRef === ref);
        await app.advance(index - at);
        at = index;
        await settle();
        expect(await violations(page), `${theme}: ${ref}`).toEqual([]);
      }
      await app.goToLastStep();
      await settle();
      expect(await violations(page), `${theme}: result`).toEqual([]);
    });
  }
});
