import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * Responsive layout checks. The page sets `overflow-x: hidden` on <body>, so anything pushed past the viewport edge is
 * CLIPPED and unreachable — these tests therefore check element positions, not just document scroll width.
 */
const VIEWPORTS = [
  { name: 'small phone', width: 360, height: 740 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet portrait', width: 820, height: 1180 },
  { name: 'tablet landscape', width: 1180, height: 820 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const SIXTEEN = Array.from({ length: 16 }, (_, i) => ((i * 37) % 199) - 99);

/** Everything a user must be able to reach or read, with its box. */
function layoutReport(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const box = (e: Element) => e.getBoundingClientRect();
    const visible = (e: Element) => { const r = box(e); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'; };
    const label = (e: Element) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24) || e.tagName;

    // 1. nothing interactive / informative is clipped by the viewport edge
    const offscreen = [...document.querySelectorAll('button, input, select, a[href], h1, [data-bar-index], [data-testid="step-counter"], [data-testid="current-action"]')]
      .filter(visible)
      .filter(e => { const r = box(e); return r.left < -1 || r.right > vw + 1; })
      .map(e => `${e.tagName.toLowerCase()} "${label(e)}" spans ${Math.round(box(e).left)}..${Math.round(box(e).right)} (viewport ${vw})`);

    // 2. bars and their value labels stay inside the chart
    const chart = document.querySelector('[data-testid="array-visualizer"] > div');
    const c = chart ? box(chart) : null;
    const clippedBars = c
      ? [...document.querySelectorAll('[data-bar-index]')].filter(b => { const r = box(b); return r.left < c.left - 1 || r.right > c.right + 1 || r.width < 8; }).map(b => `bar ${(b as HTMLElement).dataset.barIndex} ${Math.round(box(b).left)}..${Math.round(box(b).right)} width ${Math.round(box(b).width)} (chart ${Math.round(c.left)}..${Math.round(c.right)})`)
      : ['no chart'];

    // 3. the main panels (named landmarks) never overlap each other
    const panels: [string, Element | null][] = ([
      ['visualization', '[role="region"][aria-label="Visualization"]'],
      ['input', 'form[aria-label="Array and target input"]'],
      ['controls', '[role="region"][aria-label="Playback controls"]'],
      ['code', '[role="region"][aria-label="Code"]'],
      ['explanation', '[role="region"][aria-label="Explanation"]'],
    ] as const).map(([n, sel]) => [n, document.querySelector(sel)]);
    const shown = panels.filter(([, e]) => e && visible(e)) as [string, Element][];
    const overlaps: string[] = [];
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      const a = box(shown[i][1]); const b = box(shown[j][1]);
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left); const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 1 && h > 1) overlaps.push(`${shown[i][0]} ∩ ${shown[j][0]} (${Math.round(w)}×${Math.round(h)})`);
    }

    // 4. targets at least 24×24 CSS px (WCAG 2.2 AA 2.5.8) for the visualizer's own controls
    const small = [...document.querySelectorAll('form[aria-label="Array and target input"] :is(button, input), [aria-label="Playback controls"] :is(button, select, input)')]
      .filter(visible)
      .filter(e => { const r = box(e); return r.width < 24 || r.height < 24; })
      .map(e => `${label(e)} ${Math.round(box(e).width)}×${Math.round(box(e).height)}`);

    // 5. code: long lines must be scrollable, never cut off
    const codeLine = document.querySelector('[data-line] pre');
    const scroller = codeLine?.closest('.overflow-y-auto') as HTMLElement | null;
    const codeClipped = scroller ? scroller.scrollWidth > scroller.clientWidth + 1 && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX) : false;
    const codeFont = codeLine ? parseFloat(getComputedStyle(codeLine).fontSize) : null;

    return { vw, offscreen, clippedBars, overlaps, panels: shown.map(([n]) => n), small, codeClipped, codeFont };
  });
}

test.describe('responsive layout @cross', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} ${vp.width}×${vp.height}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test('default view: nothing clipped by the viewport, bars inside the chart, panels do not overlap, targets ≥ 24px', async ({ app, page }) => {
        const r = await layoutReport(page);
        expect(r.offscreen, 'elements cut off by the viewport edge').toEqual([]);
        expect(r.clippedBars).toEqual([]);
        expect(r.overlaps).toEqual([]);
        expect(r.small, 'controls smaller than 24×24 CSS px').toEqual([]);
        expect(r.panels, 'the main panels are present (code is behind the Live Code tab on phones)').toEqual(
          vp.width < 768 ? ['visualization', 'input', 'controls', 'explanation'] : ['visualization', 'input', 'controls', 'code', 'explanation']
        );
        await expect(app.visualizeButton).toBeVisible();
      });

      test('16 values (the maximum) with pointers mid-trace: bars and pointer chips stay inside the chart', async ({ app, page }) => {
        await app.selectAlgorithm('binary-search');
        await app.enterAndVisualize([...SIXTEEN].sort((a, b) => a - b), 50);
        for (let i = 0; i < 3; i++) await app.next();
        const r = await layoutReport(page);
        expect(r.offscreen).toEqual([]);
        expect(r.clippedBars).toEqual([]);
        const s = await app.state();
        const chart = s.chart!;
        for (const c of s.chips) {
          expect(c.x, `chip ${c.text}`).toBeGreaterThanOrEqual(chart.x - 1);
          expect(c.x + c.w, `chip ${c.text}`).toBeLessThanOrEqual(chart.x + chart.w + 1);
        }
      });

      test('the code panel is readable: long lines scroll instead of being cut off', async ({ app, page }) => {
        await app.selectAlgorithm('merge-sort');
        if (vp.width < 768) await page.getByRole('button', { name: 'Live Code' }).click();
        await expect(page.locator('[data-line][aria-current="step"]')).toBeVisible();
        const r = await layoutReport(page);
        expect(r.codeClipped, 'code lines wider than the panel must be scrollable').toBe(false);
        expect(r.codeFont, 'code font size').toBeGreaterThanOrEqual(11);
      });
    });
  }
});

test.describe('mobile interaction (device emulation) @mobile', () => {
  test('the algorithm drawer: named toggle, dialog, focus moves in and back, Escape closes', async ({ app, page }) => {
    const toggle = page.getByRole('button', { name: 'Open algorithm list' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    const dialog = page.getByRole('dialog', { name: 'Algorithm list' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close algorithm list' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toBeFocused();

    await toggle.click();
    await dialog.getByRole('button', { name: /^Linear Search/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(app.heading).toHaveText('Linear Search');
  });

  test('Visualization / Live Code tabs expose their state and switch panels', async ({ app, page }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    const vis = page.getByRole('button', { name: 'Visualization' });
    const code = page.getByRole('button', { name: 'Live Code' });
    await expect(vis).toHaveAttribute('aria-pressed', 'true');
    await code.click();
    await expect(code).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-line][aria-current="step"]')).toBeVisible();
    await vis.click();
    await expect(page.getByTestId('array-visualizer')).toBeVisible();
  });

  test('a full input journey works with touch: type, tap Sort a copy, tap Next', async ({ app, page }) => {
    await app.selectAlgorithm('binary-search'); // through the drawer on a phone
    await app.type([9, 2, 5], 5);
    await expect(app.sortCopyButton).toBeVisible();
    await app.sortCopyButton.tap();
    await app.expectBars([2, 5, 9]);
    await expect(app.inputNotice).toContainText('9, 2, 5');
    await app.nextButton.tap();
    await app.expectStep(2);
    const r = await layoutReport(page);
    expect(r.offscreen).toEqual([]);
  });
});
