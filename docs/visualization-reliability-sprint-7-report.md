# Visualization Reliability Sprint 7 — Release Readiness and CI Verification

Scope:
* Establish the repository identity.
* Verify real CI if possible.
* Prepare manual accessibility validation.
* Audit staging readiness.

No swap animation, no new features, no infrastructure changes, nothing pushed.

**Bottom line:** CI on GitHub's Ubuntu runner **could not be executed**, because the project is not a git repository and is not connected to any remote. Manual accessibility testing **has not been performed** (a checklist is ready). The staging audit found **5 blockers** (§4) that should be resolved or explicitly accepted before any deployment.

---

## 1. Repository identity (Phase 1)

| Check | Result |
|---|---|
| `.git` in `D:\AlgoFlow` or any parent | **None**; `git rev-parse` fails |
| Other clones on this machine | 14 git repositories found under `D:\`, Documents, Desktop and source (depth 4). **None** has "algoflow" in its folder name or `origin` URL. |
| Remotes / branches / default branch | **Do not exist** for this project, so the default branch is unknown |
| Tooling | git 2.49 with a global identity configured; GitHub Desktop installed; **no `gh` CLI** |

Nothing was initialised, committed, re-pointed or pushed.

### Pre-push safety check (done)
* A scan of the files a first commit would include (151 files, respecting `.gitignore`):
  * `.env` **excluded**; `.env.example` included.
  * No files over 1 MB.
* Secret patterns (MongoDB URIs with credentials, cloud and API keys, private keys, tokens, quoted passwords and secrets): **10 matches, none real**:
  * 8 are fake credentials inside server test fixtures (`authRoutes.test.ts`, `securityRemediation.test.ts`).
  * 2 are validation **messages** in `AuthPage.tsx`, not credentials.
  * The "Use demo credentials" button exists only in development builds (`import.meta.env.DEV`).
* `.env` values were **not** inspected or printed.

### Safest way to connect the project (for the owner to run, after confirming the destination)
1. **Decide the destination.** Owner and repository name, and the intended default branch (`main` or otherwise).
   * If the GitHub repo **already has history**, do **not** push this folder over it. Clone it elsewhere, copy this working tree in, review `git diff`, and commit on a branch.
   * If it is **new**, create it **empty** (no README or license), so there are no unrelated histories.
2. In `D:\AlgoFlow`: `git init -b <default-branch>`, then `git add -A` and **review** `git status` and `git diff --cached --stat`. Confirm `.env`, `node_modules`, `dist*`, `test-results` and `playwright-report` are absent. Then make the first commit.
3. `git remote add origin <url>` and `git push -u origin <default-branch>`. Never `--force` onto an existing branch.
4. If the default branch is not `main`, change `on.push.branches` in `.github/workflows/ci.yml`.
5. On GitHub, make sure Actions are enabled, then watch the first run. The workflow needs **no secrets**.
6. Optional afterwards: branch protection requiring the three CI jobs.

---

## 2. Real CI (Phase 2) — not executed

GitHub Actions requires the repository from §1, so **no CI run exists and there is no CI link.** No Linux environment is available locally either: the only WSL distribution is Docker Desktop's internal `docker-desktop`, which is stopped, and Docker's daemon is not running. I did not start them.

### Still unverified on the Ubuntu runner
* `npm ci` on Linux. The Linux native packages are present in the lockfile (checked in Sprint 6), but have not been installed on Linux.
* `npm test`, `typecheck`, `lint` and `build` on Linux (path, case-sensitivity and line-ending differences).
* `npx playwright install --with-deps` (apt dependencies) for Chromium, Firefox and WebKit.
* The Chromium E2E job and the cross-browser job (Firefox, WebKit, mobile emulation) on Linux, including:
  * timing with 2 workers on a 2-vCPU runner;
  * Linux font rendering, which affects layout assertions;
  * WebKit's Linux port, which differs from the Windows port measured here.
* The `push` trigger branch (`main` is an assumption) and artifact upload.

### Verified locally instead (Windows 11, Node 22.16)
| Check | Result |
|---|---|
| Workflow schema (`@action-validator/cli`) | passes (Sprint 6), with a negative control |
| Clean copy without `.env`, `npm ci`, `CI=true` (Sprint 6, final Sprint 6 code) | all steps pass; E2E 175/175 |
| This sprint, current code (after the change in §5) | see §6 |

The two-worker setting and the WebKit-only 60 s timeout are unchanged. No new timing evidence was gathered on Linux, so there is nothing to justify changing them.

---

## 3. Manual accessibility validation (Phase 3) — prepared, not performed

`docs/manual-accessibility-checklist.md` holds:
* a session record (date, tester, OS, browser, screen reader, zoom, build);
* **14 keyboard-only checks**: focus visibility and order, traps, the input workflow including Sort a copy and Restore, stepping, Play/Pause, speed and size, language, code scrolling, and the phone drawer;
* **13 screen-reader checks**: landmarks, labels and descriptions, polite validation feedback, invalid state, the sort disclosure, step announcements, no flooding during Play, the final result, control names, bars, the current code line, the mobile dialog, and the unimplemented state;
* a results matrix for keyboard only, NVDA + Firefox/Chrome, JAWS + Chrome, VoiceOver macOS and iOS, and TalkBack.

**No row has been executed by a person.** All accessibility evidence remains automated: axe-core scans and Playwright keyboard tests in Chromium, Firefox and WebKit.

While writing the checklist I found one real defect (fixed in §5). The workspace and code-listing scroll containers had `aria-label`s on plain `div`s, which ARIA does not allow, so assistive technology would ignore them. axe did not flag it.

---

## 4. Staging-readiness audit (Phase 4)

Static review of `server/` and the front-end API layer. No secrets were read, and no infrastructure or backend code was changed.

### Blockers — resolve or explicitly accept before staging
| # | Finding | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| **B1** | **There is no "staging" mode, and "development" mode is unsafe on a shared server.** `NODE_ENV` accepts only `development`, `production` or `test`. | `server/config/env.ts`; `seedDevData.ts` returns early only when `production`; `errorHandler.ts` adds `stack` when `development`; cookies are `secure` only in `production` | Under `development`: demo, admin and **super-admin** accounts are seeded with **fixed passwords committed in the source**. The built-in fallback JWT and cookie secrets are accepted, so anyone with the source can forge tokens. Stack traces leak in responses, and cookies are sent over HTTP. | Run staging with `NODE_ENV=production`, real secrets (≥ 32 chars, enforced) and an https `CLIENT_URL`. Optionally add an explicit `staging` value that keeps the production protections. |
| **B2** | **No way to create the first admin in a production-mode environment.** | Seeding is disabled in `production`; `PATCH /api/admin/users/:id/role` requires an existing `SUPER_ADMIN` | Staging would have no administrator. The only workaround is a manual database edit. | A one-off, audited bootstrap script (e.g. `npm run create-admin`) that reads the email from the environment and the password from a prompt or secret store. |
| **B3** | **Authorization trusts the JWT for its whole 7-day life.** | `requireAuth` / `requireRole` use the token payload only; `role` is inside the token; `/logout` only clears the cookie | A **suspended** user keeps access with an existing session (login itself rejects them). A **demoted** admin keeps admin rights. A stolen token cannot be revoked. All of this lasts up to 7 days. | Load the user (status and role) per request, or use short-lived access tokens with refresh plus a per-user token version. |
| **B4** | **No deployment configuration for the front end and API.** | The front end calls a relative `/api` (`httpAdapter.ts`); only the Vite dev server proxies it; there is no Dockerfile, Procfile or proxy config in the repo | A static deployment of `dist/` will not reach the API unless it is served from the same origin. | Decide the topology (one origin behind a reverse proxy, or a configurable API base URL plus CORS/`CLIENT_URL`), and write the deployment config. |
| **B5** | **A mock-API build can be shipped by accident.** | `VITE_USE_MOCK_API=true` at **build** time replaces the backend with an in-browser mock that signs everyone in as a demo user | A staging or production build with this flag means fake authentication. Nothing currently prevents it. | Fail `vite build` (or CI) when the flag is set for a non-test build. The E2E build already writes to its own `dist-e2e` folder. |

### Should fix (not blockers on their own)
| # | Finding | Recommendation |
|---|---|---|
| R1 | The rate limiter is in-memory per process (`Map`): it resets on restart, isn't shared across instances, and depends on a correct `TRUST_PROXY` behind a proxy | Shared store (e.g. Redis) or rate limiting at the gateway; set `TRUST_PROXY` to the real hop count |
| R2 | `/healthz` returns ok without checking MongoDB. In non-production modes the server keeps running when the DB connection fails | Report DB readiness separately (`/readyz`) |
| R3 | Logging is `console.*` only: unstructured, with no levels, request IDs or log shipping. Auth failures are not logged as security events | A structured logger with request IDs and a shipping/retention policy; never log bodies or cookies (the current code already avoids that) |
| R4 | No `unhandledRejection` / `uncaughtException` handlers; `startServer()` isn't awaited or caught | Add handlers that log and exit non-zero so the supervisor restarts the process |
| R5 | Persistence: no migration or index-sync process, backup and restore plan, or production content seeding (problems) | Define all three before staging data matters |
| R6 | The front end loads Google Fonts from the internet | Self-host fonts, or account for it in CSP and privacy review |
| R7 | The production bundle chunk is > 500 kB | Code-split later; not a blocker |

### Verified as reasonable (static review; server unit tests pass)
* **Every** `/api/admin` route has `requireAuth` and `requireRole('ADMIN','SUPER_ADMIN')`; role changes are `SUPER_ADMIN`-only.
* Login rejects suspended accounts.
* bcrypt hashing (10 rounds) with a 72-character password cap (bcrypt's limit).
* zod validation on auth bodies; email has a unique index.
* `helmet()`; CORS restricted to `CLIENT_URL` with credentials; `HttpOnly`, `SameSite=Lax` cookie.
* An Origin/Referer check on mutating `/api` requests.
* In production, 500 errors are masked and stack traces are not returned.
* Production env validation rejects fallback secrets, short secrets and a non-https `CLIENT_URL`.
* Submissions are **stored only** (`status: 'SUBMITTED'`): no code is executed.
* The E2E suite never needs credentials or a database.

---

## 5. Code changes this sprint

| File | Change | Why |
|---|---|---|
| `src/pages/VisualizerPage.tsx` | `role="region"` on the focusable workspace scroller ("Visualizer workspace") | A name on a role-less `div` is not allowed in ARIA, so screen readers would ignore it |
| `src/components/visualizer/CodePanel.tsx` | `role="region"` on the focusable code scroller ("Source code") | Same |
| `docs/manual-accessibility-checklist.md` | New | Phase 3 |
| `docs/visualization-reliability-sprint-7-report.md` | New | This report |

No backend, configuration or test changes.

---

## 6. Test results (this sprint, Windows 11, local)

| Command | Before the `role` change | After the `role` change |
|---|---|---|
| `npm test` | **483 passed** (16 files) | **483 passed** (16 files) |
| `npx tsc -b` | exit 0 | **exit 0** |
| `npx oxlint` | exit 0, 0 errors, 6 pre-existing warnings | **exit 0** |
| `npm run build` | success | **success** |
| `npm run e2e` (Chromium, 2 workers, 0 retries) | **175 passed** (5.2 min) | **175 passed** (5.2 min) |
| Firefox + WebKit + mobile emulation: `a11y-scan`, `accessibility-focus`, `responsive`, `input-semantics` | — | **118 passed** (7.9 min) |

The full cross-browser suite (`npm run e2e:cross`, 356 tests) was **not** re-run after the two-attribute change; its last results are Sprint 6's (two consecutive green runs). No test was skipped, and no timeouts or assertions were changed.

**CI links:** none, because no repository or remote exists (§1, §2).

---

## 7. Outstanding risks
1. **CI unverified on Linux** (§2): the first real run may surface platform issues.
2. **Five staging blockers** (§4: B1–B5).
3. **No manual accessibility or screen-reader validation** (§3).
4. **No real devices or Safari:** Playwright's Windows WebKit and device emulation only.
5. **Timing sensitivity:** WebKit needs its 60 s project timeout on this machine, and Firefox's worst case was 22.5 s of 30 s (Sprint 6). Linux runners may differ.
6. Pre-existing: 6 lint warnings, the bundle size, and the open P2 trace items from earlier reports.

## 8. Recommended next steps (in order)
1. **Connect the repository** using §1 (owner decision: destination and default branch), then let CI run and fix what the Linux runner reports, without weakening assertions.
2. **Decide and fix the staging blockers:** production-mode staging (B1), an admin bootstrap (B2), per-request authorization checks or revocable sessions (B3), a deployment topology (B4), a mock-build guard (B5).
3. **Run the manual accessibility checklist** with at least NVDA + Firefox and VoiceOver + Safari, and file the findings.
4. Address R1–R5 before staging data matters.
5. Swap animation and other features only after the above.

Stopped after this report; waiting for review.
