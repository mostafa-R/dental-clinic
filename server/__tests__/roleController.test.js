import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mongoose.isValidObjectId before any controller imports
vi.mock('mongoose', async () => {
  const actual = await vi.importActual('mongoose');
  return {
    ...actual,
    default: {
      ...actual.default,
      isValidObjectId: vi.fn(() => true),
      startSession: vi.fn().mockResolvedValue({
        withTransaction: vi.fn(async (fn) => { await fn(); }),
        endSession: vi.fn()
      })
    }
  };
});

import {
  createRole,
  updateRole,
  deleteRole,
  getModules,
} from '../modules/users/role.controller.js';
import { MODULES, CRUD_ACTIONS } from '../constants/permissions.js';

// Mock dependencies
vi.mock('../modules/users/role.model.js', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn()
  }
}));

vi.mock('../modules/users/user.model.js', () => ({
  default: { updateMany: vi.fn() }
}));

vi.mock('../utils/cache.js', () => ({
  invalidateRole: vi.fn(),
  invalidateTenantRoles: vi.fn(),
  invalidatePermission: vi.fn()
}));

vi.mock('../socket/index.js', () => ({
  emitToBranch: vi.fn()
}));

vi.mock('../utils/branchScope.js', () => ({
  currentTenant: vi.fn(() => 'tenant123'),
  filterByBranch: vi.fn(() => ({})),
  toObjectId: vi.fn((v) => v),
  resolveBranchForCreate: vi.fn()
}));

vi.mock('../utils/asyncHandler.js', () => ({
  default: (fn) => async (req, res, next) => {
    try { return await fn(req, res, next); }
    catch (err) { next(err); }
  }
}));

vi.mock('../constants/roles.js', () => ({
  DEFAULT_ROLES: {},
  getDefaultRoles: vi.fn()
}));

vi.mock('../constants/plans.js', () => ({
  planIncludesModule: vi.fn(() => true)
}));

import mongoose from 'mongoose';
import Role from '../modules/users/role.model.js';
import User from '../modules/users/user.model.js';
import { invalidateRole } from '../utils/cache.js';
import { emitToBranch } from '../socket/index.js';

const VALID_ID = 'aabbccddeeff0011aabbccdd';
const ROLE_ID = '111111111111111111111111';
const TENANT_ID = '222222222222222222222222';

describe('Role Controller (Standard)', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      user: {
        _id: VALID_ID,
        tenant: { _id: TENANT_ID },
        branch: { _id: '333333333333333333333333' }
      },
      _roleResolved: {
        isSystemAdmin: true,
        permissionMap: vi.fn().mockReturnValue({
          dashboard: ['create', 'read', 'update', 'delete'],
          patients: ['create', 'read', 'update', 'delete'],
          billing: ['create', 'read', 'update', 'delete'],
          accounting: ['create', 'read', 'update', 'delete'],
          inventory: ['create', 'read', 'update', 'delete'],
          emr: ['create', 'read', 'update', 'delete'],
          treatment_plans: ['create', 'read', 'update', 'delete'],
          dental_chart: ['create', 'read', 'update', 'delete'],
          clinical_notes: ['create', 'read', 'update', 'delete'],
          prescriptions: ['create', 'read', 'update', 'delete'],
          queue: ['create', 'read', 'update', 'delete'],
          installments: ['create', 'read', 'update', 'delete'],
          whatsapp: ['create', 'read', 'update', 'delete'],
          users: ['create', 'read', 'update', 'delete'],
          branches: ['create', 'read', 'update', 'delete'],
          settings: ['create', 'read', 'update', 'delete'],
          roles: ['create', 'read', 'update', 'delete'],
          chat: ['create', 'read', 'update', 'delete'],
          consents: ['create', 'read', 'update', 'delete'],
          automations: ['create', 'read', 'update', 'delete']
        })
      },
      params: { id: ROLE_ID },
      body: {},
      validatedBody: {},
    };

    mockRes = {
      statusCode: 200,
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockImplementation(function (code) { this.statusCode = code; return this; }),
      locals: {}
    };

    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('createRole', () => {
    it('should create a role successfully', async () => {
      const createdRole = { _id: ROLE_ID, name: 'Nurse', tenant: TENANT_ID, permissions: [] };
      Role.findOne.mockResolvedValue(null);
      Role.create.mockResolvedValue(createdRole);
      mockReq.validatedBody = {
        name: 'Nurse',
        permissions: [{ module: 'dashboard', actions: ['read'] }]
      };

      await createRole(mockReq, mockRes, mockNext);

      expect(Role.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should block non-admin from granting permissions they do not hold', async () => {
      mockReq._roleResolved.isSystemAdmin = false;
      mockReq._roleResolved.permissionMap.mockReturnValue({
        dashboard: ['read']
      });
      Role.findOne.mockResolvedValue(null);
      mockReq.validatedBody = {
        name: 'Escalator',
        permissions: [{ module: 'dashboard', actions: ['delete'] }]
      };

      await createRole(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: expect.stringContaining('cannot grant delete')
        })
      );
      expect(Role.create).not.toHaveBeenCalled();
    });

    it('should allow system admin to create any permissions', async () => {
      mockReq._roleResolved.isSystemAdmin = true;
      Role.findOne.mockResolvedValue(null);
      Role.create.mockResolvedValue({ _id: ROLE_ID });
      mockReq.validatedBody = {
        name: 'Power Role',
        permissions: [{ module: 'dashboard', actions: ['delete'] }]
      };

      await createRole(mockReq, mockRes, mockNext);

      expect(Role.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should reject duplicate names', async () => {
      Role.findOne.mockResolvedValue({ _id: ROLE_ID, name: 'Nurse' });
      mockReq.validatedBody = { name: 'Nurse', permissions: [] };

      await createRole(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409 })
      );
    });
  });

  describe('updateRole', () => {
    it('should update permissions successfully for system admin', async () => {
      mockReq.validatedBody = {
        permissions: [{ module: 'dashboard', actions: ['read'] }]
      };
      const role = {
        _id: ROLE_ID, name: 'Test', isBuiltIn: false, permissions: [],
        save: vi.fn().mockResolvedValue(true)
      };
      Role.findOne.mockResolvedValue(role);

      await updateRole(mockReq, mockRes, mockNext);

      expect(role.permissions).toEqual([{ module: 'dashboard', actions: ['read'] }]);
      expect(role.save).toHaveBeenCalled();
    });

    it('should block non-admin from granting permissions they do not hold', async () => {
      mockReq._roleResolved.isSystemAdmin = false;
      mockReq._roleResolved.permissionMap.mockReturnValue({ dashboard: ['read'] });
      mockReq.validatedBody = {
        permissions: [{ module: 'dashboard', actions: ['delete'] }]
      };
      const role = { _id: ROLE_ID, name: 'Test', isBuiltIn: false, permissions: [] };
      Role.findOne.mockResolvedValue(role);

      await updateRole(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: expect.stringContaining('cannot grant delete')
        })
      );
    });

    it('should block deactivating built-in roles', async () => {
      mockReq.validatedBody = { isActive: false };
      const role = { _id: ROLE_ID, name: 'Built-in', isBuiltIn: true, isActive: true };
      Role.findOne.mockResolvedValue(role);

      await updateRole(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          message: expect.stringContaining('Built-in roles cannot be deactivated')
        })
      );
    });

    it('should allow renaming non-built-in roles', async () => {
      mockReq.validatedBody = { name: 'Renamed' };
      const role = {
        _id: ROLE_ID, name: 'Old', isBuiltIn: false, permissions: [],
        save: vi.fn().mockResolvedValue(true)
      };
      Role.findOne.mockResolvedValue(role);

      await updateRole(mockReq, mockRes, mockNext);

      expect(role.name).toBe('Renamed');
      expect(role.save).toHaveBeenCalled();
    });

    it('should reject renaming built-in roles', async () => {
      mockReq.validatedBody = { name: 'NewName' };
      const role = { _id: ROLE_ID, name: 'Original', isBuiltIn: true, permissions: [] };
      Role.findOne.mockResolvedValue(role);

      await updateRole(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          message: expect.stringContaining('cannot be changed')
        })
      );
    });
  });

  describe('deleteRole', () => {
    it('should delete a non-built-in role', async () => {
      const mockDelete = vi.fn();
      const mockSession = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      Role.findOne.mockResolvedValue({
        _id: ROLE_ID, name: 'Custom', isBuiltIn: false, deleteOne: mockDelete, session: mockSession
      });

      await deleteRole(mockReq, mockRes, mockNext);

      expect(invalidateRole).toHaveBeenCalledWith(ROLE_ID);
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should reject deleting built-in roles', async () => {
      Role.findOne.mockResolvedValue({ _id: ROLE_ID, name: 'Built-in', isBuiltIn: true });

      await deleteRole(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          message: expect.stringContaining('cannot be deleted')
        })
      );
    });
  });

  describe('getModules', () => {
    it('should return MODULES and CRUD_ACTIONS', async () => {
      await getModules(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { modules: MODULES, actions: CRUD_ACTIONS }
      });
    });
  });
});
