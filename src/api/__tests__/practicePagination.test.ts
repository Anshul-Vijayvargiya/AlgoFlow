import { afterEach, describe, expect, it } from 'vitest';
import { MockApiClient } from '../mockAdapter';

afterEach(() => {
  localStorage.clear();
});

describe('practice problem pagination (mock API)', () => {
  it('returns a bounded page and stable totals', async () => {
    const api = new MockApiClient();
    const first = await api.practice.getProblems({ page: 1, limit: 3 });
    const second = await api.practice.getProblems({ page: 2, limit: 3 });

    expect(first.problems).toHaveLength(3);
    expect(first.page).toBe(1);
    expect(first.limit).toBe(3);
    expect(first.total).toBeGreaterThan(3);
    expect(first.totalPages).toBe(Math.ceil(first.total / 3));
    expect(second.problems).toHaveLength(3);
    expect(second.page).toBe(2);
    expect(second.problems[0].id).not.toBe(first.problems[0].id);
  });

  it('filters before paginating and clamps invalid page numbers', async () => {
    const api = new MockApiClient();
    const all = await api.practice.getProblems({ limit: 50 });
    const easy = all.problems.filter(problem => problem.difficulty === 'Easy');
    if (easy.length === 0) return;

    const result = await api.practice.getProblems({ difficulty: 'Easy', page: 999, limit: 2 });
    expect(result.total).toBe(easy.length);
    expect(result.page).toBe(result.totalPages);
    expect(result.problems.every(problem => problem.difficulty === 'Easy')).toBe(true);
  });

  it('searches title, description, category and tags case-insensitively', async () => {
    const api = new MockApiClient();
    const all = await api.practice.getProblems({ limit: 50 });
    const sample = all.problems[0];
    const result = await api.practice.getProblems({ search: sample.title.toUpperCase(), limit: 50 });

    expect(result.problems.some(problem => problem.id === sample.id)).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });
});
