# AlgoFlow Visualizer — Manual Accessibility Checklist

For a **human tester** using a keyboard only and a screen reader. Automated tests (axe-core scans, Playwright keyboard tests) already cover parts of this. They cannot judge whether announcements are understandable, whether focus order *feels* logical, or how real assistive technology behaves.

> **Status: not yet performed.** No row below has been executed by a person. Fill in the result columns when you run it, and do not mark anything as passed from memory or from the automated suite.

## How to run
* Open `/visualizer`. For a backend-free session: `npm run e2e` builds a mock-API copy; or run `VITE_USE_MOCK_API=true npm run dev`.
* **Keyboard only:** put the mouse away. Use Tab / Shift+Tab, Enter, Space, the arrow keys and Escape.
* **Screen reader:** do one full pass per combination you have.
  * Windows: NVDA + Firefox, NVDA + Chrome, JAWS + Chrome.
  * macOS: VoiceOver + Safari.
  * iOS: VoiceOver + Safari.
  * Android: TalkBack + Chrome.
* For each pass, note anything confusing, missing, repeated or too chatty, not just hard failures.

## Session record (one per pass)
| Field | Value |
|---|---|
| Date | |
| Tester | |
| OS + version | |
| Browser + version | |
| Screen reader + version (or "keyboard only") | |
| Viewport / zoom (also try 200 % zoom) | |
| App build (commit / date) | |

## A. Keyboard only
| # | Check | How | Expected | Result | Notes |
|---|---|---|---|---|---|
| A1 | Visible focus | Tab through the whole page | Every focused control shows the cyan focus outline; never invisible | | |
| A2 | Focus order | Tab from the Array field | Array → Target (search algorithms) → Visualize → Reset → Previous step → Play → Next step → Randomize → Array size → Playback speed → code listing; no surprise jumps | | |
| A3 | No keyboard traps | Tab forward and back through everything, including the code listing and sidebar | Focus never gets stuck | | |
| A4 | Choose an algorithm | Tab into the sidebar; Enter on "Binary Search" | Heading changes; focus stays on that item | | |
| A5 | Enter input | Type `5, 1, 4, 2` in Array, `4` in Target, press Enter | For Binary Search: error appears, nothing applied, focus stays in the field | | |
| A6 | Sort a copy | Tab to "Sort a copy", press Enter | Array becomes `1, 2, 4, 5`; notice shows the original order; focus lands in the Array field | | |
| A7 | Restore | Tab to "Restore original order", Enter | Original order back; "no visualization for this input yet" shown; focus in the Array field | | |
| A8 | Visualize keeps place | Valid input, press Enter in Target | Trace regenerates at step 1; focus remains in Target; typing continues there | | |
| A9 | Step through | Tab to Next step; press Enter, then Space, then Previous step | One step per press; Previous returns exactly | | |
| A10 | Play / Pause | Enter on Play; Enter on Pause | Plays; pauses; position kept; Play at the last step restarts from step 1 | | |
| A11 | Speed and size | Arrow keys on Playback speed; arrows / Enter on Array size | Values change; size regenerates the array | | |
| A12 | Language | Arrow keys on the language select | Code changes language, step position kept | | |
| A13 | Code listing scrolls | Tab to the code listing; arrow keys / Page Down | Listing scrolls | | |
| A14 | Phone width (≤ 390 px or 200 % zoom) | Open the algorithm drawer with "Open algorithm list" | Focus moves to "Close algorithm list"; Escape closes and returns focus to the toggle; nothing cut off; Live Code tab reachable | | |

## B. Screen reader
| # | Check | How | Expected | Result | Notes |
|---|---|---|---|---|---|
| B1 | Landmarks | Landmark / region navigation | Regions announced: Visualization, Array and target input (form), Playback controls, Code, Explanation; Visualizer workspace | | |
| B2 | Field labels | Focus Array and Target | "Array, edit text…"; "Target value" (or "Target sum" for Two Pointer); description with the rules is read | | |
| B3 | Validation feedback | Type `1, x` and pause | Message read **once, politely** after you pause, e.g. "Value 2 ("x") is not a whole number." — not on every keystroke, not interrupting | | |
| B4 | Invalid state on field | After B3, re-focus the Array field | Field announced as invalid, with the error as its description | | |
| B5 | Sort a copy disclosure | Do A6 | Notice read: "Sorted ascending because Binary Search requires it. Your original order: 5, 1, 4, 2." | | |
| B6 | Step announcements | Press Next step a few times | Each press announces "Step n of m." plus the action (e.g. "Compare arr[0] = 4 vs target = 7"), politely | | |
| B7 | No flooding during Play | Press Play for ~5 s | **No** per-step announcements while playing; on Pause, the current step is announced once | | |
| B8 | Final result | Step to the end of a not-found search | "Target not found — no element matched" announced as status | | |
| B9 | Control names | Move through the playback controls | Reset, Previous step, Play / Pause, Next step, Randomize, Array size, Playback speed (with "… ms per step"), Programming language | | |
| B10 | Bars | Explore the bars (virtual cursor / swipe) | Each bar: "Index i, value v" + role (e.g. "being compared", "pointer j") | | |
| B11 | Highlighted code line | Explore the code listing | The current line is identifiable (aria-current); line text readable | | |
| B12 | Drawer on mobile | iOS / Android: open the algorithm list | Announced as dialog "Algorithm list"; closing returns to the toggle | | |
| B13 | Unimplemented algorithm | Choose Heap Sort | Card text read; no stray content from the previous algorithm | | |

## C. Results summary
| Combination | Date | Passed | Failed | Notes / issues filed |
|---|---|---|---|---|
| Keyboard only — Chrome / Windows | | | | |
| NVDA + Firefox / Windows | | | | |
| NVDA + Chrome / Windows | | | | |
| JAWS + Chrome / Windows | | | | |
| VoiceOver + Safari / macOS | | | | |
| VoiceOver + Safari / iOS | | | | |
| TalkBack + Chrome / Android | | | | |
