/**
 * Practice problems for the real-backend E2E suite: the five seeded problems as they are stored, plus three problems
 * that exist only here, so tests can reach verdicts with the fake execution provider (which echoes stdin and never
 * runs code):
 *  - e2e-echo: every expected output equals its input, so an echo is ACCEPTED;
 *  - e2e-hidden: the visible tests echo, the hidden one does not, so an echo fails on the hidden test;
 *  - e2e-legacy: not set up for judging (judgeMode 'none'), like problems created before judging existed.
 */
import { SEEDED_PRACTICE_PROBLEMS } from '../config/practiceProblemTests';

const starter = { c: 'int main(void) { return 0; }\n', cpp: 'int main() { return 0; }\n', java: 'public class Main { public static void main(String[] a) {} }\n', python: 'print()\n' };
const base = { difficulty: 'Easy' as const, category: 'Arrays', tags: ['E2E'], constraints: [], publicationStatus: 'published' as const, starterCode: starter };

export const E2E_PRACTICE_PROBLEMS = [
  ...SEEDED_PRACTICE_PROBLEMS,
  {
    ...base,
    problemId: 'e2e-echo',
    title: 'E2E Echo',
    description: 'Print the input unchanged.\n\nInput: one line.\nOutput: the same line.',
    examples: [{ input: 'hello', output: 'hello' }],
    judgeMode: 'stdio' as const,
    testCases: [
      { input: 'hello\n', expected: 'hello', isHidden: false },
      { input: 'E2E_HIDDEN_ECHO 42\n', expected: 'E2E_HIDDEN_ECHO 42', isHidden: true },
    ],
  },
  {
    ...base,
    problemId: 'e2e-hidden',
    title: 'E2E Hidden Failure',
    description: 'Print the input unchanged (except on one hidden test).\n\nInput: one line.\nOutput: one line.',
    examples: [{ input: 'a', output: 'a' }],
    judgeMode: 'stdio' as const,
    testCases: [
      { input: 'a\n', expected: 'a', isHidden: false },
      { input: 'b\n', expected: 'b', isHidden: false },
      { input: 'E2E_SECRET_INPUT\n', expected: 'E2E_SECRET_EXPECTED', isHidden: true },
    ],
  },
  {
    ...base,
    problemId: 'e2e-legacy',
    title: 'E2E Legacy Problem',
    description: 'A problem whose tests are not program inputs, so it is not judged automatically.',
    examples: [{ input: 'nums = [1]', output: '[0]' }],
    judgeMode: 'none' as const,
    testCases: [{ input: 'nums = [1]', expected: '[0]', isHidden: false }],
  },
];
