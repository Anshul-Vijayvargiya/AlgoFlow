import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition } from '../support/engineTrace';
import { PRACTICE_PROBLEMS } from '../../src/data/practiceProblems';

/**
 * Dashboard. The E2E build uses the mock API, which derives everything from what a test does in its own browser (the
 * same rules the server applies to its records): a fresh browser has solved nothing, has no streak, no tracks and no
 * recent activity, and the page says it is in demo mode. Each test takes the `app` fixture so that it opens the app
 * (signed in) first.
 */

async function openDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-stats')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('checklist-count')).toBeVisible();
}

/** solves an Easy practice problem with the mock judge's accepted solution (the mock API keeps it in this browser) */
async function solveFirstProblem(page: Page) {
  // the mock judge accepts a program that prints each test's expected output; the problem's visible tests are known
  const problem = PRACTICE_PROBLEMS.find(p => p.difficulty === 'Easy')!;
  await page.evaluate(
    ({ id }) => {
      const state = JSON.parse(localStorage.getItem('algoflow_practice_state') ?? '{"submissions":{}}');
      state.submissions[id] = [
        { id: 'e2e-accepted', problemId: id, language: 'python', code: '', status: 'ACCEPTED', passed: true, runtimeMs: 1, memoryMb: 1, createdAt: new Date().toISOString() },
      ];
      localStorage.setItem('algoflow_practice_state', JSON.stringify(state));
    },
    { id: problem.problemId }
  );
  return problem;
}

test.describe('Dashboard', () => {
  test('shows real progress data and honest empty states — nothing invented', async ({ app, page }) => {
    void app;
    await openDashboard(page);
    const body = page.locator('main');
    for (const invented of ['7.4 hrs', 'Resume Step', 'Step 4 of 10', 'Array Partitioning']) await expect(body).not.toContainText(invented);
    // a fresh browser has solved nothing and has no streak: real zeros, and the demo data is labelled as such
    await expect(page.locator('[data-stat="Problems Solved"]')).toContainText('0Problems Solved');
    await expect(page.locator('[data-stat="Current Streak"]')).toContainText('0 Days');
    await expect(page.getByTestId('streak-note')).toHaveText('Step through an algorithm or submit a solution to start one');
    await expect(page.getByTestId('demo-badge')).toHaveText('Demo mode: progress is kept in this browser, not on a server');
    await expect(page.getByTestId('difficulty-empty')).toContainText('No solved problems yet');
    await expect(page.getByTestId('recent-empty')).toContainText('No activity yet');
    await expect(page.getByTestId('recent-view-all')).toHaveCount(0);
    await expect(page.getByTestId('welcome-explored')).toHaveText('0 algorithms explored');
    // no tracks in progress: an honest empty state, no resume link
    await expect(page.getByTestId('continue-learning')).toContainText('Nothing in progress yet');
    await expect(page.getByTestId('continue-learning').getByRole('link')).toHaveCount(0);
  });

  test('difficulty badges: one per level, distinct styles, each labelled in text', async ({ app, page }) => {
    void app;
    await solveFirstProblem(page);
    await openDashboard(page);
    const badges = page.locator('[data-difficulty]');
    await expect(badges).toHaveText(['Easy1', 'Medium0', 'Hard0']);
    const colours = await badges.evaluateAll(els => els.map(e => getComputedStyle(e).color));
    expect(new Set(colours).size).toBe(3);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA: no violations (${theme})`, async ({ app, page }) => {
      void app;
      await page.getByRole('banner').getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await openDashboard(page);
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('headings: one h1, and an h2 for each section', async ({ app, page }) => {
    void app;
    await openDashboard(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    for (const name of ['Continue learning', "Today's goals", 'Recent activity']) await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  });

  test('only the approved sections: no weekly chart, topic progress, recommendations, quick actions or learning time', async ({ app, page }) => {
    await app.next();
    await openDashboard(page);
    for (const id of ['weekly-activity', 'topic-progress', 'recommended-next', 'quick-actions']) await expect(page.getByTestId(id)).toHaveCount(0);
    await expect(page.locator('[data-stat]')).toHaveCount(3);
    for (const text of ['Weekly activity', 'Progress by topic', 'Recommended next', 'Quick Actions', 'Learning Time']) await expect(page.locator('main')).not.toContainText(text);
  });

  test('reduced motion: the hero button does not zoom on hover', async ({ app, page }) => {
    void app;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDashboard(page);
    const launch = page.getByRole('link', { name: 'Launch Visualizer' });
    await launch.hover();
    expect(await launch.evaluate(e => getComputedStyle(e).scale)).toMatch(/^(none|1)$/);
  });

  test('daily checklist: a walkthrough checks its verified goal; the manual goal is ticked by keyboard and survives a reload', async ({ app, page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('checklist-count')).toHaveText('0 of 4 goals complete');
    await expect(page.getByTestId('checklist-reset')).toHaveCount(0);
    // verified goals are not controls
    await expect(page.getByTestId('daily-checklist').getByRole('checkbox')).toHaveCount(1);

    // a walkthrough in the visualizer checks "Step through an algorithm"
    await page.goto('/visualizer');
    await app.next();
    await openDashboard(page);
    await expect(page.locator('[data-goal="visualize"]')).toHaveAttribute('data-done', 'true');
    await expect(page.locator('[data-goal="submit"]')).toHaveAttribute('data-done', 'false');
    await expect(page.getByTestId('checklist-count')).toHaveText('1 of 4 goals complete');

    // the manual goal, with the keyboard only
    const review = page.getByRole('checkbox', { name: /Review an algorithm you found hard/ });
    await review.focus();
    await page.keyboard.press('Space');
    await expect(review).toBeChecked();
    await expect(page.getByTestId('checklist-count')).toHaveText('2 of 4 goals complete');
    await expect(page.getByRole('progressbar', { name: "Today's goals" })).toHaveAttribute('aria-valuenow', '2');

    // kept after a reload (a new session in the same browser)
    await page.reload();
    await expect(page.getByTestId('checklist-count')).toHaveText('2 of 4 goals complete');
    await expect(page.getByRole('checkbox', { name: /Review an algorithm you found hard/ })).toBeChecked();

    // and unticked again
    await page.getByRole('checkbox', { name: /Review an algorithm you found hard/ }).click();
    await expect(page.getByTestId('checklist-count')).toHaveText('1 of 4 goals complete');
  });

  test('a walkthrough and a submission: the streak starts, Recent activity lists both with working links', async ({ app, page }) => {
    await app.next();
    await page.goto('/practice');
    await page.locator('[data-problem="p4"]').getByRole('button', { name: 'Practice Now' }).click();
    await page.locator('#practice-submit-btn').click();
    await expect(page.getByTestId('submission-verdict')).toHaveText('Wrong Answer');
    await openDashboard(page);

    await expect(page.locator('[data-stat="Current Streak"]')).toContainText('1 Day');
    await expect(page.getByTestId('streak-note')).toHaveText('Best: 1 day');
    // a wrong answer is an attempt, not a solved problem
    await expect(page.locator('[data-stat="Problems Solved"]')).toContainText('0Problems Solved');
    await expect(page.locator('[data-goal="submit"]')).toHaveAttribute('data-done', 'true');
    await expect(page.locator('[data-goal="solve"]')).toHaveAttribute('data-done', 'false');

    const rows = page.getByTestId('recent-list').locator('tbody tr');
    await expect(rows).toHaveCount(2);
    const submission = page.locator('tr[data-event-kind="submission"]');
    await expect(submission).toContainText('Practice submission');
    await expect(submission.getByTestId('recent-status')).toHaveText('Wrong Answer');
    const walkthrough = page.locator('tr[data-event-kind="walkthrough"]');
    await expect(walkthrough).toContainText('Bubble Sort');
    await expect(walkthrough).toContainText('Visualizer walkthrough');

    // the submission opens that problem in Practice
    const title = (await submission.locator('span.truncate').textContent())!;
    await submission.getByRole('link').click();
    await expect(page).toHaveURL(/\/practice\?problem=p4$/);
    // the problem's workspace is open (its title is the modal's h2; the list's cards use h3)
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    await expect(page.locator('#practice-submit-btn')).toBeVisible();

    // the walkthrough opens its algorithm in the visualizer
    await openDashboard(page);
    await page.locator('tr[data-event-kind="walkthrough"]').getByRole('link').click();
    await expect(page).toHaveURL(/\/visualizer$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bubble Sort');
  });

  test('Continue learning: the last algorithm stepped through, its topic, complexity and when, and Continue opens it', async ({ app, page }) => {
    await app.selectAlgorithm('binary-search');
    await app.next();
    // the walkthrough has been recorded before the Dashboard is opened
    await expect
      .poll(() => page.evaluate(() => Boolean(JSON.parse(localStorage.getItem('algoflow_visualizer_activity') ?? '{}').tracks?.['binary-search'])))
      .toBe(true);
    await openDashboard(page);
    const card = page.getByTestId('continue-learning');
    await expect(card).toContainText('Binary Search');
    await expect(page.getByTestId('continue-topic')).toHaveText('Searching');
    await expect(page.getByTestId('continue-complexity')).toHaveText(`Average time complexity: ${definition('binary-search').complexity.average}`);
    await expect(page.getByTestId('continue-meta')).toHaveText('Last active today');
    await expect(page.getByTestId('continue-resume')).toHaveAccessibleName('Continue: Binary Search');
    // never a hardcoded algorithm
    await expect(card).not.toContainText('Bubble Sort');
    await page.getByTestId('continue-resume').click();
    await expect(page).toHaveURL(/\/visualizer$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Binary Search');
  });

  test('phone width: one column, no horizontal scroll, every section reachable in reading order', async ({ app, page }) => {
    await app.next();
    await page.setViewportSize({ width: 375, height: 800 });
    await openDashboard(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const sections = ['dashboard-welcome', 'continue-learning', 'dashboard-stats', 'daily-checklist', 'recent-activity'];
    const boxes = [];
    for (const id of sections) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.x, id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, id).toBeLessThanOrEqual(375);
      boxes.push(box);
    }
    // stacked, in reading order
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].y, sections[i]).toBeGreaterThan(boxes[i - 1].y);
  });

  // every section's box: inside the viewport, overlapping no other, and with little blank space below its content
  const SECTIONS = ['dashboard-welcome', 'continue-learning', 'dashboard-stats', 'daily-checklist', 'recent-activity'];
  async function layout(page: Page) {
    return page.evaluate(ids => {
      const boxes = ids.map(id => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
        const r = el.getBoundingClientRect();
        // the lowest point of its content: a card stretched past it shows blank space
        const content = Math.max(r.top, ...[...el.children].map(c => c.getBoundingClientRect().bottom));
        return { id, x: r.left, y: r.top + scrollY, w: r.width, h: r.height, blank: Math.round(r.bottom - content) };
      });
      return { boxes, overflow: document.documentElement.scrollWidth - innerWidth };
    }, SECTIONS);
  }
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

  for (const width of [1440, 1024, 768, 390]) {
    test(`${width}px: no overlap, no overflow, no card with excessive blank space`, async ({ app, page }) => {
      void app;
      await page.setViewportSize({ width, height: 900 });
      await openDashboard(page);
      const { boxes, overflow } = await layout(page);
      expect(overflow).toBeLessThanOrEqual(0);
      for (const b of boxes) {
        expect(b.w, b.id).toBeGreaterThan(0);
        expect(b.x, b.id).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, b.id).toBeLessThanOrEqual(width);
        // the cards' own padding (20px), plus at most a little where a card is stretched to level a row
        expect(b.blank, `${b.id}: blank space below its content`).toBeLessThanOrEqual(48);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `${boxes[i].id} overlaps ${boxes[j].id}`).toBe(false);
    });
  }

  // widths well inside the desktop tier: at exactly 1024px WebKit evaluates media queries without its scrollbar, so it is
  // still in the one-column tier there (see header-layout.spec.ts)
  for (const width of [1440, 1100]) {
    test(`desktop ${width}px: continue learning and the three cards on the left, today's goals on the right, recent activity across the width`, async ({ app, page }) => {
      void app;
      await page.setViewportSize({ width, height: 900 });
      await openDashboard(page);
      const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
      const [welcome, cont, stats, goals, recent] = await Promise.all(['dashboard-welcome', 'continue-learning', 'dashboard-stats', 'daily-checklist', 'recent-activity'].map(box));
      // the two columns start level, below the welcome; goals to the right of the wider left column
      expect(Math.abs(goals.y - cont.y)).toBeLessThan(2);
      expect(cont.y).toBeGreaterThan(welcome.y + welcome.height);
      expect(goals.x).toBeGreaterThan(cont.x + cont.width);
      expect(cont.width).toBeGreaterThan(goals.width);
      // the cards directly below continue learning, in its column
      expect(Math.abs(stats.x - cont.x)).toBeLessThan(2);
      expect(stats.y).toBeGreaterThan(cont.y + cont.height);
      expect(stats.y - (cont.y + cont.height)).toBeLessThanOrEqual(24);
      // three cards in one row
      const cards = await Promise.all(['Problems Solved', 'Algorithms Explored', 'Current Streak'].map(async name => (await page.locator(`[data-stat="${name}"]`).boundingBox())!));
      for (const c of cards.slice(1)) expect(Math.abs(c.y - cards[0].y)).toBeLessThan(2);
      expect(cards[1].x).toBeGreaterThan(cards[0].x + cards[0].width);
      expect(cards[2].x).toBeGreaterThan(cards[1].x + cards[1].width);
      // recent activity: below both columns, as wide as the welcome
      expect(recent.y).toBeGreaterThan(Math.max(stats.y + stats.height, goals.y + goals.height));
      expect(Math.abs(recent.x - welcome.x)).toBeLessThan(2);
      expect(Math.abs(recent.width - welcome.width)).toBeLessThan(2);
      await expect(page.getByTestId('learning-resources')).toHaveCount(0);
    });
  }

  test('tablet 768px: one column in reading order, the three cards side by side', async ({ app, page }) => {
    void app;
    await page.setViewportSize({ width: 768, height: 1000 });
    await openDashboard(page);
    const [cont, stats, goals, recent] = await Promise.all(['continue-learning', 'dashboard-stats', 'daily-checklist', 'recent-activity'].map(async id => (await page.getByTestId(id).boundingBox())!));
    for (const b of [stats, goals, recent]) expect(Math.abs(b.width - cont.width)).toBeLessThan(2);
    expect(stats.y).toBeGreaterThan(cont.y);
    expect(goals.y).toBeGreaterThan(stats.y + stats.height);
    expect(recent.y).toBeGreaterThan(goals.y + goals.height);
    const cards = await Promise.all(['Problems Solved', 'Algorithms Explored', 'Current Streak'].map(async name => (await page.locator(`[data-stat="${name}"]`).boundingBox())!));
    for (const c of cards.slice(1)) expect(Math.abs(c.y - cards[0].y)).toBeLessThan(2);
  });

  test('Recent activity: "View all" lists up to 20 events, "Show less" the first 8 again', async ({ app, page }) => {
    void app;
    // 12 practice submissions recorded in this browser (the mock API's records)
    const problem = PRACTICE_PROBLEMS[0];
    await page.evaluate(
      ({ id }) => {
        const state = JSON.parse(localStorage.getItem('algoflow_practice_state') ?? '{"submissions":{}}');
        state.submissions[id] = Array.from({ length: 12 }, (_, i) => ({
          id: `e2e-${i}`, problemId: id, language: 'python', code: '', status: 'WRONG_ANSWER', passed: false, runtimeMs: 1, memoryMb: 1,
          createdAt: new Date(Date.now() - i * 60_000).toISOString(),
        }));
        localStorage.setItem('algoflow_practice_state', JSON.stringify(state));
      },
      { id: problem.problemId }
    );
    await openDashboard(page);
    const rows = page.getByTestId('recent-list').locator('tbody tr');
    const viewAll = page.getByTestId('recent-view-all');
    await expect(rows).toHaveCount(8);
    await expect(viewAll).toHaveText('View all');
    await expect(viewAll).toHaveAttribute('aria-expanded', 'false');
    await viewAll.click();
    await expect(rows).toHaveCount(12);
    await expect(viewAll).toHaveText('Show less');
    await expect(viewAll).toHaveAttribute('aria-expanded', 'true');
    await viewAll.click();
    await expect(rows).toHaveCount(8);
    await expect(viewAll).toHaveText('View all');
  });
});
