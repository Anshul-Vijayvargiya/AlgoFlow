import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import { layoutTree } from '../../src/engine/tree/binaryTree';

/**
 * Convert BST to Balanced BST through the real UI: the BST is typed into the level-order field; what each step shows
 * (the stage, node states and places, the pointer, every drawn link, the call stack of each stage, the sorted array with
 * its left / mid / right, the result and the highlighted line) is checked against the engine's own trace for the same
 * tree. The balanced trees themselves are checked against a reference on random BSTs in the unit tests
 * (balanceBst.test.ts).
 */
const ID = 'bst-balance' as const;
const DEFAULT = '[1, null, 2, null, 3, null, 4, null, 5]';
const BALANCED = '[3, 1, 4, null, 2, null, 5]';
const engine = (text: string) => definition(ID).generateSteps([], { texts: [text] });
const field = (page: Page) => page.locator('#text-input-root');

async function enter(page: Page, text: string) {
  await field(page).fill(text);
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(text).length));
}

interface BalanceUi {
  step: number;
  line: number | null;
  stage: string | null;
  nodes: Record<string, { state: string; pointers: string; place: string }>;
  edges: string[];
  calls: string[];
  sorted: string;
  cells: string[];
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<BalanceUi[]> =>
  page.evaluate(async count => {
    const read = (): BalanceUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const sorted = document.querySelector<HTMLElement>('[data-testid="tree-sorted"]')?.dataset;
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        stage: document.querySelector<HTMLElement>('[data-testid="tree-stage"]')?.dataset.stage ?? null,
        nodes: Object.fromEntries(
          [...document.querySelectorAll<SVGGElement>('[data-node-id]')].map(g => [g.dataset.nodeId!, { state: g.dataset.state!, pointers: g.dataset.pointers!, place: `${g.dataset.x},${g.dataset.depth}` }])
        ),
        edges: [...document.querySelectorAll<SVGElement>('[data-edge]')].map(e => `${e.dataset.edge}:${e.dataset.side}`).sort(),
        calls: [...document.querySelectorAll<HTMLElement>('[data-frame]')].map(f =>
          f.dataset.frameLeft !== undefined
            ? `${f.dataset.frameVia}:${f.dataset.frameLeft}..${f.dataset.frameRight}:${f.dataset.frameMid}:${f.dataset.frameNode}:${f.dataset.frameReturns}:${f.dataset.frameStatus}`
            : `${f.dataset.frameVia}:${f.dataset.frameNode}:${f.dataset.frameStatus}`
        ),
        sorted: sorted ? `${sorted.values}|${sorted.left}|${sorted.right}|${sorted.mid}` : '',
        cells: [...document.querySelectorAll<HTMLElement>('[data-cell]')].map(c => `${c.dataset.value}:${c.dataset.cell}:${c.dataset.marks}`),
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
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): BalanceUi {
  const t = s.tree!;
  const b = t.balance!;
  const building = b.stage !== 'inorder';
  const value = (id: string) => String(t.nodes.find(n => n.id === id)!.value);
  const state = (id: string) => {
    if (id === t.current) return 'current';
    if (!building) return t.visited.includes(id) ? 'visited' : b.inorderCalls.some(c => c.node === id) ? 'waiting' : 'unvisited';
    return b.completed.includes(id) ? 'completed' : 'created';
  };
  const layout = layoutTree(t);
  const place = (id: string) => (building ? `${id.slice(1)},${b.depths[id]}` : `${layout[id].x},${layout[id].depth}`);
  const top = building ? b.buildCalls.at(-1) : undefined;
  const live = top && top.left <= top.right ? top : undefined;
  const cell = (k: number) =>
    !building
      ? k === b.values.length - 1 && t.current !== undefined && t.visited.at(-1) === t.current
        ? 'appended'
        : 'collected'
      : k === top?.mid
        ? 'mid'
        : b.created.includes(`b${k}`)
          ? 'created'
          : top && k >= top.left && k <= top.right
            ? 'in-range'
            : 'outside';
  const marks = (k: number) => (live ? [k === live.left ? 'L' : '', k === live.mid ? 'M' : '', k === live.right ? 'R' : ''].filter(Boolean).join(' ') : '');
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    stage: b.stage,
    nodes: Object.fromEntries(t.nodes.map(n => [n.id, { state: state(n.id), pointers: (t.pointers ?? []).filter(x => x.node === n.id).map(x => x.name).join(','), place: place(n.id) }])),
    edges: t.nodes.flatMap(n => (['left', 'right'] as const).flatMap(side => (n[side] ? [`${n.id}-${n[side]}:${side}`] : []))).sort(),
    calls: building
      ? b.buildCalls.map(
          (c, i) =>
            `${c.via}:${c.left}..${c.right}:${c.mid ?? ''}:${c.node ?? ''}:${c.returns === undefined ? '' : c.returns === null ? 'null' : value(c.returns)}:${
              i === b.buildCalls.length - 1 ? (c.returns === undefined ? 'active' : 'returning') : 'waiting'
            }`
        )
      : b.inorderCalls.map((c, i) => `${c.via}:${c.node ?? 'null'}:${i === b.inorderCalls.length - 1 ? 'active' : 'waiting'}`),
    sorted: `${b.values.join(',')}|${live ? live.left : ''}|${live ? live.right : ''}|${top?.mid ?? ''}`,
    cells: b.values.map((v, k) => `${v}:${cell(k)}:${marks(k)}`),
    result: t.result?.text ?? null,
  };
}

/** the drawn tree's level order and whether every node's subtree heights differ by at most one, from the page */
async function drawnTree(page: Page) {
  return page.evaluate(() => {
    const nodes = new Map([...document.querySelectorAll<SVGGElement>('[data-node-id]')].map(g => [g.dataset.nodeId!, { value: Number(g.dataset.value), left: null as string | null, right: null as string | null }]));
    for (const e of document.querySelectorAll<SVGElement>('[data-edge]')) {
      const [parent, child] = e.dataset.edge!.split('-');
      nodes.get(parent)![e.dataset.side as 'left' | 'right'] = child;
    }
    const children = new Set([...nodes.values()].flatMap(n => [n.left, n.right]));
    const root = [...nodes.keys()].find(id => !children.has(id)) ?? null;
    let balanced = true;
    const height = (id: string | null): number => {
      if (id === null) return 0;
      const l = height(nodes.get(id)!.left);
      const r = height(nodes.get(id)!.right);
      if (Math.abs(l - r) > 1) balanced = false;
      return 1 + Math.max(l, r);
    };
    const levels = height(root);
    const inorder: number[] = [];
    const walk = (id: string | null) => {
      if (id === null) return;
      walk(nodes.get(id)!.left);
      inorder.push(nodes.get(id)!.value);
      walk(nodes.get(id)!.right);
    };
    walk(root);
    return { balanced, levels, inorder };
  });
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Convert BST to Balanced BST', () => {
  test('listed in TREES right after Build a Binary Search Tree (Recursive); opens with the right-skewed example', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Build a Binary Search Tree (Recursive)')).toBeGreaterThan(-1);
    expect(text.indexOf('Build a Binary Search Tree (Recursive)')).toBeLessThan(text.indexOf('Convert BST to Balanced BST'));
    expect(text.indexOf('Convert BST to Balanced BST')).toBeLessThan(text.indexOf('Print in Range (BST)'));
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Convert BST to Balanced BST');
    await expect(page.getByTestId('tree-visualizer')).toBeVisible();
    await expect(field(page)).toHaveValue(DEFAULT);
    await expect(page.getByTestId('tree-stage')).toHaveAttribute('data-stage', 'inorder');
  });

  test('the default BST, every step of all three stages as traced; the inorder array and the balanced tree', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, DEFAULT);
    const steps = engine(DEFAULT);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    // all three stages were shown, in order
    expect([...new Set(shown.map(u => u.stage))]).toEqual(['inorder', 'build', 'done']);
    await expect(page.getByTestId('tree-sorted')).toHaveAttribute('data-values', '1,2,3,4,5');
    await expect(page.getByTestId('tree-result')).toHaveText(`Balanced BST: ${BALANCED}, height 3 (input height 5)`);
    await expect(page.locator('[data-node-id][data-state="completed"]')).toHaveCount(5);
  });

  test('the inorder array is built in sorted order during stage 1', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, DEFAULT);
    const steps = engine(DEFAULT);
    const shown = await collect(page, steps.findIndex(s => s.codeRef === 'call-build') + 1);
    const arrays = [...new Set(shown.map(u => u.sorted.split('|')[0]))];
    expect(arrays).toEqual(['', '1', '1,2', '1,2,3', '1,2,3,4', '1,2,3,4,5']);
    expect(shown.at(-1)!.stage).toBe('build');
  });

  test('the final tree is a height-balanced BST with every input value, drawn from its own links', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, DEFAULT);
    await app.goToLastStep();
    const tree = await drawnTree(page);
    expect(tree).toEqual({ balanced: true, levels: 3, inorder: [1, 2, 3, 4, 5] });
    await expect(page.locator('[data-node-id="b2"]')).toHaveAttribute('data-depth', '0');
    await expect(page.getByTestId('tree-original')).toHaveAttribute('data-original', DEFAULT);
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the three stages, and the highlighted line follows the trace`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      await enter(page, DEFAULT);
      const def = definition(ID);
      const arrow = lang === 'c' || lang === 'cpp' ? '->' : '.';
      const build = lang === 'python' ? 'build_balanced' : 'buildBalanced';
      for (const [ref, code] of [
        ['in-recurse-left', `inorder(node${arrow}left, values`],
        ['b-mid', 'mid = left + (right - left) /'],
        ['b-recurse-left', `node${arrow}left = ${build}(values, left, mid - 1`],
        ['b-recurse-right', `node${arrow}right = ${build}(values, mid + 1, right`],
        ['done', 'return balanced'],
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

  // one test per case, each run to its last step
  for (const [name, text, values, balanced, levels] of [
    ['a left-skewed BST', '[5, 4, null, 3, null, 2, null, 1]', '1,2,3,4,5', BALANCED, 3],
    ['an already balanced BST', '[4, 2, 6, 1, 3, 5, 7]', '1,2,3,4,5,6,7', '[4, 2, 6, 1, 3, 5, 7]', 3],
    ['an even number of nodes', '[10, 5, null, 2, 7, null, null, 6, 8]', '2,5,6,7,8,10', '[6, 2, 8, null, 5, 7, 10]', 3],
    ['negative values', '[-5, -10, null, -20, null, -30]', '-30,-20,-10,-5', '[-20, -30, -10, null, null, null, -5]', 3],
    ['the extreme values', '[-999, null, 0, null, 999]', '-999,0,999', '[0, -999, 999]', 2],
    ['two nodes', '[2, 1]', '1,2', '[1, null, 2]', 2],
    ['one node', '[7]', '7', '[7]', 1],
  ] as const) {
    test(`edge case through the UI: ${name}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, text);
      await app.goToLastStep();
      await expect(page.getByTestId('tree-sorted')).toHaveAttribute('data-values', values);
      await expect(page.getByTestId('tree-result')).toContainText(`Balanced BST: ${balanced}, height ${levels}`);
      const tree = await drawnTree(page);
      expect(tree.balanced).toBe(true);
      expect(tree.levels).toBe(levels);
      expect(tree.inorder.join(',')).toBe(values);
    });
  }

  test('edge case through the UI: the empty tree', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, '[]');
    expect(await app.totalSteps()).toBe(7);
    await app.goToLastStep();
    await expect(page.getByTestId('tree-result')).toHaveText('Balanced BST: [] (the empty tree)');
    await expect(page.getByTestId('tree-empty')).toBeVisible();
  });

  test('malformed trees, repeated values and trees that are not a BST are refused with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [text, message] of [
      ['[1, 2, 3', 'missing its closing "]"'],
      ['[null, 1]', 'The root (value 1) cannot be null.'],
      ['[1000]', 'out of range'],
      ['[1, 2]', 'Not a binary search tree'],
      ['[2, null, 2]', 'values cannot repeat'],
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

  test('Play runs through all three stages; Previous steps back; Next steps forward; Reset returns to stage 1', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, DEFAULT);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('tree-result')).toBeVisible({ timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine(DEFAULT).length);
    await expect(page.getByTestId('tree-stage')).toHaveAttribute('data-stage', 'done');
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('tree-result')).toHaveCount(0);
    await expect(page.getByTestId('tree-stage')).toHaveAttribute('data-stage', 'build');
    await app.next();
    await app.expectStep(total);
    await expect(page.getByTestId('tree-stage')).toHaveAttribute('data-stage', 'done');
    // back across the stage boundary: the step before stage 2 starts shows the input tree again
    const boundary = engine(DEFAULT).findIndex(s => s.codeRef === 'call-build');
    await app.reset();
    await app.expectStep(1);
    await expect(page.getByTestId('tree-stage')).toHaveAttribute('data-stage', 'inorder');
    await app.advance(boundary);
    await app.expectStep(boundary + 1);
    await expect(page.getByTestId('tree-stage')).toHaveAttribute('data-stage', 'build');
    await app.previous();
    await expect(page.getByTestId('tree-stage')).toHaveAttribute('data-stage', 'inorder');
    await expect(page.locator('[data-node-id="n0"]')).toHaveAttribute('data-state', 'visited');
    await expect(page.locator('[data-node-id]')).toHaveCount(5);
  });

  test('phone width: no horizontal page scroll', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm(ID);
    await enter(page, '[8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]');
    const steps = engine('[8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]');
    await app.advance(steps.findIndex(s => s.codeRef === 'b-create') + 3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA in stage 1, at a midpoint and at the balanced tree: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, DEFAULT);
      const steps = engine(DEFAULT);
      const append = steps.findIndex(s => s.codeRef === 'in-append');
      const mid = steps.findIndex(s => s.codeRef === 'b-mid');
      // advance is relative: to the first append, then on to the first midpoint, then the last step
      for (const advance of [append, mid - append, 0]) {
        if (advance) await app.advance(advance);
        else await app.goToLastStep();
        await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
        expect(await violations(page), theme).toEqual([]);
      }
    });
  }
});
