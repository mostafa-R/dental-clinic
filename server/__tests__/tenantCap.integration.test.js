/**
 * Integration tests for the maxTenants enforcement added to createTenant
 * (regression for the audit finding that the platform cap was stored in
 * PlatformSetting but never checked):
 *
 *   - createTenant refuses to provision past PlatformSetting.maxTenants (409),
 *   - createTenant seeds the per-tenant `branch_slots:<id>` counter with the
 *     default branch so atomic branch-cap enforcement starts in sync.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../config/redis.js', () => ({ getRedis: vi.fn(() => null) }));
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn(),
}));
vi.mock('../utils/cache.js', () => ({
  cacheDel: vi.fn(), cacheDelPattern: vi.fn(),
  invalidateTenant: vi.fn(), invalidateTenantRoles: vi.fn(),
  getCachedTenant: vi.fn(() => null), cacheTenant: vi.fn(),
  getCachedRole: vi.fn(() => null), cacheRole: vi.fn(),
}));
vi.mock('../socket/index.js', () => ({
  emitToBranch: vi.fn(() => {}), emitToTenant: vi.fn(() => {}),
}));

import { createTenant } from '../modules/site/tenant/tenant.service.js';

describe('maxTenants cap + branch slot seeding', () => {
  const DB = 'mongodb://127.0.0.1:27017/dental_os_tenant_cap_test';
  let Tenant, Branch, Role, User, Subscription, Counter, PlatformSetting;

  beforeAll(async () => {
    await mongoose.connect(DB);
    Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    Branch = (await import('../modules/users/branch.model.js')).default;
    Role = (await import('../modules/users/role.model.js')).default;
    User = (await import('../modules/users/user.model.js')).default;
    Subscription = (await import('../modules/site/tenant/subscription.model.js')).default;
    Counter = (await import('../core/counters.js')).default;
    PlatformSetting = (await import('../modules/platform/platformSetting.model.js')).default;

    await Promise.all([
      Tenant.deleteMany({}), Branch.deleteMany({}), Role.deleteMany({}),
      User.deleteMany({}), Subscription.deleteMany({}), Counter.deleteMany({}),
      PlatformSetting.deleteMany({}),
    ]);

    await PlatformSetting.create({ maxTenants: 2, trialDays: 14 });
  });

  afterAll(async () => {
    await Promise.all([
      Tenant.deleteMany({}), Branch.deleteMany({}), Role.deleteMany({}),
      User.deleteMany({}), Subscription.deleteMany({}), Counter.deleteMany({}),
      PlatformSetting.deleteMany({}),
    ]);
    await mongoose.disconnect();
  });

  async function mkTenant(i) {
    return createTenant({
      name: `Cap Tenant ${i}`,
      email: `cap${i}@cap.test`,
      phone: `+1666${String(i).padStart(5, '0')}`,
      plan: 'starter',
      status: 'trial',
    });
  }

  it('provisions tenants while under maxTenants and seeds each branch slot to 1', async () => {
    const t1 = await mkTenant(1);
    const t2 = await mkTenant(2);

    expect(String(t1._id)).toMatch(/^[a-f0-9]{24}$/i);
    expect(String(t2._id)).toMatch(/^[a-f0-9]{24}$/i);

    // Every new tenant comes with one default branch → its slot counter must
    // start at 1 so branch-cap enforcement counts it.
    const slot = await Counter.findById(`branch_slots:${String(t1._id)}`).lean();
    expect(slot).toBeDefined();
    expect(slot.seq).toBe(1);
    expect(await Branch.countDocuments({ tenant: t1._id })).toBe(1);
  });

  it('refuses to provision over the maxTenants cap (409)', async () => {
    let err = null;
    try {
      await mkTenant(3);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/Maximum number of tenants \(2\)/);
    expect(await Tenant.countDocuments({})).toBe(2);
  });
});