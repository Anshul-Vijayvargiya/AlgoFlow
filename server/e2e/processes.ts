/**
 * What a real-backend E2E run started (the API process and its own mongod), recorded so the run's global teardown —
 * or, after a hard kill, the next run — stops exactly those processes and removes the temporary data folder. A
 * recorded PID is only stopped while it still belongs to the expected program (PIDs are reused).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface E2eRunState {
  apiPid: number;
  mongodPid: number | null;
  dataDir: string | null;
}

export const RUN_STATE_FILE = path.join(os.tmpdir(), 'algoflow-e2e-run.json');

export function writeRunState(state: E2eRunState) {
  fs.writeFileSync(RUN_STATE_FILE, JSON.stringify(state));
}

export function readRunState(): E2eRunState | null {
  try {
    return JSON.parse(fs.readFileSync(RUN_STATE_FILE, 'utf8')) as E2eRunState;
  } catch {
    return null;
  }
}

/** the executable name of a running process, or null when there is none */
function processName(pid: number): string | null {
  if (process.platform === 'win32') {
    const out = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout ?? '';
    const m = /^"([^"]+)","(\d+)"/m.exec(out);
    return m && Number(m[2]) === pid ? m[1].toLowerCase() : null;
  }
  const out = spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' }).stdout?.trim();
  return out ? path.basename(out).toLowerCase() : null;
}

/** stops pid if it is still the expected program (e.g. "mongod", "node") */
function stopIf(pid: number | null | undefined, expected: string) {
  if (!pid || pid === process.pid) return;
  const name = processName(pid);
  if (!name || !name.startsWith(expected)) return;
  try {
    process.kill(pid);
  } catch {
    // already gone
  }
}

function waitUntilGone(pid: number | null | undefined, timeoutMs: number) {
  if (!pid) return;
  const until = Date.now() + timeoutMs;
  while (Date.now() < until && processName(pid)) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},100)']);
}

/** stops what the recorded run started and removes its data folder and the record */
export function cleanUpRun(state: E2eRunState | null = readRunState()) {
  if (!state) return;
  stopIf(state.apiPid, 'node');
  stopIf(state.mongodPid, 'mongod');
  waitUntilGone(state.mongodPid, 10_000);
  if (state.dataDir) {
    try {
      fs.rmSync(state.dataDir, { recursive: true, force: true });
    } catch {
      // still locked: removed by the next run's sweep
    }
  }
  fs.rmSync(RUN_STATE_FILE, { force: true });
}
