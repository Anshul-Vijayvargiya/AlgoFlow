import { test, expect } from '../fixtures';

test.describe('environment', () => {
  test('runs on the mock API: the app signs in a demo user without any backend', async ({ app, page }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    // the mock API's demo user is signed in (account button named by its visible initials + name)
    await expect(page.getByRole('button', { name: 'AC Alex' })).toBeVisible();
  });
});
