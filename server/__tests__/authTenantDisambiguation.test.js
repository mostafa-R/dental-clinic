import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for ambiguous-tenant login.
 *
 * The bug: `authenticateUser` used `findOne({ $or: [...] })`. A clinic platform
 * reuses the same support email across many clinics, so that query matched
 * several accounts and returned an arbitrary one — silently signing the user
 * into the WRONG clinic, or reporting "Invalid email or password" for
 * credentials that were in fact valid (a lockout-loop bait).
 *
 * The fix reads all matches and refuses to guess when they span more than one
 * tenant, returning 409 instead.
 */

const find = vi.fn();

vi.mock('../modules/users/user.model.js', () => ({
  default: {
    find: (...a) => find(...a),
    findById: vi.fn(),
  },
}));

// `assertTenantActive()` runs after the password check and would otherwise open
// a real Mongoose query and hang the test.
vi.mock('../modules/site/tenant/tenant.model.js', () => {
  const q = {
    select: () => q,
    then: (a, b) => Promise.resolve({ isActive: true, status: 'active' }).then(a, b),
  };
  return { default: { findById: () => q } };
});

// Lockout bookkeeping is exercised by loginThrottle's own tests; stub it so
// these cases stay focused on tenant disambiguation and never touch a DB.
vi.mock('../utils/loginThrottle.js', () => ({
  assertNotLocked: vi.fn(async () => undefined),
  recordFailedLogin: vi.fn(async () => undefined),
  resetFailedLogins: vi.fn(async () => undefined),
}));

const { authenticateUser } = await import('../modules/auth/auth.service.js');

/** A matching account in a given tenant. */
const account = (tenant, overrides = {}) => ({
  _id: `u-${tenant}`,
  tenant,
  email: 'reception@clinic.test',
  username: 'reception',
  isActive: true,
  branch: 'b1',
  comparePassword: vi.fn().mockResolvedValue(true),
  ...overrides,
});

/** `User.find().select().populate()` returns a thenable. */
const query = (result) => {
  const q = {
    select: vi.fn(() => q),
    populate: vi.fn(() => q),
    then: (a, b) => Promise.resolve(result).then(a, b),
  };
  return q;
};

const run = async (password = 'correct-horse') =>
  authenticateUser('reception@clinic.test', password);

describe('authenticateUser tenant disambiguation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The regression this file exists for.
  it('refuses to guess when the identifier spans multiple clinics', async () => {
    find.mockReturnValue(query([account('tenant-a'), account('tenant-b')]));

    await expect(run()).rejects.toMatchObject({ statusCode: 409 });
  });

  it('never calls comparePassword on an ambiguous identifier', async () => {
    const a = account('tenant-a');
    const b = account('tenant-b');
    find.mockReturnValue(query([a, b]));

    await expect(run()).rejects.toMatchObject({ statusCode: 409 });

    // Verifying a password against an arbitrary tenant would both leak timing
    // and reset the wrong account's lockout counter.
    expect(a.comparePassword).not.toHaveBeenCalled();
    expect(b.comparePassword).not.toHaveBeenCalled();
  });

  it('accepts duplicate rows that all belong to the same clinic', async () => {
    // A stale soft-deleted row alongside the live one is not ambiguity.
    const live = account('tenant-a');
    find.mockReturnValue(query([live, account('tenant-a', { isActive: false })]));

    await expect(run()).resolves.toBeTruthy();
    expect(live.comparePassword).toHaveBeenCalledWith('correct-horse');
  });

  it('logs in normally for a single match', async () => {
    const user = account('tenant-a');
    find.mockReturnValue(query([user]));

    await expect(run()).resolves.toBe(user);
  });

  it('still reports bad credentials for a genuinely unknown account', async () => {
    find.mockReturnValue(query([]));

    await expect(run()).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a disabled account rather than logging it in', async () => {
    find.mockReturnValue(query([account('tenant-a', { isActive: false })]));

    await expect(run()).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a wrong password and records the failed attempt', async () => {
    const user = account('tenant-a', { comparePassword: vi.fn().mockResolvedValue(false) });
    find.mockReturnValue(query([user]));

    await expect(run('wrong')).rejects.toMatchObject({ statusCode: 401 });
  });
});
