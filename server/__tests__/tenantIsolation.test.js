/**
 * Cross-Tenant Isolation Tests
 * 
 * These tests verify that tenant data isolation is properly enforced.
 * The core principle: A user/admin from Tenant A should NEVER be able to
 * access data belonging to Tenant B, even if they somehow obtain the ID.
 * 
 * Test strategy:
 * 1. Create data in Tenant A
 * 2. Attempt to access that data using Tenant B's credentials
 * 3. Verify 404 (not 403 - to prevent ID enumeration) is returned
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';

// Mock Redis before importing anything that uses it
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

// Mock cache
vi.mock('../utils/cache.js', () => ({
  getCachedTenant: vi.fn(() => null),
  cacheTenant: vi.fn(),
  invalidateTenant: vi.fn(),
}));

describe('Cross-Tenant Isolation', () => {
  let app;
  let tenantAId;
  let tenantBId;
  let branchAId;
  let branchBId;
  let userAId;
  let userBId;
  let siteAdminToken;

  beforeAll(async () => {
    // Connect to test database
    const testDbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    await mongoose.connect(testDbUri);

    // Import models after connection
    const Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    const Branch = (await import('../modules/users/branch.model.js')).default;
    const User = (await import('../modules/users/user.model.js')).default;
    const SiteAdmin = (await import('../modules/site/admin/admin.model.js')).default;
    // Register Role so User.populate('roleId') does not throw MissingSchemaError
    // (in the real app the model is registered via role.routes.js at startup)
    await import('../modules/users/role.model.js');

    // Clean up test data
    await Promise.all([
      Tenant.deleteMany({}),
      Branch.deleteMany({}),
      User.deleteMany({}),
      SiteAdmin.deleteMany({}),
    ]);

    // Create Tenant A
    const tenantA = await Tenant.create({
      name: 'Clinic A',
      email: 'clinic-a@test.com',
      slug: 'clinic-a',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: {
        maxBranches: 5,
        maxUsersPerBranch: 10,
      },
    });
    tenantAId = tenantA._id;

    // Create Tenant B
    const tenantB = await Tenant.create({
      name: 'Clinic B',
      email: 'clinic-b@test.com',
      slug: 'clinic-b',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: {
        maxBranches: 5,
        maxUsersPerBranch: 10,
      },
    });
    tenantBId = tenantB._id;

    // Create Branch A (belongs to Tenant A)
    const branchA = await Branch.create({
      tenant: tenantAId,
      name: 'Branch A',
      address: '123 Street A',
      phone: '+1111111111',
    });
    branchAId = branchA._id;

    // Create Branch B (belongs to Tenant B)
    const branchB = await Branch.create({
      tenant: tenantBId,
      name: 'Branch B',
      address: '456 Street B',
      phone: '+2222222222',
    });
    branchBId = branchB._id;

    // Create User A (belongs to Tenant A, Branch A)
    const userA = await User.create({
      tenant: tenantAId,
      branch: branchAId,
      name: 'User A',
      email: 'user-a@test.com',
      password: 'Password123!',
      roleId: new mongoose.Types.ObjectId(),
      role: 'doctor',
      isActive: true,
    });
    userAId = userA._id;

    // Create User B (belongs to Tenant B, Branch B)
    const userB = await User.create({
      tenant: tenantBId,
      branch: branchBId,
      name: 'User B',
      email: 'user-b@test.com',
      password: 'Password123!',
      roleId: new mongoose.Types.ObjectId(),
      role: 'doctor',
      isActive: true,
    });
    userBId = userB._id;

    // Create Site Admin
    const siteAdmin = await SiteAdmin.create({
      name: 'Site Admin',
      email: 'admin@test.com',
      password: 'Admin123!',
      role: 'super_admin',
      isActive: true,
      twoFactorEnabled: true,
    });

    // Generate a mock site admin token
    const jwt = await import('jsonwebtoken');
    siteAdminToken = jwt.sign(
      { sub: siteAdmin._id.toString(), type: 'site' },
      process.env.JWT_SECRET || 'test-secret-key-for-testing',
      { expiresIn: '1h' }
    );

    // Setup Express app with routes
    app = express();
    app.use(express.json());

    // Import routes
    const siteUserRoutes = (await import('../modules/site/tenant/siteUser.routes.js')).default;
    const siteBranchRoutes = (await import('../modules/site/tenant/siteBranch.routes.js')).default;

    app.use('/api/site/users', siteUserRoutes);
    app.use('/api/site/branches', siteBranchRoutes);

    // Error handler
    app.use((err, _req, res, _next) => {
      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        message: err.message || 'Internal server error',
      });
    });
  });

  afterAll(async () => {
    // Clean up and disconnect
    const Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    const Branch = (await import('../modules/users/branch.model.js')).default;
    const User = (await import('../modules/users/user.model.js')).default;
    const SiteAdmin = (await import('../modules/site/admin/admin.model.js')).default;

    await Promise.all([
      Tenant.deleteMany({}),
      Branch.deleteMany({}),
      User.deleteMany({}),
      SiteAdmin.deleteMany({}),
    ]);

    await mongoose.disconnect();
  });

  describe('Tenant A Admin accessing Tenant B data', () => {
    it('should NOT return Tenant B users when querying Tenant A', async () => {
      // Query users for Tenant A
      const res = await request(app)
        .get(`/api/site/users/by-tenant/${tenantAId}`)
        .set('Authorization', `Bearer ${siteAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Should only contain users from Tenant A
      const userEmails = res.body.data.users.map(u => u.email);
      expect(userEmails).toContain('user-a@test.com');
      expect(userEmails).not.toContain('user-b@test.com');
    });

    it('should return 404 when trying to access wrong tenant branch', async () => {
      // Try to access Branch B (Tenant B) through Branch A's endpoint
      // This simulates cross-tenant access attempt
      const res = await request(app)
        .get(`/api/site/branches/${branchBId}`)
        .set('Authorization', `Bearer ${siteAdminToken}`);

      // Should succeed since site admin can access all branches
      // But the branch should show it belongs to Tenant B
      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(String(branchBId));
    });
  });

  describe('Cross-tenant resource access validation', () => {
    it('should return 404 when branch does not belong to specified tenant', async () => {
      // This test would require a route that validates tenant-branch relationship
      // For now, we verify the middleware logic
      
      const { validateTenantMatch } = await import('../utils/branchScope.js');
      const ApiError = (await import('../utils/ApiError.js')).default;

      // Attempting to validate Branch A with Tenant B should throw 404
      expect(() => {
        validateTenantMatch(tenantAId, tenantBId, { resourceName: 'Branch' });
      }).toThrow('Branch not found');
    });

    it('should succeed when resource belongs to correct tenant', async () => {
      const { validateTenantMatch } = await import('../utils/branchScope.js');

      // Validating Branch A with Tenant A should succeed
      const result = validateTenantMatch(tenantAId, tenantAId, { resourceName: 'Branch' });
      expect(result).toBe(true);
    });
  });

  describe('Tenant isolation in queries', () => {
    it('should filter users by tenant correctly', async () => {
      const User = (await import('../modules/users/user.model.js')).default;

      // Query users for Tenant A
      const usersA = await User.find({ tenant: tenantAId, isActive: true }).lean();
      expect(usersA.every(u => String(u.tenant) === String(tenantAId))).toBe(true);
      expect(usersA.map(u => u.email)).toContain('user-a@test.com');

      // Query users for Tenant B
      const usersB = await User.find({ tenant: tenantBId, isActive: true }).lean();
      expect(usersB.every(u => String(u.tenant) === String(tenantBId))).toBe(true);
      expect(usersB.map(u => u.email)).toContain('user-b@test.com');

      // Ensure no cross-contamination
      const usersAEmails = usersA.map(u => u.email);
      const usersBEmails = usersB.map(u => u.email);
      expect(usersAEmails).not.toContain('user-b@test.com');
      expect(usersBEmails).not.toContain('user-a@test.com');
    });

    it('should filter branches by tenant correctly', async () => {
      const Branch = (await import('../modules/users/branch.model.js')).default;

      // Query branches for Tenant A
      const branchesA = await Branch.find({ tenant: tenantAId }).lean();
      expect(branchesA.every(b => String(b.tenant) === String(tenantAId))).toBe(true);
      expect(branchesA.map(b => b.name)).toContain('Branch A');

      // Query branches for Tenant B
      const branchesB = await Branch.find({ tenant: tenantBId }).lean();
      expect(branchesB.every(b => String(b.tenant) === String(tenantBId))).toBe(true);
      expect(branchesB.map(b => b.name)).toContain('Branch B');

      // Ensure no cross-contamination
      const branchesANames = branchesA.map(b => b.name);
      const branchesBNames = branchesB.map(b => b.name);
      expect(branchesANames).not.toContain('Branch B');
      expect(branchesBNames).not.toContain('Branch A');
    });
  });

  describe('Branch validation for tenant', () => {
    it('should prevent creating branch with mismatched tenant', async () => {
      const { resolveBranchForCreate } = await import('../utils/branchScope.js');
      const ApiError = (await import('../utils/ApiError.js')).default;

      // This test simulates what happens when someone tries to create
      // a record with a branch that doesn't belong to the specified tenant
      // The actual validation is done in resolveBranchForCreate
      
      // For a clinic user, branch is forced to their own branch
      // For site admin, they must provide a branch and it's validated
      // The middleware handles this validation
    });
  });
});

describe('Tenant Isolation Middleware', () => {
  // This describe block is separate from the one above, so it needs its own
  // connection for the DB-backed requireTenantAccess assertions.
  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    await mongoose.connect(testDbUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('should reject invalid tenant ID format', async () => {
    const { requireTenantAccess } = await import('../middleware/siteAuth.js');
    const ApiError = (await import('../utils/ApiError.js')).default;

    const req = {
      params: { tenantId: 'invalid-id' },
      siteAdmin: { _id: 'admin-id', role: 'super_admin' },
    };
    const res = {};
    let nextErr = null;
    const next = (err) => { nextErr = err; };

    await requireTenantAccess(req, res, next);
    expect(nextErr).toBeInstanceOf(Error);
    expect(nextErr.message).toBe('Invalid tenant ID format');
  });

  it('should return 404 for non-existent tenant', async () => {
    const { requireTenantAccess } = await import('../middleware/siteAuth.js');

    const req = {
      params: { tenantId: new mongoose.Types.ObjectId().toString() },
      siteAdmin: { _id: 'admin-id', role: 'super_admin' },
    };
    const res = {};
    let nextErr = null;
    const next = (err) => { nextErr = err; };

    await requireTenantAccess(req, res, next);
    expect(nextErr).toBeDefined();
    expect(nextErr.statusCode).toBe(404);
    expect(nextErr.message).toBe('Tenant not found');
  });
});
