import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

// GET /api/problems: the list the Practice page and its topic learning sets read. Models are mocked (no database).
const m = vi.hoisted(() => ({
  Problem: { find: vi.fn(), findOne: vi.fn(), countDocuments: vi.fn() },
  Submission: { find: vi.fn(), findOne: vi.fn(), create: vi.fn(), distinct: vi.fn() },
}));
vi.mock('../models/Problem', () => ({ Problem: m.Problem }));
vi.mock('../models/Submission', async importOriginal => ({ ...(await importOriginal<object>()), Submission: m.Submission }));
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));

const USER = '507f1f77bcf86cd799439011';

/** the query chain the route builds: find(filter).sort().skip().limit().lean() */
function query(docs: object[]) {
  const q = { sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), lean: vi.fn().mockResolvedValue(docs) };
  q.sort.mockReturnValue(q);
  q.skip.mockReturnValue(q);
  q.limit.mockReturnValue(q);
  return q;
}
const doc = (problemId: string, category: string, difficulty = 'Easy') => ({
  problemId, title: problemId, difficulty, category, tags: [], description: '', testCases: [], judgeMode: 'stdio',
});

let q: ReturnType<typeof query>;
beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitsForTesting();
  q = query([doc('p1', 'Arrays')]);
  m.Problem.find.mockReturnValue(q);
  m.Problem.countDocuments.mockResolvedValue(1);
  m.Submission.distinct.mockResolvedValue([]);
});

describe('GET /api/problems — pagination', () => {
  it('answers the requested page with its metadata', async () => {
    m.Problem.countDocuments.mockResolvedValue(5);
    const res = await request(app).get('/api/problems?page=2&limit=2');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });
    expect(q.skip).toHaveBeenCalledWith(2);
    expect(q.limit).toHaveBeenCalledWith(2);
  });

  it('a page past the end answers the last page (as the mock API does), never an empty page with a wrong number', async () => {
    m.Problem.countDocuments.mockResolvedValue(5);
    const res = await request(app).get('/api/problems?page=9&limit=2');
    expect(res.body).toMatchObject({ page: 3, totalPages: 3, total: 5 });
    expect(q.skip).toHaveBeenCalledWith(4);
  });

  it('no matching problems: page 1 of 1, nothing skipped', async () => {
    m.Problem.countDocuments.mockResolvedValue(0);
    q = query([]);
    m.Problem.find.mockReturnValue(q);
    const res = await request(app).get('/api/problems?page=4&limit=12');
    expect(res.body).toMatchObject({ problems: [], page: 1, totalPages: 1, total: 0 });
    expect(q.skip).toHaveBeenCalledWith(0);
  });

  it('invalid or oversized paging values fall back to the limits (1–50 per page, page ≥ 1)', async () => {
    m.Problem.countDocuments.mockResolvedValue(120);
    const res = await request(app).get('/api/problems?page=-3&limit=500');
    expect(res.body).toMatchObject({ page: 1, limit: 50, totalPages: 3 });
  });
});

describe('GET /api/problems — topic, difficulty and search filters', () => {
  it('combines the topic (category), difficulty and search filters; only published problems', async () => {
    await request(app).get('/api/problems?category=Arrays&difficulty=Easy&search=sum');
    const filter = m.Problem.find.mock.calls[0][0];
    expect(filter).toMatchObject({ publicationStatus: 'published', category: 'Arrays', difficulty: 'Easy' });
    // the same fields the mock API searches: title, description, category and tags
    expect(filter.$or.map((c: object) => Object.keys(c)[0])).toEqual(['title', 'description', 'category', 'tags']);
    expect(m.Problem.countDocuments).toHaveBeenCalledWith(filter);
  });

  it('"All" means no topic or difficulty filter', async () => {
    await request(app).get('/api/problems?category=All&difficulty=All');
    const filter = m.Problem.find.mock.calls[0][0];
    expect(filter).not.toHaveProperty('category');
    expect(filter).not.toHaveProperty('difficulty');
  });

  it('search text is matched literally (regex characters are escaped)', async () => {
    await request(app).get(`/api/problems?search=${encodeURIComponent('a+b (c)')}`);
    const filter = m.Problem.find.mock.calls[0][0];
    const pattern = new RegExp(filter.$or[0].title.$regex, 'i');
    expect(pattern.test('Problem a+b (c)')).toBe(true);
    // unescaped, "a+b (c)" would also match "aab c"
    expect(pattern.test('aab c')).toBe(false);
  });
});

describe('GET /api/problems — solved status (what topic progress counts)', () => {
  it("signed in: a problem is solved only when the user's submission passed (an accepted verdict)", async () => {
    q = query([doc('p1', 'Arrays'), doc('p4', 'Arrays', 'Medium')]);
    m.Problem.find.mockReturnValue(q);
    m.Problem.countDocuments.mockResolvedValue(2);
    m.Submission.distinct.mockResolvedValue(['p4']);
    const res = await request(app).get('/api/problems').set('Cookie', [`algoflow_token=${tokenFor(USER, 'USER')}`]);
    expect(m.Submission.distinct).toHaveBeenCalledWith('problemId', { userId: USER, passed: true });
    expect(res.body.problems.map((p: { id: string; solved: boolean }) => [p.id, p.solved])).toEqual([['p1', false], ['p4', true]]);
  });

  it('signed out: nothing is solved and no submissions are read', async () => {
    const res = await request(app).get('/api/problems');
    expect(m.Submission.distinct).not.toHaveBeenCalled();
    expect(res.body.problems.every((p: { solved: boolean }) => p.solved === false)).toBe(true);
  });
});
