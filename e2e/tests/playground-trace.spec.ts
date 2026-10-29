import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { RECORDED_TRACES } from '../../src/execution/recordedTraces.generated';
import { TRACE_SAMPLES } from '../../src/execution/traceSamples';
import { heapsByStep } from '../../src/execution/traceHeap';
import { valueText } from '../../src/pages/playground/traceModel';

/**
 * The Playground's step-by-step view on the mock API, which (like the server's fake provider) never runs code: only
 * the example programs, with their example input, have traces — recorded with the real tracer and labelled so.
 * Every expectation of what a step shows comes from that recorded trace.
 */
const source = (page: Page) => page.getByRole('textbox', { name: 'Source code' });
const visualize = (page: Page) => page.getByRole('button', { name: 'Visualize' });
const view = (page: Page) => page.getByTestId('trace-view');
const next = (page: Page) => page.getByRole('button', { name: 'Next step' });
const position = async (page: Page) => Number(await page.getByTestId('trace-position').getAttribute('data-position'));

async function openPython(page: Page) {
  await page.goto('/playground');
  await expect(page.getByRole('button', { name: 'Run Code' })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Language to run' }).selectOption('python');
}

async function visualizeExample(page: Page, id: string) {
  const sample = TRACE_SAMPLES.find(s => s.id === id)!;
  await page.getByRole('combobox', { name: 'Load an example program' }).selectOption(id);
  await expect(source(page)).toHaveValue(sample.source);
  await visualize(page).click();
  await expect(view(page)).toBeVisible();
  return sample;
}

/** what the view shows now: the active line, the frames (innermost first) and the output */
const shown = (page: Page) =>
  page.evaluate(() => {
    const active = [...document.querySelectorAll<HTMLElement>('[data-testid="trace-code"] li[data-active="true"]')];
    return {
      lines: active.map(li => Number(li.dataset.line)),
      frames: [...document.querySelectorAll<HTMLElement>('[data-testid="trace-frames"] > li[data-frame]')].map(li => li.dataset.frame!),
      stdout: document.querySelector('[data-testid="trace-stdout"]')!.textContent!,
      position: document.querySelector('[data-testid="trace-position"]')!.textContent!,
    };
  });

test.describe('step-by-step trace (Python)', () => {
  test('only for Python: other languages say so, and in test mode only the examples can be visualized', async ({ app, page }) => {
    void app;
    await page.goto('/playground');
    await expect(visualize(page)).toBeDisabled();
    await expect(page.getByText('Step-by-step visualization is available for Python.')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Load an example program' })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Language to run' }).selectOption('python');
    await expect(visualize(page)).toBeEnabled();
    await expect(page.getByTestId('playground-recorded-traces')).toContainText('only the example programs');
  });

  test('every step of the factorial example: the line, the call stack and the output, as recorded', async ({ app, page }) => {
    void app;
    await openPython(page);
    await visualizeExample(page, 'factorial');
    const trace = RECORDED_TRACES.factorial;
    await expect(page.getByTestId('trace-recorded')).toContainText('recorded trace of this example program');
    await expect(page.getByTestId('trace-status')).toHaveText(`Finished with exit code 0 · ${trace.steps.length} steps`);

    for (const [i, step] of trace.steps.entries()) {
      const now = await shown(page);
      expect(now.lines, `step ${i + 1}`).toEqual([step.line]);
      expect(now.frames, `step ${i + 1}`).toEqual([...step.frames].reverse().map(f => f.name));
      expect(now.stdout, `step ${i + 1}`).toBe(trace.stdout.slice(0, step.stdoutLength) || '(no output yet)');
      expect(now.position).toMatch(new RegExp(`^Step ${i + 1} of ${trace.steps.length} · line ${step.line} · `));
      if (step.event === 'return') await expect(page.getByTestId('trace-return')).toHaveText(`returns ${valueText(step.returnValue!, heapsByStep(trace)[i])}`);
      await next(page).click();
    }
    // the end: the frames are gone and the last line's output is there
    const end = await shown(page);
    expect(end).toEqual({ lines: [], frames: [], stdout: '4! = 24\n', position: 'The program has ended' });
    await expect(next(page)).toBeDisabled();
    // the deepest point of the recursion: four factorial frames under the global one
    expect(Math.max(...trace.steps.map(s => s.frames.length))).toBe(5);
  });

  test('variables: values as recorded, and a swap marks the list (and the caller’s alias) as changed', async ({ app, page }) => {
    void app;
    await openPython(page);
    await visualizeExample(page, 'bubble-sort');
    const trace = RECORDED_TRACES['bubble-sort'];
    const heaps = heapsByStep(trace);
    const swap = trace.steps.findIndex((_, i) => i > 0 && trace.steps[i - 1].line === 6);
    await page.getByRole('slider', { name: 'Step' }).fill(String(swap));
    await expect.poll(() => position(page)).toBe(swap);

    const inner = trace.steps[swap].frames.at(-1)!;
    const arr = page.locator('[data-frame="bubble_sort"] [data-variable="arr"]');
    await expect(arr).toHaveAttribute('data-changed', 'true');
    await expect(arr.locator('dd')).toHaveAttribute('data-value-text', valueText(inner.locals.arr, heaps[swap]));
    await expect(page.locator('[data-frame="<module>"] [data-variable="numbers"]')).toHaveAttribute('data-changed', 'true');
    // the loop counters are plain ints
    await expect(page.locator('[data-frame="bubble_sort"] [data-variable="n"] dd')).toHaveAttribute('data-value-text', '4');
  });

  test('playback: Last, First, Play to the end, Pause, the slider and the keyboard', async ({ app, page }) => {
    void app;
    await openPython(page);
    await visualizeExample(page, 'linked-list');
    const total = RECORDED_TRACES['linked-list'].steps.length;

    await page.getByRole('button', { name: 'Last step' }).click();
    await expect(page.getByTestId('trace-position')).toHaveText('The program has ended');
    await expect(page.getByTestId('trace-stdout')).toHaveText('sum: 6\n');
    await page.getByRole('button', { name: 'First step' }).click();
    expect(await position(page)).toBe(0);

    await page.getByLabel('Speed').selectOption({ label: 'Fast' });
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByTestId('trace-position')).toHaveText('The program has ended', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

    // Play from the end starts again; Pause holds the position
    await page.getByRole('button', { name: 'Play' }).click();
    await expect.poll(() => position(page)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Pause' }).click();
    const held = await position(page);
    await page.waitForTimeout(800);
    expect(await position(page)).toBe(held);
    expect(held).toBeLessThan(total);

    // keyboard: Enter on Next, arrows on the slider
    await page.getByRole('button', { name: 'First step' }).click();
    await next(page).focus();
    await page.keyboard.press('Enter');
    expect(await position(page)).toBe(1);
    await page.getByRole('slider', { name: 'Step' }).focus();
    await page.keyboard.press('ArrowRight');
    expect(await position(page)).toBe(2);
    await page.keyboard.press('End');
    await expect(page.getByTestId('trace-position')).toHaveText('The program has ended');
  });

  test('editing after a trace: the view keeps the traced program and says it is out of date', async ({ app, page }) => {
    void app;
    await openPython(page);
    const sample = await visualizeExample(page, 'factorial');
    await expect(page.getByTestId('trace-stale')).toHaveCount(0);
    await source(page).fill(sample.source + 'print("more")\n');
    await expect(page.getByTestId('trace-stale')).toBeVisible();
    await expect(page.locator('[data-testid="trace-code"] li')).toHaveCount(sample.source.split('\n').length);
    await page.getByLabel('STANDARD INPUT (STDIN)').fill('1');
    await source(page).fill(sample.source);
    await expect(page.getByTestId('trace-stale')).toBeVisible();
    await page.getByLabel('STANDARD INPUT (STDIN)').fill('');
    await expect(page.getByTestId('trace-stale')).toHaveCount(0);
  });

  test('any other program in test mode: not traced, with the reason — never a made-up trace', async ({ app, page }) => {
    void app;
    await openPython(page);
    await visualize(page).click();
    await expect(page.getByTestId('trace-failed')).toHaveText(/^Not traced: Test mode: this server does not run code/);
    await expect(view(page)).toHaveCount(0);
    // an example with other input is not the recorded run either
    await page.getByRole('combobox', { name: 'Load an example program' }).selectOption('read-and-print');
    await page.getByLabel('STANDARD INPUT (STDIN)').fill('1 2');
    await visualize(page).click();
    await expect(page.getByTestId('trace-failed')).toBeVisible();
    await expect(view(page)).toHaveCount(0);
  });

  test('the runtime-error example: the exception step, the error line and the traceback at the end', async ({ app, page }) => {
    void app;
    await openPython(page);
    await visualizeExample(page, 'runtime-error');
    const trace = RECORDED_TRACES['runtime-error'];
    await expect(page.getByTestId('trace-status')).toHaveText(`Stopped by ZeroDivisionError on line 2 · ${trace.steps.length} steps`);
    const raised = trace.steps.findIndex(s => s.event === 'exception');
    await page.getByRole('slider', { name: 'Step' }).fill(String(raised));
    await expect(page.getByTestId('trace-exception')).toContainText('raises ZeroDivisionError');
    await page.getByRole('button', { name: 'Last step' }).click();
    await expect(page.getByTestId('trace-stderr')).toContainText('ZeroDivisionError');
    await expect(page.getByTestId('trace-stderr')).toContainText('File "main.py", line 2, in average');
    await expect(page.getByTestId('trace-stdout')).toHaveText('6.0\n');
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA with a trace shown mid-way: no violations (${theme})`, async ({ app, page }) => {
      void app;
      await page.getByRole('banner').getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await openPython(page);
      await visualizeExample(page, 'linked-list');
      await page.getByRole('slider', { name: 'Step' }).fill('12');
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('phone width: no horizontal page scroll, and the playback controls fit', async ({ app, page }) => {
    void app;
    await page.setViewportSize({ width: 390, height: 844 });
    await openPython(page);
    await visualizeExample(page, 'bubble-sort');
    await page.getByRole('slider', { name: 'Step' }).fill('20');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const rights = await page.locator('[aria-label="Trace playback"] :is(button, input, select)').evaluateAll(els => els.map(e => e.getBoundingClientRect().right));
    for (const right of rights) expect(right).toBeLessThanOrEqual(390);
  });
});
