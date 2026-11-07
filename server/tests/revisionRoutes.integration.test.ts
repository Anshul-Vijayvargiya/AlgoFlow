import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import { Revision, type IRevision } from '../models/Revision';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

/**
 * /api/revisions against a real MongoDB: what a mocked model cannot show (the unique index under concurrent writes,
 * isolation between users, real timestamps). Only the session lookup is stubbed. Skipped unless MONGODB_TEST_URI is set, e.g.
 *   mongod --dbpath <empty temp dir> --port 27999 --bind_ip 127.0.0.1
 *   MONGODB_TEST_URI=mongodb://127.0.0.1:27999/algoflow_test npx vitest run server/tests/revisionRoutes.integration.test.ts
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

describe.skipIf(!TEST_URI)('Revision List (real MongoDB)', () => {
  const ALICE = '507f1f77bcf86cd799439011';
  const BOB = '507f1f77bcf86cd799439022';
  const as = (user: string) => `Bearer ${tokenFor(user, 'USER')}`;
  const put = (user: string, id: string, body: object = {}) => request(app).put(`/api/revisions/${id}`).set('Authorization', as(user)).send(body);
  const patch = (user: string, id: string, status: string) => request(app).patch(`/api/revisions/${id}`).set('Authorization', as(user)).send({ status });
  const del = (user: string, id: string) => request(app).delete(`/api/revisions/${id}`).set('Authorization', as(user));
  const list = async (user: string) => (await request(app).get('/api/revisions').set('Authorization', as(user))).body.revisions as { algorithmId: string; status: string; reason?: string; revisedAt?: string }[];

  beforeAll(async () => {
    assertDisposableDatabase(TEST_URI!);
    await mongoose.connect(TEST_URI!);
    await Revision.init();
  });
  beforeEach(async () => {
    _resetRateLimitsForTesting();
    await Revision.deleteMany({});
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('marking twice keeps one record: 201, then 200', async () => {
    expect((await put(ALICE, 'bubble-sort')).status).toBe(201);
    expect((await put(ALICE, 'bubble-sort')).status).toBe(200);
    expect(await Revision.countDocuments({})).toBe(1);
  });

  it('20 simultaneous marks of the same algorithm still make one record, and none fails', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => put(ALICE, 'quick-sort')));
    expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
    expect(await Revision.countDocuments({ algorithmId: 'quick-sort' })).toBe(1);
  });

  it('the database itself refuses a second record for the same user and algorithm', async () => {
    // typed as the model declares it (Mongoose casts the string at runtime)
    const record = (user: string) => ({ userId: user as unknown as IRevision['userId'], algorithmId: 'bubble-sort' });
    await Revision.create(record(ALICE));
    await expect(Revision.create(record(ALICE))).rejects.toMatchObject({ code: 11000 });
    await expect(Revision.create(record(BOB))).resolves.toBeTruthy();
  });

  it('the reason: set, changed, kept when left out, cleared with null', async () => {
    await put(ALICE, 'bubble-sort', { reason: 'forgot-the-logic' });
    expect((await list(ALICE))[0].reason).toBe('forgot-the-logic');
    await put(ALICE, 'bubble-sort', { reason: 'interview-preparation' });
    expect((await list(ALICE))[0].reason).toBe('interview-preparation');
    await put(ALICE, 'bubble-sort');
    expect((await list(ALICE))[0].reason).toBe('interview-preparation');
    await put(ALICE, 'bubble-sort', { reason: null });
    expect((await list(ALICE))[0].reason).toBeUndefined();
  });

  it('pending → revised → pending keeps the record, and revisedAt follows the status', async () => {
    await put(ALICE, 'bubble-sort', { reason: 'need-more-practice' });
    const revised = await patch(ALICE, 'bubble-sort', 'revised');
    expect(revised.body.status).toBe('revised');
    expect(Date.parse(revised.body.revisedAt)).not.toBeNaN();
    const pending = await patch(ALICE, 'bubble-sort', 'pending');
    expect(pending.body.status).toBe('pending');
    expect(pending.body.revisedAt).toBeUndefined();
    expect(await list(ALICE)).toMatchObject([{ algorithmId: 'bubble-sort', status: 'pending', reason: 'need-more-practice' }]);
  });

  it('changing the reason of a revised algorithm leaves it revised', async () => {
    await put(ALICE, 'bubble-sort');
    await patch(ALICE, 'bubble-sort', 'revised');
    await put(ALICE, 'bubble-sort', { reason: 'forgot-the-logic' });
    expect(await list(ALICE)).toMatchObject([{ status: 'revised', reason: 'forgot-the-logic' }]);
  });

  it('users are isolated: one cannot see, change or remove another\'s record, and each has their own', async () => {
    await put(ALICE, 'bubble-sort', { reason: 'forgot-the-logic' });
    expect(await list(BOB)).toEqual([]);
    expect((await patch(BOB, 'bubble-sort', 'revised')).status).toBe(404);
    expect((await del(BOB, 'bubble-sort')).status).toBe(404);
    expect(await list(ALICE)).toMatchObject([{ status: 'pending', reason: 'forgot-the-logic' }]);

    expect((await put(BOB, 'bubble-sort', { reason: 'concept-not-clear', userId: ALICE })).status).toBe(201);
    expect((await list(ALICE))[0].reason).toBe('forgot-the-logic');
    expect((await list(BOB))[0].reason).toBe('concept-not-clear');
    expect(await Revision.countDocuments({})).toBe(2);
  });

  it('most recently marked first; a change of status does not reorder the list', async () => {
    await put(ALICE, 'bubble-sort');
    await new Promise(resolve => setTimeout(resolve, 5));
    await put(ALICE, 'quick-sort');
    await patch(ALICE, 'bubble-sort', 'revised');
    expect((await list(ALICE)).map(r => r.algorithmId)).toEqual(['quick-sort', 'bubble-sort']);
  });

  it('remove, then mark again: a fresh pending record', async () => {
    await put(ALICE, 'bubble-sort', { reason: 'forgot-the-logic' });
    await patch(ALICE, 'bubble-sort', 'revised');
    expect((await del(ALICE, 'bubble-sort')).status).toBe(200);
    expect(await list(ALICE)).toEqual([]);
    expect((await del(ALICE, 'bubble-sort')).status).toBe(404);
    expect((await put(ALICE, 'bubble-sort')).status).toBe(201);
    const [fresh] = await list(ALICE);
    expect(fresh.status).toBe('pending');
    expect(fresh.reason).toBeUndefined();
    expect(fresh.revisedAt).toBeUndefined();
  });
});
