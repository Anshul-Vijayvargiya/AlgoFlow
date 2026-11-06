import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { BIT_ALGORITHMS, definition, type AlgorithmId, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * The Bit Manipulation category through the real UI: the values are typed into the number fields; what each step shows
 * (every row's bits, states and values, the discarded bits, the result and the highlighted line) is checked against the
 * engine's own trace for the same input. The answers themselves are checked against a BigInt reference in the unit
 * tests (bitManipulation.test.ts).
 */
const ALGORITHMS: { id: AlgorithmId; fields: string[]; input: number[]; result: string; statement: Record<ProgrammingLanguage, string>; ref: string }[] = [
  { id: 'bitwise-and', fields: ['a', 'b'], input: [-8, 12], result: '-8 & 12 = 8', ref: 'eval-bit', statement: { c: 'result = a & b', cpp: 'result = a & b', java: 'result = a & b', python: 'to_int32(a & b)' } },
  { id: 'bitwise-or', fields: ['a', 'b'], input: [-8, 3], result: '-8 | 3 = -5', ref: 'eval-bit', statement: { c: 'result = a | b', cpp: 'result = a | b', java: 'result = a | b', python: 'to_int32(a | b)' } },
  { id: 'bitwise-xor', fields: ['a', 'b'], input: [-1, 255], result: '-1 ^ 255 = -256', ref: 'eval-bit', statement: { c: 'result = a ^ b', cpp: 'result = a ^ b', java: 'result = a ^ b', python: 'to_int32(a ^ b)' } },
  { id: 'bitwise-not', fields: ['a'], input: [12], result: '~12 = -13', ref: 'eval-bit', statement: { c: 'result = ~a', cpp: 'result = ~a', java: 'result = ~a', python: 'to_int32(~a)' } },
  { id: 'bitwise-left-shift', fields: ['a', 'i'], input: [2147483647, 1], result: '2147483647 << 1 = -2', ref: 'shift', statement: { c: '(uint32_t)a << i', cpp: '(uint32_t)a << i', java: 'result = a << i', python: 'to_int32(a << i)' } },
  { id: 'bitwise-right-shift', fields: ['a', 'i'], input: [-16, 2], result: '-16 >> 2 = -4 (arithmetic; the logical shift gives 1073741820)', ref: 'shift', statement: { c: 'result = a >> i', cpp: 'result = a >> i', java: 'result = a >> i', python: 'to_int32(a >> i)' } },
  { id: 'bit-check-even', fields: ['n'], input: [-3], result: 'ODD: bit 0 of -3 is 1', ref: 'lsb', statement: { c: 'lsb = n & 1', cpp: 'lsb = n & 1', java: 'lsb = n & 1', python: 'lsb = n & 1' } },
  { id: 'bit-get-ith', fields: ['n', 'i'], input: [-2147483648, 31], result: 'Bit 31 of -2147483648 is 1', ref: 'shift', statement: { c: '(uint32_t)n >> i', cpp: '(uint32_t)n >> i', java: 'n >>> i', python: '(n & MASK32) >> i' } },
  { id: 'bit-set-ith', fields: ['n', 'i'], input: [0, 31], result: 'Set bit 31 of 0: -2147483648', ref: 'mask', statement: { c: 'UINT32_C(1) << i', cpp: 'UINT32_C(1) << i', java: 'mask = 1 << i', python: 'mask = 1 << i' } },
  { id: 'bit-clear-ith', fields: ['n', 'i'], input: [-1, 31], result: 'Clear bit 31 of -1: 2147483647', ref: 'mask', statement: { c: '~(UINT32_C(1) << i)', cpp: '~(UINT32_C(1) << i)', java: 'mask = ~(1 << i)', python: '~(1 << i) & MASK32' } },
  { id: 'bit-update-ith', fields: ['n', 'i', 'bit'], input: [13, 2, 0], result: 'Bit 2 of 13: old 1, new 0, result 9', ref: 'combine', statement: { c: '(int32_t)(cleared | placed)', cpp: '(int32_t)(cleared | placed)', java: 'result = cleared | placed', python: 'to_int32(cleared | placed)' } },
  { id: 'bit-clear-last-i', fields: ['n', 'i'], input: [-1, 32], result: 'Clear the last 32 bits of -1: 0', ref: 'mask', statement: { c: '(i == 32) ? 0u', cpp: '(i == 32) ? 0u', java: '(i == 32) ? 0', python: '0 if i == 32' } },
  { id: 'bit-clear-range', fields: ['n', 'l', 'r'], input: [-1, 0, 31], result: 'Clear bits 0 to 31 of -1: 0', ref: 'ones', statement: { c: '(width == 32) ? UINT32_MAX', cpp: '(width == 32) ? UINT32_MAX', java: '(width == 32) ? ~0', python: 'MASK32 if width == 32' } },
];

const steps = (id: AlgorithmId, input: readonly number[]) => definition(id).generateSteps([...input]);
const field = (page: Page, label: string) => page.locator(`#number-input-${label}`);

async function enter(page: Page, id: AlgorithmId, fields: readonly string[], input: readonly number[]) {
  for (const [k, label] of fields.entries()) await field(page, label).fill(String(input[k]));
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(steps(id, input).length));
}

interface BitUi {
  step: number;
  line: number | null;
  operation: string | null;
  rows: { id: string; role: string; binary: string; signed: string; unsigned: string; states: string }[];
  discarded: string | null;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<BitUi[]> =>
  page.evaluate(async count => {
    const read = (): BitUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        operation: document.querySelector('[data-testid="bit-expression"]')?.textContent ?? null,
        rows: [...document.querySelectorAll<HTMLElement>('[data-testid="bit-row"]')].map(r => ({
          id: r.dataset.row!,
          role: r.dataset.role!,
          binary: r.dataset.binary!,
          signed: r.dataset.signed!,
          unsigned: r.dataset.unsigned!,
          // the positions in a state other than unchanged
          states: [...r.querySelectorAll<HTMLElement>('[data-pos]')]
            .filter(c => c.dataset.state !== 'unchanged' && c.dataset.state !== 'pending')
            .map(c => `${c.dataset.pos}:${c.dataset.state}`)
            .sort()
            .join(' '),
        })),
        discarded: document.querySelector<HTMLElement>('[data-testid="bit-discarded"]')?.dataset.bits ?? null,
        result: document.querySelector('[data-testid="bit-result"]')?.textContent?.trim() ?? null,
      };
    };
    const states = [read()];
    for (let i = 1; i < count; i++) {
      const next = [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith('Next'));
      if (!next || next.disabled) break;
      const before = document.querySelector('[data-testid="step-counter"]')?.getAttribute('data-step');
      next.click();
      for (let tries = 0; tries < 500 && document.querySelector('[data-testid="step-counter"]')?.getAttribute('data-step') === before; tries++) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      states.push(read());
    }
    return states;
  }, count);

/** what the engine says a step shows, in the collector's shape */
function expected(id: AlgorithmId, lang: ProgrammingLanguage, s: ExecutionStep, k: number): BitUi {
  const b = s.bits!;
  return {
    step: k + 1,
    line: resolveCodeRef(definition(id), lang, s.codeRef),
    operation: b.operation,
    rows: b.rows.map(r => {
      const pending = r.pendingFrom !== undefined;
      const bits = Array.from({ length: 32 }, (_, n) => 31 - n)
        .map(p => (pending && p >= r.pendingFrom! ? '·' : String((r.value >>> p) & 1)))
        .join('');
      return {
        id: r.id,
        role: r.role,
        binary: bits,
        signed: pending ? '' : String(r.value),
        unsigned: pending ? '' : String(r.value >>> 0),
        states: Object.entries(r.states ?? {})
          .filter(([p]) => !(pending && Number(p) >= r.pendingFrom!))
          .map(([p, state]) => `${p}:${state}`)
          .filter(x => !x.endsWith(':unchanged'))
          .sort()
          .join(' '),
      };
    }),
    discarded: b.discarded?.length ? b.discarded.join('') : null,
    result: b.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Bit Manipulation', () => {
  test('the sidebar: the category between BACKTRACKING and FUNDAMENTALS, its subheadings and 13 algorithms in order', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('BACKTRACKING')).toBeGreaterThan(-1);
    expect(at('BACKTRACKING')).toBeLessThan(at('BIT MANIPULATION'));
    expect(at('BIT MANIPULATION')).toBeLessThan(at('FUNDAMENTALS'));
    await expect(page.getByTestId('algorithm-group')).toHaveText(['Basic Bitwise Operators', 'Basic Bit Manipulation', 'Advanced Bit Manipulation']);
    const names = Object.values(BIT_ALGORITHMS).map(a => a.label);
    expect(names).toHaveLength(13);
    const order = names.map(at);
    expect(order.every(x => x > at('BIT MANIPULATION'))).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(at('Basic Bitwise Operators')).toBeLessThan(at('Binary AND'));
    expect(at('Basic Bit Manipulation')).toBeLessThan(at('Check if Even'));
    expect(at('Advanced Bit Manipulation')).toBeLessThan(at('Clear Last i Bits'));
  });

  for (const a of ALGORITHMS) {
    const label = BIT_ALGORITHMS[a.id].label;

    test(`${label}: opens, runs the typed input and shows every step as traced, with the final output`, async ({ app, page }) => {
      await app.selectAlgorithm(a.id);
      await expect(app.heading).toHaveText(label);
      await expect(page.getByTestId('bit-visualizer')).toBeVisible();
      await expect(page.getByTestId('bit-interpretation')).toContainText("signed 32-bit two's complement");
      await enter(page, a.id, a.fields, a.input);
      const trace = steps(a.id, a.input);
      const shown = await collect(page, trace.length);
      expect(shown.map(u => u.step)).toEqual(trace.map((_, k) => k + 1));
      for (const [k, s] of trace.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected(a.id, 'cpp', s, k));
      await expect(page.getByTestId('bit-result')).toHaveText(a.result);
    });

    test(`${label}: step navigation and every language's code panel`, async ({ app, page }) => {
      await app.selectAlgorithm(a.id);
      await enter(page, a.id, a.fields, a.input);
      const trace = steps(a.id, a.input);
      // Next and Previous move one step; the result appears only on the last step
      await app.next();
      await app.expectStep(2);
      await app.previous();
      await app.expectStep(1);
      await app.goToLastStep();
      await expect(page.getByTestId('bit-result')).toHaveText(a.result);
      await app.previous();
      await app.expectStep(trace.length - 1);
      await expect(page.getByTestId('bit-result')).toHaveCount(0);
      await app.reset();
      await app.expectStep(1);
      // switching the language keeps the step and shows that language's statement on the highlighted line
      const at = trace.findIndex(s => s.codeRef === a.ref);
      await app.advance(at);
      for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
        await app.setLanguage(lang);
        await app.expectStep(at + 1);
        const line = definition(a.id).lineMap[lang]![a.ref];
        await expect(page.locator(`[data-line="${line}"]`)).toContainText(a.statement[lang]);
        await expect(page.locator('[data-line][aria-current="step"]')).toHaveAttribute('data-line', String(line));
      }
    });
  }

  for (const lang of ['c', 'java', 'python'] as const) {
    test(`the highlighted line follows the trace through both shifts' lines (${lang})`, async ({ app, page }) => {
      await app.selectAlgorithm('bitwise-right-shift');
      await app.setLanguage(lang);
      await enter(page, 'bitwise-right-shift', ['a', 'i'], [-16, 2]);
      const trace = steps('bitwise-right-shift', [-16, 2]);
      const shown = await collect(page, trace.length);
      expect(new Set(trace.map(s => s.codeRef)).size).toBe(Object.keys(definition('bitwise-right-shift').lineMap[lang]!).length);
      expect(shown.map(u => u.line)).toEqual(trace.map(s => resolveCodeRef(definition('bitwise-right-shift'), lang, s.codeRef)));
    });
  }

  test('invalid values are refused next to the field with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm('bit-set-ith');
    // each field says what it accepts
    await expect(page.getByTestId('number-input-panel')).toContainText('n: a whole number from -2147483648 to 2147483647 (a signed 32-bit integer)');
    await expect(page.getByTestId('number-input-panel')).toContainText('i: the bit position: a whole number from 0 to 31, counted from the right');
    for (const [label, bad, message] of [
      ['n', '2147483648', 'out of range'],
      ['n', '-2147483649', 'out of range'],
      ['n', '1.5', 'decimal'],
      ['n', 'abc', 'not a whole number'],
      ['i', '32', 'out of range'],
      ['i', '-1', 'out of range'],
    ]) {
      await field(page, label).fill(bad);
      await expect(page.getByTestId('input-error')).toContainText(message);
      await expect(page.getByTestId('input-error')).toHaveAttribute('data-field', label);
      await expect(page.locator('#apply-input')).toBeDisabled();
      await field(page, label).fill('1');
      await expect(page.getByTestId('input-error')).toHaveCount(0);
    }
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('the new bit must be 0 or 1; Clear Last i takes i = 32 but not 33; Clear Range needs l <= r', async ({ app, page }) => {
    await app.selectAlgorithm('bit-update-ith');
    await field(page, 'bit').fill('2');
    await expect(page.getByTestId('input-error')).toHaveAttribute('data-field', 'bit');
    await expect(page.locator('#apply-input')).toBeDisabled();

    await app.selectAlgorithm('bit-clear-last-i');
    await field(page, 'i').fill('33');
    await expect(page.getByTestId('input-error')).toContainText('out of range');
    await field(page, 'i').fill('32');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();

    await app.selectAlgorithm('bit-clear-range');
    await field(page, 'l').fill('5');
    await field(page, 'r').fill('2');
    await expect(page.getByTestId('input-error')).toContainText('"l" (5) must not be greater than "r" (2).');
    await expect(page.getByTestId('input-error')).toHaveAttribute('data-field', 'r');
    await expect(field(page, 'r')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-input')).toBeDisabled();
    await field(page, 'r').fill('5');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('Play runs to the result; Randomize loads an example; switching algorithm loads its own values', async ({ app, page }) => {
    await app.selectAlgorithm('bitwise-xor');
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('bit-result')).toHaveText('12 ^ 10 = 6', { timeout: 30_000 });
    await app.randomizeButton.click();
    await app.expectStep(1);
    const examples = definition('bitwise-xor').inputSpec!.numberExamples!.map(e => `${e[0]},${e[1]}`);
    expect(examples).toContain(`${await field(page, 'a').inputValue()},${await field(page, 'b').inputValue()}`);
    await enter(page, 'bitwise-xor', ['a', 'b'], [1, 2]);
    await app.selectAlgorithm('bit-update-ith');
    await expect(field(page, 'n')).toHaveValue('13');
    await expect(field(page, 'i')).toHaveValue('1');
    await expect(field(page, 'bit')).toHaveValue('1');
    await expect(page.getByTestId('bit-visualizer')).toBeVisible();
    await expect(page.getByTestId('input-issue')).toHaveCount(0);
  });

  test('phone width: the bytes wrap, with no horizontal page scroll', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm('bitwise-and');
    await enter(page, 'bitwise-and', ['a', 'b'], [-8, 12]);
    await app.advance(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // the rows' bits stay inside the visualizer
    const box = (await page.getByTestId('bit-visualizer').boundingBox())!;
    const edge = await page.locator('[data-row="a"] [data-pos="0"]').boundingBox();
    expect(edge!.x + edge!.width).toBeLessThanOrEqual(box.x + box.width);
  });

  test('phone width: the tallest step, three rows, can be scrolled to its last bit and its result', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm('bitwise-right-shift');
    await enter(page, 'bitwise-right-shift', ['a', 'i'], [-16, 2]);
    await app.goToLastStep();
    for (const target of [page.locator('[data-row="logical"] [data-pos="0"]'), page.getByTestId('bit-result')]) {
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeInViewport({ ratio: 0.95 });
    }
    // two bytes to a line
    const y = async (pos: number) => (await page.locator(`[data-row="a"] [data-pos="${pos}"]`).boundingBox())!.y;
    expect(await y(16)).toBe(await y(31));
    expect(await y(15)).toBeGreaterThan(await y(16));
    expect(await y(0)).toBe(await y(15));
  });

  test('desktop width: all 32 bits of a row share one line', async ({ app, page }) => {
    await app.selectAlgorithm('bitwise-and');
    const y = async (pos: number) => (await page.locator(`[data-row="a"] [data-pos="${pos}"]`).boundingBox())!.y;
    expect(await y(0)).toBe(await y(31));
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA with every bit state on screen: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      // selected, set or cleared, and pending
      await app.selectAlgorithm('bitwise-and');
      await enter(page, 'bitwise-and', ['a', 'b'], [-8, 12]);
      await app.advance(4);
      await settle();
      expect(await violations(page), `${theme}: AND`).toEqual([]);
      // flipped
      await app.selectAlgorithm('bitwise-not');
      await app.advance(3);
      await settle();
      expect(await violations(page), `${theme}: NOT`).toEqual([]);
      // shifted, the sign fill, the discarded bits and the final result
      await app.selectAlgorithm('bitwise-right-shift');
      await enter(page, 'bitwise-right-shift', ['a', 'i'], [-16, 2]);
      await app.advance(2);
      await settle();
      expect(await violations(page), `${theme}: shift`).toEqual([]);
      await app.goToLastStep();
      await settle();
      expect(await violations(page), `${theme}: result`).toEqual([]);
    });
  }
});
