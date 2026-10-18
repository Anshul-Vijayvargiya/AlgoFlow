# Sprint 8: Security and Deployment Foundation

Scope: fix the five staging blockers from Sprint 7 (§4, B1–B5), in small increments, with a regression test for each fix.

Not done, by design: no animation work, no algorithms, no deployment, no `git init` or push. The project is still not a git repository, so **no remote CI has run** for any of this work. Submitted code is still only stored, never executed. `.env` values were not read or printed (only key names were listed, to confirm both secrets are defined locally).

**Bottom line:** all five blockers are fixed locally and covered by tests. Full local verification passes (§5).

Three extra defects turned up along the way and are also fixed:
* **Every local `vite build` was a development bundle.** The cause was the server's `.env`; details in §2.4.
* **The public problem list had a second token-only auth path** that ignored revocation (§2.3).
* **Users created before the `accountStatus` field existed were treated as suspended** by the first version of the new session check. It was found on the real local database after the first report (§2.3).

Three things remain unverified: automated tests against a real MongoDB (only one manual run so far), Linux CI, and a production-like deployment (§6).

---

## 1. Phase 1: audit of the five blockers

| # | Relevant files | Behaviour before | Security impact | Fix (§2) | Tests |
|---|---|---|---|---|---|
| **B1** Unsafe dev mode, seed accounts, fallback secrets, HTTP cookies, stack traces | `server/config/env.ts`, `seedDevData.ts`, `db.ts`, `middleware/errorHandler.ts`, `routes/authRoutes.ts`, `app.ts`, `index.ts` | `NODE_ENV` defaulted to `development`. JWT and cookie secrets fell back to strings committed in the source. Any non-`production` mode seeded demo, ADMIN and SUPER_ADMIN accounts with committed passwords and logged those passwords. Cookies were `Secure` only in `production`. Responses carried `stack` in development. No `staging` value existed. | Anyone with the source could forge tokens or log in as SUPER_ADMIN on any server not run in exact `production` mode. Stack traces leaked internals. Cookies could travel over HTTP. | Fail-closed env validation; `staging` treated as strict; development-only seeding with admin seeding opt-in; strict startup refuses known seed accounts; `Secure` cookies in strict mode; no stack in any response | `configHardening.test.ts` (47), updated `securityRemediation.test.ts` |
| **B2** No first-admin path in production mode | `routes/adminRoutes.ts` (role change needs an existing SUPER_ADMIN) | Only option was a manual database edit | Unaudited privilege grants; pressure to run staging in dev mode | One-time CLI bootstrap; no HTTP route | `adminBootstrap.test.ts` (11) |
| **B3** JWT trusted for 7 days | `middleware/auth.ts`, `services/authService.ts`, `routes/authRoutes.ts`, `routes/problemRoutes.ts` | Role lived in the token; `requireAuth` and `requireRole` never checked the database; logout only cleared the cookie | Suspended users and demoted admins kept access for up to 7 days; stolen tokens could not be revoked | Token holds `sub` and a token version only; role and status come from the database on every request; logout, suspension and role change bump the version | `sessionLifecycle.test.ts` (18), `authService.test.ts` |
| **B4** Front end depends on the dev-server proxy | `src/api/httpAdapter.ts` (hard-coded `/api`), `vite.config.ts` | A static `dist/` reached no API unless served same-origin, and nothing said so | Broken or misrouted deployments | Required, validated `VITE_API_BASE_URL` for every deployable build | `deployment.test.ts` (35), real build controls |
| **B5** Mock-API build can ship | `src/api/index.ts`, `vite.config.ts`, `playwright.config.ts` | `VITE_USE_MOCK_API=true` at build time produced fake authentication with no check | Every visitor signed in as a demo user | `vite build` fails unless `--mode e2e`; the bundle also refuses to start; CI negative control | `deployment.test.ts`, real build controls, CI step |

---

## 2. Phase 2: changes, by increment

### 2.1 B1: fail-closed configuration (`server/config/env.ts` and others)
* **`NODE_ENV` is required:** one of `development | test | staging | production`, with no default. `isStrictEnvironment()` treats everything except `development` and `test` as strict, so unknown modes fail closed.
* **No built-in secrets.** `JWT_SECRET` and `COOKIE_SECRET` are required in every mode except `test`, which gets random per-process secrets. An empty value counts as unset.
* **Strict mode (staging, production)** additionally requires:
  * secrets of at least 32 characters, not one of the 4 public values (the old fallbacks and the `.env.example` placeholders), and different from each other;
  * `CLIENT_URL` as a valid **https origin with no path or trailing slash**, since CORS and the Origin check need the exact origin;
  * an explicit `MONGODB_URI`.
* Validation errors print field names and messages only, never values.
* The rate-limit variables are now real numbers (`z.coerce`). Before, the zod defaults returned *strings* when unset (e.g. `"900000"`), so `now + windowMs` concatenated strings in CI.
* **Seeding** (`seedDevData.ts`) is an allow-list: `development` only. The demo USER is always seeded there; the ADMIN and SUPER_ADMIN accounts need `SEED_DEV_ADMINS=true`. Passwords are no longer logged.
* **Strict startup refuses** to run while any development seed account exists in the database (`assertNoDevSeedAccounts`). A DB connection failure exits in staging as well as production.
* **Responses never contain `stack`.** 5xx messages are masked everywhere except `development`.
* **Cookies:** one shared definition in `server/config/authCookie.ts`, `Secure` in strict modes.
* **Express:** runs in `production` mode for staging (`app.set('env', …)`).
* **Startup:** a `startServer()` rejection now logs and exits non-zero (`index.ts`).

### 2.2 B2: first-admin bootstrap (`server/services/adminBootstrap.ts`, `server/scripts/bootstrapAdmin.ts`)
`npm run admin:bootstrap -- --email <email> --user-id <id>`, run by an operator with database access and the deployment's environment loaded.
* **Promotes an existing account** that its owner registered and logged into normally. The script never takes, sets or prints a password; `--password` is rejected as an unknown argument.
* **Requires the account id as well as the email.** The owner reads it from `GET /api/auth/me` while logged in. Registration has no email verification, so someone could pre-register the admin's email; the id check means the operator promotes only an account they have proven they control.
* **One-time:** refused if any SUPER_ADMIN exists. After that, the existing audited `PATCH /api/admin/users/:id/role` applies.
* **Audit before promotion:** the `SUPER_ADMIN_BOOTSTRAP` entry (target type `SYSTEM`, operator `user@host`, old and new role) is written *before* the role changes. If the save fails, a `…_FAILED` entry is added and the error is rethrown.
* The promotion bumps `tokenVersion`, so the owner logs in again. The script connects directly and does no seeding.

### 2.3 B3: revocable sessions with a per-request authorization check
* **Token contents** (`authService.ts`): only `{ sub, tv }`, signed HS256 with the algorithm pinned on verify. Tokens are rejected if the claims are malformed, including **pre-Sprint-8 tokens**, so every user logs in once after deploy.
* **Per-request check** (`services/sessionService.ts`, `resolveSession`): one indexed `_id` lookup. It rejects unknown users, then non-active accounts, then any version mismatch.
* **What reaches the routes:** `requireAuth` sets `req.user = { userId, role }` from the **database**, so `requireRole` and the admin hierarchy checks use the current role.
* **Rejections:** HTTP 401 with `code` `SESSION_INVALID`, `SESSION_REVOKED` or `ACCOUNT_SUSPENDED`, and the cookie is cleared. Suspension is 401 rather than 403 so the existing client 401 handler signs the user out.
* **Logout** increments `tokenVersion`, which revokes all of that user's sessions on every device. The increment only happens if the presented token is still current, so a replayed, already-revoked token cannot log the user out of newer sessions. User documents without the field are treated as version 0.
* **Suspension** and any **actual role change** bump `tokenVersion`; the audit details record `sessionsRevoked`.
* **Login** now verifies the password *before* reporting suspension, so suspension status isn't disclosed to anyone without the password.
* **Found after the first report, on a real local database:** 2 of the 3 local users predate the `accountStatus` field, and `.lean()` doesn't apply schema defaults. The first version of the check therefore treated them as suspended: login succeeded, then every protected request returned 401. A missing `accountStatus` now means the schema default `active`, matching login and the admin list; any other unexpected value still fails closed. Regression tests were added and confirmed to fail on the old code.
* **Found during verification:** `problemRoutes.ts` had its own `optionalAuth` that trusted the token alone. It now uses `resolveSession`, so revoked or suspended sessions are treated as anonymous. No other token-verification path remains (checked with grep).

### 2.4 B4 + B5: front-end deployment configuration (`src/config/deployment.ts`, `vite.config.ts`)
* **One pure module** holds the rules. `vite.config.ts` uses it at build time; `src/api` uses it at runtime as defence in depth.
* **Every deployable `vite build` requires `VITE_API_BASE_URL`**, in one of two forms:
  * a root-relative path such as `/api` (same-origin reverse proxy);
  * an absolute `https://` URL such as `https://api.example.com/api`.

  Plain http is allowed only for localhost. Credentials, query strings, fragments, protocol-relative and non-http schemes are rejected. The dev proxy remains for `vite` dev only.
* **The build fails** when `VITE_USE_MOCK_API=true`, in every mode except `--mode e2e`. Playwright now builds with `--mode e2e`. The bundle itself also refuses to start if a deployable build somehow has the mock enabled.
* **Defect found and fixed: every local production build was a development bundle.**
  * Cause: Vite read `NODE_ENV=development` from the **server's root `.env`**. The bundle had `DEV:true, PROD:false`, used the development React runtime, and shipped the dev-only "Use demo credentials" button including its password.
  * Scope: the Sprint 7 `dist/` shows the same. CI was unaffected because it has no `.env`.
  * Fix: Vite now reads env files only from **`frontend-env/`** (see `frontend-env/.env.example`), and the build fails if the effective `NODE_ENV` is anything other than `production`.
  * Result: no `jsxDEV`, no demo password, `DEV:false`, and the bundle shrank from 1.36 MB to 1.06 MB.
* **CI** (`.github/workflows/ci.yml`): the build step sets `VITE_API_BASE_URL=/api`. A new step requires a mock-API production build to fail *with the guard's message*, so an unrelated failure can't pass for it.

**Deployment topology this supports:** the front end and the API must be **same-site** (one origin behind a reverse proxy, or sibling subdomains of one registrable domain). The reason is that the auth cookie is `SameSite=Lax`. The server's `CLIENT_URL` must be the front end's exact origin. A cross-site API host would need `SameSite=None` plus CSRF tokens, which was deliberately not built.

### 2.5 Test changes to existing files (none weaken an assertion)
* `securityRemediation.test.ts`: the test "permits local development defaults without production secrets" now supplies secrets. The old expectation (development works with *no* secrets) is exactly the fallback-secret behaviour B1 removes. The new tests assert that development *without* secrets fails.
* `authRoutes`, `adminRoutes`, `productRoutes`: tokens are created with `tokenFor(id, role)` (`tests/helpers/sessionStub.ts`). The helper stands in for the database lookup with the given role; JWT verification, `requireAuth` and `requireRole` still run for real. The real lookup is covered by `sessionLifecycle.test.ts`.
* `authService.test.ts`: asserts the new claim shape instead of `role` in the token, plus new rejection cases.

### 2.6 Files
New:
* server: `config/authCookie.ts`, `services/sessionService.ts`, `services/adminBootstrap.ts`, `scripts/bootstrapAdmin.ts`
* tests: `tests/helpers/sessionStub.ts`, `tests/configHardening.test.ts`, `tests/sessionLifecycle.test.ts`, `tests/adminBootstrap.test.ts`
* front end: `src/config/deployment.ts`, `src/config/__tests__/deployment.test.ts`, `frontend-env/.env.example`
* this report

Changed:
* server: `config/env.ts`, `config/seedDevData.ts`, `config/db.ts`, `index.ts`, `app.ts`, `middleware/auth.ts`, `middleware/errorHandler.ts`, `models/User.ts` (`tokenVersion`), `services/authService.ts`, `routes/authRoutes.ts`, `routes/adminRoutes.ts`, `routes/problemRoutes.ts`
* front end: `src/api/index.ts`, `src/api/httpAdapter.ts`
* build and config: `vite.config.ts`, `playwright.config.ts`, `tsconfig.node.json`, `package.json` (`admin:bootstrap`), `.env.example`, `.github/workflows/ci.yml`, `README.md`
* existing tests, as in §2.5

---

## 3. Phase 3: verification of each change
| Increment | Focused check | Negative control (mutation reverted afterwards) |
|---|---|---|
| B1 | server tests 110/110 | Restoring the old `=== 'production'` seeding check fails 2 tests |
| B3 | server tests 129/129, then 141/141 with the optional-auth test | Removing the token-version check fails 7 lifecycle tests; removing the status check fails 2; making `optionalAuth` trust the token fails 1 |
| B2 | 11/11; CLI smoke test: no args gives usage, `--password` gives "Unknown argument", both before any DB connection | n/a |
| B4/B5 | 35/35, plus real `vite build` runs (below) | n/a |
| Strict startup | `NODE_ENV=staging npx tsx server/index.ts` with the local dev `.env` | Refused with 3 field-level errors; output contains no secret, URI or placeholder value (grep count 0) |

Real build controls:

| Build | Result |
|---|---|
| no `VITE_API_BASE_URL` | **fails** with the guard message |
| `VITE_USE_MOCK_API=true` (production mode) | **fails** with the guard message |
| `NODE_ENV=development` in the shell | **fails** with the guard message |
| `/api` | succeeds |
| `https://api.example.com/api` | succeeds; the URL is in the bundle |
| `--mode e2e` + mock | succeeds |

The CI negative-control step was simulated locally and passes.

---

## 4. Integration tests added (`server/tests/sessionLifecycle.test.ts`)
These exercise the real routes, middleware, session service and JWT code against a small stateful in-memory stand-in for the User collection:
* **Login and logout:** a session works; after logout the copied token gets 401 `SESSION_REVOKED`.
* **All devices:** logout ends the user's other sessions too.
* **Replay protection:** a revoked token replayed at `/logout` does not end newer sessions.
* **Other cases:** bearer tokens are revoked; legacy users without `tokenVersion` or `accountStatus` work and can be revoked or suspended; an unexpected `accountStatus` fails closed; a deleted user is rejected; the cookie is cleared on rejection.
* **Suspended users:**
  * an admin suspension ends sessions immediately and is audited with `sessionsRevoked`;
  * a database-only suspension (no version bump) is rejected;
  * login with a wrong password gives the generic 401, while the right password gives the 403 "suspended";
  * reactivation does not revive old tokens.
* **Demoted administrators:**
  * a SUPER_ADMIN demotion ends admin access, and after re-login the user gets 403;
  * a database-only demotion means 403 on the next request;
  * a demoted SUPER_ADMIN can no longer change roles;
  * a no-op role change keeps sessions.
* **Optional auth:** the public problem list personalises only for live sessions.

---

## 5. Final results (Windows 11, Node 22.16, local)
| Command | Result |
|---|---|
| `npm test` | **598 passed** (20 files); was 483 in 16 files |
| `npm run typecheck` (`tsc -b`) | exit 0 |
| `npm run lint` | exit 0, 0 errors, 6 warnings (the same pre-existing ones) |
| `npm run build` with no env | **fails as intended** (no `VITE_API_BASE_URL`) |
| `VITE_API_BASE_URL=/api npm run build` | success; a real production bundle (`DEV:false`, no `jsxDEV`, no demo password) |
| `npm run e2e` (Chromium, 2 workers, 0 retries) | **175 passed** (3.7 min). The E2E bundle is now a true production build (`--mode e2e`, `DEV:false`), as CI's always was. |
| Cross-browser E2E (`e2e:cross`) | not re-run this sprint |
| Manual run against local MongoDB (development) | demo login, `/auth/me`, both progress endpoints: 200; replayed cookie after logout: 401 `SESSION_REVOKED` (§6.1) |

The unit and E2E rows were measured before the `accountStatus` fix. After the fix, the full unit suite (598) and lint were re-run and pass. Typecheck, build and E2E were not re-run, since the fix touched only `server/` code, which none of them cover.

Server type check (not part of `tsc -b`; a temporary strict config outside the repo): 64 pre-existing errors before, and the same set after, except for two kinds of difference:
* one new error that was a real bug (the `optionalAuth` gap, fixed);
* two new instances of the pre-existing `AdminAuditLog.create` typing pattern, in `adminBootstrap.ts`.

**CI links:** none. No repository or remote exists, so nothing ran remotely.

---

## 6. Not verifiable locally / unresolved
1. **No real MongoDB was used in the tests.** The tests rely on mocks and an in-memory stand-in. This risk already showed up once: a read-only field-presence count on the local database revealed the missing-`accountStatus` bug (§2.3). After the fix, one manual run against the local MongoDB (development mode) passed: demo login, then `/auth/me`, `/progress/summary` and `/progress/algorithms` all returned 200; after logout, the replayed cookie got 401 `SESSION_REVOKED`. None of the local users had a `tokenVersion` field, so that run exercised the legacy path on a real server: a version-0 token for a document without the field, then the `$or`/`$exists` filter and `$inc` on logout. Still unverified against a real server:
   * any of this under automation (only the one manual run);
   * a non-zero `tokenVersion`, i.e. a second logout cycle;
   * suspension and demotion through the admin routes;
   * the per-request lookup's latency under load.
2. **Linux CI has never run** (as in Sprint 7). The new CI steps are syntax-checked, and their logic was simulated in bash.
3. **No production-like deployment was exercised:** reverse proxy, TLS, `Secure` cookies over https, `TRUST_PROXY`, and a cross-subdomain cookie.
4. **Logout ends all of a user's sessions** (one version counter). Per-device logout would need a session or `jti` store.
5. **Bootstrap race:** the "no SUPER_ADMIN exists" check and the promotion aren't one transaction. Two operators running it at the same moment could both succeed (both audited). Acceptable for a one-off operator command; documented.
6. **No email verification on registration.** The bootstrap's `--user-id` check mitigates this for admin creation, but it remains a product gap.
7. **The server isn't type-checked by `npm run typecheck`,** and 64 type errors already exist there (mostly zod v4 API drift such as `errorMap` and `required_error`, plus Express 5 `params` types). Some may hide runtime bugs.
8. **The local `.env` uses public placeholder or fallback secrets.** That's accepted in development only; strict modes refuse them, as the smoke test showed.
9. **Local side effects:**
   * `dist/` was rebuilt as a production bundle (git-ignored);
   * the demo account's `tokenVersion` in the local database is now 1, from the manual logout test;
   * the backend was restarted at the user's request and currently runs as a background task of the assistant session.
10. **Shell quirk:** Git Bash rewrites `VITE_API_BASE_URL=/api` into a Windows path unless `MSYS_NO_PATHCONV=1` is set. The guard rejects the result, so this fails safe; it's in the README.
11. Sprint 7's R1–R7 (shared rate limiting, `/readyz`, structured logging, process handlers, backups and migrations, fonts, bundle size) are still open, apart from the start-up rejection handler.

## 7. Next steps (recommended order)
1. Review this sprint's diff (§2.6). Then confirm the GitHub destination and default branch so the repository can be initialised (Sprint 7 §1) and CI can run on Linux.
2. Add `server/` to type checking (a `tsconfig.server.json` in `tsc -b`) and fix the 64 existing errors in a separate, reviewable change.
3. Run the session and revocation tests against a real MongoDB, either a disposable container or `mongodb-memory-server` in CI.
4. Choose the staging topology (same origin vs. sibling subdomain), write the reverse-proxy config, and do a private (not public) staging dry run. In that dry run: bootstrap the first admin, then check Secure cookies, revocation and the error masking end to end.
5. Then address R1–R5, and the manual accessibility checklist from Sprint 7.

Stopped after this report; waiting for review.
