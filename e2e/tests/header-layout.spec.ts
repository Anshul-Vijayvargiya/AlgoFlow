import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * The top header at phone, tablet and desktop widths: it never overflows the viewport (at 1024px the full navigation
 * once needed 1150px), every link and control stays inside it and keeps its accessible name, and the compact tiers
 * (no nav icons below 1400px; logo-only brand and avatar-only profile from 1024 to 1279px; on phones a short language
 * label, so the full "AlgoFlow" name fits from 360px) apply exactly where meant.
 *
 * Which tier applies is read from the browser's own media queries: Playwright's WebKit on Windows has a 6px classic
 * scrollbar and evaluates them on the width without it, so at exactly 1024px it is still in the tablet tier. Where
 * there is no classic scrollbar (Chromium, Firefox, macOS Safari), the tiers must match the pixel widths exactly.
 */
const NAV = ['Dashboard', 'Visualizer', 'Practice', 'Playground', 'Roadmap', 'Patterns', 'Notes', 'Progress'];
const PAGES = ['/dashboard', '/visualizer', '/practice', '/patterns', '/notes'];

/** the header's boxes, read in one pass */
function headerReport(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const header = document.querySelector('header')!;
    const shown = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    };
    const outside = [...header.querySelectorAll('a[href], button, select')]
      .filter(shown)
      .filter(e => { const r = e.getBoundingClientRect(); return r.left < -0.5 || r.right > vw + 0.5; })
      .map(e => `${(e.getAttribute('aria-label') ?? e.textContent ?? e.tagName).trim().slice(0, 20)} ${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}`);
    const logo = header.querySelector('a[href="/dashboard"] > div')!.getBoundingClientRect();
    const nav = header.querySelector('nav');
    const media = (q: string) => matchMedia(q).matches;
    return {
      vw,
      /** a classic (space-taking) scrollbar's width; 0 with overlay scrollbars */
      scrollbar: vw - document.documentElement.clientWidth,
      tier: { lg: media('(width >= 64rem)'), xl: media('(width >= 80rem)'), wide: !media('(width < 1400px)') },
      documentOverflow: document.documentElement.scrollWidth - vw,
      headerOverflow: header.scrollWidth - header.clientWidth,
      outside,
      logoWidth: Math.round(logo.width),
      navShown: !!nav && shown(nav),
      navIcons: nav ? [...nav.querySelectorAll('svg')].filter(shown).length : 0,
      /** the "AlgoFlow" name is drawn in full: visible, and not cut short by truncation */
      brandTextShown: [...header.querySelectorAll('a[href="/dashboard"] span')].some(
        s => s.textContent === 'AlgoFlow' && s.getBoundingClientRect().width > 1 && s.scrollWidth <= s.clientWidth + 0.5
      ),
    };
  });
}

test.describe('header at every width', () => {
  for (const width of [360, 390, 768, 820, 1000, 1024, 1100, 1180, 1279, 1280, 1366, 1399, 1400, 1440, 1920]) {
    test(`${width}px: no overflow, every control inside the viewport, the right tier`, async ({ app, page }) => {
      void app;
      await page.setViewportSize({ width, height: 900 });
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.getByRole('banner')).toBeVisible();
        const r = await headerReport(page);
        expect(r.headerOverflow, `${path}: header overflow`).toBeLessThanOrEqual(0);
        expect(r.documentOverflow, `${path}: page overflow`).toBeLessThanOrEqual(0);
        expect(r.outside, `${path}: controls outside the viewport`).toEqual([]);
        expect(r.logoWidth, `${path}: the logo keeps its size`).toBe(36);
        if (r.scrollbar === 0) expect(r.tier, `${path}: tiers at ${width}px`).toEqual({ lg: width >= 1024, xl: width >= 1280, wide: width >= 1400 });
        expect(r.navShown, `${path}: navigation shown`).toBe(r.tier.lg);
        if (r.tier.lg) expect(r.navIcons, `${path}: nav icons`).toBe(r.tier.wide ? NAV.length : 0);
        // the full name on phones and tablets (from 360px) and from 1280px; logo only beside the compact navigation
        expect(r.brandTextShown, `${path}: brand name shown in full`).toBe(!r.tier.lg || r.tier.xl);
      }
    });
  }
});

test.describe('widest profile: a long name (clipped at 80px) and the admin badge', () => {
  test('still no overflow at the edge of every tier', async ({ app, page }) => {
    void app;
    await page.addInitScript(() => {
      localStorage.setItem('algoflow_user', JSON.stringify({
        id: 'u-wide', name: 'Maximiliano-Alexander Wolfeschlegel', email: 'wide@algoflow.io', streakDays: 1, solvedCount: 1,
        algorithmsLearned: 0, progressPercent: 0, role: 'SUPER_ADMIN', accountStatus: 'active',
      }));
    });
    for (const width of [1024, 1279, 1280, 1399, 1400, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/visualizer');
      await expect(page.locator('#header-profile-btn [title="Admin"]')).toBeVisible();
      const r = await headerReport(page);
      expect(r.headerOverflow, `${width}px header overflow`).toBeLessThanOrEqual(0);
      expect(r.outside, `${width}px`).toEqual([]);
      expect(r.logoWidth, `${width}px logo`).toBe(36);
    }
  });
});

test.describe('phones', () => {
  for (const width of [360, 390]) {
    test(`${width}px: the full brand name; the language is a short label over a working, named select`, async ({ app, page }) => {
      void app;
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/visualizer');
      const banner = page.getByRole('banner');
      await expect(banner).toBeVisible();
      expect((await headerReport(page)).brandTextShown).toBe(true);
      await expect(banner.getByRole('link', { name: /AlgoFlow/ })).toBeVisible();

      const short = page.getByTestId('header-language-short');
      const select = banner.getByRole('combobox', { name: 'Programming language' });
      await expect(short).toHaveText('C++');
      for (const [value, label] of [['python', 'Py'], ['java', 'Java'], ['c', 'C'], ['cpp', 'C++']]) {
        await select.selectOption(value);
        await expect(short).toHaveText(label);
        await expect(select).toHaveValue(value);
      }
      // the transparent select covers the whole label inside its 1px border, so a tap reaches it
      const [s, l] = [(await select.boundingBox())!, (await short.locator('..').boundingBox())!];
      expect(s.x - l.x).toBeCloseTo(1, 0);
      expect(l.x + l.width - (s.x + s.width)).toBeCloseTo(1, 0);
      expect(l.height - s.height).toBeCloseTo(2, 0);
      expect(s.width).toBeGreaterThanOrEqual(24);

      // every control is still there, named, and at least 24px tall and wide
      for (const control of [
        banner.getByRole('button', { name: 'AI Tutor' }),
        banner.getByRole('combobox', { name: 'Theme' }),
        select,
        page.locator('#header-profile-btn'),
      ]) {
        const box = (await control.boundingBox())!;
        expect(box.width >= 24 && box.height >= 24, `${await control.getAttribute('id')}`).toBe(true);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await page.locator('#header-profile-btn').click();
      await expect(page.locator('#header-settings-btn')).toBeVisible();
    });
  }

  test('360px, admin with a long name: the name still fits; the badge moves to the menu only', async ({ app, page }) => {
    void app;
    await page.addInitScript(() => {
      localStorage.setItem('algoflow_user', JSON.stringify({
        id: 'u-wide', name: 'Maximiliano-Alexander Wolfeschlegel', email: 'wide@algoflow.io', streakDays: 1, solvedCount: 1,
        algorithmsLearned: 0, progressPercent: 0, role: 'SUPER_ADMIN', accountStatus: 'active',
      }));
    });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/dashboard');
    await expect(page.locator('#header-profile-btn')).toBeVisible();
    const r = await headerReport(page);
    expect(r.brandTextShown).toBe(true);
    expect(r.headerOverflow).toBeLessThanOrEqual(0);
    expect(r.outside).toEqual([]);
    await expect(page.locator('#header-profile-btn [title="Admin"]')).toBeHidden();
    await page.locator('#header-profile-btn').click();
    await expect(page.locator('#header-admin-console-btn')).toBeVisible();
  });
});

// widths well inside each tier (1024 itself is covered above), so every browser is in the tier the test names
test.describe('names and links are kept in the compact tiers', () => {
  for (const width of [1040, 1300, 1440]) {
    test(`${width}px: all eight links, the brand and the profile keep their names and work`, async ({ app, page }) => {
      void app;
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/dashboard');
      const banner = page.getByRole('banner');
      const nav = banner.getByRole('navigation');
      for (const name of NAV) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
      await expect(banner.getByRole('link', { name: /AlgoFlow/ })).toBeVisible();
      await expect(banner.getByRole('button', { name: 'AI Tutor' })).toBeVisible();
      await expect(banner.getByRole('combobox', { name: 'Theme' })).toBeVisible();
      await expect(banner.getByRole('combobox', { name: 'Programming language' })).toBeVisible();
      const profile = page.locator('#header-profile-btn');
      await expect(profile).toBeVisible();
      expect((await profile.textContent())?.trim()).not.toBe('');
      await expect(profile).toHaveAccessibleName(/\S{2,}/);

      await nav.getByRole('link', { name: 'Notes', exact: true }).click();
      await expect(page).toHaveURL(/\/notes$/);
      await expect(nav.getByRole('link', { name: 'Notes', exact: true })).toHaveClass(/text-cyan-300/);
      await banner.getByRole('link', { name: /AlgoFlow/ }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  }

  test('1040px: the profile shows its avatar only, with the name kept for screen readers; the menu still opens', async ({ app, page }) => {
    void app;
    await page.setViewportSize({ width: 1040, height: 900 });
    await page.goto('/dashboard');
    const profile = page.locator('#header-profile-btn');
    const visibleName = profile.locator('span.truncate');
    await expect(visibleName).toBeHidden();
    const name = (await visibleName.textContent())!.trim();
    await expect(profile).toHaveAccessibleName(new RegExp(name));
    await profile.click();
    await expect(page.locator('#header-settings-btn')).toBeVisible();
    // the open menu stays inside the viewport too
    const menu = (await page.locator('#header-settings-btn').boundingBox())!;
    expect(menu.x + menu.width).toBeLessThanOrEqual(1040);
  });
});
