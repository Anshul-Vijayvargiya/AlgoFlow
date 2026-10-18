# Pre-Commit Security Hardening (F1–F3 and server type checking)

Date: 2026-10-18. Scope: findings **F1–F3** of `docs/security-deployment-final-review.md`, plus the server type-check gap (F4, only the parts requested). F5–F9 are untouched.

Approved beforehand by the user:
* replace the secrets in the local `.env`;
* restart the backend that runs in the assistant session;
* make the one-line `AdminAuditLog` type fix.

Not done: no database change, no bootstrap run, no Git operation, no deployment. Secret values were never printed.

## Summary
| Item | Result |
|---|---|
| **F1** published secrets and network exposure | Published values are now refused in development too; `npm run env:secrets` generates them; local `.env` updated; development listens on `127.0.0.1` by default; dev proxy retargeted |
| **F2** bootstrap race | A unique lock document makes concurrent runs safe; regression test with 5 parallel attempts gives exactly 1 SUPER_ADMIN; the test fails when the lock is removed |
| **F3** E2E mock build treated as production | E2E builds must output to `dist-e2e/` and must use the mock; production builds may not use `dist-e2e/`; every build writes `build-info.json`; new `npm run verify:artifact`; CI verifies `dist/` and requires an E2E build to be rejected |
| Server type check | New `npm run typecheck:server` with a baseline that can only shrink. The 2 `adminBootstrap.ts` errors are fixed at their root (1 line), which also removed 5 identical `adminRoutes.ts` errors. 56 pre-existing errors remain, all from before Sprint 8 |

## 1. Changes

### F1: published secrets and network exposure
* **Development rejects published secrets.** `server/config/env.ts` refuses the 4 published values in development as well as staging and production. Only `test` mode accepts any value, for fixtures. The 32-character minimum stays strict-only, so short private development secrets still work.
* **`server/config/publicSecrets.ts` (new):** the list of published values, moved out of `env.ts`. Tools can now import it without triggering env validation, and `env.ts` re-exports it, so existing imports are unchanged.
* **`npm run env:secrets`** (new `server/scripts/generateLocalSecrets.ts`):
  * it replaces `JWT_SECRET` and `COOKIE_SECRET` in `.env` only if they are missing, empty or published, using 48 random bytes (96 hex characters) each, distinct from each other;
  * it keeps every other line and the file's line endings;
  * it creates `.env` from `.env.example` if needed;
  * it refuses a `.env` whose `NODE_ENV` is staging or production;
  * it prints only the names of the keys it changed.
* **`.env.example`:** secrets now ship **empty**, with instructions; there's also a commented `HOST` entry.
* **`HOST`** (new, optional): defaults to `127.0.0.1` in development and `0.0.0.0` in staging and production; an explicit value always wins. `server/index.ts` listens on it and logs it.
* **Dev proxy:** `vite.config.ts` now targets `http://127.0.0.1:5000`, because `localhost` can resolve to `::1` first, which a loopback-IPv4 backend wouldn't answer.
* **Local `.env`:** `npm run env:secrets` replaced both public secrets. A shape check, printing booleans only, showed two different 96-hex values, and `env.ts` now loads the file (development, `HOST` `127.0.0.1`). Existing sessions signed with the old secrets are invalid, so you need to log in again.

### F2: concurrency-safe first-admin bootstrap
* **`server/models/SystemLock.ts` (new):** a document keyed by a fixed string `_id`. MongoDB enforces `_id` uniqueness on every deployment type, so a duplicate insert fails with code 11000.
* **`server/services/adminBootstrap.ts`,** in order:
  1. validate the input;
  2. fast-path refusal if a SUPER_ADMIN exists;
  3. check the user;
  4. **insert the lock `super-admin-bootstrap`**; a duplicate key means "already run or running" and nothing is changed;
  5. **re-check the SUPER_ADMIN count under the lock;**
  6. write the audit record;
  7. promote.
* **Lock lifetime:**
  * after success, the lock is **kept**, so bootstrap stays one-time even if that admin is later demoted;
  * if the audit write or the promotion fails, it is **released**;
  * if the re-check finds a SUPER_ADMIN, it is kept.
* **If a run is killed between taking the lock and promoting,** the lock remains and later runs are refused. Recovery is deliberate and manual, documented in the code: confirm no SUPER_ADMIN exists, then delete the lock document.

### F3: E2E/mock builds can't pass as deployable
* **Build rules** (`src/config/deployment.ts` plus a plugin in `vite.config.ts`, which checks Vite's *resolved* `outDir`; the CLI `--outDir` isn't visible to the config function):
  * `--mode e2e` requires `VITE_USE_MOCK_API=true`;
  * E2E output must be a directory named `dist-e2e`;
  * a non-E2E build may not write into `dist-e2e`.
* **Every build emits `build-info.json`** with `{ app, mode, mockApi, deployable }` and no secrets.
* **`npm run verify:artifact -- <dir>`** (new `scripts/verifyDeployArtifact.ts`, using `assessArtifact`) fails unless `build-info.json` says deployable, not E2E and no mock. It also scans every JS bundle for the minified markers `VITE_USE_MOCK_API:"true"`, `MODE:"e2e"` and `DEV:!0`, so an E2E bundle whose `build-info.json` was edited or deleted is still rejected.
* **CI** (`.github/workflows/ci.yml`): new steps `npm run typecheck:server`, `verify:artifact -- dist`, and a negative control in which an E2E build must be rejected *with the expected message*.

### Server type check
* **`tsconfig.server.json` (new):** strict, no emit, covers `server/**`, with types `node` and `vite/client`; the latter removes the false `import.meta.env` error. It is deliberately not referenced by `tsc -b`.
* **`npm run typecheck:server`** (new `scripts/typecheckServer.ts`) runs tsc and compares the result with **`server/typecheck-baseline.json`**:
  * matching is by file, error code and message, counted as a multiset, with line numbers ignored;
  * new errors print in full and exit 1;
  * `--update` refuses while new errors exist, so the baseline can only shrink;
  * `--init` works only when no baseline exists.
* **The fix** is `server/models/AdminAuditLog.ts`: `adminId: Schema.Types.ObjectId` became `Types.ObjectId`, the document value type rather than the schema type.
  * It removed the **2 new errors** in `adminBootstrap.ts`.
  * It also removed **5 pre-existing errors** in `adminRoutes.ts`. All 5 were `adminId:` arguments to `AdminAuditLog.create` (lines 225, 292, 388, 425, 462), so they shared the root cause. No route code was changed.

### Also changed
* `package.json`: new scripts `env:secrets`, `verify:artifact`, `typecheck:server`.
* `tsconfig.node.json`: includes `scripts/**/*.ts`, so `tsc -b` checks the new tools and their tests.
* `vitest.config.ts`: includes `scripts/**/*.test.ts`.
* `README.md`: commands and local setup.

## 2. Files
New (12):
* `server/config/publicSecrets.ts`
* `server/scripts/generateLocalSecrets.ts`
* `server/models/SystemLock.ts`
* `scripts/verifyDeployArtifact.ts`, `scripts/typecheckServer.ts`
* `tsconfig.server.json`, `server/typecheck-baseline.json`
* tests: `server/tests/generateLocalSecrets.test.ts`, `server/tests/adminBootstrapConcurrency.test.ts`, `scripts/__tests__/verifyDeployArtifact.test.ts`, `scripts/__tests__/typecheckServer.test.ts`
* this report

Modified (15):
* server: `server/config/env.ts`, `server/index.ts`, `server/services/adminBootstrap.ts`, `server/models/AdminAuditLog.ts`
* front end and build: `src/config/deployment.ts`, `vite.config.ts`
* config: `.env.example`, `package.json`, `tsconfig.node.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, `README.md`
* tests: `server/tests/configHardening.test.ts`, `server/tests/adminBootstrap.test.ts`, `src/config/__tests__/deployment.test.ts`

Local and git-ignored (not to be committed): `.env` (secrets replaced); regenerated `dist/` and `dist-e2e/`; E2E output in `test-results/` and `playwright-report/`.

The list comes from modification times since 10:21, so it is not a diff.

## 3. Tests and checks (all run in this pass)
**Focused tests and negative controls.** Each mutation was reverted, and its file confirmed restored, right after the run:

| Fix | Tests | Mutation: result |
|---|---|---|
| F1 | config: public values rejected in dev (4), short dev secrets allowed, `HOST` defaults and overrides; generator: 10 tests | Restoring the strict-only check (`if (!strict) continue`): **4 failed** |
| F2 | unit: lock order, duplicate key refused, other lock errors propagate, re-check under the lock, release on audit failure and on promotion failure; concurrency: **5 parallel different users → 1 SUPER_ADMIN**, 3 parallel same user → 1 promotion and 1 audit, one-time after a demotion | Lock acquisition made a no-op: **all 3 concurrency tests failed** |
| F3 | output-dir rules (8 cases), e2e requires the mock, build-info contents, `assessArtifact` (production accepted; e2e rejected for 5 reasons; edited or missing build-info still rejected by the backstop; dev bundle rejected; the guard's own message text not flagged), `verifyArtifactDir` on temp directories | E2E output-dir rule disabled: **3 failed** |
| Type check | parser, baseline building, moved lines still known, extra occurrence counted as new, other file counted as new, fixed entries reported | Temporary file with a deliberate type error: `typecheck:server` **exit 1**, listing it (file deleted afterwards) |

**Real builds** (scratchpad output; Git Bash needs `MSYS_NO_PATHCONV=1`):

| Build | Result |
|---|---|
| e2e + mock → a directory not named `dist-e2e` | **fails**: "may only be written to dist-e2e/" |
| e2e without mock | **fails**: "require VITE_USE_MOCK_API=true" |
| e2e + mock → `…/dist-e2e` | success; `build-info.json` says `mode: e2e, mockApi: true, deployable: false` |
| production → `…/dist-e2e` | **fails**: "dist-e2e/ is reserved…" |
| production → `…/dist` | success; `build-info.json` says `deployable: true` |
| `verify:artifact` on the production build | exit 0 |
| `verify:artifact` on the e2e build | **exit 1**, 5 reasons |
| CI negative-control step, simulated in bash | passes |

**Full checks (10:34):**

| Command | Result |
|---|---|
| `npm test` | **650 passed**, 24 files (was 598 in 20 files) |
| `npm run typecheck` | exit 0, now also covering `scripts/` |
| `npm run typecheck:server` | exit 0: 0 new errors, 56 known |
| `npm run lint` | exit 0; 6 warnings, the same pre-existing ones (`AITutorDrawer` 3, `AdminPage` 2, `AuthPage` 1) |
| `VITE_API_BASE_URL=/api npm run build` | success |
| `npm run verify:artifact -- dist` | exit 0 ("Deployable production build") |
| `npm run e2e` (Chromium, 2 workers, 0 retries) | **175 passed** (2.0 min). Built through the new guard into `dist-e2e/`, whose `build-info.json` says `deployable: false`. Cross-browser E2E was not run. |

**Runtime checks after the approved backend restart.** None reached the database: `/healthz`, and `/api/auth/me` without a cookie, which is rejected before any lookup.

| Check | Result |
|---|---|
| Listen address | **127.0.0.1:5000 only** (was `::`, all interfaces) |
| `GET 127.0.0.1:5000/healthz` | 200 |
| The same request to this machine's LAN IPv4 address | not reachable (timed out) |
| `GET localhost:5173/api/auth/me` through the Vite proxy | 401 from the backend, so the proxy reaches the IPv4-loopback backend |

## 4. Remaining errors
* **Server type errors: 56, all pre-existing.** Every baseline entry was matched against the type-check output from before Sprint 8; 0 entries are new.

  | File | Errors |
  |---|---|
  | `problemRoutes.ts` | 28 |
  | `progressRoutes.ts` | 12 |
  | `adminRoutes.ts` | 8 |
  | `noteRoutes.ts` | 6 |
  | `tests/authRoutes.test.ts` | 2 |

  Causes: zod v4 API drift (`errorMap`, `required_error`), Express 5 `req.params` typed `string | string[]`, and a test helper typing. Down from 64 at the final review (and 63 under the new config).
* **Lint:** 6 pre-existing warnings, 0 errors.

## 5. Outstanding risks
1. **No real MongoDB in automated tests.** The lock relies on MongoDB's `_id` uniqueness. The tests emulate it, and it's standard MongoDB behaviour, but no run hit a real server. The bootstrap command was deliberately not run.
2. **A stale bootstrap lock needs manual recovery** if a run is killed between taking the lock and promoting. That fails safe (refuses), and the recovery steps are documented in the code.
3. **`verify:artifact` is only as good as its use.** Nothing deploys yet, so it isn't wired into a deploy step. Deployment tooling must run it on the exact directory it uploads. CI runs it, and CI has never actually run (no repository).
4. **Development opt-in:** `HOST=0.0.0.0` makes a development server LAN-reachable again. That's an explicit choice, and published secrets are refused in every mode now, but short private development secrets are still allowed.
5. **`typecheck:server` is separate from `npm run typecheck`,** so `tsc -b` alone still doesn't cover `server/`; CI runs both. Fixing the 56 errors and folding the check into `tsc -b` is follow-up work.
6. **The backend runs as a background task of the assistant session** (restarted at the user's request) and stops when the session ends. Your browser session ended because the secrets were rotated; log in again.
7. **Not addressed here (by request):** F5–F9 from the final review, and the pre-existing backlog items.

Stopped. Waiting for review before any Git operation.
