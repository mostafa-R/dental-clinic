import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enforcePlanLimits, tenantRouter } from '../middleware/tenantRouter.js';
import ApiError from '../utils/ApiError.js';

// Mock dependencies
vi.mock('../utils/cache.js', () => ({
  getCachedTenant: vi.fn(),
  cacheTenant: vi.fn(),
  invalidateTenantCache: vi.fn()
}));

vi.mock('../modules/site/tenant/tenant.model.js', () => ({
  default: {
    findOne: vi.fn().mockImplementation((query) => {
      if (query?.slug === 'test-clinic') {
        return Promise.resolve({
          _id: 'tenant123',
          name: 'Test Clinic',
          slug: 'test-clinic',
          status: 'active',
          isActive: true,
          settings: {},
          plan: 'starter',
          planModules: [],
          planId: null,
          subscriptionEndsAt: null,
          toObject: () => ({
            _id: 'tenant123',
            name: 'Test Clinic',
            slug: 'test-clinic',
            status: 'active',
            isActive: true,
            settings: {},
            plan: 'starter',
            planModules: [],
            planId: null,
            subscriptionEndsAt: null
          })
        });
      }
      return Promise.resolve(null);
    })
  }
}));

vi.mock('../modules/users/branch.model.js', () => ({
  default: {
    countDocuments: vi.fn()
  }
}));

vi.mock('../modules/users/role.model.js', () => ({
  default: {
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn() }),
    }),
  }
}));

vi.mock('../modules/users/user.model.js', () => ({
  default: {
    countDocuments: vi.fn()
  }
}));

vi.mock('../modules/patients/patient.model.js', () => ({
  default: {
    countDocuments: vi.fn()
  }
}));

vi.mock('../modules/emr/attachment.model.js', () => ({
  default: {
    aggregate: vi.fn().mockResolvedValue([{ total: 1024 * 1024 * 300 }])
  }
}));

import Attachment from '../modules/emr/attachment.model.js';
import Tenant from '../modules/site/tenant/tenant.model.js';
import Branch from '../modules/users/branch.model.js';
import { getCachedTenant } from '../utils/cache.js';

describe('Tenant Router Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      hostname: 'test-clinic.dentalos.app',
      tenant: null,
      tenantId: null,
      isClinicRoute: false,
      isPlatformRoute: false,
      isApiRoute: false
    };

    mockRes = {
      set: vi.fn(),
      locals: {}
    };

    mockNext = vi.fn();

    vi.clearAllMocks();
  });

  describe('tenantRouter', () => {
    it('should set isPlatformRoute for platform domains', async () => {
      mockReq.hostname = 'app.dentalos.app';

      await tenantRouter(mockReq, mockRes, mockNext);

      expect(mockReq.isPlatformRoute).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set isApiRoute for api subdomain', async () => {
      mockReq.hostname = 'api.dentalos.app';

      await tenantRouter(mockReq, mockRes, mockNext);

      expect(mockReq.isApiRoute).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should resolve tenant from subdomain', async () => {
      const mockTenant = {
        _id: 'tenant123',
        name: 'Test Clinic',
        slug: 'test-clinic',
        status: 'active',
        isActive: true,
        settings: {}
      };

      getCachedTenant.mockResolvedValue(mockTenant);

      await tenantRouter(mockReq, mockRes, mockNext);

      expect(mockReq.tenant).toEqual(mockTenant);
      expect(mockReq.tenantId).toBe('tenant123');
      expect(mockReq.isClinicRoute).toBe(true);
      expect(mockRes.set).toHaveBeenCalledWith('X-Tenant-ID', 'tenant123');
      expect(mockRes.set).toHaveBeenCalledWith('X-Tenant-Name', 'Test Clinic');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject suspended tenant', async () => {
      const mockTenant = {
        _id: 'tenant123',
        name: 'Test Clinic',
        slug: 'test-clinic',
        status: 'suspended',
        isActive: true,
        settings: {}
      };

      getCachedTenant.mockResolvedValue(mockTenant);

      await tenantRouter(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      const error = mockNext.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('subscription is suspended');
    });

    it('should set isPlatformRoute for the apex domain', async () => {
      mockReq.hostname = 'dentalos.app';

      await tenantRouter(mockReq, mockRes, mockNext);

      expect(mockReq.isPlatformRoute).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set isPlatformRoute for IPv6 loopback', async () => {
      mockReq.hostname = '[::1]';

      await tenantRouter(mockReq, mockRes, mockNext);

      expect(mockReq.isPlatformRoute).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject an expired trial tenant', async () => {
      const mockTenant = {
        _id: 'tenant123',
        name: 'Test Clinic',
        slug: 'test-clinic',
        status: 'trial',
        isActive: true,
        settings: {},
        trialEndsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
      };

      getCachedTenant.mockResolvedValue(mockTenant);

      await tenantRouter(mockReq, mockRes, mockNext);

      const error = mockNext.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('trial has expired');
    });

    it('should reject a cancelled tenant with its own message', async () => {
      const mockTenant = {
        _id: 'tenant123',
        name: 'Test Clinic',
        slug: 'test-clinic',
        status: 'cancelled',
        isActive: false,
        settings: {}
      };

      getCachedTenant.mockResolvedValue(mockTenant);

      await tenantRouter(mockReq, mockRes, mockNext);

      const error = mockNext.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('cancelled');
    });

    it('should fetch from DB if not in cache', async () => {
      const mockTenant = {
        _id: 'tenant123',
        name: 'Test Clinic',
        slug: 'test-clinic',
        status: 'active',
        isActive: true,
        settings: {},
        plan: 'starter',
        planModules: [],
        planId: null,
        subscriptionEndsAt: null
      };

      getCachedTenant.mockResolvedValue(null);
      Tenant.findOne.mockResolvedValue({
        ...mockTenant,
        toObject: () => ({ ...mockTenant }),
      });

      await tenantRouter(mockReq, mockRes, mockNext);

      expect(Tenant.findOne).toHaveBeenCalledWith({
        slug: 'test-clinic'
      });
      expect(mockReq.tenant).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 404 for non-existent tenant', async () => {
      getCachedTenant.mockResolvedValue(null);
      Tenant.findOne.mockResolvedValue(null);

      await tenantRouter(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      const error = mockNext.mock.calls[0][0];
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('Clinic not found');
    });
  });

  describe('enforcePlanLimits', () => {
    it('should pass through when there is no tenant context (platform/dev routes)', async () => {
      const middleware = enforcePlanLimits('storage');

      mockReq.tenant = null;

      await middleware(mockReq, mockRes, mockNext);

      // Must NOT 401 — non-tenant traffic (platform routes, localhost dev,
      // supertest) is skipped so the mounted storage-limit middleware never
      // trips it.
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext.mock.calls[0].length).toBe(0);
    });

    it('should allow creation when under limit', async () => {
      const middleware = enforcePlanLimits('branches');

      mockReq.tenant = {
        _id: 'tenant123',
        settings: {
          maxBranches: 5
        }
      };

      Branch.countDocuments.mockResolvedValue(3);

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.tenantUsage).toEqual({
        branches: { current: 3, limit: 5 }
      });
    });

    it('should reject creation when at limit', async () => {
      const middleware = enforcePlanLimits('branches');

      mockReq.tenant = {
        _id: 'tenant123',
        settings: {
          maxBranches: 5
        }
      };

      Branch.countDocuments.mockResolvedValue(5);

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      const error = mockNext.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Plan limit reached');
    });

    it('should handle unlimited plans (limit = 0)', async () => {
      const middleware = enforcePlanLimits('branches');

      mockReq.tenant = {
        _id: 'tenant123',
        settings: {
          maxBranches: 0 // unlimited
        }
      };

      Branch.countDocuments.mockResolvedValue(100);

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle storage limits', async () => {
      const middleware = enforcePlanLimits('storage');

      mockReq.tenant = {
        _id: 'tenant123',
        settings: {
          storageLimit: 5120 // 5GB in MB
        }
      };

      Attachment.aggregate.mockResolvedValue([
        { total: 1024 * 1024 * 300 } // 300MB total
      ]);

      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantUsage.storage.current).toBe(300); // MB
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw error for invalid resource type', async () => {
      const middleware = enforcePlanLimits('invalid_resource');

      mockReq.tenant = {
        _id: 'tenant123',
        settings: {}
      };

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      const error = mockNext.mock.calls[0][0];
      expect(error.statusCode).toBe(400);
    });

    it('should count doctors via role keys (doctor/assistant)', async () => {
      const middleware = enforcePlanLimits('doctors');

      mockReq.tenant = {
        _id: 'tenant123',
        settings: {
          maxDoctors: 5
        }
      };

      const Role = (await import('../modules/users/role.model.js')).default;
      Role.find.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: 'r1' }, { _id: 'r2' }]),
        }),
      });

      const UserModel = (await import('../modules/users/user.model.js')).default;
      UserModel.countDocuments.mockResolvedValue(3);

      await middleware(mockReq, mockRes, mockNext);

      expect(UserModel.countDocuments).toHaveBeenCalledWith({
        tenant: 'tenant123',
        isActive: true,
        roleId: { $in: ['r1', 'r2'] },
      });
      expect(mockReq.tenantUsage.doctors).toEqual({ current: 3, limit: 5 });
      expect(mockNext).toHaveBeenCalled();
    });
  });
});