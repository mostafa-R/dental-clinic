import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The clinic's name and its clinic_manager's name are different things.
 *
 * A clinic is "Bright Smile Dental"; the person who owns it is "Dr. Sara
 * Ahmed". Provisioning reused the single `name` field for the User document,
 * so every newly created clinic_manager was stamped with the business name —
 * the staff list, the audit trail and any "welcome back, {name}" greeting all
 * showed a clinic where a person belongs.
 *
 * `adminName` now carries the person's name and is optional, falling back to
 * the clinic name so existing callers that only send `name` are unaffected.
 */

const userCreate = vi.fn();
const tenantFindOne = vi.fn();

vi.mock('../core/transaction.js', () => ({
  // Run the callback with a stand-in session; the real one owns a Mongo
  // connection this suite deliberately does not open.
  withTransaction: vi.fn(async (cb) => cb({ __session: true })),
}));

vi.mock('../core/counters.js', () => ({
  default: { updateOne: vi.fn(async () => ({ acknowledged: true })) },
}));

vi.mock('../utils/cache.js', () => ({
  cacheDel: vi.fn(async () => {}),
  cacheDelPattern: vi.fn(async () => {}),
  invalidateTenant: vi.fn(async () => {}),
  invalidateTenantRoles: vi.fn(async () => {}),
}));

vi.mock('../modules/platform/plan.utils.js', () => ({
  resolvePlanDoc: vi.fn(async () => ({ _id: 'plan-1', key: 'pro', price: 100, interval: 'month' })),
  planKeyOf: vi.fn((doc) => doc?.key ?? 'pro'),
}));

vi.mock('../modules/platform/platformSetting.model.js', () => ({
  default: {
    findOne: () => ({ lean: async () => ({ trialDays: 14, maxTenants: 1000 }) }),
  },
}));

vi.mock('../modules/users/branch.model.js', () => ({
  default: {
    create: vi.fn(async (docs) => docs.map((d) => ({ _id: 'branch-1', ...d }))),
  },
}));

vi.mock('../modules/users/user.model.js', () => ({
  default: {
    findOne: vi.fn(async () => null),
    create: (...a) => userCreate(...a),
  },
}));

vi.mock('../modules/users/role.model.js', () => ({
  default: {
    findOne: () => ({ session: () => ({ lean: async () => null }) }),
    // `createTenant` calls `.toObject()` on the created role, so the stand-in
    // must be document-shaped rather than a bare object.
    create: vi.fn(async (docs) =>
      docs.map((d) => ({ _id: 'role-1', ...d, toObject: () => ({ _id: 'role-1', ...d }) })),
    ),
  },
}));

vi.mock('../modules/site/tenant/subscription.model.js', () => ({
  default: { create: vi.fn(async (docs) => docs.map((d) => ({ _id: 'sub-1', ...d }))) },
}));

vi.mock('../modules/site/tenant/tenant.model.js', () => {
  class Tenant {
    constructor(props) {
      Object.assign(this, props);
      this._id = 'tenant-1';
      this.encryption = null;
    }
    updatePlanSettings() {}
    async save() {}
    toObject() {
      const { encryption, ...rest } = this;
      return { ...rest };
    }
  }
  Tenant.findOne = (...a) => tenantFindOne(...a);
  Tenant.countDocuments = async () => 0;
  return { default: Tenant };
});

const { createTenant } = await import('../modules/site/tenant/tenant.service.js');
const { tenantSchema, tenantUpdateSchema } = await import('../modules/site/tenant/site.validator.js');

/** The single User document createTenant produced. */
const createdUser = () => userCreate.mock.calls[0][0][0];

const valid = {
  name: 'Bright Smile Dental',
  email: 'ops@brightsmile.test',
  plan: 'pro',
  adminPassword: 'longenoughpassword',
};

describe('createTenant owner name', () => {
  beforeEach(() => {
    userCreate.mockReset();
    userCreate.mockImplementation(async (docs) => docs.map((d) => ({ _id: 'user-1', ...d })));
    tenantFindOne.mockReset();
    tenantFindOne.mockResolvedValue(null);
  });

  it('names the clinic_manager after the person, not the clinic', async () => {
    await createTenant({ ...valid, adminName: 'Dr. Sara Ahmed' });

    expect(createdUser().name).toBe('Dr. Sara Ahmed');
  });

  it('still names the clinic itself after the clinic name', async () => {
    await createTenant({ ...valid, adminName: 'Dr. Sara Ahmed' });

    expect(tenantFindOne).toHaveBeenCalled();
    // The clinic name and the default branch keep the business name.
    const branchCreate = (await import('../modules/users/branch.model.js')).default.create;
    expect(branchCreate.mock.calls[0][0][0].name).toBe('Bright Smile Dental');
  });

  it('falls back to the clinic name when no adminName is sent', async () => {
    await createTenant({ ...valid });

    expect(createdUser().name).toBe('Bright Smile Dental');
  });

  it('does not overwrite the owner name with the clinic name when both are sent', async () => {
    await createTenant({ ...valid, name: 'Al Noor Clinic', adminName: 'Omar Haddad' });

    expect(createdUser().name).toBe('Omar Haddad');
  });

  it('gives the owner a clinic_manager role, unchanged by the split', async () => {
    await createTenant({ ...valid, adminName: 'Omar Haddad' });

    const roleCreate = (await import('../modules/users/role.model.js')).default.create;
    const role = roleCreate.mock.calls[0][0][0];
    expect(role.key).toBe('clinic_manager');
    expect(role.isSystemAdmin).toBe(false);
  });
});

describe('tenantSchema adminName', () => {
  it('accepts an owner name distinct from the clinic name', () => {
    const parsed = tenantSchema.parse({ ...valid, adminName: 'Dr. Sara Ahmed' });
    expect(parsed.adminName).toBe('Dr. Sara Ahmed');
  });

  it('is optional', () => {
    const parsed = tenantSchema.parse(valid);
    expect('adminName' in parsed).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    const parsed = tenantSchema.parse({ ...valid, adminName: '  Omar Haddad  ' });
    expect(parsed.adminName).toBe('Omar Haddad');
  });

  it('rejects an owner name too short to be a name', () => {
    const res = tenantSchema.safeParse({ ...valid, adminName: 'A' });
    expect(res.success).toBe(false);
  });

  it('rejects a blank owner name rather than silently using the clinic name', () => {
    // An empty string must not become a falsy value that quietly falls back.
    const res = tenantSchema.safeParse({ ...valid, adminName: '   ' });
    expect(res.success).toBe(false);
  });

  it('is not accepted on a tenant update', () => {
    // The owner's name is a user attribute; renaming it belongs to the user
    // endpoint, so a tenant PUT must not be able to rewrite it.
    const res = tenantUpdateSchema.safeParse({ name: 'Renamed', adminName: 'Someone Else' });
    expect(res.success).toBe(false);
  });
});
