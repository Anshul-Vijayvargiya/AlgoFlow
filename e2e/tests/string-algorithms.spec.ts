import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type AlgorithmId, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * The seven string algorithms (Strings), through the real UI. Every expectation of what a step shows comes from the
 * engine's own trace for the same input; the answers themselves are covered by the unit tests
 * (stringAlgorithms.test.ts).
 */
const STRINGS: { id: AlgorithmId; name: string; custom: string[] }[] = [
  { id: 'roman-to-integer', name: 'Roman to Integer', custom: ['XLIV'] },
  { id: 'longest-common-prefix', name: 'Longest Common Prefix', custom: ['interstellar, internet, interval'] },
  { id: 'valid-parentheses', name: 'Valid Parentheses', custom: ['{[(])}'] },
  { id: 'find-first-occurrence', name: 'Find the Index of the First Occurrence', custom: ['mississippi', 'issip'] },
  { id: 'length-of-last-word', name: 'Length of Last Word', custom: ['  hello there  '] },
  { id: 'add-binary', name: 'Add Binary', custom: ['1101', '111'] },
  { id: 'valid-palindrome', name: 'Valid Palindrome', custom: ['No lemon, no melon'] },
  // the first deletion fails and the second works: both candidates are drawn
  { id: 'valid-palindrome-ii', name: 'Valid Palindrome II', custom: ['cbbcc'] },
];

const engine = (id: AlgorithmId, texts: string[]) => definition(id).generateSteps([], { texts });
const fieldsOf = (id: AlgorithmId) => definition(id).inputSpec!.texts!;
const field = (page: Page, label: string) => page.locator(`#text-input-${label}`);

async function enter(page: Page, id: AlgorithmId, texts: string[]) {
  for (const [i, f] of fieldsOf(id).entries()) await field(page, f.label).fill(texts[i]);
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(id, texts).length));
}

interface TextUi {
  step: number;
  line: number | null;
  operation: string | null;
  rows: { name: string; text: string; marks: [number, string][]; pointers: [string, number][] }[];
  stack: { items: string[]; action: string } | null;
  cells: Record<string, string>;
  result: string | null;
}

/** what the text visualizer shows, at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<TextUi[]> =>
  page.evaluate(async count => {
    const read = (): TextUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const stack = document.querySelector<HTMLElement>('[data-testid="text-stack"]');
      return {
        step: Number(document.querySelector<HTMLElement>('[data-testid="step-counter"]')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        operation: document.querySelector('[data-testid="text-operation"]')?.textContent?.trim() ?? null,
        rows: [...document.querySelectorAll<HTMLElement>('[data-testid="text-row"]')].map(r => {
          const cells = [...r.querySelectorAll<HTMLElement>('[data-char]')];
          return {
            name: r.dataset.row!,
            text: cells.map(c => c.dataset.char).join(''),
            marks: cells.filter(c => c.dataset.mark).map(c => [Number(c.dataset.index), c.dataset.mark!] as [number, string]),
            pointers: [...r.querySelectorAll<HTMLElement>('[data-pointer]')].flatMap(p => p.dataset.pointer!.split(',').map(n => [n, Number(p.dataset.index)] as [string, number])),
          };
        }),
        stack: stack ? { items: [...stack.querySelectorAll<HTMLElement>('[data-stack-item]')].map(i => i.dataset.stackItem!), action: stack.dataset.action ?? '' } : null,
        cells: Object.fromEntries(
          [...document.querySelectorAll<HTMLElement>('[data-testid="text-visualizer"] [data-number-cell]')].map(e => [
            e.dataset.numberCell!,
            e.querySelector('[data-number-value]')!.childNodes[0].textContent!.trim(),
          ])
        ),
        result: document.querySelector('[data-testid="text-result"]')?.textContent?.trim() ?? null,
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
function expected(id: AlgorithmId, lang: ProgrammingLanguage, s: ExecutionStep, k: number): TextUi {
  const view = s.text!;
  // pointers on the same index share one label (in the order the step lists them)
  const pointersOf = (row: (typeof view.rows)[number]) => {
    const byIndex = new Map<number, string[]>();
    for (const p of row.pointers ?? []) byIndex.set(p.index, [...(byIndex.get(p.index) ?? []), p.name]);
    return [...byIndex].sort((a, b) => a[0] - b[0]).flatMap(([index, names]) => names.map(n => [n, index] as [string, number]));
  };
  return {
    step: k + 1,
    line: resolveCodeRef(definition(id), lang, s.codeRef),
    operation: s.actionLabel ?? null,
    rows: view.rows.map(r => ({ name: r.name, text: r.text, marks: (r.marks ?? []).map(m => [m.index, m.mark] as [number, string]), pointers: pointersOf(r) })),
    stack: view.stack ? { items: [...view.stack.items], action: view.stack.action ?? '' } : null,
    cells: Object.fromEntries((view.cells ?? []).map(c => [c.name, c.value === null ? '—' : String(c.value)])),
    result: view.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Strings in the sidebar', () => {
  test('a STRINGS category lists all eight, and each opens its own text visualization', async ({ app, page }) => {
    await expect(app.sidebar.getByText('STRINGS', { exact: true })).toBeVisible();
    for (const { id, name } of STRINGS) {
      await app.selectAlgorithm(id);
      await expect(page.getByTestId('text-visualizer')).toBeVisible();
      await expect(page.getByTestId('text-input-panel')).toBeVisible();
      // no array: no bars, no Size
      await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
      await expect(app.sizeSelect).toHaveCount(0);
      await expect(app.heading).toHaveText(name);
    }
  });
});

for (const { id, name, custom } of STRINGS) {
  test.describe(name, () => {
    test('every step of a custom input: rows, marks, pointers, stack, values, the code line and the answer, as traced', async ({ app, page }) => {
      await app.selectAlgorithm(id);
      const steps = engine(id, custom);
      await enter(page, id, custom);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
      for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected(id, 'cpp', s, k));
      await expect(page.getByTestId('text-result')).toHaveAttribute('data-result-kind', steps[steps.length - 1].text!.result!.kind);
    });
  });
}

test.describe('Valid Palindrome II', () => {
  test('abca: the first deletion works, so the second is never tried; abc: both fail; racecar needs none', async ({ app, page }) => {
    await app.selectAlgorithm('valid-palindrome-ii');
    const card = (name: string) => page.locator(`[data-testid="text-visualizer"] [data-number-cell="${name}"] [data-number-value]`);

    await enter(page, 'valid-palindrome-ii', ['abca']);
    await app.goToLastStep();
    await expect(page.getByTestId('text-result')).toHaveText(`"abca" becomes a palindrome by deleting 'b' at index 1`);
    await expect(page.getByTestId('text-result')).toHaveAttribute('data-result-kind', 'yes');
    await expect(card('delete left')).toHaveText('true');
    await expect(card('delete right')).toHaveText('not needed');
    // the code line of the first call: the || returns there
    await expect(page.locator('[data-line][aria-current="step"] pre')).toContainText('left + 1, right');

    await enter(page, 'valid-palindrome-ii', ['abc']);
    await app.goToLastStep();
    await expect(page.getByTestId('text-result')).toHaveAttribute('data-result-kind', 'no');
    await expect(card('delete left')).toHaveText('false');
    await expect(card('delete right')).toHaveText('false');
    await expect(page.locator('[data-testid="text-row"]')).toHaveCount(3);
    await expect(page.locator('[data-row="s"] [data-mark="mismatch"]')).toHaveCount(2);

    await enter(page, 'valid-palindrome-ii', ['racecar']);
    await app.goToLastStep();
    await expect(page.getByTestId('text-result')).toHaveText('"racecar" is already a palindrome: no deletion needed');
    await expect(page.locator('[data-testid="text-row"]')).toHaveCount(1);
  });

  test('Valid Palindrome and Valid Palindrome II are separate entries', async ({ app, page }) => {
    await app.selectAlgorithm('valid-palindrome');
    await expect(page.getByTestId('text-input-panel')).toContainText('printable ASCII');
    await app.selectAlgorithm('valid-palindrome-ii');
    await expect(page.locator('#text-input-s')).toHaveValue('abca');
  });

  for (const lang of ['c', 'java', 'python'] as const) {
    test(`the highlighted line follows the trace through both candidate checks (${lang})`, async ({ app, page }) => {
      await app.selectAlgorithm('valid-palindrome-ii');
      await app.setLanguage(lang);
      const steps = engine('valid-palindrome-ii', ['cbbcc']);
      await enter(page, 'valid-palindrome-ii', ['cbbcc']);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(definition('valid-palindrome-ii'), lang, s.codeRef)));
    });
  }
});

test.describe('code lines', () => {
  // Add Binary has statements over several lines (Python's two-line digit additions, C's three-line return)
  for (const lang of ['c', 'java', 'python'] as const) {
    test(`Add Binary: the highlighted line follows the trace (${lang})`, async ({ app, page }) => {
      await app.selectAlgorithm('add-binary');
      await app.setLanguage(lang);
      const steps = engine('add-binary', ['11', '1']);
      await enter(page, 'add-binary', ['11', '1']);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(definition('add-binary'), lang, s.codeRef)));
    });
  }
});

test.describe('input', () => {
  test('invalid strings are refused next to the field, with Visualize disabled; fixing them enables it', async ({ app, page }) => {
    for (const [id, label, text, message] of [
      ['roman-to-integer', 's', 'IIII', 'is not a valid Roman numeral'],
      ['valid-parentheses', 's', '(a)', 'contains "a"'],
      ['find-first-occurrence', 'needle', '', 'Enter a value for "needle"'],
      ['length-of-last-word', 's', '   ', 'needs at least one word'],
      ['add-binary', 'a', '0101', 'leading zero'],
      ['longest-common-prefix', 'strs', 'a, b, c, d, e, f, g', '1 to 6 words'],
      ['valid-palindrome', 's', 'x'.repeat(33), 'too long'],
    ] as const) {
      await app.selectAlgorithm(id);
      const input = field(page, label);
      await input.fill(text);
      await expect(page.getByTestId('input-error')).toContainText(message);
      await expect(page.getByTestId('input-error')).toHaveAttribute('data-field', label);
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    await field(page, 's').fill('racecar');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
  });

  test('spaces are kept as typed and shown as visible cells; Enter applies the input', async ({ app, page }) => {
    await app.selectAlgorithm('length-of-last-word');
    await field(page, 's').fill(' ab  ');
    await field(page, 's').press('Enter');
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine('length-of-last-word', [' ab  ']).length));
    await expect(page.locator('[data-row="s"] [data-char]')).toHaveCount(5);
    await expect(page.locator('[data-row="s"] [data-char=" "]').first()).toHaveText('␣');
    await app.goToLastStep();
    await expect(page.getByTestId('text-result')).toHaveText('The last word is "ab": length 2');
  });

  test('Randomize loads another example; a custom input is kept for Restore', async ({ app, page }) => {
    await app.selectAlgorithm('add-binary');
    await enter(page, 'add-binary', ['101', '1']);
    await page.getByRole('button', { name: 'Randomize' }).click();
    await expect(page.getByTestId('input-notice')).toContainText('Your input (a = "101", b = "1") was replaced by an example');
    const examples = definition('add-binary').inputSpec!.textExamples!.map(e => e.join('+'));
    expect(examples).toContain(`${await field(page, 'a').inputValue()}+${await field(page, 'b').inputValue()}`);
    await page.locator('#restore-input').click();
    await expect(field(page, 'a')).toHaveValue('101');
    await expect(field(page, 'b')).toHaveValue('1');
    await expect(page.getByTestId('input-notice')).toHaveCount(0);
  });
});

test.describe('playback, themes and layout', () => {
  test('Play runs Valid Parentheses to its answer; Previous steps back; Reset returns to the start', async ({ app, page }) => {
    await app.selectAlgorithm('valid-parentheses');
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('text-result')).toHaveText('"([]){}" is valid', { timeout: 20_000 });
    const total = await app.totalSteps();
    await app.expectStep(total);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('text-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.getByTestId('text-stack')).toHaveAttribute('data-action', '');
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA mid-trace, with a stack and with aligned rows: no violations (${theme})`, async ({ app, page }) => {
      test.slow(); // several full-page scans
      await page.locator('#header-theme-select').selectOption(theme);
      for (const [id, at] of [['valid-parentheses', 6], ['find-first-occurrence', 9], ['add-binary', 14]] as const) {
        await app.selectAlgorithm(id);
        await app.advance(at);
        await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
        expect(await violations(page), `${id} (${theme})`).toEqual([]);
      }
    });
  }

  test('phone width: no horizontal page scroll; a long string scrolls inside its own focusable region', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.selectAlgorithm('valid-palindrome');
    await app.advance(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const region = page.getByRole('region', { name: 'Strings at this step' });
    await expect(region).toBeVisible();
    const { scroll, client } = await region.evaluate(e => ({ scroll: e.scrollWidth, client: e.clientWidth }));
    expect(scroll).toBeGreaterThan(client); // 30 characters do not fit at 390px: the region scrolls, the page does not
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate(e => e.scrollLeft)).toBeGreaterThan(0);
  });
});
