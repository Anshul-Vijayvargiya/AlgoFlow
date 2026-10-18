# Visualization Reliability Sprint 4 — Input Controls

Scope: let users enter their own array and search target through the real UI, and generate/navigate the correct trace. No Phase 4, no new algorithms, no redesign. The visual design (cards, colours, buttons) and the `AlgorithmDefinition → ExecutionStep[] → UI` architecture are unchanged; no second engine and no duplicated algorithm logic were added.

## 1. Audit (Step 1) — how input reached the generators before

| Item | Finding |
|---|---|
| Store → generator | `buildExecution(id, array)` called `def.generateSteps([...array])` **with no params**. The store never passed a target. |
| Linear Search | honours `params.target`, preserves order (default target = middle element). |
| **Binary Search** | **silently sorted the user's array inside the generator** (`[...input].sort(...)`) and defaulted the target to the middle element. |
| **Two Pointer** | **silently sorted** the array; default target = `min + max` (always the trivial first pair). |
| Sorts | all five sort a copy (`[...input]`); the caller's array is never mutated (re-verified by tests). |
| UI | only Randomize / Size / Speed; arrays were always random 10–94; negative values were impossible and would have rendered as flat bars. |
| Size select | a custom array length would not have been representable. |

## 2. Input controls implemented (Steps 2–3)

A new **Array / Target** panel (`InputPanel.tsx`) sits between the visualization and the playback controls, styled like the existing cards.

* **Array field** — comma-separated integers, e.g. `5, 1, 4, 2` (a surrounding `[ ]` is accepted; blank = empty array). Up to **16** values (keeps bars and pointer labels legible), each **−999…999**. Parsed exactly as typed: order, duplicates and negatives are preserved. `-0` is normalised to `0`.
* **Target field** — only for algorithms whose definition declares a target: **Linear Search ("Target value"), Binary Search ("Target value"), Two Pointer ("Target sum")**. Zero and negatives are valid. No target field is shown for the five sorts.
* **Validation** runs on every keystroke with messages that name the position, e.g. `Value 2 ("abc") is not a whole number.`, `Value 3 is empty — remove the extra comma.`, `Value 1 ("1.5") is a decimal — only whole numbers are supported.`, `Value 1 ("1 2") contains a space — separate values with commas.`, `Value 1 (1000) is out of range — use values from -999 to 999.`, `Too many values (17). The visualizer supports at most 16.`, `Enter a value for "Target value".`
* **Apply model:** typing never replaces the running trace. **Visualize** (or Enter) applies a *valid* draft; while the draft is invalid the button is disabled, the field is outlined, and the current trace stays untouched. Parsing a 100 000-value string returns the "too many" error without hanging.
* **Hint line** states the rules for the selected algorithm (sorted-ascending requirement, target meaning, "your order is preserved exactly" / "never changed unless you choose Sort a copy").
* **Negative values** render correctly: `barHeightPercent` scales heights linearly between min and max when any value is negative (non-negative arrays keep the old proportional heights). Arrays longer than 10 use a compact layout.

### Size selector / Randomize with custom input (defined behaviour)
Size and Randomize generate a **new random array** (Randomize keeps the current length). If the user had entered a custom array, it is **not silently discarded**: a visible notice appears — *"Your entered array (3, 2, 1) was replaced by a random one."* — with a **Restore my array** button; the notice survives further randomizing. The Size dropdown always includes the array's real length (it showed "5" for Merge Sort's 8 elements before Sprint 3 and now also shows custom lengths such as 3). Randomize does **not** change the target. For algorithms that require sorted input, Randomize/Size generate an **ascending** array and the field shows the actual values.

## 3. Input semantics per algorithm (Step 4)

| Algorithm | Array | Target | Requirement / transformation |
|---|---|---|---|
| Bubble, Selection, Insertion, Merge, Quick | any order, duplicates, negatives, empty, single | none | The generator sorts a **copy**; the user's array is shown unchanged at step 1 and stays in the field. |
| **Linear Search** | any order | integer value | **Input order preserved exactly**; reports the **first occurrence**; absent target → "Target not found". |
| **Binary Search** | **must be ascending (non-decreasing)** | integer value | **No silent sorting anywhere.** An unsorted draft gives a validation error naming the offending indexes (`index 0 (5) is greater than index 1 (1)`) and a clearly labelled **Sort a copy** button. Clicking it replaces the array with a sorted *copy*, applies the *typed* target, and shows *"Sorted ascending because Binary Search requires it. Your original order: 5, 1, 4, 2."* with **Restore original order**. |
| **Two Pointer** | **must be ascending** | **target sum** | Existing semantics, unchanged: find two *different positions* `left < right` of an ascending array whose values **sum to the target** (an element cannot pair with itself; duplicates may pair). Same unsorted handling as Binary Search. |

The requirements are declared once, on the real definitions (`AlgorithmDefinition.inputSpec`: `target { label, hint, defaultValue }`, `sortedRequired`), and read by the parser, the store and the UI. The Binary Search and Two Pointer **generators no longer sort**; a direct caller passing unsorted input gets a faithful trace of the displayed code plus an explicit "array is NOT sorted" warning. Default examples: Linear 7, Binary 7, Two Pointer 27 (editable example values shown in the target field — not forced).

## 4. Regeneration and state handling (Step 5)

`useVisualizerStore` has one commit point for every input change. It regenerates **synchronously and atomically**: steps, status, `currentStepIndex = 0`, `isPlaying = false` (the playback effect's timer is cleaned up by React), recomputed `arraySize`, and a bumped `inputRevision` that remounts the input panel so drafts reset to the applied values (so stale highlights/pointers/buffers/completion state cannot survive — they are derived per render from the current step). Selected algorithm and language are preserved.

* **Switching algorithms:** all algorithm-specific state resets. A **custom** array/target is retained and **re-validated** against the new algorithm; default/random arrays are replaced by the new algorithm's own default example. Retained targets survive switching between search algorithms.
* **New explicit state `invalid-input`:** a retained custom array that does not satisfy the new algorithm (e.g. unsorted → Binary Search) shows **no trace** (never another algorithm's/input's trace), an explanatory card, the input panel with the message and **Sort a copy**, disabled Play/Reset/Next/Previous, and Randomize as a way out. The user's array text is untouched.
* **Rapid consecutive changes** cannot leave a stale result: every change is a synchronous replace (tested with 5 back-to-back applies).
* An unimplemented algorithm keeps the custom array for when the user switches back.

## 5. Playback fix (Step 7)
**Play at the last step previously did nothing** (the effect immediately paused). Now `play`/`togglePlay` at the last step **restart from step 1 and play**; with no trace (invalid input) Play is a no-op and the button is disabled. Next at the last step still stops without wrapping.

## 6. Files modified

**New:** `src/engine/inputParsing.ts` · `src/components/visualizer/InputPanel.tsx` · tests: `src/engine/__tests__/inputParsing.test.ts`, `src/store/__tests__/inputFlow.test.ts`, `src/components/visualizer/__tests__/barScale.test.tsx`.

**Modified:** `src/types/algorithm.ts` (`AlgorithmInputSpec`, `inputSpec`) · `src/engine/algorithms/{linearSearch,binarySearch,twoPointer}.ts` (specs; **removed the two silent sorts**) · `src/engine/buildExecution.ts` (optional `params`) · `src/store/useVisualizerStore.ts` (input state, validation-aware execution, copy/restore/sort-a-copy, Play-at-end) · `src/components/visualizer/{ArrayVisualizer,Bar,barVisuals,ExecutionControls}.tsx` · `src/pages/VisualizerPage.tsx` (panel + invalid-input state) · `src/engine/__tests__/algorithms.test.ts` (Binary fuzz now feeds ascending input explicitly) · `vitest.config.ts` (`testTimeout: 30000` — an exhaustive existing test took 7.4 s under full-suite load against the 5 s default and failed spuriously; it passes alone).

Untouched: server code, other algorithms, line maps, the code/explanation panels.

## 7. Tests

**483 tests pass (63 server + 420 engine/store/component), 0 failed, 0 expected-fail**; +61 new this sprint.
* `inputParsing.test.ts` (21): valid forms, order/duplicate/negative preservation, blank/`[]`, `-0`, every malformed-input class and message, range, size limit incl. 100 000 values, long-token truncation, target parsing (0/negative), sortedness helpers, the declared specs of all 8 algorithms (exactly Linear/Binary/Two-Pointer have a target; exactly Binary/Two-Pointer require sorted input; every default input is valid with its default target), `validateAlgorithmInput`, `validateDraft` field attribution.
* `inputFlow.test.ts` (35, against the real store/registry): generators never reorder input (Linear/Binary/Two-Pointer states equal the input in every step; sorts leave the caller's array untouched, incl. negatives/duplicates); Linear first occurrence and 0/negative/missing/empty targets; Binary at every position, absent below/inside/above, negatives, duplicates, single, empty; Two Pointer semantics (duplicates pair, an element cannot pair with itself, negatives, none, empty); `applyInput` regenerates from exactly the entered array+target, resets index/playback, preserves algorithm and language; invalid input rejected with the trace untouched; rapid sequences; empty/single for all 8 algorithms; switching with a custom array (retain, `invalid-input`, Sort-a-copy, Restore, default-target adoption, target retention, unimplemented round trip); Randomize/Size notice + Restore, ascending arrays for sorted-required algorithms, clamping to 16, size = real length; playback (Play at end restarts, Pause keeps position, Next at end, invalid-input no-ops, input change stops playback, Next/Previous/Reset on a regenerated trace, language switch keeps position); **Sort a copy uses the typed target** (regression for a bug found in the browser run).
* `barScale.test.tsx` (5): negative-value heights are strictly monotonic and in range; negatives render with sign in the accessible name; compact layout keeps all 16 bars.
* **Mutation checks (files restored, `diff` clean):** Binary/Two-Pointer sorting silently again → 1 test failed; Linear Search sorting the user's array → 3 failed; store ignoring the target → 3 failed.

## 8. Browser tests (Step 8) — what was actually tested in the real UI

**Playwright 1.64.1 + installed Google Chrome (headless, 1500×1000), Vite dev server with the app's mock API. 229 checks, 229 passed, 0 console/page errors.** The script **does not touch the store or inject traces**: every input is typed into the app's own fields (`fill`) and applied with the app's own *Visualize* button or Enter key; steps are advanced with the app's own Next/Previous/Reset/Play buttons. Expected values come from the real engine (`generateSteps` called in Node for the same inputs) **plus independent oracles written in the script** (Linear examination order/first occurrence, Binary Search `mid` sequence simulation, Two Pointer simulation, independent `sort` for sorting results, regexes for the intended operation of each highlighted line).

For every walked journey, **every step** is checked: step counter, current action message, explanation text, highlighted code line (number and text vs the engine's mapping **and** vs the independent intent regex), bar values equal the step state (so the user's entered order is what is drawn), the "Comparing" panel (`value vs target`), compare bars' indices, pointer chips on the right bars, no "Unmapped step".

| Journey | Real-UI results |
|---|---|
| **Linear Search** (7-element array) | target at first / middle / last index, absent; empty array; duplicates (`2,2,1,2` target 2 → index 0, stops after 1 comparison); negatives with targets `0`, `-3`, `-7`. Final status found/not found; only the match is green; never a green bar when absent; exactly the expected number of comparisons examined in order. |
| **Binary Search** | middle / first / last / absent (inside, below, above range); single element present/absent; empty; negatives + duplicates; mid sequence equals the independent simulation. **Unsorted input**: validation message with indexes, Visualize disabled, Sort-a-copy offered, running trace and typed text untouched; **Sort a copy** → `1, 2, 4, 5`, notice with original order, typed target 4 used, full trace verified; **Restore original order** → explicit "no visualization for this input yet", no bars, Play disabled. |
| **Sorting** (Bubble, Selection, Insertion, Merge, Quick × 6 inputs = 30 full walks) | already sorted, reverse sorted, duplicates, negative values, single, empty: first step shows the entered order untouched, final bars equal an independent sort, status "sorted"/"empty", the field keeps the original array; no target field is shown. |
| **Two Pointer** | valid pairs (middle and ends), no pair, duplicates, negatives; result equals an independent simulation; label "Target sum" and a hint documenting ascending order + sum semantics; unsorted draft → validation + Sort a copy offered, Visualize disabled. |
| **Invalid input** | 7 array errors (non-number, empty value, trailing comma, decimal, space, out of range, 17 values) and 4 target errors (empty, text, decimal, out of range): correct message/field, Visualize disabled, trace unchanged; Enter on invalid input does nothing. |
| **Edge** | 16 values accepted and all bars inside the chart; Enter applies; negative values render with strictly ordered heights. |
| **Switching / Randomize / Size** | custom array retained Bubble → Quick (new trace from step 1, Quick code only); → Binary Search shows the invalid-input state (no stale trace, Randomize still available); → Linear keeps order and the previously typed target; → Merge hides the target field; Randomize over a custom array shows the notice, Restore returns the array and its trace, Size shows 3 then 10; Randomize for Binary yields an ascending array shown in the field. |
| **Playback** | after regeneration: Next ×5, Previous ×2, Next ×2 = identical state; Reset = new initial state; Play runs the whole new trace one step at a time (73 samples, no skips/duplicates) and stops on the last step; **Play at the last step restarts**; Pause holds position; **changing the input during playback stops it** (step 1, no further advance); 5 rapid consecutive applies leave only the last result; changing language on a custom trace keeps step 18 and the correct line in C, C++, Java, Python. |

**Bug found by the browser run (fixed):** *Sort a copy* applied the **previously applied** target instead of the one typed in the draft. Fixed (draft target is passed along) with a unit regression test. During the run three of my own script assertions were wrong (an "empty array" parsed as `[0]`; a regex for a message that says "not in array"; an expectation of the default target after a custom target had been typed) and were corrected; none hid a product defect. The final run is of the final code.

**Honest limits — NOT verified in a browser, or only partly**
* The Playwright scripts live outside the repo (scratchpad); they are **not part of `npm test`/CI**.
* Expected traces come from the engine (not hand-computed), so engine-level mistakes are covered only by the engine/oracle tests and the independent oracles listed above, not by the browser run alone.
* Two Pointer's "Sort a copy" button was verified as *present* for an unsorted draft but not clicked (clicking was verified for Binary Search; the code path is shared).
* Only headless Chrome at one viewport; no mobile, Firefox/Safari, or screen-reader testing (inputs have labels, `aria-invalid`, `role=alert/status`).
* Play was exercised at maximum speed only. Pointer-chip overlap was not re-measured for 16-element arrays with many pointers (only that bars fit and render).
* Two screenshots were reviewed (invalid draft with Sort a copy; sorted-copy notice with pointers `▲low·mid` / `▲high` and dimmed out-of-range bars) — a visual judgement of the new panel is limited to them.

## 9. Commands executed and results

| Command | Result |
|---|---|
| `npm test` | **16 files, 483 passed, 0 failed** |
| `npx tsc -b` | **exit 0, no output** |
| `npx oxlint` | **exit 0; 6 warnings, 0 errors** — all pre-existing in untouched files (`AITutorDrawer.tsx` ×3, `AdminPage.tsx` ×2, `AuthPage.tsx` ×1). My first version added an `only-export-components` warning (a helper exported from `ArrayVisualizer.tsx`); fixed by moving `barHeightPercent` into `barVisuals.ts`. |
| `npm run build` | **success**, 2935 modules, built in ≈1.7 s (pre-existing >500 kB chunk notice) |
| Playwright `verify4.mjs` (real UI, no injection) | **229/229 passed** (first complete run: 227/230 with 3 script-side errors; one separate run had stopped early on the real Sort-a-copy bug above) |

## 10. Remaining known defects

* **Not input-related, still open:** no true swap-movement animation (heights transition in place); Bubble/Selection `sorted` annotation steps share a loop line; unmapped `n =`/loop-initializer/Python `return arr` lines; Two Pointer lacks the `while (left < right)` event and the C out-param assignment lines; multi-line swaps highlighted at their first line; the step counter wraps onto three lines in the controls card.
* **Input-related limitations:**
  * Defaults (target 7/7/27) are example values; **Randomize leaves the target unchanged**, so a randomized array often yields "not found" until the user edits the target.
  * The input panel remounts after Visualize/Randomize/algorithm switch (so drafts reset to the applied values); keyboard focus returns to the page, not the field.
  * Randomize and Size are disabled while playing (existing behaviour); Visualize is not.
  * Values are limited to −999…999 and 16 elements by design.
  * A direct (non-UI) call of the Binary Search / Two Pointer generator with unsorted input is still a faithful trace of the code that may "miss" an existing value — the UI prevents it, and the trace states it.
  * No saved/history of previous inputs, no paste of multi-line formats, no file import.

## 11. Recommended next sprint (not started)
Move the Playwright acceptance suite into the repo (so it runs in CI), add keyboard-focus handling for the input panel, then the remaining P2 trace items (Two Pointer `while` event, unmapped statements) and a real swap animation, which needs element identity in the trace.

Stopped here as instructed.
