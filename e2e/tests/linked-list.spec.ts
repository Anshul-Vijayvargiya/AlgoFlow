import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures';
import { walkListAndCompare } from '../support/listWalk';
import { listOracle } from '../support/oracles';
import type { AlgorithmId, ListParams } from '../support/engineTrace';

interface Case {
  name: string;
  list: number[];
  params?: ListParams;
}

/** Every implemented linked-list operation, with its edge cases (empty / single node / head, middle, tail). */
const CASES: Record<string, Case[]> = {
  'll-build': [
    { name: 'several values', list: [4, 7, 1, 9] },
    { name: 'empty input', list: [] },
    { name: 'one value', list: [5] },
  ],
  'll-traverse': [
    { name: 'several nodes with duplicates', list: [3, 3, -1] },
    { name: 'empty list', list: [] },
  ],
  'll-search': [
    { name: 'found — first of duplicates', list: [4, 7, 1, 7], params: { value: 7 } },
    { name: 'not found', list: [4, 7, 1], params: { value: 5 } },
    { name: 'empty list', list: [], params: { value: 2 } },
  ],
  'll-insert-head': [
    { name: 'non-empty list', list: [4, 7, 9], params: { value: 2 } },
    { name: 'empty list (becomes HEAD and TAIL)', list: [], params: { value: 2 } },
  ],
  'll-insert-tail': [
    { name: 'non-empty list', list: [4, 7], params: { value: 12 } },
    { name: 'empty list', list: [], params: { value: 12 } },
  ],
  'll-insert-at': [
    { name: 'at the head', list: [4, 7, 9], params: { value: 5, index: 0 } },
    { name: 'in the middle', list: [4, 7, 9], params: { value: 5, index: 2 } },
    { name: 'at the tail', list: [4, 7, 9], params: { value: 5, index: 3 } },
    { name: 'into an empty list', list: [], params: { value: 5, index: 0 } },
  ],
  'll-delete-head': [
    { name: 'several nodes', list: [4, 7, 9] },
    { name: 'single node (list becomes empty)', list: [5] },
    { name: 'empty list (returns early)', list: [] },
  ],
  'll-delete-tail': [
    { name: 'several nodes', list: [4, 7, 9, 3] },
    { name: 'single node', list: [5] },
  ],
  'll-delete-at': [
    { name: 'the head', list: [4, 7, 1, 9], params: { index: 0 } },
    { name: 'a middle node', list: [4, 7, 1, 9], params: { index: 2 } },
    { name: 'the tail', list: [4, 7, 1, 9], params: { index: 3 } },
    { name: 'the only node', list: [5], params: { index: 0 } },
  ],
  'reverse-linked-list': [
    { name: 'several nodes', list: [4, 7, 1, 9] },
    { name: 'two nodes', list: [1, 2] },
    { name: 'single node', list: [5] },
    { name: 'empty list', list: [] },
  ],
};

for (const [id, cases] of Object.entries(CASES)) {
  test.describe(`${id} — real UI journey`, () => {
    for (const { name, list, params = {} } of cases) {
      test(name, async ({ app, page }) => {
        await app.selectAlgorithm(id as AlgorithmId);
        await expect(app.listInput, 'linked lists have their own input form').toBeVisible();
        await expect(app.arrayInput).toHaveCount(0);
        await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
        await app.enterList(list, params);

        // every step: the drawn list, pointers, HEAD/TAIL, changed link and code line match the engine snapshot
        const { final, observed } = await walkListAndCompare(app, id as AlgorithmId, list, params);

        // the result, checked against an independent computation on a plain array
        const oracle = listOracle(id, list, params);
        expect(final.list!.chain.map(n => n.value), 'final list read from HEAD').toEqual(oracle.list);
        expect(final.list!.outside, 'nothing is left outside the list at the end').toEqual([]);
        const values = oracle.list;
        expect(final.list!.headAt).toEqual([values.length ? final.list!.chain[0].id : 'null']);
        expect(final.list!.tailAt).toEqual([values.length ? final.list!.chain[values.length - 1].id : 'null']);
        if (oracle.found !== undefined) {
          expect(final.outcome?.kind).toBe(oracle.found >= 0 ? 'found' : 'not-found');
          if (oracle.found >= 0) {
            expect(final.list!.chain.filter(n => n.role === 'found').map(n => n.position)).toEqual([String(oracle.found)]);
            expect(final.outcome?.text).toBe(`Value found at position ${oracle.found}`);
          }
        } else {
          expect(final.outcome?.kind).toBe(values.length ? 'complete' : 'empty');
        }
        // deleting releases exactly one node at the release step
        if (/delete/.test(id) && list.length) {
          const released = observed.flatMap(s => s.list!.released);
          expect(released, 'the deleted node is shown as released once').toHaveLength(1);
        }
        // the user's input is kept as typed
        await expect(app.listInput).toHaveValue(list.join(', '));
      });
    }
  });
}

test.describe('linked-list input validation', () => {
  test('too many nodes, bad values and out-of-range positions are shown and block Visualize', async ({ app }) => {
    await app.selectAlgorithm('ll-insert-at');
    const before = await app.totalSteps();

    await app.listInput.fill('1, 2, 3, 4, 5, 6, 7, 8, 9, 10');
    await expect(app.inputError).toHaveText('Too many nodes (10). Insert at Position adds one, and the visualizer shows at most 10, so start with at most 9.');
    await expect(app.inputError).toHaveAttribute('data-field', 'list');
    await expect(app.listInput).toHaveAttribute('aria-invalid', 'true');
    await expect(app.visualizeButton).toBeDisabled();

    await app.listInput.fill('1, 2, 3');
    await app.valueInput.fill('x');
    await expect(app.inputError).toHaveAttribute('data-field', 'value');
    await expect(app.valueInput).toHaveAttribute('aria-invalid', 'true');
    await app.valueInput.fill('');
    await expect(app.inputError).toHaveText('Enter a value for "New value".');

    await app.valueInput.fill('8');
    await app.indexInput.fill('4');
    await expect(app.inputError).toHaveText('Index 4 is out of range. For a list of 3 nodes, insert at 0 to 3 (3 appends at the end).');
    await expect(app.indexInput).toHaveAttribute('aria-invalid', 'true');
    await app.indexInput.fill('-1');
    await expect(app.inputError).toHaveAttribute('data-field', 'index');
    await expect(app.visualizeButton).toBeDisabled();
    // nothing was applied
    expect(await app.totalSteps()).toBe(before);

    await app.indexInput.fill('3');
    await expect(app.inputError).toHaveCount(0);
    await expect(app.visualizeButton).toBeEnabled();
    await app.visualizeButton.click();
    await app.goToLastStep();
    expect(await app.listValues()).toEqual([1, 2, 3, 8]);
  });

  test('pressing Enter in a field applies the input and keeps focus in that field', async ({ app, page }) => {
    await app.selectAlgorithm('ll-delete-at');
    await app.indexInput.fill('1');
    await app.indexInput.press('Enter');
    await expect(page.getByTestId('index-pill')).toHaveText('position = 1');
    await expect(app.indexInput).toBeFocused();
    await app.listInput.fill('8, 9');
    await app.listInput.press('Enter');
    await expect(app.listNodes).toHaveCount(2);
    await expect(app.listInput).toBeFocused();
  });

  test('Delete at Position: an empty list has nothing to delete; Traverse accepts at most 10 nodes', async ({ app }) => {
    await app.selectAlgorithm('ll-delete-at');
    await app.listInput.fill('');
    await app.indexInput.fill('0');
    await expect(app.inputError).toHaveText('The list is empty, so there is no node to delete at index 0.');
    await expect(app.inputError).toHaveAttribute('data-field', 'list');
    await app.selectAlgorithm('ll-traverse');
    await app.listInput.fill('1,2,3,4,5,6,7,8,9,10,11');
    await expect(app.inputError).toHaveText('Too many nodes (11). The visualizer shows at most 10.');
    await app.listInput.fill('1,2,3,4,5,6,7,8,9,10');
    await expect(app.inputError).toHaveCount(0);
  });

  test('Size offers only valid list sizes and keeps the position valid', async ({ app }) => {
    await app.selectAlgorithm('ll-delete-at');
    await expect(app.sizeSelect).toHaveCount(0);
    const options = await app.listSizeSelect.locator('option').evaluateAll(os => os.map(o => Number((o as HTMLOptionElement).value)));
    expect(Math.max(...options)).toBe(10);
    expect(Math.min(...options)).toBeGreaterThanOrEqual(1);
    await app.listSizeSelect.selectOption('5');
    await expect(app.listNodes).toHaveCount(5);
    await expect(app.indexInput).toHaveValue('2');
    await app.selectAlgorithm('ll-insert-head');
    const insertMax = await app.listSizeSelect.locator('option').evaluateAll(os => Math.max(...os.map(o => Number((o as HTMLOptionElement).value))));
    expect(insertMax).toBe(9);
  });
});

test.describe('linked-list playback', () => {
  test('Next / Previous / Reset move every panel to the same step; earlier snapshots are unchanged', async ({ app, page }) => {
    await app.selectAlgorithm('reverse-linked-list');
    await app.enterList([1, 2, 3]);
    const first = await app.state();
    await app.advance(6);
    const sixth = await app.state();
    expect(sixth.step).toBe(7);
    await app.previous();
    await app.expectStep(6);
    await app.next();
    expect((await app.state()).list).toEqual(sixth.list);
    await app.reset();
    await app.expectStep(1);
    const again = await app.state();
    expect(again.list).toEqual(first.list);
    expect(again.activeLine).toEqual(first.activeLine);
    await expect(page.getByTestId('step-message')).toHaveText(first.message!);
  });

  test('Play runs to the end and stops; the final list and outcome are shown', async ({ app }) => {
    await app.selectAlgorithm('ll-insert-tail');
    await app.enterList([4, 7], { value: 12 });
    await app.setSpeed('fast');
    await app.play();
    await app.expectStep(await app.totalSteps());
    await expect(app.playButton).toBeVisible();
    expect(await app.listValues()).toEqual([4, 7, 12]);
    await expect(app.outcome).toHaveAttribute('data-outcome-kind', 'complete');
  });
});

test.describe('switching between array and linked-list algorithms', () => {
  test('bars and the array form for arrays; nodes and the list form for lists; a custom input is kept', async ({ app, page }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([3, 1, 2]);
    await app.selectAlgorithm('ll-traverse');
    await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
    await expect(app.arrayInput).toHaveCount(0);
    await expect(app.listInput).toHaveValue('3, 1, 2');
    expect(await app.listValues()).toEqual([3, 1, 2]);
    await expect(app.listSizeSelect).toBeVisible();
    await expect(page.getByText('Array State:')).toHaveCount(0);
    await expect(page.getByText('List:', { exact: true })).toBeVisible();

    await app.selectAlgorithm('ll-search');
    await expect(app.valueInput).toBeVisible();
    await expect(page.locator('label[for="value-input"]')).toHaveText('Target value');

    await app.selectAlgorithm('selection-sort');
    await expect(page.getByTestId('list-visualizer')).toHaveCount(0);
    await expect(app.listInput).toHaveCount(0);
    await app.expectBars([3, 1, 2]);
    await expect(app.sizeSelect).toBeVisible();
    await app.goToLastStep();
    await app.expectBars([1, 2, 3]);
  });
});

test.describe('linked-list view quality', () => {
  test('reduced motion: node colour transitions are off', async ({ app, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.selectAlgorithm('ll-traverse');
    const durations = await page.locator('[data-list-node]').evaluateAll(els => els.map(e => getComputedStyle(e).transitionDuration));
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) expect(d).toBe('0s');
  });

  test('phone width: ten nodes wrap without horizontal scrolling', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm('ll-traverse');
    await app.enterList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await expect(app.listNodes).toHaveCount(10);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await page.getByTestId('list-visualizer').boundingBox();
    for (const n of await app.listNodes.all()) {
      const b = (await n.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(box!.x);
      expect(b.x + b.width).toBeLessThanOrEqual(box!.x + box!.width);
    }
  });

  test('axe-core WCAG 2.1 A/AA: mid-operation with a node outside the list, and an invalid draft', async ({ app, page }) => {
    const scan = async () =>
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => ({
        rule: v.id,
        targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')),
      }));
    await app.selectAlgorithm('ll-delete-at');
    await app.advance(9);
    await expect(page.locator('[data-testid="list-segment"]')).toHaveCount(1);
    expect(await scan()).toEqual([]);
    await app.indexInput.fill('9');
    await expect(app.inputError).toBeVisible();
    expect(await scan()).toEqual([]);
  });

  test('the step is announced with the list operation message, and nodes have descriptive names', async ({ app, page }) => {
    await app.selectAlgorithm('ll-search');
    await app.next();
    await expect(page.getByTestId('step-announcer')).toContainText('Step 2 of');
    await expect(page.getByRole('img', { name: /^Position 0, value 4, HEAD/ })).toBeVisible();
    await expect(page.getByTestId('list-summary')).toContainText('HEAD → 4 → 7 → 1 → 7 → 9 → NULL');
  });
});
