import Role from '../modules/users/role.model.js';
import ApiError from '../utils/ApiError.js';
import { MODULES } from '../constants/permissions.js';
import { planIncludesModule } from '../constants/plans.js';
import {
  getCachedRole, cacheRole, invalidateRole,
  getCachedPermission, cachePermission,
} from '../utils/cache.js';

/**
 * Resolve the Role document for the authenticated user.
 *
 * Resolution order:
 *   1. Platform site_admin / legacy super_admin (no tenant) → always full access
 *   2. Check Redis cache for role document (keyed by roleId)
 *   3. Query MongoDB if cache miss → cache the result
 *   4. If no Role document exists, use built-in defaults from MODULES
 *
 * The resolved role is cached both in Redis (cross-request) and on
 * req._roleResolved (within-request) to minimize DB hits.
 */
export async function resolveRole(req) {
  if (!req.user) {
    throw ApiError.unauthorized('Not authenticated');
  }

  const { roleId, tenant } = req.user;

  // Clinic users with no role assigned have NO permissions.
  if (!roleId && !tenant) {
    const emptyPerms = Object.fromEntries(MODULES.map((m) => [m.key, []]));
    return {
      isSystemAdmin: false,
      permissionMap: () => emptyPerms,
    };
  }

  // 1. Try Redis cache via roleId
  let roleDoc = null;
  if (roleId) {
    roleDoc = await getCachedRole(roleId);
    if (roleDoc && roleDoc.tenant && String(roleDoc.tenant) !== String(tenant)) {
      roleDoc = null;
    }
  }

  // 2. Cache miss → query MongoDB
  if (!roleDoc && roleId) {
    roleDoc = await Role.findById(roleId).lean();
    if (roleDoc) {
      await cacheRole(roleId, roleDoc);
    }
  }

  // 3. If no Role document exists, the user has no permissions.
  //    System admin status must come from a Role document with isSystemAdmin flag.
  if (!roleDoc) {
    const emptyPerms = Object.fromEntries(MODULES.map((m) => [m.key, []]));
    return {
      isSystemAdmin: false,
      permissionMap: () => emptyPerms,
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
    isSystemAdmin: !!roleDoc.isSystemAdmin,
    permissionMap: () => perms,
  };
}

/**
 * Middleware factory: check if the authenticated user has the specified
 * action on the specified module.
 *
 * Uses Redis-cached role resolution to minimize DB hits.
 * The resolved role is cached on req._roleResolved for within-request reuse.
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
      // request don't re-query the database or Redis.
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
