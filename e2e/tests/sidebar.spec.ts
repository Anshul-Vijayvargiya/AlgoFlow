import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { ALGORITHM_NAV } from '../../src/data/algorithmMetadata';

/**
 * The algorithm sidebar's search field and its collapse/expand toggle, through the real UI: filtering as you type
 * (case-insensitive, by name), selecting a result, clearing, "No algorithms found", locked algorithms, the toggle's
 * labels / state / keyboard use, the space it gives the visualizer, the unchanged top navigation, the mobile drawer,
 * and axe scans of each state.
 */
const search = (page: Page) => page.getByTestId('sidebar-search');
const toggle = (page: Page) => page.getByTestId('sidebar-toggle');
/** the algorithm buttons shown in a sidebar (not its toggle) */
const algorithmButtons = (sidebar: Locator) => sidebar.locator('button:not([data-testid])');
const shownNames = async (sidebar: Locator) =>
  (await algorithmButtons(sidebar).allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
const settle = (page: Page) =>
  page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('sidebar search', () => {
  test('a search field with a magnifying glass sits under the ALGORITHMS heading and its description; no shortcut hint', async ({ app }) => {
    const sb = app.sidebar;
    await expect(search(app.page)).toHaveAttribute('placeholder', 'Search algorithms...');
    await expect(sb.getByRole('searchbox', { name: 'Search algorithms' })).toBeVisible();
    const heading = (await sb.getByRole('heading', { name: 'ALGORITHMS' }).boundingBox())!;
    const description = (await sb.getByText('Select an algorithm to visualize step-by-step').boundingBox())!;
    const field = (await search(app.page).boundingBox())!;
    expect(description.y).toBeGreaterThan(heading.y);
    expect(field.y).toBeGreaterThan(description.y + description.height - 1);
    expect(await sb.locator('svg.lucide-search').count()).toBe(1);
    await expect(sb).not.toContainText(/Ctrl\s*\+\s*K|⌘\s*K/);
  });

  test('typing filters as you go, by name, case-insensitively; categories keep their labels and full counts', async ({ app }) => {
    const sb = app.sidebar;
    expect(await shownNames(sb)).toEqual(ALGORITHM_NAV.map(a => a.name));

    await search(app.page).fill('qu');
    expect(await shownNames(sb)).toEqual(ALGORITHM_NAV.filter(a => a.name.toLowerCase().includes('qu')).map(a => a.name));
    await search(app.page).fill('QUICK');
    expect(await shownNames(sb)).toEqual(['Quick Sort']);
    await search(app.page).fill('qUiCk SoRt');
    expect(await shownNames(sb)).toEqual(['Quick Sort']);

    // a query spanning categories: only the categories with matches are shown, with their unchanged counts
    await search(app.page).fill('search');
    const expected = ALGORITHM_NAV.filter(a => /search/i.test(a.name)).map(a => a.name);
    expect(await shownNames(sb)).toEqual(expected);
    await expect(sb).toContainText('SEARCHING');
    await expect(sb).toContainText('LINKED LIST');
    await expect(sb).not.toContainText('SORTING');
    const searching = ALGORITHM_NAV.filter(a => a.category === 'SEARCHING');
    await expect(sb).toContainText(`${searching.filter(a => a.implemented).length}/${searching.length}`);
    // the result count is announced to screen readers
    await expect(sb.getByRole('status')).toHaveText(`${expected.length} algorithms found`);
  });

  test('clicking a result selects it and opens its visualizer, as the full list does', async ({ app }) => {
    await search(app.page).fill('binary');
    await algorithmButtons(app.sidebar).getByText('Binary Search').click();
    await expect(app.heading).toHaveText('Binary Search');
    await expect(app.targetInput).toBeVisible();
    await expect(app.stepCounter).toHaveAttribute('data-step', '1');
    // the query stays, so another match can be picked
    await expect(search(app.page)).toHaveValue('binary');
  });

  test('clearing the field restores the full list', async ({ app }) => {
    await search(app.page).fill('heap');
    expect(await shownNames(app.sidebar)).toEqual(['Heap Sort']);
    await search(app.page).fill('');
    expect(await shownNames(app.sidebar)).toEqual(ALGORITHM_NAV.map(a => a.name));
    await expect(app.sidebar.getByRole('status')).toHaveCount(0);
  });

  test('no match: a clean "No algorithms found" message and no buttons', async ({ app }) => {
    await search(app.page).fill('zzzz');
    await expect(app.sidebar.getByRole('status')).toHaveText('No algorithms found');
    await expect(app.sidebar.getByRole('status')).toBeVisible();
    await expect(algorithmButtons(app.sidebar)).toHaveCount(0);
  });

  test('a locked (not yet implemented) algorithm found by search behaves as in the full list', async ({ app }) => {
    const locked = ALGORITHM_NAV.find(a => !a.implemented)!;
    await search(app.page).fill(locked.name.toLowerCase());
    const button = algorithmButtons(app.sidebar).getByText(locked.name, { exact: true });
    await expect(button.locator('..').locator('svg.lucide-lock')).toHaveCount(1);
    await button.click();
    await expect(app.heading).toHaveText(locked.name);
    await expect(app.page.getByText(/COMING SOON/)).toBeVisible();
    await expect(app.stepCounter).toHaveCount(0);
  });
});

test.describe('sidebar collapse / expand', () => {
  test('the toggle collapses the sidebar to a rail and expands it again; labels and state follow', async ({ app, page }) => {
    const sb = app.sidebar;
    await expect(toggle(page)).toHaveAccessibleName('Collapse sidebar');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await search(page).fill('two');

    await toggle(page).click();
    await settle(page);
    await expect(toggle(page)).toHaveAccessibleName('Expand sidebar');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page).locator('svg.lucide-chevron-right')).toHaveCount(1);
    expect((await sb.boundingBox())!.width).toBeLessThanOrEqual(50);
    // the content is hidden, not just covered: the search field and algorithms cannot be reached
    await expect(search(page)).toBeHidden();
    await expect(algorithmButtons(sb).first()).toBeHidden();
    await expect(toggle(page)).toBeVisible();

    await toggle(page).click();
    await settle(page);
    await expect(toggle(page)).toHaveAccessibleName('Collapse sidebar');
    await expect(toggle(page).locator('svg.lucide-chevron-left')).toHaveCount(1);
    expect((await sb.boundingBox())!.width).toBeGreaterThan(250);
    // nothing is lost: the query and its results are still there
    await expect(search(page)).toHaveValue('two');
    expect(await shownNames(sb)).toEqual(ALGORITHM_NAV.filter(a => /two/i.test(a.name)).map(a => a.name));
  });

  test('keyboard: the toggle is reachable and works with Enter and Space; focus stays on it; Tab skips hidden content', async ({ app, page }) => {
    void app;
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page)).toBeFocused();
    // collapsed, at once (no waiting for the fade): the next Tab stop is past the sidebar, never a hidden control
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('aside') === null)).toBe(true);
    await toggle(page).focus();
    await page.keyboard.press('Space');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle(page)).toBeFocused();
  });

  test('collapsing gives the width to the visualizer; the top navigation does not change', async ({ app, page }) => {
    const nav = page.locator('header');
    const navBefore = { box: await nav.boundingBox(), text: await nav.innerText() };
    const workspace = page.getByRole('region', { name: 'Visualizer workspace' });
    const before = (await workspace.boundingBox())!.width;
    const barsBefore = (await page.getByTestId('array-visualizer').boundingBox())!.width;

    await toggle(page).click();
    await settle(page);
    const after = (await workspace.boundingBox())!.width;
    expect(after - before).toBeGreaterThan(190);
    expect((await page.getByTestId('array-visualizer').boundingBox())!.width).toBeGreaterThan(barsBefore);
    // the bars, the input and the code panel still fit their columns
    const chart = (await page.getByTestId('array-visualizer').boundingBox())!;
    for (const bar of await page.locator('[data-bar-index]').all()) {
      const b = (await bar.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(chart.x);
      expect(b.x + b.width).toBeLessThanOrEqual(chart.x + chart.width);
    }
    await expect(app.arrayInput).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    expect({ box: await nav.boundingBox(), text: await nav.innerText() }).toEqual(navBefore);
    await toggle(page).click();
    await settle(page);
    expect((await workspace.boundingBox())!.width).toBeCloseTo(before, 0);
    expect({ box: await nav.boundingBox(), text: await nav.innerText() }).toEqual(navBefore);
  });

  test('tablet width: the toggle works and the visualizer takes the space', async ({ app, page }) => {
    void app;
    await page.setViewportSize({ width: 820, height: 1000 });
    const workspace = page.getByRole('region', { name: 'Visualizer workspace' });
    const before = (await workspace.boundingBox())!.width;
    await toggle(page).click();
    await settle(page);
    expect((await workspace.boundingBox())!.width - before).toBeGreaterThan(190);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('mobile drawer', () => {
  test('phone width: the drawer has the search and no collapse toggle; a result selects and closes the drawer', async ({ app, page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.getByRole('button', { name: 'Open algorithm list' }).click();
    const drawer = page.getByRole('dialog', { name: 'Algorithm list' });
    // the drawer's sidebar (the drawer also has its own close button, outside it)
    const drawerSidebar = drawer.getByRole('complementary');
    await expect(drawer.getByTestId('sidebar-toggle')).toHaveCount(0);
    await drawerSidebar.getByRole('searchbox', { name: 'Search algorithms' }).fill('LIST');
    expect(await shownNames(drawerSidebar)).toEqual(ALGORITHM_NAV.filter(a => /list/i.test(a.name)).map(a => a.name));
    await algorithmButtons(drawerSidebar).getByText('Traverse Linked List').click();
    await expect(drawer).toHaveCount(0);
    await expect(app.heading).toHaveText('Traverse Linked List');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('accessibility (axe, WCAG 2.1 A/AA)', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`${theme} theme: searching, no results, and collapsed`, async ({ app, page }) => {
      void app;
      await page.locator('#header-theme-select').selectOption(theme);
      await settle(page);
      await search(page).fill('sort');
      expect(await violations(page), 'searching').toEqual([]);
      await search(page).fill('zzzz');
      expect(await violations(page), 'no results').toEqual([]);
      await search(page).fill('');
      await toggle(page).click();
      await settle(page);
      expect(await violations(page), 'collapsed').toEqual([]);
    });
  }
});
