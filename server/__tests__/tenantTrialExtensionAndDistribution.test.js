import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Two dashboard-facing behaviours that were silently wrong.
 *
 * 1. "Extend trial" on a tenant that was *already* on trial did nothing at all.
 *    `updateTenant` only recomputed `trialEndsAt` inside
 *    `if (status && status !== tenant.status)`, so re-sending
 *    `status: "trial"` — which is all the button did — was a no-op for exactly
 *    the tenants anyone extends a trial from. `extendTrial` is a separate,
 *    explicit flag that always applies and extends from the later of now and
 *    the current end date, so it can never *shorten* a trial.
 *
 * 2. The dashboard charts aggregated tenants client-side by paging through
 *    `GET /tenants`, which meant O(tenants/limit) sequential requests and a
 *    silent truncation at whatever cap the client imposed. `getTenantDistribution`
 *    counts in the database in one `$facet`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stand-in tenant document; `save` is a no-op we assert against. */
const makeTenant = (props = {}) => {
  const doc = {
    _id: 'tenant-1',
    name: 'Bright Smile Dental',
    email: 'ops@brightsmile.test',
    status: 'active',
    isActive: true,
    trialEndsAt: null,
    subscriptionEndsAt: null,
    save: vi.fn(async function () { return this; }),
    ...props,
  };
  return doc;
};

const tenantFindById = vi.fn();
const tenantAggregate = vi.fn();
const platformFindOne = vi.fn();

vi.mock('../utils/cache.js', () => ({
  cacheDel: vi.fn(async () => {}),
  cacheDelPattern: vi.fn(async () => {}),
  invalidateTenant: vi.fn(async () => {}),
  invalidateTenantRoles: vi.fn(async () => {}),
}));

vi.mock('../modules/platform/platformSetting.model.js', () => ({
  default: {
    findOne: (...a) => platformFindOne(...a),
  },
}));

vi.mock('../modules/site/tenant/tenant.model.js', () => {
  class Tenant {}
  Tenant.findById = (...a) => tenantFindById(...a);
  Tenant.aggregate = (...a) => tenantAggregate(...a);
  return { default: Tenant };
});

const { updateTenant } = await import('../modules/site/tenant/tenant.service.js');
const { tenantUpdateSchema } = await import('../modules/site/tenant/site.validator.js');
const { getTenantDistribution } = await import(
  '../modules/site/analytics/siteAnalytics.service.js'
);

const setTrialDays = (days) =>
  platformFindOne.mockReturnValue({ lean: async () => ({ trialDays: days }) });

describe('extendTrial', () => {
  beforeEach(() => {
    tenantFindById.mockReset();
    tenantAggregate.mockReset();
    platformFindOne.mockReset();
    setTrialDays(14);
  });

  it('applies to a tenant that is already on trial (the previously broken case)', async () => {
    const existing = new Date(Date.now() + 3 * DAY_MS);
    tenantFindById.mockResolvedValue(makeTenant({ status: 'trial', isActive: true, trialEndsAt: existing }));

    const tenant = await updateTenant('tenant-1', { extendTrial: true });

    expect(tenant.trialEndsAt.getTime()).toBe(existing.getTime() + 14 * DAY_MS);
    expect(tenant.save).toHaveBeenCalled();
  });

  it('never shortens a trial that already has more time left', async () => {
    // 60 days remaining but the platform grants 14: extending must add, not cut.
    const existing = new Date(Date.now() + 60 * DAY_MS);
    tenantFindById.mockResolvedValue(makeTenant({ status: 'trial', trialEndsAt: existing }));

    const tenant = await updateTenant('tenant-1', { extendTrial: true });

    expect(tenant.trialEndsAt.getTime()).toBeGreaterThan(existing.getTime());
    expect(tenant.trialEndsAt.getTime()).toBe(existing.getTime() + 14 * DAY_MS);
  });

  it('starts from now when the tenant has no trial end date', async () => {
    tenantFindById.mockResolvedValue(makeTenant({ status: 'active', trialEndsAt: null }));
    const before = Date.now();

    const tenant = await updateTenant('tenant-1', { extendTrial: true });

    expect(tenant.trialEndsAt.getTime()).toBeGreaterThanOrEqual(before + 14 * DAY_MS);
  });

  it('puts the tenant into trial and clears any paid period', async () => {
    // A paid tenant being given a trial must not keep a subscriptionEndsAt,
    // or billing keeps treating it as an active paid clinic.
    tenantFindById.mockResolvedValue(
      makeTenant({ status: 'active', trialEndsAt: null, subscriptionEndsAt: new Date(Date.now() + 30 * DAY_MS) }),
    );

    const tenant = await updateTenant('tenant-1', { extendTrial: true });

    expect(tenant.status).toBe('trial');
    expect(tenant.isActive).toBe(true);
    expect(tenant.subscriptionEndsAt).toBeNull();
  });

  it('honours the platform trialDays setting rather than a hardcoded 14', async () => {
    setTrialDays(30);
    tenantFindById.mockResolvedValue(makeTenant({ status: 'trial', trialEndsAt: null }));
    const before = Date.now();

    const tenant = await updateTenant('tenant-1', { extendTrial: true });

    expect(tenant.trialEndsAt.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
  });

  it('leaves trialEndsAt alone when extendTrial is not requested', async () => {
    const existing = new Date(Date.now() + 5 * DAY_MS);
    tenantFindById.mockResolvedValue(
      makeTenant({ status: 'trial', trialEndsAt: existing }),
    );

    const tenant = await updateTenant('tenant-1', { name: 'Renamed Clinic' });

    expect(tenant.trialEndsAt).toBe(existing);
  });
});

describe('tenantUpdateSchema extendTrial', () => {
  it('accepts the flag', () => {
    const parsed = tenantUpdateSchema.parse({ name: 'Clinic', email: 'a@b.test', extendTrial: true });
    expect(parsed.extendTrial).toBe(true);
  });

  it('rejects a non-boolean flag', () => {
    const res = tenantUpdateSchema.safeParse({ name: 'Clinic', email: 'a@b.test', extendTrial: 'yes' });
    expect(res.success).toBe(false);
  });

  it('rejects attempts to set trialEndsAt directly', () => {
    // The end date stays server-derived; a client must not be able to grant
    // itself an arbitrary trial length.
    const res = tenantUpdateSchema.safeParse({
      name: 'Clinic',
      email: 'a@b.test',
      trialEndsAt: new Date(Date.now() + 9999 * DAY_MS).toISOString(),
    });
    expect(res.success).toBe(false);
  });
});

describe('getTenantDistribution', () => {
  beforeEach(() => {
    tenantAggregate.mockReset();
  });

  it('returns the byPlan/byStatus maps and total in one query', async () => {
    tenantAggregate.mockResolvedValue([
      {
        byPlan: [
          { _id: 'pro_plus', count: 12 },
          { _id: 'pro', count: 8 },
        ],
        byStatus: [
          { _id: 'active', count: 15 },
          { _id: 'trial', count: 5 },
        ],
        total: [{ value: 20 }],
      },
    ]);

    const result = await getTenantDistribution();

    expect(result).toEqual({
      byPlan: { pro_plus: 12, pro: 8 },
      byStatus: { active: 15, trial: 5 },
      total: 20,
    });
    expect(tenantAggregate).toHaveBeenCalledTimes(1);
  });

  it('degrades to an empty result rather than throwing on an empty collection', async () => {
    tenantAggregate.mockResolvedValue([{ byPlan: [], byStatus: [], total: [] }]);

    await expect(getTenantDistribution()).resolves.toEqual({
      byPlan: {},
      byStatus: {},
      total: 0,
    });
  });

  it('survives the aggregate returning no facet document at all', async () => {
    tenantAggregate.mockResolvedValue([]);

    await expect(getTenantDistribution()).resolves.toEqual({
      byPlan: {},
      byStatus: {},
      total: 0,
    });
  });
});
