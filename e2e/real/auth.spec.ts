import { test, expect, account, registerViaApi, signInViaUi, signOutViaUi, waitForDashboard, API_ORIGIN, api } from './fixtures';

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
    const me = await api(page).get(`${API_ORIGIN}/api/auth/me`);
    expect(me.status()).toBe(200);
    expect((await me.json()).user).toMatchObject({ email: user.email, name: user.name });

    await signOutViaUi(page);
    expect((await api(page).get(`${API_ORIGIN}/api/auth/me`)).status()).toBe(401);

    await signInViaUi(page, user);
    await waitForDashboard(page);
    expect((await api(page).get(`${API_ORIGIN}/api/auth/me`)).status()).toBe(200);
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
      expect((await api(page).get(`${API_ORIGIN}${path}`)).status(), path).toBe(401);
    }

    await page.goto('/learning');
    await expect(page).toHaveURL(/\/auth/);
    await page.getByLabel('Email Address').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.locator('#auth-submit-btn').click();
    await expect(page).toHaveURL(/\/learning$/);
  });

  test('the refresh token is an HttpOnly cookie for /api/auth only; the access token is kept in memory', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'Cookie'));
    const cookies = await page.context().cookies();
    expect(cookies.map(c => c.name)).toEqual(['algoflow_refresh']);
    expect(cookies[0]).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/auth', domain: '127.0.0.1' });
    expect(cookies[0].expires).toBeGreaterThan(Date.now() / 1000 + 6 * 86_400);

    // the app resumes the session from the cookie and calls the API with a Bearer token
    const me = page.waitForRequest(r => r.url() === `${API_ORIGIN}/api/auth/me`);
    await page.goto('/dashboard');
    expect((await me).headers().authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    await waitForDashboard(page);
    // no token in script-readable storage
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
    expect(stored).not.toMatch(/eyJ[\w-]+\.[\w-]+/);
    expect(stored).not.toContain(cookies[0].value);
  });

  test('a session ends on the server at sign-out: the old refresh cookie no longer works', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await page.goto('/dashboard');
    await waitForDashboard(page);
    const [cookie] = (await page.context().cookies()).filter(c => c.name === 'algoflow_refresh');
    expect(cookie).toBeTruthy();
    await signOutViaUi(page);
    expect((await page.context().cookies()).filter(c => c.name === 'algoflow_refresh')).toEqual([]);

    // replaying the copied cookie is refused: the server ended the session, it did not just delete the cookie
    await page.context().addCookies([cookie]);
    const replay = await page.request.post(`${API_ORIGIN}/api/auth/refresh`, { headers: { Origin: new URL(page.url()).origin } });
    expect(replay.status()).toBe(401);
    expect((await replay.json()).code).toBe('SESSION_REVOKED');
    expect((await api(page).get(`${API_ORIGIN}/api/auth/me`)).status()).toBe(401);
  });

  test('a rotated refresh token that comes back later ends the session (reuse detection)', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    const origin = { Origin: new URL(test.info().project.use.baseURL!).origin };
    const [first] = await page.context().cookies();
    expect((await page.request.post(`${API_ORIGIN}/api/auth/refresh`, { headers: origin })).status()).toBe(200);
    const [second] = await page.context().cookies();
    expect(second.value).not.toBe(first.value);

    // the old cookie, presented after the concurrent-refresh grace window, is treated as stolen
    await page.waitForTimeout(10_500);
    await page.context().addCookies([first]);
    expect((await page.request.post(`${API_ORIGIN}/api/auth/refresh`, { headers: origin })).status()).toBe(401);
    // the session is over for the legitimate holder too
    await page.context().addCookies([second]);
    expect((await page.request.post(`${API_ORIGIN}/api/auth/refresh`, { headers: origin })).status()).toBe(401);
  });

  test('the refresh endpoint refuses requests from other origins', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'Origin'));
    for (const headers of [{} as Record<string, string>, { Origin: 'https://evil.example' }, { Origin: new URL(test.info().project.use.baseURL!).origin, 'Sec-Fetch-Site': 'cross-site' }]) {
      expect((await page.request.post(`${API_ORIGIN}/api/auth/refresh`, { headers })).status(), JSON.stringify(headers)).toBe(403);
    }
    // the session is untouched
    expect((await api(page).get(`${API_ORIGIN}/api/auth/me`)).status()).toBe(200);
  });
});
