import { test, expect, account, registerViaApi, signInViaUi, signOutViaUi, waitForDashboard, API_ORIGIN } from './fixtures';

/** Sign-up, sign-in, sessions and protected routes against the real API and database (no mock). */

test.describe('Real backend — authentication', () => {
  test('sign up in the UI creates a real account; sign out; sign in again with it', async ({ page }, testInfo) => {
    const user = account(testInfo, 'A');
    await page.goto('/auth?mode=register');
    await page.getByLabel('Full Name').fill(user.name);
    await page.getByLabel('Email Address').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    const registered = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/auth/register`);
    await page.locator('#auth-submit-btn').click();
    expect((await registered).status()).toBe(201);
    await waitForDashboard(page);

    // the server knows this session
    const me = await page.request.get(`${API_ORIGIN}/api/auth/me`);
    expect(me.status()).toBe(200);
    expect((await me.json()).user).toMatchObject({ email: user.email, name: user.name });

    await signOutViaUi(page);
    expect((await page.request.get(`${API_ORIGIN}/api/auth/me`)).status()).toBe(401);

    await signInViaUi(page, user);
    await waitForDashboard(page);
    expect((await page.request.get(`${API_ORIGIN}/api/auth/me`)).status()).toBe(200);
  });

  test('the session is restored after a reload, and in a new tab of the same browser', async ({ page, context }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await page.goto('/progress');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learning Progress');
    await page.reload();
    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learning Progress');

    const tab = await context.newPage();
    await tab.goto('/notes');
    await expect(tab).toHaveURL(/\/notes$/);
    await tab.close();
  });

  test('signed out: protected pages redirect to sign-in, and after signing in the page asked for opens', async ({ page }, testInfo) => {
    const user = account(testInfo, 'A');
    await registerViaApi(page.request, user);
    await page.context().clearCookies();
    for (const path of ['/dashboard', '/progress', '/learning', '/notes']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/auth/);
    }
    // the API refuses too, not only the UI
    for (const path of ['/api/progress/summary', '/api/progress/algorithms', '/api/notes']) {
      expect((await page.request.get(`${API_ORIGIN}${path}`)).status(), path).toBe(401);
    }

    await page.goto('/learning');
    await expect(page).toHaveURL(/\/auth/);
    await page.getByLabel('Email Address').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.locator('#auth-submit-btn').click();
    await expect(page).toHaveURL(/\/learning$/);
  });

  test('a session ends on the server at sign-out: the old cookie no longer works', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    const [cookie] = (await page.context().cookies()).filter(c => c.name === 'algoflow_token');
    expect(cookie).toBeTruthy();
    await page.goto('/dashboard');
    await signOutViaUi(page);
    // replaying the old token is refused (the server revoked it, it did not just delete the cookie)
    await page.context().addCookies([cookie]);
    expect((await page.request.get(`${API_ORIGIN}/api/auth/me`)).status()).toBe(401);
  });
});
