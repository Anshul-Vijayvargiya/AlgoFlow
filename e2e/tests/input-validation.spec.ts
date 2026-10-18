import { test, expect } from '../fixtures';

const LIN = [4, 2, 9, 7, 5, 1, 8];
const seventeen = Array.from({ length: 17 }, (_, i) => i).join(',');

const INVALID: { name: string; array: string; target: string; field: 'array' | 'target'; message: RegExp }[] = [
  { name: 'not a number', array: 'abc', target: '7', field: 'array', message: /Value 1 \("abc"\) is not a whole number/ },
  { name: 'empty value between commas', array: '1,,2', target: '7', field: 'array', message: /Value 2 is empty/ },
  { name: 'trailing comma', array: '1, 2,', target: '7', field: 'array', message: /Value 3 is empty/ },
  { name: 'leading comma', array: ',1', target: '7', field: 'array', message: /Value 1 is empty/ },
  { name: 'decimal', array: '1.5, 2', target: '7', field: 'array', message: /decimal/ },
  { name: 'space inside a value', array: '1 2, 3', target: '7', field: 'array', message: /contains a space/ },
  { name: 'scientific notation', array: '1e3', target: '7', field: 'array', message: /not a whole number/ },
  { name: 'out of range (positive)', array: '1000, 2', target: '7', field: 'array', message: /out of range/ },
  { name: 'out of range (negative)', array: '-1000', target: '7', field: 'array', message: /out of range/ },
  { name: 'more than 16 values', array: seventeen, target: '7', field: 'array', message: /Too many values \(17\)/ },
  { name: 'empty target', array: '1, 2', target: '', field: 'target', message: /Enter a value for "Target value"/ },
  { name: 'text target', array: '1, 2', target: 'x', field: 'target', message: /not a whole number/ },
  { name: 'decimal target', array: '1, 2', target: '2.5', field: 'target', message: /decimal/ },
  { name: 'out-of-range target', array: '1, 2', target: '5000', field: 'target', message: /out of range/ },
];

test.describe('invalid drafts never replace the valid trace', () => {
  for (const c of INVALID) {
    test(`${c.name}`, async ({ app }) => {
      await app.selectAlgorithm('linear-search');
      await app.enterAndVisualize(LIN, 7);
      const baseline = await app.state();

      await app.type(c.array, c.target);

      await expect(app.inputError).toBeVisible();
      await expect(app.inputError).toHaveAttribute('data-field', c.field);
      await expect(app.inputError).toContainText(c.message);
      await expect(app.visualizeButton, 'Visualize is disabled while the draft is invalid').toBeDisabled();
      await expect(app.arrayInput).toHaveAttribute('aria-invalid', c.field === 'array' ? 'true' : 'false');

      const after = await app.state();
      expect(after.step).toBe(baseline.step);
      expect(after.total).toBe(baseline.total);
      expect(after.bars.map(b => b.value), 'the displayed trace is still the last valid one').toEqual(LIN);
    });
  }

  test('Enter on an invalid array applies nothing', async ({ app }) => {
    await app.selectAlgorithm('linear-search');
    await app.enterAndVisualize(LIN, 7);
    await app.type('abc', 7);
    await app.arrayInput.press('Enter');
    await expect(app.inputError).toBeVisible();
    expect(await app.barValues()).toEqual(LIN);
    await app.expectTotal((await app.state()).total);
  });

  test('the error clears as soon as the draft is valid again, and Visualize applies the latest values', async ({ app }) => {
    await app.selectAlgorithm('linear-search');
    await app.type('1, x', 3);
    await expect(app.inputError).toBeVisible();
    await app.type('9, 8, 7', 8);
    await expect(app.inputError).toHaveCount(0);
    await expect(app.visualizeButton).toBeEnabled();
    await app.visualizeButton.click();
    await app.expectBars([9, 8, 7]);
    await expect(app.page.getByTestId('target-pill')).toHaveText('target = 8');
  });
});

test.describe('accepted input', () => {
  test('a blank array is an empty array (no bars, no error)', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([]);
    await expect(app.bars).toHaveCount(0);
    await expect(app.inputError).toHaveCount(0);
  });

  test('"[ ]" brackets are accepted', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.type('[3, 1, 2]');
    await app.visualizeButton.click();
    await app.expectBars([3, 1, 2]);
  });

  test('16 values (the maximum) are accepted and every bar fits inside the chart', async ({ app }) => {
    const sixteen = Array.from({ length: 16 }, (_, i) => ((i * 7) % 31) - 9);
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize(sixteen);
    const s = await app.state();
    expect(s.bars).toHaveLength(16);
    const box = await app.bars.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, r: r.x + r.width }; }));
    const chart = s.chart!;
    for (const b of box) {
      expect(b.x).toBeGreaterThanOrEqual(chart.x - 1);
      expect(b.r).toBeLessThanOrEqual(chart.x + chart.w + 1);
    }
  });

  test('negative values render with strictly ordered heights (minimum shortest, maximum tallest)', async ({ app }) => {
    await app.selectAlgorithm('linear-search');
    await app.enterAndVisualize([3, -1, -8, 0, 12], 12);
    const s = await app.state();
    const byHeight = [...s.bars].sort((a, b) => a.height - b.height).map(b => b.value);
    expect(byHeight).toEqual([-8, -1, 0, 3, 12]);
  });

  test('Enter in the array field applies valid input', async ({ app }) => {
    await app.selectAlgorithm('linear-search');
    await app.type([9, 8, 7], 8);
    await app.arrayInput.press('Enter');
    await app.expectBars([9, 8, 7]);
  });
});
