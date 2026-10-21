/**
 * Hidden test cases for the seeded practice problems. Server-only: they are never sent to the browser (the problem
 * routes strip isHidden test cases) and must never move into src/. Expected outputs are checked by running reference
 * solutions in every language (server/tests/practiceProblems.reference.test.ts).
 */
import { PRACTICE_PROBLEMS } from '../../src/data/practiceProblems';

export const HIDDEN_TESTS: Record<string, { input: string; expected: string }[]> = {
  p1: [
    { input: '2 6\n3 3\n', expected: '0 1' },
    { input: '5 -8\n-1 -2 -3 -4 -5\n', expected: '2 4' },
    { input: '6 0\n0 4 3 0 -9 10\n', expected: '0 3' },
    { input: '4 1000000000\n999999999 1 -5 7\n', expected: '0 1' },
  ],
  p2: [
    { input: '([)]\n', expected: 'false' },
    { input: '{[]}\n', expected: 'true' },
    { input: '(((\n', expected: 'false' },
    { input: ']\n', expected: 'false' },
    { input: '([]{()})\n', expected: 'true' },
  ],
  p3: [
    { input: '0\n1 0\n', expected: '0' },
    { input: '2 -5 10\n3 -6 0 10\n', expected: '-6 -5 0 10 10' },
    { input: '1 5\n4 1 2 3 4\n', expected: '1 2 3 4 5' },
  ],
  p4: [
    { input: '5\n4 3 2 1 4\n', expected: '16' },
    { input: '3\n1 2 1\n', expected: '2' },
    { input: '6\n0 0 0 0 0 0\n', expected: '0' },
    { input: '4\n1 2 4 3\n', expected: '4' },
  ],
  p5: [
    { input: '0\n', expected: '' },
    { input: '4\n1 2 3 4\n', expected: '1\n2 3\n4' },
    { input: '5\n1 null 2 null 3\n', expected: '1\n2\n3' },
    { input: '9\n5 4 8 11 null 13 4 7 2\n', expected: '5\n4 8\n11 13 4\n7 2' },
  ],
};

/** the seeded problems as stored: visible tests first, then the hidden ones; judged on stdin/stdout */
export const SEEDED_PRACTICE_PROBLEMS = PRACTICE_PROBLEMS.map(({ visibleTests, ...p }) => ({
  ...p,
  judgeMode: 'stdio' as const,
  publicationStatus: 'published' as const,
  testCases: [
    ...visibleTests.map(t => ({ ...t, isHidden: false })),
    ...(HIDDEN_TESTS[p.problemId] ?? []).map(t => ({ ...t, isHidden: true })),
  ],
}));
