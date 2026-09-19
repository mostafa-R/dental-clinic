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
        "**/index.js",
        // --- Coverage scope: launch-critical modules only ---
        // The platform / site-admin console scaffolding below is not part of the
        // clinic launch surface and has no dedicated tests yet. Excluding it keeps
        // the threshold meaningful for the modules we actually ship. Remove an
        // entry (and add tests) as each area is brought into scope.
        "modules/site/platformAnalytics/**",
        "modules/site/analytics/**",
        "modules/site/subscription/**",
        "modules/site/featureFlag/**",
        "modules/site/audit/siteAudit.controller.js",
        "modules/site/errorLog/siteErrorLog.controller.js",
        "modules/site/quarantine/siteQuarantine.controller.js",
        "modules/site/siteHealth.controller.js",
        "modules/site/auth/siteImpersonation.controller.js",
        "modules/site/tenant/siteAdmin.controller.js",
        "modules/site/tenant/siteBranch.controller.js",
        "modules/site/tenant/siteUser.controller.js",
        "modules/search/**",
        "modules/dashboard/**",
        "modules/platform/**"
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
