# Sprint 8: Final Read-Only Review

Date: 2026-10-18, 10:05–10:20 local. Reviewer: Claude (the same agent that implemented Sprint 8; the review is not independent).

Scope:
* Re-inspect the Sprint 8 security work.
* Re-run the checks that can be run without modifying anything.
* Assess residual risk.

Constraints observed:
* No repository file was modified except this new document. A timestamp check confirms nothing else in the repo changed during the pass.
* No Git operation, deployment, database query or write, or service restart.
* All experiments ran from the session scratchpad, outside the repository.

## Summary

| Severity | Count | Items |
|---|---|---|
| Critical | 0 | none |
| High | 1 (conditional) | F1: development mode accepts the published secrets, and the server listens on all interfaces |
| Medium | 3 | F2 bootstrap race (reproduced); F3 an `--mode e2e` mock bundle can be deployed; F4 server code not type-checked |
| Low | 5 | F5–F9 |

* **`accountStatus` fix:** verified; the regression test fails on the original bug and passes on the fix (§2).
* **Bootstrap atomicity:** not guaranteed; two concurrent runs created **two** SUPER_ADMINs in a reproduction (§3).
* **Re-run now:** 598/598 unit tests; type-check (3 projects) clean; lint clean (6 pre-existing warnings); all 5 build controls behave as specified; strict-mode startup is refused.
* **Not re-run:** E2E, cross-browser and the manual real-database check are historical (§5).

**Recommendation:** none of the findings blocks initialising Git. Fix F1 and F2, or explicitly accept them, before any shared or staging deployment.

---

## 1. Implementations inspected (final state)

| File | Assessment |
|---|---|
| `server/services/sessionService.ts` | Correct. One `_id` lookup per request, with checks in order: valid ObjectId, user exists, `(accountStatus ?? 'active') === 'active'`, `(tokenVersion ?? 0) === claims.tokenVersion`. The principal's role comes from the database. `revokeSessionsForToken` only increments when the presented version is current (legacy documents match version 0 via `$exists: false`). |
| `server/middleware/auth.ts` | Correct. Order: cookie or bearer, then signature/algorithm/claims, then database check. Every rejection is a 401 with a `code` and clears the cookie. Lookup errors go to `next(err)`, which yields a masked 500. `requireRole` reads only the database role. No other token-verification path exists (grep: `verifyToken` is called only in `auth.ts`, `authRoutes.ts` logout, and `problemRoutes.ts` `optionalAuth`, which now uses `resolveSession`). |
| `server/services/adminBootstrap.ts` | The logic is correct for a single run: id and email must match, the account must be active (it's a hydrated document, so the schema default applies to legacy accounts), the audit record is written before the save, and failures are recorded. **Not atomic:** see §3 and F2. |
| `server/config/env.ts` | Fail-closed as documented: `NODE_ENV` is required; unknown modes are strict; secrets are required outside `test`; strict mode rejects public values, short secrets and reused secrets, requires an https origin-only `CLIENT_URL` and an explicit `MONGODB_URI`; error output never includes values. **Gap:** development accepts the public secrets (F1). |
| `src/config/deployment.ts` | Correct. API URL validation, the mock guard, the `NODE_ENV` guard and the runtime counterpart all work. **Gap:** `--mode e2e` disables every check, wherever the output goes (F3). |
| `vite.config.ts` | Correct. `envDir` is `frontend-env/` (the server `.env` is no longer read), and the guard throws before any build output. |

---

## 2. `accountStatus` compatibility fix

**Policy** (documented in the Sprint 8 report §2.3):
* a missing `accountStatus` means the schema default `active`;
* `suspended` and any other unexpected value are rejected (fail closed).

**Code** (`server/services/sessionService.ts:22-26`):
```ts
  const user = await User.findById(claims.userId).select('role accountStatus tokenVersion').lean();
  if (!user) return { ok: false, reason: 'unknown_user' };
  // .lean() skips schema defaults, and documents created before the field existed have no accountStatus: a missing
  // value means the schema default 'active' (as login and the admin list treat it). Any other value fails closed.
  if ((user.accountStatus ?? 'active') !== 'active') return { ok: false, reason: 'suspended' };
```

**Regression tests** (`server/tests/sessionLifecycle.test.ts:155-177`):
```ts
    it('accepts sessions of users created before accountStatus existed, and can still suspend them', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const id = await addUser('old@example.com', 'USER');
      delete users.get(id)!.accountStatus;
      delete users.get(id)!.tokenVersion;
      const { res, cookie } = await login('old@example.com');
      expect(res.status).toBe(200);
      expect((await me(cookie!)).status).toBe(200);
      expect((await request(app).get('/api/users/profile').set('Cookie', [cookie!])).status).toBe(200);

      const root = (await login('root@example.com')).cookie!;
      await request(app).patch(`/api/admin/users/${id}/status`).set('Cookie', [root]).send({ status: 'suspended' });
      expect((await me(cookie!)).status).toBe(401);
    });

    it('fails closed on an unexpected accountStatus value', async () => {
      ...
      users.get(id)!.accountStatus = 'pending';
      expect((await me(cookie!)).body.code).toBe('ACCOUNT_SUSPENDED');
    });
```
The in-memory stand-in stores raw objects, so a deleted field behaves like a real `.lean()` result with no schema defaults.

**Proof the test detects the bug (re-run now, no repo change):** a scratchpad Vitest config aliased `../services/sessionService` to a scratchpad copy containing the original line `if (user.accountStatus !== 'active')`.

| Run | Result |
|---|---|
| Copy with the original bug | `× accepts sessions of users created before accountStatus existed…`, with `expected 401 to be 200`; **1 failed, 17 passed** |
| Same config pointing at the real file | **18 passed** |

**Consistency of the policy across the code:**
* `adminBootstrap` uses a hydrated document, so the default applies: consistent.
* Login (`authRoutes.ts:99`) rejects only `=== 'suspended'`; see F7.
* The admin user list displays a missing value as `active`, but its `status=active` filter misses legacy documents; see F9.

---

## 3. First-admin bootstrap under concurrent execution

**Finding: atomicity is not guaranteed.** `bootstrapSuperAdmin` checks, then writes, in separate operations, with no transaction or lock:
1. `User.countDocuments({ role: 'SUPER_ADMIN' })` (line 38);
2. `User.findOne(...)` (line 46);
3. the audit insert (line 64);
4. `user.save()` (line 70).

Two invocations that both finish step 1 before either reaches step 4 each see 0 and each promote their own target.

**Reproduction (re-run now, scratchpad only):** two `bootstrapSuperAdmin` calls in parallel, for two different valid accounts, against an in-memory model with 5 ms simulated I/O.

Output: `{"results":[true,true],"superAdmins":2,"auditEntries":2}`, i.e. **two SUPER_ADMIN accounts.** Real MongoDB has the same gap, because none of these operations is conditional on the global "no SUPER_ADMIN" state.

**Impact and likelihood:**
* It requires two operators with database access running the one-off command at the same moment, each with a valid account they control.
* Both promotions are audited.
* Neither is a privilege escalation for an outsider.
* Same-user concurrency only produces duplicate audit entries and a lost `tokenVersion` increment.

Severity: **Medium.** It is documented as residual risk 5 in the Sprint 8 report, but the "one-time only" guarantee in the code comment and the README is not actually enforced. Recommended fixes are in F2. Nothing was changed.

---

## 4. Server-specific TypeScript check

* **There is no existing command that type-checks `server/`.** `npm run typecheck` is `tsc -b`, whose references are `tsconfig.app.json` (`src`), `tsconfig.node.json` (`vite.config.ts`, `src/config/deployment.ts`) and `tsconfig.e2e.json` (`e2e`, `playwright.config.ts`). None includes `server/`. **A passing `npm run typecheck` says nothing about server code.**
* As a substitute, I ran an ad-hoc strict, no-emit config **kept outside the repository** (session scratchpad) over `server/**/*.ts`. The pre-sprint baseline came from the same config.

| | Before Sprint 8 | Now |
|---|---|---|
| Total errors | 64 | 64 |

**Pre-existing errors, in files Sprint 8 did not touch:** `noteRoutes.ts` 6, `progressRoutes.ts` 12. These are zod v4 API drift (`errorMap`, `required_error`) and Express 5 `params` typing.

**Pre-existing errors in files Sprint 8 touched:** `adminRoutes.ts` 13, `problemRoutes.ts` 28, `tests/authRoutes.test.ts` 2. The messages, ignoring line numbers, are **identical** to the baseline (`diff` empty).

**Changes attributable to Sprint 8:**
* `server/config/env.ts`: **−3**. The file was rewritten, which removed the old `.default()`-on-transform errors.
* `server/services/adminBootstrap.ts`: **+2**, both `TS2769` on `AdminAuditLog.create(...)`. They come from the pre-existing model typing defect: `IAdminAuditLog.adminId` is declared as `Schema.Types.ObjectId` instead of `Types.ObjectId`. `adminRoutes.ts` already has the same error 4 times. The behaviour is correct at runtime (unit tests), but the typing is wrong.
* `src/api/httpAdapter.ts`: **+1**, `import.meta.env` is unknown. **This is an artifact of the ad-hoc config**, which lacks `vite/client` types; the file is clean under `tsconfig.app.json`.
* During the sprint, this check also caught one real bug, the token-only `optionalAuth` in `problemRoutes.ts`. It is fixed and tested, so it doesn't appear here.

---

## 5. Test and build results: re-run now vs. historical

**Re-run in this pass (10:08–10:20).** All are non-mutating; build output went to the scratchpad.

| Check | Command | Result |
|---|---|---|
| Unit and integration tests | `npx vitest run` | **598 passed**, 20 files, exit 0 |
| Type-check (equivalent to `tsc -b`, without writing `.tsbuildinfo`) | `tsc -p tsconfig.{app,node,e2e}.json --noEmit` | exit 0 for all three; 0 errors |
| Lint | `npx oxlint` | exit 0; 6 warnings, all pre-existing |
| Build without `VITE_API_BASE_URL` | `vite build --outDir <scratch>` | **fails**: "VITE_API_BASE_URL must be set…" |
| Build with mock API, production mode | `VITE_USE_MOCK_API=true VITE_API_BASE_URL=/api vite build` | **fails**: "VITE_USE_MOCK_API=true is not allowed…" |
| Build with `NODE_ENV=development` in the shell | same, plus `NODE_ENV=development` | **fails**: "NODE_ENV=development would produce a development bundle" |
| Deployable build | `VITE_API_BASE_URL=/api vite build` | success; bundle has `DEV:false, MODE:"production", PROD:true`, no `jsxDEV`, no demo password |
| E2E-mode build | `VITE_USE_MOCK_API=true vite build --mode e2e` | success; `MODE:"e2e"`, `VITE_USE_MOCK_API:"true"` (F3) |
| Strict startup | `NODE_ENV=staging npx tsx server/index.ts` | exit 1 with 3 field-level errors; secret, URI or placeholder values printed: 0; refused before any DB connection |
| Regression-test mutation | scratchpad alias (§2) | the mutant fails, the real file passes |
| Bootstrap race | scratchpad test (§3) | 2 SUPER_ADMINs reproduced |

(Git Bash needs `MSYS_NO_PATHCONV=1` so that `/api` reaches Vite unaltered.)

**Historical: from earlier today, not re-run in this pass.**

| Check | When | Result | Why not re-run |
|---|---|---|---|
| `npm run e2e` (Chromium) | 09:29–09:33 | 175 passed | It writes `dist-e2e/`, `test-results/` and `playwright-report/`. It ran before the `accountStatus` fix, which touched only `server/`; E2E runs on the mock API and never touches the server. |
| `npm run e2e:cross` | Sprint 6 | last green there | not run in Sprint 8 at all |
| `npm run build` (`tsc -b`, then output to `dist/`) | 09:29 | success | it would overwrite `dist/`; the scratchpad builds above cover it |
| Manual run against local MongoDB (demo login, `/me`, progress endpoints, logout, replayed cookie → `SESSION_REVOKED`) | ~09:58 | as reported | it would write to the database (logout increments `tokenVersion`) |
| CI negative-control step | simulated in bash, ~09:27 | passes | logic unchanged; the equivalent build control was re-run above |
| **Remote CI** | never | **has never run** | no repository exists |

The running backend (PID 24600, started from the assistant session at the user's request) and the Vite dev server were not restarted, stopped or queried in this pass.

---

## 6. File inventory

**Caveat:** there is no version control and no pre-sprint snapshot, so **this is not a diff.** The list comes from file modification times later than the sprint start (08:54).
* An mtime shows that a file was written, not what changed. A file saved with no change would appear too.
* Deletions are invisible to it. No file was deleted in Sprint 8, to the implementer's knowledge.
* The new/modified split relies on the implementer's record of which files existed before (cross-checked against the Sprint 7 file listing).
* A real diff becomes possible only after Git is initialised; reviewers should rely on it then.

**New files (12)**
* server: `server/config/authCookie.ts`, `server/services/sessionService.ts`, `server/services/adminBootstrap.ts`, `server/scripts/bootstrapAdmin.ts`
* server tests: `server/tests/configHardening.test.ts`, `server/tests/sessionLifecycle.test.ts`, `server/tests/adminBootstrap.test.ts`, `server/tests/helpers/sessionStub.ts`
* front end: `src/config/deployment.ts`, `src/config/__tests__/deployment.test.ts`, `frontend-env/.env.example`
* docs: `docs/security-deployment-sprint-8-report.md`
* plus this file, `docs/security-deployment-final-review.md`, created by this review

**Modified files (26)**
* **Server (12):**
  * config and startup: `server/config/env.ts`, `server/config/seedDevData.ts`, `server/config/db.ts`, `server/index.ts`, `server/app.ts`
  * middleware: `server/middleware/auth.ts`, `server/middleware/errorHandler.ts`
  * models and services: `server/models/User.ts`, `server/services/authService.ts`
  * routes: `server/routes/authRoutes.ts`, `server/routes/adminRoutes.ts`, `server/routes/problemRoutes.ts`
* **Existing tests (5):** `server/tests/authRoutes.test.ts`, `server/tests/adminRoutes.test.ts`, `server/tests/productRoutes.test.ts`, `server/tests/authService.test.ts`, `server/tests/securityRemediation.test.ts`
* **Front end, build and config (9):**
  * `src/api/index.ts`, `src/api/httpAdapter.ts`
  * `vite.config.ts`, `playwright.config.ts`, `tsconfig.node.json`
  * `package.json`, `.env.example`, `.github/workflows/ci.yml`, `README.md`

(The Sprint 8 report's handover listed 4 modified test files under "existing tests" and `tsconfig.node.json` with the build files; the total of 38 matches.)

**Generated files. All are git-ignored and can be regenerated; they would not be committed.**

| Path | Last written | By |
|---|---|---|
| `dist/` | 09:29 | `npm run build`; now a true production bundle |
| `dist-e2e/` | 09:29 | E2E web server build |
| `test-results/`, `playwright-report/` | 09:33 | E2E run |
| `node_modules/.tmp/*.tsbuildinfo` | 09:29 | `tsc -b`; not written in this pass |
| `node_modules/.vite*` | possibly | Vitest and Vite caches |

**Ignored files that matter for a first commit** (per `.gitignore`, assessed by reading the patterns; no Git command was run):
* `.env`: ignored, and **not modified** (mtime 2026-10-08 20:46). Its values were never printed.
* `node_modules/`, `dist/`, `dist-e2e/`, `test-results/`, `playwright-report/`, `*.local`: ignored.
* `frontend-env/.env.example` is **not** ignored, because `!.env.example` re-includes it; it is meant to be committed and contains no secret. Any future `frontend-env/.env*` file would be ignored by `.env` / `.env.*`.

**State outside the repository**
* The local MongoDB demo account's `tokenVersion` is 1, from the earlier manual logout test.
* Scratchpad experiment files (mutant, race test, ad-hoc tsconfig, build outputs) live in the session temp folder only.

---

## 7. Findings

### F1. High (conditional): development mode accepts the published secrets, and the server binds to all interfaces
**Evidence:**
* `env.ts:68`: `if (!strict) continue;`. The `PUBLIC_SECRETS` and length checks run only in strict modes.
* `.env.example` ships `NODE_ENV=development` together with the public placeholder secrets.
* `server/index.ts`: `app.listen(env.PORT)` gives no host. The live listener is `:: 5000`, i.e. all interfaces, IPv4 and IPv6.
* The local instance runs exactly this configuration: the strict-mode validation re-run above reports *both* of its secrets as public values.

**Impact:** on any development-mode instance reachable over a network, anyone who has the repository can sign a valid JWT (`{ sub: <userId>, tv: 0 }`) for any user whose ObjectId they know, including administrators. Accounts that have never logged out are still at `tv: 0`. ObjectIds are not secrets: they appear in admin URLs and audit data. Sprint 8 closed this for staging and production; development remains open by design. The design is documented, but nothing in the code enforces "local only".

**Current exposure:** none confirmed. On this machine the Windows Firewall blocks inbound `node.exe` on the active Public profile. That's the only control: switching the network to Private, or allowing Node through the firewall, would expose port 5000 to the LAN.

**Recommended fix:**
1. Reject `PUBLIC_SECRETS` in *every* mode except `test`. Ship `.env.example` with empty secrets and the generation command.
2. In development, bind to `127.0.0.1` unless an explicit `HOST` is set.
3. Generate new local secrets. Existing local sessions end; that's expected.

### F2. Medium: bootstrap is not atomic (§3)
**Evidence:** check-then-write at `adminBootstrap.ts:38-70`; the reproduction produced 2 SUPER_ADMINs.

**Recommended fix (any one):**
* Before promoting, insert a lock document with a fixed unique key, e.g. `{ _id: 'super-admin-bootstrap' }` in a `system_locks` collection. A duplicate-key error means bootstrap already ran or is running; never delete the document.
* Or run the count and the update in a MongoDB transaction (requires a replica set).

Then add a concurrency test.

### F3. Medium: an `--mode e2e` mock bundle is unrestricted
**Evidence:** `deployment.ts:60` returns no errors at all for mode `e2e`, and `resolveApiRuntime` treats `MODE === 'e2e'` as non-deployable. `VITE_USE_MOCK_API=true vite build --mode e2e` succeeds into **any** `--outDir`, including the default `dist/` (reproduced into the scratchpad).

**Impact:** limited to the front end. The mock never grants backend access, but a deployed mock bundle would show every visitor a fake signed-in demo session.

**Recommended fix:** in e2e mode, fail unless the output directory is `dist-e2e`. Optionally render a persistent "TEST BUILD: mock API" banner whenever the mock is active.

### F4. Medium: server code is outside type checking
**Evidence:** §4, with 64 errors. Two are new in `adminBootstrap.ts`, caused by the shared `IAdminAuditLog.adminId` typing.

**Recommended fix:** add `tsconfig.server.json` to the `tsc -b` references, fix the model type, then the zod v4 and Express 5 drift, as a separate reviewable change.

### F5. Low: read-modify-write `tokenVersion` increments
**Evidence:** `adminRoutes.ts` status and role handlers, and `adminBootstrap.ts:69`, compute `tokenVersion + 1` from an earlier read and then `save()`. A logout (`$inc`) landing in between can be lost.

**Impact:** no authorization bypass. Role and status are re-read on every request, so suspension and demotion still take effect; only the forced re-login is skipped.

**Fix:** use an atomic `$inc` (e.g. `findOneAndUpdate` with `$set` for role/status and `$inc: { tokenVersion: 1 }`).

### F6. Low: `NODE_ENV=test` is accepted by the runnable server
**Evidence:**
* `env.ts` accepts `test` and then generates random per-process secrets.
* `db.ts:6` skips the DB connection in test mode.
* Test mode is non-strict, so cookies are not `Secure`.

**Impact:** a misconfigured deployment would be broken (no DB, sessions lost on restart) and use HTTP cookies. It is not exploitable as such.

**Fix:** `server/index.ts` and the bootstrap script should refuse to start with `NODE_ENV=test`.

### F7. Low: login and session disagree on unexpected `accountStatus` values
**Evidence:** login rejects only `=== 'suspended'` (`authRoutes.ts:99`), while `resolveSession` rejects anything other than active or missing. A value outside the enum (possible only via direct DB edits; mongoose validation blocks it otherwise) lets login succeed, and then every request returns 401.

**Fix:** apply the same `(accountStatus ?? 'active') === 'active'` rule at login.

### F8. Low: the mock adapter's code ships in deployable bundles
**Evidence:** the deployable scratchpad bundle contains the mock client, which is selected at runtime (`useMock` appears twice in the bundle).

**Impact:** it is inactive. Enabling it needs a rebuild, and the runtime guard throws in deployable mode. It is dead weight plus test fixtures in a public bundle.

**Fix (optional):** load the mock with a dynamic `import()` inside an `import.meta.env.MODE === 'e2e'` branch so it is tree-shaken.

### F9. Low (pre-existing): the admin "active" filter misses legacy users
**Evidence:** `adminRoutes.ts:131` filters `accountStatus: 'active'`, which doesn't match documents without the field, even though the list displays them as `active`. Two of the three local users are affected.

**Fix:** use `{ $in: ['active', null] }` for the active filter, or backfill the field with a migration (R5).

### Pre-existing, outside Sprint 8 scope (for the backlog)
* `PUT /api/admin/problems/:id` applies an unvalidated `req.body` through `$set`: admin-only mass assignment.
* The in-memory rate limiter (R1). Without a correct `TRUST_PROXY` behind a proxy, all clients share one IP and therefore one login allowance.
* No email verification.
* Login returns early for unknown emails, before bcrypt, so response timing can reveal whether an account exists.

---

## 8. Recommended order (no fixes made in this pass)
1. Approve the Git destination and initialise; these findings don't block it.
2. Before any shared or staging deployment: **F1**, **F2**, **F3** (all small, each with a test).
3. Then **F4**, then F5–F9 and the pre-existing items.

Stopped. Waiting for approval before any Git operation.
