# Practice problem migration runbook

**For:** whoever operates an AlgoFlow database that was created before Practice judging existed.

**What it does:** converts the five seeded practice problems (`p1`–`p5`) from the old LeetCode-style versions to the judged stdin/stdout versions. Until a problem is converted, submissions to it are recorded without a verdict.

**Script:** `server/scripts/migratePracticeProblems.ts`, run as `npm run problems:migrate`.

## What changes, and what does not

| Changes | Never changes |
|---|---|
| `description`, `constraints`, `examples`, `starterCode`, `testCases`, `judgeMode` (`none` → `stdio`), `updatedAt` | `_id`, `problemId` (slug), `title`, `difficulty`, `category`, `tags`, `publicationStatus` |
| | Any problem other than `p1`–`p5` (including copies under other slugs) |
| | The `submissions` collection. Historical attempts keep their status (for example "Recorded (not judged)") and still reference the same slug. |

## When a problem is skipped

A problem is converted only if its **title, statement, constraints, examples, starter code (all four languages) and test cases** still exactly match the original seed. Otherwise it is skipped, so an administrator's edits are never overwritten.

| Report | Meaning |
|---|---|
| `will be converted` / `converted` | Matches the original seed. |
| `SKIPPED: differs from the original seed` | Edited. It is left as is. Convert it through the admin API if wanted. |
| `not in this database` | Missing. It is not created. |
| `already judged (no change)` | Converted earlier. |
| `SKIPPED: changed while the migration ran` | Edited between the read and the write. The edit is kept. Run the dry run again. |

## Guarantees

- **Atomic per problem.** Each problem is one single-document update. There is no multi-document transaction.
- **Safe to interrupt.** A run that stops part-way leaves every problem either fully converted or untouched.
- **Idempotent.** Running it again converts only what is left. Re-running is the recovery for an interrupted run.
- **No lost updates.** Each write is conditional on the problem's `updatedAt` being unchanged since it was read.
- **Backup first.** `--apply` writes the original documents of the problems it will change to `migration-backups/practice-problems-<timestamp>.json` before changing anything, and changes nothing if that file cannot be written. That folder is git-ignored.
- **Verified** against a disposable MongoDB (`server/tests/practiceMigration.integration.test.ts`): originals, edits to each replaced field, key-order differences, a duplicate under another slug, a missing problem, historical submissions, concurrent runs, an edit during the run, an interrupted run, and repeat runs.

## Procedure

### 1. Confirm the target

The script uses the server's `MONGODB_URI` from `.env`, or from the process environment, which takes precedence. Every run prints the host, database name and `NODE_ENV` first. **Stop if they are not the database you intend.**

### 2. Back up

Make a full backup with your database's own tools before applying:
- **Atlas:** take an on-demand snapshot (Cluster → Backup → Take Snapshot Now) and wait until it completes.
- **Self-managed:**
  ```
  mongodump --uri "<MONGODB_URI>" --collection problems --out <backup dir>
  ```
  Also dump `submissions` if you want a point-in-time copy of both.

The script's own JSON backup covers only the documents it changes. It is a convenience, not a replacement for a real backup.

### 3. Dry run

```
npm run problems:migrate
```

It writes nothing. Example output against a database where `p2` was edited and `p5` was deleted:

```
Dry run (no changes): practice problems in <host>/<db> (NODE_ENV=production)
  p1: will be converted to the judged stdin/stdout version
  p2: SKIPPED: differs from the original seed (edited?); convert it by hand through the admin API
  p3: will be converted to the judged stdin/stdout version
  p4: will be converted to the judged stdin/stdout version
  p5: not in this database (not created; seeding fills only an empty database)
Review the plan, back up the database, then run again with --apply.
```

### 4. Review

- Every problem you expect to convert says `will be converted`.
- For each `SKIPPED` problem, decide whether to leave it unjudged or convert it by hand.
- Make sure Practice judging is configured on the server first (`EXECUTION_PROVIDER=judge0`, see `.env.example`). Otherwise converted problems answer "Judging is not available".

### 5. Apply

```
npm run problems:migrate -- --apply
```

Keep the printed backup path.

### 6. Verify

- Run the dry run again. Converted problems now say `already judged (no change)`.
- `GET /api/problems/p1`: the statement includes "Input: … Output: …", `autoJudged` is `true`, and `testCases` lists only the visible tests.
- In the app, open a converted problem and submit its untouched starter. Expect **Wrong Answer** with a visible failing test (this uses one run per test of your quota).
- Old submissions still appear in each problem's history.

## Rollback

Restore the problems collection from the backup taken in step 2:
- Atlas: restore the snapshot.
- Self-managed: `mongorestore --uri "<MONGODB_URI>" --nsInclude <db>.problems --drop <backup dir>`.

To restore only the converted documents, replace each one by `_id` with its entry in the script's JSON backup.

Submissions made after the conversion keep their verdicts. A restored (unconverted) problem records new attempts without a verdict again.
