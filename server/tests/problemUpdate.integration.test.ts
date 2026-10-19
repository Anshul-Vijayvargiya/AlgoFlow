import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import { Problem } from '../models/Problem';
import { AdminAuditLog } from '../models/AdminAuditLog';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

/**
 * Admin problem writes against a real MongoDB (the Problem and AdminAuditLog models are not mocked; only the session
 * lookup is stubbed, as in the other route tests). Skipped unless MONGODB_TEST_URI is set, e.g.
 *   mongod --dbpath <empty temp dir> --port 27999 --bind_ip 127.0.0.1
 *   MONGODB_TEST_URI=mongodb://127.0.0.1:27999/algoflow_test npx vitest run server/tests/problemUpdate.integration.test.ts
 * The suite drops its database when it finishes, so it refuses any URI that is not a local database named *_test.
 */
const TEST_URI = process.env.MONGODB_TEST_URI;

function assertDisposableDatabase(uri: string): void {
  const { hostname, pathname } = new URL(uri);
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname) || !/^\/\w+_test$/.test(pathname)) {
    throw new Error(`Refusing to run against ${hostname}${pathname}: MONGODB_TEST_URI must be a local *_test database.`);
  }
}

vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));

describe.skipIf(!TEST_URI)('Admin problem writes (real MongoDB)', () => {
  const adminId = '507f1f77bcf86cd799439001';
  const adminToken = tokenFor(adminId, 'ADMIN');

  const putProblem = (id: string, body: unknown) =>
    request(app)
      .put(`/api/admin/problems/${id}`)
      .set('Cookie', [`algoflow_token=${adminToken}`])
      .send(body as object);

  const seedProblem = (problemId: string, overrides: Record<string, unknown> = {}) =>
    Problem.create({
      problemId,
      title: `Problem ${problemId}`,
      difficulty: 'Medium',
      category: 'Design',
      description: 'A seeded problem used by the integration suite.',
      starterCode: { cpp: '// cpp', c: '// c', java: '// java', python: '# python' },
      testCases: [
        { input: '1', expected: '1' },
        { input: 'secret', expected: 'secret', isHidden: true },
      ],
      publicationStatus: 'draft',
      ...overrides,
    });

  beforeAll(async () => {
    assertDisposableDatabase(TEST_URI!);
    await mongoose.connect(TEST_URI!);
    await mongoose.connection.db!.dropDatabase();
    // Built explicitly after the drop: Problem.init() would return the connect-time index build, which the drop can
    // undo, leaving no unique problemId index for the duplicate-key tests
    await Problem.createIndexes();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    _resetRateLimitsForTesting();
    await Promise.all([Problem.deleteMany({}), AdminAuditLog.deleteMany({})]);
  });

  describe('valid updates', () => {
    it('changes only the sent fields and keeps status and the other starter languages', async () => {
      await seedProblem('lru-cache');

      const res = await putProblem('lru-cache', { title: 'LRU Cache v2', starterCode: { cpp: 'int main() {}' } });

      expect(res.status).toBe(200);
      const stored = await Problem.findOne({ problemId: 'lru-cache' }).lean();
      expect(stored!.title).toBe('LRU Cache v2');
      expect(stored!.starterCode).toEqual({ cpp: 'int main() {}', c: '// c', java: '// java', python: '# python' });
      expect(stored!.publicationStatus).toBe('draft');
      expect(stored!.testCases).toHaveLength(2);

      const audit = await AdminAuditLog.findOne({ action: 'PROBLEM_UPDATE' }).lean();
      expect(audit!.targetId).toBe(stored!._id.toString());
      expect(audit!.details.fields).toEqual(['title', 'starterCode.cpp']);
    });

    it('finds the problem by ObjectId as well as by slug', async () => {
      const seeded = await seedProblem('lru-cache');

      const res = await putProblem(seeded._id.toString(), { difficulty: 'Hard' });

      expect(res.status).toBe(200);
      expect((await Problem.findById(seeded._id).lean())!.difficulty).toBe('Hard');
    });

    it('stores empty test case input and expected output (finding #3)', async () => {
      await seedProblem('print-nothing');

      const res = await putProblem('print-nothing', {
        testCases: [{ input: '', expected: '' }],
        examples: [{ input: '', output: '' }],
      });

      expect(res.status).toBe(200);
      const stored = await Problem.findOne({ problemId: 'print-nothing' }).lean();
      expect(stored!.testCases.map(({ input, expected }) => ({ input, expected }))).toEqual([{ input: '', expected: '' }]);
      expect(stored!.examples.map(({ input, output }) => ({ input, output }))).toEqual([{ input: '', output: '' }]);
    });

    it('creates a problem with empty example and test case values (finding #3, POST path)', async () => {
      const res = await request(app)
        .post('/api/admin/problems')
        .set('Cookie', [`algoflow_token=${adminToken}`])
        .send({
          problemId: 'hello-world',
          title: 'Hello World',
          difficulty: 'Easy',
          category: 'Basics',
          description: 'Print Hello World without reading any input.',
          examples: [{ input: '', output: 'Hello World' }],
          testCases: [{ input: '', expected: 'Hello World' }],
        });

      expect(res.status).toBe(201);
      const stored = await Problem.findOne({ problemId: 'hello-world' }).lean();
      expect(stored!.testCases[0].input).toBe('');
      expect(stored!.examples[0].input).toBe('');
    });
  });

  describe('create (POST) nested validation', () => {
    it.each([
      ['examples', { examples: [{ input: '1', output: '1', note: 'extra' }] }],
      ['testCases', { testCases: [{ input: '1', expected: '1', $where: 'sleep(1000)' }] }],
    ])('rejects unknown fields inside %s with 400 and stores nothing', async (_label, nested) => {
      const res = await request(app)
        .post('/api/admin/problems')
        .set('Cookie', [`algoflow_token=${adminToken}`])
        .send({
          problemId: 'hello-world',
          title: 'Hello World',
          difficulty: 'Easy',
          category: 'Basics',
          description: 'Print Hello World without reading any input.',
          testCases: [{ input: '', expected: 'Hello World' }],
          ...nested,
        });

      expect(res.status).toBe(400);
      expect(await Problem.countDocuments()).toBe(0);
    });
  });

  describe('create (POST) strict top-level and starterCode validation', () => {
    const validProblem = {
      problemId: 'hello-world',
      title: 'Hello World',
      difficulty: 'Easy',
      category: 'Basics',
      description: 'Print Hello World without reading any input.',
      testCases: [{ input: '', expected: 'Hello World' }],
    };
    const postProblem = (body: object) =>
      request(app).post('/api/admin/problems').set('Cookie', [`algoflow_token=${adminToken}`]).send(body);

    it('stores a create that uses every documented field', async () => {
      const res = await postProblem({
        ...validProblem,
        tags: ['basics'],
        constraints: ['No input'],
        examples: [{ input: '', output: 'Hello World', explanation: 'Prints a constant' }],
        starterCode: { python: 'print("Hello World")' },
        publicationStatus: 'draft',
      });

      expect(res.status).toBe(201);
      const stored = await Problem.findOne({ problemId: 'hello-world' }).lean();
      expect(stored!.starterCode).toEqual({ cpp: '', c: '', java: '', python: 'print("Hello World")' });
      expect(stored!.publicationStatus).toBe('draft');
      expect(await AdminAuditLog.countDocuments({ action: 'PROBLEM_CREATE' })).toBe(1);
    });

    it.each([
      ['an unknown top-level field', { solved: true }],
      ['a $ operator key', { $where: 'sleep(1000)' }],
      ['an unsupported starter language', { starterCode: { rust: 'fn main() {}' } }],
      ['a nested object as starter code', { starterCode: { cpp: { $ne: '' } } }],
    ])('rejects %s with 400 and stores nothing', async (_label, extra) => {
      const res = await postProblem({ ...validProblem, ...extra });

      expect(res.status).toBe(400);
      expect(await Problem.countDocuments()).toBe(0);
    });

    it('returns 409 when another create takes the slug after the existence check (real unique index)', async () => {
      await seedProblem('hello-world');
      // Simulate the race: the route's existence check runs before the competing create lands
      vi.spyOn(Problem, 'findOne').mockResolvedValueOnce(null as any);

      const res = await postProblem(validProblem);

      expect(res.status).toBe(409);
      expect(await Problem.countDocuments({ problemId: 'hello-world' })).toBe(1);
      expect(await AdminAuditLog.countDocuments()).toBe(0);
    });
  });

  describe('concurrent deletion', () => {
    it('returns 404 and writes no audit entry when the problem is deleted after the lookup', async () => {
      const seeded = await seedProblem('lru-cache');
      const realFindOne = Problem.findOne.bind(Problem);
      vi.spyOn(Problem, 'findOne').mockImplementationOnce(((...args: Parameters<typeof Problem.findOne>) => {
        const query = realFindOne(...args);
        // The route has found the problem; another admin's delete lands before its update runs
        return query.then(async (found) => {
          await Problem.deleteOne({ _id: seeded._id });
          return found;
        });
      }) as any);

      const res = await putProblem('lru-cache', { title: 'LRU Cache v2' });

      expect(res.status).toBe(404);
      expect(await Problem.countDocuments()).toBe(0);
      expect(await AdminAuditLog.countDocuments()).toBe(0);
    });
  });

  describe('rejected input leaves the stored problem unchanged', () => {
    it.each([
      ['a dotted key that would expose a hidden test case', { 'testCases.1.isHidden': false }],
      ['a $ operator key', { $unset: { testCases: 1 } }],
      ['an operator object as a value', { title: { $set: 'Injected' } }],
      ['a nested unknown field', { testCases: [{ input: '1', expected: '1', $where: 'sleep(1000)' }] }],
      ['an empty test case list', { testCases: [] }],
    ])('rejects %s with 400', async (_label, body) => {
      await seedProblem('lru-cache');
      const before = await Problem.findOne({ problemId: 'lru-cache' }).lean();

      const res = await putProblem('lru-cache', body);

      expect(res.status).toBe(400);
      expect(await Problem.findOne({ problemId: 'lru-cache' }).lean()).toEqual(before);
      expect(await AdminAuditLog.countDocuments()).toBe(0);
    });
  });

  describe('slug protection', () => {
    it('rejects renaming to another existing slug with 400 and changes neither problem', async () => {
      await seedProblem('two-sum');
      await seedProblem('lru-cache');

      const res = await putProblem('lru-cache', { problemId: 'two-sum', title: 'Hijacked' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/problemId cannot be changed/i);
      expect(await Problem.countDocuments({ problemId: 'two-sum' })).toBe(1);
      expect((await Problem.findOne({ problemId: 'lru-cache' }).lean())!.title).toBe('Problem lru-cache');
    });

    it('rejects renaming to a new slug with 400', async () => {
      await seedProblem('lru-cache');

      const res = await putProblem('lru-cache', { problemId: 'lfu-cache', title: 'LFU Cache' });

      expect(res.status).toBe(400);
      expect(await Problem.exists({ problemId: 'lfu-cache' })).toBeNull();
    });

    it('accepts the unchanged slug', async () => {
      await seedProblem('lru-cache');

      const res = await putProblem('lru-cache', { problemId: 'lru-cache', title: 'LRU Cache v2' });

      expect(res.status).toBe(200);
      expect(res.body.problem.problemId).toBe('lru-cache');
    });
  });

  // The Zod schema mirrors every model rule and slugs cannot change, so these database errors cannot be provoked
  // through the route itself. Each test makes MongoDB produce the real error, then has the route's write fail with
  // it, so the HTTP mapping is checked against real error objects rather than hand-built look-alikes.
  describe('database error mapping (real error objects)', () => {
    const failRouteWriteWith = (error: unknown) =>
      vi.spyOn(Problem, 'findOneAndUpdate').mockRejectedValueOnce(error as Error);

    it('maps a real Mongoose ValidationError to 400 with its paths', async () => {
      const seeded = await seedProblem('lru-cache');
      const realError = await Problem.findOneAndUpdate(
        { _id: seeded._id },
        { $set: { difficulty: 'Impossible', title: 'x'.repeat(151) } },
        { runValidators: true }
      ).catch((err) => err);
      expect(realError).toBeInstanceOf(mongoose.Error.ValidationError);
      failRouteWriteWith(realError);

      const res = await putProblem('lru-cache', { title: 'LRU Cache v2' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual(['difficulty', 'title']);
    });

    it('maps a real Mongoose CastError to 400', async () => {
      const seeded = await seedProblem('lru-cache');
      const realError = await Problem.findOneAndUpdate(
        { _id: seeded._id },
        { $set: { testCases: 'not-a-list' } },
        { runValidators: true }
      ).catch((err) => err);
      expect(realError).toBeInstanceOf(mongoose.Error.CastError);
      failRouteWriteWith(realError);

      const res = await putProblem('lru-cache', { title: 'LRU Cache v2' });

      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('testCases');
    });

    it('maps a real duplicate-key error to 409', async () => {
      await seedProblem('lru-cache');
      const realError = await Problem.create({
        problemId: 'lru-cache',
        title: 'Duplicate',
        difficulty: 'Easy',
        category: 'Design',
        description: 'Collides with the seeded problem.',
      }).catch((err) => err);
      expect(realError.code).toBe(11000);
      failRouteWriteWith(realError);

      const res = await putProblem('lru-cache', { title: 'LRU Cache v2' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
    });

    describe('on create (POST)', () => {
      const createBody = {
        problemId: 'hello-world',
        title: 'Hello World',
        difficulty: 'Easy',
        category: 'Basics',
        description: 'Print Hello World without reading any input.',
        testCases: [{ input: '', expected: 'Hello World' }],
      };
      const postProblem = () =>
        request(app).post('/api/admin/problems').set('Cookie', [`algoflow_token=${adminToken}`]).send(createBody);
      const failRouteCreateWith = (error: unknown) =>
        vi.spyOn(Problem, 'create').mockRejectedValueOnce(error as Error);

      it('maps a real Mongoose ValidationError to 400 and stores no problem or audit entry', async () => {
        const realError = await Problem.create({ ...createBody, difficulty: 'Impossible' } as any).catch((err) => err);
        expect(realError).toBeInstanceOf(mongoose.Error.ValidationError);
        failRouteCreateWith(realError);

        const res = await postProblem();

        expect(res.status).toBe(400);
        expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(['difficulty']);
        expect(await Problem.countDocuments()).toBe(0);
        expect(await AdminAuditLog.countDocuments()).toBe(0);
      });

      it('maps a real Mongoose CastError to 400 and stores nothing', async () => {
        // A create reports cast failures inside a ValidationError; the route also handles a top-level CastError
        const realError = await Problem.findOne({ _id: 'not-an-object-id' }).catch((err) => err);
        expect(realError).toBeInstanceOf(mongoose.Error.CastError);
        failRouteCreateWith(realError);

        const res = await postProblem();

        expect(res.status).toBe(400);
        expect(res.body.details[0].field).toBe('_id');
        expect(await AdminAuditLog.countDocuments()).toBe(0);
      });

      it('keeps any other real database error as a masked 500 and stores nothing', async () => {
        const realError = await Problem.collection
          .updateOne({}, { $notAnOperator: { title: 'x' } } as any)
          .catch((err) => err);
        expect(realError.name).toBe('MongoServerError');
        failRouteCreateWith(realError);

        const res = await postProblem();

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Internal Server Error' });
        expect(await AdminAuditLog.countDocuments()).toBe(0);
      });
    });

    it('keeps any other real database error as a masked 500', async () => {
      await seedProblem('lru-cache');
      const realError = await Problem.collection
        .updateOne({ problemId: 'lru-cache' }, { $notAnOperator: { title: 'x' } } as any)
        .catch((err) => err);
      expect(realError.name).toBe('MongoServerError');
      expect(realError.code).not.toBe(11000);
      failRouteWriteWith(realError);

      const res = await putProblem('lru-cache', { title: 'LRU Cache v2' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal Server Error' });
    });
  });
});
