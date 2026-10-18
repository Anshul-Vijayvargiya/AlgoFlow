import { test, expect } from '../fixtures';

test.describe('accessible names and descriptions', () => {
  test('the input workflow is reachable by role and visible label', async ({ app, page }) => {
    await app.selectAlgorithm('linear-search');
    await expect(page.getByRole('textbox', { name: 'Array', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Target value' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Visualize' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Array size' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Programming language' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Playback speed' })).toBeVisible();
    for (const name of ['Randomize', 'Reset', 'Play']) await expect(page.getByRole('button', { name, exact: name === 'Play' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Next/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Previous/ })).toBeVisible();
  });

  test('the target field is named for the algorithm: "Target value" vs "Target sum"', async ({ app }) => {
    await app.selectAlgorithm('binary-search');
    await expect(app.targetInput).toHaveAccessibleName('Target value');
    await app.selectAlgorithm('two-pointer');
    await expect(app.targetInput).toHaveAccessibleName('Target sum');
  });

  test('the fields are described by their rules, and invalid state is exposed to assistive technology', async ({ app }) => {
    await app.selectAlgorithm('binary-search');
    await expect(app.arrayInput).toHaveAccessibleDescription(/whole numbers.*must be sorted ascending/);
    await expect(app.arrayInput).toHaveAttribute('aria-invalid', 'false');

    await app.type([5, 1, 4], 4);
    await expect(app.arrayInput).toHaveAttribute('aria-invalid', 'true');
    // announced politely (read when the user pauses), not as an assertive alert on every keystroke
    const live = app.page.getByTestId('input-error-live');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toContainText('needs an array sorted in ascending order');
    await expect(app.page.getByRole('alert')).toHaveCount(0);
    await expect(app.arrayInput).toHaveAccessibleDescription(/needs an array sorted/); // described by the error too

    await expect(app.page.getByRole('button', { name: 'Sort a copy' })).toBeVisible();
    await app.page.getByRole('button', { name: 'Sort a copy' }).click();
    const notice = app.page.getByRole('status').filter({ hasText: 'Sorted ascending because' });
    await expect(notice).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Restore original order' })).toBeVisible();
  });

  test('Randomize over a custom array exposes a named Restore button', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([3, 2, 1]);
    await app.randomizeButton.click();
    await expect(app.page.getByRole('status').filter({ hasText: 'was replaced by a random one' })).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Restore my array' })).toBeVisible();
  });

  test('each bar has an accessible name with its index, value and current role', async ({ app, page }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([8, 3]);
    await expect(page.getByRole('img', { name: 'Index 0, value 8' })).toBeVisible();
    await app.next(); // outer loop condition
    await app.next(); // inner loop condition (pair outlined as "examined")
    await app.next(); // compare
    await expect(page.getByRole('img', { name: /^Index 0, value 8, being compared/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Index 1, value 3, being compared/ })).toBeVisible();
  });

  test('the final result is announced in a status region with text, not colour alone', async ({ app, page }) => {
    await app.selectAlgorithm('linear-search');
    await app.enterAndVisualize([4, 2], 9);
    await app.goToLastStep();
    await expect(page.getByRole('status').filter({ hasText: 'Target not found' })).toBeVisible();
  });
});

test.describe('focus stays where the user is working', () => {
  test('Enter in the array field: focus stays in the array field and typing continues there', async ({ app }) => {
    await app.selectAlgorithm('linear-search');
    await app.arrayInput.fill('9, 8, 7');
    await app.targetInput.fill('8');
    await app.arrayInput.focus();
    await app.arrayInput.press('Enter');
    await app.expectBars([9, 8, 7]);
    await expect(app.arrayInput).toBeFocused();
    await app.page.keyboard.type(', 6'); // continues in the same field — focus was not stolen
    await expect(app.arrayInput).toHaveValue('9, 8, 7, 6');
  });

  test('Enter in the target field: focus stays in the target field', async ({ app }) => {
    await app.selectAlgorithm('linear-search');
    await app.type([9, 8, 7], 8);
    await app.targetInput.press('Enter');
    await app.expectBars([9, 8, 7]);
    await expect(app.targetInput).toBeFocused();
    await app.page.keyboard.type('0');
    await expect(app.targetInput).toHaveValue('80');
  });

  test('clicking Visualize keeps focus on the Visualize button', async ({ app }) => {
    await app.selectAlgorithm('linear-search');
    await app.type([9, 8, 7], 8);
    await app.visualizeButton.click();
    await app.expectBars([9, 8, 7]);
    await expect(app.visualizeButton).toBeFocused();
  });

  test('Sort a copy and Restore move focus to the array field (their own buttons disappear)', async ({ app }) => {
    await app.selectAlgorithm('binary-search');
    await app.type([5, 1, 4, 2], 4);
    await app.sortCopyButton.click();
    await app.expectBars([1, 2, 4, 5]);
    await expect(app.arrayInput).toBeFocused();

    await app.restoreButton.click();
    await expect(app.inputIssue).toBeVisible();
    await expect(app.arrayInput).toBeFocused();
  });

  test('actions outside the input panel never pull focus into it', async ({ app, browserName }) => {
    // WebKit (like Safari) does not move focus to a button on mouse click; Chromium and Firefox do.
    const clickFocusesButtons = browserName !== 'webkit';
    await app.arrayInput.focus();
    const sidebarButton = app.sidebar.getByRole('button', { name: /^Quick Sort/ });
    await sidebarButton.click();
    await expect(app.heading).toHaveText('Quick Sort');
    await expect(app.arrayInput, 'the remounted input panel did not take focus').not.toBeFocused();
    if (clickFocusesButtons) await expect(sidebarButton, 'focus stays on the control the user used').toBeFocused();

    await app.randomizeButton.click();
    await expect(app.arrayInput).not.toBeFocused();
    if (clickFocusesButtons) await expect(app.randomizeButton).toBeFocused();
  });

  test('the playback controls are keyboard operable', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([3, 1, 2]);
    await app.nextButton.focus();
    await app.page.keyboard.press('Enter');
    await app.expectStep(2);
    await app.page.keyboard.press('Space');
    await app.expectStep(3);
    await expect(app.nextButton).toBeFocused();
  });
});

test.describe('keyboard navigation and visible focus', () => {
  /** accessible-ish name of the focused element + whether a visible focus indicator is drawn */
  const focused = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const labelledBy = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() : undefined;
      return {
        name: el.getAttribute('aria-label') ?? labelledBy ?? el.textContent?.trim() ?? '',
        tag: el.tagName.toLowerCase(),
        indicator: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow !== 'none' && cs.boxShadow !== ''),
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
      };
    });

  test('Tab moves through the input workflow and the playback controls in a logical order, each with a visible focus indicator', async ({ app, page }) => {
    await app.selectAlgorithm('linear-search');
    await app.enterAndVisualize([4, 2, 9], 9);
    await app.next(); // so "Previous" is enabled and therefore focusable

    await app.arrayInput.focus();
    const order: string[] = [];
    const missingIndicator: string[] = [];
    let f = await focused(page);
    for (let i = 0; i < 10 && f; i++) {
      order.push(f.name);
      if (!f.indicator) missingIndicator.push(`${f.name} (${f.outline})`);
      await page.keyboard.press('Tab');
      f = await focused(page);
    }
    expect(order.slice(0, 10)).toEqual([
      'Array',
      'Target value',
      'Visualize',
      'Reset',
      'Previous step',
      'Play',
      'Next step',
      'Randomize',
      'Array size',
      'Playback speed',
    ]);
    expect(missingIndicator, 'every keyboard-focused control shows a focus indicator').toEqual([]);
  });

  test('the language selector and the sidebar algorithms are keyboard reachable and operable', async ({ app, page }) => {
    await app.languageSelect.focus();
    await page.keyboard.press('ArrowDown'); // native select: changes the value
    await expect(app.languageSelect).not.toHaveValue('cpp');

    const item = app.sidebar.getByRole('button', { name: /^Selection Sort/ });
    await item.focus();
    await page.keyboard.press('Enter');
    await expect(app.heading).toHaveText('Selection Sort');
    await expect(item).toBeFocused();
  });
});

test.describe('screen-reader announcements (live regions)', () => {
  test('manual stepping announces "Step n of m" with the action; playback stays silent; pausing announces the position', async ({ app, page }) => {
    const announcer = page.getByTestId('step-announcer');
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([3, 1, 2]);
    await expect(announcer).toHaveAttribute('aria-live', 'polite');

    await app.next();
    const message = await page.getByTestId('current-action').textContent();
    await expect(announcer).toHaveText(`Step 2 of ${await app.totalSteps()}. ${message}`);

    await app.setSpeed('medium');
    await app.play();
    await expect(app.pauseButton).toBeVisible();
    await expect(announcer, 'no per-step announcements while playing').toHaveText('');
    await app.pause();
    await expect(announcer).toHaveText(new RegExp(`^Step ${await app.stepNumber()} of `));
  });

  test('exactly one assertive region can exist at a time, and normal use creates none', async ({ app, page }) => {
    await app.selectAlgorithm('binary-search');
    await app.type([5, 1, 4], 4);
    await app.sortCopyButton.click();
    await app.goToLastStep();
    await expect(page.locator('[aria-live="assertive"], [role="alert"]')).toHaveCount(0);
  });
});
