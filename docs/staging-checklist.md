# Staging readiness checklist

**For:** whoever deploys AlgoFlow to a staging environment.

**Status: not deployed.** No staging environment exists yet. Nothing below is verified in staging until it has been deployed and checked there. Items marked *(rehearsed locally)* were checked on one machine: the real server ran in `NODE_ENV=staging` against a throwaway local MongoDB. That shows the code behaves correctly. It does not show that a host is configured correctly.

## Architecture to deploy

| Part | What it is | Notes |
|---|---|---|
| Front end | Static files from `vite build` (`dist/`) | Build with the production mode. `npm run verify:artifact -- dist` must pass. It rejects mock-API and e2e builds. |
| API | Node 22, `npm run server` (`tsx server/index.ts`) | It doesn't serve the front end. |
| Database | MongoDB | **A separate staging database.** Never production's, and never a development database holding seed accounts. Strict mode refuses to start if dev seed accounts exist. |
| Code execution | Judge0, set with `EXECUTION_PROVIDER` | Keep `disabled` until a key and plan are approved. |
| AI Tutor | Google Gemini, set with `AI_PROVIDER` | Keep `disabled` until the model, the Gemini tier, the Privacy text and the live test are approved. |

## 1. URLs and routing

- [ ] **Pick one routing option:**
  - **(A) One origin:** the front end and `/api` are served behind one reverse proxy. Set `VITE_API_BASE_URL=/api`.
  - **(B) Separate API host:** `VITE_API_BASE_URL=https://api.<domain>/api`. The API must be **same-site** with the front end (a sibling subdomain of the same registrable domain), because the auth cookie is `SameSite=Lax`.
- [ ] `CLIENT_URL` is the front end's exact origin: `https://`, no path, no trailing slash. *(Rehearsed locally: `http://` is refused at startup.)*
- [ ] The proxy forwards `/api/*` to the API unchanged, keeping the `/api` prefix.
- [ ] The front end serves `index.html` for every non-file path (single-page app fallback). Deep links such as `/practice` must load.
- [ ] `TRUST_PROXY` matches the number of proxy hops (usually `1`). Rate limits and logs then see the client's IP, not the proxy's.

## 2. Cookies, CORS and the origin check

- [ ] The auth cookie is `HttpOnly; Secure; SameSite=Lax; Path=/`, with a 7-day lifetime. *(Rehearsed locally.)* `Secure` means staging **must be served over https**.
- [ ] CORS allows only `CLIENT_URL`, with credentials. *(Rehearsed locally: a foreign origin is only ever told the configured origin, which browsers reject.)*
- [ ] Writes from a foreign `Origin` get 403. *(Rehearsed locally.)*
- [ ] In staging: sign up, reload (the session is restored), sign out, then confirm the old cookie is refused. These are the same checks as `e2e/real/auth.spec.ts`.

## 3. Secrets and environment

- [ ] `NODE_ENV=staging`, which enables strict mode.
- [ ] `JWT_SECRET` and `COOKIE_SECRET` are at least 32 random characters each, different from each other, held in the host's secret store, and never in the repository or a `VITE_` variable. *(Rehearsed locally: short secrets are refused.)*
- [ ] `MONGODB_URI` points at the staging database. It is required in strict mode.
- [ ] `EXECUTION_PROVIDER` is `disabled`, or `judge0` with `JUDGE0_API_URL` (https), `JUDGE0_API_KEY` and `JUDGE0_AUTH`. `fake` is refused in strict mode. *(Rehearsed locally.)*
- [ ] Limits are reviewed: `EXECUTION_DAILY_LIMIT_GLOBAL` is below the Judge0 plan's daily allowance, plus `EXECUTION_DAILY_LIMIT_PER_USER`, `EXECUTION_RATE_LIMIT_PER_MINUTE` and `RATE_LIMIT_*`.
- [ ] `AI_PROVIDER` is `disabled`, or `gemini` with `GEMINI_API_KEY` and `GEMINI_MODEL`. `fake` is refused in strict mode. The key is server-side only, never a `VITE_` variable.
- [ ] Tutor limits are reviewed against the project's limits in AI Studio: `TUTOR_GLOBAL_RATE_LIMIT_PER_MINUTE` below its per-minute limit, `TUTOR_DAILY_LIMIT_GLOBAL` below its daily limit, plus `TUTOR_DAILY_LIMIT_PER_USER` and `TUTOR_RATE_LIMIT_PER_MINUTE`. Google's limits belong to the Google Cloud project: environments sharing a project share them. Tutor daily counts reset at midnight Pacific Time, as Google's do.
- [ ] `SEED_DEV_ADMINS` is unset or `false`. Create the first admin with `npm run admin:bootstrap`.
- [ ] The front-end build variables (`frontend-env/`) contain only `VITE_API_BASE_URL`. Everything in them is public.

## 4. Execution provider

- [ ] The live Judge0 test has passed against the staging key (`server/tests/judge0.live.test.ts`, with `JUDGE0_LIVE_ALLOWANCE` set).
- [ ] In staging, a Playground run and a Practice submission return real verdicts.
- [ ] With the provider unreachable, the app says "not run" or "Judging Error". It never shows output or a pass.

## 4a. AI Tutor

- [ ] The model is chosen in AI Studio and its free-tier limits are written down. The expected model is `gemini-3.5-flash-lite` (the 2.5 models are limited to projects that used them before and return HTTP 404 otherwise). It thinks at a minimal level by default, and thinking tokens count against the 1024-token output limit per answer, so check that the live test reports no cut-off answers.
- [ ] Billing on the Gemini project is confirmed (off for the unpaid tier), and the Privacy page describes the tier actually used.
- [ ] The opt-in live test has passed (`server/tests/gemini.live.test.ts`: `GEMINI_LIVE=1`, at most 2 requests). *(Locally, one run passed with `gemini-3.5-flash-lite` before the 1024-token limit and the cut-off check were added; it has to be run again.)*
- [ ] In staging, a question gets an answer, the Gemini notice is shown, and with the tutor disabled the drawer says it is unavailable.

## 4b. Dashboard activity

- [ ] In staging, the Dashboard's weekly chart counts a practice submission and a visualizer walkthrough on today's bar. Days are UTC days, as the card says.
- [ ] A submission that ends in "Judging Error" is saved in the history but adds nothing to the weekly activity.

## 5. Proxy and request timeouts

- [ ] Every proxy, load balancer and platform request timeout on the path to the API is **at least 120 s** for `POST /api/problems/:id/submit`. A submission can take up to about 90 s. The browser waits 120 s.
- [ ] At least 45 s for `POST /api/run`.
- [ ] At least 30 s for `POST /api/tutor/messages`. The server waits up to 20 s for Gemini; the browser waits 30 s.
- [ ] The request body limit is at least about 100 KB. Express's JSON parser allows 100 KB by default, and programs can be 50,000 characters.

## 6. Health checks and logs

- [ ] The health check points at `GET /healthz`. **It reports only that the process is running.** It doesn't check MongoDB or Judge0. *(Rehearsed locally: 200.)* Add a database readiness check if the host restarts instances based on it.
- [ ] `/healthz` is outside `/api`. Route it on the API host, or have the host probe the API directly.
- [ ] Logs are plain console output; the host must collect stdout and stderr. 5xx responses are masked as "Internal Server Error". Error log lines include the method and URL (query strings too, such as Notes search terms) and the error message. Bodies, cookies and secrets are not logged deliberately, but the error message for malformed JSON can quote part of the body. Decide on retention and access.
- [ ] Error tracking and alerting are chosen and connected (none exists yet).
- [ ] **Multiple instances:** the per-minute rate limits (code runs, tutor questions per user and for all users together), the one-run-at-a-time and one-question-at-a-time guards and the auth limiter are kept in memory per instance. The daily execution and tutor quotas are shared through MongoDB. Run one instance, or accept per-instance limits (with N instances, the tutor's all-users minute limit allows up to N times its value).

## 7. Data safety

- [ ] The staging database has backups enabled, and **one restore has been tested**.
- [ ] The practice-problem migration follows `docs/practice-problem-migration.md`: snapshot, dry run, review, apply. Until it is applied, the five original practice problems record attempts without a verdict. Apply it only once code execution works in staging; otherwise converted problems answer "Judging is not available".
- [ ] Staging holds no copy of production user data unless you approve it.

## Decisions still open

None of these has been decided. Each blocks part of this checklist or the launch.

- **Hosting:** the platform for the front end and the API, the domain, routing option A or B (section 1), the secret store, and whether one instance is enough (section 6).
- **Database:** the MongoDB provider and region for staging and production, the backup policy, and approval of the migration snapshot.
- **Code execution:** the Judge0 provider and plan, and its daily limits.
- **AI Tutor:** the Gemini tier and billing, and the project's limits as shown in AI Studio.
- **Operations:** log collection, retention and access; error tracking and alerting; whether the health check should include the database.
- **Legal and eligibility:** the placeholder sections of the Privacy page (who operates AlgoFlow, contact details, retention, users' rights, legal basis), whether Terms of Service are needed, a real support address (the sign-in page's "Forgot password?" message names `support@algoflow.io`, which is not confirmed to exist), and who may use the AI Tutor. When reviewed earlier, Google's unpaid Gemini API terms restricted use to people 18 and over and excluded the EEA; **verify this against the current applicable terms before launch**, as they may have changed or differ by tier.

## What can be checked locally vs. needs a host

| Local (done or runnable now) | Needs the chosen host |
|---|---|
| Strict startup validation, cookie flags, CORS, origin check, security headers, masked 5xx, disabled execution (the staging-mode rehearsal) | https, the domain, and the real cookie and CORS behaviour across the deployed origins |
| `verify:artifact` on the build | Proxy and platform timeouts (≥ 120 s) |
| The real-backend E2E suite against a disposable MongoDB | Secret storage, `TRUST_PROXY` hops, log collection, health-check wiring |
| The live Judge0 test (needs a key) | Backups and a restore drill on the staging database |
| The live Gemini test (needs a key, at most 2 requests) | |
| The migration dry run against a disposable database | The CI `e2e-real` job running on GitHub |
