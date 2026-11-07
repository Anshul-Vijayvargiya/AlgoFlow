import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * The Revision List on the mock API: the bookmark, the page, the badge, and how they stay in step. The server's rules
 * (persistence across sign-in, isolation, authorization) are covered against the real API in e2e/real/revision.spec.ts.
 */
const bookmark = (page: Page) => page.getByTestId('revision-bookmark');
const form = (page: Page) => page.getByTestId('revision-form');
const cards = (page: Page) => page.getByTestId('revision-card');
const card = (page: Page, id: string) => page.locator(`[data-testid="revision-card"][data-algorithm="${id}"]`);
const badge = (page: Page) => page.getByRole('navigation').getByTestId('revision-badge');
const nav = (page: Page) => page.getByRole('banner').getByRole('navigation');
const stored = (page: Page) =>
  page.evaluate(() => {
    const owner = JSON.parse(localStorage.getItem('algoflow_user') ?? '{"id":"u1"}').id;
    return (JSON.parse(localStorage.getItem('algoflow_revisions') ?? '{}')[owner] ?? []) as { algorithmId: string; status: string; reason?: string }[];
  });

/** stores records on the device (newest first), then opens the page */
async function openWith(page: Page, records: { algorithmId: string; status?: string; reason?: string }[]) {
  await page.evaluate(list => {
    const owner = JSON.parse(localStorage.getItem('algoflow_user') ?? '{"id":"u1"}').id;
    const at = '2026-11-01T00:00:00.000Z';
    localStorage.setItem('algoflow_revisions', JSON.stringify({ [owner]: list.map(r => ({ status: 'pending', createdAt: at, updatedAt: at, ...r })) }));
  }, records);
  await page.goto('/revision');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revision List');
}

const LIST = [
  { algorithmId: 'quick-sort', reason: 'forgot-the-logic' },
  { algorithmId: 'merge-sort', status: 'revised', revisedAt: '2026-11-02T00:00:00.000Z' },
  { algorithmId: 'binary-search', reason: 'interview-preparation' },
];

async function markCurrent(page: Page, reason?: string) {
  await bookmark(page).click();
  if (reason) await form(page).getByRole('radio', { name: reason }).check();
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(bookmark(page)).toHaveAttribute('data-marked', 'true');
}

test.describe('Bookmark on the Visualizer', () => {
  test('marks without a reason: Mark for Revision becomes Added to Revision, and the badge counts it', async ({ app, page }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    await expect(bookmark(page)).toHaveAccessibleName('Mark for Revision');
    await expect(bookmark(page)).toContainText('Mark for Revision');
    await expect(badge(page)).toHaveCount(0);

    await bookmark(page).click();
    // nothing is saved until Save is pressed
    expect(await stored(page)).toEqual([]);
    for (const reason of ['Concept not clear', 'Forgot the logic', 'Need more practice', 'Interview preparation']) {
      await expect(form(page).getByRole('radio', { name: reason })).not.toBeChecked();
    }
    await form(page).getByRole('button', { name: 'Save' }).click();

    await expect(bookmark(page)).toHaveAccessibleName('Added to Revision');
    await expect(bookmark(page)).toContainText('Added to Revision');
    await expect(badge(page)).toHaveText('1');
    expect(await stored(page)).toMatchObject([{ algorithmId: 'bubble-sort', status: 'pending' }]);
  });

  test('marks with a reason; update it, then clear it; marking again never duplicates', async ({ page, app }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    await markCurrent(page, 'Forgot the logic');
    expect((await stored(page))[0].reason).toBe('forgot-the-logic');

    await bookmark(page).click();
    await expect(form(page).getByTestId('revision-form-status')).toHaveText('Status: Pending');
    await expect(form(page).getByRole('radio', { name: 'Forgot the logic' })).toBeChecked();
    await form(page).getByRole('radio', { name: 'Need more practice' }).check();
    await form(page).getByRole('button', { name: 'Update reason' }).click();
    await expect(form(page)).toHaveCount(0);
    expect(await stored(page)).toMatchObject([{ reason: 'need-more-practice' }]);

    await bookmark(page).click();
    await form(page).getByRole('radio', { name: 'No reason' }).check();
    await form(page).getByRole('button', { name: 'Update reason' }).click();
    await expect(form(page)).toHaveCount(0);
    const list = await stored(page);
    expect(list).toHaveLength(1);
    expect(list[0].reason).toBeUndefined();
    await expect(badge(page)).toHaveText('1');
  });

  test('Cancel and Escape save nothing; Escape returns focus to the bookmark', async ({ page, app }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    await bookmark(page).click();
    await form(page).getByRole('radio', { name: 'Forgot the logic' }).check();
    await form(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(form(page)).toHaveCount(0);

    await bookmark(page).click();
    await expect(form(page).getByRole('radio', { name: 'No reason' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(form(page)).toHaveCount(0);
    await expect(bookmark(page)).toBeFocused();
    expect(await stored(page)).toEqual([]);
  });

  test('Escape still closes the form after a click on a reason (Safari does not focus what is clicked)', async ({ page, app }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    await bookmark(page).click();
    await form(page).getByRole('radio', { name: 'Forgot the logic' }).click();
    await page.keyboard.press('Escape');
    await expect(form(page)).toHaveCount(0);
    await expect(bookmark(page)).toBeFocused();
    expect(await stored(page)).toEqual([]);
  });

  test('removes it from the Visualizer; status can be changed there too', async ({ page, app }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    await markCurrent(page);

    await bookmark(page).click();
    await form(page).getByRole('button', { name: 'Mark as Revised' }).click();
    await expect(badge(page)).toHaveCount(0);
    await bookmark(page).click();
    await expect(form(page).getByTestId('revision-form-status')).toHaveText('Status: Revised');
    await form(page).getByRole('button', { name: 'Revise Again' }).click();
    await expect(badge(page)).toHaveText('1');

    await bookmark(page).click();
    await form(page).getByRole('button', { name: 'Remove from Revision' }).click();
    await expect(bookmark(page)).toHaveAttribute('data-marked', 'false');
    await expect(badge(page)).toHaveCount(0);
    expect(await stored(page)).toEqual([]);
  });

  test('follows the selected algorithm, and leaves the visualization as it was', async ({ app, page }) => {
    await app.advance(3);
    const action = await page.getByTestId('current-action').textContent();
    await markCurrent(page);
    await expect(page.getByTestId('current-action')).toHaveText(action!);

    await app.selectAlgorithm('quick-sort');
    await expect(bookmark(page)).toHaveAttribute('data-marked', 'false');
    await app.selectAlgorithm('bubble-sort');
    await expect(bookmark(page)).toHaveAttribute('data-marked', 'true');
  });

  test('an algorithm that is coming soon can be marked too, and its Revise Now opens it', async ({ page, app }) => {
    await expect(app.heading).toBeVisible();
    await page.getByRole('button', { name: /^Jump Search/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jump Search');
    await markCurrent(page);
    await page.goto('/revision');
    await page.getByRole('link', { name: 'Revise Now: Jump Search' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jump Search');
  });
});

test.describe('Revision page', () => {
  test('nothing marked: friendly empty state with a link to the Visualizer, no counts', async ({ app, page }) => {
    void app;
    await page.goto('/revision');
    const empty = page.getByTestId('revision-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('Mark for Revision');
    await expect(page.getByTestId('revision-progress')).toHaveCount(0);
    await empty.getByRole('link', { name: 'Go to the Visualizer' }).click();
    await expect(page).toHaveURL(/\/visualizer$/);
  });

  test('title, subtitle, cards and counts from the data', async ({ app, page }) => {
    void app;
    await openWith(page, LIST);
    await expect(page.locator('main')).toContainText("Algorithms you've marked to revise later.");
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByTestId('revision-filter-all')).toHaveText('All (3)');
    await expect(page.getByTestId('revision-filter-pending')).toHaveText('Pending (2)');
    await expect(page.getByTestId('revision-filter-revised')).toHaveText('Revised (1)');
    await expect(page.getByTestId('revision-stat-pending')).toHaveText('2');
    await expect(page.getByTestId('revision-stat-revised')).toHaveText('1');
    await expect(page.getByTestId('revision-stat-total')).toHaveText('3');
    await expect(badge(page)).toHaveText('2');

    const quick = card(page, 'quick-sort');
    await expect(quick.getByRole('heading')).toHaveText('Quick Sort');
    await expect(quick).toContainText('Sorting');
    await expect(quick.getByTestId('revision-reason')).toHaveText('Reason: Forgot the logic');
    await expect(quick.getByTestId('revision-status')).toHaveText('Pending');
    await expect(card(page, 'merge-sort').getByTestId('revision-status')).toHaveText('Revised');
    await expect(card(page, 'merge-sort').getByTestId('revision-reason')).toHaveText('No reason given');
  });

  test('filters and search work together; the filter counts describe the whole list', async ({ app, page }) => {
    void app;
    await openWith(page, LIST);
    const ids = () => cards(page).evaluateAll(els => els.map(e => e.getAttribute('data-algorithm')));
    await page.getByTestId('revision-filter-pending').click();
    await expect(page.getByTestId('revision-filter-pending')).toHaveAttribute('aria-pressed', 'true');
    expect(await ids()).toEqual(['quick-sort', 'binary-search']);
    await page.getByTestId('revision-filter-revised').click();
    expect(await ids()).toEqual(['merge-sort']);

    const search = page.getByRole('searchbox', { name: 'Search by algorithm name' });
    await page.getByTestId('revision-filter-all').click();
    await search.fill('SORT');
    await expect(cards(page)).toHaveCount(2);
    await page.getByTestId('revision-filter-pending').click();
    expect(await ids()).toEqual(['quick-sort']);
    await expect(page.getByTestId('revision-filter-all')).toHaveText('All (3)');

    await search.fill('no such algorithm');
    await expect(page.getByTestId('revision-no-results')).toBeVisible();
    await expect(page.getByTestId('revision-empty')).toHaveCount(0);
    await search.fill('');
    await expect(cards(page)).toHaveCount(2);
  });

  test('Revise Now opens that algorithm in the Visualizer, with its bookmark marked', async ({ app, page }) => {
    void app;
    await openWith(page, LIST);
    await page.getByRole('link', { name: 'Revise Now: Binary Search' }).click();
    await expect(page).toHaveURL(/\/visualizer$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Binary Search');
    await expect(bookmark(page)).toHaveAccessibleName('Added to Revision');
    await expect(page.getByTestId('current-action')).toBeVisible();
  });

  test('Pending → Revised → Pending: the card stays, and the badge and counts follow', async ({ app, page }) => {
    void app;
    await openWith(page, [LIST[0]]);
    const quick = card(page, 'quick-sort');
    await expect(badge(page)).toHaveText('1');
    await quick.getByRole('button', { name: 'Mark as Revised: Quick Sort' }).click();

    await expect(quick).toHaveAttribute('data-status', 'revised');
    // the button pressed has gone: the keyboard stays on this card
    await expect(quick.getByRole('button', { name: 'Revise Again: Quick Sort' })).toBeFocused();
    await expect(quick.getByRole('link', { name: /Revise Now/ })).toHaveCount(0);
    await expect(badge(page)).toHaveCount(0);
    await expect(page.getByTestId('revision-filter-revised')).toHaveText('Revised (1)');
    await expect(page.getByTestId('revision-announcer')).toHaveText('Quick Sort is now revised.');
    expect(await stored(page)).toMatchObject([{ status: 'revised', reason: 'forgot-the-logic' }]);

    // a revised card offers only Revise Again and Remove
    await expect(quick.getByRole('button')).toHaveText(['Revise Again', 'Remove']);

    await quick.getByRole('button', { name: 'Revise Again: Quick Sort' }).click();
    await expect(quick).toHaveAttribute('data-status', 'pending');
    await expect(quick.getByRole('link', { name: 'Revise Now: Quick Sort' })).toBeFocused();
    await expect(badge(page)).toHaveText('1');
  });

  test('a pending card shows Revise Now, Mark as Revised and Remove without opening anything', async ({ app, page }) => {
    void app;
    await openWith(page, LIST);
    const quick = card(page, 'quick-sort');
    await expect(quick.getByRole('link')).toHaveText(['Revise Now']);
    await expect(quick.getByRole('button')).toHaveText(['Mark as Revised', 'Remove']);
  });

  test('progress follows the data: the stats, the bar and the ring change with the list', async ({ app, page }) => {
    void app;
    await openWith(page, LIST);
    const progress = page.getByTestId('revision-progress');
    await expect(progress.getByRole('img', { name: '33% revised' })).toBeVisible();
    await expect(progress.getByRole('img', { name: '1 of 3 revised, 2 pending' })).toBeVisible();
    await expect(progress).toContainText('1 of 3 algorithms revised');

    await card(page, 'quick-sort').getByRole('button', { name: 'Mark as Revised: Quick Sort' }).click();
    await expect(progress.getByRole('img', { name: '67% revised' })).toBeVisible();
    await expect(progress).toContainText('2 of 3 algorithms revised');
    await expect(page.getByTestId('revision-stat-pending')).toHaveText('1');
    await expect(page.getByTestId('revision-stat-revised')).toHaveText('2');
    await expect(page.getByTestId('revision-stat-total')).toHaveText('3');
  });

  test('when the focused card leaves the list, focus goes to the title', async ({ app, page }) => {
    void app;
    await openWith(page, LIST);
    await page.getByRole('button', { name: 'Remove from Revision: Quick Sort' }).click();
    await expect(card(page, 'quick-sort')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

    await page.getByTestId('revision-filter-pending').click();
    await page.getByRole('button', { name: 'Mark as Revised: Binary Search' }).click();
    await expect(card(page, 'binary-search')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByTestId('revision-no-results')).toBeVisible();
  });

  test('removing the last one shows the empty state', async ({ app, page }) => {
    void app;
    await openWith(page, [LIST[1]]);
    await page.getByRole('button', { name: 'Remove from Revision: Merge Sort' }).click();
    await expect(page.getByTestId('revision-empty')).toBeVisible();
    expect(await stored(page)).toEqual([]);
  });

  test('changes survive a refresh', async ({ app, page }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    await markCurrent(page, 'Need more practice');
    await page.goto('/revision');
    await expect(card(page, 'bubble-sort')).toBeVisible();
    await page.reload();
    await expect(card(page, 'bubble-sort').getByTestId('revision-reason')).toHaveText('Reason: Need more practice');
    await expect(badge(page)).toHaveText('1');
  });

  test('another account on this device has its own list', async ({ app, page }) => {
    void app;
    await openWith(page, LIST);
    await page.evaluate(() => {
      localStorage.setItem('algoflow_user', JSON.stringify({ id: 'someone-else', name: 'Someone Else', email: 'else@algoflow.io', streakDays: 0, solvedCount: 0, algorithmsLearned: 0, progressPercent: 0, role: 'USER', accountStatus: 'active' }));
    });
    await page.reload();
    await expect(page.getByTestId('revision-empty')).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
  });

  test('the badge stays on other pages, and the Dashboard gets no Revision card', async ({ app, page }) => {
    void app;
    await openWith(page, LIST);
    await nav(page).getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(badge(page)).toHaveText('2');
    await expect(page.locator('main a[href="/revision"]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('Revision List');
  });
});

test.describe('Navigation', () => {
  test('Revision sits right after Visualizer, with the active style, and its name includes the count', async ({ app, page }) => {
    void app;
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWith(page, LIST);
    const links = (await nav(page).getByRole('link').allTextContents()).map(t => t.trim());
    expect(links.slice(0, 3)).toEqual(['Dashboard', 'Visualizer', 'Revision22 pending']);
    const link = nav(page).getByRole('link', { name: /^Revision/ });
    await expect(link).toHaveAccessibleName('Revision 2 pending');
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(link).toHaveClass(/text-cyan-300/);
    await expect(link.locator('svg')).toBeVisible();
  });
});

test.describe('Responsive', () => {
  for (const [width, height] of [[360, 780], [390, 844], [768, 1024], [1024, 768], [1440, 900]] as const) {
    test(`${width}px: the list fits, with no sideways scroll, and every action is reachable`, async ({ app, page }) => {
      void app;
      await page.setViewportSize({ width, height });
      await openWith(page, LIST);
      await expect(cards(page)).toHaveCount(3);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // every action of the card, and the stats and filters, sit inside the screen; no label is cut off
      const quick = card(page, 'quick-sort');
      const inside = [
        quick.getByRole('link', { name: 'Revise Now: Quick Sort' }),
        quick.getByRole('button', { name: 'Mark as Revised: Quick Sort' }),
        quick.getByRole('button', { name: 'Remove from Revision: Quick Sort' }),
        page.getByTestId('revision-stat-pending'),
        page.getByTestId('revision-stat-total'),
        page.getByTestId('revision-filter-all'),
        page.getByTestId('revision-filter-revised'),
      ];
      for (const target of inside) {
        const box = (await target.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(await target.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      }
    });
  }

  for (const width of [360, 700]) {
    test(`${width}px: Revision and its count are in the profile menu, the header link is not shown, and the header stays inside the screen`, async ({ app, page }) => {
      void app;
      await page.setViewportSize({ width, height: 780 });
      await openWith(page, LIST);
      await page.goto('/dashboard');
      await expect(page.getByTestId('revision-badge-phone')).toHaveText('2');
      await expect(page.getByTestId('header-revision-link')).toBeHidden();
      await page.locator('#header-profile-btn').click();
      const item = page.locator('#header-menu-revision-btn');
      await expect(item).toHaveAccessibleName('Revision 2 pending');
      await item.click();
      await expect(page).toHaveURL(/\/revision$/);
      const overflow = await page.evaluate(() => document.querySelector('header')!.scrollWidth - document.querySelector('header')!.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('tablets: a Revision link with its count in the header', async ({ app, page }) => {
    void app;
    // well inside the tablet tier in every browser (WebKit's classic scrollbar narrows the width its media queries see)
    await page.setViewportSize({ width: 800, height: 900 });
    await openWith(page, LIST);
    await page.goto('/dashboard');
    const link = page.getByTestId('header-revision-link');
    await expect(link).toHaveAccessibleName('Revision 2 pending');
    await expect(link.getByTestId('revision-badge')).toHaveText('2');
    const overflow = await page.evaluate(() => document.querySelector('header')!.scrollWidth - document.querySelector('header')!.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await link.click();
    await expect(page).toHaveURL(/\/revision$/);
  });

  test('phones: the bookmark keeps its name, and its form stays on the screen', async ({ app, page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await expect(app.heading).toBeVisible();
    await expect(bookmark(page)).toHaveAccessibleName('Mark for Revision');
    await bookmark(page).click();
    const box = (await form(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(box.y + box.height).toBeLessThanOrEqual(780);
    await expect(form(page).getByRole('button', { name: 'Save' })).toBeInViewport();
  });
});

test.describe('Accessibility scan', () => {
  const scan = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => v.id);

  for (const theme of ['dark', 'light', 'galaxy', 'sunset']) {
    test(`the populated list in the ${theme} theme`, async ({ app, page }) => {
      void app;
      await openWith(page, LIST);
      await page.locator('#header-theme-select').selectOption(theme);
      // scan the theme itself, not a frame of the colour transition into it
      await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
      expect(await scan(page)).toEqual([]);
    });
  }

  test('the bookmark form', async ({ app, page }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    await markCurrent(page, 'Forgot the logic');
    await bookmark(page).click();
    expect(await scan(page)).toEqual([]);
  });
});
