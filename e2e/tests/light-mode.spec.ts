import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * Light Mode styling (Phase 3): every page and the key interactive states pass the axe-core WCAG 2.1 A/AA scan in the
 * light theme; surfaces are light and readable; charts, the visualizer and the code panel follow the theme; switching
 * back to dark restores the exact dark colours. Each test takes the `app` fixture so that it opens /visualizer first.
 */

async function setTheme(page: Page, theme: 'light' | 'dark' | 'system') {
  // the header picker, or the sign-in page's (selectOption needs no click, so it also works behind an open dialog)
  await page.locator('#header-theme-select, #auth-theme-select').first().selectOption(theme);
  // let colour transitions (transition-colors) finish before anything is measured
  // transitions only (looping CSS animations such as pulse never finish); a transition replaced mid-way rejects its
  // finished promise, hence allSettled
  await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
}

/** axe-core WCAG 2.1 A/AA violations, one "rule | target" entry per failing element */
async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

/**
 * A computed colour as "rgba(r, g, b, a)" in sRGB. Browsers report colours mixed with opacity (bg-page/90 →
 * color-mix) in oklab, so every value is normalised by painting it on a 1×1 canvas.
 */
const normalize = (page: Page, css: string) =>
  page.evaluate(c => {
    const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d')!;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
  }, css);
const styleOf = async (page: Page, selector: string, prop: 'backgroundColor' | 'color' | 'borderTopColor') =>
  normalize(page, await page.locator(selector).first().evaluate((e, p) => getComputedStyle(e)[p], prop));
const styleOfLocator = async (page: Page, loc: Locator, prop: 'backgroundColor' | 'color' | 'borderTopColor') =>
  normalize(page, await loc.evaluate((e, p) => getComputedStyle(e)[p], prop));
const bg = (page: Page, selector: string) => styleOf(page, selector, 'backgroundColor');
const color = (page: Page, selector: string) => styleOf(page, selector, 'color');

/** two normalised colours equal within one unit per channel (colour-mix rounding) */
const close = (a: string, b: string) => {
  const [x, y] = [a, b].map(c => c.match(/[\d.]+/g)!.map(Number));
  return x.every((v, i) => Math.abs(v - y[i]) <= (i === 3 ? 0.01 : 1));
};

/** WCAG contrast of two normalised colours; a translucent colour is first composited over white (the light canvas) */
function contrast(a: string, b: string) {
  const opaque = (c: string) => {
    const [r, g, bl, al] = c.match(/[\d.]+/g)!.map(Number);
    return [r, g, bl].map(v => v * al + 255 * (1 - al));
  };
  const lum = (c: string) => {
    const [r, g, bl] = opaque(c).map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/*
 * Some pages have accessibility problems in BOTH themes that predate Light Mode (unlabelled selects / icon buttons on
 * Practice, Playground, Settings and the AI tutor; deliberately dim footer and "locked" roadmap text). Light Mode must
 * not add any: on every page the light scan may only report what the dark scan reports on the same page. Pages that
 * are clean in light must stay clean.
 */
const CLEAN_IN_LIGHT = new Set(['visualizer: Quick Sort mid-trace (compare, pivot, code line)', 'visualizer: linked list with a node outside the list',
  'visualizer: search found (MATCH, outcome banner)', 'visualizer: invalid input message', 'dashboard (charts)', 'patterns', 'notes',
  'progress (charts)', 'profile menu open']);

test.describe('Light Mode — accessibility scan (axe-core, WCAG 2.1 A/AA)', () => {
  const PAGES: [string, string, ((page: Page) => Promise<void>)?][] = [
    ['visualizer: Quick Sort mid-trace (compare, pivot, code line)', '/visualizer', async page => {
      await page.getByRole('complementary').getByRole('button', { name: /^Quick Sort/ }).click();
      for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /Next/ }).click();
    }],
    ['visualizer: linked list with a node outside the list', '/visualizer', async page => {
      await page.getByRole('complementary').getByRole('button', { name: /^Delete at Position/ }).click();
      for (let i = 0; i < 9; i++) await page.getByRole('button', { name: /Next/ }).click();
    }],
    ['visualizer: search found (MATCH, outcome banner)', '/visualizer', async page => {
      await page.getByRole('complementary').getByRole('button', { name: /^Search Linked List/ }).click();
      for (let i = 0; i < 24; i++) {
        const next = page.getByRole('button', { name: /Next/ });
        if (await next.isDisabled()) break;
        await next.click();
      }
    }],
    ['visualizer: invalid input message', '/visualizer', async page => {
      await page.getByRole('complementary').getByRole('button', { name: /^Binary Search/ }).click();
      await page.locator('#array-input').fill('5, 1, 4');
      await expect(page.getByTestId('input-error')).toBeVisible();
    }],
    ['dashboard (charts)', '/dashboard'],
    ['practice', '/practice'],
    ['playground', '/playground'],
    ['learning roadmap', '/learning'],
    ['patterns', '/patterns'],
    ['notes', '/notes'],
    ['progress (charts)', '/progress'],
    ['profile menu open', '/visualizer', async page => {
      await page.locator('#header-profile-btn').click();
      await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
    }],
    ['settings dialog open', '/visualizer', async page => {
      await page.locator('#header-profile-btn').click();
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByRole('group', { name: 'Interface Theme' })).toBeVisible();
    }],
  ];

  for (const [name, path, act] of PAGES) {
    test(name, async ({ app, page }) => {
      void app;
      await setTheme(page, 'light');
      if (path !== '/visualizer') await page.goto(path);
      await page.waitForLoadState('networkidle');
      if (act) await act(page);
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
      const light = await violations(page);
      if (CLEAN_IN_LIGHT.has(name)) expect(light).toEqual([]);
      await setTheme(page, 'dark');
      const dark = await violations(page);
      expect(light.filter(v => !dark.includes(v)), 'issues that only Light Mode has').toEqual([]);
    });
  }

  test('sign-in page', async ({ app, page }) => {
    void app;
    await setTheme(page, 'light');
    await page.locator('#header-profile-btn').click();
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/auth/);
    const light = await violations(page);
    await setTheme(page, 'dark');
    const dark = await violations(page);
    expect(light.filter(v => !dark.includes(v)), 'issues that only Light Mode has').toEqual([]);
  });
});

test.describe('Light Mode — surfaces, components and switching back', () => {
  test('light page and panel surfaces with dark text; dark restores the exact original colours', async ({ app, page }) => {
    void app;
    const read = async () => ({
      page: await bg(page, 'body'),
      text: await color(page, 'body'),
      panel: await bg(page, '[role="region"][aria-label="Visualization"]'),
      header: await bg(page, 'header'),
      heading: await color(page, 'h1'),
    });
    const dark = await read();
    expect(dark).toEqual({
      page: 'rgba(7, 10, 18, 1)',
      text: 'rgba(226, 232, 240, 1)',
      panel: 'rgba(11, 15, 25, 1)',
      header: dark.header, // checked below: browsers round the compiled oklab value differently (Firefox: 6, 9, 17)
      heading: 'rgba(255, 255, 255, 1)',
    });
    expect(close(dark.header, 'rgba(7, 10, 18, 0.9)')).toBe(true);
    await setTheme(page, 'light');
    const light = await read();
    expect(light).toEqual({
      page: 'rgba(248, 250, 252, 1)',
      text: 'rgba(15, 23, 42, 1)',
      panel: 'rgba(255, 255, 255, 1)',
      header: light.header, // checked below: oklab mixing can round a channel by one
      heading: 'rgba(15, 23, 42, 1)',
    });
    expect(close(light.header, 'rgba(248, 250, 252, 0.9)')).toBe(true);
    await setTheme(page, 'dark');
    expect(await read()).toEqual(dark);
  });

  test('System with a light OS gives the light surfaces', async ({ app, page }) => {
    void app;
    await page.emulateMedia({ colorScheme: 'light' });
    await setTheme(page, 'system');
    expect(await bg(page, 'body')).toBe('rgba(248, 250, 252, 1)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => bg(page, 'body')).toBe('rgba(7, 10, 18, 1)');
  });

  test('array bars, labels and the code line stay readable', async ({ app, page }) => {
    void app;
    await setTheme(page, 'light');
    await page.getByRole('complementary').getByRole('button', { name: /^Quick Sort/ }).click();
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /Next/ }).click();
    const canvas = await bg(page, '[data-testid="array-visualizer"] > div');
    expect(contrast(canvas, 'rgba(255, 255, 255, 1)')).toBeLessThan(1.1); // a light plot area
    // the COMPARE badge text and the active code line are readable
    const badge = page.getByText('COMPARE', { exact: true }).first();
    expect(contrast(await styleOfLocator(page, badge, 'color'), await styleOfLocator(page, badge, 'backgroundColor'))).toBeGreaterThan(4.5);
    const line = page.locator('[data-line][aria-current="step"] pre');
    expect(contrast(await styleOfLocator(page, line, 'color'), 'rgba(255, 255, 255, 1)')).toBeGreaterThan(4.5);
  });

  test('linked-list nodes, arrows, HEAD / TAIL and pointers are visible on the light canvas', async ({ app, page }) => {
    void app;
    await setTheme(page, 'light');
    await page.getByRole('complementary').getByRole('button', { name: /^Delete at Position/ }).click();
    for (let i = 0; i < 9; i++) await page.getByRole('button', { name: /Next/ }).click();
    const node = page.locator('[data-testid="list-chain"] [data-list-node]').first();
    const nodeText = await styleOfLocator(page, node, 'color');
    const nodeBorder = await styleOfLocator(page, node, 'borderTopColor');
    expect(contrast(nodeText, 'rgba(255, 255, 255, 1)')).toBeGreaterThan(4.5);
    expect(contrast(nodeBorder, 'rgba(255, 255, 255, 1)')).toBeGreaterThan(3); // the box outline: non-text 3:1
    const arrow = page.locator('[data-arrow-from] svg').first();
    expect(contrast(await styleOfLocator(page, arrow, 'color'), 'rgba(255, 255, 255, 1)')).toBeGreaterThan(3); // non-text 3:1
    for (const chip of ['[data-end-chip="HEAD"]', '[data-end-chip="TAIL"]', '[data-list-pointer]']) {
      const c = page.locator(chip).first();
      expect(contrast(await styleOfLocator(page, c, 'color'), await styleOfLocator(page, c, 'backgroundColor')), chip).toBeGreaterThan(4.5);
    }
    await expect(page.locator('[data-arrow-from][data-changed="true"]')).toHaveText('new link');
  });

  test('charts use the theme colours and switch with it', async ({ app, page }) => {
    void app;
    await page.goto('/dashboard');
    const barFill = () => page.locator('.recharts-bar-rectangle path').first().getAttribute('fill');
    const axisStroke = () => page.locator('.recharts-xAxis .recharts-cartesian-axis-line').first().getAttribute('stroke');
    await expect.poll(barFill).toBe('#38BDF8');
    expect(await axisStroke()).toBe('#64748B');
    await setTheme(page, 'light');
    await expect.poll(barFill).toBe('#0284C7');
    expect(await axisStroke()).toBe('#475569');
    await setTheme(page, 'dark');
    await expect.poll(barFill).toBe('#38BDF8');
  });

  test('the settings dialog, inputs and the theme select work in light mode', async ({ app, page }) => {
    void app;
    await setTheme(page, 'light');
    await page.locator('#header-profile-btn').click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialogPanel = page.getByRole('group', { name: 'Interface Theme' }).locator('xpath=ancestor::div[contains(@class,"rounded-3xl")]');
    expect(await styleOfLocator(page, dialogPanel, 'backgroundColor')).toBe('rgba(255, 255, 255, 1)');
    const name = page.locator('input').first();
    await name.fill('Light Tester');
    expect(contrast(await styleOfLocator(page, name, 'color'), await styleOfLocator(page, name, 'backgroundColor'))).toBeGreaterThan(4.5);
    await page.getByRole('group', { name: 'Interface Theme' }).getByRole('button', { name: 'Dark' }).click();
    expect(await bg(page, 'body')).toBe('rgba(7, 10, 18, 1)');
  });
});
