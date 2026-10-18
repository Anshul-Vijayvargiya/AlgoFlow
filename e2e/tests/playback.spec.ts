import { test, expect } from '../fixtures';
import { engineSteps, expectedLine } from '../support/engineTrace';

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const intervals = (rec: { t: number }[]) => rec.slice(1).map((r, i) => r.t - rec[i].t);

test.describe('playback controls on a custom trace', () => {
  test('Next, Previous and Reset restore exact states', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([3, 1, 2]);

    const snapshots = [await app.state()];
    for (let i = 0; i < 5; i++) { await app.next(); snapshots.push(await app.state()); }
    for (let i = 4; i >= 3; i--) {
      await app.previous();
      expect(await app.state(), `Previous returns to step ${i + 1}`).toEqual(snapshots[i]);
    }
    await app.next();
    await app.next();
    expect(await app.state()).toEqual(snapshots[5]);

    await app.reset();
    expect(await app.state(), 'Reset returns to the initial state of the new trace').toEqual(snapshots[0]);
    await expect(app.previousButton).toBeDisabled();
  });

  test('Play runs every step of the trace once, in order, and stops on the last step', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([3, 1, 2]);
    await app.setSpeed('fast');
    const total = await app.totalSteps();

    const recording = app.recordStepChanges(total - 1);
    await app.play();
    const seen = (await recording).map(r => r.step);

    expect(seen, 'every step exactly once, in order — no skips, no duplicates').toEqual(Array.from({ length: total - 1 }, (_, i) => i + 2));
    await expect(app.playButton, 'playback stops by itself (button shows Play again)').toBeVisible();
    await app.expectStep(total);
    await expect(app.nextButton).toBeDisabled();
  });

  test('Pause holds the current step', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([3, 1, 2]);
    await app.setSpeed('fast');
    await app.play();
    await expect.poll(() => app.stepNumber()).toBeGreaterThanOrEqual(3);
    await app.pause();
    await expect(app.playButton).toBeVisible();
    await app.expectNoStepChangeFor(500);
  });

  test('Play at the last step restarts from step 1 (instead of doing nothing)', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([3, 1, 2]);
    await app.setSpeed('fast');
    await app.goToLastStep();

    const recording = app.recordStepChanges(3);
    await app.play();
    expect((await recording).map(r => r.step), 'jumps back to step 1, then continues 2, 3').toEqual([1, 2, 3]);
    await app.pause();
  });

  test('two playback speeds: the same steps in the same order, at different pace', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([3, 1, 2]);

    await app.setSpeed('fast');
    let recording = app.recordStepChanges(4);
    await app.play();
    const fast = await recording;
    await app.pause();
    await app.reset();

    await app.setSpeed('medium');
    recording = app.recordStepChanges(4);
    await app.play();
    const medium = await recording;
    await app.pause();

    expect(fast.map(r => r.step)).toEqual([2, 3, 4, 5]);
    expect(medium.map(r => r.step), 'speed changes timing only, never the order of steps').toEqual([2, 3, 4, 5]);
    // nominal: fast = 100 ms/step, medium = 600 ms/step
    expect(median(intervals(fast))).toBeLessThan(350);
    expect(median(intervals(medium))).toBeGreaterThan(400);
  });

  test('changing the input during playback stops it; nothing of the old trace appears afterwards', async ({ app }) => {
    await app.selectAlgorithm('quick-sort');
    await app.enterAndVisualize([4, 3, 2, 1]);
    await app.setSpeed('fast');
    await app.play();
    await expect.poll(() => app.stepNumber()).toBeGreaterThanOrEqual(4);

    await app.arrayInput.fill('2, 1');
    await app.arrayInput.press('Enter');

    await app.expectBars([2, 1]);
    await app.expectStep(1);
    await expect(app.playButton, 'playback is stopped').toBeVisible();
    await app.expectTotal(engineSteps('quick-sort', [2, 1]).length);
    await app.expectNoStepChangeFor(600);
    const s = await app.state();
    expect(s.step).toBe(1);
    expect(s.outcome).toBeNull();
  });

  test('rapid consecutive input changes leave only the last result visible', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    const sequence = [[1, 2, 3], [9, 8], [5, 5, 5, 5], [7], [6, 4, 2, 0, -2]];
    for (const a of sequence) {
      await app.arrayInput.fill(a.join(', '));
      await app.arrayInput.press('Enter');
    }
    const last = sequence[sequence.length - 1];
    await app.expectBars(last);
    await app.expectTotal(engineSteps('bubble-sort', last).length);
    await app.expectStep(1);
    await expect(app.arrayInput).toHaveValue(last.join(', '));
  });

  test('changing language keeps the execution position and highlights the right line in every language', async ({ app }) => {
    const array = [4, 3, 2, 1];
    await app.selectAlgorithm('quick-sort');
    await app.enterAndVisualize(array);
    await app.advance(17);
    await app.expectStep(18);
    const step = engineSteps('quick-sort', array)[17];

    for (const lang of ['java', 'python', 'c', 'cpp'] as const) {
      await app.setLanguage(lang);
      await app.expectStep(18);
      const line = expectedLine('quick-sort', lang, step);
      expect((await app.state()).activeLine, lang).toEqual(line);
      await expect(app.page.getByTestId('current-action')).toHaveText(step.message);
    }
  });

  test('with no trace (input needs attention) the playback controls are disabled', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([5, 1, 4, 2]);
    await app.selectAlgorithm('binary-search');
    await expect(app.inputIssue).toBeVisible();
    for (const control of [app.playButton, app.resetButton, app.nextButton, app.previousButton]) await expect(control).toBeDisabled();
  });
});
