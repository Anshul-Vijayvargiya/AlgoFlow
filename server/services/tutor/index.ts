import { env } from '../../config/env';
import { FakeTutorProvider } from './fakeProvider';
import { GeminiProvider } from './geminiProvider';
import type { TutorProvider } from './types';

let provider: TutorProvider | null | undefined;

/**
 * The configured tutor provider, or null when the AI Tutor is disabled. Disabled unless AI_PROVIDER is set
 * explicitly: a GEMINI_API_KEY in the environment alone never enables it.
 */
export function getTutorProvider(): TutorProvider | null {
  if (provider !== undefined) return provider;
  if (env.AI_PROVIDER === 'gemini') {
    // env.ts guarantees both are set when AI_PROVIDER=gemini
    provider = new GeminiProvider({ apiKey: env.GEMINI_API_KEY!, model: env.GEMINI_MODEL! });
  } else if (env.AI_PROVIDER === 'fake') {
    provider = new FakeTutorProvider();
  } else {
    provider = null;
  }
  return provider;
}
