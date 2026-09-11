/**
 * Cross-Tenant Isolation Tests
 *
 * The core principle: a user from Tenant A must NEVER reach Tenant B's data —
 * even if they know the id. The tests below exercise the REAL stack end to end:
 *   - tenantRouter (subdomain → tenant context, req.isClinicRoute)
 *   - protect (middleware/auth.js) including its cross-tenant gate
 *   - branchController listBranches/updateBranch tenant scoping
 *
 * Cross-tenant resource ids return 404 (not 403) to prevent ID enumeration.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { signAccessToken, ACCESS_COOKIE } from '../utils/jwt.js';

// Mock Redis before importing anything that uses it (rate limits fall back to
// in-memory in non-production; tenant cache lookups no-op without Redis).
vi.mock('../config/redis.js', () => ({
  getRedis: vi.fn(() => null),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

// Mock cache so tenant/role lookups always hit the DB (real, fresh state).
vi.mock('../utils/cache.js', () => ({
  getCachedTenant: vi.fn(() => null),
  cacheTenant: vi.fn(),
  invalidateTenant: vi.fn(),
  invalidateTenantRoles: vi.fn(),
  getCachedRole: vi.fn(() => null),
  cacheRole: vi.fn(),
  invalidateRole: vi.fn(),
}));

describe('Cross-Tenant Isolation', () => {
  let app;
  let tenantAId;
  let tenantBId;
  let branchAId;
  let branchBId;
  let userA;
  let userB;

  beforeAll(async () => {
    // Connect to test database
    const testDbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(testDbUri);
    }

    // Import models after connection
    const Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    const Branch = (await import('../modules/users/branch.model.js')).default;
    const User = (await import('../modules/users/user.model.js')).default;
    await import('../modules/users/role.model.js');

    // Clean up test data (serial suite: no other test file runs concurrently)
    await Promise.all([
      Tenant.deleteMany({ slug: { $in: ['clinic-a', 'clinic-b'] } }),
      Branch.deleteMany({}),
      User.deleteMany({ email: { $in: ['user-a@test.com', 'user-b@test.com'] } }),
    ]);

    // Tenant A
    const tenantA = await Tenant.create({
      name: 'Clinic A',
      email: 'clinic-a@test.com',
      slug: 'clinic-a',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10 },
    });
    tenantAId = tenantA._id;

    // Tenant B
    const tenantB = await Tenant.create({
      name: 'Clinic B',
      email: 'clinic-b@test.com',
      slug: 'clinic-b',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10 },
    });
    tenantBId = tenantB._id;

    // Branch A belongs to Tenant A
    const branchA = await Branch.create({
      tenant: tenantAId,
      name: 'Branch A',
      address: '123 Street A',
      phone: '+1111111111',
    });
    branchAId = branchA._id;

    // Branch B belongs to Tenant B
    const branchB = await Branch.create({
      tenant: tenantBId,
      name: 'Branch B',
      address: '456 Street B',
      phone: '+2222222222',
    });
    branchBId = branchB._id;

    // User A belongs to Tenant A / Branch A
    userA = await User.create({
      tenant: tenantAId,
      branch: branchAId,
      name: 'User A',
      email: 'user-a@test.com',
      password: 'Password123!',
      roleId: new mongoose.Types.ObjectId(),
      role: 'doctor',
      tokenVersion: 0,
      isActive: true,
    });

    // User B belongs to Tenant B / Branch B
    userB = await User.create({
      tenant: tenantBId,
      branch: branchBId,
      name: 'User B',
      email: 'user-b@test.com',
      password: 'Password123!',
      roleId: new mongoose.Types.ObjectId(),
      role: 'doctor',
      tokenVersion: 0,
      isActive: true,
    });

    // Build the SAME wiring as the real app for clinic subdomains: tenantRouter
    // resolves the subdomain, then protect authenticates, then controllers.
    const { tenantRouter } = await import('../middleware/tenantRouter.js');
    const { protect } = await import('../middleware/auth.js');
    const { listBranches, updateBranch } = await import('../modules/users/branch.controller.js');
    const { validate } = await import('../middleware/validate.js');
    const { updateBranchSchema } = await import('../modules/users/branch.validator.js');

    app = express();
    app.set('trust proxy', 1);
    app.use(cookieParser());
    app.use(express.json());
    app.use(tenantRouter);

    app.get('/api/branches', protect, listBranches);
    app.patch('/api/branches/:id', protect, validate(updateBranchSchema), updateBranch);

    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Internal server error',
      });
    });
  });

  afterAll(async () => {
    const Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    const Branch = (await import('../modules/users/branch.model.js')).default;
    const User = (await import('../modules/users/user.model.js')).default;
    await Promise.all([
      Tenant.deleteMany({ slug: { $in: ['clinic-a', 'clinic-b'] } }),
      Branch.deleteMany({}),
      User.deleteMany({ email: { $in: ['user-a@test.com', 'user-b@test.com'] } }),
    ]);
    await mongoose.disconnect();
  });

  function tokenCookie(user) {
    const token = signAccessToken({
      _id: user._id,
      tokenVersion: user.tokenVersion,
      roleId: null,
      branch: user.branch,
    });
    return `${ACCESS_COOKIE}=${token}`;
  }

  it('same-tenant subdomain: user A lists only clinic A branches', async () => {
    const res = await request(app)
      .get('/api/branches')
      .set('Host', 'clinic-a.dentalos.app')
      .set('Cookie', tokenCookie(userA));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const branches = res.body.data.branches;
    expect(branches.some((b) => String(b._id) === String(branchAId))).toBe(true);
    expect(branches.some((b) => String(b._id) === String(branchBId))).toBe(false);
    expect(branches.map((b) => b.name)).not.toContain('Branch B');
  });

  it('cross-tenant subdomain: a valid clinic A token is rejected on clinic B (403 gate in protect)', async () => {
    const res = await request(app)
      .get('/api/branches')
      .set('Host', 'clinic-b.dentalos.app')
      .set('Cookie', tokenCookie(userA));

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Cross-tenant access denied');
  });

  it('cross-tenant resource id returns 404 (no ID enumeration)', async () => {
    // User A on clinic A tries to update clinic B's branch by id.
    const res = await request(app)
      .patch(`/api/branches/${branchBId}`)
      .set('Host', 'clinic-a.dentalos.app')
      .set('Cookie', tokenCookie(userA))
      .send({ name: 'Nope' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Branch not found');
  });

  it('same-tenant resource id is mutable', async () => {
    const res = await request(app)
      .patch(`/api/branches/${branchAId}`)
      .set('Host', 'clinic-a.dentalos.app')
      .set('Cookie', tokenCookie(userA))
      .send({ name: 'Branch A Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.branch.name).toBe('Branch A Updated');
  });

  it('a request without a token is rejected by the real protect', async () => {
    const res = await request(app)
      .get('/api/branches')
      .set('Host', 'clinic-a.dentalos.app');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Not authenticated');
  });

  it('non-existant clinic subdomain 404s before reaching any handler', async () => {
    const res = await request(app)
      .get('/api/branches')
      .set('Host', 'no-such-clinic.dentalos.app');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Clinic not found');
  });

  describe('Tenant isolation in queries', () => {
    it('filters users by tenant without cross-contamination', async () => {
      const User = (await import('../modules/users/user.model.js')).default;

      const usersA = await User.find({ tenant: tenantAId, isActive: true }).lean();
      const usersB = await User.find({ tenant: tenantBId, isActive: true }).lean();

      expect(usersA.every((u) => String(u.tenant) === String(tenantAId))).toBe(true);
      expect(usersA.map((u) => u.email)).toContain('user-a@test.com');
      expect(usersA.map((u) => u.email)).not.toContain('user-b@test.com');
      expect(usersB.every((u) => String(u.tenant) === String(tenantBId))).toBe(true);
      expect(usersB.map((u) => u.email)).not.toContain('user-a@test.com');
    });

    it('filters branches by tenant without cross-contamination', async () => {
      const Branch = (await import('../modules/users/branch.model.js')).default;

      // The rename test may have updated branch A's name — read the current
      // value so the assertion is order-independent.
      const currentBranchAName = String((await Branch.findById(branchAId).lean()).name);

      const branchesA = await Branch.find({ tenant: tenantAId }).lean();
      const branchesB = await Branch.find({ tenant: tenantBId }).lean();

      expect(branchesA.every((b) => String(b.tenant) === String(tenantAId))).toBe(true);
      expect(branchesA.map((b) => b.name)).toContain(currentBranchAName);
      expect(branchesA.map((b) => b.name)).not.toContain('Branch B');
      expect(branchesB.every((b) => String(b.tenant) === String(tenantBId))).toBe(true);
      expect(branchesB.map((b) => b.name)).toContain('Branch B');
      expect(branchesB.map((b) => b.name)).not.toContain(currentBranchAName);
    });
  });

  describe('Cross-tenant resource access validation', () => {
    it('validateTenantMatch throws 404 for a mismatched tenant (no enumeration)', async () => {
      const { validateTenantMatch } = await import('../utils/branchScope.js');

      expect(() => {
        validateTenantMatch(tenantAId, tenantBId, { resourceName: 'Branch' });
      }).toThrow('Branch not found');
    });

    it('validateTenantMatch passes when tenants match', async () => {
      const { validateTenantMatch } = await import('../utils/branchScope.js');
      expect(validateTenantMatch(tenantAId, tenantAId, { resourceName: 'Branch' })).toBe(true);
    });
  });

  describe('Branch validation for tenant', () => {
    it('forces a clinic user to their own branch (body branch cannot inject another tenant)', async () => {
      const { resolveBranchForCreate } = await import('../utils/branchScope.js');

      const req = {
        user: {
          _id: userA._id,
          tenant: tenantAId,
          branch: branchAId,
        },
        _roleResolved: { isSystemAdmin: false },
      };

      // Even though the body claims clinic B's branch, the clinic user stays on
      // their own (tenant A) branch.
      const branchId = await resolveBranchForCreate(req, branchBId);
      expect(String(branchId)).toBe(String(branchAId));
    });

    it('rejects a system admin assigning a branch from another tenant', async () => {
      const { resolveBranchForCreate } = await import('../utils/branchScope.js');

      const req = {
        user: {
          _id: userA._id,
          tenant: tenantAId,
          branch: branchAId,
        },
        _roleResolved: { isSystemAdmin: true },
      };

      await expect(resolveBranchForCreate(req, branchBId)).rejects.toThrow(
        'The selected branch does not belong to your clinic',
      );
    });
  });
});

describe('Tenant Isolation Middleware', () => {
  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(testDbUri);
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('rejects invalid tenant ID format', async () => {
    const { requireTenantAccess } = await import('../middleware/siteAuth.js');

    const req = {
      params: { tenantId: 'invalid-id' },
      siteAdmin: { _id: 'admin-id', role: 'super_admin' },
    };
    let nextErr = null;
    const next = (err) => { nextErr = err; };

    await requireTenantAccess(req, {}, next);
    expect(nextErr).toBeInstanceOf(Error);
    expect(nextErr.message).toBe('Invalid tenant ID format');
  });

  it('returns 404 for non-existent tenant', async () => {
    const { requireTenantAccess } = await import('../middleware/siteAuth.js');

    const req = {
      params: { tenantId: new mongoose.Types.ObjectId().toString() },
      siteAdmin: { _id: 'admin-id', role: 'super_admin' },
    };
    let nextErr = null;
    const next = (err) => { nextErr = err; };

    await requireTenantAccess(req, {}, next);
    expect(nextErr).toBeDefined();
    expect(nextErr.statusCode).toBe(404);
    expect(nextErr.message).toBe('Tenant not found');
  });
});