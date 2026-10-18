# Visualization Reliability Sprint 3 — Report

Scope: make the visualizer communicate every execution step (bars, indices, pointers, buffers, final state). No input controls (Sprint 4), no Phase 4, no new algorithms, no application redesign. **The visualization system is not "done"** — see §9.

## 1. Renderer audit (Task 1)

Before this sprint `ArrayVisualizer`/`Bar` consumed only: `state`, `sortedIndices`, `extraInfo.pivotIndex`, and `indices` **only when `type` was `compare`, `swap` or `found`**. `type === 'complete'` painted every bar green. `pointers`, `extraInfo.subRange`, `variables` and `comparedValues` were never drawn on the bars (pointers/variables appeared only as text chips in the explanation panel). Measured on every algorithm's default input with the real generators:

| Algorithm | steps | Event types carrying `indices` that were **ignored** | Pointers never drawn |
|---|---|---|---|
| Bubble | 65 | loop-condition (10), condition (10), sorted (4) | i, j, j+1 |
| Selection | 51 | loop-condition (10), assign (9), condition (14), sorted (4) | i, minIdx, j |
| Insertion | 41 | assign (14), condition (6) | i, j, inserted |
| Linear | 19 | loop-condition (4), condition (4) | i |
| Binary | 7 | assign (2), condition (1) | low, high, mid |
| Merge | 160 | condition (15), assign (52), loop-start (7), return (8) | l, r, mid, m, k |
| Quick | 104 | condition (7), loop-start (5), assign (10), loop-condition (13), increment (10), return (5) | low, high, i, j, pi |
| Two Pointer | 5 | assign (1) | left, right |

The trace remains the single source of truth: nothing in the UI recomputes algorithm state. The new code only reads fields the step already carries.

## 2. Design (Tasks 2–4)

All derivation lives in one pure, unit-tested module, `src/components/visualizer/barVisuals.ts`.

**Which indices are emphasized and why**

| Step | Bars | Why |
|---|---|---|
| `compare` | `compare` (amber, COMPARE) | bars holding the compared values |
| `swap` | `swap` (rose, SWAP) | the two bars that exchange values (state is post-swap) |
| `found` | `found` (green, MATCH) | the bar(s) that satisfy the search |
| `assign` / `update` | `assign` (blue, ASSIGN) | bars read/written by the assignment (shift, merge write, `mid =`, `key =`) |
| `condition`, `loop-condition`, `loop-start`, `increment`, `decrement`, `return`, `init`, `complete`, `not-found` | `focus` (outline only, no badge) | the bars the condition/loop is looking at |
| `sorted` | (indices ignored) | `sortedIndices` already shows locked bars |
| `pointers.minIdx` | `min` (teal, MIN) | current minimum candidate |
| `pointers.inserted` | `insert` (pink, INSERT) | insertion position |
| `extraInfo.pivotIndex` | `pivot` (purple, PIVOT) | wins over `compare`, so the pivot stays visible while `j` is compared |
| `sortedIndices` | `sorted` (green) — or `found` when the run is a successful search | locked-in bars |

Priority when several apply: found > swap > pivot > compare > min/insert > assign > focus > sorted. A test asserts that **no bar is ever emphasized unless the step names it** (via `indices`, `sortedIndices`, `minIdx`, `inserted` or `pivotIndex`) on all 8 algorithms × edge/random inputs.

**Pointers (Task 3).** Drawn under the bar as a `▲label` chip, from the *current step's* `pointers` only.
* Several pointers on one index are joined in a fixed order (`▲low·mid·high`).
* A pointer is drawn only if it is an integer inside the array. Anything else (`j = -1`, `right = -1`, quick's `i = low-1`, `k = n`) is listed as **"Off-array: j = -1"** under the chart and never becomes a bar element.
* Bubble Sort's `i` is a pass counter, not a position, so `AlgorithmDefinition.positionPointers = ['j','j+1']` excludes it (the field is optional; other algorithms draw all in-range pointers). No irrelevant variables are forced anywhere: the `target = …` pill appears only when the trace has `variables.target`, `pivot = …` only when it has `variables.pivot`.
* Bars outside the current working range (`extraInfo.subRange`, else `low/high`, else `left/right`) are dimmed (never locked bars), so Binary Search's eliminated half, Quick Sort's/Merge Sort's sub-range and Two Pointer's window are visible.
* Pointer state is derived per render from the current step, so it disappears on the next step and cannot survive an algorithm switch.

**Merge Sort buffers (Task 2).** New optional `ExecutionStep.buffers: {name, values, cursor?}[]`, emitted by the Merge Sort generator from `init-merge` on (the buffer copies are also in `variables` as before). The visualizer shows a "left buffer / right buffer" strip under the bars with the cursor cell highlighted. Compare steps highlight only a bar that really holds a compared value; the left value, when it exists only in its buffer, is shown as the active cell of the left buffer. Tests assert that for every compare step the buffer cursors hold exactly `comparedValues`.

**Final-state styling (Task 4).** `deriveOutcome(steps, index)` classifies the final step from the trace (the step before `complete` is `found`/`not-found`; otherwise `sortedIndices`). The page shows a status banner (`role="status"`, icon + text, so not colour alone):

| Outcome | Bars | Banner |
|---|---|---|
| Sorted | all bars `sorted` | "Array sorted" |
| Search found | only the matching bar(s) `found`; the rest plain | "Target found" |
| Search not found | **no bar green/found/sorted** | "Target not found — no element matched" (rose) |
| Other completed | whatever the trace locked | "Execution complete" |
| Empty array | no bars | "Empty array — nothing to display" |
| Unimplemented / execution error | visualizer replaced by the existing unavailable / error cards (Sprint 1) | — |

Every bar also has an accessible name (`aria-label="Index 3, value 7, being compared, pointer j"`).

## 3. Known defects fixed (Task 5)

| Defect | Fix |
|---|---|
| Insertion Sort `While FALSE`: `pointers.j` clamped to 0 while `variables.j = -1` (audit P2-1) | `pointers.j` is the real `j`; drawn as "Off-array" |
| Insertion Sort empty array marked index 0 sorted (Sprint 1 finding) | `sortedIndices` is `[]` when `n = 0`; explanation no longer says `Index 0 (undefined)` |
| Binary Search empty array: `target = undefined`, indices `[0,-1]` (audit P2-3) | default target `?? 0`; `init-bounds` has no indices when `n = 0` |
| Two Pointer empty array: `val undefined`, indices `[0,-1]` (audit P2-3) | explicit empty-array message, no indices |
| Size dropdown showed 5 for Merge Sort's 8 elements (audit P2-4) | `getSizeOptions(current)` = presets ∪ current size; verified in the browser (shows 8) |
| P2-2 swap re-mount: bars were keyed `idx-value`, so a swap unmounted/mounted bars | Bars are keyed by index; height/colour now **transition (300 ms) between the real before and after states**. No element moves and nothing is faked, so Previous/Next/Reset are unaffected. A true "bars slide past each other" swap animation is **not** implemented (it needs element identity, which the trace does not carry). |

The three `it.fails` markers from Sprint 2 were removed **because their defects are fixed** (they are now ordinary tests: Insertion pointers incl. the exact `j = -1` case; "every algorithm on `[]` has no indices/sortedIndices/buffers and no `undefined`/`NaN` text", for both default and explicit targets). No expected-failure test remains. No existing test was weakened.

## 4. Obsolete code removed (Task 6)

| File | Evidence it was obsolete | Action |
|---|---|---|
| `validate_linemaps.mjs` (446 lines) | no import, no `package.json` script, no CI config; contained hard-coded copies of the code/lineMaps and only checked line bounds | **Deleted.** Its function (bounds, blank/brace-only lines) is a strict subset of `lineMap.test.ts`, which uses the real registry and adds semantic anchors. Its 2 lint warnings are gone. |
| `src/data/algorithmCodes.ts` (443 lines) | zero importers (`algorithmCodes`, `ALGORITHM_CODES`, `getCodeDefinition`, `getCodeForAlgorithm`, `resolveLineNumber` appear only inside the file and in historical docs); different, unused codeRef vocabulary | **Deleted**, `tsc -b` re-run clean. |

Historical docs under `docs/` still mention both names (they describe past states) and were not edited.

## 5. Files changed

**Source (modified)**
`src/types/algorithm.ts` (+`buffers`, +`positionPointers`) · `src/engine/algorithms/{bubbleSort,insertionSort,binarySearch,twoPointer,mergeSort}.ts` · `src/components/visualizer/{ArrayVisualizer,Bar,ExecutionControls}.tsx` · `src/pages/VisualizerPage.tsx` (passes `positionPointers`, `outcome`) · `vitest.config.ts` (include `src/**/*.test.{ts,tsx}`).

**Source (new)** `src/components/visualizer/barVisuals.ts` · `src/components/visualizer/sizeOptions.ts`.

**Tests**
* New: `src/components/visualizer/__tests__/{barVisuals.test.ts, visualizer.render.test.tsx, visualTestUtils.tsx}`.
* Changed: `src/engine/__tests__/algorithms.test.ts` (3 `it.fails` → 2 real tests; Insertion Sort added to the strict pointer test).

**Deleted** `validate_linemaps.mjs`, `src/data/algorithmCodes.ts`.

Untouched: server code, store, other algorithms, ExplanationPanel/CodePanel, line maps, the Sprint 1–2 tests (apart from the one file above).

## 6. Tests added (Task 7)

**422 tests pass (63 server + 313 engine + 46 new component tests); 0 expected-fail remain.** Component tests render the *real* `ArrayVisualizer` with `react-dom/server` against *real* traces and the *real* store (no new dependency; zustand serves its initial state to server renders, so store-connected controls are tested through the presentational `SizeSelect` + store, and the connected DOM is verified in Playwright).

| Requirement | Test |
|---|---|
| Correct bars per event type | `barVisuals.test.ts`: documented role for compare/swap/loop-condition/min/insert/assign/found/pivot/merge-write; compare/swap/found bars == the step's indices on all algorithms; **no bar emphasized unless the step names it** |
| Pointers agree with the current step | every in-range pointer drawn exactly once on its own index, the rest off-array, on every step of all 8 algorithms × edge+random inputs; same-index ordering; Bubble never draws `i`; out-of-range pointers (`j=-1`, `right=-1`, quick `i=low-1`) never become bars; pointers gone on every algorithm's final step; dimming outside the working range |
| Previous/Next restore visual state | for all 8 algorithms: markup at every step going forward == markup after stepping back to it; Reset == step 0 |
| Reset removes stale highlights/pointers | Quick Sort mid-run → Reset: no COMPARE role, markup equals a fresh step 0 |
| Not found ≠ green | Linear/Binary/Two-Pointer with an absent target: every bar `default`, banner "Target not found", never "Array sorted" |
| Empty arrays | all 5 sorts × every step: zero bars, no MATCH; final status "Empty array"; searches → "not-found" with zero bars; generators: no `sortedIndices`/`indices`/`undefined` text |
| Merge buffers | structural `buffers` on every merge step; buffer cursors hold exactly the compared values; the `[2,3,1,0]` regression highlights only bar 3 while the left buffer shows `2`; rendered markup has one active cell per buffer; no other algorithm carries buffers |
| Changing algorithms keeps no stale state | every ordered pair of 5 algorithms: after switching mid-run the markup equals a fresh step 0 of the new algorithm; buffers/pivot/target pills/off-array text do not leak; unimplemented → no bars; error → no steps |
| Size dropdown | Merge Sort selects 8; every algorithm's default size is selected and equals `array.length` and the trace's state length |

**Mutation checks (restored byte-identical, `diff` clean):** old "every bar green at `complete`" → 5 failures; old Insertion `Math.max(0, j)` clamp → 3 failures; Bubble drawing its pass counter → 2 failures.

## 7. Browser verification (Playwright 1.64.1 + installed Google Chrome, headless 1500×1000, Vite dev server with the app's mock API)

**Final run on the final code: 145 checks, 145 passed, 0 console/page errors.** (An earlier run found 1 failure that was a too-strict check in my script for Two Pointer — its compare step compares the *sum* with the target; the script now verifies the highlighted pair sums to it. Product code was not changed for that.)

| Area | Verified in the real app |
|---|---|
| Per-step rendering, **all 8 algorithms, every step** (≈ 450 steps) | emphasized bars only those named by the step; compare/swap/found bars equal the step's indices; compare bars hold the described values; pivot/min/insert roles only at `pivotIndex`/`minIdx`/`inserted`; pointer chips on exactly the bars the step's pointers name (and none for excluded/out-of-range ones); no dimmed non-default bar; Merge buffers equal the trace's buffers/cursors and no stale buffers on other steps; no status banner except on the final step |
| Final state | all 5 sorts: "Array sorted" and every bar sorted; Linear/Binary/Two-Pointer defaults: "Target found" with only the match(es) green |
| Layout | pointer chips never overlap each other and nothing is drawn outside the chart, on Quick, Merge, Binary and Selection every step, and on Quick Sort with a random 12-element array |
| Size dropdown | Merge Sort shows 8 with 8 bars; Bubble shows 5 with the original preset list; choosing 10 regenerates a 10-element trace |
| Controls | Next,Next,Previous,Previous restores identical bars/pointers/pivot/status; Reset → step 1 with only step-1 pointers; Quick→Bubble and Merge→Linear mid-run leave no chips/pivot/buffers/off-array/status; Linear shows its own `target = 7` pill |
| Search not found (injected, see below) | Linear, Binary, Two Pointer: "Target not found", every bar plain, no MATCH; Linear never shows a green bar at **any** of its 25 steps |
| Found at last position (injected) | Binary: only index 6 is MATCH |
| Binary Search mid-run (injected) | low/mid/high follow the trace on every step; bars outside `[low,high]` dimmed |
| Empty arrays (injected) | Bubble, Insertion, Quick, Merge: no bars at any step, no sorted element, final status "empty"; Two Pointer: `right = -1` listed as off-array, no chip/bar |
| Insertion Sort `[2,1]` (injected) | the `j = -1` step lists `j = -1` as off-array and does not draw `j` on bar 0 |
| Unimplemented / error | Heap Sort → unavailable card, no bars/banner/alert; an injected `generator-error` → `role="alert"` card, no bars, no stack trace, header "ERROR"; selecting another algorithm recovers |
| Accessibility | every bar has `aria-label` "Index n, value v[, role][, pointer …]"; non-default roles carry text badges |

Screenshots reviewed: Quick Sort compare (pivot pill, `▲i`/`▲j`, PIVOT/COMPARE badges), Merge Sort buffers (single highlighted right bar + both buffers with active cells), Linear Search not-found (neutral bars + rose status), error card.

**Requires manual verification / not verified**
* **Not-found, empty-array, last-position and `j = -1` cases were driven by injecting a real generator trace into the app's own store via the dev server's module import**, because the UI has no input/target controls until Sprint 4. They exercise the real components and store but not an end-user input path.
* Only headless Chrome at one viewport. Not tested: mobile layout, Firefox/Safari, real screen-reader behaviour (labels exist but were not tested with assistive technology), colour-contrast measurement, the real (non-mock) backend.
* Play/Pause was **not re-run** this sprint (its logic is untouched; Sprint 2 verified it).
* Chip-overlap checks used the default inputs and one random 12-element Quick Sort array, not an exhaustive input sweep.
* A visual judgement of the new styles (colours/badges) is limited to the screenshots above.

## 8. Commands executed and results

| Command | Result |
|---|---|
| `npm test` | **13 files, 422 passed, 0 failed, 0 expected-fail** |
| `npx tsc -b` | **exit 0, no output** (tests and the new modules are type-checked) |
| `npx oxlint` | **exit 0, 6 warnings, 0 errors** — down from 8 (the two `validate_linemaps.mjs` warnings went with the file); remaining: `AITutorDrawer.tsx` ×3, `AdminPage.tsx` ×2, `AuthPage.tsx` ×1, all pre-existing in untouched files. My first version added one `react/only-export-components` warning to `ExecutionControls.tsx`; fixed by moving `getSizeOptions` to `sizeOptions.ts`. |
| `npm run build` | **success**, 2932 modules, built in ≈2 s (pre-existing >500 kB chunk notice) |
| `node verify3.mjs` (Playwright) | **145/145 passed** (≈3.5 min) |

## 9. Remaining known defects

* **Sprint 4:** no input/target controls (P1-1); the default targets still make Linear/Binary/Two-Pointer always find on the trivial path from the UI.
* **Swap animation:** bars do not slide past each other; values/heights transition in place (see §3). A real move animation needs stable element identity in the trace.
* **P2:** searches/Two-Pointer silently sort their input (`store.array` ≠ displayed array); Play at the final step does nothing; Bubble/Selection `sorted` annotation steps share a loop line; unmapped `n = …`, loop-initializer and Python `return arr` lines; Two Pointer lacks the `while (left < right)` event and the C out-param assignment lines; multi-line swaps highlighted at their first line only.
* **Pre-existing layout items noticed, not changed:** the step counter ("23 / 104") wraps onto three lines in the controls card; the explanation panel's variable chips briefly overlap while their Framer-Motion `layout` animation runs (settled screenshots are clean).
* The mapping of step types to roles is generic: e.g. `make-left`/`make-right` bars are shown as `assign` (blue) even though the values are copied *out* of those bars into a buffer.
* Dimming is a presentation choice (opacity 40 %) based on the working range; it is not yet user-toggleable.

## 10. Recommended next sprint (Sprint 4, not started)

Input and target controls (custom array, target, presets: found-first/last/middle/missing/empty) with store tests and an end-user Playwright path, retiring the injected-trace checks from §7; then the remaining P2 items (Play-at-end, input-sorting transparency, Two-Pointer `while` event).

Stopped here as instructed; Sprint 4 has not been started.
