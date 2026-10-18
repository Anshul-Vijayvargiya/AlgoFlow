import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // exhaustive trace-invariant tests (all algorithms x many inputs) can exceed 5s on a loaded machine
    testTimeout: 30000,
    environment: 'node',
    include: ['server/tests/**/*.test.ts', 'src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
