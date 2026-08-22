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
    find: vi.fn().mockResolvedValue([
      { size: 1024 * 1024 * 100 }, // 100MB
      { size: 1024 * 1024 * 200 }  // 200MB
    ])
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
      Tenant.findOne.mockResolvedValue(mockTenant);

      await tenantRouter(mockReq, mockRes, mockNext);

      expect(Tenant.findOne).toHaveBeenCalledWith({
        slug: 'test-clinic',
        isActive: true,
        status: { $in: ['active', 'trial'] }
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
          maxStorage: 5120 // 5GB in MB
        }
      };

      Attachment.find.mockResolvedValue([
        { size: 1024 * 1024 * 100 }, // 100MB
        { size: 1024 * 1024 * 200 }  // 200MB
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
  });
});