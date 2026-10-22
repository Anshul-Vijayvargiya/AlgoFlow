import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * Code Playground on the mock API. The mock API uses the same fake execution rules as the server's
 * EXECUTION_PROVIDER=fake (src/execution/fakeExecution.ts): no code is compiled or run, and the page says so. These
 * tests check the page's behaviour for every outcome; real execution is covered by the opt-in Judge0 test.
 */

async function openPlayground(page: Page) {
  await page.goto('/playground');
  await expect(page.getByRole('button', { name: 'Run Code' })).toBeEnabled();
}
const source = (page: Page) => page.getByRole('textbox', { name: 'Source code' });
const stdin = (page: Page) => page.getByLabel('STANDARD INPUT (STDIN)');
const runConsole = (page: Page) => page.getByTestId('run-console');

test.describe('Code Playground', () => {
  test('shows the provider in use and never an invented compiler version or result', async ({ app, page }) => {
    void app;
    await openPlayground(page);
    await expect(page.getByTestId('playground-fake-provider')).toContainText('fake execution provider');
    const options = await page.getByRole('combobox', { name: 'Language to run' }).locator('option').allTextContents();
    expect(options).toEqual(['C (fake provider)', 'C++ (fake provider)', 'Java (fake provider)', 'Python (fake provider)']);
    await expect(page.locator('main')).not.toContainText(/GCC 13|OpenJDK 21|EXECUTION SUCCESSFUL/);
    await expect(runConsole(page)).toContainText('Ready.');
  });

  test('Run sends the program and its stdin, and shows the returned output and exit code', async ({ app, page }) => {
    void app;
    await openPlayground(page);
    await stdin(page).fill('4 5 6');
    await page.getByRole('button', { name: 'Run Code' }).click();
    await expect(page.getByTestId('run-status')).toHaveText('Finished with exit code 0');
    await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'success');
    // the fake echoes stdin (a real provider would run the program)
    await expect(page.getByTestId('run-stdout')).toHaveText('4 5 6');
    await expect(page.getByTestId('run-metrics')).toContainText('C++ (fake provider)');
  });

  test('compilation errors, runtime errors and timeouts are shown as such', async ({ app, page }) => {
    void app;
    await openPlayground(page);
    for (const [directive, headline, status] of [
      ['FAKE:COMPILE_ERROR', 'Compilation failed', 'compile_error'],
      ['FAKE:RUNTIME_ERROR', 'Runtime error (exit code 1)', 'runtime_error'],
      ['FAKE:TIMEOUT', 'Time limit exceeded: the program was stopped', 'timeout'],
    ]) {
      await source(page).fill(`// ${directive}\nint main() { return 0; }`);
      await page.getByRole('button', { name: 'Run Code' }).click();
      await expect(page.getByTestId('run-status')).toHaveText(headline);
      await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', status);
    }
    await source(page).fill('// FAKE:COMPILE_ERROR');
    await page.getByRole('button', { name: 'Run Code' }).click();
    await expect(page.getByTestId('run-compile-output')).toContainText('FAKE:COMPILE_ERROR');
  });

  test('when the execution service is unavailable, nothing is shown as output', async ({ app, page }) => {
    void app;
    await openPlayground(page);
    await source(page).fill('// FAKE:UNAVAILABLE');
    await page.getByRole('button', { name: 'Run Code' }).click();
    await expect(page.getByTestId('run-failed')).toContainText('Not run: The code execution service is unavailable');
    await expect(page.getByTestId('run-stdout')).toHaveCount(0);
    await expect(page.getByTestId('run-status')).toHaveCount(0);
  });

  test('each language has its own starter program and file name, and edits survive switching', async ({ app, page }) => {
    void app;
    await openPlayground(page);
    const select = page.getByRole('combobox', { name: 'Language to run' });
    await expect(page.getByTestId('source-file-name')).toHaveText('main.cpp');
    await source(page).fill('// my C++ edit');

    await select.selectOption('java');
    await expect(page.getByTestId('source-file-name')).toHaveText('Main.java');
    await expect(source(page)).toHaveValue(/public class Main/);
    await select.selectOption('python');
    await expect(page.getByTestId('source-file-name')).toHaveText('main.py');
    await expect(source(page)).toHaveValue(/sys\.stdin\.read\(\)/);
    await select.selectOption('c');
    await expect(source(page)).toHaveValue(/#include <stdio\.h>/);

    await select.selectOption('cpp');
    await expect(source(page)).toHaveValue('// my C++ edit');
  });

  test('an empty program cannot be run', async ({ app, page }) => {
    void app;
    await openPlayground(page);
    await source(page).fill('   ');
    await expect(page.getByRole('button', { name: 'Run Code' })).toBeDisabled();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe-core WCAG 2.1 A/AA after a run: no violations (${theme})`, async ({ app, page }) => {
      void app;
      await page.getByRole('banner').getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await openPlayground(page);
      await source(page).fill('// FAKE:PRINT hello\n// FAKE:RUNTIME_ERROR');
      await page.getByRole('button', { name: 'Run Code' }).click();
      await expect(page.getByTestId('run-status')).toBeVisible();
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
});
