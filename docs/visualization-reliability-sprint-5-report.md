# Visualization Reliability Sprint 5 — E2E Test Integration and Interaction Reliability

Scope: move the browser tests into the repository, make them deterministic and diagnosable, close the Sprint 4 browser-coverage gaps, add a CI workflow, and measure flakiness. No new algorithms, no secure code execution, no UI redesign.

**This is not a production-readiness claim.** It documents what the tests now prove and what they do not.

## 1. Audit before editing

| Item | Finding |
|---|---|
| Test commands | `npm test` (Vitest: `server/tests/**`, `src/**/*.test.{ts,tsx}`), `npm run build` (`tsc -b && vite build`), `npm run lint` (oxlint). No `typecheck` or E2E script. |
| Baseline (before any edit) | `npm test` **483 passed**; `tsc -b` clean; oxlint **0 errors, 6 warnings**; build OK. |
| Playwright | Not a dependency. The Sprint 3/4 browser scripts lived in a scratchpad outside the repo and drove system Chrome. |
| CI | **None** (`.github/` did not exist). The project folder is **not a git repository** here. |
| Mock API | `src/api/index.ts` uses `MockApiClient` only when `import.meta.env.VITE_USE_MOCK_API === 'true'`. This is a **compile-time** Vite flag. `.env` contains only server settings (no `VITE_` variables), so the front end never reads secrets. |
| Server tests without `.env` | `.env` was moved aside temporarily and `npm test` was run: **483 passed**. `server/config/env.ts` has safe defaults and the tests mock every model, so CI needs no secrets or database. `.env` was restored. |

## 2. Repository-based Playwright setup

* **Dependency:** `@playwright/test@^1.64.1` (devDependency). The bundled Chromium (`chromium-headless-shell` build 1248) is installed with `npm run e2e:install`; tests no longer depend on a system Chrome.
* **Config** (`playwright.config.ts`):
  * `testDir: e2e/tests`.
  * `retries: 0`, so a flaky test fails visibly.
  * `workers: 2` (override with `E2E_WORKERS`).
  * `trace: 'retain-on-failure'` and `screenshot: 'only-on-failure'`.
  * List and HTML reporters (`playwright-report/`).
  * Fixed viewport, locale and timezone.
* **Server:** `webServer` builds the app with `VITE_USE_MOCK_API=true` into `dist-e2e` and serves it with `vite preview` on `127.0.0.1:5199`. `reuseExistingServer: false`, so a non-mock server is never picked up. Serving a build replaced the dev server after the first parallel run: on-demand dev compilation made 20 tests time out in setup.
* **Scripts:**
  * `npm run e2e`
  * `npm run e2e:headed`
  * `npm run e2e:report`
  * `npm run e2e:install`
  * `npm run typecheck` (`tsc -b`)
  * `npm run verify` (unit, types, lint, build, E2E)
* **Separation:** E2E specs are `e2e/tests/*.spec.ts` and Vitest only includes `*.test.*`, so the suites never mix. `tsconfig.e2e.json` is referenced by `tsconfig.json`, so `tsc -b` now type-checks `e2e/` and `playwright.config.ts`.
* **Docs:** `e2e/README.md` (how to run, layout, rules for writing tests, diagnostics); README "Testing" section.

### Determinism and safety (`e2e/fixtures.ts`)
* `Math.random` is replaced by a seeded PRNG (mulberry32), so Randomize and Size are reproducible.
* **Every request whose URL path starts with `/api/` is aborted and fails the test.** It matches the path, so source files under `/src/api/` still load. The E2E suite therefore cannot use a real backend, credentials or a database.
* Any `console.error` or uncaught page error fails the test.
* Waits use observable state (`toHaveAttribute`, `expect.poll`, a MutationObserver on the step counter). The only timed window is `expectNoStepChangeFor(ms)`, which proves that a stopped playback stays stopped.

### Structure (duplicated scratchpad helpers refactored)
| File | Role |
|---|---|
| `e2e/support/visualizerApp.ts` | Page object. Controls are located by **role + accessible name**. `data-testid` is used only for read-outs without a role (step counter, current action, step message/explanation, compared values). `state()` / `collectStates(n)` read the whole UI in one DOM pass. |
| `e2e/support/walk.ts` | `walkAndCompareWithEngine`: steps through a trace with the app's real *Next* button and reports **all** mismatching steps at once. |
| `e2e/support/oracles.ts` | Independent algorithm oracles (no `src/` imports). |
| `e2e/support/engineTrace.ts` | Engine-derived expectations (explicitly labelled as such). |
| `e2e/support/derive.ts` | Small helpers (found indices, pointer positions). |

**Walk performance fix.** The first in-repo version made one Playwright click and one read per step. On this machine, under load, that took up to ~1 s per step and long walks timed out. `collectStates(n)` now performs the walk in one in-page pass. It clicks the app's real *Next* button, waits by observation until the step counter changes (React commits after the handler returns), then reads. Typical full walks now take 2–4 s, and the 90 s timeout overrides I had added were **removed**. No global or per-test timeout increase remains in the E2E suite.

### Small app changes made for testability and accessibility
* Accessible names added: "Programming language" (language select), "Playback speed" (slider, plus `aria-valuetext`), "Reset".
* Step counter: `role="group"` with "Execution step n of m".
* Active code line: `aria-current="step"` and `data-line`.
* Read-out testids and `data-value` / `data-height` on bars.
* **Focus fix (Phase 4.5):** after *Visualize*, *Sort a copy* or *Restore*, focus returns to the control the user was using (array field, target field or Visualize button), or to the array field when the clicked button disappears. Remounts caused by anything else (sidebar, Randomize, Size) never move focus.
* No visual design changes.

## 3. E2E coverage (131 tests in 10 files)

| Spec | Tests | Covers |
|---|---|---|
| `smoke` | 1 | Runs on the mock API (demo user signed in, no backend) |
| `linear-search` | 12 | First / middle / last / absent, empty, duplicates (first occurrence; absent), 0 and negative targets, single element |
| `binary-search` | 14 | Middle / first / last; absent inside / below / above the range; single present / absent; empty; negatives; duplicates (any valid index; absent). Unsorted draft: message, Sort-a-copy offered, Visualize disabled, trace and typed text untouched. Sort a copy: typed target used, disclosure, Restore. |
| `two-pointer` | 11 | Valid pairs, no pair, duplicates, negatives, a single element cannot pair, empty, requirement hint. **Sort a copy (Sprint 4 gap):** offered for unsorted input; result ascending and a permutation; **typed target 10 (not the default 27) used**; notice shows the original; trace matches; **Restore returns `8, 1, 6, 3, 4`**. |
| `sorting` | 30 | 5 sorts × already sorted, reverse, duplicates, negatives, single, empty |
| `input-validation` | 21 | 14 invalid drafts (array and target): message, `aria-invalid`, Visualize disabled, valid trace untouched. Enter on invalid input; error clears when fixed; blank and `[ ]` input; 16 values fit the chart; negative bar heights; Enter applies. |
| `input-changes` | 11 | Latest values used only on Visualize; target-only change; new input mid-trace leaves nothing stale; an invalid draft keeps stepping the old trace. **Algorithm switching:** compatible (Quick), incompatible (Binary: explicit state, no code line, explanation, pointers or pivot from before), Sort a copy, compatible (Linear keeps array and target), unimplemented (Heap Sort) round trip; default examples; target retained across search algorithms. Randomize / Size with a custom array (seeded): notice, Restore, real size; Binary Randomize always ascending. |
| `playback` | 9 | Next / Previous / Reset restore exact states; Play runs every step once in order and stops; Pause holds; **Play at the last step restarts**; **two speeds (fast ≈100 ms, medium ≈600 ms): same step order, different pace**; **input change during playback stops it** with no further steps; rapid input changes leave only the last; language switch keeps the step and the correct line in 4 languages; no trace means controls disabled. |
| `accessibility-focus` | 12 | Role and name lookups for the array field, "Target value" / "Target sum", Visualize, Array size, Programming language, Playback speed, Randomize / Reset / Play / Next / Previous, Sort a copy, Restore. Accessible description includes the rules and the error. Alert and status regions. Bar names include index, value and role. Text final status. **Focus:** Enter in the array field (typing continues there), Enter in the target field, Visualize click, Sort a copy / Restore → array field, sidebar and Randomize never pull focus into the panel. Keyboard-operable Next. |
| `rendering` | 10 | All 8 algorithms' default traces: bar roles, pointers, buffers, banner only on the final step, final styling. Pointer-chip overlap with 12 seeded Quick Sort values and 16 Binary Search values. |

The Sprint 3/4 scratchpad checks that injected traces into the store are **not** used. Every scenario above goes through the real input UI.

## 4. Independent oracles vs engine-derived traces

| Kind | Where | What it proves |
|---|---|---|
| **UI behaviour** | All specs (validation, enabled/disabled, notices, focus, playback, accessibility) | What the user can see and do |
| **Trace vs engine** | `walkAndCompareWithEngine` (every walked journey) and `rendering.spec` | At every step the screen shows the engine's trace: counter, current action, message, explanation, highlighted line (number and text from the engine **plus** a language-neutral intent regex from the line-map tests), bar values, Comparing panel, compare bars, pointer labels, roles, buffers, banner placement. **This only proves faithful rendering of the engine's output.** |
| **Independent oracle** (`oracles.ts`, no `src/` imports) | `linear-search`, `binary-search`, `two-pointer`, `sorting` | **Linear:** values examined in order (index : value) and the result equal an independent left-to-right scan; the found index is the **first occurrence** (promised by the algorithm). **Binary:** the UI's answer satisfies `isValidSearchAnswer` (any index holding the target, or not found exactly when absent); the probed `mid` sequence equals an independent simulation of the displayed algorithm, **skipped for arrays with duplicates**. **Two Pointer:** found exactly when a brute-force `pairExists`, and the two UI positions are distinct and sum to the target (`isValidPair`; no specific pair required). **Sorting:** final bars equal an independent ascending sort and are a permutation of the input. **Order preservation:** step-1 bars and the field equal the typed array, until the user explicitly chooses Sort a copy. |

## 5. CI workflow — `.github/workflows/ci.yml` (added, NOT executed)

Two jobs on `push` to `main` and on pull requests, Node 22 with an npm cache, `permissions: contents: read`, **no secrets**:
* **checks:** `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
* **e2e:** `npm ci`, `npx playwright install --with-deps chromium`, `npm run e2e`; always uploads `playwright-report/` and `test-results/` (traces and screenshots) as an artifact.

> **CI has not been executed or verified.** This folder is not a git repository and nothing was pushed, so the workflow has never run on GitHub Actions. It has not been linted by `actionlint`, the branch name `main` is an assumption, and the Linux runner behaviour (fonts, `--with-deps`, timing with 2 workers) is untested. Everything below was run locally on Windows.

## 6. Results

### Unit, types, lint, build (current code, after all mutation restores)
| Command | Result |
|---|---|
| `npm test` | **16 files, 483 passed, 0 failed** |
| `npm run typecheck` (`tsc -b`, now including `e2e/`) | **exit 0** |
| `npx oxlint` | **exit 0; 0 errors, 6 warnings**, all pre-existing in files not touched (`AITutorDrawer.tsx` ×3, `AdminPage.tsx` ×2, `AuthPage.tsx` ×1). During the sprint, oxlint flagged Playwright's fixture callback `use` as a React hook (2 errors); I renamed the parameter to `provide` instead of disabling the rule. |
| `npm run build` | **success** |

### Three consecutive complete E2E runs (default config: 2 workers, 0 retries)
| Run | Result | Duration | Failures | Timeouts | Retries / flaky | Slowest test | Median test |
|---|---|---|---|---|---|---|---|
| 1 | **131 passed** | 4.7 min | 0 | 0 | 0 / 0 | 20.1 s (Quick Sort 12-value layout) | 2.4 s |
| 2 | **131 passed** | 3.1 min | 0 | 0 | 0 / 0 | 8.9 s | 2.1 s |
| 3 | **131 passed** | 3.6 min | 0 | 0 | 0 / 0 | 12.7 s | 2.1 s |

No test was skipped. The three runs used the current test code. The only source edits afterwards were the mutation experiments below, each restored byte-identical.

### How the two-worker setting was chosen (measured, not assumed)
Earlier full runs, all before the in-page walk change and on this machine with **~1–3 GB of 15.7 GB RAM free** (other Chrome tabs, MCP helpers and a leftover dev server were running):

| Run | Workers | Result | Duration | Failure type |
|---|---|---|---|---|
| First run (3 search specs only, 37 tests, dev server) | default (8) | 20 failed / 17 passed | 4.5 min | timeouts while setting up the page (on-demand dev compilation) → switched to a preview build |
| First full run | 4 | 11 failed / 120 passed | 3.6 min | 6 locator ambiguity ("Merge Sort" vs "Merge Sorted Lists") + 2 test-step errors, all test defects, fixed |
| | 4 | 11 failed, 120 passed | 7.4 min | detail overwritten |
| | 4 | **131 passed** | 3.0 min | — |
| | 4 | 10 failed, 121 passed | 8.5 min | — |
| | 4 | (stopped) | > 10 min | tests running 1–1.5 min each |
| | 2 | 3 failed, 128 passed | 19.6 min | **all 3 were `Test timeout … exceeded`; no assertion failures** |
| First in-page walk version | 4 | 49 passed, the rest failed | 8.6 min | **my bug:** state was read before React committed the click, so it showed the previous step ("counter shows 1/11"). Fixed by waiting for the counter to change. |
| After the fix | 2 | **131 passed** | 2.3 min | — |

I investigated the timeouts instead of dismissing them. The same walks take 2–4 s in isolation (Bubble 3.6 s, Selection 2.4 s with 1 worker), and the slowness tracked the number of parallel browsers and free memory. The fix had two parts. Walks became one in-page pass (removing two round trips per step), and the worker count dropped to 2. The variance in the three final runs (3.1–4.7 min, slowest test 8.9–20.1 s) shows the suite is **still sensitive to machine load**. The slowest test used 67% of its 30 s budget in run 1.

## 7. Mutation tests (re-run against the current code)

Method: this folder is not a git repo, so there was no worktree. Each file was copied and its SHA-256 recorded. One mutation was applied with a single `sed` and confirmed with `grep`, the relevant tests were run, the file was restored from the copy, and `cmp` plus SHA-256 confirmed it was byte-identical. The same tests were then re-run.

| # | Mutation (current code) | Tests run | Result while mutated | Intended reason? | After restore |
|---|---|---|---|---|---|
| 1 | Binary Search silently sorts: `const arr = [...input]` → `[...input].sort((a, b) => a - b)` in `binarySearch.ts` | Unit `inputFlow` + `src/engine/__tests__`; E2E `binary-search.spec.ts` | **Unit: 1 failed / 368 passed** — "Binary Search and Two Pointer use the array exactly as given": `expected [1, 2, 4, 5] to deeply equal [5, 1, 4, 2]`. **E2E: 14 / 14 passed — NOT detected.** | Unit: **yes**. E2E: **no** (see below) | SHA `ebb1a220…` identical; unit 369 / 369 |
| 2 | Sort a copy uses the stale target: `(draftTarget ?? s.target ?? default)` → `(s.target ?? default)` in `useVisualizerStore.ts` | Unit `inputFlow`; E2E: the five "Sort a copy" tests | **Unit: 1 failed** — `expected 3 to be 4`. **E2E: 2 failed / 3 passed** — Binary: target field `Expected "4" Received "7"`; Two Pointer: `Expected "10" Received "27"` | **Yes** (both suites) | SHA `dc2ceff5…` identical; unit 35 / 35, E2E 5 / 5 |
| 3 | Focus regression: the InputPanel never restores focus after its remount | E2E `accessibility-focus.spec.ts` | **4 failed / 8 passed.** All four focus-restoration tests (Enter in the array field, Enter in the target field, Visualize click, Sort a copy / Restore) fail with `toBeFocused … Received: inactive`. The 8 unrelated accessibility tests pass. | **Yes** | SHA `011d373c…` identical; 12 / 12 |

After all restores: no `MUTATION` marker anywhere in `src/` or `e2e/`; `binarySearch.ts` contains no `.sort(`; the store still contains `draftTarget ?? s.target`.

**Mutation 1, E2E not detected — correction and explanation.** In my interim update I said the E2E suite caught this mutation. That earlier result came from a run on the overloaded machine, and the re-run on current code shows it was **not valid evidence**. Through the UI, Binary Search only ever receives already-sorted input: the draft validation blocks unsorted arrays, and Sort a copy sorts explicitly. Sorting inside the generator therefore produces an identical trace. The guarantee "the generator does not sort" is protected by the **unit** test. The user-facing guarantee "the UI never sorts silently" is covered by E2E UI-behaviour tests. Those check that unsorted drafts stay as typed, are rejected, and are sorted only through Sort a copy. A UI-level silent-sort mutation, for example in the store or the draft validation, was **not** mutation-tested this sprint.

## 8. Files changed

* **New:**
  * `playwright.config.ts`
  * `tsconfig.e2e.json`
  * `.github/workflows/ci.yml`
  * `e2e/README.md`
  * `e2e/fixtures.ts`
  * `e2e/support/{visualizerApp,walk,oracles,engineTrace,derive}.ts`
  * `e2e/tests/{smoke,linear-search,binary-search,two-pointer,sorting,input-validation,input-changes,playback,accessibility-focus,rendering}.spec.ts`
* **Modified (config and docs):**
  * `package.json` / `package-lock.json`: `@playwright/test`; scripts `typecheck`, `e2e*`, `verify`
  * `tsconfig.json`: reference to the E2E project
  * `.gitignore`: `test-results`, `playwright-report`, `blob-report`, `dist-e2e`
  * `README.md`: Testing section
* **Modified (app, behaviour-neutral except focus):**
  * `src/components/visualizer/InputPanel.tsx`: focus restoration
  * `ExecutionControls.tsx`: step-counter group and testid, slider name, Reset name
  * `CodePanel.tsx`: `data-line`, `aria-current`
  * `ExplanationPanel.tsx`: testids
  * `Bar.tsx`: `data-value`, `data-height`
  * `src/pages/VisualizerPage.tsx`: current-action testid
  * `src/components/layout/Header.tsx`: language select name

## 9. Remaining limitations and checks not completed

* **CI is unverified** (see §5). The workflow has never run.
* **Load sensitivity:** suite duration varied 3.1–4.7 min, and the slowest test reached 20.1 s of its 30 s limit in one run. On a slower CI runner this may still produce timeouts. No timeout was raised to hide it.
* **Mutation 1** is detected only at unit level. No UI-level silent-sort mutation was tested.
* **Not covered by any E2E test:**
  * The execution-error card. It needs a failing generator and cannot be triggered from the UI without injection.
  * Mobile and narrow layouts, Firefox / WebKit.
  * Real screen-reader output (only accessible names and roles are asserted).
  * Colour contrast.
  * The real backend and authentication.
  * The dev-server-only code paths (E2E runs a production build, so `import.meta.env.DEV` logging is not exercised).
* **Engine-derived checks** prove only faithful rendering. Correctness rests on the oracles, which cover results and examination order but not, for example, the exact swap sequence of each sort.
* **Timing assertions** (the two-speed test) use loose bounds (fast < 350 ms, medium > 400 ms median interval) and could become flaky on a very slow machine.
* **Pre-existing issues** remain from earlier sprints: 6 lint warnings in untouched files, the >500 kB bundle chunk notice, and the open P2 trace items from the Sprint 4 report.

Stopped at the end of Sprint 5; Sprint 6 has not been started.
