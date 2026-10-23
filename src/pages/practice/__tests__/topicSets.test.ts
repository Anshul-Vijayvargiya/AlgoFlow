import { describe, it, expect } from 'vitest';
import { buildTopicSets, solvedPercent } from '../topicSets';
import { PRACTICE_PROBLEMS } from '../../../data/practiceProblems';
import type { PracticeProblem } from '../../../types/algorithm';

const problem = (id: string, category: string, difficulty: PracticeProblem['difficulty'] = 'Easy', solved = false): PracticeProblem => ({
  id, title: id, difficulty, category, tags: [], solved, description: '', testCases: [],
  starterCode: { c: '', cpp: '', java: '', python: '' },
});

describe('topic learning sets', () => {
  it('come from the real practice problems: one set per category they have, with exact counts', () => {
    const real = PRACTICE_PROBLEMS.map(p => problem(p.problemId, p.category, p.difficulty));
    const sets = buildTopicSets(real);
    expect(sets.map(s => [s.topic, s.total])).toEqual(
      [...new Set(real.map(p => p.category))].sort((a, b) => a.localeCompare(b)).map(c => [c, real.filter(p => p.category === c).length])
    );
    expect(sets.reduce((n, s) => n + s.total, 0)).toBe(real.length);
    // topics no problem has are never offered (Strings is only a tag; Graphs and DP have no problems)
    for (const missing of ['Strings', 'Graphs', 'DP']) expect(sets.map(s => s.topic)).not.toContain(missing);
  });

  it('count difficulties per set and sort sets by name', () => {
    const sets = buildTopicSets([problem('a', 'Trees', 'Medium'), problem('b', 'Arrays'), problem('c', 'Arrays', 'Hard'), problem('d', 'Arrays', 'Easy')]);
    expect(sets.map(s => s.topic)).toEqual(['Arrays', 'Trees']);
    expect(sets[0]).toMatchObject({ total: 3, byDifficulty: { Easy: 2, Medium: 0, Hard: 1 } });
    expect(sets[1]).toMatchObject({ total: 1, byDifficulty: { Easy: 0, Medium: 1, Hard: 0 } });
  });

  it("solved counts only problems the server marks solved (an accepted submission), nothing else", () => {
    const sets = buildTopicSets([problem('a', 'Arrays', 'Easy', true), problem('b', 'Arrays'), problem('c', 'Stack')]);
    expect(sets.find(s => s.topic === 'Arrays')).toMatchObject({ total: 2, solved: 1 });
    expect(sets.find(s => s.topic === 'Stack')).toMatchObject({ total: 1, solved: 0 });
    // a malformed solved value is not counted as solved
    expect(buildTopicSets([{ ...problem('x', 'Arrays'), solved: 'yes' as unknown as boolean }])[0].solved).toBe(0);
  });

  it('problems without a topic are left out; no problems means no sets', () => {
    expect(buildTopicSets([problem('a', ''), problem('b', '   ')])).toEqual([]);
    expect(buildTopicSets([])).toEqual([]);
  });

  it('a set is keyed by the exact category the topic filter sends, so its count is what selecting it shows', () => {
    const sets = buildTopicSets([problem('a', 'Linked List'), problem('b', 'Linked List')]);
    expect(sets).toHaveLength(1);
    expect(sets[0].topic).toBe('Linked List');
  });

  it('solved percent: rounded down, never above 100, 0 for an empty set', () => {
    expect(solvedPercent({ total: 3, solved: 2 })).toBe(66);
    expect(solvedPercent({ total: 3, solved: 3 })).toBe(100);
    expect(solvedPercent({ total: 2, solved: 5 })).toBe(100);
    expect(solvedPercent({ total: 0, solved: 0 })).toBe(0);
    expect(solvedPercent({ total: 1000, solved: 999 })).toBe(99);
  });
});
