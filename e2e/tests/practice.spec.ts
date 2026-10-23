import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * Practice page on the mock API. The mock judges against the visible tests with the fake execution rules (no code
 * runs; src/execution/fakeExecution.ts), so these tests check the page: statements, verdict display, history,
 * failures and accessibility. Judging itself is covered by the server tests and the real-backend suite.
 */

async function openProblem(page: Page, problemId: string) {
  await page.goto('/practice');
  await page.locator(`[data-problem="${problemId}"]`).getByRole('button', { name: 'Practice Now' }).click();
  await expect(page.locator('#practice-submit-btn')).toBeVisible();
}
const editor = (page: Page) => page.getByPlaceholder('Write your solution here...');

test.describe('Practice', () => {
  test('the five problems, none shown as solved before any submission', async ({ app, page }) => {
    void app;
    await page.goto('/practice');
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) await expect(page.locator(`[data-problem="${id}"]`)).toContainText('Unsolved');
  });

  test('statements give the real input and output format; sample tests show the exact input', async ({ app, page }) => {
    void app;
    await openProblem(page, 'p5');
    await expect(page.getByTestId('problem-statement')).toContainText('Output: one line per level');
    await expect(page.getByTestId('sample-test').first()).toContainText('3 9 20 null null 15 7');
    await expect(page.getByTestId('sample-test').first()).toContainText('15 7');
    await expect(editor(page)).toHaveValue(/levelOrder/);
  });

  test('a wrong answer shows the failing test with expected and actual output, and is kept in history', async ({ app, page }) => {
    void app;
    await openProblem(page, 'p4');
    await page.locator('#practice-submit-btn').click();
    await expect(page.getByTestId('submission-verdict')).toHaveText('Wrong Answer');
    await expect(page.getByTestId('submission-message')).toHaveText('Wrong answer on test 1 (0 of 2 tests passed).');
    await expect(page.getByTestId('failed-test')).toContainText('49');
    await expect(page.getByTestId('history-status').first()).toHaveText('Wrong Answer · 0/2');

    // still there after a reload, and the problem is not solved
    await page.reload();
    await expect(page.locator('[data-problem="p4"]')).toContainText('Unsolved');
    await page.locator('[data-problem="p4"]').getByRole('button', { name: 'Practice Now' }).click();
    await expect(page.getByTestId('history-status').first()).toHaveText('Wrong Answer · 0/2');
  });

  test('compilation errors show the compiler output; a judging error is shown as such, never as a pass', async ({ app, page }) => {
    void app;
    await openProblem(page, 'p1');
    await editor(page).fill('// FAKE:COMPILE_ERROR');
    await page.locator('#practice-submit-btn').click();
    await expect(page.getByTestId('submission-verdict')).toHaveText('Compilation Error');
    await expect(page.getByTestId('submission-compile-output')).toContainText('FAKE:COMPILE_ERROR');

    await page.getByRole('button', { name: 'Edit & resubmit' }).click();
    await expect(editor(page)).toHaveValue('// FAKE:COMPILE_ERROR');
    await editor(page).fill('// FAKE:UNAVAILABLE');
    await page.locator('#practice-submit-btn').click();
    await expect(page.getByTestId('submission-result')).toHaveAttribute('data-status', 'JUDGING_ERROR');
    await expect(page.getByTestId('submission-verdict')).toHaveText('Judging Error');
    await expect(page.getByTestId('history-status')).toHaveText(['Judging Error · 0/2', 'Compilation Error · 0/2']);
  });

  test('runtime errors and time limits are named', async ({ app, page }) => {
    void app;
    await openProblem(page, 'p3');
    for (const [directive, verdict] of [['FAKE:RUNTIME_ERROR', 'Runtime Error'], ['FAKE:TIMEOUT', 'Time Limit Exceeded']]) {
      await editor(page).fill(`// ${directive}`);
      await page.locator('#practice-submit-btn').click();
      await expect(page.getByTestId('submission-verdict')).toHaveText(verdict);
      await page.getByRole('button', { name: 'Edit & resubmit' }).click();
    }
  });

  test("drafts: switching language keeps each language's code; another problem never inherits it", async ({ app, page }) => {
    void app;
    await openProblem(page, 'p1');
    const lang = (name: string) => page.getByRole('button', { name, exact: true });
    await editor(page).fill('// my C++ for Two Sum');
    await lang('PYTHON').click();
    await expect(editor(page)).toHaveValue(/def two_sum/);
    await editor(page).fill('# my Python for Two Sum');
    await lang('CPP').click();
    await expect(editor(page)).toHaveValue('// my C++ for Two Sum');
    await editor(page).fill('// my C++ for Two Sum, edited again');
    await lang('PYTHON').click();
    await expect(editor(page)).toHaveValue('# my Python for Two Sum');

    // another problem starts from its own starter, in the language last used
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('[data-problem="p2"]').getByRole('button', { name: 'Practice Now' }).click();
    await expect(editor(page)).toHaveValue(/def is_valid/);
    await lang('CPP').click();
    await expect(editor(page)).toHaveValue(/bool isValid/);

    // and coming back to the first problem restores its drafts
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('[data-problem="p1"]').getByRole('button', { name: 'Practice Now' }).click();
    await expect(editor(page)).toHaveValue('// my C++ for Two Sum, edited again');
  });

  test('drafts survive a page reload, per problem and language', async ({ app, page }) => {
    void app;
    await openProblem(page, 'p4');
    const lang = (name: string) => page.getByRole('button', { name, exact: true });
    await editor(page).fill('// my C++ container');
    await lang('JAVA').click();
    await editor(page).fill('// my Java container');
    await page.reload();
    await page.locator('[data-problem="p4"]').getByRole('button', { name: 'Practice Now' }).click();
    await lang('CPP').click();
    await expect(editor(page)).toHaveValue('// my C++ container');
    await lang('JAVA').click();
    await expect(editor(page)).toHaveValue('// my Java container');
    await lang('PYTHON').click();
    await expect(editor(page)).toHaveValue(/def max_area/);
    await expect(page.getByTestId('drafts-not-saved')).toHaveCount(0);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe-core WCAG 2.1 A/AA with a failed-test result open: no violations (${theme})`, async ({ app, page }) => {
      void app;
      await page.getByRole('banner').getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await openProblem(page, 'p2');
      await page.locator('#practice-submit-btn').click();
      await expect(page.getByTestId('failed-test')).toBeVisible();
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      // only the result panel and history added by judging (the rest of the page has known issues, see light-mode.spec)
      const result = await new AxeBuilder({ page }).include('[data-testid="submission-result"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
});

// Topic learning sets: built from the problems the (mock) API publishes; choosing one is the existing topic filter.
test.describe('Practice — topic learning sets', () => {
  const sets = (page: Page) => page.getByRole('group', { name: 'Topic learning sets' });
  const setButton = (page: Page, topic: string) => page.locator(`[data-topic-set="${topic}"]`);
  const shownProblems = (page: Page) => page.locator('[data-problem]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.problem));
  const open = async (page: Page) => {
    await page.goto('/practice');
    await expect(sets(page)).toBeVisible();
  };

  test('one set per topic the problems actually have, with real counts; none invented', async ({ app, page }) => {
    void app;
    await open(page);
    await expect(sets(page).getByRole('button')).toHaveText([
      /^All topics5 problems0 of 5 solved/, /^Arrays2 problems1 Easy · 1 Medium0 of 2 solved/, /^Linked List1 problem1 Easy0 of 1 solved/,
      /^Stack1 problem1 Easy0 of 1 solved/, /^Trees1 problem1 Medium0 of 1 solved/,
    ]);
    await expect(setButton(page, 'All')).toContainText('0 of 5 solved');
    // the topic filter offers the same topics, and nothing else
    await expect(page.locator('#practice-topic-select option')).toHaveText(['All topics', 'Arrays', 'Linked List', 'Stack', 'Trees']);
    for (const missing of ['Strings', 'Graphs', 'DP']) await expect(setButton(page, missing)).toHaveCount(0);
  });

  test('choosing a set shows exactly its problems, marks it selected and sets the topic filter', async ({ app, page }) => {
    void app;
    await open(page);
    await expect(setButton(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await setButton(page, 'Arrays').click();
    await expect(setButton(page, 'Arrays')).toHaveAttribute('aria-pressed', 'true');
    await expect(setButton(page, 'All')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#practice-topic-select')).toHaveValue('Arrays');
    await expect.poll(() => shownProblems(page)).toEqual(['p1', 'p4']);
    await expect(page.getByTestId('practice-page-indicator')).toHaveText('Page 1 of 1');
    // the dropdown drives the same state
    await page.locator('#practice-topic-select').selectOption('Trees');
    await expect(setButton(page, 'Trees')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => shownProblems(page)).toEqual(['p5']);
    await setButton(page, 'All').click();
    await expect.poll(() => shownProblems(page)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  test('a topic combines with difficulty and search; the sets themselves never change with the filters', async ({ app, page }) => {
    void app;
    await open(page);
    await setButton(page, 'Arrays').click();
    await page.getByRole('button', { name: 'Medium', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Medium', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => shownProblems(page)).toEqual(['p4']);
    await page.locator('#practice-search-input').fill('two sum');
    await expect(page.getByText('No published problems match your search, difficulty and topic filters.')).toBeVisible();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect.poll(() => shownProblems(page)).toEqual(['p1']);
    // still the full counts: the sets describe every published problem, not the filtered list
    await expect(setButton(page, 'Arrays')).toContainText('2 problems');
    await expect(setButton(page, 'All')).toContainText('5 problems');
    await expect(page.locator('#practice-topic-select')).toHaveValue('Arrays');
  });

  test('keyboard: the sets are reachable with Tab, chosen with Enter or Space, and show a focus ring', async ({ app, page }) => {
    void app;
    await open(page);
    await setButton(page, 'Linked List').focus();
    await expect(setButton(page, 'Linked List')).toBeFocused();
    const ring = await setButton(page, 'Linked List').evaluate(e => getComputedStyle(e).boxShadow);
    expect(ring).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(setButton(page, 'Linked List')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => shownProblems(page)).toEqual(['p3']);
    await page.keyboard.press('Tab');
    await expect(setButton(page, 'Stack')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(setButton(page, 'Stack')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => shownProblems(page)).toEqual(['p2']);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe-core WCAG 2.1 A/AA on the topic sets: no violations (${theme})`, async ({ app, page }) => {
      void app;
      await page.getByRole('banner').getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await open(page);
      await setButton(page, 'Arrays').click();
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const result = await new AxeBuilder({ page }).include('[data-testid="topic-sets"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('phone width: the sets wrap without sideways scrolling', async ({ app, page }) => {
    void app;
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page);
    await expect(setButton(page, 'Trees')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
