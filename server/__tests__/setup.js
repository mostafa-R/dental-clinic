// Global test setup.
//
// NOTE: this file is a reconstruction. `vitest.config.js` references
// `__tests__/setup.js`, but that file is not committed, which is why
// `npm test` previously aborted with "No test files found" before running
// anything. It is deliberately minimal so that it cannot mask the fixtures the
// original suite expected.
//
// It does NOT open a database connection: `vitest.config.js` documents that all
// suites share one `dental_os_test` database, but suites that need Mongo should
// establish that connection themselves so a missing mongod produces a clear
// per-suite failure instead of a global one that looks like a broken runner.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-access-secret-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-do-not-use-in-production';
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
