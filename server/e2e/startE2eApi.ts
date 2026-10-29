/**
 * Starts the real AlgoFlow API for the real-backend E2E suite (playwright.real.config.ts), against a disposable
 * database only. Run by Playwright; by hand: `npm run e2e:real:api`.
 *
 * Database:
 *  - default: starts its own mongod (E2E_MONGOD_PATH, `mongod` on PATH, or a standard Windows install) on
 *    127.0.0.1:E2E_MONGO_PORT (27999) with an empty temporary data folder, so no existing database is ever opened;
 *  - or E2E_MONGODB_URI: an existing local database (e.g. a CI service container). It must pass checkE2eDatabaseUri,
 *    and it must contain no accounts except the suite's own (E2E_EMAIL_DOMAIN); the suite's earlier records are removed
 *    before the run.
 *
 * Server configuration is set here, in full, before any server module loads. dotenv (server/config/env.ts) never
 * overrides a variable that is already set, so nothing from .env is used: not its MONGODB_URI, its secrets or its
 * NODE_ENV. NODE_ENV=test skips development seeding and the server's own database connection (made here instead).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  DEFAULT_E2E_DB_NAME,
  DEFAULT_E2E_MONGO_PORT,
  DEV_DEFAULT_MONGODB_URI,
  E2E_EMAIL_DOMAIN,
  checkE2eDatabaseUri,
} from './testDatabase';
import { cleanUpRun, writeRunState } from './processes';

const API_PORT = Number(process.env.E2E_API_PORT ?? 5299);
const CLIENT_URL = process.env.E2E_CLIENT_URL ?? 'http://127.0.0.1:5198';
const MONGO_PORT = Number(process.env.E2E_MONGO_PORT ?? DEFAULT_E2E_MONGO_PORT);
const TEMP_PREFIX = 'algoflow-e2e-db-';

let mongod: ChildProcess | null = null;
let dataDir: string | null = null;

function fail(message: string): never {
  console.error(`❌ Real-backend E2E API: ${message}`);
  stopMongod();
  process.exit(1);
}

function stopMongod() {
  if (mongod && mongod.exitCode === null) mongod.kill();
  mongod = null;
  if (dataDir) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // still locked by the exiting mongod: removed by the next run's sweep
    }
    dataDir = null;
  }
}

/** true when something accepts connections on 127.0.0.1:port */
function portInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(port: number, timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await portInUse(port)) return;
    if (mongod && mongod.exitCode !== null) fail(`mongod exited during startup (code ${mongod.exitCode}).`);
    await new Promise(r => setTimeout(r, 200));
  }
  fail(`mongod did not accept connections on port ${port} within ${timeoutMs / 1000}s.`);
}

function findMongod(): string | null {
  if (process.env.E2E_MONGOD_PATH) return fs.existsSync(process.env.E2E_MONGOD_PATH) ? process.env.E2E_MONGOD_PATH : null;
  if (spawnSync('mongod', ['--version'], { stdio: 'ignore' }).status === 0) return 'mongod';
  if (process.platform === 'win32') {
    const root = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'MongoDB', 'Server');
    const versions = fs.existsSync(root) ? fs.readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
    for (const v of versions) {
      const exe = path.join(root, v, 'bin', 'mongod.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

/** removes temporary data folders left by earlier runs (a killed run cannot clean up after itself) */
function sweepStaleDataDirs() {
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (!name.startsWith(TEMP_PREFIX)) continue;
    try {
      fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
    } catch {
      // in use by a running instance: leave it
    }
  }
}

async function startOwnMongod(): Promise<string> {
  const exe = findMongod();
  if (!exe) {
    fail(
      'MongoDB is required. Install MongoDB Community Server (mongod) or set E2E_MONGOD_PATH, or point E2E_MONGODB_URI ' +
        `at a local disposable database, e.g. \`docker run --rm -p ${MONGO_PORT}:27017 mongo:8\` with ` +
        `E2E_MONGODB_URI=mongodb://127.0.0.1:${MONGO_PORT}/${DEFAULT_E2E_DB_NAME}.`
    );
  }
  if (await portInUse(MONGO_PORT)) {
    fail(`port ${MONGO_PORT} is already in use; refusing to use a database this run did not start. Set E2E_MONGO_PORT.`);
  }
  sweepStaleDataDirs();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  mongod = spawn(exe, ['--dbpath', dataDir, '--port', String(MONGO_PORT), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore' });
  mongod.once('error', err => fail(`could not start mongod: ${err.message}`));
  await waitForPort(MONGO_PORT, 30_000);
  writeRunState({ apiPid: process.pid, mongodPid: mongod.pid ?? null, dataDir });
  return `mongodb://127.0.0.1:${MONGO_PORT}/${DEFAULT_E2E_DB_NAME}`;
}

async function main() {
  // a run that was killed (not shut down) may have left its API and mongod running
  cleanUpRun();
  // protected: the server's own database (.env, read without loading it), the shell's, and the development default
  const dotenvFile = path.resolve('.env');
  const dotenvValues = fs.existsSync(dotenvFile) ? dotenv.parse(fs.readFileSync(dotenvFile)) : {};
  const protectedUris = [
    dotenvValues.MONGODB_URI,
    process.env.MONGODB_URI,
    DEV_DEFAULT_MONGODB_URI,
    ...(process.env.E2E_PROTECTED_MONGODB_URIS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  ];

  const external = Boolean(process.env.E2E_MONGODB_URI);
  if (external) {
    const errors = checkE2eDatabaseUri(process.env.E2E_MONGODB_URI, protectedUris);
    if (errors.length) fail(`refusing E2E_MONGODB_URI:\n  - ${errors.join('\n  - ')}`);
  }
  const uri = external ? process.env.E2E_MONGODB_URI! : await startOwnMongod();
  if (external) writeRunState({ apiPid: process.pid, mongodPid: null, dataDir: null });
  const errors = checkE2eDatabaseUri(uri, protectedUris);
  if (errors.length) fail(errors.join(' '));

  // the whole server configuration, before any server module (and so dotenv) loads
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    HOST: '127.0.0.1',
    CLIENT_URL,
    MONGODB_URI: uri,
    JWT_SECRET: randomBytes(48).toString('hex'),
    COOKIE_SECRET: randomBytes(48).toString('hex'),
    TRUST_PROXY: 'false',
    RATE_LIMIT_WINDOW_MS: '900000',
    // many sign-ups and sign-ins per run; the limiter itself is covered by the server tests
    RATE_LIMIT_MAX_AUTH: '10000',
    RATE_LIMIT_MAX_API: '100000',
    SEED_DEV_ADMINS: 'false',
    // the fake provider: no code is run and nothing is billed (see src/execution/fakeExecution.ts). Opt-in:
    // E2E_EXECUTION_PROVIDER=local runs Python on this machine instead (e2e/real/local-python.spec.ts only; the other
    // specs expect the fake provider)
    EXECUTION_PROVIDER: process.env.E2E_EXECUTION_PROVIDER === 'local' ? 'local' : 'fake',
    // small, so a test can use up its own account's daily quota (but enough to judge the 6-test problems twice);
    // the minute limit stays out of the way
    EXECUTION_DAILY_LIMIT_PER_USER: '12',
    EXECUTION_DAILY_LIMIT_GLOBAL: '100000',
    EXECUTION_RATE_LIMIT_PER_MINUTE: '1000',
    // the AI Tutor answers from the fake provider; GEMINI_API_KEY and GEMINI_MODEL are blanked so .env's real values are
    // never loaded into this process (dotenv only fills variables that are not set)
    AI_PROVIDER: 'fake',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: '',
    TUTOR_DAILY_LIMIT_PER_USER: '5',
    TUTOR_DAILY_LIMIT_GLOBAL: '100000',
    TUTOR_RATE_LIMIT_PER_MINUTE: '1000',
    TUTOR_GLOBAL_RATE_LIMIT_PER_MINUTE: '1000',
  });

  const { default: mongoose } = await import('mongoose');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });

  const { User } = await import('../models/User');
  const { Note } = await import('../models/Note');
  const { ProgressTrack } = await import('../models/ProgressTrack');
  const { ActivityLog } = await import('../models/ActivityLog');
  const { Submission } = await import('../models/Submission');
  const { ExecutionQuota } = await import('../models/ExecutionQuota');
  const { Problem } = await import('../models/Problem');
  const { E2E_PRACTICE_PROBLEMS } = await import('./practiceFixtures');

  // never touch a database that holds anyone else's accounts
  const suiteEmail = new RegExp(`@${E2E_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`, 'i');
  const others = await User.countDocuments({ email: { $not: suiteEmail } });
  if (others > 0) fail(`the database holds ${others} account(s) that the E2E suite did not create; refusing to use it.`);

  // remove only the suite's own records from earlier runs
  const ids = (await User.find({ email: suiteEmail }).select('_id').lean()).map(u => u._id);
  if (ids.length) {
    // the driver's collections: the filter is the same for every model
    await Promise.all([Note, ProgressTrack, ActivityLog, Submission].map(m => m.collection.deleteMany({ userId: { $in: ids } })));
    // code execution's and the AI Tutor's daily counters (same store, separate keys)
    await ExecutionQuota.collection.deleteMany({ key: { $in: ids.flatMap(id => [`user:${String(id)}`, `tutor:user:${String(id)}`]) } });
    await User.collection.deleteMany({ _id: { $in: ids } });
  }
  // unique indexes (one activity record per user, day and algorithm; one e-mail per account) must exist before tests
  // the database holds only the suite's accounts (checked above), so its global execution and tutor counts are the suite's too
  await ExecutionQuota.collection.deleteMany({ key: { $in: ['global', 'tutor:global'] } });
  // deterministic practice problems (the database holds only the suite's data, checked above)
  await Problem.collection.deleteMany({});
  await Problem.insertMany(E2E_PRACTICE_PROBLEMS);
  await Promise.all([User.init(), Note.init(), ProgressTrack.init(), ActivityLog.init(), Submission.init(), ExecutionQuota.init(), Problem.init()]);

  const { app } = await import('../app');
  const server = app.listen(API_PORT, '127.0.0.1', () => {
    const db = new URL(uri.replace(/^mongodb:/, 'http:'));
    console.log(`E2E API on http://127.0.0.1:${API_PORT} (database ${db.host}${db.pathname}, ${external ? 'E2E_MONGODB_URI' : 'own mongod'})`);
  });

  const shutdown = () => {
    server.close();
    void mongoose.disconnect().finally(() => {
      stopMongod();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', stopMongod);
}

main().catch(err => fail(err instanceof Error ? err.message : String(err)));
