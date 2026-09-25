import { describe, expect, it, vi } from 'vitest';

vi.mock('../models/User.js', () => ({ default: { find: vi.fn() } }));

const { checkAnyPermission, checkPermission } = await import('../middleware/checkPermission.js');

/**
 * Build a fake `req` whose role resolves to the given permission map, and run a
 * middleware chain to completion.
 *
 * The plan gate reads `req.user.tenant.planModules` (see `planIncludesModule`),
 * while the role matrix is served from the per-request `req._roleResolved`
 * cache — the two are populated by different layers, so both are faked here.
 */
const run = async (middleware, { permissions, planModules = [], isSystemAdmin = false, noTenant = false }) => {
  const req = {
    user: {
      tenant: noTenant ? null : { _id: 'tenant-1', planModules },
    },
    _roleResolved: {
      isSystemAdmin,
      permissionMap: () => permissions,
    },
  };
  const next = vi.fn();
  await middleware(req, {}, next);
  return next;
};

const DOCTORS = [
  ['users', 'read'],
  ['appointments', 'read'],
  ['appointments', 'create'],
  ['emr', 'read'],
];

describe('GET /users/doctors authorization', () => {
  it('lets a booking-only receptionist through (appointments:create)', async () => {
    const next = await run(checkAnyPermission(DOCTORS), {
      permissions: { appointments: ['create'] },
      planModules: ['appointments'],
    });
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('lets a read-only scheduling user through (appointments:read)', async () => {
    const next = await run(checkAnyPermission(DOCTORS), {
      permissions: { appointments: ['read'] },
      planModules: ['appointments'],
    });
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('lets an EMR-only clinician through (emr:read) - the regression this fixes', async () => {
    const next = await run(checkAnyPermission(DOCTORS), {
      permissions: { emr: ['read'] },
      planModules: ['emr'],
    });
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('lets a user-directory reader through (users:read)', async () => {
    const next = await run(checkAnyPermission(DOCTORS), {
      permissions: { users: ['read'] },
      planModules: ['users'],
    });
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('refuses a role with none of the four permissions', async () => {
    const next = await run(checkAnyPermission(DOCTORS), {
      permissions: { inventory: ['read'] },
      planModules: ['inventory'],
    });
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });

  it('refuses an unauthenticated request', async () => {
    const next = vi.fn();
    await checkAnyPermission(DOCTORS)({ user: null }, {}, next);
    expect(next.mock.calls[0][0]?.statusCode).toBe(401);
  });

  it('refuses when the tenant has no tenant context', async () => {
    const next = await run(checkAnyPermission(DOCTORS), { permissions: {}, noTenant: true });
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });

  it('refuses when the tenant plan includes none of the candidate modules', async () => {
    const next = await run(checkAnyPermission(DOCTORS), {
      permissions: { emr: ['read'] },
      planModules: ['inventory'],
    });
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });

  it('lets a system admin through without any grant', async () => {
    const next = await run(checkAnyPermission(DOCTORS), { permissions: {}, isSystemAdmin: true });
    expect(next.mock.calls[0][0]).toBeUndefined();
  });
});

describe('checkPermission is still strict for a single action', () => {
  it('grants the exact action', async () => {
    const next = await run(checkPermission('appointments', 'read'), {
      permissions: { appointments: ['read'] },
      planModules: ['appointments'],
    });
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('refuses a different action on the same module', async () => {
    const next = await run(checkPermission('appointments', 'create'), {
      permissions: { appointments: ['read'] },
      planModules: ['appointments'],
    });
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });
});
