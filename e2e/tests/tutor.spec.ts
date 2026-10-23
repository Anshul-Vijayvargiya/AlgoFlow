import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * AI Tutor drawer and Privacy page on the mock API. The mock API answers from a fake provider that says so (no AI
 * model); the real server path is covered by e2e/real/tutor.spec.ts with AI_PROVIDER=fake.
 */

async function openTutor(page: Page) {
  await page.locator('#header-ai-tutor-btn').click();
  const dialog = page.getByRole('dialog', { name: 'AI Tutor' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('ai-tutor-test-mode')).toBeVisible();
  return dialog;
}

test.describe('AI Tutor', () => {
  test('no canned or fabricated answers, badges or fake "analyzing" text remain', async ({ app, page }) => {
    void app;
    const dialog = await openTutor(page);
    for (const text of ['PRO ACTIVE', 'AI is analyzing', 'buffer overflows', 'AlgoFlow AI Assistant', 'Great question']) {
      await expect(dialog).not.toContainText(text);
    }
    await expect(dialog.getByTestId('ai-tutor-answer')).toHaveCount(0);
  });

  test('a question goes to the server with the visualizer state, and its answer is shown', async ({ app, page }) => {
    await app.next();
    await app.next();
    const dialog = await openTutor(page);
    // no step summary under the title (the step still goes to the server, as the answer below shows)
    await expect(dialog.getByTestId('ai-tutor-context')).toHaveCount(0);
    await dialog.getByLabel('Your question').fill('Why compare these two?');
    await dialog.getByRole('button', { name: 'Send question' }).click();
    await expect(dialog.getByTestId('ai-tutor-answer')).toContainText('Algorithm: bubble-sort. Step: 3. Turns received: 1. Question: Why compare these two?');
    // a follow-up sends the earlier question and answer too
    await dialog.getByRole('button', { name: /current step/ }).click();
    await expect(dialog.getByTestId('ai-tutor-answer').nth(1)).toContainText('Turns received: 3.');
  });

  test('a failed answer is shown as an error with "Ask again", never as an answer', async ({ app, page }) => {
    void app;
    const dialog = await openTutor(page);
    await dialog.getByLabel('Your question').fill('FAKE:UNAVAILABLE please');
    await dialog.getByRole('button', { name: 'Send question' }).click();
    await expect(dialog.getByTestId('ai-tutor-error')).toContainText('could not get an answer');
    await expect(dialog.getByTestId('ai-tutor-answer')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Ask again' }).click();
    await expect(dialog.getByTestId('ai-tutor-error')).toHaveCount(1);
    await expect(dialog.getByTestId('ai-tutor-answer')).toHaveCount(0);
  });

  test('while an answer is pending: a waiting message, no answer yet, and nothing else can be sent', async ({ app, page }) => {
    void app;
    const dialog = await openTutor(page);
    await dialog.getByLabel('Your question').fill('FAKE:HOLD What happens here?');
    await dialog.getByRole('button', { name: 'Send question' }).click();
    await expect(dialog.getByTestId('ai-tutor-pending')).toHaveText("Waiting for the tutor's answer…");
    await expect(dialog.getByTestId('ai-tutor-answer')).toHaveCount(0);
    await dialog.getByLabel('Your question').fill('A second question');
    await expect(dialog.getByRole('button', { name: 'Send question' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: /complexity/ })).toBeDisabled();
    // the (held) answer arrives
    await page.evaluate(() => window.dispatchEvent(new Event('algoflow-mock-tutor-release')));
    await expect(dialog.getByTestId('ai-tutor-answer')).toContainText('Question: FAKE:HOLD What happens here?');
    await expect(dialog.getByTestId('ai-tutor-pending')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Send question' })).toBeEnabled();
  });

  test('an answer cut at the length limit is shown with a note saying so', async ({ app, page }) => {
    void app;
    const dialog = await openTutor(page);
    await dialog.getByLabel('Your question').fill('FAKE:TRUNCATED explain');
    await dialog.getByRole('button', { name: 'Send question' }).click();
    const answer = dialog.getByTestId('ai-tutor-answer');
    await expect(answer).toContainText('Question: FAKE:TRUNCATED explain');
    await expect(answer.getByText('This answer was cut short.')).toBeVisible();
    // a complete answer has no such note
    await dialog.getByLabel('Your question').fill('And now?');
    await dialog.getByRole('button', { name: 'Send question' }).click();
    await expect(dialog.getByTestId('ai-tutor-answer').nth(1).getByText('This answer was cut short.')).toHaveCount(0);
    await expect(dialog.getByTestId('ai-tutor-answer').nth(1)).toContainText('Question: And now?');
  });

  test('keyboard: focus moves into the dialog, Tab stays inside, Escape closes and focus returns to the button', async ({ app, page }) => {
    void app;
    const dialog = await openTutor(page);
    await expect(dialog.getByLabel('Your question')).toBeFocused();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#header-ai-tutor-btn')).toBeFocused();
  });

  test('after sending, focus stays in the question field and Escape still closes', async ({ app, page }) => {
    void app;
    const dialog = await openTutor(page);
    await dialog.getByLabel('Your question').fill('What is this step?');
    await dialog.getByRole('button', { name: 'Send question' }).click();
    await expect(dialog.getByLabel('Your question')).toBeFocused();
    await expect(dialog.getByTestId('ai-tutor-answer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('outside an algorithm the visualizer can run, questions are not sent', async ({ app, page }) => {
    await app.selectAlgorithm('stack' as never).catch(() => undefined);
    await page.getByRole('complementary').getByRole('button', { name: /^Stack/ }).click();
    const dialog = await openTutor(page);
    await expect(dialog.getByTestId('ai-tutor-context')).toContainText('open an algorithm the visualizer can run');
    await dialog.getByLabel('Your question').fill('What is a stack?');
    await expect(dialog.getByRole('button', { name: 'Send question' })).toBeDisabled();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe-core WCAG 2.1 A/AA with an answer shown: no violations (${theme})`, async ({ app, page }) => {
      void app;
      await page.getByRole('banner').getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      const dialog = await openTutor(page);
      await dialog.getByRole('button', { name: /complexity/ }).click();
      await expect(dialog.getByTestId('ai-tutor-answer')).toBeVisible();
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const result = await new AxeBuilder({ page }).include('[data-testid="ai-tutor"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('phone width: the dialog fills the screen and nothing scrolls sideways', async ({ app, page }) => {
    void app;
    await page.setViewportSize({ width: 375, height: 800 });
    const dialog = await openTutor(page);
    const box = await dialog.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(370);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

// The status the server reports, chosen through the mock API's test control (src/api/mockAdapter.ts)
test.describe('AI Tutor — server states', () => {
  const useStatus = (page: Page, scenario: 'unavailable' | 'gemini' | 'error-once') =>
    page.evaluate(s => localStorage.setItem('algoflow_mock_tutor_status', s), scenario);
  const open = async (page: Page) => {
    await page.locator('#header-ai-tutor-btn').click();
    const dialog = page.getByRole('dialog', { name: 'AI Tutor' });
    await expect(dialog).toBeVisible();
    return dialog;
  };

  test('no AI provider on the server: says the tutor is unavailable, and nothing can be asked or answered', async ({ app, page }) => {
    void app;
    await useStatus(page, 'unavailable');
    const dialog = await open(page);
    await expect(dialog.getByTestId('ai-tutor-unavailable')).toHaveText('The AI Tutor is not available on this server, so it cannot answer questions right now.');
    await expect(dialog.getByLabel('Your question')).toBeDisabled();
    await expect(dialog.getByLabel('Your question')).toHaveAttribute('placeholder', 'The AI Tutor is unavailable');
    await expect(dialog.getByRole('button', { name: 'Send question' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: /complexity/ })).toHaveCount(0);
    // no claim that an AI (or a test fake) answers
    await expect(dialog.getByTestId('ai-tutor-disclosure')).toHaveCount(0);
    await expect(dialog.getByTestId('ai-tutor-test-mode')).toHaveCount(0);
    await expect(dialog.getByTestId('ai-tutor-answer')).toHaveCount(0);
    const result = await new AxeBuilder({ page }).include('[data-testid="ai-tutor"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.map(v => v.id)).toEqual([]);
  });

  test('the availability check fails: an error with Retry, and Retry checks again', async ({ app, page }) => {
    void app;
    await useStatus(page, 'error-once');
    const dialog = await open(page);
    await expect(dialog.getByTestId('ai-tutor-status-error')).toContainText('The AI Tutor could not be reached: Network error.');
    await expect(dialog.getByLabel('Your question')).toBeDisabled();
    await expect(dialog.getByTestId('ai-tutor-answer')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByTestId('ai-tutor-status-error')).toHaveCount(0);
    await expect(dialog.getByTestId('ai-tutor-test-mode')).toBeVisible();
    await expect(dialog.getByLabel('Your question')).toBeEnabled();
    await dialog.getByRole('button', { name: /complexity/ }).click();
    await expect(dialog.getByTestId('ai-tutor-answer')).toBeVisible();
  });

  test('a Gemini server: the data-use notice says answers are AI-generated and sent to Google, with a Privacy link', async ({ app, page }) => {
    void app;
    await useStatus(page, 'gemini');
    const dialog = await open(page);
    const notice = dialog.getByTestId('ai-tutor-disclosure');
    await expect(notice).toContainText('Answers are generated by AI (Google Gemini) and can be wrong.');
    await expect(notice).toContainText('sent to Google');
    await expect(notice).toContainText("don't include personal information");
    await expect(notice.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    await expect(dialog.getByTestId('ai-tutor-test-mode')).toHaveCount(0);
  });
});

test.describe('Privacy page (draft)', () => {
  // the link from the sign-up form is checked signed out, in e2e/real/tutor.spec.ts (the mock API is always signed in)
  test('is marked as a draft and leaves legal sections as placeholders', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy Policy');
    await expect(page.getByTestId('privacy-draft-banner')).toContainText('Draft for review');
    await expect(page.locator('main')).toContainText('Gemini API');
    expect(await page.locator('[data-placeholder]').count()).toBeGreaterThanOrEqual(5);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.map(v => v.id)).toEqual([]);
  });
});
