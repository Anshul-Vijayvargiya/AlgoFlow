import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import { levelOrderText } from '../../src/engine/tree/binaryTree';

/**
 * Build a Binary Search Tree (Trees), through the real UI: a tree view fed by the array input. What each step shows —
 * the tree built so far, node states, pointers, the dashed empty child, the input in order, the highlighted line and
 * the result — is checked against the engine's own trace; the trees themselves are checked against a recursive
 * insertion in the unit tests (buildBst.test.ts).
 */
const ID = 'build-bst' as const;
const EXAMPLE = [50, 30, 70, 20, 40, 60, 80];
const engine = (values: number[]) => definition(ID).generateSteps([...values]);

interface BstUi {
  step: number;
  line: number | null;
  nodes: Record<string, { value: number; state: string; pointers: string }>;
  edges: string[];
  slot: string | null;
  input: string[];
  result: string | null;
}

/** what the tree view shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<BstUi[]> =>
  page.evaluate(async count => {
    const read = (): BstUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const slot = document.querySelector<SVGGElement>('[data-testid="tree-slot"]');
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        nodes: Object.fromEntries(
          [...document.querySelectorAll<SVGGElement>('[data-node-id]')].map(g => [g.dataset.nodeId!, { value: Number(g.dataset.value), state: g.dataset.state!, pointers: g.dataset.pointers! }])
        ),
        edges: [...document.querySelectorAll<SVGLineElement>('[data-edge]')].map(e => `${e.dataset.edge}:${e.dataset.side}`).sort(),
        slot: slot ? `${slot.dataset.parent}:${slot.dataset.side}:${slot.dataset.value}` : null,
        input: [...document.querySelectorAll<HTMLElement>('[data-input-status]')].map(i => i.dataset.inputStatus!),
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

/** what the engine says a step shows, in the collector's shape (states as the build view defines them) */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): BstUi {
  const t = s.tree!;
  const b = t.build!;
  const path = new Set(b.path);
  const state = (id: string) => (id === b.inserted ? 'inserted' : id === b.duplicate ? 'duplicate' : id === t.current ? 'current' : path.has(id) ? 'path' : 'unvisited');
  const handled = b.index ?? (t.result ? b.values.length : 0);
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    nodes: Object.fromEntries(
      t.nodes.map(n => [n.id, { value: n.value, state: state(n.id), pointers: (t.pointers ?? []).filter(p => p.node === n.id).map(p => p.name).join(',') }])
    ),
    edges: t.nodes.flatMap(n => (['left', 'right'] as const).flatMap(side => (n[side] ? [`${n.id}-${n[side]}:${side}`] : []))).sort(),
    slot: b.slot && b.slot.parent !== null ? `${b.slot.parent}:${b.slot.side}:${b.values[b.index!]}` : null,
    input: b.values.map((_, i) => (i === b.index ? 'current' : b.skipped.includes(i) ? 'skipped' : i < handled ? 'done' : 'pending')),
    result: t.result?.text ?? null,
  };
}

async function enter(page: Page, values: number[]) {
  await page.getByRole('textbox', { name: 'Array', exact: true }).fill(values.join(', '));
  await page.getByRole('button', { name: 'Visualize' }).click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(values).length));
}

test.describe('Build a Binary Search Tree', () => {
  test('listed in TREES after the traversals; opens the tree view with the array input, not bars or a tree text field', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Level Order Traversal')).toBeLessThan(text.indexOf('Build a Binary Search Tree'));
    await app.selectAlgorithm(ID);
    await expect(page.getByTestId('tree-visualizer')).toBeVisible();
    await expect(page.getByTestId('tree-empty')).toBeVisible();
    await expect(app.arrayInput).toHaveValue(EXAMPLE.join(', '));
    await expect(page.locator('#text-input-root')).toHaveCount(0);
    await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(EXAMPLE).length));
  });

  test('every step of the example: the tree so far, node states, pointers, the empty child, the input and the C++ line, as traced', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    const observed = await collect(page, steps.length);
    expect(observed).toEqual(steps.map((s, k) => expected('cpp', s, k)));
    expect(observed.at(-1)!.result).toBe('BST of 7 nodes; inorder: [20, 30, 40, 50, 60, 70, 80]');
    await expect(page.getByTestId('step-state')).toHaveText(levelOrderText(steps.at(-1)!.tree!));
  });

  test('the highlighted line follows the trace in C, Java and Python too', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    for (const lang of ['c', 'java', 'python'] as const) {
      await app.setLanguage(lang);
      await app.reset();
      const lines = (await collect(page, steps.length)).map(u => u.line);
      expect(lines, lang).toEqual(steps.map(s => resolveCodeRef(definition(ID), lang, s.codeRef)));
    }
  });

  test('typed input with duplicates and negatives: duplicates are skipped and marked; the final tree is as traced', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const values = [5, -3, 8, 5, -3, 0];
    await enter(page, values);
    const steps = engine(values);
    const observed = await collect(page, steps.length);
    expect(observed).toEqual(steps.map((s, k) => expected('cpp', s, k)));
    expect(observed.at(-1)!.input).toEqual(['done', 'done', 'done', 'skipped', 'skipped', 'done']);
    expect(observed.at(-1)!.result).toBe('BST of 4 nodes; inorder: [-3, 0, 5, 8]; 2 duplicates skipped');
  });

  test('a sorted input builds a deep chain (8 levels) drawn in compact rows within the tree view', async ({ app, page }) => {
    // 8 levels is past the compact-row threshold (6) and takes 170 steps to reach the end (16 values take 594, too many
    // clicks for the test time in slower browsers); the 16-level size itself is checked by the render unit test
    await app.selectAlgorithm(ID);
    const values = Array.from({ length: 8 }, (_, k) => k + 1);
    await enter(page, values);
    await app.goToLastStep();
    await expect(page.locator('[data-node-id]')).toHaveCount(8);
    const svg = (await page.getByTestId('tree-svg').boundingBox())!;
    // compact rows: 8 levels × 46 px plus padding, rather than 8 × 66
    expect(svg.height).toBe(8 * 46 + 52);
    const view = (await page.getByTestId('tree-visualizer').boundingBox())!;
    expect(svg.x).toBeGreaterThanOrEqual(view.x);
    expect(svg.x + svg.width).toBeLessThanOrEqual(view.x + view.width);
    await expect(page.getByTestId('tree-result')).toHaveText(`BST of 8 nodes; inorder: [${values.join(', ')}]`);
  });

  test('an empty input completes with the empty tree', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await page.getByRole('textbox', { name: 'Array', exact: true }).fill('');
    await page.getByRole('button', { name: 'Visualize' }).click();
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', '3');
    await app.goToLastStep();
    await expect(page.getByTestId('tree-empty')).toBeVisible();
    await expect(page.getByTestId('tree-result')).toHaveText('Empty tree: no values to insert');
  });

  test('no accessibility violations while a value is placed (the dashed empty child is shown)', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const at = engine(EXAMPLE).findIndex(s => s.codeRef === 'check-side' && s.tree!.build!.index === 4);
    await app.advance(at);
    await expect(page.getByTestId('tree-slot')).toBeVisible();
    await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`))).toEqual([]);
  });
});
