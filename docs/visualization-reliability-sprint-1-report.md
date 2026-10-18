# Visualization Reliability Sprint 1 — Report

Scope: regression-test foundation, Bubble Sort P0 fix, explicit failure handling. Nothing else was changed. **The visualization system is not "fixed"** — most findings from `docs/visualization-code-sync-audit.md` remain open (see §7).

## 1. Files changed

### Source (modified)
| File | Change |
|---|---|
| `src/engine/algorithms/bubbleSort.ts` | Removed the early exit (`swappedInPass`, the "Early Exit" `return` step and its `break`). Fixed the trailing outer-loop-false step so `i` is correct for all `n` (`Math.max(0, n-1)`; previously `n-1`, i.e. `-1` for an empty array). |
| `src/engine/AlgorithmRegistry.ts` | `resolveCodeRef` now returns `number \| null`. Unknown/missing codeRef → `null` (previously silently `1`). Header comment updated. |
| `src/store/useVisualizerStore.ts` | Removed `buildSteps` (which converted any generator exception into "not implemented"). Added `executionStatus` / `executionError` state, fed by `buildExecution`. `resolveCurrentLine()` returns `number \| null`. Dev-only `console.error` on failures. |
| `src/components/visualizer/CodePanel.tsx` | Handles `null` line: no highlighted line, header shows "Unmapped step", dev-only `console.error` naming the algorithm/language/step/codeRef. |
| `src/pages/VisualizerPage.tsx` | Renders the new error card when `executionError` is set; header badge says `• ERROR` instead of `• COMING SOON` in that case. |
| `vitest.config.ts` | `include` now also covers `src/**/*.test.ts` (server tests unchanged). |

### Source (new)
| File | Purpose |
|---|---|
| `src/engine/buildExecution.ts` | Single entry point producing one of four explicit outcomes: `ok`, `unimplemented`, `invalid-algorithm`, `generator-error`. Accepts an injectable definition lookup for testing. User-facing `message` is generic; `detail`/`cause` are dev-only. |
| `src/components/visualizer/ExecutionErrorCard.tsx` | Small error card (existing visual language). Shows the generic message; shows `detail` only when `import.meta.env.DEV`. No stack trace is ever rendered. |

### Tests (new, all under `src/engine/__tests__/`)
`testUtils.ts` · `lineAnchors.ts` · `lineMap.test.ts` · `algorithms.test.ts` · `bubbleSort.test.ts` · `buildExecution.test.ts`

Not touched: all `server/` code, UI layout/styling, other algorithm definitions, `validate_linemaps.mjs` (left in place, see §7), `src/data/algorithmCodes.ts` (dead code, see §7).

## 2. Tests added

**Total: 145 tests + 4 documented expected-failures** across 4 new files (full suite with the 63 server tests: 208 passed + 4 expected-fail).

| File | Tests | What it covers (all against the real registry, real traces, real code listings and real line maps — no copied code/mappings) |
|---|---|---|
| `lineMap.test.ts` | 14 | Every language has code + lineMap; every mapped line is an in-bounds integer; all 4 languages define identical codeRef sets; every codeRef emitted by ~hundreds of traces (default, edge cases, 40 random inputs, search targets) resolves in all 4 languages; every step has a codeRef; an anchor exists for every codeRef. **Semantic check:** the text of the line each ref maps to must match a language-neutral regex for the intended operation (not blank, not brace-only). `found`/`not-found` steps must land on a line containing `return`. `resolveCodeRef` unknown/missing/empty → `null`. |
| `algorithms.test.ts` | 39 (35 + 4 `it.fails`) | Sorting results for empty, single, duplicates, all-equal, sorted, reversed, mixed + 150 fuzz inputs for all 5 sorts, input not mutated. Linear search (first/middle/last/duplicate/single/missing/empty). Binary search (middle/first/last/absent below-between-above/empty/single/duplicates, `mid` arithmetic, fuzz vs reference). Two-pointer. Step-consistency: contiguous ids, init first / complete last, constant state length, indices and sortedIndices in range, permutation preserved for swap-based sorts, compare bars hold compared values, pointers agree with variables. |
| `bubbleSort.test.ts` | 79 | For `[1,2,3,4]`, `[5,1,4,2]`, `[4,3,2,1]`, `[2,2,1,2]`, `[]`, `[7]` (×12 properties each): sorted result; no return/early-exit step; exactly n(n−1)/2 compares and conditions; swaps == inversions; passes/locked indices; outer loop true for i=0..n−2 then exactly one false with correct `i`; every condition result arithmetically correct; nothing but `complete` after the outer-false step; array changes only on swap steps and swaps exchange exactly the highlighted out-of-order pair; true→swap / false→no swap; compare bars hold compared values; all codeRefs resolve. Plus: displayed code contains no early-exit logic in any language, step-type→line-text checks, golden traces, 150-input fuzz. |
| `buildExecution.test.ts` | 17 | ok / unimplemented / invalid id / registered-in-nav-but-missing / throwing generator (Error and non-Error) are distinct; user message contains no error text or stack; input not mutated; registry ↔ nav `implemented` consistency; store: status/error states, error cleared on algorithm switch, unknown codeRef → `null` line, language switch preserves steps and position. |

**Ratchets for known defects** (so remaining audit findings cannot silently disappear *or* silently regress):
* `lineAnchors.ts` `KNOWN_LINE_MAP_DEFECTS` (6 entries: Java Quick Sort ×4, C++ Merge Sort ×2) and `KNOWN_RETURN_LINE_DEFECTS` (2 entries). A new bad mapping fails the suite; a listed mapping that gets fixed also fails the suite until its entry is removed.
* 4 `it.fails` tests: Merge Sort compare-highlight mismatch (P1-6), Insertion/Quick pointer≠variable (P2-1), empty-array `undefined`/`NaN`/negative indices (P2-3), and **one new finding** — Insertion Sort marks index 0 as sorted for an empty array (`sortedIndices:[0]` at init). They pass while the defect exists and fail once it is fixed.

**Test-quality verification (done, not assumed):**
* Corrupted two Bubble Sort mappings (`do-swap`→99, `outer-loop`→inner-loop line) → 3 tests failed with precise messages; file restored byte-identical (`diff` clean).
* Re-injected the old early-exit into the fixed generator → 8 Bubble Sort tests failed; file restored byte-identical.

## 3. Bubble Sort defects fixed

| Audit defect | Fix | Verified by |
|---|---|---|
| P0-1: trace performed an early exit absent from all four listings | Option **A**: removed the early exit from the trace (smallest correct change; no listing/lineMap edits needed) | "no return/early-exit step", "n(n−1)/2 compares", "displayed code contains no early-exit logic" |
| Contradictory "outer loop `i=n−1 < n−1` → false" emitted *after* the exit | The only remaining outer-false step now follows the real last `i++`; nothing but `complete` follows it | "outer loop true i=0..n−2, then exactly one false", "nothing but complete follows" |
| Code panel jumped to line 1 (`fn-entry`) for an invented `return` | The `return` step no longer exists | no step has type `return` |
| (found while fixing) `i` reported as `-1` for `[]` (`i = n−1`) | `i = Math.max(0, n−1)` | `[]` golden trace: `variables {i:0,'n-1':-1}`; `[7]`: `{i:0,'n-1':0}` |

## 4. Before / after trace behavior

| Input | Before (audit) | After |
|---|---|---|
| `[1,2,3,4]` | 19 steps: pass 0, `Early Exit` (type `return`, line 1), then "Outer loop i=3<3 false" | 39 steps: passes i=0,1,2 (6 compares, 0 swaps), outer loop `0:true 1:true 2:true 3:false`, `complete` |
| `[5,1,4,2]` | 43 steps; step 40 `Early Exit`/line 1 then step 41 outer-false | 43 steps; step 40 is the real `i++`→`i=3`, step 41 outer-false (`i=3`), step 42 `complete`; swaps → `[1,5,4,2]`,`[1,4,5,2]`,`[1,4,2,5]`,`[1,2,4,5]` |
| `[4,3,2,1]` | not recorded | 45 steps, 6 swaps (= inversions) |
| `[2,2,1,2]` | not recorded | 41 steps, 2 swaps (= inversions) |
| `[]` | `i=-1 < -1` text | 3 steps; outer-false with `i=0`, limit `-1` |
| `[7]` | 3 steps | 3 steps; outer-false `i=0`, limit `0` |

## 5. Failure handling (Task 3)

| Situation | Before | After |
|---|---|---|
| Algorithm marked `implemented:false` | stub "not implemented" step | `executionStatus: 'unimplemented'`, same stub, `executionError: null` → `UnimplementedCard` |
| Unknown algorithm id | silently treated as "not implemented" (via `getNavItemById` fallback) | `invalid-algorithm`, `steps: []`, `ExecutionErrorCard`, `• ERROR` badge |
| Marked implemented but not registered | treated as "not implemented" | `invalid-algorithm` with dev detail "marked implemented … not registered" |
| Generator throws | **swallowed → "not implemented yet"** | `generator-error`, `steps: []`, `ExecutionErrorCard`; dev console shows kind, message and the original error object |
| Unknown / missing codeRef | resolved to **line 1** and highlighted | `null`; no line highlighted, header "Unmapped step", dev `console.error` naming algorithm/language/step/ref |
| Production | n/a | Users see only the generic message; `detail` renders only under `import.meta.env.DEV`; no stack traces are rendered anywhere |

## 6. Commands executed and actual results

| Command | Result |
|---|---|
| Baseline (before any change) `npx vitest run` | 5 files, **63 passed** |
| Baseline `npx tsc -b` | clean |
| Baseline `npx oxlint` / `npx vite build` | warnings only / build OK |
| `npx vitest run src/engine/__tests__/lineMap.test.ts` (after mutation, then restored) | 3 failed as intended → after restore **14 passed** |
| `npx vitest run src/engine/__tests__/bubbleSort.test.ts` with old early-exit re-injected | **8 failed, 71 passed** → after restore **79 passed** |
| `npx vitest run src/engine` | 4 files, **145 passed, 4 expected-fail** |
| **`npm test`** (server + engine) | **9 files, 208 passed, 4 expected-fail (212), 0 failed** |
| **`npx tsc -b`** | **exit 0, no output** (tests are type-checked too: `tsconfig.app.json` includes `src`) |
| **`npx oxlint`** | **exit 0; 8 warnings, 0 errors**; all 8 are in files not touched this sprint (`validate_linemaps.mjs` ×2, `AITutorDrawer.tsx` ×3, `AdminPage.tsx` ×2, `AuthPage.tsx` ×1). Linting `src/engine src/store src/components/visualizer src/pages/VisualizerPage.tsx` alone: 0 warnings. |
| **`npm run build`** (`tsc -b && vite build`) | **success**, 2931 modules, built in 1.61 s (`dist/` regenerated; main chunk 1,332 kB — pre-existing size warning) |

Not done: no browser/manual UI run, so the new `ExecutionErrorCard` and the "Unmapped step" header were verified by type-check, build and store-level tests only, not visually. The 4 `it.fails` markers are intentional.

## 7. Remaining audit findings (all still open)

**P1**
* **Input / target controls (P1-1):** store still calls `generateSteps` without `params`; Linear/Binary/Two-Pointer defaults always hit the trivial path; no custom input.
* **Visualizer ignores `indices` for non-compare/swap/found steps, pointers never drawn, `subRange` unused (P1-2).**
* **Final `complete` step turns every bar green, including failed searches (P1-3).**
* **Line-map defects (P1-4):** Java Quick Sort ×4, C++ Merge Sort ×2 (pinned in `KNOWN_LINE_MAP_DEFECTS`), Python Binary Search `found`→`if` and C Two-Pointer `return-pair` (pinned in `KNOWN_RETURN_LINE_DEFECTS`).
* **Merge Sort (P1-5/6/8):** Python listing is a different algorithm from the trace (not detectable by anchors); wrong highlighted bars (pinned by `it.fails`); no recursion/base-case events.
* **Quick Sort (P1-7/8):** omits `i++`, self-swaps, loop control, recursion, `return`.

**P2:** pointer/variable mismatches in Insertion/Quick (pinned); empty-array text/indices (pinned); size dropdown shows 5 for Merge Sort (8 elements); no real swap animation; Play-at-end does nothing; annotation `sorted` steps share loop lines; unmapped `n =`/init/`return arr` lines; Two-Pointer missing `while` events; canned AI-tutor replies; Bubble outer-false step carries `variables.i` but no `pointers.i` (cosmetic).

**Housekeeping still open:** `validate_linemaps.mjs` (hard-coded copies, bounds-only) is now superseded by `lineMap.test.ts` but was deliberately not deleted (out of scope; delete next sprint). `src/data/algorithmCodes.ts` is dead code. Nav `implemented` flags are still hand-maintained, though a test now enforces agreement with the registry. New small finding: Insertion Sort `sortedIndices:[0]` for empty input.

## 8. Recommended next sprint (not started)

1. **Quick Sort + Merge Sort trace fixes** — they own the remaining P1 sync defects and the 6 line-map ratchet entries; fix the Java/C++ maps first (cheap), then Merge compare highlights and Python listing, then Quick Sort's missing statements. Each fix removes its `KNOWN_*` entry / `it.fails` marker in the same change.
2. **Input and target controls** (`params` plumbing + UI) so search, two-pointer, empty and edge cases are reachable from the product, with store tests.
3. **Visualizer contract rendering** (indices for all step types, pointer labels, no green-on-failure `complete`, stable keys for swap animation) with component tests.
4. Delete `validate_linemaps.mjs` and `algorithmCodes.ts`; derive the nav `implemented` flag from the registry.

Stopped here as instructed; the next sprint has not been started.
