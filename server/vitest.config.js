import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.js"],
    exclude: ["__tests__/_dc_probe.test.js"], // Exclude slow probe test
    setupFiles: ["__tests__/setup.js"],
    // All test files share one Mongo test database (dental_os_test) and several
    // clean the same collections (tenants/branches/users/...). Run files
    // serially so parallel workers cannot wipe each other's fixtures.
    fileParallelism: false,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "__tests__/",
        "**/*.test.js",
        "**/test-utils/**",
        "coverage/",
        "scripts/",
        "**/index.js"
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      },
      all: true
    },

    // Test timeout
    testTimeout: 30000,

    // Reporters
    reporters: ["verbose"],

    // NOTE: no globalSetup here. vi.mock() cannot run in a vitest globalSetup
    // (the mocker is not initialized in that context), so any global-setup
    // file that tries it crashes discovery with
    // "Vitest mocker was not initialized in this environment".
    // Per-test mocking lives in each *.test.js / __tests__/setup.js instead.

    // Isolate tests better
    isolate: true
  },
});
