import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for branch scoping on the single-staff-record routes.
 *
 * The bug: `getUser`, `updateUser`, `deleteUser` and `toggleUserActive` queried
 * the User collection by `_id` alone. Any clinic user holding
 * `users:update`/`users:delete` could therefore read, edit, disable or remove a
 * staff account belonging to another branch — horizontal privilege escalation
 * between branches, and across clinics inside a shared tenant.
 *
 * The fix composes `filterByBranch(req)` into each query, so a record outside
 * the caller's scope matches nothing and the handler 404s.
 *
 * These tests assert the *composed query*, not merely that the helper exists:
 * the bug was precisely a missing `{ ...filterByBranch(req) }` spread, which is
 * easy to reintroduce while every other test keeps passing.
 */

const sendSuccess = vi.fn();
const findOne = vi.fn();

vi.mock('../utils/sendSuccess.js', () => ({
  sendSuccess: (res, payload) => sendSuccess(res, payload),
}));

vi.mock('../modules/users/user.model.js', () => ({
  default: {
    findOne: (...a) => findOne(...a),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

const { getUser, updateUser, deleteUser, toggleUserActive } = await import(
  '../modules/users/user.controller.js'
);

/**
 * A minimal stand-in for a Mongoose Query: chainable and awaitable, so the
 * controller's `.populate()` chain and `await` both work without a live DB.
 */
const query = (result) => {
  const q = {
    populate: vi.fn(() => q),
    lean: vi.fn(() => q),
    select: vi.fn(() => q),
    sort: vi.fn(() => q),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return q;
};

const makeReq = (overrides = {}) => ({
  params: { id: '507f1f77bcf86cd799439011' },
  body: {},
  query: {},
  user: { _id: '507f1f77bcf86cd7994390aa', branch: 'branch-b2', tenant: 'tenant-1' },
  _roleResolved: { isSystemAdmin: false },
  ...overrides,
});

const makeRes = () => {
  const res = { json: vi.fn(), status: vi.fn(), send: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
};

/** Run a controller; returns the forwarded error (if any) instead of throwing. */
const run = async (handler, req) => {
  let err;
  await handler(req, makeRes(), (e) => {
    err = e;
  });
  return err ?? null;
};

/** The filter the controller actually handed to the model. */
const firstFilter = () => {
  expect(findOne).toHaveBeenCalled();
  return findOne.mock.calls[0][0];
};

const HANDLERS = [
  ['getUser', getUser, {}],
  ['updateUser', updateUser, { body: { firstName: 'Hacked' } }],
  ['deleteUser', deleteUser, {}],
  ['toggleUserActive', toggleUserActive, {}],
];

describe('staff single-record routes are branch-scoped', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Post-fix default: the branch-scoped filter matches nothing.
    findOne.mockReturnValue(query(null));
  });

  describe.each(HANDLERS)('%s', (name, handler, overrides) => {
    it('includes the caller branch in the lookup', async () => {
      await run(handler, makeReq(overrides));
      const filter = firstFilter();
      expect(filter.branch).toBeTruthy();
    });

    it('still narrows by the requested id', async () => {
      await run(handler, makeReq(overrides));
      expect(firstFilter()._id).toBeTruthy();
    });

    it('404s instead of returning a record outside the branch', async () => {
      // The branch-scoped filter matches nothing for a cross-branch id.
      const err = await run(handler, makeReq(overrides));
      expect(err).toBeTruthy();
      expect(err.statusCode ?? err.status).toBe(404);
      expect(sendSuccess).not.toHaveBeenCalled();
    });
  });

  it('never queries by _id alone, which is what allowed the escalation', async () => {
    // Guards the specific shape of the original bug: a filter with `_id` but no
    // branch/tenant constraint.
    for (const [name, handler, overrides] of HANDLERS) {
      vi.clearAllMocks();
      // A hit from another branch, as the unscoped query would have returned.
      findOne.mockReturnValue(query({ _id: 'other', toSafeObject: () => ({}) }));
      await run(handler, makeReq(overrides));
      const filter = firstFilter();
      expect(Object.keys(filter), `${name} must constrain by branch`).toContain('branch');
    }
  });

  it('keeps a same-branch record reachable', async () => {
    // The fix must not over-block: a user in the caller's own branch still loads.
    findOne.mockReturnValue(
      query({ _id: '507f1f77bcf86cd799439011', toSafeObject: () => ({ id: '1' }) }),
    );
    const err = await run(getUser, makeReq());
    expect(err).toBeNull();
    expect(sendSuccess).toHaveBeenCalledTimes(1);
  });

  it('falls back to tenant scoping for a system admin with no branch', async () => {
    // A platform/clinic admin has no branch, so the branch constraint is
    // dropped but the tenant constraint must still apply.
    findOne.mockReturnValue(query(null));
    const err = await run(
      getUser,
      makeReq({
        user: { _id: 'u1', branch: null, tenant: 'tenant-1' },
        _roleResolved: { isSystemAdmin: true },
      }),
    );
    const filter = firstFilter();
    expect(filter.tenant).toBeTruthy();
    expect(err?.statusCode ?? err?.status).toBe(404);
  });
});
