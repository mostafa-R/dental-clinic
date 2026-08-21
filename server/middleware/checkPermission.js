import Role from '../modules/users/role.model.js';
import ApiError from '../utils/ApiError.js';
import { MODULES } from '../constants/permissions.js';
import { planIncludesModule } from '../constants/plans.js';
import {
  getCachedRole, cacheRole,
} from '../utils/cache.js';

/**
 * A role is usable by the caller when:
 *  - it is platform-level (tenant: null) → shared across all tenants, OR
 *  - it is tenant-scoped and belongs to the caller's own tenant.
 */
function roleBelongsToTenant(roleDoc, tenantId) {
  const roleTenant = roleDoc.tenant ? String(roleDoc.tenant) : null;
  if (roleTenant === null) return true;
  return tenantId !== null && roleTenant === tenantId;
}

/**
 * Resolve the Role document for the authenticated user.
 *
 * Resolution order:
 *   1. Platform/site admin (no tenant) → always full access
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

  const { roleId } = req.user;
  // protect (middleware/auth.js) replaces req.user.tenant with the populated /
  // cached tenant config object, so the id lives at ._id. A bare id string is
  // tolerated too for safety.
  const tenantId = req.user.tenant?._id
    ? String(req.user.tenant._id)
    : req.user.tenant
      ? String(req.user.tenant)
      : null;

  // Clinic users with no role assigned have NO permissions.
  if (!roleId && !req.user.tenant) {
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
    if (roleDoc && !roleBelongsToTenant(roleDoc, tenantId)) {
      roleDoc = null;
    }
  }

  // 2. Cache miss → query MongoDB, scoped to the caller's tenant plus
  //    platform-level roles so a cross-tenant roleId is rejected.
  if (!roleDoc && roleId) {
    const query = { _id: roleId };
    if (tenantId) {
      query.$or = [{ tenant: tenantId }, { tenant: null }];
    }
    roleDoc = await Role.findOne(query).lean();
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
