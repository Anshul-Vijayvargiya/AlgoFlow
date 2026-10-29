import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type AlgorithmId, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * The four binary tree traversals (Trees), through the real UI. What each step shows — node states and visit order,
 * pointers, the stack or queue, the output and the highlighted line — is checked against the engine's own trace for the
 * same tree; the orders themselves are checked against recursive references in the unit tests (treeTraversals.test.ts).
 */
const TRAVERSALS: { id: AlgorithmId; name: string; order: string }[] = [
  { id: 'tree-inorder', name: 'Inorder Traversal', order: '[4, 2, 5, 1, 3, 6]' },
  { id: 'tree-preorder', name: 'Preorder Traversal', order: '[1, 2, 4, 5, 3, 6]' },
  { id: 'tree-postorder', name: 'Postorder Traversal', order: '[4, 5, 2, 6, 3, 1]' },
  { id: 'tree-level-order', name: 'Level Order Traversal', order: '[1, 2, 3, 4, 5, 6]' },
];
const EXAMPLE = '[1, 2, 3, 4, 5, null, 6]';
const PREFIX = { 'tree-inorder': 'Inorder', 'tree-preorder': 'Preorder', 'tree-postorder': 'Postorder', 'tree-level-order': 'Level order' } as Record<string, string>;

const engine = (id: AlgorithmId, text: string) => definition(id).generateSteps([], { texts: [text] });
const field = (page: Page) => page.locator('#text-input-root');

async function enter(page: Page, id: AlgorithmId, text: string) {
  await field(page).fill(text);
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(id, text).length));
}

interface TreeUi {
  step: number;
  line: number | null;
  nodes: Record<string, { state: string; order: string; pointers: string }>;
  container: { kind: string; items: string[]; action: string } | null;
  output: number[];
  nullPointers: string | null;
  result: string | null;
}

/** what the tree visualizer shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<TreeUi[]> =>
  page.evaluate(async count => {
    const read = (): TreeUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const box = document.querySelector<HTMLElement>('[data-testid="tree-stack"], [data-testid="tree-queue"]');
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        nodes: Object.fromEntries(
          [...document.querySelectorAll<SVGGElement>('[data-node-id]')].map(g => [
            g.dataset.nodeId!,
            { state: g.dataset.state!, order: g.dataset.visitOrder!, pointers: g.dataset.pointers! },
          ])
        ),
        container: box ? { kind: box.dataset.testid!.replace('tree-', ''), items: [...box.querySelectorAll<HTMLElement>('[data-item]')].map(i => i.dataset.item!), action: box.dataset.action ?? '' } : null,
        output: [...document.querySelectorAll<HTMLElement>('[data-output]')].map(o => Number(o.dataset.output)),
        nullPointers: document.querySelector('[data-testid="tree-null-pointers"]')?.textContent?.trim() ?? null,
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
function expected(id: AlgorithmId, lang: ProgrammingLanguage, s: ExecutionStep, k: number): TreeUi {
  const t = s.tree!;
  const waiting = new Set([...(t.stack?.items ?? []), ...(t.queue?.items ?? [])]);
  const order = new Map(t.visited.map((n, i) => [n, i + 1]));
  const value = (n: string) => t.nodes.find(x => x.id === n)!.value;
  const pointersAt = (n: string) => (t.pointers ?? []).filter(p => p.node === n).map(p => p.name).join(',');
  const box = t.stack ? { kind: 'stack', ...t.stack } : t.queue ? { kind: 'queue', ...t.queue } : null;
  const nulls = (t.pointers ?? []).filter(p => p.node === null).map(p => `${p.name} = null`);
  return {
    step: k + 1,
    line: resolveCodeRef(definition(id), lang, s.codeRef),
    nodes: Object.fromEntries(
      t.nodes.map(n => [
        n.id,
        {
          state: n.id === t.current ? 'current' : order.has(n.id) ? 'visited' : waiting.has(n.id) ? 'waiting' : 'unvisited',
          order: order.has(n.id) ? String(order.get(n.id)) : '',
          pointers: pointersAt(n.id),
        },
      ])
    ),
    container: box ? { kind: box.kind, items: [...box.items], action: box.action ?? '' } : null,
    output: t.visited.map(value),
    nullPointers: nulls.length ? nulls.join(', ') : null,
    result: t.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Trees in the sidebar', () => {
  test('TREES lists the four traversals; each opens the tree view with a level-order input', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('TREES')).toBeLessThan(text.indexOf('Inorder Traversal'));
    for (const { id, name } of TRAVERSALS) {
      await app.selectAlgorithm(id);
      await expect(app.heading).toHaveText(name);
      await expect(page.getByTestId('tree-visualizer')).toBeVisible();
      await expect(field(page)).toHaveValue(EXAMPLE);
      await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
      await expect(app.sizeSelect).toHaveCount(0);
    }
  });
});

for (const { id, name, order } of TRAVERSALS) {
  test.describe(name, () => {
    test(`every step of the example: node states, visit order, pointers, ${id === 'tree-level-order' ? 'queue' : 'stack'}, output and code line, as traced`, async ({ app, page }) => {
      await app.selectAlgorithm(id);
      const steps = engine(id, EXAMPLE);
      await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(steps.length));
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
      for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected(id, 'cpp', s, k));
      await expect(page.getByTestId('tree-result')).toHaveText(`${PREFIX[id]}: ${order}`);
    });
  });
}

test.describe('code lines', () => {
  for (const lang of ['c', 'java', 'python'] as const) {
    test(`Postorder: the highlighted line follows the trace (${lang})`, async ({ app, page }) => {
      await app.selectAlgorithm('tree-postorder');
      await app.setLanguage(lang);
      const steps = engine('tree-postorder', EXAMPLE);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(definition('tree-postorder'), lang, s.codeRef)));
    });
  }
});

test.describe('input and layout', () => {
  test('nodes are drawn where the tree says: left children left of and below their parent, right children right of it', async ({ app, page }) => {
    await app.selectAlgorithm('tree-inorder');
    const center = async (id: string) => {
      const b = (await page.locator(`[data-node-id="${id}"] circle`).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    for (const [parent, child, side] of [['n0', 'n1', 'left'], ['n0', 'n2', 'right'], ['n1', 'n3', 'left'], ['n1', 'n4', 'right'], ['n2', 'n6', 'right']] as const) {
      const p = await center(parent);
      const c = await center(child);
      expect(c.y, `${child} below ${parent}`).toBeGreaterThan(p.y);
      if (side === 'left') expect(c.x).toBeLessThan(p.x);
      else expect(c.x).toBeGreaterThan(p.x);
      await expect(page.locator(`[data-edge="${parent}-${child}"]`)).toHaveAttribute('data-side', side);
    }
    await expect(page.locator('[data-edge]')).toHaveCount(5);
  });

  test('an unbalanced tree with missing children, one node, and the empty tree', async ({ app, page }) => {
    await app.selectAlgorithm('tree-postorder');
    await enter(page, 'tree-postorder', '[1, null, 2, 3]');
    await app.goToLastStep();
    await expect(page.getByTestId('tree-result')).toHaveText('Postorder: [3, 2, 1]');
    await expect(page.locator('[data-node-id]')).toHaveCount(3);

    await app.selectAlgorithm('tree-level-order');
    await enter(page, 'tree-level-order', '[7]');
    await app.goToLastStep();
    await expect(page.getByTestId('tree-result')).toHaveText('Level order: [7]');

    await enter(page, 'tree-level-order', '[]');
    await expect(page.getByTestId('tree-empty')).toHaveText('The tree is empty (root = null).');
    await app.goToLastStep();
    await expect(page.getByTestId('tree-result')).toHaveText('Level order: []');
  });

  test('malformed trees are refused next to the field, with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm('tree-preorder');
    for (const [text, message] of [
      ['[1, 2, 3', 'missing its closing "]"'],
      ['[1, x]', 'Value 2 ("x") is not a whole number or null.'],
      ['[null, 1]', 'The root (value 1) cannot be null.'],
      ['[1, null, null, 4]', 'Value 4 (4) has no parent'],
      ['[1, 1000]', 'out of range'],
      [`[${Array.from({ length: 16 }, (_, k) => k).join(', ')}]`, 'Too many nodes (16)'],
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

  test('Play runs a traversal to its result; Previous steps back; Reset returns to the start', async ({ app, page }) => {
    await app.selectAlgorithm('tree-preorder');
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('tree-result')).toHaveText('Preorder: [1, 2, 4, 5, 3, 6]', { timeout: 30_000 });
    const total = await app.totalSteps();
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('tree-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-node-id][data-state="visited"]')).toHaveCount(0);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA mid-trace, with the stack and with the queue: no violations (${theme})`, async ({ app, page }) => {
      test.slow(); // several full-page scans
      await page.locator('#header-theme-select').selectOption(theme);
      for (const [id, at] of [['tree-inorder', 12], ['tree-level-order', 10]] as const) {
        await app.selectAlgorithm(id);
        await app.advance(at);
        await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
        expect(await violations(page), `${id} (${theme})`).toEqual([]);
      }
    });
  }

  test('phone width: no horizontal page scroll; a 15-node tree scrolls inside its own focusable region', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm('tree-level-order');
    await enter(page, 'tree-level-order', '[8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]');
    await app.advance(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const region = page.getByRole('region', { name: 'Binary tree' });
    const { scroll, client } = await region.evaluate(e => ({ scroll: e.scrollWidth, client: e.clientWidth }));
    expect(scroll).toBeGreaterThan(client);
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate(e => e.scrollLeft)).toBeGreaterThan(0);
  });
});
