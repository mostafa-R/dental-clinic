import { describe, expect, it, vi } from 'vitest';

vi.mock('../models/User.js', () => ({ default: { find: vi.fn() } }));

const { checkPermission, isClinicWideRole } = await import('../middleware/checkPermission.js');
const { DEFAULT_ROLES } = await import('../constants/roles.js');
const { filterByBranch } = await import('../utils/branchScope.js');

/**
 * The clinic manager is plan-bound: its access is the intersection of the
 * permissions granted to the role and the clinic's `planModules`.
 *
 * This suite pins the two properties that make that true:
 *   1. DEFAULT_ROLES.CLINIC_MANAGER is not a system admin, so `checkPermission`
 *      can no longer skip the plan gate for it.
 *   2. Losing `isSystemAdmin` did NOT quietly narrow the manager's branch
 *      visibility — clinic-wide scope is derived from the `branches` grant.
 */
const run = async (middleware, { permissions, planModules = [], isSystemAdmin = false, isTenantWide }) => {
  const req = {
    user: { tenant: { _id: 'tenant-1', planModules }, branch: 'branch-1' },
    query: {},
    _roleResolved: {
      isSystemAdmin,
      ...(isTenantWide === undefined ? {} : { isTenantWide }),
      permissionMap: () => permissions,
    },
  };
  const next = vi.fn();
  await middleware(req, {}, next);
  return next;
};

const CLINIC_MANAGER = DEFAULT_ROLES.CLINIC_MANAGER;
// `permissionMap()` (and `isClinicWideRole`) both take the object form
// { module: actions }, which is exactly what DEFAULT_ROLES.permissions already is.
const granted = (perms) => perms;

describe('clinic_manager is plan-bound, not a bypass', () => {
  it('is not a system admin in the default role definition', () => {
    // This is the whole fix: while this was true, checkPermission returned
    // early and the plan gate below was unreachable for every clinic manager.
    expect(CLINIC_MANAGER.isSystemAdmin).toBe(false);
  });

  it('leaves the platform roles as the only plan bypass', () => {
    expect(DEFAULT_ROLES.SUPER_ADMIN.isSystemAdmin).toBe(true);
    expect(DEFAULT_ROLES.PLATFORM_ADMIN.isSystemAdmin).toBe(true);
  });

  it('denies a module the clinic never paid for, even with the permission granted', async () => {
    const next = await run(checkPermission('inventory', 'read'), {
      permissions: { inventory: ['read', 'create', 'update', 'delete'] },
      planModules: ['patients', 'appointments'],
      isSystemAdmin: CLINIC_MANAGER.isSystemAdmin,
    });
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });

  it('denies an empty plan outright', async () => {
    const next = await run(checkPermission('patients', 'read'), {
      permissions: granted(CLINIC_MANAGER.permissions),
      planModules: [],
      isSystemAdmin: CLINIC_MANAGER.isSystemAdmin,
    });
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });

  it('allows a module that is both granted and in the plan', async () => {
    const next = await run(checkPermission('patients', 'read'), {
      permissions: granted(CLINIC_MANAGER.permissions),
      planModules: ['patients'],
      isSystemAdmin: CLINIC_MANAGER.isSystemAdmin,
    });
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('still refuses an action the role was not granted, on a plan that has the module', async () => {
    const next = await run(checkPermission('roles', 'delete'), {
      permissions: { roles: ['read'] },
      planModules: ['roles'],
      isSystemAdmin: CLINIC_MANAGER.isSystemAdmin,
    });
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });

  it('keeps the plan bypass for a real system admin', async () => {
    const next = await run(checkPermission('inventory', 'read'), {
      permissions: {},
      planModules: [],
      isSystemAdmin: true,
    });
    expect(next.mock.calls[0][0]).toBeUndefined();
  });
});

describe('clinic-wide branch scope survives losing isSystemAdmin', () => {
  const perms = (branches) => ({ branches });

  it('treats a role that manages branches as clinic-wide', () => {
    expect(isClinicWideRole({ isSystemAdmin: false }, perms(['read']))).toBe(true);
    expect(isClinicWideRole({ isSystemAdmin: false }, perms(['update']))).toBe(true);
  });

  it('treats a branch-scoped role as branch-scoped', () => {
    expect(isClinicWideRole({ isSystemAdmin: false }, perms(['create']))).toBe(false);
    expect(isClinicWideRole({ isSystemAdmin: false }, {})).toBe(false);
  });

  it('always treats a system admin as clinic-wide', () => {
    expect(isClinicWideRole({ isSystemAdmin: true }, {})).toBe(true);
  });

  it('scopes the manager to the tenant, not to a single branch', () => {
    // The regression this guards: keying branch scope off isSystemAdmin would
    // have cut a manager supervising several branches down to their own.
    const req = {
      user: { tenant: { _id: 'tenant-1' }, branch: 'branch-1' },
      query: {},
      _roleResolved: {
        isSystemAdmin: false,
        isTenantWide: isClinicWideRole({ isSystemAdmin: false }, CLINIC_MANAGER.permissions),
        permissionMap: () => CLINIC_MANAGER.permissions,
      },
    };
    expect(filterByBranch(req)).toEqual({ tenant: expect.anything() });
    expect(filterByBranch(req)).not.toHaveProperty('branch');
  });

  it('still narrows a clinic-wide manager to one branch on request', () => {
    const req = {
      user: { tenant: { _id: 'tenant-1' }, branch: 'branch-1' },
      query: { branch: 'branch-2' },
      _roleResolved: { isSystemAdmin: false, isTenantWide: true, permissionMap: () => ({}) },
    };
    const filter = filterByBranch(req);
    expect(filter.tenant).toBeDefined();
    expect(filter.branch).toBeDefined();
  });

  it('keeps a staff user on their own branch', () => {
    const req = {
      user: { tenant: { _id: 'tenant-1' }, branch: 'branch-1' },
      query: {},
      _roleResolved: { isSystemAdmin: false, isTenantWide: false, permissionMap: () => ({}) },
    };
    expect(filterByBranch(req)).toEqual({ branch: expect.anything() });
    expect(filterByBranch(req)).not.toHaveProperty('tenant');
  });
});
