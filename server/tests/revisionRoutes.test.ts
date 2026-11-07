import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

// /api/revisions with the Revision model scripted: who may call it, what it accepts, and what it asks the database to do.
// server/tests/revisionRoutes.integration.test.ts runs the same routes against a real MongoDB (the unique index, isolation).
const { Revision, query } = vi.hoisted(() => {
  const query = { sort: vi.fn() };
  return {
    query,
    Revision: {
      find: vi.fn((_filter: Record<string, unknown>) => query),
      findOneAndUpdate: vi.fn(),
      deleteOne: vi.fn(),
    },
  };
});
vi.mock('../models/Revision', () => ({ Revision }));
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439022';
const ALGO = 'bubble-sort';
const bearer = (id = USER) => `Bearer ${tokenFor(id, 'USER')}`;
const doc = (over: object = {}) => ({ userId: USER, algorithmId: ALGO, status: 'pending', createdAt: new Date(0), updatedAt: new Date(0), ...over });
const upserted = (updatedExisting: boolean, over: object = {}) => ({ value: doc(over), lastErrorObject: { updatedExisting } });

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitsForTesting();
  query.sort.mockResolvedValue([]);
});

describe('unauthorized access', () => {
  it.each([
    ['get', '/api/revisions'],
    ['put', `/api/revisions/${ALGO}`],
    ['patch', `/api/revisions/${ALGO}`],
    ['delete', `/api/revisions/${ALGO}`],
  ] as const)('%s %s without a session: 401, nothing touched', async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
    expect(Revision.find).not.toHaveBeenCalled();
    expect(Revision.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Revision.deleteOne).not.toHaveBeenCalled();
  });

  it('a forged token: 401', async () => {
    const res = await request(app).get('/api/revisions').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });
});

describe('invalid algorithm ids', () => {
  const BAD = ['no-such-algorithm', '__proto__', '%24ne', 'bubble-sort%00'];
  it.each(BAD)('%s: 400 on every write, nothing touched', async id => {
    const url = `/api/revisions/${id}`;
    for (const res of [
      await request(app).put(url).set('Authorization', bearer()).send({}),
      await request(app).patch(url).set('Authorization', bearer()).send({ status: 'revised' }),
      await request(app).delete(url).set('Authorization', bearer()),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Unknown algorithm.');
    }
    expect(Revision.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Revision.deleteOne).not.toHaveBeenCalled();
  });

  it('an algorithm that is listed but not implemented yet can be marked', async () => {
    Revision.findOneAndUpdate.mockResolvedValue(upserted(false));
    const { ALGORITHM_NAV } = await import('../../src/data/algorithmMetadata');
    const planned = ALGORITHM_NAV.find(a => !a.implemented)!;
    const res = await request(app).put(`/api/revisions/${planned.id}`).set('Authorization', bearer()).send({});
    expect(res.status).toBe(201);
  });
});

describe('GET /api/revisions', () => {
  it('asks only for the session user\'s records, most recently marked first', async () => {
    const res = await request(app).get('/api/revisions').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revisions: [] });
    expect(Revision.find).toHaveBeenCalledWith({ userId: USER });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });

  it('a user id in the query is ignored', async () => {
    await request(app).get(`/api/revisions?userId=${OTHER}`).set('Authorization', bearer());
    expect(Revision.find).toHaveBeenCalledWith({ userId: USER });
  });

  it('never sends the owner id, and leaves out an algorithm the app no longer lists', async () => {
    query.sort.mockResolvedValue([doc({ _id: 'x', reason: 'forgot-the-logic' }), doc({ algorithmId: 'retired-algorithm' })]);
    const res = await request(app).get('/api/revisions').set('Authorization', bearer());
    expect(res.body.revisions).toHaveLength(1);
    expect(res.body.revisions[0]).toMatchObject({ algorithmId: ALGO, status: 'pending', reason: 'forgot-the-logic' });
    expect(res.body.revisions[0]).not.toHaveProperty('userId');
    expect(res.body.revisions[0]).not.toHaveProperty('_id');
  });

  it('a database failure is a 500 without its details', async () => {
    query.sort.mockRejectedValue(new Error('secret connection string'));
    const res = await request(app).get('/api/revisions').set('Authorization', bearer());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});

describe('PUT /api/revisions/:algorithmId', () => {
  const put = (body: object) => request(app).put(`/api/revisions/${ALGO}`).set('Authorization', bearer()).send(body);

  it('marking with no reason: created as pending for the session user (201)', async () => {
    Revision.findOneAndUpdate.mockResolvedValue(upserted(false));
    const res = await put({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ algorithmId: ALGO, status: 'pending' });
    const [filter, update, options] = Revision.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ userId: USER, algorithmId: ALGO });
    expect(update).toEqual({ $setOnInsert: { status: 'pending' } });
    expect(options).toMatchObject({ upsert: true, runValidators: true });
  });

  it('a user id or status in the body cannot choose the owner or change the status', async () => {
    Revision.findOneAndUpdate.mockResolvedValue(upserted(false));
    await put({ userId: OTHER, status: 'revised', reason: 'need-more-practice' });
    const [filter, update] = Revision.findOneAndUpdate.mock.calls[0];
    expect(filter.userId).toBe(USER);
    expect(update).toEqual({ $setOnInsert: { status: 'pending' }, $set: { reason: 'need-more-practice' } });
  });

  it('already on the list: 200, and only the reason is written', async () => {
    Revision.findOneAndUpdate.mockResolvedValue(upserted(true, { status: 'revised', reason: 'forgot-the-logic' }));
    const res = await put({ reason: 'forgot-the-logic' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'revised', reason: 'forgot-the-logic' });
  });

  it('a null reason clears it', async () => {
    Revision.findOneAndUpdate.mockResolvedValue(upserted(true));
    await put({ reason: null });
    expect(Revision.findOneAndUpdate.mock.calls[0][1]).toEqual({ $setOnInsert: { status: 'pending' }, $unset: { reason: 1 } });
  });

  it.each([{ reason: 'because' }, { reason: 7 }, { reason: { $ne: null } }, { reason: '' }])('rejects the reason in %j', async body => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(Revision.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('losing a race for a new record: retried once, and answered from the winner\'s record', async () => {
    Revision.findOneAndUpdate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 })).mockResolvedValueOnce(upserted(true));
    const res = await put({});
    expect(res.status).toBe(200);
    expect(Revision.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('any other database error is not retried', async () => {
    Revision.findOneAndUpdate.mockRejectedValue(new Error('down'));
    const res = await put({});
    expect(res.status).toBe(500);
    expect(Revision.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /api/revisions/:algorithmId', () => {
  const patch = (body: object) => request(app).patch(`/api/revisions/${ALGO}`).set('Authorization', bearer()).send(body);

  it('pending → revised: records when', async () => {
    const at = new Date('2026-11-06T00:00:00Z');
    Revision.findOneAndUpdate.mockResolvedValue(doc({ status: 'revised', revisedAt: at }));
    const res = await patch({ status: 'revised' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'revised', revisedAt: at.toISOString() });
    const [filter, update, options] = Revision.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ userId: USER, algorithmId: ALGO });
    expect(update.$set).toMatchObject({ status: 'revised', revisedAt: expect.any(Date) });
    // a status change never creates a record
    expect(options.upsert).toBeUndefined();
  });

  it('revised → pending: forgets when', async () => {
    Revision.findOneAndUpdate.mockResolvedValue(doc());
    const res = await patch({ status: 'pending' });
    expect(res.status).toBe(200);
    expect(Revision.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { status: 'pending' }, $unset: { revisedAt: 1 } });
  });

  it('not on this user\'s list (another user\'s record is not found either): 404', async () => {
    Revision.findOneAndUpdate.mockResolvedValue(null);
    expect((await patch({ status: 'revised' })).status).toBe(404);
  });

  it.each([{}, { status: 'done' }, { status: null }])('rejects %j', async body => {
    expect((await patch(body)).status).toBe(400);
    expect(Revision.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/revisions/:algorithmId', () => {
  const del = () => request(app).delete(`/api/revisions/${ALGO}`).set('Authorization', bearer());

  it('deletes only the session user\'s record', async () => {
    Revision.deleteOne.mockResolvedValue({ deletedCount: 1 });
    expect((await del()).status).toBe(200);
    expect(Revision.deleteOne).toHaveBeenCalledWith({ userId: USER, algorithmId: ALGO });
  });

  it('nothing to delete: 404', async () => {
    Revision.deleteOne.mockResolvedValue({ deletedCount: 0 });
    expect((await del()).status).toBe(404);
  });
});
