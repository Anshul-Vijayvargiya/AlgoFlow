# AlgoFlow end-to-end tests

Playwright tests that drive the **real application in a real browser**: they type into the app's own fields, press its own buttons and read what is on screen. They are separate from the Vitest unit tests (`npm test`).

## Run locally

```bash
npm ci
npm run e2e:install      # once: downloads Playwright's Chromium, Firefox and WebKit
npm run e2e              # Chromium, full suite (builds the app in mock-API mode, serves it, runs every test)
npm run e2e:cross        # the same suite in Firefox and WebKit + @mobile tests on Pixel 7 / iPhone 14 emulation
npm run e2e:all          # every project
npm run e2e:report       # open the HTML report of the last run
npm run e2e:headed       # watch the browser (debugging)
npx playwright test e2e/tests/two-pointer.spec.ts -g "Sort a copy"   # one spec / one test
npx playwright test --ui                                             # interactive runner
```

Everything needed is started by `playwright.config.ts` (`webServer`): `vite build --mode e2e --outDir dist-e2e` with `VITE_USE_MOCK_API=true` (the only build mode and output folder that allow the mock API), then `vite preview` on `127.0.0.1:5199` (`E2E_PORT` to change). Use `E2E_WORKERS=1` to run serially. A server that was not started by the config is never reused, so a non-mock server cannot be picked up by accident.

## No credentials, no database, no backend

* The app is **built** with `VITE_USE_MOCK_API=true`, which switches the front end to its in-memory mock API client (it signs in a demo user). The flag is compile-time, so it must be set when building — the config does this; `.env` is not read for it and no secret is needed.
* `e2e/fixtures.ts` **aborts every request whose path starts with `/api/`** and **fails the test** if one happens, so a test can never quietly use a real backend.
* Any `console.error` / uncaught page error also fails the test.
* `Math.random` is replaced by a seeded generator, so "Randomize" and "Size" are reproducible.
* **No internet:** the app's CSS imports Google Fonts; tests serve an empty stylesheet for those requests (the CSS falls back to system fonts) and **fail on any other external request**. Before this, a network hiccup produced `ERR_CONNECTION_RESET` failures.
* No automatic retries (`retries: 0`): a flaky test must fail visibly.

## Projects and tags

| Project | Runs |
|---|---|
| `chromium` | every test except `@mobile` |
| `firefox`, `webkit` | every test except `@mobile` |
| `mobile-chromium` (Pixel 7), `mobile-webkit` (iPhone 14) | only tests tagged `@mobile` (they need touch + a phone viewport) |

`@cross` marks specs written specifically to compare engines/viewports (responsive, input semantics); every non-`@mobile` test runs in all three desktop engines anyway.

## Layout

| Path | Purpose |
|---|---|
| `playwright.config.ts` | server, workers, timeouts, trace/screenshot policy |
| `e2e/fixtures.ts` | `test` with the guards above and an `app` page object |
| `e2e/support/visualizerApp.ts` | page object: role/accessible-name locators, one-pass `state()` reader, step-change recorder |
| `e2e/support/oracles.ts` | **independent algorithm oracles** — imports nothing from `src/` |
| `e2e/support/engineTrace.ts`, `walk.ts` | **trace-vs-engine** checks: the UI shows what AlgoFlow's engine generated |
| `e2e/tests/*.spec.ts` | the journeys; `a11y-scan` (axe-core), `accessibility-focus` (keyboard, focus, live regions), `responsive` (6 viewports + device emulation), `input-semantics` (order is never changed silently) |

## Three kinds of assertion — keep them distinct

1. **UI behaviour** — what the user sees/can do (validation messages, enabled/disabled controls, focus, notices, playback).
2. **Trace-vs-engine consistency** (`walkAndCompareWithEngine`) — every step on screen (message, explanation, highlighted code line, bars, pointers) equals the engine's trace. This only proves the UI renders the engine's output.
3. **Independent oracle** (`oracles.ts`) — whether the *answer* is right: first-occurrence index for Linear Search, a valid matching index for Binary Search, two distinct positions summing to the target for Two Pointer, sorted output that is a permutation of the input. With duplicates only *validity* is asserted, never a particular index the algorithm does not promise.

## Diagnostics on failure

Failing tests keep a **trace** and a **screenshot** under `test-results/` (and in `playwright-report/`). Open a trace with `npx playwright show-trace test-results/<test>/trace.zip` — it includes DOM snapshots, network and console for every action. Walk failures report *all* mismatching steps at once (`UI vs engine trace for ...`).

## Writing tests

* Prefer `getByRole`/accessible names (see the page object). `data-testid` is used only for read-outs without a role (step counter, current action…).
* Wait for observable state (`expect(...).toHaveAttribute`, `expect.poll`, `app.expectBars`), not `waitForTimeout`. The only timed windows are `expectNoStepChangeFor` (proving playback stays stopped) and the step recorders.
* Step-by-step walks use `app.collectStates(n)` / `walkAndCompareWithEngine`: one in-page pass that clicks the app's real *Next* button between reads (one browser round trip instead of two per step), so even Merge Sort's 160 steps take well under a second. Do not add per-step Playwright clicks in loops.
