# Real-backend E2E tests

The tests in `e2e/real/` drive the **real front end** (a production build, mock API off) against the **real Express API** and a **real, disposable MongoDB**. Nothing is mocked, except for one test marked `[fault injection]`, which aborts a single request to test the error and Retry state. Everything after that comes from the real server.

The mock-API suite in `e2e/tests/` (`npm run e2e`) is separate and unchanged.

## Run

```bash
npm run e2e:install     # once: Playwright's browsers
npm run e2e:real        # starts the database, API and front end, runs the suite, stops everything
```

**Prerequisite:** MongoDB Community Server (`mongod`). The launcher finds it in one of these places:
- `E2E_MONGOD_PATH`;
- `mongod` on PATH;
- a standard Windows install (`C:\Program Files\MongoDB\Server\<version>\bin\mongod.exe`).

Without one, use Docker with `E2E_MONGODB_URI`:

```bash
docker run --rm -d -p 27999:27017 --name algoflow-e2e-mongo mongo:8
E2E_MONGODB_URI=mongodb://127.0.0.1:27999/algoflow_e2e npm run e2e:real
```

If neither is available, the run stops with a message naming this prerequisite. It never falls back to the mock API or to another database.

## What starts

| Part | Where | How |
|---|---|---|
| MongoDB | `127.0.0.1:27999` (`E2E_MONGO_PORT`) | `server/e2e/startE2eApi.ts` starts its own `mongod` with an **empty temporary data folder**. It refuses to start if the port is already taken, so it never opens a database this run didn't create. |
| API | `127.0.0.1:5299` (`E2E_API_PORT`) | The real `server/app.ts`, started by the same launcher. |
| Front end | `127.0.0.1:5198` (`E2E_REAL_WEB_PORT`) | `vite build` into `dist-real-e2e` with `VITE_API_BASE_URL=http://127.0.0.1:5299/api`, served by `vite preview`. |

Each test checks that the served build reports `mockApi: false` and that the API is up.

## Safety

- **No `.env` values are used.** The launcher sets the whole server configuration before any server code loads:
  - `NODE_ENV=test`;
  - random `JWT_SECRET` and `COOKIE_SECRET` for each run;
  - the test database URI;
  - local `CLIENT_URL` and `HOST`.

  `dotenv` never overrides a variable that is already set, so `.env`'s `MONGODB_URI`, secrets and `NODE_ENV` are never read. The launcher logs `injected env (0) from .env`.
- **No seeding.** `NODE_ENV=test` skips development seeding, and the server's own database connection is not used (the launcher connects instead).
- **No code execution and no provider charges.** The API runs with `EXECUTION_PROVIDER=fake` (`src/execution/fakeExecution.ts`), which compiles and runs nothing, and with `EXECUTION_DAILY_LIMIT_PER_USER=12` so tests can use up a quota. Real Judge0 execution is tested only by the opt-in `server/tests/judge0.live.test.ts` (`JUDGE0_LIVE=1`).
- **Database guard** (`server/e2e/testDatabase.ts`). `E2E_MONGODB_URI` must be:
  - `mongodb://` (not `mongodb+srv://`);
  - on loopback only;
  - named `*_e2e` or `*_test`;
  - not the same database as `.env`'s `MONGODB_URI`, the shell's `MONGODB_URI`, the development default `mongodb://127.0.0.1:27017/algoflow`, or anything in `E2E_PROTECTED_MONGODB_URIS` (comma-separated).
- **Other people's accounts.** The run refuses a database that contains any account it didn't create. The suite's accounts use `@e2e.algoflow.test` addresses.
- **Cleanup.**
  - With `E2E_MONGODB_URI`, the suite's own records from earlier runs are deleted when a run starts (users with that domain, plus their notes, progress, activity and submissions). Nothing else is touched.
  - With the launcher's own `mongod`, the global teardown stops it and deletes the whole temporary folder.
  - A run that was killed is cleaned up when the next run starts.

## Environment variables

All are optional.

| Variable | Default | Purpose |
|---|---|---|
| `E2E_MONGODB_URI` | (start an own `mongod`) | An existing local disposable database, e.g. a CI service container |
| `E2E_MONGOD_PATH` | auto-detected | Path to `mongod` |
| `E2E_MONGO_PORT` | 27999 | Port for the launcher's own `mongod` |
| `E2E_API_PORT` | 5299 | API port |
| `E2E_REAL_WEB_PORT` | 5198 | Front-end port |
| `E2E_PROTECTED_MONGODB_URIS` | (none) | Extra databases the suite must never use |
| `E2E_WORKERS` | 2 | Parallel browsers |

No secrets are needed or stored.

## CI

`.github/workflows/ci.yml` has an `e2e-real` job. It runs a `mongo:8` service container on port 27999 and sets `E2E_MONGODB_URI=mongodb://127.0.0.1:27999/algoflow_e2e`.
