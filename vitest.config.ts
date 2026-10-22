import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // exhaustive trace-invariant tests (all algorithms x many inputs) can exceed 5s on a loaded machine
    testTimeout: 30000,
    environment: 'node',
    include: ['server/tests/**/*.test.ts', 'src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // no real Gemini key and no enabled AI Tutor in any test process, whatever the developer's .env says
    setupFiles: ['server/tests/helpers/noRealAiCredentials.ts'],
  },
});
