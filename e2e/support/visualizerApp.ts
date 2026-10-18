import { expect, type Locator, type Page } from '@playwright/test';
import { ALGORITHMS, type AlgorithmId, type ProgrammingLanguage } from './engineTrace';

export interface BarState {
  index: number;
  value: number;
  role: string;
  inRange: boolean;
  pointers: string[];
  height: number;
}

export interface UiState {
  step: number;
  total: number;
  currentAction: string | null;
  message: string | null;
  explanation: string | null;
  comparing: string | null;
  activeLine: { n: number; text: string } | null;
  bars: BarState[];
  outcome: { kind: string; text: string } | null;
  targetPill: string | null;
  pivotPill: string | null;
  offArray: string | null;
  buffers: Record<string, { cells: number[]; active: number[] }>;
  chips: { text: string; x: number; y: number; w: number; h: number }[];
  chart: { x: number; y: number; w: number; h: number } | null;
  inputError: { text: string; field: string; sortAvailable: boolean } | null;
  notice: { kind: string; text: string } | null;
  issue: string | null;
  arrayValue: string | null;
  targetValue: string | null;
  hasTargetField: boolean;
  applyDisabled: boolean | null;
  sizeValue: string | null;
  sizeOptions: number[];
  playLabel: 'Play' | 'Pause' | null;
  playDisabled: boolean | null;
  unmapped: boolean;
  errorCard: string | null;
}

export type Speed = 'fast' | 'medium';
/** slider value → ms per step is `1300 - value` */
const SPEED_SLIDER: Record<Speed, string> = { fast: '1200', medium: '700' };

/**
 * Page object for /visualizer. Controls are located by role + accessible name wherever the app exposes one;
 * `data-testid` is used only for read-outs that have no semantic role (step counter, current action...).
 */
export class VisualizerApp {
  readonly sidebar: Locator;
  readonly heading: Locator;
  readonly arrayInput: Locator;
  readonly targetInput: Locator;
  readonly visualizeButton: Locator;
  readonly sortCopyButton: Locator;
  readonly restoreButton: Locator;
  readonly randomizeButton: Locator;
  readonly sizeSelect: Locator;
  readonly languageSelect: Locator;
  readonly speedSlider: Locator;
  readonly nextButton: Locator;
  readonly previousButton: Locator;
  readonly resetButton: Locator;
  readonly playButton: Locator;
  readonly pauseButton: Locator;
  readonly stepCounter: Locator;
  readonly inputError: Locator;
  readonly inputNotice: Locator;
  readonly inputIssue: Locator;
  readonly outcome: Locator;
  readonly bars: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.getByRole('complementary');
    this.heading = page.getByRole('heading', { level: 1 });
    this.arrayInput = page.getByRole('textbox', { name: 'Array', exact: true });
    this.targetInput = page.getByRole('textbox', { name: /^Target/ });
    this.visualizeButton = page.getByRole('button', { name: 'Visualize' });
    this.sortCopyButton = page.getByRole('button', { name: 'Sort a copy' });
    this.restoreButton = page.getByRole('button', { name: /^Restore/ });
    this.randomizeButton = page.getByRole('button', { name: 'Randomize' });
    this.sizeSelect = page.getByRole('combobox', { name: 'Array size' });
    this.languageSelect = page.getByRole('combobox', { name: 'Programming language' });
    this.speedSlider = page.getByRole('slider', { name: 'Playback speed' });
    this.nextButton = page.getByRole('button', { name: /Next/ });
    this.previousButton = page.getByRole('button', { name: /Previous/ });
    this.resetButton = page.getByRole('button', { name: 'Reset' });
    this.playButton = page.getByRole('button', { name: 'Play', exact: true });
    this.pauseButton = page.getByRole('button', { name: 'Pause', exact: true });
    this.stepCounter = page.getByTestId('step-counter');
    this.inputError = page.getByTestId('input-error');
    this.inputNotice = page.getByTestId('input-notice');
    this.inputIssue = page.getByTestId('input-issue');
    this.outcome = page.getByTestId('outcome-banner');
    this.bars = page.locator('[data-bar-index]');
  }

  async open() {
    await this.page.goto('/visualizer');
    await expect(this.stepCounter).toBeVisible();
  }

  async selectAlgorithm(id: AlgorithmId) {
    const { label, heading } = ALGORITHMS[id];
    const name = new RegExp(`^${label}(?![a-z])`);
    const drawerToggle = this.page.getByRole('button', { name: 'Open algorithm list' });
    if (await drawerToggle.isVisible()) {
      // narrow screens: the algorithm list is in a drawer
      await drawerToggle.click();
      await this.page.getByRole('dialog', { name: 'Algorithm list' }).getByRole('button', { name }).click();
    } else {
      await this.sidebar.getByRole('button', { name }).click();
    }
    await expect(this.heading).toHaveText(heading);
  }

  // ── input ────────────────────────────────────────────────────────────
  /** Types into the real fields (does not apply). */
  async type(array: number[] | string, target?: number | string | null) {
    await this.arrayInput.fill(Array.isArray(array) ? array.join(', ') : array);
    if (target !== undefined && target !== null) await this.targetInput.fill(String(target));
  }

  /** Types and presses the real Visualize button, then waits until the bars show the applied array. */
  async enterAndVisualize(array: number[], target?: number | null) {
    await this.type(array, target);
    await this.visualizeButton.click();
    await this.expectBars(array);
  }

  async expectBars(values: number[]) {
    await expect.poll(async () => (await this.barValues()).join(','), { message: 'bars show the applied array' }).toBe(values.join(','));
  }

  async barValues(): Promise<number[]> {
    return this.bars.evaluateAll(els => els.map(e => Number((e as HTMLElement).dataset.value)));
  }

  // ── playback ─────────────────────────────────────────────────────────
  async next() { await this.nextButton.click(); }
  async previous() { await this.previousButton.click(); }
  async reset() { await this.resetButton.click(); }
  async play() { await this.playButton.click(); }
  async pause() { await this.pauseButton.click(); }
  async setSpeed(speed: Speed) { await this.speedSlider.fill(SPEED_SLIDER[speed]); }
  async setLanguage(lang: ProgrammingLanguage) { await this.languageSelect.selectOption(lang); }

  async stepNumber(): Promise<number> {
    return Number(await this.stepCounter.getAttribute('data-step'));
  }
  async totalSteps(): Promise<number> {
    return Number(await this.stepCounter.getAttribute('data-total'));
  }
  async expectStep(n: number) {
    await expect(this.stepCounter).toHaveAttribute('data-step', String(n));
  }
  async expectTotal(n: number) {
    await expect(this.stepCounter).toHaveAttribute('data-total', String(n));
  }

  /**
   * Moves forward `count` steps by clicking the app's real Next button inside the page (see collectStates). Use this
   * instead of `next()` in a loop: one round trip instead of one per step (per-step clicks timed out in WebKit on a
   * loaded machine).
   */
  async advance(count: number) {
    const start = await this.stepNumber();
    if (count > 0) await this.collectStates(count + 1);
    await this.expectStep(Math.min(start + count, await this.totalSteps()));
  }

  async goToLastStep() {
    const total = await this.totalSteps();
    await this.advance(total - (await this.stepNumber()));
    await this.expectStep(total);
  }

  /**
   * Resolves with the next `count` step changes ({ step, t } with t in ms on the page clock), observed with a
   * MutationObserver on the step counter — no polling and no fixed sleeps.
   */
  async recordStepChanges(count: number, timeoutMs = 15_000): Promise<{ step: number; t: number }[]> {
    return this.page.evaluate(
      ({ count, timeoutMs }) =>
        new Promise<{ step: number; t: number }[]>((resolve, reject) => {
          const el = document.querySelector<HTMLElement>('[data-testid="step-counter"]')!;
          const seen: { step: number; t: number }[] = [];
          const obs = new MutationObserver(() => {
            seen.push({ step: Number(el.dataset.step), t: performance.now() });
            if (seen.length >= count) { obs.disconnect(); clearTimeout(timer); resolve(seen); }
          });
          const timer = setTimeout(() => { obs.disconnect(); reject(new Error(`only ${seen.length}/${count} step changes within ${timeoutMs}ms`)); }, timeoutMs);
          obs.observe(el, { attributes: true, attributeFilter: ['data-step'] });
        }),
      { count, timeoutMs }
    );
  }

  /**
   * Asserts the step counter does NOT change for `windowMs` (used to prove a stopped playback stays stopped).
   * This is a deliberate observation window, not a synchronisation sleep.
   */
  async expectNoStepChangeFor(windowMs: number) {
    const changes = await this.page.evaluate(
      ms =>
        new Promise<number>(resolve => {
          const el = document.querySelector('[data-testid="step-counter"]')!;
          let n = 0;
          const obs = new MutationObserver(() => { n++; });
          obs.observe(el, { attributes: true, attributeFilter: ['data-step'] });
          setTimeout(() => { obs.disconnect(); resolve(n); }, ms);
        }),
      windowMs
    );
    expect(changes, `step counter changed ${changes} time(s) within ${windowMs}ms`).toBe(0);
  }

  /** One consistent snapshot of everything the UI currently shows (single DOM pass). */
  async state(): Promise<UiState> {
    return (await this.collectStates(1))[0];
  }

  /**
   * Reads the UI now and then, `count - 1` more times, each time AFTER clicking the app's real "Next" button
   * (a genuine DOM click event handled by the app's own React handler). Doing the whole walk in one in-page pass
   * costs one browser round trip instead of two per step, which keeps long step-by-step walks fast and stable on
   * a loaded machine. Returned states are in step order.
   */
  async collectStates(count: number): Promise<UiState[]> {
    return this.page.evaluate(async (count) => {
      const text = (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? null;
      const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const button = (prefix: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(prefix));
      const read = (): UiState => {
      const counter = document.querySelector<HTMLElement>('[data-testid="step-counter"]');
      const bars = [...document.querySelectorAll<HTMLElement>('[data-bar-index]')].map(b => ({
        index: Number(b.dataset.barIndex),
        value: Number(b.dataset.value),
        role: b.dataset.role ?? '',
        inRange: b.dataset.inRange === 'true',
        pointers: b.dataset.pointers ? b.dataset.pointers.split(',') : [],
        height: Number(b.dataset.height),
      }));
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      const chart = document.querySelector('[data-testid="array-visualizer"] > div');
      const err = document.querySelector<HTMLElement>('[data-testid="input-error"]');
      const notice = document.querySelector<HTMLElement>('[data-testid="input-notice"]');
      const outcome = document.querySelector<HTMLElement>('[data-testid="outcome-banner"]');
      const sizeSel = document.querySelector<HTMLSelectElement>('select[aria-label="Array size"]');
      const play = button('Play') ?? button('Pause');
      const alertCards = [...document.querySelectorAll('[role="alert"]')].filter(e => e.getAttribute('data-testid') !== 'input-error');
      return {
        step: Number(counter?.dataset.step ?? NaN),
        total: Number(counter?.dataset.total ?? NaN),
        currentAction: text('[data-testid="current-action"]'),
        message: text('[data-testid="step-message"]'),
        explanation: text('[data-testid="step-explanation"]'),
        comparing: text('[data-testid="comparing-values"]'),
        activeLine: active ? { n: Number(active.dataset.line), text: active.querySelector('pre')?.textContent?.trim() ?? '' } : null,
        bars,
        outcome: outcome ? { kind: outcome.dataset.outcomeKind ?? '', text: outcome.textContent?.trim() ?? '' } : null,
        targetPill: text('[data-testid="target-pill"]'),
        pivotPill: text('[data-testid="pivot-pill"]'),
        offArray: text('[data-testid="off-array"]'),
        buffers: Object.fromEntries(
          [...document.querySelectorAll<HTMLElement>('[data-buffer]')].map(b => [
            b.dataset.buffer!,
            {
              cells: [...b.querySelectorAll('[data-buffer-cell]')].map(c => Number(c.textContent)),
              active: [...b.querySelectorAll('[data-buffer-active="true"]')].map(c => Number(c.textContent)),
            },
          ])
        ),
        chips: [...document.querySelectorAll('[data-pointer-chip]')].map(c => ({ text: c.textContent ?? '', ...rect(c) })),
        chart: chart ? rect(chart) : null,
        inputError: err ? { text: err.textContent?.trim() ?? '', field: err.dataset.field ?? '', sortAvailable: [...err.querySelectorAll('button')].some(b => b.textContent?.includes('Sort a copy')) } : null,
        notice: notice ? { kind: notice.dataset.kind ?? '', text: notice.textContent?.trim() ?? '' } : null,
        issue: text('[data-testid="input-issue"]'),
        arrayValue: document.querySelector<HTMLInputElement>('#array-input')?.value ?? null,
        targetValue: document.querySelector<HTMLInputElement>('#target-input')?.value ?? null,
        hasTargetField: Boolean(document.querySelector('#target-input')),
        applyDisabled: document.querySelector<HTMLButtonElement>('#apply-input')?.disabled ?? null,
        sizeValue: sizeSel?.value ?? null,
        sizeOptions: sizeSel ? [...sizeSel.options].map(o => Number(o.value)) : [],
        playLabel: play ? (play.textContent!.trim().startsWith('Play') ? 'Play' : 'Pause') : null,
        playDisabled: play?.disabled ?? null,
        unmapped: document.body.innerText.includes('Unmapped step'),
        errorCard: alertCards[0]?.textContent?.trim() ?? null,
      } as UiState;
      };

      const states: UiState[] = [read()];
      for (let i = 1; i < count; i++) {
        const next = button('Next');
        if (!next || next.disabled) break;
        const before = document.querySelector('[data-testid="step-counter"]')?.getAttribute('data-step');
        next.click();
        // React commits the re-render after the click handler returns: wait (by observation, with a generous
        // bound) until the step counter has really changed before reading the new state.
        for (let tries = 0; tries < 500 && document.querySelector('[data-testid="step-counter"]')?.getAttribute('data-step') === before; tries++) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        states.push(read());
      }
      return states;
    }, count);
  }
}
