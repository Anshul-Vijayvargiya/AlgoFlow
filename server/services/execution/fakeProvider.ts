import { FAKE_LANGUAGE_LABELS, FakeProviderUnavailableError, fakeExecute } from '../../../src/execution/fakeExecution';
import { ExecutionProviderError, EXECUTION_LANGUAGES, type ExecutionProvider, type ExecutionRequest, type ExecutionResult, type LanguageInfo } from './types';

/** Automated tests only (EXECUTION_PROVIDER=fake; refused in staging/production). Runs nothing: see fakeExecution.ts. */
export class FakeExecutionProvider implements ExecutionProvider {
  readonly name = 'fake' as const;

  languages(): LanguageInfo[] {
    return EXECUTION_LANGUAGES.map(id => ({ id, label: FAKE_LANGUAGE_LABELS[id] }));
  }

  async execute({ source, stdin }: ExecutionRequest): Promise<ExecutionResult> {
    try {
      return fakeExecute(source, stdin);
    } catch (err) {
      if (err instanceof FakeProviderUnavailableError) throw new ExecutionProviderError('unavailable', 'The execution service could not be reached.', false);
      throw err;
    }
  }
}
