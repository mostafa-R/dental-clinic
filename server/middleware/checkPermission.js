import Role from '../models/Role.js';
import ApiError from '../utils/ApiError.js';
import { MODULES } from '../constants/permissions.js';
import { planIncludesModule } from '../constants/plans.js';

/**
 * Cache of role permissions per request lifecycle. Since a single HTTP request
 * only involves one user/role, we resolve the Role document once and reuse it.
 * This avoids repeated DB lookups when multiple permissions are checked in a
 * single controller flow.
 */

/**
 * Resolve the Role document for the authenticated user.
 * Uses roleId first (dynamic role), then falls back to role key.
 */
export async function resolveRole(req) {
  if (!req.user) {
    throw ApiError.unauthorized('Not authenticated');
  }

  const { role: roleKey, roleId, tenant } = req.user;

  // Platform site_admin / legacy super_admin (no tenant) always has full access.
  if ((roleKey === 'site_admin' || roleKey === 'super_admin') && !tenant) {
    return { isSystemAdmin: true, permissionMap: () => Object.fromEntries(MODULES.map((m) => [m.key, ['create', 'read', 'update', 'delete']])) };
  }

  let roleDoc = null;

  // 1. Resolve via roleId (dynamic role reference)
  if (roleId) {
    roleDoc = await Role.findById(roleId).lean();
  }

  // 2. Fallback: resolve via role key + tenant
  if (!roleDoc) {
    const query = { key: roleKey, isActive: true };
    if (tenant) query.tenant = tenant;
    else query.tenant = null;
    roleDoc = await Role.findOne(query).lean();
  }

  // 3. If no Role document exists, use built-in defaults.
  if (!roleDoc) {
    const defaultPerms = {};
    for (const mod of MODULES) {
      if (mod.defaultRoles.includes(roleKey)) {
        defaultPerms[mod.key] = ['create', 'read', 'update', 'delete'];
      } else {
        defaultPerms[mod.key] = [];
      }
    }
    return {
      isSystemAdmin: ['site_admin', 'clinic_admin', 'super_admin'].includes(roleKey),
      permissionMap: () => defaultPerms,
    };
  }

  // Build the permission map from the Role document.
  const perms = {};
  for (const perm of roleDoc.permissions || []) {
    perms[perm.module] = perm.actions || [];
  }
  for (const mod of MODULES) {
    if (!perms[mod.key]) perms[mod.key] = [];
  }

  return {
    isSystemAdmin: roleDoc.isSystemAdmin || ['site_admin', 'clinic_admin', 'super_admin'].includes(roleKey),
    permissionMap: () => perms,
  };
}

/**
 * Middleware factory: check if the authenticated user has the specified
 * action on the specified module. Replaces the fixed `authorize(...roles)`.
 *
 * Usage:
 *   router.post('/', protect, checkPermission('patients', 'create'), createPatient);
 */
export function checkPermission(module, action) {
  return async function permissionMiddleware(req, _res, next) {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Not authenticated'));
      }

      // Plan gate: even if the role grants access, the tenant's plan must
      // include the module. Platform admin (no tenant) always passes.
      if (!planIncludesModule(req.user.tenant, module)) {
        return next(
          ApiError.forbidden(
            `Your plan does not include the ${module} module. Contact your platform administrator to upgrade.`,
          ),
        );
      }

      // Cache the resolved role on the request so multiple checks in one
      // request don't re-query the database.
      if (!req._roleResolved) {
        req._roleResolved = await resolveRole(req);
      }

      const { isSystemAdmin, permissionMap } = req._roleResolved;

      if (isSystemAdmin) return next();

      const perms = permissionMap();
      const actions = perms[module] || [];

      if (!actions.includes(action)) {
        return next(
          ApiError.forbidden(
            `You do not have permission to ${action} ${module}`,
          ),
        );
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}
