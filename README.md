# AlgoFlow

**Don't just read the algorithm. Watch it execute.** AlgoFlow is an interactive data-structures-and-algorithms
learning platform: every step of an algorithm is shown at the same time as live bars, the highlighted line of source
code, and a plain-language explanation of what just happened.

## Features

- **Visualizer**: step through, play or pause nine implemented algorithms on your own input:
  - sorting: bubble, selection, insertion, merge, quick and heap sort;
  - searching: linear and binary search;
  - the two-pointer pair-sum technique.

  Code, bars and explanations come from one execution trace, so they always agree.
- **Learning**: learning paths, algorithm patterns, a practice problem set with stored submissions, a code playground,
  personal notes and a progress dashboard.
- **Accounts and administration**: registration and login with HttpOnly cookie sessions; roles `USER`, `ADMIN` and
  `SUPER_ADMIN`; an admin console for users, problems and an audit log.
- **Accessibility**: keyboard operable, with screen-reader labels and announcements, covered by axe-core and keyboard
  E2E tests (see `docs/manual-accessibility-checklist.md` for the manual checks still to run).

Submitted practice code is **stored only, never executed**.

## Tech stack

| Layer | Technology |
|---|---|
| Front end | React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, React Router, Framer Motion, Monaco editor, Recharts |
| Back end | Node.js, Express 5, MongoDB with Mongoose, zod validation, JWT sessions (bcrypt passwords), helmet |
| Tests | Vitest (unit, integration, component), Playwright + axe-core (end-to-end, accessibility) |
| Tooling | oxlint, GitHub Actions CI |

## Project layout

```
src/            front end: pages, components, Zustand stores, API client (HTTP or in-browser mock)
  engine/       algorithm implementations and the execution-trace builder that drives the visualizer
  config/       deployment rules shared by the build and the runtime (API base URL, mock-build guards)
server/         Express API: routes, middleware (auth, origin check, rate limits), models, services
  scripts/      operator tools: admin:bootstrap, env:secrets
  tests/        API, security and session tests (database models are mocked)
scripts/        repository tools: typecheck:server, verify:artifact
e2e/            Playwright end-to-end tests (run against the built app on the mock API)
frontend-env/   front-end env files (Vite never reads the server's .env)
docs/           sprint reports, security reviews, accessibility checklist
```

## Getting started

Requirements: Node.js 22 and MongoDB (local `mongodb://127.0.0.1:27017` by default).

```bash
npm ci
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
npm run env:secrets           # fills JWT_SECRET and COOKIE_SECRET with random values (never printed)
npm run server                # API on http://127.0.0.1:5000
npm run dev                   # front end on http://localhost:5173 (proxies /api to the API)
```

- In development the API listens on `127.0.0.1` only. Set `HOST=0.0.0.0` in `.env` if another device must reach it.
- Development seeds a demo user (`demo@algoflow.io`) and sample problems. Set `SEED_DEV_ADMINS=true` to also seed
  fixed-password admin accounts; that works locally only, and nothing is seeded in any other mode.
- No backend handy? `VITE_USE_MOCK_API=true npm run dev` runs the front end on its in-browser mock API.

## Scripts and checks

| Command | What it does |
|---|---|
| `npm run dev` / `npm run server` | front-end dev server / API server |
| `npm test` | Vitest: server, engine and trace, store and component tests (no browser, no database, no `.env` needed) |
| `npm run typecheck` | `tsc -b`: app, build config and scripts, E2E project. Does **not** cover `server/` |
| `npm run typecheck:server` | type-checks `server/`; fails on any error not in `server/typecheck-baseline.json` (pre-existing errors; the baseline can only shrink) |
| `npm run lint` | oxlint |
| `npm run build` | type-check, then production build; requires `VITE_API_BASE_URL` (see below) |
| `npm run verify:artifact -- dist` | fails unless the directory is a deployable production build (not E2E, mock or development) |
| `npm run e2e` | Playwright tests against the real UI on the mock API; see [e2e/README.md](e2e/README.md) (first run: `npm run e2e:install`) |
| `npm run verify` | test, typecheck, lint, build and E2E (set `VITE_API_BASE_URL` first) |
| `npm run env:secrets` | generate local `JWT_SECRET` / `COOKIE_SECRET` |
| `npm run admin:bootstrap` | one-time creation of the first SUPER_ADMIN (see below) |

CI (`.github/workflows/ci.yml`) runs the unit tests, both type checks, lint, the build with artifact verification,
negative controls for mock and E2E builds, and the Playwright suites.

## Deployment configuration

See `docs/security-deployment-sprint-8-report.md` and `docs/security-hardening-pre-commit-report.md` for the
rationale.

**Server** (`.env`, see `.env.example`): `NODE_ENV` is required. Use `staging` or `production` for anything other
than a developer machine. Both:
- require real secrets (at least 32 characters, not a published value), an https `CLIENT_URL` origin and an explicit
  `MONGODB_URI`;
- use Secure cookies and masked errors;
- never seed accounts, and refuse to start while development seed accounts exist.

Sessions are checked against the database on every request, so logout, suspension and role changes take effect
immediately.

**First administrator**:
1. Register and log in normally.
2. Read your `user.id` from `GET /api/auth/me`.
3. An operator with the environment loaded runs `npm run admin:bootstrap -- --email <email> --user-id <id>`.

It works once: a unique lock document makes concurrent runs safe, and it is refused while any SUPER_ADMIN exists. It
writes an audit record; further role changes use the admin UI. If a run is interrupted between taking the lock and
promoting, later runs are refused. To recover, confirm no SUPER_ADMIN exists, then delete
`{ _id: 'super-admin-bootstrap' }` from the `systemlocks` collection.

**Front end**: Vite reads env files from `frontend-env/` only. Every deployable build needs `VITE_API_BASE_URL`, either:
- `/api`, behind a same-origin reverse proxy; or
- `https://api.example.com/api`, for an API host that is same-site with the front end (the auth cookie is
  `SameSite=Lax`).

The build fails with `VITE_USE_MOCK_API=true` (allowed only in `--mode e2e`, whose output must go to `dist-e2e/`) or
with a development `NODE_ENV`. Every build writes `build-info.json`; run `npm run verify:artifact -- <dir>` on the
exact directory you are about to deploy.

Local production build (PowerShell): `$env:VITE_API_BASE_URL='/api'; npm run build`. In Git Bash, prefix the command
with `MSYS_NO_PATHCONV=1`, or Git Bash rewrites `/api` into a Windows path.

## Status

Not yet deployed. Known open items are tracked in `docs/security-deployment-final-review.md` (findings F5–F9,
pre-existing server type errors) and in the latest sprint reports.
