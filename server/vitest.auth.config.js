import { defineConfig } from 'vitest/config';

// Standalone config for the one authorization test that could be recovered.
// The repository's own `vitest.config.js` points at a `__tests__/` tree that
// is not committed, so `npm test` currently fails with "No test files found".
// Delete this file once the full suite is restored.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.js'],
  },
});
