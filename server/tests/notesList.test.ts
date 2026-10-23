import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

// GET /api/notes (pagination, search, tags) and GET /api/notes/tags, with the Note model scripted.
const { Note, query } = vi.hoisted(() => {
  const query = { sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), rows: [] as object[] };
  query.sort.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockImplementation(async () => query.rows);
  return { query, Note: { find: vi.fn((_filter: Record<string, unknown>) => query), countDocuments: vi.fn(), distinct: vi.fn() } };
});
vi.mock('../models/Note', () => ({ Note }));
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439022';
const list = (qs = '', id = USER) => request(app).get(`/api/notes${qs}`).set('Cookie', [`algoflow_token=${tokenFor(id, 'USER')}`]);

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitsForTesting();
  query.sort.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockImplementation(async () => query.rows);
  query.rows = [];
  Note.countDocuments.mockResolvedValue(0);
});

describe('GET /api/notes — pagination', () => {
  it('pages through all the user\'s notes: skip and limit follow page and limit; totals come from the whole set', async () => {
    Note.countDocuments.mockResolvedValue(45);
    const res = await list('?page=3&limit=20');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 45, page: 3, limit: 20, totalPages: 3 });
    expect(query.skip).toHaveBeenCalledWith(40);
    expect(query.limit).toHaveBeenCalledWith(20);
    // a stable order: equal update times never swap notes between pages
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1, _id: -1 });
  });

  it('defaults to page 1 of 20', async () => {
    await list();
    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(20);
  });

  it('a page past the last one is valid and empty', async () => {
    Note.countDocuments.mockResolvedValue(5);
    const res = await list('?page=9');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ notes: [], total: 5, page: 9, totalPages: 1 });
  });

  it('no notes at all: an empty first page', async () => {
    const res = await list();
    expect(res.body).toEqual({ notes: [], total: 0, page: 1, limit: 20, totalPages: 1 });
  });

  it.each(['?page=0', '?page=-1', '?page=abc', '?page=1.5', '?page=1&page=2', '?limit=0', '?limit=51', '?limit=x', '?page=10001'])(
    'invalid paging %s: 400 with details, nothing queried',
    async qs => {
      const res = await list(qs);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters.');
      expect(res.body.details.length).toBeGreaterThan(0);
      expect(Note.find).not.toHaveBeenCalled();
    }
  );
});

describe('GET /api/notes — search and tags across the whole set', () => {
  it('search is a server-side, case-insensitive, escaped match on title, content and tags of the user\'s notes only', async () => {
    await list('?search=a.b*(c)&page=2');
    const filter = Note.find.mock.calls[0][0];
    expect(filter).toMatchObject({ userId: USER });
    expect(filter.$or).toEqual([
      { title: { $regex: 'a\\.b\\*\\(c\\)', $options: 'i' } },
      { content: { $regex: 'a\\.b\\*\\(c\\)', $options: 'i' } },
      { tags: { $regex: 'a\\.b\\*\\(c\\)', $options: 'i' } },
    ]);
    // the count uses the same filter, so pages and totals describe the search result
    expect(Note.countDocuments).toHaveBeenCalledWith(filter);
  });

  it('a tag filters on the server; "All" means no tag filter', async () => {
    await list('?tag=Graphs');
    expect(Note.find.mock.calls[0][0]).toMatchObject({ userId: USER, tags: 'Graphs' });
    await list('?tag=All');
    expect(Note.find.mock.calls[1][0]).not.toHaveProperty('tags');
  });

  it('an over-long search is refused', async () => {
    expect((await list(`?search=${'x'.repeat(101)}`)).status).toBe(400);
  });
});

describe('GET /api/notes/tags', () => {
  it("every tag the user has used, sorted, from the user's notes only", async () => {
    Note.distinct.mockResolvedValue(['Trees', 'Arrays', '', 'Graphs']);
    const res = await request(app).get('/api/notes/tags').set('Cookie', [`algoflow_token=${tokenFor(OTHER, 'USER')}`]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tags: ['Arrays', 'Graphs', 'Trees'] });
    expect(Note.distinct).toHaveBeenCalledWith('tags', { userId: OTHER });
  });

  it('no notes: no tags', async () => {
    Note.distinct.mockResolvedValue([]);
    const res = await request(app).get('/api/notes/tags').set('Cookie', [`algoflow_token=${tokenFor(USER, 'USER')}`]);
    expect(res.body).toEqual({ tags: [] });
  });
});

describe('authentication', () => {
  it.each(['/api/notes', '/api/notes?page=2', '/api/notes/tags'])('%s requires a signed-in user', async path => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
    expect(Note.find).not.toHaveBeenCalled();
    expect(Note.distinct).not.toHaveBeenCalled();
  });
});
