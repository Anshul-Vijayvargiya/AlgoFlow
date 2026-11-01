import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, engineSteps } from '../support/engineTrace';
import { ALGORITHM_NAV } from '../../src/data/algorithmMetadata';
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
    // a fresh browser has done nothing yet: no activity, an honest empty chart
    await expect(page.getByTestId('weekly-active-days')).toHaveText('Active on 0 of 7 days');
    await expect(page.getByTestId('weekly-empty')).toContainText('No activity in the last 7 days');
    // no tracks in progress: an honest empty state, no resume link
    await expect(page.getByTestId('continue-learning')).toContainText('Nothing in progress yet');
    await expect(page.getByTestId('continue-learning').getByRole('link')).toHaveCount(0);
  });

  test('weekly activity counts what was done today: a visualizer walkthrough and a practice submission, each once', async ({ app, page }) => {
    // stepping through one algorithm, back and forth, is one walkthrough
    await app.next();
    await app.previous();
    await app.next();
    await openDashboard(page);
    const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date());
    await expect(page.getByTestId('weekly-active-days')).toHaveText('Active on 1 of 7 days');
    await expect(page.getByTestId('weekly-totals')).toHaveText('This week: 0 practice submissions · 1 visualizer walkthrough');
    await expect(page.getByRole('figure', { name: 'Weekly activity' })).toHaveAccessibleDescription(
      new RegExp(`${today}: 0 practice submissions, 1 visualizer walkthrough\\.`)
    );

    // one practice submission (a wrong answer is still practice)
    await page.goto('/practice');
    await page.locator('[data-problem="p4"]').getByRole('button', { name: 'Practice Now' }).click();
    await page.locator('#practice-submit-btn').click();
    await expect(page.getByTestId('submission-verdict')).toHaveText('Wrong Answer');
    await openDashboard(page);
    await expect(page.getByTestId('weekly-totals')).toHaveText('This week: 1 practice submission · 1 visualizer walkthrough');
    await expect(page.getByRole('figure', { name: 'Weekly activity' })).toHaveAccessibleDescription(
      new RegExp(`${today}: 1 practice submission, 1 visualizer walkthrough\\.`)
    );
    await expect(page.getByTestId('weekly-active-days')).toHaveText('Active on 1 of 7 days');
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

  test('every recommendation opens its own algorithm in the visualizer', async ({ app, page }) => {
    void app;
    await openDashboard(page);
    const links = page.getByTestId('recommendations').getByRole('link');
    const ids = await links.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.algorithm!));
    expect(ids).toEqual(ALGORITHM_NAV.filter(a => a.implemented).slice(0, 4).map(a => a.id));
    for (const id of ids) {
      await openDashboard(page);
      await page.locator(`[data-algorithm="${id}"]`).click();
      await expect(page).toHaveURL(/\/visualizer$/);
      const def = definition(id as never);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(def.name);
      // the visualizer really runs that algorithm: its first step is the engine's first step for the default input
      const first = engineSteps(id as never, def.defaultInput, def.inputSpec?.target?.defaultValue ?? null)[0];
      await expect(page.getByTestId('current-action')).toHaveText(first.message);
    }
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

  test('headings and chart summaries are exposed to assistive technology', async ({ app, page }) => {
    // one walkthrough, so the weekly chart is drawn
    await app.next();
    await openDashboard(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 2, name: 'Weekly activity' })).toBeVisible();
    await expect(page.getByRole('figure', { name: 'Weekly activity' })).toHaveAccessibleDescription(
      /^Activity per day \(UTC\): .+ In total: 0 practice submissions and 1 visualizer walkthrough\.$/
    );
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
    await expect(page.getByTestId('checklist-reset')).toContainText('Resets at 00:00 UTC');
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

  test('Continue learning: the last algorithm stepped through, with when, and Resume opens it', async ({ app, page }) => {
    await app.selectAlgorithm('binary-search');
    await app.next();
    // the walkthrough has been recorded before the Dashboard is opened
    await expect
      .poll(() => page.evaluate(() => Boolean(JSON.parse(localStorage.getItem('algoflow_visualizer_activity') ?? '{}').tracks?.['binary-search'])))
      .toBe(true);
    await openDashboard(page);
    const card = page.getByTestId('continue-learning');
    await expect(card).toContainText('Binary Search');
    await expect(page.getByTestId('continue-meta')).toHaveText('SEARCHING · in progress · last active today');
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
    const sections = ['dashboard-welcome', 'continue-learning', 'daily-checklist', 'dashboard-stats', 'weekly-activity', 'topic-progress', 'recent-activity', 'recommended-next'];
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
  const SECTIONS = ['dashboard-welcome', 'continue-learning', 'daily-checklist', 'dashboard-stats', 'weekly-activity', 'topic-progress', 'recent-activity', 'recommended-next'];
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

  test('desktop: continue learning compact with the four cards below it, today\'s goals beside both and level with them', async ({ app, page }) => {
    void app;
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDashboard(page);
    const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
    const cont = await box('continue-learning');
    const goals = await box('daily-checklist');
    const stats = await box('dashboard-stats');
    expect(cont.height).toBeLessThan(200);
    expect(Math.abs(goals.y - cont.y)).toBeLessThan(2);
    expect(goals.x).toBeGreaterThan(cont.x + cont.width);
    // the cards directly below continue learning, in its column
    expect(stats.y).toBeGreaterThan(cont.y + cont.height);
    expect(stats.y - (cont.y + cont.height)).toBeLessThanOrEqual(24);
    expect(Math.abs(stats.x - cont.x)).toBeLessThan(2);
    // the two sides of the top block end within a card gap of each other
    expect(Math.abs(goals.y + goals.height - (stats.y + stats.height))).toBeLessThanOrEqual(40);
    // 2 x 2 cards
    const cards = await Promise.all(['Problems Solved', 'Algorithms Explored', 'Current Streak', 'Learning Time'].map(async name => (await page.locator(`[data-stat="${name}"]`).boundingBox())!));
    expect(Math.abs(cards[0].y - cards[1].y)).toBeLessThan(2);
    expect(Math.abs(cards[2].y - cards[3].y)).toBeLessThan(2);
    expect(cards[2].y).toBeGreaterThan(cards[0].y + cards[0].height);
    // weekly activity and progress by topic: equal halves, level
    const weekly = await box('weekly-activity');
    const topics = await box('topic-progress');
    expect(Math.abs(weekly.width - topics.width)).toBeLessThan(2);
    expect(Math.abs(weekly.y - topics.y)).toBeLessThan(2);
    // recent activity and recommended next: one row; the downloadable notes are on the Notes page, not here
    const [recent, rec] = [await box('recent-activity'), await box('recommended-next')];
    expect(Math.abs(rec.y - recent.y)).toBeLessThan(2);
    expect(rec.x).toBeGreaterThan(recent.x + recent.width);
    await expect(page.getByTestId('learning-resources')).toHaveCount(0);
  });

  test('Recommended next: each Start button opens its algorithm in the visualizer', async ({ app, page }) => {
    void app;
    await openDashboard(page);
    const first = page.getByTestId('recommendations').getByRole('link').first();
    const id = (await first.getAttribute('data-algorithm'))!;
    await expect(first).toHaveText(/Start/);
    await first.click();
    await expect(page).toHaveURL(/\/visualizer$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(definition(id as Parameters<typeof definition>[0]).name);
  });

  test("Learning Time says it is not tracked, and progress by topic lists the app's topics", async ({ app, page }) => {
    void app;
    await openDashboard(page);
    await expect(page.locator('[data-stat="Learning Time"]')).toContainText('Not tracked');
    await expect(page.getByTestId('topic-progress').locator('[data-topic="Sorting"]')).toBeVisible();
    await expect(page.getByTestId('topic-progress').locator('[data-topic="Trees"]')).toBeVisible();
  });
});
