import { test, expect } from '../fixtures';
import { engineSteps } from '../support/engineTrace';
import { isNonDecreasing } from '../support/oracles';

test.describe('changing the array and target', () => {
  test('the trace always uses the LATEST values: edits are only applied by Visualize', async ({ app }) => {
    await app.selectAlgorithm('linear-search');
    await app.enterAndVisualize([4, 2, 9, 7], 9);
    await app.expectTotal(engineSteps('linear-search', [4, 2, 9, 7], 9).length);

    // overwrite both fields without applying: the running trace is untouched
    await app.type([1, 5, 3], 3);
    expect(await app.barValues()).toEqual([4, 2, 9, 7]);
    await expect(app.page.getByTestId('target-pill')).toHaveText('target = 9');

    // …and once applied, the trace is for the latest array AND target
    await app.visualizeButton.click();
    await app.expectBars([1, 5, 3]);
    await expect(app.page.getByTestId('target-pill')).toHaveText('target = 3');
    await app.expectTotal(engineSteps('linear-search', [1, 5, 3], 3).length);
    await app.expectStep(1);
  });

  test('changing only the target regenerates the trace for the same array', async ({ app }) => {
    await app.selectAlgorithm('linear-search');
    await app.enterAndVisualize([4, 2, 9, 7], 4);
    const short = await app.totalSteps();
    await app.targetInput.fill('7');
    await app.visualizeButton.click();
    await expect(app.page.getByTestId('target-pill')).toHaveText('target = 7');
    await app.expectTotal(engineSteps('linear-search', [4, 2, 9, 7], 7).length);
    expect(await app.totalSteps()).toBeGreaterThan(short);
    expect(await app.barValues()).toEqual([4, 2, 9, 7]);
  });

  test('applying new input mid-trace restarts at step 1 with nothing stale on screen', async ({ app }) => {
    await app.selectAlgorithm('quick-sort');
    await app.enterAndVisualize([4, 3, 2, 1]);
    await app.advance(12);
    // a pointer is on screen on most steps; advance to one that has it (bounded) so the check below is meaningful
    for (let i = 0; i < 10 && (await app.state()).chips.length === 0; i++) await app.next();
    expect((await app.state()).chips.length, 'precondition: pointers are on screen mid-run').toBeGreaterThan(0);

    await app.enterAndVisualize([2, 1]);
    await app.expectStep(1);
    const s = await app.state();
    expect(s.bars.map(b => b.value)).toEqual([2, 1]);
    expect(s.outcome).toBeNull();
    expect(s.bars.every(b => b.role === 'default' || b.role === 'focus')).toBe(true);
    await app.expectTotal(engineSteps('quick-sort', [2, 1]).length);
  });

  test('an invalid draft does not replace the current trace: stepping continues on the old trace', async ({ app }) => {
    const array = [4, 2, 9, 7];
    await app.selectAlgorithm('linear-search');
    await app.enterAndVisualize(array, 9);
    await app.type('oops', 9);
    await expect(app.inputError).toBeVisible();

    await app.next();
    await app.expectStep(2);
    const expected = engineSteps('linear-search', array, 9)[1];
    await expect(app.page.getByTestId('current-action')).toHaveText(expected.message);
    expect(await app.barValues()).toEqual(array);
  });
});

test.describe('switching between algorithms with different input requirements', () => {
  test('custom array: compatible → incompatible (explicit state, no stale trace) → sorted copy → compatible → unimplemented → back', async ({ app }) => {
    const ORIGINAL = [5, 1, 4, 2];
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize(ORIGINAL);
    await app.advance(6);

    await test.step('Bubble → Quick Sort: compatible, regenerates from step 1 for the same array', async () => {
      await app.selectAlgorithm('quick-sort');
      await app.expectStep(1);
      expect(await app.barValues()).toEqual(ORIGINAL);
      await app.expectTotal(engineSteps('quick-sort', ORIGINAL).length);
      const s = await app.state();
      expect(s.activeLine?.text).toContain('quickSort');
      await expect(app.arrayInput).toHaveValue('5, 1, 4, 2');
    });

    await test.step('→ Binary Search: incompatible (unsorted) → explicit state, no trace, nothing of Quick Sort left', async () => {
      await app.selectAlgorithm('binary-search');
      await expect(app.inputIssue).toBeVisible();
      await expect(app.inputIssue).toContainText('needs an array sorted in ascending order');
      await expect(app.bars).toHaveCount(0);
      await expect(app.playButton).toBeDisabled();
      const s = await app.state();
      expect(s.total).toBe(0);
      expect(s.activeLine, 'no highlighted code line from a previous trace').toBeNull();
      expect(s.message, 'no explanation from a previous trace').toBeNull();
      expect(s.chips).toEqual([]);
      expect(s.pivotPill).toBeNull();
      await expect(app.arrayInput).toHaveValue('5, 1, 4, 2'); // the user's text is intact
      await expect(app.sortCopyButton).toBeVisible();
      await expect(app.randomizeButton).toBeEnabled(); // a way out remains
    });

    await test.step('Sort a copy → Binary Search regenerates for the sorted copy', async () => {
      await app.sortCopyButton.click();
      await app.expectBars([1, 2, 4, 5]);
      await expect(app.inputIssue).toHaveCount(0);
      await app.expectStep(1);
      const target = Number(await app.targetInput.inputValue());
      await app.expectTotal(engineSteps('binary-search', [1, 2, 4, 5], target).length);
    });

    await test.step('→ Linear Search: compatible; the (sorted) custom array and the target are kept', async () => {
      const target = Number(await app.targetInput.inputValue());
      await app.selectAlgorithm('linear-search');
      await app.expectBars([1, 2, 4, 5]);
      await expect(app.targetInput).toHaveValue(String(target));
      await app.expectTotal(engineSteps('linear-search', [1, 2, 4, 5], target).length);
      await app.expectStep(1);
    });

    await test.step('→ Heap Sort (not implemented): explicit unavailable state, no bars; the array survives the round trip', async () => {
      await app.page.getByRole('button', { name: /^Heap Sort/ }).click();
      await expect(app.heading).toHaveText('Heap Sort');
      await expect(app.bars).toHaveCount(0);
      await expect(app.page.getByText(/IN DEVELOPMENT/i)).toBeVisible();
      await app.selectAlgorithm('bubble-sort');
      await app.expectBars([1, 2, 4, 5]);
    });
  });

  test('without custom input each algorithm shows its own default example', async ({ app }) => {
    await app.selectAlgorithm('merge-sort');
    expect((await app.barValues()).length).toBe(8);
    await expect(app.sizeSelect).toHaveValue('8'); // the control reflects the real size
    await app.selectAlgorithm('binary-search');
    const values = await app.barValues();
    expect(isNonDecreasing(values)).toBe(true);
    await expect(app.inputIssue).toHaveCount(0);
    await expect(app.targetInput).toHaveValue('7');
  });

  test('a target typed for one search algorithm survives switching to another', async ({ app }) => {
    await app.selectAlgorithm('linear-search');
    await app.enterAndVisualize([1, 2, 3, 4], 3);
    await app.selectAlgorithm('binary-search');
    await expect(app.targetInput).toHaveValue('3');
    await expect(app.page.getByTestId('target-pill')).toHaveText('target = 3');
  });
});

test.describe('Randomize and Size with a custom array (seeded randomness)', () => {
  test('Randomize replaces the array visibly and Restore brings the custom array and its trace back', async ({ app }) => {
    await app.selectAlgorithm('merge-sort');
    await app.enterAndVisualize([3, 2, 1]);
    await app.randomizeButton.click();
    await expect(app.inputNotice).toHaveAttribute('data-kind', 'replaced-custom');
    await expect(app.inputNotice).toContainText('3, 2, 1');
    expect(await app.barValues()).toHaveLength(3);

    await app.restoreButton.click();
    await app.expectBars([3, 2, 1]);
    await expect(app.inputNotice).toHaveCount(0);
    await app.expectTotal(engineSteps('merge-sort', [3, 2, 1]).length);
    await expect(app.sizeSelect).toHaveValue('3'); // the real size, even though it is not a preset
  });

  test('Size replaces a custom array with a random one of that size, with the same notice', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([3, 2, 1]);
    await app.sizeSelect.selectOption('10');
    await expect(app.bars).toHaveCount(10);
    await expect(app.inputNotice).toContainText('3, 2, 1');
    await expect(app.sizeSelect).toHaveValue('10');
    await app.restoreButton.click();
    await app.expectBars([3, 2, 1]);
  });

  test('no notice appears when nothing custom was replaced', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.randomizeButton.click();
    await expect(app.bars).toHaveCount(5);
    await expect(app.inputNotice).toHaveCount(0);
  });

  test('Randomize for Binary Search always yields an ascending array that the field shows and the trace uses', async ({ app }) => {
    await app.selectAlgorithm('binary-search');
    for (let i = 0; i < 4; i++) {
      await app.randomizeButton.click();
      const values = await app.barValues();
      expect(isNonDecreasing(values), `[${values}]`).toBe(true);
      await expect(app.arrayInput).toHaveValue(values.join(', '));
      await expect(app.inputIssue).toHaveCount(0);
      const target = Number(await app.targetInput.inputValue());
      await app.expectTotal(engineSteps('binary-search', values, target).length);
    }
  });
});
