import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import { layoutTree } from '../../src/engine/tree/binaryTree';

/**
 * Mirror a BST through the real UI: the BST is typed into the level-order field; what each step shows (node states and
 * columns, the pointers, every drawn link with its side, the swap in progress, the call stack, the tree's level order,
 * the swap order, the result and the highlighted line) is checked against the engine's own trace for the same tree.
 * The mirrored trees themselves are checked against a reference on random BSTs in the unit tests (mirrorBst.test.ts).
 */
const ID = 'bst-mirror' as const;
const DEFAULT = '[8, 5, 12, 3, 6, 10, 14]';
const MIRRORED = '[8, 12, 5, 14, 10, 6, 3]';
const engine = (text: string) => definition(ID).generateSteps([], { texts: [text] });
const field = (page: Page) => page.locator('#text-input-root');

async function enter(page: Page, text: string) {
  await field(page).fill(text);
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(text).length));
}

interface MirrorUi {
  step: number;
  line: number | null;
  nodes: Record<string, { state: string; pointers: string; x: string }>;
  edges: string[];
  calls: string[];
  swap: string | null;
  shape: string | null;
  swapped: string[];
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<MirrorUi[]> =>
  page.evaluate(async count => {
    const read = (): MirrorUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const swap = document.querySelector<HTMLElement>('[data-testid="tree-swap"]');
      const d = swap?.dataset;
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        nodes: Object.fromEntries(
          [...document.querySelectorAll<SVGGElement>('[data-node-id]')].map(g => [g.dataset.nodeId!, { state: g.dataset.state!, pointers: g.dataset.pointers!, x: g.dataset.x! }])
        ),
        edges: [...document.querySelectorAll<SVGElement>('[data-edge]')].map(e => `${e.dataset.edge}:${e.dataset.side}`).sort(),
        calls: [...document.querySelectorAll<HTMLElement>('[data-frame]')].map(f => `${f.dataset.frameVia}:${f.dataset.frameNode}:${f.dataset.frameStatus}`),
        swap: d ? `${d.node} ${d.phase} orig(${d.originalLeft},${d.originalRight}) temp=${d.temp} left=${d.left} right=${d.right}` : null,
        shape: document.querySelector<HTMLElement>('[data-testid="tree-shape"]')?.dataset.shape ?? null,
        swapped: [...document.querySelectorAll<HTMLElement>('[data-swapped]')].map(v => v.dataset.swapped!),
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
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): MirrorUi {
  const t = s.tree!;
  const m = t.mirror!;
  const sw = m.swap;
  const value = (id: string | null) => (id === null ? 'null' : String(t.nodes.find(n => n.id === id)!.value));
  const swapping = sw ? [sw.originalLeft, sw.originalRight] : [];
  const state = (id: string) =>
    id === t.current ? 'current' : swapping.includes(id) ? 'swapping' : m.completed.includes(id) ? 'completed' : m.swapped.includes(id) ? 'swapped' : 'unvisited';
  const layout = layoutTree(t);
  // the node being swapped is drawn with its real links
  const link = (n: (typeof t.nodes)[number], side: 'left' | 'right') => (sw?.node === n.id ? sw[side] : n[side]);
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    nodes: Object.fromEntries(
      t.nodes.map(n => [n.id, { state: state(n.id), pointers: (t.pointers ?? []).filter(x => x.node === n.id).map(x => x.name).join(','), x: String(layout[n.id].x) }])
    ),
    edges: t.nodes.flatMap(n => (['left', 'right'] as const).flatMap(side => (link(n, side) ? [`${n.id}-${link(n, side)}:${side}`] : []))).sort(),
    calls: m.calls.map((c, i) => `${c.via}:${c.node ?? 'null'}:${i === m.calls.length - 1 ? (c.returned ? 'returning' : 'active') : 'waiting'}`),
    swap: sw ? `${value(sw.node)} ${sw.phase} orig(${value(sw.originalLeft)},${value(sw.originalRight)}) temp=${value(sw.temp)} left=${value(sw.left)} right=${value(sw.right)}` : null,
    shape: m.shape,
    swapped: m.swapped.map(value),
    result: t.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Mirror a BST', () => {
  test('listed in TREES right after Validate Binary Search Tree; opens the tree view with the default BST', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Validate Binary Search Tree')).toBeGreaterThan(-1);
    expect(text.indexOf('Validate Binary Search Tree')).toBeLessThan(text.indexOf('Mirror a BST'));
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Mirror a BST');
    await expect(page.getByTestId('tree-visualizer')).toBeVisible();
    await expect(field(page)).toHaveValue(DEFAULT);
    await expect(page.getByTestId('tree-shape')).toHaveAttribute('data-shape', DEFAULT);
  });

  test('the default BST, every step: node states, links, swap, calls, level order and code line, as traced; the mirrored tree', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, DEFAULT);
    const steps = engine(DEFAULT);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('tree-result')).toHaveText(`Mirrored tree: ${MIRRORED} (values now decrease from left to right: not a valid BST)`);
    await expect(page.getByTestId('tree-shape')).toHaveAttribute('data-shape', MIRRORED);
    await expect(page.locator('[data-node-id][data-state="completed"]')).toHaveCount(7);
    // drawn left to right, the values now decrease
    const byColumn = await page.locator('[data-node-id]').evaluateAll(gs => gs.map(g => [Number((g as SVGGElement).dataset.x), Number((g as SVGGElement).dataset.value)]));
    expect(byColumn.sort((a, b) => a[0] - b[0]).map(p => p[1])).toEqual([14, 12, 10, 8, 6, 5, 3]);
  });

  test('step by step, the swap at the root: temp, both links on 12, then the tree redrawn with the children swapped', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, DEFAULT);
    const swapPanel = page.getByTestId('tree-swap');
    const root = page.locator('[data-node-id="n0"]');
    const five = page.locator('[data-node-id="n1"]');
    const twelve = page.locator('[data-node-id="n2"]');
    await app.advance(2);
    await app.expectStep(3);
    await expect(swapPanel).toHaveAttribute('data-phase', 'temp');
    await expect(swapPanel).toContainText('temp = 5');
    await expect(five).toHaveAttribute('data-pointers', 'temp');
    await expect(five).toHaveAttribute('data-state', 'swapping');
    await expect(twelve).toHaveAttribute('data-state', 'swapping');
    await app.next();
    await expect(swapPanel).toHaveAttribute('data-phase', 'left');
    await expect(swapPanel).toHaveAttribute('data-left', '12');
    await expect(swapPanel).toHaveAttribute('data-right', '12');
    await expect(page.locator('[data-edge="n0-n2"]')).toHaveCount(2);
    await expect(page.locator('[data-edge="n0-n1"]')).toHaveCount(0);
    // not redrawn yet: 5 is still left of 8
    await expect(five).toHaveAttribute('data-x', '1');
    await app.next();
    await expect(swapPanel).toHaveAttribute('data-phase', 'right');
    await expect(swapPanel).toHaveAttribute('data-right', '5');
    await expect(page.locator('[data-edge="n0-n2"]')).toHaveAttribute('data-side', 'left');
    await expect(page.locator('[data-edge="n0-n1"]')).toHaveAttribute('data-side', 'right');
    await expect(twelve).toHaveAttribute('data-x', '1');
    await expect(five).toHaveAttribute('data-x', '5');
    await expect(root).toHaveAttribute('data-x', '3');
    await expect(page.getByTestId('tree-shape')).toHaveAttribute('data-shape', '[8, 12, 5, 10, 14, 3, 6]');
    await expect(page.locator('[data-swapped]')).toHaveText(['8']);
    // the recursion goes on into the new left child, 12
    await app.next();
    await expect(twelve).toHaveAttribute('data-state', 'current');
    await expect(swapPanel).toHaveCount(0);
    await expect(root).toHaveAttribute('data-state', 'swapped');
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the swap, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      await enter(page, DEFAULT);
      const def = definition(ID);
      const arrow = lang === 'c' || lang === 'cpp' ? '->' : '.';
      for (const [ref, code] of [
        ['save-temp', `temp = node${arrow}left`],
        ['set-left', `node${arrow}left = node${arrow}right`],
        ['set-right', `node${arrow}right = temp`],
        ['recurse-left', `mirror(node${arrow}left)`],
        ['recurse-right', `mirror(node${arrow}right)`],
        ['return-node', 'return node'],
      ] as const) {
        await expect(page.locator(`[data-line="${def.lineMap[lang]![ref]}"]`)).toContainText(code);
      }
      const steps = engine(DEFAULT);
      // the default tree reaches every line in the map
      expect(new Set(steps.map(s => s.codeRef)).size).toBe(Object.keys(def.lineMap[lang]!).length);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  // one test per case, each stepping through its whole trace
  for (const [name, text, mirrored, result] of [
    ['the empty tree', '[]', '[]', 'Mirrored tree: [] (the empty tree is its own mirror)'],
    ['one node', '[7]', '[7]', 'Mirrored tree: [7] (a single node is its own mirror)'],
    ['a left-skewed BST', '[5, 4, null, 3, null, 2, null, 1]', '[5, null, 4, null, 3, null, 2, null, 1]', 'Mirrored tree: [5, null, 4, null, 3, null, 2, null, 1] (values now decrease from left to right: not a valid BST)'],
    ['a right-skewed BST', '[1, null, 2, null, 3, null, 4, null, 5]', '[1, 2, null, 3, null, 4, null, 5]', 'Mirrored tree: [1, 2, null, 3, null, 4, null, 5] (values now decrease from left to right: not a valid BST)'],
    ['missing children', '[10, 5, 15, null, 7, 12]', '[10, 15, 5, null, 12, 7]', 'Mirrored tree: [10, 15, 5, null, 12, 7] (values now decrease from left to right: not a valid BST)'],
    ['negative values', '[-5, -10, 0, -12, -7, null, 3]', '[-5, 0, -10, 3, null, -7, -12]', 'Mirrored tree: [-5, 0, -10, 3, null, -7, -12] (values now decrease from left to right: not a valid BST)'],
  ] as const) {
    test(`edge case through the UI: ${name}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, text);
      await app.goToLastStep();
      await expect(page.getByTestId('tree-result')).toHaveText(result);
      await expect(page.getByTestId('tree-shape')).toHaveAttribute('data-shape', mirrored);
      await expect(page.getByTestId('tree-shape')).toHaveAttribute('data-original', text);
      if (text === '[]') await expect(page.getByTestId('tree-empty')).toBeVisible();
    });
  }

  test('one node, every step as traced: temp = null and the three statements still run', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, '[7]');
    const steps = engine('[7]');
    const shown = await collect(page, steps.length);
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    expect(shown.filter(u => u.swap).map(u => u.swap)).toEqual(['7 temp orig(null,null) temp=null left=null right=null', '7 left orig(null,null) temp=null left=null right=null', '7 right orig(null,null) temp=null left=null right=null']);
  });

  test('malformed trees and trees that are not a BST are refused next to the field with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [text, message] of [
      ['[1, 2, 3', 'missing its closing "]"'],
      ['[null, 1]', 'The root (value 1) cannot be null.'],
      ['[1000]', 'out of range'],
      ['[8, 12, 5]', 'Not a binary search tree'],
      ['[5, 5]', 'values cannot repeat'],
    ]) {
      await field(page).fill(text);
      await expect(page.getByTestId('input-error')).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await field(page).fill('[2, 1, 3]');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Play runs to the mirrored tree; Previous steps back; Next steps forward; Reset returns to the input tree', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, DEFAULT);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('tree-result')).toBeVisible({ timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine(DEFAULT).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('tree-result')).toHaveCount(0);
    await app.next();
    await app.expectStep(total);
    await expect(page.getByTestId('tree-shape')).toHaveAttribute('data-shape', MIRRORED);
    await app.reset();
    await app.expectStep(1);
    await expect(page.getByTestId('tree-shape')).toHaveAttribute('data-shape', DEFAULT);
    await expect(page.locator('[data-swapped]')).toHaveCount(0);
    await expect(page.locator('[data-node-id="n1"]')).toHaveAttribute('data-x', '1');
  });

  test('phone width: no horizontal page scroll', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm(ID);
    await enter(page, '[8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]');
    await app.advance(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA mid-swap and at the mirrored tree: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, DEFAULT);
      // step 4: just after node.left = node.right at the root, then the last step
      for (const advance of [3, 0]) {
        if (advance) await app.advance(advance);
        else await app.goToLastStep();
        await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
        expect(await violations(page), theme).toEqual([]);
      }
    });
  }
});
