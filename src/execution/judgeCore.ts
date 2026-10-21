/**
 * How a program's output is compared with a test's expected output (shared by the server's judge and the front end's
 * mock API). Differences that a person would not call a different answer are ignored:
 *  - line endings (\r\n and \n),
 *  - spaces and tabs at the end of a line,
 *  - blank lines at the end of the output.
 * Everything else must match exactly, including spaces between values and letter case.
 */
export function normalizeOutput(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

export const outputsMatch = (actual: string, expected: string) => normalizeOutput(actual) === normalizeOutput(expected);

/** a submission's outcome; JUDGING_ERROR means the judge could not finish, never that the program was wrong or right */
export type Verdict = 'ACCEPTED' | 'WRONG_ANSWER' | 'COMPILATION_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED' | 'JUDGING_ERROR';
