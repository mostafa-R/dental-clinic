import { describe, expect, it, vi } from 'vitest';

const { checkAnyPermission } = await import('../middleware/checkPermission.js');
const { SEARCHABLE_MODULES } = await import('../modules/search/search.service.js');

/**
 * Global search admission control.
 *
 * The route used to be gated on `checkPermission('patients', 'read')`, which
 * made the *whole* endpoint a patients feature. Two failure modes followed:
 *
 *   1. Too strict — a receptionist holding only `appointments:read` was refused
 *      a search whose appointment results the service was perfectly willing to
 *      compute and filter for them.
 *   2. Too loose — anyone holding `patients:read` was let in even if every
 *      other section would come back empty.
 *
 * Per-section filtering was always correct (`can()` guards in the service); only
 * the door was wrong. These tests pin the door: admission = "read on at least
 * one searchable module", and the searchable set is shared with the service so
 * the two cannot drift.
 */

/** Mirrors the route wiring in search.routes.js. */
const canSearchAnything = checkAnyPermission(SEARCHABLE_MODULES.map((m) => [m, 'read']));

const run = async (middleware, { permissions, planModules, isSystemAdmin = false }) => {
  const req = {
    user: { tenant: { _id: 'tenant-1', planModules }, branch: 'branch-1' },
    query: {},
    _roleResolved: { isSystemAdmin, permissionMap: () => permissions },
  };
  const next = vi.fn();
  await middleware(req, {}, next);
  return next;
};

const ALL_PLANNED = [...SEARCHABLE_MODULES];

describe('global search admits anyone who can read at least one searched module', () => {
  it('admits a patients reader', async () => {
    const next = await run(canSearchAnything, {
      permissions: { patients: ['read'] },
      planModules: ALL_PLANNED,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('admits a user who can read only appointments — the regression', async () => {
    // No patients:read anywhere. Under the old gate this was a 403.
    const next = await run(canSearchAnything, {
      permissions: { appointments: ['read'] },
      planModules: ALL_PLANNED,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it.each(SEARCHABLE_MODULES.filter((m) => m !== 'patients'))(
    'admits a read-only holder of %s',
    async (module) => {
      const next = await run(canSearchAnything, {
        permissions: { [module]: ['read'] },
        planModules: ALL_PLANNED,
      });
      expect(next).toHaveBeenCalledWith();
    },
  );

  it('refuses a user who can read nothing searchable', async () => {
    const next = await run(canSearchAnything, {
      permissions: { patients: ['create'], appointments: ['update'] },
      planModules: ALL_PLANNED,
    });
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });

  it('refuses a user with no permissions at all', async () => {
    const next = await run(canSearchAnything, { permissions: {}, planModules: ALL_PLANNED });
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });
});

describe('global search still respects the clinic plan', () => {
  it('refuses when the readable module is not in the plan', async () => {
    // Holding the permission is not enough — the clinic never bought the module.
    const next = await run(canSearchAnything, {
      permissions: { appointments: ['read'] },
      planModules: ['patients'],
    });
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });

  it('admits when *some* readable module is planned even if another is not', async () => {
    const next = await run(canSearchAnything, {
      permissions: { appointments: ['read'], inventory: ['read'] },
      planModules: ['appointments'],
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('lets a system admin through regardless', async () => {
    const next = await run(canSearchAnything, {
      permissions: {},
      planModules: [],
      isSystemAdmin: true,
    });
    expect(next).toHaveBeenCalledWith();
  });
});

describe('searchable module set is the one the service queries', () => {
  it('covers every module the service guards', () => {
    // Guards present in globalSearch's body: patients, appointments, billing,
    // branches, users, roles, inventory, accounting, emr, prescriptions.
    const guarded = [
      'patients', 'appointments', 'billing', 'branches', 'users',
      'roles', 'inventory', 'accounting', 'emr', 'prescriptions',
    ];
    for (const m of guarded) {
      expect(SEARCHABLE_MODULES).toContain(m);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(SEARCHABLE_MODULES).size).toBe(SEARCHABLE_MODULES.length);
  });

  it('requires unauthenticated access to be rejected outright', async () => {
    const next = vi.fn();
    await canSearchAnything({}, {}, next);
    expect(next.mock.calls[0][0]?.statusCode).toBe(401);
  });
});
