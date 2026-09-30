import { defineConfig } from "vitest/config";

/**
 * Security-focused test run.
 *
 * The previous script passed ~15 explicit filenames to `vitest run`, e.g.
 * `vitest run csrf.test.js rbac.test.js`. Vitest treats positional arguments as
 * loose filename *filters*: when none of them match a real file it silently
 * falls back to the default include glob and exits 0. That made
 * `npm run test:security` report green while running none of the named suites,
 * which is worse than having no script at all.
 *
 * This config matches on a path *glob* instead. A glob that matches nothing
 * fails the run ("No test files found"), so the script can no longer report a
 * false pass.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      // Globs are case-sensitive, so both cases are listed. The token set is
      // the vocabulary this project actually uses for security suites.
      "__tests__/**/*{auth,Auth,rbac,Rbac,csrf,CSRF,phi,PHI,permission,Permission,security,Security,throttle,Throttle,allowlist,Allowlist,encrypt,Encrypt,rateLimit,RateLimit,tenant,Tenant,branchScope,impersonation,Impersonation,transaction,Transaction,socket,Socket,operatorInjection,grant,Grant}*.test.js",
    ],
    setupFiles: ["__tests__/setup.js"],
    fileParallelism: false,
    testTimeout: 30000,
    reporters: ["verbose"],
  },
});
