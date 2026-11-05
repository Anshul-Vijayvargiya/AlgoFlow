import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Print in Range (BST) through the real UI: the BST and the range are typed into the three text fields; what each step
 * shows (node states, the node pointer, the call stack, the pruned nodes, the printed output and the highlighted line)
 * is checked against the engine's own trace for the same input. The answers themselves are checked against a brute
 * force on random BSTs in the unit tests (printInRange.test.ts).
 */
const ID = 'bst-print-in-range' as const;
const EXAMPLE = ['[8, 5, 12, 3, 6, 10, 14]', '5', '12'] as const;
const engine = (texts: readonly string[]) => definition(ID).generateSteps([], { texts: [...texts] });
const fields = (page: Page) => ({ root: page.locator('#text-input-root'), low: page.locator('#text-input-low'), high: page.locator('#text-input-high') });

async function enter(page: Page, texts: readonly string[]) {
  const f = fields(page);
  await f.root.fill(texts[0]);
  await f.low.fill(texts[1]);
  await f.high.fill(texts[2]);
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(texts).length));
}

interface RangeUi {
  step: number;
  line: number | null;
  nodes: Record<string, { state: string; pointers: string }>;
  calls: string[];
  pruned: string[];
  output: number[];
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<RangeUi[]> =>
  page.evaluate(async count => {
    const read = (): RangeUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        nodes: Object.fromEntries([...document.querySelectorAll<SVGGElement>('[data-node-id]')].map(g => [g.dataset.nodeId!, { state: g.dataset.state!, pointers: g.dataset.pointers! }])),
        calls: [...document.querySelectorAll<HTMLElement>('[data-frame]')].map(f => `${f.dataset.frameVia}:${f.dataset.frameNode}:${f.dataset.frameStatus}`),
        pruned: [...document.querySelectorAll<SVGGElement>('[data-node-id][data-state="pruned"]')].map(g => g.dataset.nodeId!).sort(),
        output: [...document.querySelectorAll<HTMLElement>('[data-output]')].map(o => Number(o.dataset.output)),
        result: document.querySelector('[data-testid="tree-result"]')?.textContent?.trim() ?? null,
      };
    };
    const states = [read()];
    for (let i = 1; i < count; i++) {
      const next = [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith('Next'));
      if (!next || next.disabled) break;
      const before = document.querySelector('[data-testid="step-counter"]')?.getAttribute('data-step');
      next.click();
      for (let tries = 0; tries < 500 && document.querySelector('[data-testid="step-counter"]')?.getAttribute('data-step') === before; tries++) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      states.push(read());
    }
    return states;
  }, count);

/** what the engine says a step shows, in the collector's shape */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): RangeUi {
  const t = s.tree!;
  const r = t.range!;
  const printed = new Set(t.visited);
  const inCall = new Set(r.calls.flatMap(c => (c.node ? [c.node] : [])));
  const state = (id: string) =>
    id === t.current ? 'current' : printed.has(id) ? 'visited' : r.outside.includes(id) ? 'outside' : r.pruned.includes(id) ? 'pruned' : inCall.has(id) ? 'waiting' : 'unvisited';
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    nodes: Object.fromEntries(t.nodes.map(n => [n.id, { state: state(n.id), pointers: (t.pointers ?? []).filter(p => p.node === n.id).map(p => p.name).join(',') }])),
    calls: r.calls.map((c, i) => `${c.via}:${c.node ?? 'null'}:${i === r.calls.length - 1 ? 'active' : 'waiting'}`),
    pruned: [...r.pruned].sort(),
    output: t.visited.map(id => t.nodes.find(n => n.id === id)!.value),
    result: t.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Print in Range (BST)', () => {
  test('listed in TREES after the BST builds; opens the tree view with the BST, low and high fields', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Build a Binary Search Tree (Recursive)')).toBeLessThan(text.indexOf('Print in Range (BST)'));
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Print in Range (BST)');
    await expect(page.getByTestId('tree-visualizer')).toBeVisible();
    const f = fields(page);
    await expect(f.root).toHaveValue(EXAMPLE[0]);
    await expect(f.low).toHaveValue(EXAMPLE[1]);
    await expect(f.high).toHaveValue(EXAMPLE[2]);
    await expect(page.getByTestId('tree-range')).toContainText('[5, 12]');
  });

  test('every step of the example: node states, pointer, call stack, pruning, output and code line, as traced; prints 5 6 8 10 12', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(steps.length));
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('tree-result')).toHaveText('Printed in ascending order: 5 6 8 10 12');
    // 3 and 14 were skipped by pruning, drawn as such and listed
    await expect(page.getByTestId('tree-pruned')).toHaveText('skipped by pruning: 3, 14');
  });

  for (const lang of ['c', 'java', 'python'] as const) {
    test(`the highlighted line follows the trace (${lang})`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const texts = ['[8, 5, 12, 3, 6, 10, 14]', '9', '11'];
      await enter(page, texts);
      const steps = engine(texts);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(definition(ID), lang, s.codeRef)));
    });
  }

  // one test per case: each steps through a whole trace, so together they outlast one test's budget in WebKit
  for (const [name, texts, result] of [
    ['nothing in range', ['[8, 5, 12, 3, 6, 10, 14]', '20', '30'], 'No value of the tree is in [20, 30]: nothing printed'],
    ['the whole tree', ['[8, 5, 12, 3, 6, 10, 14]', '-999', '999'], 'Printed in ascending order: 3 5 6 8 10 12 14'],
    ['low = high', ['[8, 5, 12, 3, 6, 10, 14]', '6', '6'], 'Printed in ascending order: 6'],
    ['negative values', ['[-5, -10, 0, -12, -7, null, 3]', '-8', '-1'], 'Printed in ascending order: -7 -5'],
    ['one node', ['[7]', '7', '7'], 'Printed in ascending order: 7'],
    ['the empty tree', ['[]', '1', '5'], 'Empty tree: nothing to print'],
  ] as const) {
    test(`edge case through the UI: ${name}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, texts);
      await app.goToLastStep();
      await expect(page.getByTestId('tree-result')).toHaveText(result);
    });
  }

  test('a tree that is not a BST, and low > high, are refused next to their field with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const f = fields(page);
    await f.root.fill('[8, 5, 12, 3, 9]');
    await expect(page.getByTestId('input-error')).toHaveText('Not a binary search tree: 9 is in the left subtree of 8, so it must be smaller than 8.');
    await expect(page.getByTestId('input-error')).toHaveAttribute('data-field', 'root');
    await expect(f.root).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-input')).toBeDisabled();

    await f.root.fill(EXAMPLE[0]);
    await f.low.fill('12');
    await f.high.fill('5');
    await expect(page.getByTestId('input-error')).toHaveText('"low" (12) is greater than "high" (5): the range needs low ≤ high.');
    await expect(page.getByTestId('input-error')).toHaveAttribute('data-field', 'high');
    await expect(f.high).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-input')).toBeDisabled();

    await f.low.fill('x');
    await expect(page.getByTestId('input-error')).toHaveAttribute('data-field', 'low');
    await f.low.fill('5');
    await f.high.fill('12');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Play runs to the result; Previous steps back; Reset returns to the start', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('tree-result')).toHaveText('Printed in ascending order: 5 6 8 10 12', { timeout: 30_000 });
    const total = await app.totalSteps();
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('tree-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-output]')).toHaveCount(0);
    await expect(page.locator('[data-node-id][data-state="pruned"]')).toHaveCount(0);
  });

  test('phone width: no horizontal page scroll', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm(ID);
    await enter(page, ['[8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]', '3', '11']);
    await app.advance(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA mid-trace and at the end, with pruned and outside nodes: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, ['[8, 5, 12, 3, 6, 10, 14]', '9', '11']);
      for (const advance of [8, 0]) {
        if (advance) await app.advance(advance);
        else await app.goToLastStep();
        await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
        expect(await violations(page), `${theme}`).toEqual([]);
      }
    });
  }
});
