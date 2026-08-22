import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPermissionMatrix,
  createRoleFromTemplate,
  getRoleTemplates,
  updateRolePermissions,
  toggleRoleStatus
} from '../modules/users/role.enhanced.controller.js';
import ApiError from '../utils/ApiError.js';

// Mock dependencies
vi.mock('../modules/users/role.model.js', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn()
  }
}));

vi.mock('../modules/users/user.model.js', () => ({
  default: {
    updateMany: vi.fn(),
    find: vi.fn()
  }
}));

vi.mock('../utils/cache.js', () => ({
  invalidateRoleCache: vi.fn(),
  getCachedRole: vi.fn(),
  cacheRole: vi.fn()
}));

vi.mock('../constants/roles.js', () => ({
  DEFAULT_ROLES: {
    RECEPTIONIST: {
      key: 'receptionist',
      name: 'موظف استقبال',
      description: 'إدارة الواجهة والحجوزات والتحصيل',
      isBuiltIn: true,
      isSystemAdmin: false,
      permissions: {
        dashboard: ['read'],
        patients: ['create', 'read', 'update', 'delete'],
        appointments: ['create', 'read', 'update', 'delete']
      }
    },
    DOCTOR: {
      key: 'doctor',
      name: 'طبيب',
      description: 'العلاج والتوثيق الطبي',
      isBuiltIn: true,
      isSystemAdmin: false,
      permissions: {
        dashboard: ['read'],
        patients: ['read', 'update'],
        appointments: ['read', 'update']
      }
    }
  },
  getDefaultRoles: vi.fn(),
  getRolePermissions: vi.fn()
}));

vi.mock('../constants/permissions.js', () => ({
  MODULES: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'patients', label: 'Patients' },
    { key: 'appointments', label: 'Appointments' }
  ],
  CRUD_ACTIONS: ['create', 'read', 'update', 'delete']
}));

import Role from '../modules/users/role.model.js';
import User from '../modules/users/user.model.js';
import { invalidateRoleCache } from '../utils/cache.js';
import { getDefaultRoles } from '../constants/roles.js';
import { MODULES } from '../constants/permissions.js';

describe('Enhanced Role Controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      user: {
        tenant: { _id: 'tenant123' },
        branch: { _id: 'branch123' },
        _roleResolved: {
          permissionMap: vi.fn(),
          isSystemAdmin: false
        }
      },
      params: {},
      body: {}
    };

    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis()
    };

    vi.clearAllMocks();
    
    // Default mocks
    getDefaultRoles.mockReturnValue([
      { key: 'receptionist', name: 'موظف استقبال', isBuiltIn: true },
      { key: 'doctor', name: 'طبيب', isBuiltIn: true }
    ]);
    
    mockReq.user._roleResolved.permissionMap.mockReturnValue({
      dashboard: ['read', 'update'],
      patients: ['read'],
      appointments: ['read']
    });
  });

  describe('getPermissionMatrix', () => {
    it('should return permission matrix for all roles', async () => {
      const mockRoles = [
        {
          _id: 'role1',
          key: 'receptionist',
          name: 'موظف استقبال',
          isBuiltIn: true,
          isSystemAdmin: false,
          permissions: [
            { module: 'dashboard', actions: ['read'] },
            { module: 'patients', actions: ['create', 'read', 'update', 'delete'] }
          ],
          permissionMap: function() {
            return this.permissions.reduce((map, perm) => {
              map[perm.module] = perm.actions;
              return map;
            }, {});
          }
        },
        {
          _id: 'role2',
          key: 'doctor',
          name: 'طبيب',
          isBuiltIn: true,
          isSystemAdmin: false,
          permissions: [
            { module: 'dashboard', actions: ['read'] },
            { module: 'patients', actions: ['read', 'update'] }
          ],
          permissionMap: function() {
            return this.permissions.reduce((map, perm) => {
              map[perm.module] = perm.actions;
              return map;
            }, {});
          }
        }
      ];

      Role.find.mockResolvedValue(mockRoles);

      await getPermissionMatrix(mockReq, mockRes);

      expect(Role.find).toHaveBeenCalledWith({
        $or: [
          { tenant: 'tenant123' },
          { tenant: null }
        ],
        isActive: true
      });

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          matrix: {
            dashboard: {
              receptionist: { actions: ['read'], roleName: 'موظف استقبال', isBuiltIn: true, isSystemAdmin: false },
              doctor: { actions: ['read'], roleName: 'طبيب', isBuiltIn: true, isSystemAdmin: false }
            },
            patients: {
              receptionist: { actions: ['create', 'read', 'update', 'delete'], roleName: 'موظف استقبال', isBuiltIn: true, isSystemAdmin: false },
              doctor: { actions: ['read', 'update'], roleName: 'طبيب', isBuiltIn: true, isSystemAdmin: false }
            },
            appointments: {
              receptionist: { actions: [], roleName: 'موظف استقبال', isBuiltIn: true, isSystemAdmin: false },
              doctor: { actions: [], roleName: 'طبيب', isBuiltIn: true, isSystemAdmin: false }
            }
          },
          modules: MODULES.map(m => ({ key: m.key, label: m.label })),
          actions: ['create', 'read', 'update', 'delete'],
          roles: expect.any(Array)
        }
      });
    });
  });

  describe('createRoleFromTemplate', () => {
    it('should create new role from base role', async () => {
      const baseRole = {
        _id: 'baseRole123',
        tenant: 'tenant123',
        permissions: [
          { module: 'dashboard', actions: ['read'] },
          { module: 'patients', actions: ['read'] }
        ]
      };

      const newRole = {
        _id: 'newRole123',
        tenant: 'tenant123',
        branch: 'branch123',
        name: 'Custom Role',
        description: 'Custom description',
        permissions: baseRole.permissions,
        isSystemAdmin: false,
        isBuiltIn: false,
        isActive: true
      };

      mockReq.body = {
        name: 'Custom Role',
        description: 'Custom description',
        baseRoleId: 'baseRole123'
      };

      Role.findOne
        .mockResolvedValueOnce(null) // Check for existing role
        .mockResolvedValueOnce(baseRole); // Find base role

      Role.create.mockResolvedValue(newRole);

      await createRoleFromTemplate(mockReq, mockRes);

      expect(Role.findOne).toHaveBeenCalledWith({
        tenant: 'tenant123',
        branch: 'branch123',
        name: 'Custom Role'
      });

      expect(Role.findOne).toHaveBeenCalledWith({
        _id: 'baseRole123',
        $or: [
          { tenant: 'tenant123' },
          { tenant: null }
        ]
      });

      expect(Role.create).toHaveBeenCalledWith({
        tenant: 'tenant123',
        branch: 'branch123',
        name: 'Custom Role',
        description: 'Custom description',
        permissions: baseRole.permissions,
        isSystemAdmin: false,
        isBuiltIn: false,
        isActive: true
      });

      expect(invalidateRoleCache).toHaveBeenCalledWith('newRole123');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { role: newRole }
      });
    });

    it('should reject duplicate role name', async () => {
      mockReq.body = { name: 'Existing Role' };

      Role.findOne.mockResolvedValue({
        _id: 'existingRole',
        name: 'Existing Role'
      });

      await expect(createRoleFromTemplate(mockReq, mockRes)).rejects.toThrow(ApiError);
      
      const error = await createRoleFromTemplate(mockReq, mockRes).catch(e => e);
      expect(error.statusCode).toBe(409);
      expect(error.message).toContain('already exists');
    });

    it('should validate permissions format', async () => {
      mockReq.body = {
        name: 'New Role',
        permissions: [
          { module: 'invalid_module', actions: ['invalid_action'] }
        ]
      };

      await expect(createRoleFromTemplate(mockReq, mockRes)).rejects.toThrow(ApiError);
      
      const error = await createRoleFromTemplate(mockReq, mockRes).catch(e => e);
      expect(error.statusCode).toBe(400);
    });
  });

  describe('updateRolePermissions', () => {
    it('should update role permissions successfully', async () => {
      const role = {
        _id: 'role123',
        name: 'Test Role',
        isBuiltIn: false,
        permissions: [],
        save: vi.fn().mockResolvedValue(true)
      };

      mockReq.params.id = 'role123';
      mockReq.body.permissions = [
        { module: 'dashboard', actions: ['read'] },
        { module: 'patients', actions: ['read'] }
      ];

      Role.findById.mockResolvedValue(role);

      await updateRolePermissions(mockReq, mockRes);

      expect(Role.findById).toHaveBeenCalledWith('role123');
      expect(role.permissions).toEqual(mockReq.body.permissions);
      expect(role.save).toHaveBeenCalled();
      expect(invalidateRoleCache).toHaveBeenCalledWith('role123');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { role: expect.any(Object) }
      });
    });

    it('should reject permission escalation', async () => {
      const role = {
        _id: 'role123',
        name: 'Test Role',
        isBuiltIn: false,
        permissions: []
      };

      mockReq.params.id = 'role123';
      mockReq.body.permissions = [
        { module: 'dashboard', actions: ['create'] } // User only has read,update
      ];

      Role.findById.mockResolvedValue(role);

      await expect(updateRolePermissions(mockReq, mockRes)).rejects.toThrow(ApiError);
      
      const error = await updateRolePermissions(mockReq, mockRes).catch(e => e);
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('cannot grant');
    });
  });

  describe('toggleRoleStatus', () => {
    it('should activate a role', async () => {
      const role = {
        _id: 'role123',
        name: 'Test Role',
        isBuiltIn: false,
        isActive: false,
        save: vi.fn().mockResolvedValue(true)
      };

      mockReq.params.id = 'role123';
      mockReq.body.isActive = true;

      Role.findById.mockResolvedValue(role);

      await toggleRoleStatus(mockReq, mockRes);

      expect(role.isActive).toBe(true);
      expect(role.save).toHaveBeenCalled();
      expect(invalidateRoleCache).toHaveBeenCalledWith('role123');
      expect(User.updateMany).not.toHaveBeenCalled(); // Not needed for activation
    });

    it('should deactivate a role and detach users', async () => {
      const role = {
        _id: 'role123',
        name: 'Test Role',
        isBuiltIn: false,
        isActive: true,
        save: vi.fn().mockResolvedValue(true)
      };

      mockReq.params.id = 'role123';
      mockReq.body.isActive = false;

      Role.findById.mockResolvedValue(role);
      User.find.mockResolvedValue([{ _id: 'user1' }, { _id: 'user2' }]);

      await toggleRoleStatus(mockReq, mockRes);

      expect(role.isActive).toBe(false);
      expect(role.save).toHaveBeenCalled();
      expect(invalidateRoleCache).toHaveBeenCalledWith('role123');
      expect(User.updateMany).toHaveBeenCalledWith(
        { role: 'role123' },
        { $set: { role: null } }
      );
    });

    it('should reject deactivating built-in roles', async () => {
      const role = {
        _id: 'role123',
        name: 'Built-in Role',
        isBuiltIn: true,
        isActive: true
      };

      mockReq.params.id = 'role123';
      mockReq.body.isActive = false;

      Role.findById.mockResolvedValue(role);

      await expect(toggleRoleStatus(mockReq, mockRes)).rejects.toThrow(ApiError);
      
      const error = await toggleRoleStatus(mockReq, mockRes).catch(e => e);
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Cannot deactivate built-in roles');
    });
  });
});