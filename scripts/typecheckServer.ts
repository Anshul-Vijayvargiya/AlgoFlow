/**
 * Type-check server/ and compare with the known pre-existing errors:  npm run typecheck:server
 *
 * `npm run typecheck` (tsc -b) does not cover server/, and server/ still has pre-existing errors (zod v4 API drift,
 * Express 5 params typing). This command runs `tsc -p tsconfig.server.json` and compares the errors with
 * server/typecheck-baseline.json, matching on file + error code + message (line numbers are ignored, so unrelated
 * edits that shift lines do not count as new errors).
 *
 * - Any error not in the baseline is printed in full and the command fails (exit 1).
 * - Baseline errors are only counted. Baseline entries that no longer occur are reported as fixed.
 * - `--update` rewrites the baseline from the current errors, but only when there are no new errors: the baseline
 *   can shrink as errors are fixed, never silently grow.
 * - `--init` creates the baseline from the current errors, only when no baseline file exists yet.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BASELINE_PATH = 'server/typecheck-baseline.json';

export interface TsError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

export interface BaselineEntry {
  file: string;
  code: string;
  message: string;
  count: number;
}

const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/** Parses `tsc --pretty false` output. Continuation lines of multi-line messages are ignored. */
export function parseTscOutput(output: string): TsError[] {
  return output.split(/\r?\n/).flatMap(line => {
    const m = ERROR_LINE.exec(line);
    if (!m) return [];
    return [{ file: m[1].replace(/\\/g, '/'), line: Number(m[2]), column: Number(m[3]), code: m[4], message: m[5].trim() }];
  });
}

const keyOf = (e: { file: string; code: string; message: string }) => `${e.file}\u0000${e.code}\u0000${e.message}`;

export function toBaseline(errors: TsError[]): BaselineEntry[] {
  const counts = new Map<string, BaselineEntry>();
  for (const e of errors) {
    const entry = counts.get(keyOf(e)) ?? { file: e.file, code: e.code, message: e.message, count: 0 };
    entry.count++;
    counts.set(keyOf(e), entry);
  }
  return [...counts.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

export interface Comparison {
  newErrors: TsError[];
  fixed: BaselineEntry[];
  knownCount: number;
}

/** Multiset comparison: per file/code/message, occurrences beyond the baseline count are new. */
export function compareWithBaseline(errors: TsError[], baseline: BaselineEntry[]): Comparison {
  const allowed = new Map(baseline.map(b => [keyOf(b), b.count]));
  const newErrors: TsError[] = [];
  let knownCount = 0;
  for (const e of errors) {
    const left = allowed.get(keyOf(e)) ?? 0;
    if (left > 0) {
      allowed.set(keyOf(e), left - 1);
      knownCount++;
    } else {
      newErrors.push(e);
    }
  }
  const fixed = baseline
    .map(b => ({ ...b, count: allowed.get(keyOf(b)) ?? 0 }))
    .filter(b => b.count > 0);
  return { newErrors, fixed, knownCount };
}

function runTsc(): { output: string; status: number | null } {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.server.json', '--pretty', 'false'], { encoding: 'utf8' });
  return { output: `${result.stdout ?? ''}${result.stderr ?? ''}`, status: result.status };
}

function main(): number {
  const update = process.argv.includes('--update');
  const init = process.argv.includes('--init');
  const baselineFile = resolve(BASELINE_PATH);
  if (init && existsSync(baselineFile)) {
    console.error(`Refusing --init: ${BASELINE_PATH} already exists (use --update, which can only shrink it).`);
    return 1;
  }
  const { output, status } = runTsc();
  const errors = parseTscOutput(output);
  if (status !== 0 && errors.length === 0) {
    console.error(`tsc failed without reporting type errors:\n${output}`);
    return 2;
  }

  const baseline: BaselineEntry[] = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')).errors : [];
  const { newErrors, fixed, knownCount } = compareWithBaseline(errors, baseline);

  if (newErrors.length > 0 && !init) {
    console.error(`${newErrors.length} NEW server type error(s) (not in ${BASELINE_PATH}):`);
    for (const e of newErrors) console.error(`  ${e.file}(${e.line},${e.column}): error ${e.code}: ${e.message}`);
    if (update) console.error('Refusing --update: fix the new errors first (the baseline may only shrink).');
    return 1;
  }

  if (!init) console.log(`Server type check: 0 new errors; ${knownCount} known pre-existing error(s) in ${BASELINE_PATH}.`);
  const fixedCount = fixed.reduce((n, b) => n + b.count, 0);
  if (fixedCount > 0) {
    console.log(`${fixedCount} baseline error(s) no longer occur${update ? '' : ' (run with --update to shrink the baseline)'}:`);
    for (const b of fixed) console.log(`  ${b.file}: ${b.code} x${b.count}`);
  }
  if (update || init) {
    const content = {
      description:
        'Pre-existing server type errors accepted by `npm run typecheck:server` (scripts/typecheckServer.ts). ' +
        'Matched on file + code + message; may only shrink. Remove entries by fixing the errors, then run with --update.',
      total: errors.length,
      errors: toBaseline(errors),
    };
    writeFileSync(baselineFile, `${JSON.stringify(content, null, 2)}\n`);
    console.log(`Baseline written: ${errors.length} error(s).`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
