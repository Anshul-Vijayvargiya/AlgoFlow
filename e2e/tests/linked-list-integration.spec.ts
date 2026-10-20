import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { engineListSteps, expectedLine } from '../support/engineTrace';
import { chainFrom } from '../../src/engine/linkedList/listSnapshot';

/**
 * Phase 5: keyboard and screen-reader behaviour of the linked-list view, edge-case integration (invalid input, stale
 * traces, switching during playback, Randomize / Restore) and mobile devices. The per-operation UI-vs-engine walks
 * are in linked-list.spec.ts.
 */

/** name of the focused element and whether a visible focus indicator is drawn (as in accessibility-focus.spec.ts) */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    const labelledBy = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() : undefined;
    return {
      name: el.getAttribute('aria-label') ?? labelledBy ?? el.textContent?.trim() ?? '',
      indicator: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow !== 'none' && cs.boxShadow !== ''),
    };
  });

/** the HEAD-chain node ids currently drawn */
const drawnChain = (page: Page) => page.locator('[data-testid="list-chain"] [data-list-node]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.listNode));

test.describe('linked lists — keyboard and screen readers', () => {
  test('Tab order through the list form and playback, each control with a visible focus indicator', async ({ app, page }) => {
    await app.selectAlgorithm('ll-insert-at');
    await app.next();
    await app.listInput.focus();
    const order: string[] = [];
    const missing: string[] = [];
    for (let i = 0; i < 11; i++) {
      const f = (await focused(page))!;
      order.push(f.name);
      if (!f.indicator) missing.push(f.name);
      await page.keyboard.press('Tab');
    }
    expect(order).toEqual(['List values', 'New value', 'Position', 'Visualize', 'Reset', 'Previous step', 'Play', 'Next step', 'Randomize', 'List size', 'Playback speed']);
    expect(missing).toEqual([]);
  });

  test('the whole input → playback workflow works from the keyboard alone', async ({ app, page }) => {
    await app.selectAlgorithm('ll-delete-at');
    await app.listInput.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('5, 6, 7');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    await expect(app.indexInput).toBeFocused();
    await expect(page.getByTestId('index-pill')).toHaveText('position = 1');
    await app.nextButton.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
    await app.expectStep(4);
    await app.previousButton.focus();
    await page.keyboard.press('Space');
    await app.expectStep(3);
  });

  test('fields are labelled and described; invalid state is exposed', async ({ app }) => {
    await app.selectAlgorithm('ll-insert-at');
    await expect(app.listInput).toHaveAccessibleDescription(/Up to 9 whole numbers.*read from HEAD to TAIL/);
    await expect(app.indexInput).toHaveAccessibleName('Position');
    await expect(app.valueInput).toHaveAccessibleName('New value');
    await app.indexInput.fill('8');
    await expect(app.indexInput).toHaveAttribute('aria-invalid', 'true');
    await expect(app.indexInput).toHaveAccessibleDescription(/Index 8 is out of range/);
    await expect(app.page.getByTestId('input-error-live')).toHaveAttribute('aria-live', 'polite');
  });

  test('nodes, HEAD, TAIL, NULL pointers and nodes outside the list have spoken names; each step is announced', async ({ app, page }) => {
    const announcer = page.getByTestId('step-announcer');
    await app.selectAlgorithm('ll-delete-tail');
    await app.enterList([4, 7, 9]);
    const steps = engineListSteps('ll-delete-tail', [4, 7, 9]);
    const unlink = steps.findIndex(s => s.codeRef === 'unlink');
    await app.advance(unlink);
    await expect(announcer).toHaveText(`Step ${unlink + 1} of ${steps.length}. ${steps[unlink].message}`);
    await expect(page.getByRole('img', { name: 'Outside the list, value 9, TAIL, pointer temp, next → NULL' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Position 1, value 7, examined, pointer prev, next → NULL, link just changed' })).toBeVisible();
    await expect(page.getByTestId('list-summary')).toHaveText(
      'HEAD → 4 → 7 → NULL. TAIL → node 9 (outside the list). Outside the list: 9. prev → node 7 at position 1. temp → node 9 (outside the list).'
    );

    // one node → empty: HEAD is NULL while TAIL still names the node; a NULL pointer is spoken as NULL
    await app.selectAlgorithm('ll-delete-head');
    await app.enterList([5]);
    await app.advance(3);
    await expect(announcer).toContainText('head = head.next → NULL');
    await expect(page.getByTestId('list-summary')).toContainText('HEAD → NULL, the list is empty. TAIL → node 5 (outside the list).');
    await app.selectAlgorithm('reverse-linked-list');
    await app.next();
    await expect(page.getByTestId('list-summary')).toContainText('prev → NULL');
  });

  test('changes are shown in text, not colour alone: COMPARE / MATCH badges, "moved", "new link", "released"', async ({ app, page }) => {
    await app.selectAlgorithm('ll-search');
    await app.enterList([4, 7], { value: 7 });
    const steps = engineListSteps('ll-search', [4, 7], { value: 7 });
    await app.advance(steps.findIndex(s => s.codeRef === 'check-match'));
    await expect(page.locator('[data-role-badge="compare"]')).toHaveText('COMPARE');
    await app.advance(steps.findIndex(s => s.type === 'found') - (await app.stepNumber()) + 1);
    await expect(page.locator('[data-role-badge="found"]')).toHaveText('MATCH');

    await app.selectAlgorithm('ll-delete-head');
    await app.enterList([4, 7]);
    await app.advance(3);
    await expect(page.locator('[data-end-chip="HEAD"]')).toHaveText('HEAD moved');
    await app.advance(2);
    await expect(page.getByTestId('released-node')).toHaveText('node 4 released');

    await app.selectAlgorithm('ll-insert-tail');
    await app.enterList([4], { value: 9 });
    await app.advance(3);
    await expect(page.locator('[data-arrow-from][data-changed="true"]')).toHaveText('new link');
  });

  test('reduced motion: nodes are not animated between steps', async ({ app, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.selectAlgorithm('reverse-linked-list');
    await app.enterList([1, 2, 3]);
    const unit = page.locator('[data-list-node="n2"]').locator('xpath=../..');
    for (let i = 0; i < 6; i++) {
      await app.next();
      // no layout animation in flight: the node's container is never mid-transform
      expect(await unit.evaluate(e => getComputedStyle(e).transform)).toBe('none');
    }
    const durations = await page.locator('[data-list-node]').evaluateAll(els => els.map(e => getComputedStyle(e).transitionDuration));
    expect(new Set(durations)).toEqual(new Set(['0s']));
  });
});

test.describe('linked lists — integration edge cases', () => {
  test('an invalid input never runs or shows a stale trace', async ({ app, page }) => {
    await app.selectAlgorithm('ll-insert-at');
    await app.enterList([6, 7, 8], { value: 1, index: 3 });
    await app.advance(4);
    // Delete at Position keeps the entered position 3, which is invalid for 3 nodes
    await app.selectAlgorithm('ll-delete-at');
    await expect(app.inputIssue).toContainText('Index 3 is out of range. For a list of 3 nodes, delete at 0 to 2.');
    await expect(page.getByTestId('list-visualizer')).toHaveCount(0);
    await expect(page.getByTestId('step-message')).toHaveCount(0);
    await expect(page.locator('[data-line][aria-current="step"]')).toHaveCount(0);
    await app.expectTotal(0);
    await expect(app.playButton).toBeDisabled();
    await expect(app.nextButton).toBeDisabled();
    await expect(app.indexInput).toHaveAttribute('aria-invalid', 'true');
    // fixing the position runs the new trace from step 1
    await app.indexInput.fill('2');
    await app.visualizeButton.click();
    await app.expectStep(1);
    await app.expectTotal(engineListSteps('ll-delete-at', [6, 7, 8], { index: 2 }).length);
    await app.goToLastStep();
    expect(await app.listValues()).toEqual([6, 7]);
  });

  test('a rejected draft never replaces the running trace', async ({ app }) => {
    await app.selectAlgorithm('ll-search');
    await app.enterList([1, 2, 3], { value: 2 });
    await app.advance(3);
    const before = await app.state();
    await app.listInput.fill('1, 2, x');
    await expect(app.visualizeButton).toBeDisabled();
    await app.listInput.press('Enter');
    const after = await app.state();
    expect([after.step, after.total, after.list]).toEqual([before.step, before.total, before.list]);
  });

  test('switching operations — and to an array algorithm — while playing never shows a mismatched snapshot', async ({ app, page }) => {
    await app.selectAlgorithm('reverse-linked-list');
    await app.enterList([1, 2, 3, 4]);
    await app.setSpeed('medium');
    await app.play();
    await expect.poll(() => app.stepNumber()).toBeGreaterThan(2);
    await app.selectAlgorithm('ll-insert-head');
    // stopped, on step 1 of the NEW trace, drawing the new trace's first snapshot
    await expect(app.playButton).toBeVisible();
    await app.expectStep(1);
    const first = engineListSteps('ll-insert-head', [1, 2, 3, 4], { value: 2 })[0];
    expect(await drawnChain(page)).toEqual(chainFrom(first.list!, first.list!.head));
    await expect(page.getByTestId('step-message')).toHaveText(first.message);
    await expect(page.locator('[data-line][aria-current="step"]')).toHaveAttribute('data-line', String(expectedLine('ll-insert-head', 'cpp', first).n));

    await app.play();
    await expect.poll(() => app.stepNumber()).toBeGreaterThan(1);
    await app.selectAlgorithm('bubble-sort');
    await app.expectStep(1);
    await expect(page.getByTestId('list-visualizer')).toHaveCount(0);
    await app.expectBars([1, 2, 3, 4]);
  });

  test('every step shows ONE snapshot: list, explanation and code line agree after random Next / Previous / Reset', async ({ app, page }) => {
    await app.selectAlgorithm('ll-delete-at');
    await app.enterList([3, 3, 1, 3], { index: 2 });
    const steps = engineListSteps('ll-delete-at', [3, 3, 1, 3], { index: 2 });
    const moves = ['next', 'next', 'next', 'previous', 'next', 'next', 'reset', 'next', 'next', 'next', 'next', 'next', 'previous'] as const;
    let k = 0;
    for (const m of moves) {
      if (m === 'next') { await app.next(); k = Math.min(k + 1, steps.length - 1); }
      if (m === 'previous') { await app.previous(); k = Math.max(k - 1, 0); }
      if (m === 'reset') { await app.reset(); k = 0; }
      await app.expectStep(k + 1);
      const s = await app.state();
      const e = steps[k];
      expect(s.list!.chain.map(n => n.id)).toEqual(chainFrom(e.list!, e.list!.head));
      expect(s.list!.outside.map(n => n.id).sort()).toEqual(e.list!.nodes.filter(n => !chainFrom(e.list!, e.list!.head).includes(n.id)).map(n => n.id).sort());
      expect(s.message).toBe(e.message);
      expect(s.currentAction).toBe(e.message);
      expect(s.activeLine?.n).toBe(expectedLine('ll-delete-at', 'cpp', e).n);
    }
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(steps.length));
  });

  test('Randomize replaces a custom list visibly; Restore brings back the list AND the entered position', async ({ app }) => {
    await app.selectAlgorithm('ll-delete-at');
    await app.enterList([1, 2, 3, 4, 5, 6, 7], { index: 6 });
    await app.listSizeSelect.selectOption('5');
    await expect(app.inputNotice).toContainText('Your entered list (1, 2, 3, 4, 5, 6, 7) was replaced by a random one.');
    await expect(app.listNodes).toHaveCount(5);
    await expect(app.indexInput).toHaveValue('4'); // moved into range for five nodes
    await app.randomizeButton.click();
    await expect(app.inputNotice).toContainText('(1, 2, 3, 4, 5, 6, 7)'); // still recoverable after randomizing again
    await app.restoreButton.click();
    await expect(app.listInput).toHaveValue('1, 2, 3, 4, 5, 6, 7');
    await expect(app.indexInput).toHaveValue('6');
    await expect(app.listInput).toBeFocused();
    await app.goToLastStep();
    expect(await app.listValues()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('empty list, single node and duplicates through switching: each operation runs its own valid trace', async ({ app }) => {
    await app.selectAlgorithm('ll-traverse');
    await app.enterList([]);
    for (const [id, total] of [
      ['ll-delete-head', engineListSteps('ll-delete-head', []).length],
      ['reverse-linked-list', engineListSteps('reverse-linked-list', []).length],
      ['ll-insert-at', engineListSteps('ll-insert-at', [], { value: 5, index: 0 }).length],
    ] as const) {
      await app.selectAlgorithm(id);
      await app.expectTotal(total);
    }
    await app.selectAlgorithm('ll-delete-at');
    await expect(app.inputIssue).toContainText('The list is empty');
    await app.selectAlgorithm('ll-search');
    await app.enterList([2, 2, 2], { value: 2 });
    await app.goToLastStep();
    await expect(app.outcome).toHaveText('Value found at position 0');
    await app.selectAlgorithm('ll-delete-tail');
    await app.enterList([2]);
    await app.goToLastStep();
    expect(await app.listValues()).toEqual([]);
    await expect(app.outcome).toHaveText('Done — the list is empty');
  });
});

test.describe('linked lists on phones @mobile', () => {
  test('pick an operation from the drawer, enter 10 nodes: all are visible, labelled and nothing scrolls sideways', async ({ app, page }) => {
    await app.selectAlgorithm('ll-traverse');
    await app.enterList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await expect(app.listNodes).toHaveCount(10);
    const viewport = page.viewportSize()!;
    for (const n of await app.listNodes.all()) {
      await n.scrollIntoViewIfNeeded();
      const b = (await n.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await expect(page.getByRole('img', { name: /^Position 9, value 10, TAIL/ })).toBeAttached();
  });

  test('pointers, playback and the Live Code tab stay on the same step', async ({ app, page }) => {
    await app.selectAlgorithm('ll-search');
    await app.enterList([4, 7, 1, 7, 9, 2, 8, 3, 6, 5], { value: 6 });
    const steps = engineListSteps('ll-search', [4, 7, 1, 7, 9, 2, 8, 3, 6, 5], { value: 6 });
    await app.advance(7);
    const e = steps[7];
    const currId = e.list!.pointers.curr!;
    await expect(page.locator(`[data-list-node="${currId}"]`)).toHaveAttribute('data-pointers', /curr/);
    await page.getByRole('button', { name: 'Live Code' }).click();
    await expect(page.locator('[data-line][aria-current="step"]')).toHaveAttribute('data-line', String(expectedLine('ll-search', 'cpp', e).n));
    await page.getByRole('button', { name: 'Visualization' }).click();
    await app.setSpeed('fast');
    await app.play();
    await app.expectStep(steps.length);
    await expect(app.outcome).toHaveText('Value found at position 8');
    await expect(page.locator('[data-role-badge="found"]')).toHaveText('MATCH');
  });
});
