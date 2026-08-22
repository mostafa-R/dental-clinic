/**
 * Enhanced Role Controller
 * 
 * واجهات إضافية لإدارة الأدوار المخصصة ديناميكياً
 * حسب متطلبات PRD القسم 4.4
 */

import Role from './role.model.js';
import User from './user.model.js';
import ApiError from '../../utils/ApiError.js';
import { MODULES, CRUD_ACTIONS } from '../../constants/permissions.js';
import { DEFAULT_ROLES, getDefaultRoles } from '../../constants/roles.js';
import { getCachedRole, cacheRole, invalidateRoleCache } from '../../utils/cache.js';

/**
 * جلب مصفوفة الصلاحيات الكاملة للعرض في الواجهة
 */
export async function getPermissionMatrix(req, res) {
  try {
    const tenantId = req.user.tenant?._id;
    const docs = await Role.find({
      $or: [
        { tenant: tenantId },
        { tenant: null } // أدوار المنصة
      ],
      isActive: true
    });
    // built-ins first, then by name — sorted in memory to keep the query
    // mock-friendly (no chained cursor methods on the find promise)
    const roles = [...docs].sort((a, b) => {
      if (!!b.isBuiltIn !== !!a.isBuiltIn) return b.isBuiltIn ? 1 : -1;
      return String(a.name).localeCompare(String(b.name));
    });
    
    // بناء المصفوفة: موديول × دور × إجراء
    const matrix = {};
    
    for (const module of MODULES) {
      matrix[module.key] = {};
      
      for (const role of roles) {
        const permissions = role.permissionMap();
        matrix[module.key][role.key || role._id] = {
          actions: permissions[module.key] || [],
          roleName: role.name,
          isBuiltIn: role.isBuiltIn,
          isSystemAdmin: role.isSystemAdmin
        };
      }
    }
    
    res.json({
      success: true,
      data: {
        matrix,
        modules: MODULES.map(m => ({ key: m.key, label: m.label })),
        actions: CRUD_ACTIONS,
        roles: roles.map(r => ({
          id: r._id,
          key: r.key,
          name: r.name,
          isBuiltIn: r.isBuiltIn,
          isSystemAdmin: r.isSystemAdmin
        }))
      }
    });
    
  } catch (error) {
    console.error('[getPermissionMatrix] Error:', error);
    throw ApiError.internal('Failed to generate permission matrix');
  }
}

/**
 * إنشاء دور جديد من نسخ دور موجود
 */
export async function createRoleFromTemplate(req, res) {
  try {
    const { name, description, baseRoleId, permissions } = req.body;
    const tenantId = req.user.tenant?._id;
    const branchId = req.user.branch?._id;
    
    if (!name || name.trim().length < 2) {
      throw ApiError.badRequest('Role name must be at least 2 characters');
    }
    
    // التحقق من صحة الصلاحيات المُمرَّرة قبل أي وصول لقاعدة البيانات
    if (permissions) {
      validatePermissions(permissions);
    }
    
    // التحقق من عدم تكرار الاسم
    const existingRole = await Role.findOne({
      tenant: tenantId,
      branch: branchId,
      name: name.trim()
    });
    
    if (existingRole) {
      throw ApiError.conflict(`Role "${name}" already exists`);
    }
    
    let finalPermissions = permissions || [];
    
    // إذا كان هناك baseRoleId، نسخ الصلاحيات منه
    if (baseRoleId) {
      const baseRole = await Role.findOne({
        _id: baseRoleId,
        $or: [
          { tenant: tenantId },
          { tenant: null } // يمكن نسخ من أدوار المنصة
        ]
      });
      
      if (baseRole) {
        finalPermissions = baseRole.permissions || [];
      } else {
        throw ApiError.notFound('Base role not found');
      }
    }
    
    // التحقق من صحة الصلاحيات
    validatePermissions(finalPermissions);
    
    // إنشاء الدور الجديد
    const role = await Role.create({
      tenant: tenantId,
      branch: branchId,
      name: name.trim(),
      description: description?.trim() || '',
      permissions: finalPermissions,
      isSystemAdmin: false,
      isBuiltIn: false,
      isActive: true
    });
    
    // إبطال cache الأدوار
    await invalidateRoleCache(role._id);
    
    res.status(201).json({
      success: true,
      data: { role }
    });
    
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[createRoleFromTemplate] Error:', error);
    throw ApiError.internal('Failed to create role from template');
  }
}

/**
 * جلب الأدوار الافتراضية للنسخ منها
 */
export async function getRoleTemplates(req, res) {
  try {
    const tenantId = req.user.tenant?._id;
    
    // الأدوار الافتراضية للنظام
    const defaultRoles = getDefaultRoles();
    
    // الأدوار المبنية مسبقاً للعيادة
    const builtInRoles = await Role.find({
      tenant: tenantId,
      isBuiltIn: true,
      isActive: true
    });
    
    // الأدوار المخصصة الموجودة (يمكن نسخها أيضاً)
    const customRoles = await Role.find({
      tenant: tenantId,
      isBuiltIn: false,
      isActive: true
    }).limit(20); // تحديد النتائج
    
    res.json({
      success: true,
      data: {
        defaultRoles: defaultRoles.filter(role => 
          !['platform_admin', 'super_admin'].includes(role.key)
        ),
        builtInRoles: builtInRoles.map(r => ({
          id: r._id,
          name: r.name,
          description: r.description,
          key: r.key
        })),
        customRoles: customRoles.map(r => ({
          id: r._id,
          name: r.name,
          description: r.description
        }))
      }
    });
    
  } catch (error) {
    console.error('[getRoleTemplates] Error:', error);
    throw ApiError.internal('Failed to fetch role templates');
  }
}

/**
 * تحديث صلاحيات دور معين
 */
export async function updateRolePermissions(req, res) {
  try {
    const { id } = req.params;
    const { permissions } = req.body;
    
    if (!permissions || !Array.isArray(permissions)) {
      throw ApiError.badRequest('Permissions array is required');
    }
    
    // التحقق من صحة الصلاحيات
    validatePermissions(permissions);
    
    const role = await Role.findById(id);
    if (!role) {
      throw ApiError.notFound('Role not found');
    }
    
    // التحقق من الصلاحيات: لا يمكن تعديل أدوار builtIn إلا إذا كان المستخدم لديه صلاحيات كافية
    if (role.isBuiltIn && !req.user._roleResolved?.isSystemAdmin) {
      throw ApiError.forbidden('Cannot modify built-in role permissions');
    }
    
    // التحقق من حدود المستخدم: لا يمكنه منح صلاحيات لا يملكها هو
    const userPermissions = req.user._roleResolved?.permissionMap() || {};
    for (const perm of permissions) {
      const modulePerms = userPermissions[perm.module] || [];
      for (const action of perm.actions || []) {
        if (!modulePerms.includes(action)) {
          throw ApiError.forbidden(
            `You cannot grant ${action} permission on ${perm.module} module`
          );
        }
      }
    }
    
    // تحديث الصلاحيات
    role.permissions = permissions;
    await role.save();
    
    // إبطال cache
    await invalidateRoleCache(role._id);
    
    // إبطال cache جميع المستخدمين الذين لديهم هذا الدور
    await invalidateUsersWithRole(role._id);
    
    res.json({
      success: true,
      data: { role }
    });
    
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[updateRolePermissions] Error:', error);
    throw ApiError.internal('Failed to update role permissions');
  }
}

/**
 * تعطيل/تفعيل دور
 */
export async function toggleRoleStatus(req, res) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      throw ApiError.badRequest('isActive must be a boolean');
    }
    
    const role = await Role.findById(id);
    if (!role) {
      throw ApiError.notFound('Role not found');
    }
    
    // لا يمكن تعطيل الأدوار الافتراضية
    if (role.isBuiltIn && !isActive) {
      throw ApiError.forbidden('Cannot deactivate built-in roles');
    }
    
    role.isActive = isActive;
    await role.save();
    
    // إبطال cache
    await invalidateRoleCache(role._id);
    
    if (!isActive) {
      // عند التعطيل، فصل جميع المستخدمين من هذا الدور
      await User.updateMany(
        { role: role._id },
        { $set: { role: null } }
      );
      
      await invalidateUsersWithRole(role._id);
    }
    
    res.json({
      success: true,
      data: { 
        role,
        message: isActive ? 'Role activated' : 'Role deactivated (users detached)' 
      }
    });
    
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[toggleRoleStatus] Error:', error);
    throw ApiError.internal('Failed to toggle role status');
  }
}

/**
 * التحقق من صحة مصفوفة الصلاحيات
 */
function validatePermissions(permissions) {
  if (!Array.isArray(permissions)) {
    throw ApiError.badRequest('Permissions must be an array');
  }
  
  const moduleKeys = MODULES.map(m => m.key);
  
  for (const perm of permissions) {
    if (!perm.module || typeof perm.module !== 'string') {
      throw ApiError.badRequest('Each permission must have a module string');
    }
    
    if (!moduleKeys.includes(perm.module)) {
      throw ApiError.badRequest(`Invalid module: ${perm.module}`);
    }
    
    if (!perm.actions || !Array.isArray(perm.actions)) {
      throw ApiError.badRequest(`Actions must be an array for module: ${perm.module}`);
    }
    
    for (const action of perm.actions) {
      if (!CRUD_ACTIONS.includes(action)) {
        throw ApiError.badRequest(`Invalid action: ${action} for module: ${perm.module}`);
      }
    }
    
    // التحقق من التكرار
    const duplicates = permissions.filter(p => p.module === perm.module);
    if (duplicates.length > 1) {
      throw ApiError.badRequest(`Duplicate module: ${perm.module}`);
    }
  }
}

/**
 * إبطال cache جميع المستخدمين الذين لديهم دور معين
 */
async function invalidateUsersWithRole(roleId) {
  try {
    // projection passed as argument (no chained .select()) so the call works
    // with both real Mongoose cursors and promise-returning mocks
    const users = await User.find({ role: roleId }, '_id');
    for (const user of users || []) {
      // إبطال cache جلسات المستخدمين
      // (يمكن إضافة Redis cache للمستخدمين لاحقاً)
      console.log(`[RoleCache] Invalidating cache for user ${user._id} with role ${roleId}`);
    }
  } catch (error) {
    console.error('[invalidateUsersWithRole] Error:', error);
  }
}