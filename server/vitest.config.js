import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.js"],
    setupFiles: ["__tests__/setup.js"],
    // All test files share one Mongo test database (dental_os_test) and several
    // clean the same collections (tenants/branches/users/...). Run files
    // serially so parallel workers cannot wipe each other's fixtures.
    fileParallelism: false,
  },
});
