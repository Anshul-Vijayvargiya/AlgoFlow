import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Root to Leaf Paths through the real UI: the tree is typed into the level-order field; what each step shows (node
 * states, the node pointer, the call stack, the current path, the paths found and the highlighted line) is checked
 * against the engine's own trace for the same tree. The paths themselves are checked against a reference DFS on random
 * trees in the unit tests (rootToLeafPaths.test.ts).
 */
const ID = 'tree-root-to-leaf-paths' as const;
const EXAMPLE = '[1, 2, 3, 4, 5, 6, 7]';
const engine = (text: string) => definition(ID).generateSteps([], { texts: [text] });
const field = (page: Page) => page.locator('#text-input-root');

async function enter(page: Page, text: string) {
  await field(page).fill(text);
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(text).length));
}

interface PathsUi {
  step: number;
  line: number | null;
  nodes: Record<string, { state: string; pointers: string }>;
  calls: string[];
  path: string;
  saved: string[];
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<PathsUi[]> =>
  page.evaluate(async count => {
    const read = (): PathsUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        nodes: Object.fromEntries([...document.querySelectorAll<SVGGElement>('[data-node-id]')].map(g => [g.dataset.nodeId!, { state: g.dataset.state!, pointers: g.dataset.pointers! }])),
        calls: [...document.querySelectorAll<HTMLElement>('[data-frame]')].map(f => `${f.dataset.frameVia}:${f.dataset.frameNode}:${f.dataset.frameStatus}`),
        path: document.querySelector<HTMLElement>('[data-testid="tree-current-path"]')?.dataset.path ?? '',
        saved: [...document.querySelectorAll<HTMLElement>('[data-saved-path]')].map(p => p.dataset.savedPath!),
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
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): PathsUi {
  const t = s.tree!;
  const p = t.paths!;
  const value = (id: string) => t.nodes.find(n => n.id === id)!.value;
  const state = (id: string) => (id === t.current ? 'current' : p.path.includes(id) ? 'path' : p.finished.includes(id) ? 'visited' : 'unvisited');
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    nodes: Object.fromEntries(t.nodes.map(n => [n.id, { state: state(n.id), pointers: (t.pointers ?? []).filter(x => x.node === n.id).map(x => x.name).join(',') }])),
    calls: p.calls.map((c, i) => `${c.via}:${c.node ?? 'null'}:${i === p.calls.length - 1 ? 'active' : 'waiting'}`),
    path: p.path.map(value).join(','),
    saved: p.completed.map(path => path.map(value).join(',')),
    result: t.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Root to Leaf Paths', () => {
  test('listed in TREES after the traversals and before the BST algorithms; opens the tree view with the example', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Level Order Traversal')).toBeLessThan(text.indexOf('Root to Leaf Paths'));
    expect(text.indexOf('Root to Leaf Paths')).toBeLessThan(text.indexOf('Build a Binary Search Tree'));
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Root to Leaf Paths');
    await expect(page.getByTestId('tree-visualizer')).toBeVisible();
    await expect(field(page)).toHaveValue(EXAMPLE);
    await expect(page.locator('#text-input-low')).toHaveCount(0);
  });

  test('every step of the example: node states, pointer, call stack, current path, paths found and code line, as traced', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(steps.length));
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('tree-result')).toHaveText('4 root-to-leaf paths: [1, 2, 4], [1, 2, 5], [1, 3, 6], [1, 3, 7]');
  });

  for (const lang of ['c', 'java', 'python'] as const) {
    test(`the highlighted line follows the trace (${lang})`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const text = '[1, 2, 3, null, 4]';
      await enter(page, text);
      const steps = engine(text);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(definition(ID), lang, s.codeRef)));
    });
  }

  // one test per case, each stepping through its whole trace
  for (const [name, text, result] of [
    ['the empty tree', '[]', 'Empty tree: no root-to-leaf paths'],
    ['one node: the root is the only leaf', '[7]', '1 root-to-leaf path: [7]'],
    ['only a left child', '[1, 2]', '1 root-to-leaf path: [1, 2]'],
    ['only a right child', '[1, null, 2]', '1 root-to-leaf path: [1, 2]'],
    ['a skewed tree', '[1, 2, null, 3, null, 4, null, 5]', '1 root-to-leaf path: [1, 2, 3, 4, 5]'],
    ['negative values', '[-1, -2, -3, null, -4]', '2 root-to-leaf paths: [-1, -2, -4], [-1, -3]'],
    ['duplicates in a tree that is not a BST', '[2, 2, 9, 2, null, null, 1]', '2 root-to-leaf paths: [2, 2, 2], [2, 9, 1]'],
  ] as const) {
    test(`edge case through the UI: ${name}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, text);
      await app.goToLastStep();
      await expect(page.getByTestId('tree-result')).toHaveText(result);
    });
  }

  test('malformed trees are refused next to the field with Visualize disabled; a non-BST tree is accepted', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [text, message] of [
      ['[1, 2, 3', 'missing its closing "]"'],
      ['[null, 1]', 'The root (value 1) cannot be null.'],
      [`[${Array.from({ length: 16 }, (_, k) => k).join(', ')}]`, 'Too many nodes (16)'],
    ]) {
      await field(page).fill(text);
      await expect(page.getByTestId('input-error')).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await field(page).fill('[5, 9, 1]');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Play runs to the result; Previous steps back; Reset returns to the start', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('tree-result')).toHaveText('4 root-to-leaf paths: [1, 2, 4], [1, 2, 5], [1, 3, 6], [1, 3, 7]', { timeout: 30_000 });
    const total = await app.totalSteps();
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('tree-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-saved-path]')).toHaveCount(0);
    await expect(page.getByTestId('tree-current-path')).toHaveAttribute('data-path', '');
  });

  test('phone width: no horizontal page scroll', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm(ID);
    await enter(page, '[8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]');
    await app.advance(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA mid-trace and at the end: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      for (const advance of [14, 0]) {
        if (advance) await app.advance(advance);
        else await app.goToLastStep();
        await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
        expect(await violations(page), theme).toEqual([]);
      }
    });
  }
});
