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

  test('a swap highlights all three lines of the C/Java temp swap, and the single swap line in C++/Python', async ({ app }) => {
    const array = [2, 1];
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize(array);
    const swap = engineSteps('bubble-sort', array).findIndex(s => s.type === 'swap');
    await app.advance(swap);
    await app.expectStep(swap + 1);

    const expected: [Parameters<typeof app.setLanguage>[0], string[]][] = [
      ['c', ['int temp = arr[j];', 'arr[j] = arr[j + 1];', 'arr[j + 1] = temp;']],
      ['java', ['int temp = arr[j];', 'arr[j] = arr[j + 1];', 'arr[j + 1] = temp;']],
      ['cpp', ['swap(arr[j], arr[j + 1]);']],
      ['python', ['arr[j], arr[j + 1] = arr[j + 1], arr[j]']],
    ];
    for (const [lang, lines] of expected) {
      await app.setLanguage(lang);
      const highlighted = app.page.locator('[data-line][data-active="true"] pre');
      await expect(highlighted, lang).toHaveText(lines);
      // assistive technology and the scroll target still point at the statement's first line
      await expect(app.page.locator('[data-line][aria-current="step"] pre'), lang).toHaveText(lines[0]);
    }
  });

  // Audit R1: at 100 ms per step a fixed 300 ms height animation outlived its step. The animation now fits inside the
  // step interval, and reduced-motion users get no transition at all.
  test('bar animations fit inside one playback step and respect prefers-reduced-motion', async ({ app }) => {
    await app.selectAlgorithm('insertion-sort');
    await app.enterAndVisualize([9, 8, 7, 6, 5]);
    const barTransition = () =>
      app.page.locator('[data-bar-index] div[style*="height"]').first().evaluate(el => {
        const cs = getComputedStyle(el);
        return { property: cs.transitionProperty, duration: cs.transitionDuration };
      });

    expect(await barTransition()).toEqual({ property: 'height, background-color, box-shadow', duration: '0.3s' }); // default 700 ms
    await app.speedSlider.fill('1200'); // fastest: 100 ms per step
    await expect(app.speedSlider).toHaveAttribute('aria-valuetext', '100 ms per step');
    expect(await barTransition()).toEqual({ property: 'height, background-color, box-shadow', duration: '0.06s' });

    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await barTransition()).property).toBe('none');
    await app.page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  // Audit M-1: the result badge used AnimatePresence mode="wait", so after a TRUE→FALSE (or FALSE→TRUE) change the
  // previous result stayed on screen for its exit animation (measured up to ~300 ms, i.e. most of a fast step).
  for (const speedMs of [700, 100]) {
    test(`during playback at ${speedMs} ms per step, the result badge never shows another step's result`, async ({ app }) => {
      const array = [2, 5, 8, 12, 15, 19, 24];
      const target = 27; // check-equal FALSE → check-less TRUE pairs: the result flips between consecutive steps
      await app.selectAlgorithm('two-pointer');
      await app.enterAndVisualize(array, target);
      await app.speedSlider.fill(String(1300 - speedMs));
      await expect(app.speedSlider).toHaveAttribute('aria-valuetext', `${speedMs} ms per step`);
      const steps = engineSteps('two-pointer', array, target);
      const expected = steps.map(s => (s.result === 'true' ? 'TRUE' : s.result === 'false' ? 'FALSE' : null));
      const flips = expected.filter((r, i) => i > 0 && r && expected[i - 1] && r !== expected[i - 1]).length;
      expect(flips, 'the trace exercises consecutive opposite results').toBeGreaterThan(0);

      // sample every animation frame: the step on screen and the badge(s) on screen
      await app.page.evaluate(() => {
        const w = window as unknown as { __frames: { step: number; badges: string[] }[]; __stop?: boolean };
        w.__frames = [];
        const tick = () => {
          const m = document.querySelector('[data-testid="step-counter"]')?.textContent?.match(/(\d+)\s*\/\s*\d+/);
          const badges = [...document.querySelectorAll('[data-testid="step-result"]')].map(b => b.textContent?.trim() ?? '');
          if (m) w.__frames.push({ step: Number(m[1]), badges });
          if (!w.__stop) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await app.playButton.click();
      // the whole run takes steps × speed; wait for it explicitly (the default 5 s expect timeout is shorter at 700 ms)
      await expect(app.stepCounter).toHaveAttribute('data-step', String(steps.length), { timeout: steps.length * speedMs + 10_000 });
      const frames = await app.page.evaluate(() => {
        const w = window as unknown as { __frames: { step: number; badges: string[] }[]; __stop?: boolean };
        w.__stop = true;
        return w.__frames;
      });

      const wrong = frames.filter(f => f.badges.join('+') !== (expected[f.step - 1] ?? ''));
      expect(frames.filter(f => expected[f.step - 1]).length, 'frames with a result were sampled').toBeGreaterThan(0);
      expect(
        wrong.slice(0, 5).map(f => `step ${f.step}: shows [${f.badges}] expected ${expected[f.step - 1]}`),
        `${wrong.length} of ${frames.length} frames show a badge that does not match the step`
      ).toEqual([]);
    });
  }

  test('with no trace (input needs attention) the playback controls are disabled', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([5, 1, 4, 2]);
    await app.selectAlgorithm('binary-search');
    await expect(app.inputIssue).toBeVisible();
    for (const control of [app.playButton, app.resetButton, app.nextButton, app.previousButton]) await expect(control).toBeDisabled();
  });
});
