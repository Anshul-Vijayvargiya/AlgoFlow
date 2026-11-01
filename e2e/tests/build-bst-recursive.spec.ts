import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import { levelOrderText } from '../../src/engine/tree/binaryTree';

/**
 * Build a Binary Search Tree (Recursive), through the real UI. Each step's call stack (frames, their status and what
 * they return), the tree built so far, the node states, the empty child or the node created for it, the input row and
 * the highlighted line are checked against the engine's own trace; the recursion itself is checked in the unit tests
 * (buildBstRecursive.test.ts).
 */
const ID = 'build-bst-recursive' as const;
const EXAMPLE = [50, 30, 70, 20, 40, 60, 80];
const engine = (values: number[]) => definition(ID).generateSteps([...values]);

interface RecUi {
  step: number;
  line: number | null;
  nodes: Record<string, string>;
  slot: string | null;
  calls: string[];
  input: string[];
}

const collect = (page: Page, count: number): Promise<RecUi[]> =>
  page.evaluate(async count => {
    const read = (): RecUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const slot = document.querySelector<SVGGElement>('[data-testid="tree-slot"]');
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        nodes: Object.fromEntries([...document.querySelectorAll<SVGGElement>('[data-node-id]')].map(g => [g.dataset.nodeId!, `${g.dataset.value}:${g.dataset.state}`])),
        slot: slot ? `${slot.dataset.parent}:${slot.dataset.side}:${slot.dataset.value}:${slot.dataset.created}` : null,
        calls: [...document.querySelectorAll<HTMLElement>('[data-frame]')].map(f => `${f.dataset.frameVia}:${f.dataset.frameNode}:${f.dataset.frameStatus}`),
        input: [...document.querySelectorAll<HTMLElement>('[data-input-status]')].map(i => i.dataset.inputStatus!),
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

function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): RecUi {
  const t = s.tree!;
  const b = t.build!;
  const path = new Set(b.path);
  const state = (id: string) => (id === b.inserted ? 'inserted' : id === b.duplicate ? 'duplicate' : id === t.current ? 'current' : path.has(id) ? 'path' : 'unvisited');
  const handled = b.index ?? (t.result ? b.values.length : 0);
  const calls = b.calls!;
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    nodes: Object.fromEntries(t.nodes.map(n => [n.id, `${n.value}:${state(n.id)}`])),
    slot: b.slot && b.slot.parent !== null ? `${b.slot.parent}:${b.slot.side}:${b.values[b.index!]}:${b.created ? 'true' : 'false'}` : null,
    calls: calls.map((f, i) => `${f.via}:${f.node ?? 'null'}:${i === calls.length - 1 ? (f.returns ? 'returning' : 'active') : 'waiting'}`),
    input: b.values.map((_, i) => (i === b.index ? 'current' : b.skipped.includes(i) ? 'skipped' : i < handled ? 'done' : 'pending')),
  };
}

async function enter(page: Page, values: number[]) {
  await page.getByRole('textbox', { name: 'Array', exact: true }).fill(values.join(', '));
  await page.getByRole('button', { name: 'Visualize' }).click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(values).length));
}

test.describe('Build a Binary Search Tree (Recursive)', () => {
  test('listed right after the iterative build; both open, each with its own trace, and search finds both', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Build a Binary Search Tree (Recursive)')).toBeGreaterThan(text.indexOf('Build a Binary Search Tree'));
    await app.selectAlgorithm('build-bst');
    await expect(page.getByTestId('tree-calls')).toHaveCount(0);
    await app.selectAlgorithm(ID);
    await expect(page.getByTestId('tree-calls')).toBeVisible();
    await expect(app.arrayInput).toHaveValue(EXAMPLE.join(', '));
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(EXAMPLE).length));
    await page.getByTestId('sidebar-search').fill('binary search tree');
    await expect(app.sidebar.locator('button:not([data-testid])')).toHaveText([/^Build a Binary Search Tree$/, /^Build a Binary Search Tree \(Recursive\)$/]);
  });

  test('every step of the example: call stack, tree, node states, empty child / created node, input and C++ line, as traced', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    const observed = await collect(page, steps.length);
    expect(observed).toEqual(steps.map((s, k) => expected('cpp', s, k)));
    await expect(page.getByTestId('tree-result')).toHaveText('BST of 7 nodes; inorder: [20, 30, 40, 50, 60, 70, 80]');
    await expect(page.getByTestId('step-state')).toHaveText(levelOrderText(steps.at(-1)!.tree!));
  });

  test('the highlighted line follows the recursion in C, Java and Python too', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    for (const lang of ['c', 'java', 'python'] as const) {
      await app.setLanguage(lang);
      await app.reset();
      expect((await collect(page, steps.length)).map(u => u.line), lang).toEqual(steps.map(s => resolveCodeRef(definition(ID), lang, s.codeRef)));
    }
  });

  test('Previous restores the exact earlier call stack and tree', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    const k = steps.findIndex(s => s.codeRef === 'base-create' && s.tree!.build!.index === 4);
    await app.advance(k);
    const before = (await collect(page, 1))[0];
    expect(before).toEqual(expected('cpp', steps[k], k));
    await app.advance(4);
    for (let i = 0; i < 4; i++) await app.previous();
    await app.expectStep(k + 1);
    expect((await collect(page, 1))[0]).toEqual(before);
  });

  test('typed duplicates (at the root and inside a subtree) and negatives, as traced', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const values = [0, -4, 0, 6, -4, -7];
    await enter(page, values);
    const steps = engine(values);
    expect(await collect(page, steps.length)).toEqual(steps.map((s, k) => expected('cpp', s, k)));
    await expect(page.getByTestId('tree-result')).toHaveText('BST of 4 nodes; inorder: [-7, -4, 0, 6]; 2 duplicates skipped');
  });

  test('a 9-call stack (9 sorted values) is listed in full and the running call stays in view', async ({ app, page }) => {
    // 9 calls are more than the list shows at once (about 7), and the deepest is 242 steps in (16 values take 767, too
    // many clicks for the test time in slower browsers); a 16-call stack is checked by the unit and render tests
    await app.selectAlgorithm(ID);
    const values = Array.from({ length: 9 }, (_, k) => k + 1);
    await enter(page, values);
    const steps = engine(values);
    const deepest = steps.findIndex(s => s.tree!.build!.calls!.length === 9);
    await app.advance(deepest);
    await expect(page.locator('[data-frame]')).toHaveCount(9);
    // the deep tree is tall, so bring the call stack on screen; within it, nothing else is scrolled by hand
    const region = page.getByRole('region', { name: 'Call stack' });
    await region.evaluate(el => el.parentElement!.scrollIntoView({ block: 'start' }));
    // the list is taller than its region, and the region starts at its end: the running (innermost) call
    expect(await region.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await expect(page.locator('[data-frame-status="active"]')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('[data-frame="0"]')).not.toBeInViewport();
    await expect(page.locator('[data-frame-status="active"]')).toContainText('base case');
  });

  test('an empty input: no call is made and the empty tree is shown', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await page.getByRole('textbox', { name: 'Array', exact: true }).fill('');
    await page.getByRole('button', { name: 'Visualize' }).click();
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', '3');
    await app.goToLastStep();
    await expect(page.getByTestId('tree-calls')).toContainText('no insert call in progress');
    await expect(page.getByTestId('tree-result')).toHaveText('Empty tree: no values to insert');
  });

  test('no accessibility violations while the base case returns a new node three calls deep', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const k = engine(EXAMPLE).findIndex(s => s.codeRef === 'base-create' && s.tree!.build!.index === 4);
    await app.advance(k);
    await expect(page.locator('[data-testid="tree-slot"][data-created="true"]')).toBeVisible();
    await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`))).toEqual([]);
  });
});
