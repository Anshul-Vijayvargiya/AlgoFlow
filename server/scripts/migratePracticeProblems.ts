/**
 * Converts the five seeded practice problems in an EXISTING database from the earlier LeetCode-style version to the
 * judged stdin/stdout version (src/data/practiceProblems.ts + server/config/practiceProblemTests.ts). Seeding only
 * fills an empty database, so databases created before judging still hold the old versions.
 * Procedure (backup, dry run, review, apply, verify): docs/practice-problem-migration.md.
 *
 *   npm run problems:migrate             dry run: reports what would change, writes nothing
 *   npm run problems:migrate -- --apply  backs up the problems it will change, then converts them
 *
 * Safety:
 *  - A problem is converted only when every field the conversion replaces (statement, constraints, examples, starter
 *    code, test cases) and its title still equal the original seed, so an edited problem is never overwritten; it is
 *    reported instead. Missing problems are not created; other problems are never read or written.
 *  - Each write is conditional on the document being unchanged since it was read (its updatedAt), so an edit made
 *    while the migration runs is kept and reported.
 *  - Only statement, constraints, examples, starter code, test cases and judgeMode change. The problem's _id, slug,
 *    title, difficulty, category, tags and publication status stay, and submissions are not touched (they reference
 *    the unchanged slug).
 *  - Each problem is one atomic single-document update; there is no multi-document transaction. A run that stops
 *    part-way leaves every problem either fully converted or untouched, and running it again finishes the rest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_SEEDED_PROBLEMS } from '../config/legacyPracticeProblems';
import { SEEDED_PRACTICE_PROBLEMS } from '../config/practiceProblemTests';
import { Problem } from '../models/Problem';

export type MigrationAction = 'convert' | 'converted' | 'already_converted' | 'missing' | 'modified' | 'changed_during_migration';

export interface MigrationStep {
  problemId: string;
  action: MigrationAction;
}

interface ProblemContent {
  title?: string;
  description?: string;
  constraints?: string[];
  examples?: { input: string; output: string; explanation?: string }[];
  starterCode?: Partial<Record<'cpp' | 'c' | 'java' | 'python', string>>;
  testCases?: { input: string; expected: string; isHidden?: boolean }[];
}

/** the fields the conversion replaces (and the title), in a fixed shape: key order and sub-document ids do not matter */
export const fingerprint = (p: ProblemContent) =>
  JSON.stringify({
    title: p.title,
    description: p.description,
    constraints: p.constraints ?? [],
    examples: (p.examples ?? []).map(e => ({ input: e.input, output: e.output, explanation: e.explanation ?? null })),
    starterCode: ['cpp', 'c', 'java', 'python'].map(l => p.starterCode?.[l as 'cpp'] ?? ''),
    testCases: (p.testCases ?? []).map(t => ({ input: t.input, expected: t.expected, isHidden: Boolean(t.isHidden) })),
  });

export interface MigrationOptions {
  apply: boolean;
  /** with apply: where the original documents are written before anything changes */
  backupDir?: string;
  /** tests only: runs between reading a problem and writing it */
  beforeWrite?: (problemId: string) => Promise<void>;
}

/** plans (and with apply, performs) the conversion; the caller owns the database connection */
export async function migratePracticeProblems({ apply, backupDir = 'migration-backups', beforeWrite }: MigrationOptions): Promise<MigrationStep[] & { backupFile?: string }> {
  const plan: { problemId: string; action: MigrationAction; doc?: Awaited<ReturnType<typeof readProblem>> }[] = [];
  for (const next of SEEDED_PRACTICE_PROBLEMS) {
    const legacy = LEGACY_SEEDED_PROBLEMS.find(p => p.problemId === next.problemId);
    const doc = await readProblem(next.problemId);
    let action: MigrationAction;
    if (!doc) action = 'missing';
    else if (doc.judgeMode === 'stdio') action = 'already_converted';
    else if (legacy && fingerprint(doc as ProblemContent) === fingerprint(legacy)) action = 'convert';
    else action = 'modified';
    plan.push({ problemId: next.problemId, action, doc });
  }

  const steps = plan.map(({ problemId, action }) => ({ problemId, action })) as MigrationStep[] & { backupFile?: string };
  const toConvert = plan.filter(p => p.action === 'convert');
  if (!apply || toConvert.length === 0) return steps;

  // the originals first: nothing is written unless the backup is on disk
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `practice-problems-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(toConvert.map(p => p.doc), null, 2), { flag: 'wx' });
  steps.backupFile = backupFile;

  for (const { problemId, doc } of toConvert) {
    const next = SEEDED_PRACTICE_PROBLEMS.find(p => p.problemId === problemId)!;
    await beforeWrite?.(problemId);
    const result = await Problem.updateOne(
      // unchanged since it was read: the same version, still not converted
      { _id: doc!._id, updatedAt: doc!.updatedAt, judgeMode: { $ne: 'stdio' } },
      {
        $set: {
          description: next.description,
          constraints: next.constraints,
          examples: next.examples,
          starterCode: next.starterCode,
          testCases: next.testCases,
          judgeMode: 'stdio',
        },
      }
    );
    steps.find(s => s.problemId === problemId)!.action = result.modifiedCount === 1 ? 'converted' : 'changed_during_migration';
  }
  return steps;
}

const readProblem = (problemId: string) => Problem.findOne({ problemId }).lean();

const DESCRIBE: Record<MigrationAction, string> = {
  convert: 'will be converted to the judged stdin/stdout version',
  converted: 'converted',
  already_converted: 'already judged (no change)',
  missing: 'not in this database (not created; seeding fills only an empty database)',
  modified: 'SKIPPED: differs from the original seed (edited?); convert it by hand through the admin API',
  changed_during_migration: 'SKIPPED: changed while the migration ran (kept as it is); run the dry run again',
};

async function main() {
  const apply = process.argv.includes('--apply');
  const { default: mongoose } = await import('mongoose');
  const { env } = await import('../config/env');
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  const { host, name } = mongoose.connection;
  console.log(`${apply ? 'APPLYING' : 'Dry run (no changes)'}: practice problems in ${host}/${name} (NODE_ENV=${env.NODE_ENV})`);
  const steps = await migratePracticeProblems({ apply });
  for (const s of steps) console.log(`  ${s.problemId}: ${DESCRIBE[s.action]}`);
  if (steps.backupFile) console.log(`Originals of the converted problems: ${steps.backupFile}`);
  if (!apply && steps.some(s => s.action === 'convert')) console.log('Review the plan, back up the database, then run again with --apply.');
  await mongoose.disconnect();
}

// run only as a script (tests import migratePracticeProblems)
if (process.argv[1] && /migratePracticeProblems\.ts$/.test(process.argv[1])) {
  main().catch(err => {
    console.error('❌ Migration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
