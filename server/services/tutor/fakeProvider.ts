import { TutorProviderError, type TutorAnswer, type TutorProvider, type TutorRequest } from './types';

/**
 * Automated tests only (AI_PROVIDER=fake; refused in staging/production). It never calls a model: it answers with
 * text that says it is a test answer and repeats what it was given, so tests can check the context the server built.
 * Directives in the question produce each failure: FAKE:UNAVAILABLE, FAKE:TIMEOUT, FAKE:BUSY, FAKE:BLOCKED; FAKE:TRUNCATED
 * marks the answer as cut off.
 */
export class FakeTutorProvider implements TutorProvider {
  readonly name = 'fake' as const;
  readonly model = 'fake-tutor';

  async ask({ system, turns }: TutorRequest): Promise<TutorAnswer> {
    const question = turns[turns.length - 1]?.text ?? '';
    if (question.includes('FAKE:UNAVAILABLE')) throw new TutorProviderError('unavailable', 'fake: unavailable', false);
    if (question.includes('FAKE:TIMEOUT')) throw new TutorProviderError('timeout', 'fake: timeout', true);
    if (question.includes('FAKE:BUSY')) throw new TutorProviderError('busy', 'fake: busy', true);
    if (question.includes('FAKE:BLOCKED')) throw new TutorProviderError('blocked', 'fake: blocked', true);
    const algorithm = /^Algorithm: (.+)$/m.exec(system)?.[1] ?? 'unknown';
    const step = /^Current step: (.+)$/m.exec(system)?.[1] ?? 'unknown';
    return {
      text: `[Test answer from the fake provider] Algorithm: ${algorithm}. Step: ${step}. Turns received: ${turns.length}. Question: ${question.slice(0, 120)}`,
      truncated: question.includes('FAKE:TRUNCATED'),
    };
  }
}
