import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { Problem } from '../models/Problem';
import { Submission } from '../models/Submission';
import { LEGACY_SEEDED_PROBLEMS } from '../config/legacyPracticeProblems';
import { SEEDED_PRACTICE_PROBLEMS } from '../config/practiceProblemTests';
import { fingerprint, migratePracticeProblems } from '../scripts/migratePracticeProblems';

/**
 * The practice-problem migration against a real MongoDB. Skipped unless MONGODB_TEST_URI is set (a local *_test
 * database, which the suite drops), e.g.
 *   mongod --dbpath <empty temp dir> --port 27999 --bind_ip 127.0.0.1
 *   MONGODB_TEST_URI=mongodb://127.0.0.1:27999/algoflow_test npx vitest run server/tests/practiceMigration.integration.test.ts
 */
const TEST_URI = process.env.MONGODB_TEST_URI;
const IDS = ['p1', 'p2', 'p3', 'p4', 'p5'];
const actions = (steps: { problemId: string; action: string }[]) => Object.fromEntries(steps.map(s => [s.problemId, s.action]));

describe.skipIf(!TEST_URI)('practice problem migration (real MongoDB)', () => {
  let backupDir: string;
  const run = (apply: boolean, extra: object = {}) => migratePracticeProblems({ apply, backupDir, ...extra });

  beforeAll(async () => {
    const { hostname, pathname } = new URL(TEST_URI!);
    if (!['127.0.0.1', 'localhost'].includes(hostname) || !/^\/\w+_test$/.test(pathname)) throw new Error('MONGODB_TEST_URI must be a local *_test database.');
    await mongoose.connect(TEST_URI!);
    await Problem.init();
  });
  beforeEach(async () => {
    await Problem.deleteMany({});
    await Submission.deleteMany({});
    await Problem.insertMany(LEGACY_SEEDED_PROBLEMS);
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoflow-migration-'));
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('dry run: plans the conversion, writes nothing and makes no backup', async () => {
    const before = await Problem.find().lean();
    expect(actions(await run(false))).toEqual(Object.fromEntries(IDS.map(id => [id, 'convert'])));
    expect(await Problem.find().lean()).toEqual(before);
    expect(fs.readdirSync(backupDir)).toEqual([]);
  });

  it('apply: backs up the originals, converts them, and keeps ids, slugs, publication and every submission', async () => {
    const userId = new mongoose.Types.ObjectId();
    await Submission.insertMany([
      { userId, problemId: 'p1', language: 'cpp', code: 'class Solution {}', status: 'SUBMITTED', passed: false, message: 'legacy attempt' },
      { userId, problemId: 'p5', language: 'python', code: 'def levelOrder(): pass', status: 'PENDING', passed: false },
    ]);
    const submissionsBefore = await Submission.find().sort({ problemId: 1 }).lean();
    const before = await Problem.find().sort({ problemId: 1 }).lean();

    const steps = await run(true);
    expect(actions(steps)).toEqual(Object.fromEntries(IDS.map(id => [id, 'converted'])));

    // the backup holds exactly the original documents
    const backup = JSON.parse(fs.readFileSync(steps.backupFile!, 'utf8'));
    expect(backup.map((d: { problemId: string }) => d.problemId).sort()).toEqual(IDS);
    expect(backup.every((d: { judgeMode?: string }) => d.judgeMode !== 'stdio')).toBe(true);

    const after = await Problem.find().sort({ problemId: 1 }).lean();
    for (const [i, doc] of after.entries()) {
      const target = SEEDED_PRACTICE_PROBLEMS.find(p => p.problemId === doc.problemId)!;
      expect(doc._id).toEqual(before[i]._id);
      expect(doc).toMatchObject({
        problemId: before[i].problemId, title: before[i].title, difficulty: before[i].difficulty, category: before[i].category,
        tags: before[i].tags, publicationStatus: before[i].publicationStatus, judgeMode: 'stdio', description: target.description,
      });
      expect(fingerprint(doc)).toBe(fingerprint(target));
    }
    // submissions are untouched and still point at existing problems
    expect(await Submission.find().sort({ problemId: 1 }).lean()).toEqual(submissionsBefore);
    for (const s of submissionsBefore) expect(await Problem.countDocuments({ problemId: s.problemId })).toBe(1);
  });

  it('idempotent: a second run changes nothing and makes no backup', async () => {
    await run(true);
    const snapshot = await Problem.find().lean();
    const second = await run(true);
    expect(actions(second)).toEqual(Object.fromEntries(IDS.map(id => [id, 'already_converted'])));
    expect(second.backupFile).toBeUndefined();
    expect(await Problem.find().lean()).toEqual(snapshot);
  });

  it('two runs at the same time convert each problem once and agree with a single run', async () => {
    const [a, b] = await Promise.all([run(true), run(true)]);
    for (const id of IDS) {
      expect([actions(a)[id], actions(b)[id]].filter(x => x === 'converted').length, id).toBeLessThanOrEqual(1);
    }
    for (const doc of await Problem.find().lean()) expect(fingerprint(doc), doc.problemId).toBe(fingerprint(SEEDED_PRACTICE_PROBLEMS.find(p => p.problemId === doc.problemId)!));
  });

  it.each([
    ['the statement', { description: 'Edited by an admin.' }],
    ['only the examples', { examples: [{ input: 'nums = [1,1], target = 2', output: '[0,1]' }] }],
    ['only the constraints', { constraints: ['n <= 10'] }],
    ['only one test case', { 'testCases.0.expected': '[1,0]' }],
    ['only one starter program', { 'starterCode.java': '// my Java' }],
  ])('an edit to %s: the problem is skipped and left exactly as it is', async (_label, change) => {
    await Problem.updateOne({ problemId: 'p2' }, { $set: change });
    const edited = await Problem.findOne({ problemId: 'p2' }).lean();
    const steps = await run(true);
    expect(actions(steps).p2).toBe('modified');
    expect(await Problem.findOne({ problemId: 'p2' }).lean()).toEqual(edited);
    expect(actions(steps).p1).toBe('converted');
  });

  it('stored key order and sub-document ids do not make an unedited problem look edited', async () => {
    const p3 = LEGACY_SEEDED_PROBLEMS.find(p => p.problemId === 'p3')!;
    await Problem.deleteOne({ problemId: 'p3' });
    // the same content written with the starter languages in another order
    await Problem.collection.insertOne({ ...p3, starterCode: { python: p3.starterCode.python, java: p3.starterCode.java, c: p3.starterCode.c, cpp: p3.starterCode.cpp }, judgeMode: 'none', createdAt: new Date(), updatedAt: new Date() });
    expect(actions(await run(false)).p3).toBe('convert');
  });

  it('a duplicate under another slug is never touched; a missing problem is not created', async () => {
    const p4 = LEGACY_SEEDED_PROBLEMS.find(p => p.problemId === 'p4')!;
    await Problem.create({ ...p4, problemId: 'p4-copy' });
    await Problem.deleteOne({ problemId: 'p5' });
    const copyBefore = await Problem.findOne({ problemId: 'p4-copy' }).lean();
    const steps = await run(true);
    expect(actions(steps)).toMatchObject({ p4: 'converted', p5: 'missing' });
    expect(steps.map(s => s.problemId)).not.toContain('p4-copy');
    expect(await Problem.findOne({ problemId: 'p4-copy' }).lean()).toEqual(copyBefore);
    expect(await Problem.countDocuments({ problemId: 'p5' })).toBe(0);
  });

  it('an edit made while the migration runs is kept, and reported', async () => {
    const steps = await run(true, {
      beforeWrite: async (problemId: string) => {
        if (problemId === 'p3') await Problem.updateOne({ problemId: 'p3' }, { $set: { description: 'Edited during the migration.' } });
      },
    });
    expect(actions(steps)).toMatchObject({ p1: 'converted', p3: 'changed_during_migration', p5: 'converted' });
    expect(await Problem.findOne({ problemId: 'p3' }).lean()).toMatchObject({ description: 'Edited during the migration.', judgeMode: 'none' });
  });

  it('a run interrupted part-way leaves problems either fully converted or untouched, and a rerun finishes', async () => {
    await expect(run(true, {
      beforeWrite: async (problemId: string) => {
        if (problemId === 'p3') throw new Error('connection lost');
      },
    })).rejects.toThrow('connection lost');
    const mid = Object.fromEntries((await Problem.find().lean()).map(d => [d.problemId, d.judgeMode]));
    expect(mid).toEqual({ p1: 'stdio', p2: 'stdio', p3: 'none', p4: 'none', p5: 'none' });
    expect(actions(await run(true))).toEqual({ p1: 'already_converted', p2: 'already_converted', p3: 'converted', p4: 'converted', p5: 'converted' });
  });
});
