# Visualization Reliability Sprint 6 — CI Hardening, Accessibility and Responsive Reliability

Scope: verify CI, protect input semantics in the browser, improve accessibility, and test responsive layouts and additional browsers. No algorithms added, no code execution, no backend changes, no change to algorithm semantics.

**This report does not claim the app is production-ready, accessible to WCAG conformance, or verified on real phones, Safari, screen readers or remote CI.** Section 9 lists what was and was not verified.

---

## 1. CI verification

### What exists here
| Check | Finding |
|---|---|
| Git repository | **None.** `git rev-parse` fails in `D:\AlgoFlow` and every parent; there is no branch, remote or history. The default-branch name in the workflow (`main`) therefore **cannot be confirmed**. I did not `git init` the project. |
| Package manager | npm (`package-lock.json`, lockfile v3). |
| `gh` CLI / `act` | Not installed. |
| Docker | Docker Desktop is installed but its **daemon was not running**. I did not start it: the machine had ~1.6 GB RAM free, and it is the user's application. |

**Remote CI has not been executed or verified.** Without a repository and remote, the workflow cannot be run on GitHub Actions from this environment.

### What was verified locally instead
| Check | Result |
|---|---|
| Workflow schema (`@action-validator/cli@0.6.0`) | **`.github/workflows/ci.yml` passes** (exit 0). Negative control: a deliberately broken workflow (`stepz:`) is rejected (exit 1). |
| Linux native binaries in the lockfile | Present for every native package `npm ci` needs on `ubuntu-latest`: `@esbuild/linux-x64`, `@oxlint/binding-linux-x64-gnu`, `@rolldown/binding-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`, `lightningcss-linux-x64-gnu` (musl variants too). |
| Server tests without secrets | Covered by the clean-copy run below (no `.env` present): 483 passed. |
| **Clean-copy CI reproduction (final code)** | The project was copied **without** `node_modules`, `dist*`, test output or `.env`, then run with `CI=true`: `npm ci` (375 packages, 19 s), `npm test` **483 passed**, `typecheck` exit 0, `lint` exit 0, `build` OK, `npm run e2e` **175 passed (3.3 min)**. Total 241 s. **This was on Windows, not the Ubuntu runner**, and the cross-browser job was not part of this reproduction (it was run in the working copy; §6). |

### Workflow changes
`ci.yml` now has three jobs, with `permissions: contents: read` and no secrets:
1. **checks:** `npm ci`, `npm test`, `typecheck`, `lint`, `build`.
2. **e2e:** Chromium, full suite (`npm run e2e`).
3. **e2e-cross (new):** `npx playwright install --with-deps chromium firefox webkit` and `npm run e2e:cross` (Firefox, WebKit, Pixel 7 / iPhone 14 emulation). Each E2E job uploads its report and traces.

Not done: `actionlint` was not run (schema validation only); runner behaviour on Linux (fonts, `--with-deps` installs, timing) is untested; the trigger branch `main` is unconfirmed.

**Workers:** kept at **2**, unchanged. Nothing measured this sprint argued for a change. Chromium took 2.7–5.0 min per run.

---

## 2. Input semantics (real browser)

New `e2e/tests/input-semantics.spec.ts` (12 tests, run in Chromium, Firefox and WebKit):
* For Binary Search and Two Pointer × 4 unsorted arrays (including duplicates, negatives, `[2, 1]`, and a repeated maximum):
  * The input is rejected **as typed**: "order" error, Visualize disabled.
  * Enter, and a forced click on the disabled button, change nothing: same bars, same step count, same text.
  * **Sort a copy** gives an ascending result that is a permutation of the input (duplicates kept), and the disclosure shows the exact original.
  * **Restore** returns the exact original text, and the explicit "needs attention" state reappears with no bars.
* Sort a copy uses the target **as edited after the error appeared**.
* A custom unsorted array keeps its order through Bubble → Quick → Binary (blocked) → Two Pointer (blocked) → Linear → Merge. Blocked algorithms show no bars and no stale highlighted code line; the others show the user's order at step 1.
* An invalid draft is discarded on algorithm switch: the new trace uses the last *applied* array and no stale error remains.
* After Sort a copy, switching to a sorting algorithm keeps the sorted copy (the user chose it), and Restore is no longer offered.

**Reachability (not claimed as browser coverage):** through the UI, unsorted input can never reach the Binary Search / Two Pointer generators. Whether the generators themselves sort is therefore covered only by the unit test (`inputFlow.test.ts`), as established in Sprint 5.

### Mutation checks (UI-level silent sorting; reverted byte-identical by SHA-256 + `cmp`)
| Mutation | Result | Intended reason |
|---|---|---|
| **M-A:** switching to Binary / Two Pointer silently sorts the retained custom array (store) | **2 failed** / 21 | Yes: the field shows `-2, 0, 3, 7, 7` instead of `7, -2, 7, 0, 3`; the explicit state is missing |
| **M-B:** the input panel silently sorts the typed array before validating / applying | **12 failed** / 26 | Yes: the expected "order" error and message never appear |
| **M-C:** the global focus indicator is removed | **1 failed** / 16 | Yes: all 10 Tab stops reported "missing indicator" (the browser's default 1 px ring does not satisfy the ≥ 2 px check) |

---

## 3. Accessibility

### Automated scans — `e2e/tests/a11y-scan.spec.ts` (axe-core, WCAG 2.0/2.1 A + AA)
10 tests, 12 scans of reachable states:
* 8 desktop states: default view; mid-trace with highlights; invalid draft; the "input needs attention" state; Sort-a-copy notice; Merge Sort buffers; not-found final state; unimplemented card.
* 4 at **390×844**: default view, Live Code tab, open algorithm drawer, validation with Sort a copy.

Findings and fixes, all now passing in Chromium, Firefox and WebKit:

| Rule | Where | Fix |
|---|---|---|
| `color-contrast` (serious, 18–31 elements per state) | `slate-500` small text on the dark theme (3.8–4.15:1); code line numbers `slate-600` (2.52:1); "coming soon" sidebar items `slate-600` + 60 % opacity (1.64:1) although they are clickable | Those elements moved one Tailwind step lighter (`slate-400`). Locked sidebar items no longer use opacity; the lock icon still marks them. No layout change. |
| `label-content-name-mismatch` (WCAG 2.5.3) — **introduced by my own `aria-label`s earlier this sprint**, caught by Firefox/WebKit scans | AI Tutor button ("Open AI DSA Tutor" vs visible "AI Tutor"); account button | AI Tutor named "AI Tutor" (title keeps the long text). Account button named by its visible text "AC Alex", with an `sr-only` name on phones where the visible name is hidden. |
| `scrollable-region-focusable` (phone width) | Workspace scroll area and code listing scroller had nothing focusable, so keyboard users could not scroll them | `tabIndex=0` plus names ("Visualizer workspace", "Source code") |

### Other accessibility changes (found by inspection or keyboard tests)
* **Visible focus:** one consistent `:focus-visible` outline (2 px cyan, offset 2 px). The three `focus:outline-none` that removed it (input fields, Size select, language select) are gone.
* **Names that disappeared on phones:** Previous, Next and Randomize hid their text below 640 px and had no name. They are now "Previous step", "Next step" and "Randomize".
* **Mobile drawer:**
  * The toggle and close buttons are named ("Open/Close algorithm list") and the toggle has `aria-expanded`.
  * The drawer is a named `dialog` with `aria-modal`.
  * Focus moves into it on open and back to the toggle on close; Escape closes it.
  * The Visualization / Live Code buttons have `aria-pressed`.
* **Landmarks:** named regions Visualization, Playback controls, Code and Explanation, plus a named input form.
* **Announcements without flooding:**
  * The validation message moved from `role="alert"` (assertive, re-read on every keystroke) to a persistent **polite** live region.
  * New polite announcer: "Step *n* of *m*. *action*" for manual stepping, **silent during Play**, re-announcing on Pause.
  * Normal use creates no assertive region (asserted).
* **Target size (WCAG 2.2 2.5.8):** the Size select (34×16 px) and the speed slider (80×6 px) were below 24 px, now 24 px high; the language select too.
* **Focus after Visualize / Sort a copy / Restore:** unchanged from Sprint 5 (stays in the workflow) and re-verified in all three engines. WebKit, like Safari, does not focus a button on mouse click, so the "focus stays on the clicked sidebar button" detail is asserted only where the engine does that. "The panel never steals focus" is asserted everywhere.

### Keyboard tests (automated, `accessibility-focus.spec.ts`)
* Exact Tab order: Array → Target value → Visualize → Reset → Previous step → Play → Next step → Randomize → Array size → Playback speed, with a visible indicator at every stop.
* Language select and sidebar operable by keyboard.
* Next operable with Enter and Space.

**Not a substitute for manual testing:** these are automated keyboard simulations and axe rules. **No human keyboard pass and no screen-reader testing (NVDA, JAWS, VoiceOver, TalkBack) was performed.** Announcement wording and verbosity are therefore unverified in real assistive technology.

---

## 4. Responsive and browser testing

### Defects found and fixed
| Viewport | Defect (all three engines) | Fix |
|---|---|---|
| Tablet 820 px | The playback-controls card switched to one row at `md`, pushing Randomize / Size / Speed up to 1145 px wide. `body { overflow-x: hidden }` **clipped them, so they were unreachable.** | The card and its right group wrap (`flex-wrap`) instead of switching layout at a breakpoint; the step counter no longer wraps character by character. |
| Phone 360–390 px | The same group, right-aligned in one row, overflowed off the **left** edge; the header was 2–5 px too wide | Wrap as above; header items may shrink (brand text truncates) with smaller gaps |
| Phone, 16 values | The first and last bars and edge pointer chips fell outside the chart and were clipped | Below 640 px only: less chart padding, 12 px minimum bar width, tighter gaps, 9 px value labels in compact mode. Desktop unchanged. |
| All | **E2E depended on the internet:** the app's CSS imports Google Fonts and a network hiccup produced `ERR_CONNECTION_RESET` test failures | Tests serve an empty stylesheet for Google Fonts (the CSS falls back to system fonts) and **fail on any other external request**. The app itself still loads Google Fonts. |

### `responsive.spec.ts` (6 viewports × 3 checks, run in Chromium, Firefox and WebKit) + `@mobile` device tests
Viewports: 360×740, 390×844, 820×1180, 1180×820, 1280×720, 1440×900. At each:
* Nothing interactive or informative is cut off by the viewport edge.
* Bars stay inside the chart.
* The named panels don't overlap, and the expected panels are present (Code sits behind the Live Code tab on phones).
* Controls are ≥ 24×24 px.
* With 16 values mid-trace, bars and pointer chips stay inside the chart.
* Code lines are scrollable rather than clipped, and code font ≥ 11 px.

**Device emulation** (Pixel 7 on Chromium, iPhone 14 on WebKit): the drawer (names, dialog, focus in/out, Escape, select-and-close); tabs with `aria-pressed`; a touch journey (tap Sort a copy, tap Next).

### Environments actually exercised
| Engine | Version | Mode |
|---|---|---|
| Chromium (headless shell) | 156 (Playwright build 1248) | desktop 1500×1000 + 6 viewports; Pixel 7 emulation |
| Firefox | 157.0 (Playwright build 1555) | desktop + 6 viewports |
| WebKit | 27.2 (Playwright build 2370), **Windows port** | desktop + 6 viewports; iPhone 14 emulation |

All on Windows 11, headless.

---

## 5. Files changed

* **App (accessibility, responsive; no behaviour or semantic change):**
  * `src/index.css`: focus-visible rule.
  * `src/pages/VisualizerPage.tsx`: drawer dialog, focus and Escape; button names; tab state; step announcer; regions; workspace focusable; contrast.
  * `src/components/layout/Header.tsx`: wrap/shrink, AI Tutor name, account button, select height.
  * `src/components/layout/Sidebar.tsx`: contrast, locked items.
  * `src/components/visualizer/ExecutionControls.tsx`: wrap, names, region, target sizes.
  * `InputPanel.tsx`: polite live region, form name, focus outline, contrast.
  * `CodePanel.tsx`: region, focusable scroller, contrast.
  * `ExplanationPanel.tsx`: region, contrast.
  * `ArrayVisualizer.tsx`, `Bar.tsx`: compact sizing on phones, contrast.
  * `ComplexityBadge.tsx`, `UnimplementedCard.tsx`: contrast.
* **Tests (new):** `e2e/tests/a11y-scan.spec.ts`, `responsive.spec.ts`, `input-semantics.spec.ts`.
* **Tests (modified):**
  * `accessibility-focus.spec.ts`: Tab order, indicators, live regions, WebKit click-focus.
  * `binary-search.spec.ts`, `two-pointer.spec.ts`: error locator.
  * `input-changes.spec.ts`, `playback.spec.ts`: `advance(n)`.
  * `smoke.spec.ts`: role-based account check.
  * `e2e/support/visualizerApp.ts`: drawer-aware `selectAlgorithm`, `advance(n)`.
  * `e2e/fixtures.ts`: no-internet guard.
  * `e2e/README.md`.
* **Config:**
  * `playwright.config.ts`: firefox / webkit / mobile projects; **WebKit-only 60 s timeout** (§6).
  * `package.json` / lock: `@axe-core/playwright`; scripts `e2e` (Chromium), `e2e:cross`, `e2e:all`, `e2e:install` (all three browsers).
  * `.github/workflows/ci.yml`: `e2e-cross` job.

---

## 6. Results

### Unit, types, lint, build (final code)
| Command | Result |
|---|---|
| `npm test` | **483 passed** (16 files) |
| `npm run typecheck` | exit 0 |
| `npx oxlint` | exit 0; **0 errors, 6 warnings**, all pre-existing in untouched files (`AITutorDrawer.tsx` ×3, `AdminPage.tsx` ×2, `AuthPage.tsx` ×1) |
| `npm run build` | success |

### E2E (2 workers, 0 retries, nothing skipped)
Totals: **175 tests per desktop engine** (174 before the split noted below), **3 per mobile-emulation project**.

| Run | Projects | Result | Duration | Notes |
|---|---|---|---|---|
| Chromium 1 | chromium | **174 passed** | 5.0 min | |
| Chromium 2 | chromium | **174 passed** | 4.3 min | |
| Chromium 3 | chromium | **174 passed** | 4.7 min | |
| Cross 1 | firefox, webkit, mobile ×2 | 353 passed, **1 failed** | 22.5 min | WebKit axe test (two scans + 16-step advance): **timeout** at 35.3 s |
| Cross 2 | same | 353 passed, **1 failed** | 17.5 min | WebKit algorithm-switching journey: **timeout** at 30 s |
| *changes:* split that axe test into two; WebKit project timeout 60 s | | | | |
| Cross 3 | same | **356 passed** | 15.8 min | slowest WebKit test 28.7 s |
| Cross 4 | same | **356 passed** | 22.5 min | slowest WebKit test **31.0 s** (two-speed playback); would have failed at 30 s |
| Chromium 4 | chromium | **175 passed** | 2.7 min | slowest 5.9 s |
| Clean-copy CI reproduction | chromium | **175 passed** | 3.3 min | §1 |

**About the WebKit timeout (investigated, not dismissed).** Both cross failures were timeouts with no assertion failure. Measured alone with 1 worker, the same tests take **6.0 s** (switching journey) and **8.0 s** (axe), versus 2.3–3.4 s in Chromium. WebKit on Windows is consistently 2–2.5× slower here, and under the full cross-browser load it occasionally passed 30 s. I reduced the work (split the axe test into one test per state) and scoped **60 s to the `webkit` project only**. Chromium and Firefox keep 30 s; no global timeout changed. Firefox's slowest test reached **22.5 s** against its 30 s limit in one run, so it has a margin but could become the next timeout on a slower machine.

---

## 7. Independent oracles vs engine-derived checks (unchanged structure)
UI-behaviour assertions, trace-vs-engine assertions (`walkAndCompareWithEngine`) and independent oracles (`oracles.ts`) remain as described in the Sprint 5 report. This sprint's new specs are **UI-behaviour** assertions, plus permutation and ascending-order oracle checks in `input-semantics.spec.ts`.

---

## 8. Known limitations and open items

* **CI:** remote CI not run (§1). The Linux runner, the `main` trigger and Ubuntu browser dependencies are unverified.
* **Accessibility:**
  * No real screen-reader or human keyboard testing.
  * axe covers only a subset of WCAG (and only the visualizer page; Dashboard, Practice and other pages were not scanned).
  * Colour contrast was fixed only where flagged on this page.
  * The account dropdown, AI Tutor drawer and other pages were not audited.
  * The live-region wording is untested with assistive technology.
* **Responsive:**
  * Device **emulation** only; no real phone or tablet.
  * **Playwright's WebKit on Windows is not Safari.** Desktop Safari and iOS Safari are untested, and so are Edge (Chromium-based) and real Android Chrome.
  * Landscape phones and very large screens (> 1500 px) were not tested.
  * At 360 px, 16 values with 4-character labels (e.g. `-999`) are legible only at 9 px; I did not test overlap of value labels.
* **Timing:**
  * The two-speed playback test compares real timer intervals and was the slowest WebKit test (31 s under load).
  * Firefox is at 22.5 s of 30 s worst case.
* **Pre-existing, unchanged:** 6 lint warnings; the >500 kB bundle chunk; the Google Fonts dependency in the app itself; the open P2 trace items from earlier reports; the execution-error card remains unreachable from the UI (unit-tested only).

## 9. Verified vs not verified (summary)
| Item | Status |
|---|---|
| Unit / typecheck / lint / build | ✅ verified locally |
| Chromium E2E | ✅ 4 consecutive full runs green (after fixes); also green in a clean copy with `CI=true` |
| Firefox + WebKit + mobile emulation E2E | ✅ 2 consecutive full runs green after the WebKit timeout change; 2 earlier runs each had 1 WebKit timeout (documented above) |
| Workflow file schema | ✅ validated (with a negative control) |
| GitHub Actions run | ❌ **not executed** (no repository / remote / `gh`; Docker daemon not running) |
| Real Safari / iOS / Android devices | ❌ not tested |
| Screen readers (NVDA / JAWS / VoiceOver / TalkBack) | ❌ not tested |
| Manual (human) keyboard pass | ❌ not done; automated keyboard tests only |

Stopped at the end of Sprint 6; Sprint 7 has not been started.
