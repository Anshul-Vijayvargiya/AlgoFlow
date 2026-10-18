# Visualization Reliability Sprint 2 — Report

Scope: line-map corrections, Quick Sort trace repair, Merge Sort trace repair, regression tests, browser verification. No input controls, no UI redesign, no new algorithms, no Phase 4. **The visualization system is still not fully fixed** — see §7.

## 1. Defects fixed

| Audit item | Fix |
|---|---|
| P1-4 Java Quick Sort ×4 wrong lines | `pick-pivot`→`int pivot = arr[high];`, `compare-pivot`→`if (arr[j] <= pivot) {`, `swap-smaller`→`int temp = arr[i];`, `place-pivot`→`int temp = arr[i + 1];` |
| P1-4 C++ Merge Sort ×2 | `fn-entry` (was a blank line) → `void mergeSort(...) {`; `split-range` (was the base-case `if`) → `int mid = l + (r - l) / 2;` |
| P1-4 Python Binary Search `found` highlighted the `if` | New `return-index` ref used by the `found` step; Python → `return mid` (C/C++/Java: same line as the `if … return mid;`, which is the correct statement there) |
| P2-8 C Two Pointer `return-pair` highlighted the out-param assignment | → `return true;` |
| P1-7 Quick Sort omitted executed code (`i++`, self-swaps, loop control, recursion, return) | Trace rewritten: every executed statement is an event (see §4) |
| P1-8 (Quick) recursion not shown | `call-partition`, `call-left`, `call-right` events, base-case check, call stack in `variables.stack` |
| P2-1 (Quick) `pointers.i` clamped to `low` while `variables.i` was `low-1` | `pointers.i` is now the real `i` |
| P1-5 Merge Sort Python was a different algorithm | Python listing rewritten to the same in-place `(arr, l, r)` algorithm as C/C++/Java |
| P1-6 Merge Sort highlighted bars ≠ described values | Compare steps highlight only bars that really still hold a compared value (details in §4) |
| P1-8 (Merge) recursion/returns/split boundaries | `base-case`/`base-return`, `split-range`, `call-left`/`call-right`/`call-merge`, merge-loop conditions, call stack |

All six known-defect ratchet entries and both return-line entries were removed **only after** the semantic line tests passed for them (the ratchet itself reported each as "fixed, remove the entry"). `KNOWN_LINE_MAP_DEFECTS` and `KNOWN_RETURN_LINE_DEFECTS` are now empty, and a test asserts that.

## 2. Files changed

| File | Change |
|---|---|
| `src/engine/algorithms/quickSort.ts` | Rewritten generator + new refs and line maps in all 4 languages. **Listings unchanged.** |
| `src/engine/algorithms/mergeSort.ts` | Rewritten generator, new refs/line maps. Listings: **Python rewritten**; **C** changed from `if (l < r) { … }` + `m` to `if (l >= r) return;` + `mid` (matches the other languages and the trace's base-case check); C++/Java unchanged. |
| `src/engine/algorithms/binarySearch.ts` | Added `return-index` to all four line maps; `found` step uses it. |
| `src/engine/algorithms/twoPointer.ts` | C `return-pair` line 6 → 7. |
| `src/engine/__tests__/lineAnchors.ts` | New anchors for the new Quick/Merge refs, `return-index`, `return-pair`; both known-defect lists emptied. |
| `src/engine/__tests__/testUtils.ts` | `expectCompareHighlightsAgree` helper. |
| `src/engine/__tests__/algorithms.test.ts` | Merge `it.fails` (P1-6) → real test; Quick Sort added to the strict pointer/variable test; the `it.fails` P2-1 marker narrowed to Insertion Sort only. |
| `src/engine/__tests__/lineMap.test.ts` | Added the corrected-mapping tests. |
| `src/engine/__tests__/quickSort.test.ts`, `mergeSort.test.ts` | **New.** |

Not touched: UI components, store, `server/`, other algorithms, `validate_linemaps.mjs` (now additionally stale for Quick/Merge; still superseded by `lineMap.test.ts`, still not deleted), `src/data/algorithmCodes.ts` (dead).

## 3. Tests added

Engine tests went from 145 passing + 4 expected-fail (Sprint 1) to **311 passing + 3 expected-fail**.

* **`quickSort.test.ts` (77):** for empty, single, two-element sorted/reversed, sorted, reverse-sorted, duplicates, all-equal, mixed, the default input and 60 random arrays, the trace is walked against an **independent oracle** of the displayed code. Each executed statement must be the next step with the right `codeRef`/type/result/pointers/indices **and the exact array contents after every step** (including self-swaps and the always-executed pivot swap). Also: partition invariant after each pivot placement (left ≤ pivot < right), one pivot placement/return per partition, call stack pushed/popped correctly (partition frame only between call and return), pointers agree with variables, every step's mapped line matches its anchor in C/C++/Java/Python, 200 random arrays sorted.
* **`mergeSort.test.ts` (79):** same oracle approach for recursion (`base-case` result, `split-range` boundaries, call-left/right, merge) and merge state (left/right buffers, `i/j/k`, every loop condition result, destination index and array after every copy, merge fills exactly `l..r` and the range is sorted). Compare steps: highlighted indices equal the exact set of still-valid bars. Recursion shape for n ≥ 1: n base returns, n−1 splits, n−1 merges. Empty input = exactly 4 steps with no highlights. **Regression `[2,3,1,0]`** (below). Listings are one algorithm (Python no longer functional-style). Every step's line matches its anchor in all four languages.
* **`lineMap.test.ts` (+10):** each corrected mapping resolves to the exact intended statement text in its language; Binary Search `found` lands on `return mid` in all four languages; known-defect lists are empty.
* **`algorithms.test.ts`:** shared compare-highlight rule now covers Bubble, Selection, Linear, Quick **and Merge**.

**Test-quality verification (done, then restored byte-identical with `diff`):** re-introducing the old behaviors — Quick Sort without the self-swap step → 45 tests failed; Merge Sort's old "always highlight both original positions" → 41 failed; Java `pick-pivot` back to the signature line → 3 failed.

### Regression case `[2, 3, 1, 0]`
Old trace, step 15: bars `[0,3,0,1]`, highlighted indices `[0,3]` (values 0 and 1), message "Compare left element 2 and right element 1".
New trace (63 steps), the equivalent step (step 54 of 63, `left[0]=2 <= right[1]=1 → FALSE`): bars `[0,3,0,1]`, highlighted `[3]` only (value 1 = the right element), explanation states that the left value 2 now lives only in the left buffer, and `variables` show `left = [2, 3]`, `right = [0, 1]`, `i = 0`, `j = 1`, `k = 1`. Asserted in the test, and every other compare step in that trace.

## 4. Before / after behavior

**Quick Sort**
| | Before | After |
|---|---|---|
| `[1,2,3]` | 9 steps; panel jumped line 5 → line 10; no `i++`, no loop control, no self-swaps, no recursion/return events | 37 steps; every executed statement shown, 3 self-swaps shown, pivot swap shown even when in place |
| default `[10,80,30,90,40,50,70]` | 30 steps | 104 steps |
| Events | pivot, compare, swap (when `i≠j`), pivot swap (when ≠), "sorted" annotation | range check, call partition, pivot, `i = low-1`, for-loop condition at every `j` (incl. the final false), compare (with result), `i++`, swap (always), pivot swap (always), `return i + 1`, `pi = …`, call left, call right |
| Pointers | `pointers.i` clamped (disagreed with `variables.i`) | exact |

**Merge Sort**
| | Before | After |
|---|---|---|
| `[2,3,1,0]` | highlighted bars showed different values than the message (step 15) | all compare steps consistent (§3) |
| default `[9,3,7,1,5,4,8,2]` | 57 steps | 160 steps |
| Recursion | split + merge only | base-case check + `return`, split with boundaries, call-left/right/merge, call stack (`mergeSort(0,7) › mergeSort(0,3) › merge(0,1,3)`) |
| Buffers | not shown | `left`/`right`/`i`/`j`/`k` in the variables chips; copy steps are separate events |
| Python | different (functional) algorithm | same in-place algorithm as C/C++/Java |
| `[]` | init, complete | init, base-case(true), base-return, complete (no highlights) |

Design decisions worth reviewing:
* **Returns.** An explicit `return` statement is an explicit step (`return i + 1`, base-case `return`). `void` functions that simply fall off their end (quickSort, mergeSort, merge) have no step — control continues at the caller's next statement and the `stack` variable shows the frame has popped. I did not invent a "return" event for code that has no return statement.
* **Merge highlights.** In-place merging overwrites `arr[l..r]` from the left, so a left value may exist only in its buffer. The compare step highlights the right bar always and the left bar only while `j === 0` (provably intact); the explanation says so when only one bar is highlighted.
* **Multi-line swaps** (C/Java temp swap) and Python multi-statement bodies (`arr[k] = …; i += 1; k += 1`) are highlighted at their first line.
* **Cost of fidelity:** traces are much longer (Quick 30→104, Merge 57→160 steps on the default inputs). This is a direct consequence of "every executed statement"; step counts are not padded.

## 5. Browser verification

Environment: Vite dev server (`VITE_USE_MOCK_API=true` so the app's mock adapter auto-signs-in a demo user; no MongoDB needed) driven with **Playwright 1.64.1 + the installed Google Chrome** (headless), installed in the scratchpad, not in the repo. The script compares the live DOM with traces generated by the real engine **and** with the independent anchor regexes (so a wrong mapping cannot pass just because the engine and DOM agree).

**Result: 124 checks, 124 passed, 0 failed, 0 console/page errors.**

| Check | Result |
|---|---|
| Selecting Quick Sort / Merge Sort shows that algorithm's code, step counter resets to 1, no other algorithm's code appears (Bubble/Quick/Merge cross-check) | ✔ |
| Walked **every step** of Quick Sort (104) and Merge Sort (160) in **C++, Python, C and Java**: highlighted line number and text equal the engine-mapped line | ✔ |
| Same walk: highlighted line text matches the intended-operation regex for that step's ref | ✔ |
| Same walk: "Current Action" message equals the step message | ✔ |
| All compare steps (Quick: all; Merge: all): the `COMPARE`-badged bars hold the described values and are at exactly the described indices | ✔ |
| No "Unmapped step" state | ✔ |
| Bubble, Linear, Binary Search spot-checked the same way (neighbours not broken by the Binary Search `return-index` change) | ✔ |
| Language switch (java → python → c → cpp) at step 38 keeps step 38 and highlights the correct line/message for each language | ✔ |
| Next then Previous restores identical step, line, message and bars | ✔ |
| Reset → step 1, first line, first message | ✔ |
| Play at max speed: sampled counter never skips or duplicates; Pause stops advancing; paused state shows the engine line/message; Play to the end stops itself on the last step | ✔ |
| Quick → Merge switch resets the step and shows Merge code only; Heap Sort shows the unavailable card, no other algorithm's code | ✔ |
| **Negative control:** with the Java `pick-pivot` mapping deliberately re-broken, the run failed (5 step mismatches: highlighted line was the method signature) — then restored | ✔ detector works |

A screenshot of a Merge Sort single-bar compare step (step 57: `left[0]=3 <= right[1]=7 → TRUE`, bar `[3]` highlighted, C++ line 6 highlighted, variables chips show `left`, `right`, `i`, `j`, `k`, `stack`) was inspected and agrees with the engine.

**Not verified / limitations:** only headless Chrome on a 1500×950 viewport (no mobile layout, Firefox, Safari); mock API only (real backend/auth not exercised); Play was only exercised at maximum speed; Randomize / Size controls were not exercised; the checks read DOM text, so purely visual issues are only covered by the one screenshot. In that screenshot two variable chips visually overlap (a Framer Motion `layout` animation in the existing explanation panel, not touched this sprint).

## 6. Commands executed and actual results

| Command | Result |
|---|---|
| `npm test` | **11 files, 374 passed, 3 expected-fail (377), 0 failed** (63 server + 311 engine) |
| `npx tsc -b` | **exit 0, no output** |
| `npx oxlint` | **exit 0; 8 warnings, 0 errors** — identical to Sprint 1 and all in files not touched (`validate_linemaps.mjs` ×2, `AITutorDrawer.tsx` ×3, `AdminPage.tsx` ×2, `AuthPage.tsx` ×1); 0 warnings in `src/engine`, `src/store`, `src/components/visualizer`, `VisualizerPage` |
| `npm run build` | **success** (2931 modules, built in 2.00 s; pre-existing >500 kB chunk notice) |
| `node verify.mjs` (Playwright, real Chrome) | **124/124 passed** (≈2m15s); negative control: 123/124 with the expected failure |

The 3 remaining expected-failures are intentional markers: Insertion Sort pointers ≠ variables (P2-1), Insertion Sort `sortedIndices:[0]` for an empty array, empty-array `undefined`/`NaN`/negative indices for Binary Search / Two Pointer / Insertion Sort (P2-3).

## 7. Remaining known defects

**P1 (open)**
* **P1-1** No input / target controls; the store never passes `params`; Linear/Binary/Two-Pointer defaults always hit the trivial path.
* **P1-2** Visualizer draws `indices` only for `compare`/`swap`/`found`; pointers and `subRange` are never drawn on bars. (Consequence for this sprint's work: Quick/Merge steps of type `assign`/`condition`/`loop-condition`/`increment`/`return` carry correct `indices` but are not drawn; only `compare` and `swap` steps highlight bars.)
* **P1-3** The final `complete` step marks every bar green, including failed searches.
* **P1-9** (partly addressed in Sprint 1) — unrelated to this sprint.

**P2 (open)**
* Insertion Sort pointer/variable mismatch; empty-array text/indices/`sortedIndices` for Binary Search, Two Pointer, Insertion Sort (all three pinned by `it.fails`).
* Size dropdown shows 5 for Merge Sort (default length 8) — visible in the screenshot.
* No real swap animation (bars keyed by index+value).
* Play at the final step does nothing; searches/two-pointer silently sort their input (`store.array` ≠ displayed array).
* Bubble/Selection: `sorted` annotation steps share a loop line; `n = …`, loop-initializers and Python `return arr` are unmapped; Two Pointer lacks the `while (left < right)` event and the out-param assignment lines in C are unmapped.
* New, minor: in Quick/Merge, multi-statement bodies and the 3-line C/Java temp swap are highlighted at their first line only; `stack` is shown only as a variables chip, not a dedicated call-stack view.
* `validate_linemaps.mjs` is stale (still contains the old Quick/Merge data) and `src/data/algorithmCodes.ts` is dead code — both still in the repo.

## 8. Recommended next sprint (not started)

1. **Visualizer contract rendering (P1-2/P1-3):** draw `indices` for every step type, pointer labels, merge/quick sub-range shading, stop `complete` implying "sorted" — this is now the largest remaining gap between the (correct) traces and what the user sees, especially for the new longer Quick/Merge traces.
2. **Input and target controls (P1-1)** with store tests, so search/two-pointer/empty/edge cases are reachable from the product.
3. Cleanup: delete `validate_linemaps.mjs` and `algorithmCodes.ts`; fix the remaining P2 items (Insertion Sort pointer/empty-array, size dropdown, Play-at-end).

Stopped here as instructed; the next sprint has not been started.
