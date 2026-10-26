import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import type { AlgorithmId } from '../support/engineTrace';
import type { VisualizerApp } from '../support/visualizerApp';

/**
 * The playback controls do not move during playback. Algorithms that show value cards (and Two Sum's hash map) keep
 * them the same height at every step: each card always reserves its role line, the map panel has a fixed height (its
 * entries scroll inside it) and holds its place before the map is created, and Majority Element shows the same cards
 * in both passes. Before this, the controls jumped by up to 50 px from step to step, a moving target for Pause.
 *
 * Positions are read in the page on every step change during real playback (a MutationObserver on the step
 * counter). The last step is not compared: the outcome banner appears there, for every algorithm (Bubble Sort,
 * Two Pointer...), which is the end of playback, not a jump during it.
 *
 * The visualization header is covered too: its "Current Action" message used to wrap onto a second line for long
 * messages, moving everything below it by 16 px; it now stays on one line (cut with "…").
 */
async function controlTopsDuringPlayback(app: VisualizerApp, page: Page): Promise<{ total: number; tops: number[] }> {
  const total = await app.totalSteps();
  await app.setSpeed('fast');
  const recording = page.evaluate(
    total =>
      new Promise<number[]>((resolve, reject) => {
        const counter = document.querySelector<HTMLElement>('[data-testid="step-counter"]')!;
        const controls = document.querySelector<HTMLElement>('[role="region"][aria-label="Playback controls"]')!;
        // relative to the top of the Visualization region, so scrolling (the page scrolls an inner container, and the
        // code panel keeps its active line in view) is not mistaken for movement, while any change in height of the
        // header, bars, cards, map or input panel between them is caught
        const region = document.querySelector<HTMLElement>('[role="region"][aria-label="Visualization"]')!;
        const top = () => Math.round(controls.getBoundingClientRect().top - region.getBoundingClientRect().top);
        const tops = [top()]; // step 1, before Play
        const done = (fn: () => void) => { obs.disconnect(); clearTimeout(timer); fn(); };
        // Measured synchronously when the step counter changes: React has committed that step's DOM (in one commit,
        // including layout effects), and reading a box forces its layout. An animation frame later would be too late:
        // a slow browser can show two steps in one frame (missing one) or already show the last step.
        const obs = new MutationObserver(() => {
          const step = Number(counter.dataset.step);
          if (step < total) tops.push(top());
          if (step >= total - 1) done(() => resolve(tops));
        });
        const timer = setTimeout(() => done(() => reject(new Error(`playback did not reach step ${total - 1}; saw ${tops.length} positions`))), 60_000);
        obs.observe(counter, { attributes: true, attributeFilter: ['data-step'] });
      }),
    total
  );
  await app.play();
  return { total, tops: await recording };
}

const CASES: { id: AlgorithmId; input?: number[]; target?: number }[] = [
  // the map fills to 6 entries and wraps; a store, an update-free run to a hit
  { id: 'two-sum', input: [12, -3, 40, 7, 25, -11, 18, 9, 33, 4, 2, 30], target: 32 },
  // pass 1 then pass 2 (the cards used to change from 4 to 5)
  { id: 'majority-element' },
  // steps with and without roles on every card
  { id: 'container-most-water' },
  // in-place writes, skipped duplicates and a growing kept prefix
  { id: 'remove-duplicates-sorted', input: [1, 1, 2, 2, 2, 3, 4, 4, 5, 5, 5, 6] },
];

for (const viewport of [{ name: 'desktop', width: 1500, height: 1000 }, { name: 'phone', width: 375, height: 800 }]) {
  test.describe(`playback controls stay put (${viewport.name})`, () => {
    for (const { id, input, target } of CASES) {
      test(`${id}: the controls do not move between steps`, async ({ app, page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await app.selectAlgorithm(id);
        if (input) await app.enterAndVisualize(input, target);
        const { total, tops } = await controlTopsDuringPlayback(app, page);
        // every step but the last was seen, and the controls sat at one position throughout
        expect(tops.length, 'positions recorded').toBeGreaterThanOrEqual(total - 1);
        expect([...new Set(tops)], `controls' top over ${tops.length} steps`).toHaveLength(1);
      });
    }
  });
}
