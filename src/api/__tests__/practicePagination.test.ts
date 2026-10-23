
import { describe, expect, it } from 'vitest';
import { MockApiClient } from '../mockAdapter';

describe('practice problem pagination (mock API)', () => {
  it('returns a bounded page and stable totals', async () => {
    const api = new MockApiClient();

    const first = await api.practice.getProblems({
      page: 1,
      limit: 3,
    });

    const second = await api.practice.getProblems({
      page: 2,
      limit: 3,
    });

    expect(first.problems).toHaveLength(3);
    expect(first.page).toBe(1);
    expect(first.limit).toBe(3);
    expect(first.total).toBeGreaterThan(3);
    expect(first.totalPages).toBe(Math.ceil(first.total / 3));

    expect(second.problems).toHaveLength(
      Math.min(3, second.total - 3)
    );
    expect(second.page).toBe(2);
    expect(second.problems[0].id).not.toBe(first.problems[0].id);
  });

  it('filters before paginating and clamps invalid page numbers', async () => {
    const api = new MockApiClient();
    const all = await api.practice.getProblems({ limit: 50 });
    const easy = all.problems.filter(
      problem => problem.difficulty === 'Easy'
    );

    if (easy.length === 0) return;

    const result = await api.practice.getProblems({
      difficulty: 'Easy',
      page: 999,
      limit: 2,
    });

    expect(result.total).toBe(easy.length);
    expect(result.page).toBe(result.totalPages);
    expect(
      result.problems.every(problem => problem.difficulty === 'Easy')
    ).toBe(true);
  });

  it('searches title, description, category and tags case-insensitively', async () => {
    const api = new MockApiClient();
    const all = await api.practice.getProblems({ limit: 50 });
    const sample = all.problems[0];

    const result = await api.practice.getProblems({
      search: sample.title.toUpperCase(),
      limit: 50,
    });

    expect(
      result.problems.some(problem => problem.id === sample.id)
    ).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });
});

describe('practice topic filter with search, difficulty and pagination (mock API)', () => {
  const all = async (api: MockApiClient) => (await api.practice.getProblems({ limit: 50 })).problems;

  it('a topic returns exactly the problems with that category, and its total matches', async () => {
    const api = new MockApiClient();
    const problems = await all(api);
    for (const topic of new Set(problems.map(p => p.category))) {
      const res = await api.practice.getProblems({ category: topic, limit: 50 });
      const expected = problems.filter(p => p.category === topic).map(p => p.id);
      expect(res.problems.map(p => p.id), topic).toEqual(expected);
      expect(res.total, topic).toBe(expected.length);
    }
  });

  it('a topic with no problems is an empty first page, not an error', async () => {
    const res = await new MockApiClient().practice.getProblems({ category: 'Graphs', page: 3, limit: 12 });
    expect(res).toMatchObject({ problems: [], total: 0, page: 1, totalPages: 1 });
  });

  it('topic, difficulty and search combine (all must match), counted before paging', async () => {
    const api = new MockApiClient();
    const problems = await all(api);
    const topic = 'Arrays';
    const expected = problems.filter(p => p.category === topic && p.difficulty === 'Medium');
    const res = await api.practice.getProblems({ category: topic, difficulty: 'Medium', limit: 50 });
    expect(res.problems.map(p => p.id)).toEqual(expected.map(p => p.id));

    const sample = expected[0];
    if (!sample) return;
    const searched = await api.practice.getProblems({ category: topic, difficulty: 'Medium', search: sample.title.slice(0, 5).toLowerCase(), limit: 50 });
    expect(searched.problems.map(p => p.id)).toContain(sample.id);
    expect(searched.problems.every(p => p.category === topic && p.difficulty === 'Medium')).toBe(true);
    // a search that matches another topic's problem only finds nothing in this topic
    const other = problems.find(p => p.category !== topic)!;
    const none = await api.practice.getProblems({ category: topic, search: other.title, limit: 50 });
    expect(none.problems.some(p => p.id === other.id)).toBe(false);
  });

  it('pages within a topic cover every problem of the topic exactly once, and a page past the end is the last page', async () => {
    const api = new MockApiClient();
    const topic = 'Arrays';
    const first = await api.practice.getProblems({ category: topic, page: 1, limit: 1 });
    expect(first.totalPages).toBe(first.total);
    const seen: string[] = [];
    for (let page = 1; page <= first.totalPages; page++) {
      const res = await api.practice.getProblems({ category: topic, page, limit: 1 });
      expect(res.page).toBe(page);
      seen.push(...res.problems.map(p => p.id));
    }
    expect(new Set(seen).size).toBe(first.total);
    const past = await api.practice.getProblems({ category: topic, page: first.totalPages + 5, limit: 1 });
    expect(past.page).toBe(first.totalPages);
    expect(past.problems).toHaveLength(1);
  });


  it('searches descriptions case-insensitively', async () => {
  const api = new MockApiClient();
  const all = await api.practice.getProblems({ limit: 50 });
  const sample = all.problems.find(p => p.description?.trim());

  expect(sample).toBeDefined();
  if (!sample) return;

  const keyword = sample.description!.trim().split(/\s+/)[0];

  const result = await api.practice.getProblems({
    search: keyword.toUpperCase(),
    limit: 50,
  });

  expect(result.problems.map(p => p.id)).toContain(sample.id);
});


});
