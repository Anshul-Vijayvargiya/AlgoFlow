# AlgoFlow — Visualization / Code Synchronization Audit

**Scope:** `D:\AlgoFlow\src` as it exists today. No source files were modified.
**Method:** Read every file in the visualizer pipeline, then ran the *real* step generators and the *real* Zustand store under `tsx` (scratch scripts outside the repo) with fixed scenarios plus a 300-case-per-algorithm fuzz of invariants. Nothing below is inferred from earlier implementation reports or from how the UI looks.

Severity: **P0** incorrect results / fundamentally misleading execution · **P1** code–visualization sync or control/state defects · **P2** minor display, explanation, usability.

---

## 0. Executive summary

The pipeline's *architecture* is sound: one `ExecutionStep[]` per (algorithm, input), and the visualization, code panel, variables and explanation all read the same `steps[currentStepIndex]`. Language switching does not regenerate steps. There is no cross-algorithm trace or code leakage. All five sorts produce a correctly sorted final state on 1,500 fuzz inputs.

The product-correctness problems are in what the traces **claim** versus what the displayed code **does**, and in what the UI can **reach**:

1. **P0 — Bubble Sort trace runs an optimization (early exit) that the displayed code does not contain**, then emits a contradictory "outer loop false" step after the exit.
2. **P1 — The UI can never show a search miss, a target at either end, or any non-trivial two-pointer movement.** There is no input/target control, and the store never passes `params`. Binary Search always finds the middle element in 1 iteration (7 steps); Two Pointer always finds the extreme pair in its first check (5 steps); Linear Search always finds index ⌊n/2⌋.
3. **P1 — The array visualizer ignores `indices` for every step type except `compare`/`swap`/`found`.** Insertion Sort draws **0** highlighted bars in its entire default trace; Selection Sort 4 of 41 index-carrying steps; Binary Search 1 of 4. `pointers` and `extraInfo.subRange` are never drawn on the bars.
4. **P1 — Several line maps point at the wrong line** (Java Quick Sort ×4, C++ Merge Sort ×2), and the Merge Sort Python listing is a different algorithm from the trace.
5. **P1 — Merge Sort highlights the wrong bars** (and the highlighted bars show different values than the message states).
6. **P1 — Quick Sort omits executed code lines** (`i++`, self-swap, loop control, recursion) so the code panel skips lines that really run.
7. **P1 — Every algorithm's final `complete` step turns all bars green**, including a Binary/Linear Search that returned "not found".

No frontend tests exist (`vitest.config.ts` only includes `server/tests/**`), and `validate_linemaps.mjs` validates hard-coded copies of the code and only checks line *bounds*, so none of the above is caught by any automated check.

---

## 1. Actual architecture and data flow

```
Sidebar.handleSelect(id)                         components/layout/Sidebar.tsx
  └─ store.setAlgorithm(id)                      store/useVisualizerStore.ts:104
       ├─ def = getAlgorithmDefinition(id)       engine/AlgorithmRegistry.ts (Map built by register())
       ├─ array = def.defaultInput               (or [] when unregistered)
       ├─ steps = buildSteps(id, array)          store:66  → def.generateSteps([...arr])   ← no params ever passed
       │        └─ unregistered / throws → 1 stub "not implemented" step (state: [])      (store:73 swallows exceptions)
       └─ currentStepIndex = 0, isPlaying = false

Header language <select> → store.setLanguage(lang)   (only sets selectedLanguage; steps untouched)

Render (all read the SAME steps[currentStepIndex]):
  VisualizerPage          currentStep → message badge + <ArrayVisualizer currentStep/>
  ArrayVisualizer         state[], indices[], sortedIndices[], type, extraInfo.pivotIndex
  CodePanel               def.code[lang] ; line = store.resolveCurrentLine()
                            = resolveCodeRef(def, lang, step.codeRef) = def.lineMap[lang][codeRef] ?? 1
  ExplanationPanel        message, explanation, variables, pointers, comparedValues, result, type
  AITutorDrawer           message/explanation (canned replies)
  ExecutionControls       Prev/Next/Reset/Play → mutate currentStepIndex/isPlaying only
                          Play = setTimeout(nextStep, speed) in a useEffect
```

**Single source of truth:** `AlgorithmDefinition` (code ×4, lineMap ×4, `generateSteps`) in `src/engine/algorithms/*.ts`, registered in `AlgorithmRegistry.ts`. `CodePanel` looks up the definition by `selectedAlgorithm`; there is no fallback to another algorithm (the legacy Bubble-Sort fallback is gone).

**Same-step question — answered:** yes. Visualization, code line, variable/pointer chips, comparison box, action badge and explanation text all derive from one `ExecutionStep` object. They cannot disagree *with each other across steps*. They can, however, be **internally wrong within one step** (see §5, §7), and the step itself can disagree with the displayed code (see §2).

**Legacy / duplicate logic found**

| Item | State |
|---|---|
| `src/data/algorithmCodes.ts` (443 lines) | **Dead code.** Zero importers. Uses a different codeRef vocabulary (`outer_loop`, `increment_j`…) and independent copies of the code. Risk: someone "fixes" the wrong file. |
| `validate_linemaps.mjs` (446 lines) | Contains **hard-coded copies** of the code/lineMaps (no import of the real definitions). Its only check is `1 ≤ line ≤ length`. It prints `OK` for `place-pivot => line 20: "}"` and `pick-pivot => line 10: "private static int partition…"`. Cannot detect drift or wrong lines. |
| `algorithmMetadata.ts` `implemented:` flags | Hand-maintained duplicate of registry membership. Currently consistent (8 = 8) but nothing enforces it; sidebar badge uses the flag, page uses the registry. |

---

## 2. Confirmed defects (with evidence)

### P0

**P0-1 — Bubble Sort trace executes code that is not displayed, then contradicts itself**
`src/engine/algorithms/bubbleSort.ts:36,93,155-170,~186-196`

* The generator tracks `swappedInPass` and, if a pass had no swap, emits an "Early Exit" step and `break`s (`:155-170`). None of the four displayed listings has a `swapped` flag or any early exit (`bubbleSort.ts` `code:` block).
* After the `break`, the generator **unconditionally** pushes `"Outer loop: i=${n-1} < ${n-1} → false — all passes complete"` (`:192`) — claiming `i = n-1` even though the loop was just abandoned at a smaller `i`.
* The Early Exit step's `codeRef` is `fn-entry`, so the panel jumps to the function signature (line 1) for something that is not a statement in the code.

Reproduction (real generator, C++ line text from the real lineMap):

```
bubble-sort [1,2,3,4]
 14 loop-condition inner-loop  L4  for (int j …)   res=false     ← pass i=0 ends, 0 swaps
 15 sorted         outer-loop  L3  for (int i …)
 16 return         fn-entry    L1  void bubbleSort(…) {          ← "Early Exit"; no such code exists
 17 loop-condition outer-loop  L3  for (int i …)   res=false     ← "i=3 < 3" — but i is 0
 18 complete
```
Expected (displayed code): passes i=1 and i=2 also run (each with its compares), then the outer loop ends with `i=3`. Actual: the trace stops after pass 0 (19 steps) with an invented return. Either the code must show the optimization (and map `swapped` lines in all four languages) or the generator must drop it.

### P1

**P1-1 — No input/target control; the store never passes `params`; defaults always hit the trivial path**
`store/useVisualizerStore.ts:72` (`def.generateSteps([...arr])`), `ExecutionControls.tsx:113-147` (only Randomize / Size / Speed).

| Algorithm | Target chosen when `params` absent | Consequence (verified) |
|---|---|---|
| Linear Search | `arr[⌊n/2⌋]` (`linearSearch.ts:101-104`) | always found at index ⌊n/2⌋; "not found" unreachable from UI |
| Binary Search | `arr[⌊n/2⌋]` of the *sorted* array (`binarySearch.ts:120-125`) | always found at first `mid`; 7 steps; `update-low`/`update-high`/not-found branches unreachable |
| Two Pointer | `arr[0]+arr[n-1]` (`twoPointer.ts:6`) | pair found on first sum check; 5 steps; `left++`/`right--` unreachable |

So the requested scenarios — missing target, first/last position, `[5,1,4,2]`, `[4,2,9,7,5,1,8]` with an arbitrary target, empty array — **cannot be produced through the UI**. They work only by calling `generateSteps` directly (done in this audit, §4). Also "Changing input regenerates the trace" is only satisfiable for random arrays of size 5/7/10/12.

**P1-2 — Array visualizer draws `indices` only for `compare`, `swap`, `found`**
`components/visualizer/ArrayVisualizer.tsx:21-24`

Steps of type `condition`, `assign`, `loop-condition`, `increment`, `decrement`, `sorted`, `loop-start` carry `indices` but are rendered with no highlight. Measured on each algorithm's *default* input (real generators):

| Algorithm | steps | steps with `indices` | indices actually drawn |
|---|---|---|---|
| Insertion Sort | 41 | 20 | **0** |
| Selection Sort | 51 | 41 | **4** |
| Binary Search | 7 | 4 | **1** |
| Bubble Sort | 65 | 40 | 16 |
| Linear Search | 19 | 13 | 5 |
| Merge Sort | 57 | 55 | 17 |
| Quick Sort | 30 | 28 | 18 |

Consequences: Insertion Sort never shows `key`, `j`, or the shifted slot on the bars; Selection Sort never shows the scanned element or current min; Binary Search never shows `mid` until the final step. Within Bubble Sort a pair is amber on *compare*, **unhighlighted** on the immediately following *condition* step, then rose on *swap* (flicker).
`pointers` (low/mid/high, i/j, left/right) are shown only as text chips in `ExplanationPanel.tsx:109-132`, never on bars. `extraInfo.subRange` (Merge/Quick sub-ranges) is never read anywhere.

**P1-3 — Final `complete` step marks every bar "sorted/green", even for searches that failed**
`ArrayVisualizer.tsx:23` — `isSorted = sortedIndices.includes(idx) || type === 'complete'`.
Linear/Binary Search with a missing target end on an all-green array under the message "target not in array". Two Pointer "No pair found" likewise.

**P1-4 — Wrong lines in lineMaps** (verified by printing the mapped line text; `validate_linemaps.mjs` reports all of these `OK`)

| Algo / lang | codeRef | Maps to | Should be |
|---|---|---|---|
| Quick Sort / Java | `pick-pivot` (L10) | method signature `private static int partition(…)` | L11 `int pivot = arr[high];` |
| Quick Sort / Java | `compare-pivot` (L13) | `for (int j = low; …)` | L14 `if (arr[j] <= pivot) {` |
| Quick Sort / Java | `swap-smaller` (L15) | `i++;` | L16 `int temp = arr[i];` (start of swap) |
| Quick Sort / Java | `place-pivot` (L20) | `}` (closing the for-loop) | L21 `int temp = arr[i + 1];` |
| Merge Sort / C++ | `fn-entry` (L12) | **blank line** — final "Complete" step highlights an empty line | L13 `void mergeSort(…) {` |
| Merge Sort / C++ | `split-range` (L14) | `if (l >= r) return;` | L15 `int mid = l + (r - l) / 2;` (the step is the split) |
| Binary Search / Python | `found` step uses `check-equal` (L5) | `if arr[mid] == target:` | L6 `return mid` (no `return-index` ref exists in Python; C-family fine since `return mid` is on the same line) |
| Merge Sort / Java | `merge-fn` (L10) | method declaration | the call site (L7) is what executes after the two recursive calls |

**P1-5 — Merge Sort Python listing is a different algorithm from the trace**
`mergeSort.ts` `code.python` is the functional, slice-and-return variant (`merge_sort(arr)`, `mid = len(arr)//2`, `res.append`, no `l/r`, no in-place writes). The trace is the in-place `(l, mid, r)` variant: it reports `l`, `r`, `mid`, `left`, `right`, `k`, and "placed X at index k" in `arr`. Those variables and the in-place array state do not exist in the displayed Python. Mappings such as `merge-fn → i = j = k = 0` and `copy-left → res.append(left[i])` highlight lines whose effect (appending to `res`) is not what the bars show (`arr[k] = …`).

**P1-6 — Merge Sort highlights the wrong bars / values**
`mergeSort.ts:48` — compare step highlights `[left + i, mid + 1 + j]`, but `arr` is overwritten in place from `left` onward while `leftArr/rightArr` are copies, so `arr[left+i]` no longer holds `leftArr[i]` once any element has been placed from the right.
Minimal repro: input `[2,3,1,0]`, step 15 → bars `[0,3,0,1]`, highlighted indices `[0,3]` show values **0 and 1**, message says *"Compare left element 2 and right element 1"*. Fuzz: 763 mismatching compare steps in 300 random inputs. The temporary `left`/`right` buffers are also not visualized, so mid-merge states legitimately show duplicated/missing values with nothing to explain them (P2 aspect).

**P1-7 — Quick Sort omits code that executes**
`quickSort.ts:61,82`, no steps for loop control

* `i++` (C++ L6) is never mapped or highlighted; the `if (arr[j] <= pivot)` true branch jumps from *compare* straight to *swap* (or nothing).
* When `i === j` the generator **skips the swap step** (`:61`) although the displayed code performs `swap(arr[i], arr[j])` every time. Likewise `pivotPos === high` skips the pivot swap (`:82`).
* Not represented at all: `i = low - 1`, `for j` init/condition/increment, `if (low < high)`, the three recursive calls and their returns, `return i + 1`.
* Repro `quick-sort [1,2,3]` (9 steps): pivot → compare → compare → `sorted(place-pivot L10)` — the code panel goes from line 5 straight to line 10, never touching lines 4, 6, 7, 11, 14–18, although all of them execute.
Also the `sorted` step ("pivot locked") is mapped to `place-pivot` (the swap line) even when no swap occurred.

**P1-8 — Recursion is not shown for Merge Sort / Quick Sort**
Merge Sort emits `split` and `merge`, but never the base case `if (l >= r) return;` nor the call/return events; there is no call-stack or depth indicator. The user cannot see *which* recursive frame a step belongs to beyond the `l/mid/r` chips.

**P1-9 — Silent fallbacks hide mapping errors**
`AlgorithmRegistry.ts:56,58` and `store:101`: a missing codeRef or missing key resolves to **line 1** (`?? 1`) and highlights it as if it were the current line. `store:73` swallows any exception in `generateSteps` and shows "not implemented yet" for an algorithm that *is* implemented. Nothing in dev mode ever surfaces a bad key (verified: `resolveCodeRef(def,'cpp','does-not-exist') → 1`).

### P2

* **P2-1 Pointer/variable disagreement.** Insertion Sort `While FALSE` step: `variables.j = -1` but `pointers.j = 0` (`insertionSort.ts:231`, 263 occurrences in fuzz). Quick Sort compare steps: `pointers.i = max(low,i)` vs `variables.i = i = low-1` (`quickSort.ts:47`, 1,237 occurrences).
* **P2-2 No real swap animation.** `ArrayVisualizer.tsx:29` keys bars `bar-${idx}-${val}`; after a swap both keys change, so Framer Motion unmounts/mounts instead of animating a move. A swap is shown as two values changing in place plus a "SWAP" badge.
* **P2-3 Empty-array edge cases produce garbage text/indices** (reachable only via direct call, not the UI): Binary Search → `"target = undefined"`, `indices [0,-1]`; Two Pointer → `"val undefined"`, `indices [0,-1]`; Insertion Sort init text `arr[0]`→undefined (70/31/30 fuzz hits).
* **P2-4 Size dropdown out of sync.** Merge Sort's default length is 8, not in `{5,7,10,12}` (`ExecutionControls.tsx:124-127`); the controlled `<select value=8>` renders "5" while the array has 8 elements. Verified `arraySize: 8` after `setAlgorithm('merge-sort')`.
* **P2-5 Search/two-pointer arrays are silently sorted** (`binarySearch.ts:119`, `twoPointer.ts:4`): `store.array` is unsorted while every step's `state` is sorted; after "Randomize" the user's array is not what they see (verified).
* **P2-6 Play at the final step does nothing.** The effect (`ExecutionControls.tsx:34-41`) immediately pauses; there is no auto-restart/reset.
* **P2-7 Explanation-only steps share lines with real events.** `sorted` ("element locked") steps in Bubble/Selection are mapped to the `outer-loop` line though no statement executes there. `compare` + `condition` pairs both map to the same line (two steps, one line).
* **P2-8 Unmapped statements:** the `n = arr.size()` / `len(arr)` line, Python `return arr`, loop *initializations* (`j = 0` / `i = 0` merged into the first loop-condition for Bubble/Selection), C/Java 3-line swaps collapsed to the first line.
* **P2-9 Two Pointer** never emits the `while (left < right)` check or the exit (false) event; `sum == target` and `sum < target` are folded into one compare step.
* **P2-10 AI Tutor replies are canned** and generic ("handles loop conditions carefully…") — not derived from the step.

---

## 3. Source-of-truth assessment (checklist from the brief)

| Question | Finding |
|---|---|
| Steps generated from the selected algorithm's implementation? | Yes (per-definition `generateSteps`), **but** the generators are hand-written parallel logic, not derived from the displayed code — which is how P0-1, P1-5, P1-7 arise. |
| Visualization uses current step state? | Yes (`state`, `sortedIndices`), but ignores most of the step's `indices`/`pointers` (P1-2). |
| Highlighting uses current step's codeRef? | Yes; resolved only via `lineMap[lang][codeRef] ?? 1`. |
| lineMap correct for every language? | No — see P1-4. All used codeRefs exist in all 4 lineMaps for every default/fuzz input, all lines in bounds, but 8 entries point at the wrong line. |
| Variables/pointers same step? | Yes, but values can disagree within a step (P2-1). |
| Explanations describe the actual operation? | Mostly; wrong for Bubble early exit (P0-1) and Merge Sort compare (P1-6). |
| Can selecting an algorithm reuse another's trace/code? | **No.** Verified for all 8 algorithms: 0 foreign codeRefs; code panel reads `def.code` of the selected id; unregistered ids give one stub step and `UnimplementedCard`. |
| Language change affects only code representation? | Yes. Verified: `steps` reference identical, `currentStepIndex` preserved, line re-resolved (bubble step 5: python L6, java L7). |
| Prev/Next/playback consistent? | Yes at store level (see §5), with P2-6. |

---

## 4. Algorithm correctness and scenario results

Method: real `generateSteps`, step-by-step dumps with the C++ line text, plus fuzz (300 inputs × each algorithm, sizes 0–9, values 1–30, duplicates included).

**Final results:** Bubble, Selection, Insertion, Merge, Quick — final `state` equals `sort(input)` on all 300 inputs each. Searches return the correct index/not-found on every tested case.

### Linear Search — `[4,2,9,7,5,1,8]`, target 7 (via `params`)
* Verified trace (19 steps): init → `i=0` → [loop-cond, compare, condition(false), `i++`] for i=0,1,2 → i=3 loop-cond, compare, condition **true**, `found` at `return i;` (L4) → complete. Indices checked 0,1,2,3 in order; `i` updates 0→3; found index 3. ✔ Logic and mapping correct.
* Missing target 3: 33 steps, 7 comparisons, final loop-cond `i=7<7 false` (L2), `not-found` at `return -1;` (L7). ✔
* Empty array: init, `i=0`, loop-cond false, not-found, complete. ✔ (target silently defaults to 0.)
* **Never displays Bubble Sort code** — verified.
* ✘ UI path: target is always `arr[3]` (P1-1); final step turns all bars green (P1-3); `condition` step unhighlighted on bars (P1-2).

### Bubble Sort — `[5,1,4,2]`
43 steps. Pass 0: compare(5,1)→swap→`[1,5,4,2]`; compare(5,4)→swap; compare(5,2)→swap→`[1,4,2,5]`; pass 1: compare(1,4) no swap; compare(4,2)→swap→`[1,2,4,5]`; pass 2: compare(1,2) no swap. Array/indices consistent, the "no swap" branch is shown, final `[1,2,4,5]`. ✔ for this input.
✘ But see P0-1 on any pass with zero swaps (and note this input also ends with the contradictory step 41 after the early exit at step 40). ✘ Swap is not animated as movement (P2-2). `n = arr.size()` line never shown (P2-8).

### Binary Search — `[1,3,5,7,9,11,14]` (all with `params.target`)
| Case | Steps | Result |
|---|---|---|
| middle (7, = UI default) | 7 | found at `mid=3` ✔ |
| first (1) | 17 | mid 3→high=2; mid 1→high=0; mid 0 found ✔ |
| last (14) | 17 | low=4; low=6; mid 6 found ✔ |
| absent (6) | 20 | high=2, low=2, low=3 → `while low<=high` false → `return -1` ✔ |
| empty | 5 | not-found ✔ but text says `target = undefined`, `indices [0,-1]` (P2-3) |

Left/right/mid, each comparison outcome, termination: ✔ correct in all cases. Highlighted lines correct for C/C++/Java; **Python `found` highlights `if arr[mid] == target:` not `return mid`** (P1-4). Of these, only the first row is reachable from the UI (P1-1).

### Merge Sort
Fully implemented (no unavailable state needed). Final sort correct. ✘ Wrong highlighted bars (P1-6), Python is a different algorithm (P1-5), blank-line mapping in C++ (P1-4), no recursion call/base-case events (P1-8).

### Other implemented algorithms (not in the brief)
* Selection Sort: trace matches code line-for-line; ✘ only 4 highlight frames drawn (P1-2).
* Insertion Sort: trace matches code; ✘ zero bars highlighted (P1-2); P2-1 pointer mismatch.
* Quick Sort: correct result; ✘ P1-4 (Java), P1-7, P1-8, P2-1.
* Two Pointer: correct when target is varied via `params`; ✘ P1-1.

---

## 5. Execution controls & state (real store, executed)

| Requirement | Result |
|---|---|
| Next advances exactly one step | ✔ `nextStep` +1; at last step sets `isPlaying=false` |
| Previous restores exact previous state | ✔ index-based over an immutable array; Next→Prev round-trip returns the same index; no-op at 0 |
| Play / Pause don't skip or duplicate | ✔ by construction (one `setTimeout(nextStep)` per effect run, cleaned up). ✘ P2-6 (Play at end). Next/Prev/Randomize/Size are disabled while playing |
| Reset restores initial state | ✔ `currentStepIndex=0, isPlaying=false` (array/steps intentionally kept) |
| Speed changes timing only | ✔ `setSpeed` touches only `speed`; index and `steps` identity unchanged |
| Changing input regenerates the trace | ✔ for Randomize/Size; **✘ no way to enter an input or target** (P1-1) |
| Changing algorithm resets all algorithm-specific state | ✔ array, arraySize, steps, index, isPlaying all reset (language intentionally kept). ✘ P2-4 dropdown mismatch for Merge Sort |
| Changing language preserves position | ✔ verified (idx 5 → 5, same `steps` reference) |
| Unimplemented algorithm | ✔ one stub step, `UnimplementedCard`, code panel not shown; no foreign code |

No stale-closure or duplicated-state bugs were found in the store. The risk is in what the steps contain, not in how they are stepped.

---

## 6. CodeRef / lineMap validation

Automated check against the **real** definitions (not `validate_linemaps.mjs`): for each algorithm × 8 inputs (default, empty, 1 element, duplicates, sorted, reversed, random) × 4 languages:

* Every emitted `codeRef` exists in all four `lineMap`s: **✔ 0 missing**.
* Every mapped line within `[1, code.length]`: **✔ 0 out of bounds**.
* Every algorithm has a `codeRef` on every step (no unmapped step types): ✔.
* Mapped line is blank/closing-brace-only: **✘ 2** — Merge Sort C++ `fn-entry` → L12 (blank), Quick Sort Java `place-pivot` → L20 (`}`).
* Semantically wrong mapped line: **✘ 8** entries (table in P1-4), found only by reading the mapped line text.
* Declared but never emitted by defaults: `binary-search.update-high` (reachable only with a target < first mid), `two-pointer.increment-left/decrement-right` (unreachable from the UI) — dead coverage, not bugs.
* Executable lines with **no** mapping at all: Quick Sort (`i = low-1`, `i++`, loop header, `return`, whole `quickSort` body), Merge Sort base case and merge-buffer construction, Bubble/Selection `n = …` and inner/outer initializers, Python `return` lines, Two Pointer `while` header.
* Accidental sharing between algorithms: none — each lineMap lives in its own definition; keys are deliberately namespaced per file.

---

## 7. State synchronization findings (within a step)

Fuzz over 300 inputs/algorithm:

| Invariant | Violations |
|---|---|
| Final sorted state (5 sorts) | 0 |
| `step.id` contiguous | 0 |
| `indices` within `state` bounds | Binary Search 35, Two Pointer 30 — all empty-array |
| `pointers[k] === variables[k]` where both exist | Insertion 263, Quick Sort 1,237 (P2-1) |
| Highlighted bar values equal `comparedValues` | Merge Sort **763** (P1-6); all others 0 |
| `undefined`/`NaN` in message text | Binary 70, Two Pointer 30, Insertion 31 — all empty-array |

---

## 8. Test coverage gaps

* No frontend/engine test of any kind (`vitest.config.ts` `include: ['server/tests/**/*.test.ts']`).
* `validate_linemaps.mjs`: stale duplicate data, bounds-only, not wired into `npm test`/CI.
* TypeScript cannot catch: wrong line numbers, absent codeRefs (they are `string`), traces diverging from displayed code, or bar-highlight rules.
* Missing automated checks: (a) lineMap completeness/semantic anchors per codeRef; (b) trace-vs-code equivalence (an interpreter of the displayed code or at least golden traces); (c) final-result correctness per algorithm; (d) invariants in §7; (e) store control behaviour; (f) the `implemented` flag vs registry.

---

## 9. Recommended fixes, ranked

**P0**
1. **Bubble Sort:** decide one truth. Recommended: remove the early-exit branch and the unconditional trailing "outer loop false" duplication from the generator so the trace matches the four displayed listings; keep the optimized variant as a separate, clearly labelled option only if code + lineMap for all languages are updated together.

**P1 (in priority order)**
2. **Add an input/target surface** (custom array text input, target field for Linear/Binary/Two-Pointer, presets: found-middle/first/last/missing/empty) and pass `params` through `buildSteps → generateSteps`. Without it the search/pointer branches cannot be demonstrated.
3. **Make the visualizer honor the step contract:** highlight `indices` for every type that carries them (distinct styles for compare / condition / assign / shift), render `pointers` (i, j, low/mid/high, left/right) as labels under bars, shade out-of-range for binary search, draw `subRange` for merge/quick. Make `complete` not imply "sorted" for searches (use `sortedIndices` only). Key bars by stable element id so swaps animate.
4. **Fix line maps** (Java Quick Sort ×4, C++ Merge Sort ×2, Python Binary Search `return mid`) and add the missing statement refs.
5. **Merge Sort:** rewrite Python listing to the in-place `(arr, l, r)` form used by the trace (or trace the functional variant); fix compare highlight indices to the actual positions of the compared values (track the working copy/aux buffers explicitly); add base-case/call/return events.
6. **Quick Sort:** emit `init-i`, loop-condition, `i++`, and the (even self-)swap steps, `return i+1`, and recursion call/return events; remove the `i !== j` / `pivotPos !== high` suppression or show an explicit "swap with itself" step.
7. **Replace silent fallbacks:** `resolveCodeRef` should return `null`/throw in dev for unknown keys and the panel should render "no mapped line"; stop swallowing generator exceptions behind "not implemented".
8. **Replace `validate_linemaps.mjs`** with an engine test that imports the real registry (see §10 stage 1).

**P2**
9. Fix pointer/variable mismatches (P2-1), empty-array text (P2-3), size dropdown (P2-4), unsorted-vs-sorted array display (P2-5), Play-at-end (P2-6), unify `sorted`/annotation steps to a non-code `codeRef` policy, add `n =` and loop-init steps where they are real statements, delete `src/data/algorithmCodes.ts`, derive `implemented` from the registry, make AI Tutor use step data.

---

## 10. Staged implementation plan

**Stage 0 — Safety net (no behavior change).** Add `src/engine/__tests__/*.test.ts` and extend `vitest.config.ts` `include`. Tests import the real registry and assert §6/§7 invariants: all codeRefs mapped in 4 languages, lines in bounds and non-blank, final result correct (fuzz vs reference), `pointers`/`variables` agree, compared bars match compared values, no `undefined`/`NaN` text. Add an **anchor map** per codeRef (e.g. `compare-pivot` ↔ regex `/arr\[j\]\s*<=\s*pivot/`) so "wrong line" fails a test. Delete/replace `validate_linemaps.mjs`. *Expected: tests initially fail on exactly the defects above.*

**Stage 1 — Make the traces truthful (P0, P1-4/5/6/7).** Bubble Sort alignment → line-map corrections → Merge Sort Python/highlight/recursion → Quick Sort missing steps. Stage 0 tests turn green per defect; add golden-trace tests for `[5,1,4,2]`, `[4,2,9,7,5,1,8]/7`, and the binary-search matrix (middle/first/last/absent/empty).

**Stage 2 — Reach the cases (P1-1).** Input/target UI + `params` plumbing; presets; show `target`; validate/limit input. Store tests: changing input/target regenerates steps, resets index, preserves language.

**Stage 3 — Render the contract (P1-2, P1-3, P2-2).** Visualizer highlights for all step types, pointer labels, range shading, non-sorted `complete` state, stable keys for swap animation. Component tests (React Testing Library) for "step with indices → bars marked".

**Stage 4 — Hardening (P1-9, P2).** Strict `resolveCodeRef` (dev error + visible "unmapped" state), surface generator errors, derive `implemented` from the registry, remove dead `algorithmCodes.ts`, fix the P2 list, step-aware AI Tutor.

**Gate:** do not start Phase 4 or add algorithms until Stages 0–2 are green; Stage 3 before any new visualization types.

---

## 11. Verified-OK list (explicitly *not* defects)

* No algorithm can display another algorithm's code or trace.
* Language switching never regenerates or reorders steps; position preserved.
* Previous/Next are exact inverses; clamp works; playback stops at the end.
* Selection/Insertion/Linear/Binary logic and mapped lines (C, C++, Java, Python) match the displayed code (mapping exceptions listed above).
* Final sorted results correct for Bubble, Selection, Insertion, Merge, Quick on 1,500 fuzz inputs.
