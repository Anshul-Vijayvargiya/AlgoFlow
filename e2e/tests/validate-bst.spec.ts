import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Validate Binary Search Tree through the real UI: the tree is typed into the level-order field; what each step shows
 * (node states, the node pointer, the call stack with each call's bounds, the running call's range, the nodes in range
 * so far, the violation, the verdict and the highlighted line) is checked against the engine's own trace for the same
 * tree. The verdicts themselves are checked against a brute force on random trees in the unit tests
 * (validateBst.test.ts).
 */
const ID = 'tree-validate-bst' as const;
const VALID = '[10, 5, 15, 2, 7, 12, 20]';
const INVALID = '[10, 5, 15, null, null, 6, 20]';
const engine = (text: string) => definition(ID).generateSteps([], { texts: [text] });
const field = (page: Page) => page.locator('#text-input-root');

async function enter(page: Page, text: string) {
  await field(page).fill(text);
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(text).length));
}

interface ValidateUi {
  step: number;
  line: number | null;
  nodes: Record<string, { state: string; pointers: string }>;
  calls: string[];
  bounds: string;
  validated: string[];
  violation: string | null;
  verdict: string | null;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<ValidateUi[]> =>
  page.evaluate(async count => {
    const read = (): ValidateUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const bounds = document.querySelector<HTMLElement>('[data-testid="tree-bounds"]');
      const result = document.querySelector<HTMLElement>('[data-testid="tree-result"]');
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        nodes: Object.fromEntries([...document.querySelectorAll<SVGGElement>('[data-node-id]')].map(g => [g.dataset.nodeId!, { state: g.dataset.state!, pointers: g.dataset.pointers! }])),
        calls: [...document.querySelectorAll<HTMLElement>('[data-frame]')].map(
          f => `${f.dataset.frameVia}:${f.dataset.frameNode}:(${f.dataset.frameMin},${f.dataset.frameMax}):${f.dataset.frameStatus}:${f.dataset.frameReturns}`
        ),
        bounds: bounds ? `${bounds.dataset.min}|${bounds.dataset.max}` : '',
        validated: [...document.querySelectorAll<HTMLElement>('[data-validated]')].map(v => v.dataset.validated!),
        violation: document.querySelector('[data-testid="tree-violation"]')?.textContent?.trim() ?? null,
        verdict: result?.dataset.verdict ?? null,
        result: result?.textContent?.trim() ?? null,
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

const bound = (b: number | null, side: 'min' | 'max') => (b === null ? (side === 'min' ? '−∞' : '+∞') : String(b));

/** what the engine says a step shows, in the collector's shape */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): ValidateUi {
  const t = s.tree!;
  const v = t.validate!;
  const value = (id: string) => String(t.nodes.find(n => n.id === id)!.value);
  const state = (id: string) =>
    id === v.invalid
      ? 'invalid'
      : id === t.current
        ? 'current'
        : id === v.conflict
          ? 'conflict'
          : v.completed.includes(id)
            ? 'completed'
            : v.passed.includes(id)
              ? 'validated'
              : 'unvisited';
  const top = v.calls.at(-1);
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    nodes: Object.fromEntries(t.nodes.map(n => [n.id, { state: state(n.id), pointers: (t.pointers ?? []).filter(x => x.node === n.id).map(x => x.name).join(',') }])),
    calls: v.calls.map(
      (c, i) =>
        `${c.via}:${c.node ?? 'null'}:(${bound(c.min, 'min')},${bound(c.max, 'max')}):${i === v.calls.length - 1 ? (c.returns === undefined ? 'active' : 'returning') : 'waiting'}:${c.returns ?? ''}`
    ),
    bounds: top ? `${bound(top.min, 'min')}|${bound(top.max, 'max')}` : '|',
    validated: v.passed.map(value),
    violation: v.violation ? `${v.violation}.` : null,
    verdict: v.verdict ?? null,
    result: t.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Validate Binary Search Tree', () => {
  test('listed in TREES right after Print in Range (BST); opens the tree view with the valid example', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Print in Range (BST)')).toBeGreaterThan(-1);
    expect(text.indexOf('Print in Range (BST)')).toBeLessThan(text.indexOf('Validate Binary Search Tree'));
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Validate Binary Search Tree');
    await expect(page.getByTestId('tree-visualizer')).toBeVisible();
    await expect(field(page)).toHaveValue(VALID);
    await expect(page.getByTestId('tree-bounds')).toHaveAttribute('data-min', '−∞');
    await expect(page.getByTestId('tree-bounds')).toHaveAttribute('data-max', '+∞');
  });

  test('a valid BST, every step: node states, pointer, calls and bounds, nodes in range and code line, as traced; VALID BST', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, VALID);
    const steps = engine(VALID);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('tree-result')).toHaveText('VALID BST: all 7 nodes are inside the ranges their ancestors allow');
    await expect(page.getByTestId('tree-result')).toHaveAttribute('data-verdict', 'valid');
    await expect(page.locator('[data-node-id][data-state="completed"]')).toHaveCount(7);
  });

  test('an invalid BST (an ancestor bound), every step as traced; INVALID BST with the violation explained', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, INVALID);
    const steps = engine(INVALID);
    const shown = await collect(page, steps.length);
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    const result = page.getByTestId('tree-result');
    await expect(result).toHaveText('INVALID BST: 6 is in the right subtree of 10, so it must be greater than 10');
    await expect(result).toHaveAttribute('data-verdict', 'invalid');
    await expect(page.getByTestId('tree-violation')).toHaveText('6 is in the right subtree of 10, so it must be greater than 10.');
    await expect(page.locator('[data-node-id][data-value="6"]')).toHaveAttribute('data-state', 'invalid');
    await expect(page.locator('[data-node-id][data-value="10"]')).toHaveAttribute('data-state', 'conflict');
    // 20 is never checked: validation stops at 6
    await expect(page.locator('[data-node-id][data-value="20"]')).toHaveAttribute('data-state', 'unvisited');
  });

  test('the invalid check explains that the parent alone would allow the node', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, INVALID);
    const failing = engine(INVALID).findIndex(s => s.codeRef === 'check-range' && s.result === 'true');
    await app.advance(failing);
    await app.expectStep(failing + 1);
    await expect(page.getByTestId('tree-bounds')).toHaveAttribute('data-min', '10');
    await expect(page.getByTestId('tree-bounds')).toHaveAttribute('data-max', '15');
    await expect(page.getByText(/Its parent 15 alone would allow it/).first()).toBeVisible();
  });

  for (const lang of ['c', 'java', 'python'] as const) {
    test(`the highlighted line follows the trace (${lang})`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      // 9 breaks the bound of 8 inside the left subtree, so the root returns at its left check: every line is reached
      const text = '[8, 4, 12, 2, 9]';
      await enter(page, text);
      const steps = engine(text);
      const shown = await collect(page, steps.length);
      expect(new Set(steps.map(s => s.codeRef)).size).toBe(Object.keys(definition(ID).lineMap[lang]!).length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(definition(ID), lang, s.codeRef)));
    });
  }

  // one test per case, each stepping through its whole trace
  for (const [name, text, verdict, result] of [
    ['a repeated value (a child equal to its parent)', '[10, 5, 15, 5]', 'invalid', 'INVALID BST: 5 is in the left subtree of 5, so it must be smaller than 5 (values cannot repeat)'],
    ['a repeated value deeper down', '[10, 5, 15, null, 10]', 'invalid', 'INVALID BST: 10 is in the left subtree of 10, so it must be smaller than 10 (values cannot repeat)'],
    ['the empty tree', '[]', 'valid', 'VALID BST: the empty tree is a valid binary search tree'],
    ['one node', '[7]', 'valid', 'VALID BST: a single node is always a valid binary search tree'],
    ['negative values', '[-5, -10, 0, -12, -7, null, 3]', 'valid', 'VALID BST: all 6 nodes are inside the ranges their ancestors allow'],
    ['a left-skewed BST', '[5, 4, null, 3, null, 2, null, 1]', 'valid', 'VALID BST: all 5 nodes are inside the ranges their ancestors allow'],
    ['a right-skewed BST', '[1, null, 2, null, 3, null, 4, null, 5]', 'valid', 'VALID BST: all 5 nodes are inside the ranges their ancestors allow'],
    ['the extreme values', '[-999, null, 999]', 'valid', 'VALID BST: all 2 nodes are inside the ranges their ancestors allow'],
  ] as const) {
    test(`edge case through the UI: ${name}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, text);
      await app.goToLastStep();
      await expect(page.getByTestId('tree-result')).toHaveText(result);
      await expect(page.getByTestId('tree-result')).toHaveAttribute('data-verdict', verdict);
    });
  }

  test('malformed trees are refused next to the field with Visualize disabled; a tree that is not a BST is accepted', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [text, message] of [
      ['[1, 2, 3', 'missing its closing "]"'],
      ['[null, 1]', 'The root (value 1) cannot be null.'],
      ['[1000]', 'out of range'],
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

  test('Play runs to the verdict; Previous steps back; Next steps forward; Reset returns to the start', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, INVALID);
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('tree-result')).toHaveAttribute('data-verdict', 'invalid', { timeout: 30_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine(INVALID).length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('tree-result')).toHaveCount(0);
    await app.next();
    await app.expectStep(total);
    await expect(page.getByTestId('tree-result')).toHaveAttribute('data-verdict', 'invalid');
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-validated]')).toHaveCount(0);
    await expect(page.getByTestId('tree-violation')).toHaveCount(0);
  });

  test('phone width: no horizontal page scroll', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm(ID);
    await enter(page, '[8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]');
    await app.advance(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA mid-trace and at an invalid verdict: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, INVALID);
      const failing = engine(INVALID).findIndex(s => s.codeRef === 'check-range' && s.result === 'true');
      for (const advance of [failing, 0]) {
        if (advance) await app.advance(advance);
        else await app.goToLastStep();
        await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
        expect(await violations(page), theme).toEqual([]);
      }
    });
  }
});
