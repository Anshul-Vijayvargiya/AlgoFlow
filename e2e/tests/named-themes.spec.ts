import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * The four named themes — Midnight Neon ('dark'), Purple Galaxy ('galaxy'), Arctic Light ('light') and Sunset Warm
 * ('sunset'): switching from the header and Settings, persistence across navigation and reload, and every page's
 * accessibility in each theme. Purple Galaxy and Sunset Warm are generated from the dark and light themes with each
 * colour's luminance kept, so an axe scan in either may only report what its base theme reports on the same page
 * (light-mode.spec.ts holds the light theme itself to the same rule against dark). Each test takes the `app` fixture
 * so that it opens /visualizer first.
 */

type ThemeId = 'dark' | 'galaxy' | 'light' | 'sunset';
const THEMES: { id: ThemeId; name: string; base: 'dark' | 'light'; page: string }[] = [
  { id: 'dark', name: 'Midnight Neon', base: 'dark', page: 'rgba(7, 10, 18, 1)' },
  { id: 'galaxy', name: 'Purple Galaxy', base: 'dark', page: 'rgba(12, 7, 26, 1)' },
  { id: 'light', name: 'Arctic Light', base: 'light', page: 'rgba(244, 251, 255, 1)' },
  { id: 'sunset', name: 'Sunset Warm', base: 'light', page: 'rgba(255, 249, 244, 1)' },
];

const headerTheme = (page: Page) => page.getByRole('banner').getByRole('combobox', { name: 'Theme' });
const applied = (page: Page) =>
  page.evaluate(() => ({ theme: document.documentElement.dataset.theme, palette: document.documentElement.dataset.palette }));

async function setTheme(page: Page, theme: ThemeId) {
  const picker = page.locator('#header-theme-select, #auth-theme-select').first();
  if (await picker.count()) await picker.selectOption(theme);
  else {
    // a page without the picker (Privacy): save the choice as the app does; the reload applies it before render
    await page.evaluate(t => localStorage.setItem('algoflow-theme', t), theme);
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect((await applied(page)).palette).toBe(theme);
  }
  // transitions only (looping animations never finish); a transition replaced mid-way rejects, hence allSettled
  await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
}

/** a computed colour as "rgba(r, g, b, a)" in sRGB (painted on a canvas: browsers report oklch / oklab otherwise) */
const normalize = (page: Page, css: string) =>
  page.evaluate(c => {
    const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d')!;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
  }, css);
const bodyBackground = async (page: Page) => normalize(page, await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
const token = (page: Page, name: string) => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
/** within one unit per channel: oklch → sRGB rounding differs slightly between browsers */
const close = (a: string, b: string) => {
  const [x, y] = [a, b].map(c => c.match(/[\d.]+/g)!.map(Number));
  return x.every((v, i) => Math.abs(v - y[i]) <= (i === 3 ? 0.01 : 1));
};

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

async function visualizeFactorial(page: Page) {
  await expect(page.getByRole('button', { name: 'Run Code' })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Language to run' }).selectOption('python');
  await page.getByRole('combobox', { name: 'Load an example program' }).selectOption('factorial');
  await page.getByRole('button', { name: 'Visualize' }).click();
  await expect(page.getByTestId('trace-view')).toBeVisible();
  await page.getByRole('slider', { name: 'Step' }).fill('9');
}

test.describe('named themes: switching and persistence', () => {
  test('the header applies each theme at once — base, palette, page colour and accent — and stores it', async ({ app, page }) => {
    void app;
    const accents = new Set<string>();
    for (const t of THEMES) {
      await setTheme(page, t.id);
      expect(await applied(page), t.id).toEqual({ theme: t.base, palette: t.id });
      expect(await page.evaluate(() => document.documentElement.style.colorScheme), t.id).toBe(t.base);
      const background = await bodyBackground(page);
      expect(close(background, t.page), `${t.id}: ${background}`).toBe(true);
      expect(await page.evaluate(() => localStorage.getItem('algoflow-theme'))).toBe(t.id);
      await expect(headerTheme(page).locator('option:checked')).toHaveText(t.name);
      accents.add(await token(page, '--af-accent'));
    }
    expect(accents.size, 'each theme has its own accent').toBe(4);
  });

  test('the choice stays through client-side navigation, a reload (applied before the app renders) and a new visit', async ({ app, page }) => {
    void app;
    await setTheme(page, 'sunset');
    await page.getByRole('banner').getByRole('link', { name: 'Playground' }).click();
    await expect(page).toHaveURL(/\/playground/);
    expect(await applied(page)).toEqual({ theme: 'light', palette: 'sunset' });

    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    await page.route(u => u.pathname.startsWith('/assets/') && u.pathname.endsWith('.js'), async route => {
      await gate;
      await route.continue();
    });
    await page.reload({ waitUntil: 'commit' });
    await expect.poll(() => applied(page)).toEqual({ theme: 'light', palette: 'sunset' });
    expect(await page.evaluate(() => document.querySelector('#root')?.children.length ?? 0)).toBe(0); // React not started
    release();
    await expect(headerTheme(page)).toHaveValue('sunset');

    await setTheme(page, 'galaxy');
    await page.goto('/notes');
    await expect(headerTheme(page)).toHaveValue('galaxy');
    expect(await applied(page)).toEqual({ theme: 'dark', palette: 'galaxy' });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('algoflow_user') ?? '{}')?.preferences?.theme)).toBe('galaxy');
  });

  test('Settings shows the four themes as swatches in their own colours; picking one applies it everywhere at once', async ({ app, page }) => {
    void app;
    await page.locator('#header-profile-btn').click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const group = page.getByRole('group', { name: 'Interface Theme' });
    await expect(group).toBeVisible();
    for (const t of THEMES) await expect(group.getByRole('button', { name: t.name, exact: true })).toBeVisible();
    await expect(group.getByRole('button', { name: 'Midnight Neon', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: 'Purple Galaxy', exact: true })).toHaveAccessibleDescription('Dark purple, violet and lavender');

    // each swatch shows its theme's own page colour, whatever theme is active
    const swatches = async () => {
      const out: Record<string, string> = {};
      for (const t of THEMES) out[t.id] = await normalize(page, await page.getByTestId(`theme-swatch-${t.id}`).evaluate(e => getComputedStyle(e).backgroundColor));
      return out;
    };
    const before = await swatches();
    for (const t of THEMES) expect(close(before[t.id], t.page), `${t.id} swatch ${before[t.id]}`).toBe(true);

    await group.getByRole('button', { name: 'Sunset Warm', exact: true }).click();
    expect(await applied(page)).toEqual({ theme: 'light', palette: 'sunset' });
    await expect(group.getByRole('button', { name: 'Sunset Warm', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: 'Midnight Neon', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(headerTheme(page)).toHaveValue('sunset');
    expect(await swatches()).toEqual(before);

    // keyboard: Tab to a card and press Space
    await group.getByRole('button', { name: 'Purple Galaxy', exact: true }).focus();
    await page.keyboard.press('Space');
    expect(await applied(page)).toEqual({ theme: 'dark', palette: 'galaxy' });
  });

  test('System still means Midnight Neon or Arctic Light, following the device', async ({ app, page }) => {
    void app;
    await setTheme(page, 'galaxy');
    await page.emulateMedia({ colorScheme: 'light' });
    await headerTheme(page).selectOption('system');
    expect(await applied(page)).toEqual({ theme: 'light', palette: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => applied(page)).toEqual({ theme: 'dark', palette: 'dark' });
  });
});

/*
 * Every page in Purple Galaxy and Sunset Warm. The base theme's own pre-existing issues (unlabelled controls, dim
 * footer text — see light-mode.spec.ts) are allowed; anything only the named theme has is a failure.
 */
const PAGES: [string, string, ((page: Page) => Promise<void>)?][] = [
  ['visualizer: Quick Sort mid-trace (compare, pivot, code line)', '/visualizer', async page => {
    await page.getByRole('complementary').getByRole('button', { name: /^Quick Sort/ }).click();
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /Next/ }).click();
  }],
  ['visualizer: linked list with a node outside the list', '/visualizer', async page => {
    await page.getByRole('complementary').getByRole('button', { name: /^Delete at Position/ }).click();
    for (let i = 0; i < 9; i++) await page.getByRole('button', { name: /Next/ }).click();
  }],
  ['visualizer: invalid input message', '/visualizer', async page => {
    await page.getByRole('complementary').getByRole('button', { name: /^Binary Search/ }).click();
    await page.locator('#array-input').fill('5, 1, 4');
    await expect(page.getByTestId('input-error')).toBeVisible();
  }],
  ['dashboard (charts)', '/dashboard'],
  ['practice', '/practice'],
  ['playground', '/playground'],
  ['playground: step-by-step trace mid-way', '/playground', visualizeFactorial],
  ['learning roadmap', '/learning'],
  ['patterns', '/patterns'],
  ['notes', '/notes'],
  ['progress (charts)', '/progress'],
  ['profile menu open', '/visualizer', async page => {
    await page.locator('#header-profile-btn').click();
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
  }],
  ['privacy', '/privacy'],
  ['admin (signed in as an admin)', '/visualizer', async page => {
    // the mock API takes the role from the stored user
    await page.evaluate(() => {
      const user = JSON.parse(localStorage.getItem('algoflow_user')!);
      localStorage.setItem('algoflow_user', JSON.stringify({ ...user, role: 'ADMIN' }));
    });
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/admin/);
  }],
  ['settings dialog open', '/visualizer', async page => {
    await page.locator('#header-profile-btn').click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('group', { name: 'Interface Theme' })).toBeVisible();
  }],
];

for (const [theme, base] of [['galaxy', 'dark'], ['sunset', 'light']] as const) {
  test.describe(`${theme} — accessibility scan (axe-core, WCAG 2.1 A/AA) against the ${base} base`, () => {
    for (const [name, path, act] of PAGES) {
      test(name, async ({ app, page }) => {
        // two full-page axe scans; on the largest pages WebKit needs about a minute for them (Firefox about 20 s)
        test.slow();
        void app;
        await setTheme(page, theme);
        if (path !== '/visualizer') await page.goto(path);
        await page.waitForLoadState('networkidle');
        if (act) await act(page);
        expect(await applied(page)).toEqual({ theme: base, palette: theme });
        const named = await violations(page);
        await setTheme(page, base);
        const reference = await violations(page);
        expect(named.filter(v => !reference.includes(v)), `issues that only ${theme} has`).toEqual([]);
      });
    }

    test('sign-in page', async ({ app, page }) => {
      test.slow(); // two full-page axe scans, as above
      void app;
      await setTheme(page, theme);
      await page.locator('#header-profile-btn').click();
      await page.getByRole('button', { name: 'Sign Out' }).click();
      await expect(page).toHaveURL(/\/auth/);
      expect((await applied(page)).palette).toBe(theme);
      const named = await violations(page);
      await setTheme(page, base);
      const reference = await violations(page);
      expect(named.filter(v => !reference.includes(v)), `issues that only ${theme} has`).toEqual([]);
    });
  });
}

test.describe('named themes: components follow the theme', () => {
  test('charts take each theme’s colours and switch with it', async ({ app, page }) => {
    await app.next();
    await page.goto('/practice');
    await page.locator('[data-problem="p4"]').getByRole('button', { name: 'Practice Now' }).click();
    await page.locator('#practice-submit-btn').click();
    await expect(page.getByTestId('submission-verdict')).toBeVisible();
    await page.goto('/dashboard');
    const barFills = async () => [...new Set(await page.locator('.recharts-bar-rectangle path').evaluateAll(els => els.map(e => e.getAttribute('fill'))))].sort();
    await expect.poll(barFills).toEqual(['#38BDF8', '#F59E0B']);
    await setTheme(page, 'galaxy');
    await expect.poll(barFills).toEqual(['#C3A0FE', '#F59E0B']);
    await setTheme(page, 'sunset');
    await expect.poll(barFills).toEqual(['#2563EB', '#C56138']);
  });

  test('the Playground trace, editor and output panes use the theme surfaces in every theme', async ({ app, page }) => {
    void app;
    await page.goto('/playground');
    await visualizeFactorial(page);
    const read = async () => ({
      page: await bodyBackground(page),
      stdout: await normalize(page, await page.getByTestId('trace-stdout').evaluate(e => getComputedStyle(e).backgroundColor)),
      active: await normalize(page, await page.locator('[data-testid="trace-code"] li[data-active="true"]').evaluate(e => getComputedStyle(e).backgroundColor)),
    });
    const seen = new Map<string, Awaited<ReturnType<typeof read>>>();
    for (const t of THEMES) {
      await setTheme(page, t.id);
      seen.set(t.id, await read());
    }
    // every theme paints the page and the output pane in its own colours
    for (const part of ['page', 'stdout'] as const) {
      expect(new Set([...seen.values()].map(v => v[part])).size, part).toBe(4);
    }
    // the active line is a translucent accent: cyan in Midnight Neon and Arctic Light (the same colour, over different
    // pages), lavender in Purple Galaxy and coral in Sunset Warm
    const active = (id: ThemeId) => seen.get(id)!.active;
    expect(active('light')).toBe(active('dark'));
    expect(new Set([active('dark'), active('galaxy'), active('sunset')]).size).toBe(3);
  });

  for (const t of THEMES) {
    test(`phone width (390): no horizontal scroll and the theme picker fits (${t.name})`, async ({ app, page }) => {
      void app;
      await page.setViewportSize({ width: 390, height: 844 });
      await setTheme(page, t.id);
      await page.goto('/playground');
      await visualizeFactorial(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      const box = (await headerTheme(page).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    });
  }
});
