import { expect, type Locator, type Page } from '@playwright/test';
import { ALGORITHMS, LIST_ALGORITHMS, NUMBER_ALGORITHMS, type AlgorithmId, type ListParams, type ProgrammingLanguage } from './engineTrace';

export interface BarState {
  index: number;
  value: number;
  role: string;
  inRange: boolean;
  pointers: string[];
  height: number;
}

/** A node box of the linked-list view, as drawn. */
export interface ListNodeState {
  id: string;
  value: number;
  /** position from HEAD, or 'outside' for a node drawn off the HEAD chain */
  position: string;
  role: string;
  isNew: boolean;
  head: boolean;
  tail: boolean;
  pointers: string[];
  next: string;
  linkChanged: boolean;
}

/** What the linked-list view shows (null when an array algorithm is selected). */
export interface ListViewState {
  chain: ListNodeState[];
  outside: (ListNodeState & { reason: string })[];
  nullPointers: string[];
  /** where the HEAD / TAIL chips are drawn: a node id, or 'null' for the NULL terminator */
  headAt: string[];
  tailAt: string[];
  headChanged: boolean;
  tailChanged: boolean;
  changedArrows: string[];
  released: number[];
  valuePill: string | null;
  indexPill: string | null;
}

export interface UiState {
  step: number;
  total: number;
  currentAction: string | null;
  message: string | null;
  explanation: string | null;
  comparing: string | null;
  /** the TRUE / FALSE result badge of the explanation panel, or null when the step has no result */
  result: string | null;
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
  /** the code panel says the current step runs no statement (an explanation-only step) */
  noStatement: boolean;
  errorCard: string | null;
  list: ListViewState | null;
  listValue: string | null;
  valueValue: string | null;
  indexValue: string | null;
  /** the explanation panel's pointer read-outs, e.g. ["HEAD", "→HEAD4 (#0)"] */
  pointerReadouts: [string, string][];
  /** the explanation panel's state read-out ("4 → 7 → NULL" for lists) */
  stateText: string | null;
  /** the number view (null unless a number algorithm is selected) */
  numbers: NumberViewState | null;
}

/** What the number view shows: the value cards, the divisor checks so far and the result banner. */
export interface NumberViewState {
  /** name → value as shown ("—" when not set) and role ('changed', 'current' or '') */
  cells: Record<string, { value: string; role: string }>;
  operation: string | null;
  divisors: { divisor: number; current: boolean; divides: boolean; text: string }[];
  result: { kind: string; text: string } | null;
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
  readonly listInput: Locator;
  readonly valueInput: Locator;
  readonly indexInput: Locator;
  readonly listSizeSelect: Locator;
  readonly listNodes: Locator;
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
    this.listInput = page.getByRole('textbox', { name: 'List values' });
    this.valueInput = page.locator('#value-input');
    this.indexInput = page.getByRole('textbox', { name: 'Position' });
    this.listSizeSelect = page.getByRole('combobox', { name: 'List size' });
    this.listNodes = page.locator('[data-testid="list-chain"] [data-list-node]');
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
    const { label, heading } = ALGORITHMS[id] ?? LIST_ALGORITHMS[id] ?? NUMBER_ALGORITHMS[id];
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

  /** Types the list (and the operation's value / position) and presses Visualize, then waits for the drawn list. */
  async enterList(list: number[], params: ListParams = {}) {
    await this.listInput.fill(list.join(', '));
    if (params.value !== undefined) await this.valueInput.fill(String(params.value));
    if (params.index !== undefined) await this.indexInput.fill(String(params.index));
    await this.visualizeButton.click();
    await this.expectStep(1);
    await expect.poll(async () => (await this.listInput.inputValue()).replace(/\s/g, ''), { message: 'the list was applied' }).toBe(list.join(','));
  }

  async listValues(): Promise<number[]> {
    return this.listNodes.evaluateAll(els => els.map(e => Number((e as HTMLElement).dataset.value)));
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
      const readNumbers = () => {
        if (!document.querySelector('[data-testid="number-visualizer"]')) return null;
        const banner = document.querySelector<HTMLElement>('[data-testid="number-result"]');
        return {
          cells: Object.fromEntries([...document.querySelectorAll<HTMLElement>('[data-number-cell]')].map(e => [
            e.dataset.numberCell!,
            { value: e.querySelector('[data-number-value]')!.childNodes[0].textContent!.trim(), role: e.dataset.role ?? '' },
          ])),
          operation: text('[data-testid="number-operation"]'),
          divisors: [...document.querySelectorAll<HTMLElement>('[data-testid="divisor-checks"] li')].map(e => ({
            divisor: Number(e.dataset.divisor),
            current: e.dataset.current === 'true',
            divides: e.dataset.divides === 'true',
            text: e.textContent?.trim() ?? '',
          })),
          result: banner ? { kind: banner.dataset.resultKind ?? '', text: banner.textContent?.trim() ?? '' } : null,
        };
      };
      const readList = () => {
        const root = document.querySelector('[data-testid="list-visualizer"]');
        if (!root) return null;
        const node = (e: HTMLElement) => ({
          id: e.dataset.listNode!,
          value: Number(e.dataset.value),
          position: e.dataset.position!,
          role: e.dataset.role!,
          isNew: e.dataset.new === 'true',
          head: e.dataset.head === 'true',
          tail: e.dataset.tail === 'true',
          pointers: e.dataset.pointers ? e.dataset.pointers.split(',') : [],
          next: e.dataset.next!,
          linkChanged: e.dataset.linkChanged === 'true',
        });
        const chips = (label: string) =>
          [...root.querySelectorAll<HTMLElement>(`[data-end-chip="${label}"]`)].map(c => {
            // a chip sits in the same unit as its node box, or above the NULL terminator
            const unit = c.parentElement!.parentElement!;
            return unit.querySelector<HTMLElement>('[data-list-node]')?.dataset.listNode ?? 'null';
          });
        const nul = root.querySelector<HTMLElement>('[data-null-terminator="main"]');
        return {
          chain: [...root.querySelectorAll<HTMLElement>('[data-testid="list-chain"] [data-list-node]')].map(node),
          outside: [...root.querySelectorAll<HTMLElement>('[data-testid="list-segment"]')].flatMap(g =>
            [...g.querySelectorAll<HTMLElement>('[data-list-node]')].map(e => ({ ...node(e), reason: (g as HTMLElement).dataset.reason! }))
          ),
          nullPointers: nul?.dataset.pointers ? nul.dataset.pointers.split(',') : [],
          headAt: chips('HEAD'),
          tailAt: chips('TAIL'),
          headChanged: root.querySelector('[data-end-chip="HEAD"][data-changed="true"]') !== null,
          tailChanged: root.querySelector('[data-end-chip="TAIL"][data-changed="true"]') !== null,
          changedArrows: [...root.querySelectorAll<HTMLElement>('[data-arrow-from][data-changed="true"]')].map(a => a.dataset.arrowFrom!),
          released: [...root.querySelectorAll<HTMLElement>('[data-testid="released-node"]')].map(r => Number(r.dataset.value)),
          valuePill: root.querySelector('[data-testid="value-pill"]')?.textContent?.trim() ?? null,
          indexPill: root.querySelector('[data-testid="index-pill"]')?.textContent?.trim() ?? null,
        };
      };
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
        result: text('[data-testid="step-result"]'),
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
        noStatement: document.body.innerText.includes('No statement runs at this step'),
        errorCard: alertCards[0]?.textContent?.trim() ?? null,
        list: readList(),
        listValue: document.querySelector<HTMLInputElement>('#list-input')?.value ?? null,
        valueValue: document.querySelector<HTMLInputElement>('#value-input')?.value ?? null,
        indexValue: document.querySelector<HTMLInputElement>('#index-input')?.value ?? null,
        pointerReadouts: [...document.querySelectorAll<HTMLElement>('[data-pointer-readout]')].map(e => [e.dataset.pointerReadout!, e.textContent?.trim() ?? '']),
        stateText: text('[data-testid="step-state"]'),
        numbers: readNumbers(),
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
