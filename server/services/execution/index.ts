import { env, localProviderProblem } from '../../config/env';
import { FakeExecutionProvider } from './fakeProvider';
import { Judge0Provider, parseLanguageOverrides } from './judge0Provider';
import { LocalPythonProvider } from './localPythonProvider';
import type { ExecutionProvider } from './types';

let provider: ExecutionProvider | null | undefined;

/** the configured provider, or null when code execution is disabled (EXECUTION_PROVIDER=disabled, the default) */
export function getExecutionProvider(): ExecutionProvider | null {
  if (provider !== undefined) return provider;
  if (env.EXECUTION_PROVIDER === 'judge0') {
    provider = new Judge0Provider({
      apiUrl: env.JUDGE0_API_URL!,
      apiKey: env.JUDGE0_API_KEY,
      auth: env.JUDGE0_AUTH,
      languages: parseLanguageOverrides(env.JUDGE0_LANGUAGES),
    });
  } else if (env.EXECUTION_PROVIDER === 'fake') {
    provider = new FakeExecutionProvider();
  } else if (env.EXECUTION_PROVIDER === 'local') {
    // development only, on a loopback-only server: Python on this machine, see localPythonProvider.ts. The environment
    // check refuses anything else at startup; checked again here so the provider can never exist on an exposed server.
    const problem = localProviderProblem(env.NODE_ENV, env.HOST);
    if (problem) throw new Error(problem);
    provider = new LocalPythonProvider(env.LOCAL_PYTHON_PATH ?? 'python');
  } else {
    provider = null;
  }
  return provider;
}
