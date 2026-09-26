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
 * Is this role clinic-wide, i.e. does it see every branch of its tenant rather
 * than only the branch its holder is assigned to?
 *
 * This is deliberately NOT the same question as `isSystemAdmin`. Those used to
 * be conflated behind one flag, which meant making the clinic manager
 * plan-bound (isSystemAdmin: false) would have quietly demoted them from
 * "sees the whole clinic" to "sees only my own branch" — a data-visibility
 * change nobody asked for, on top of the permission change that was asked for.
 *
 * The rule is derived from the granted permissions instead of a hardcoded role
 * key, so it stays correct for custom roles: a role that can read/update/delete
 * branches manages the clinic's branch structure and therefore needs
 * clinic-wide visibility. Platform roles keep it via `isSystemAdmin`.
 */
export function isClinicWideRole(roleDoc, perms) {
  if (roleDoc.isSystemAdmin) return true;
  const branchActions = perms?.branches || [];
  return ['read', 'update', 'delete'].some((action) => branchActions.includes(action));
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
    // A cached role that is inactive (deactivated) or that belongs to another
    // tenant is ignored so the authoritative DB lookup below can decide.
    if (roleDoc && (roleDoc.isActive === false || !roleBelongsToTenant(roleDoc, tenantId))) {
      roleDoc = null;
    }
  }

  // 2. Cache miss → query MongoDB, scoped to the caller's tenant plus
  //    platform-level roles so a cross-tenant roleId is rejected. Inactive
  //    (deactivated) roles grant nothing.
  if (!roleDoc && roleId) {
    const query = { _id: roleId, isActive: true };
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
      isTenantWide: false,
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
    isTenantWide: isClinicWideRole(roleDoc, perms),
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

      // Cache the resolved role on the request so multiple checks in one
      // request don't re-query the database or Redis.
      if (!req._roleResolved) {
        req._roleResolved = await resolveRole(req);
      }

      const { isSystemAdmin, permissionMap } = req._roleResolved;

      // System admins bypass both the plan gate and the permission matrix
      // (e.g. a clinic owner must never be locked out of role management by a
      // missing 'roles' plan module). ONLY system admins bypass — a missing
      // tenant for a regular user is deny, never full access.
      if (isSystemAdmin) return next();
      if (!req.user.tenant) {
        return next(ApiError.forbidden('Clinic context is missing. Please log in again.'));
      }

      // Plan gate: even if the role grants access, the tenant's plan must
      // include the module.
      if (!planIncludesModule(req.user.tenant, module)) {
        return next(
          ApiError.forbidden(
            `Your plan does not include the ${module} module. Contact your platform administrator to upgrade.`,
          ),
        );
      }

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

/**
 * Middleware factory: allow the request when the caller holds ANY of the
 * listed [module, action] pairs (PRD e.g. refunds need billing.delete OR
 * accounting.update).
 *
 * A candidate pair only counts when BOTH halves hold for that SAME module:
 * the module is in the tenant's plan AND the role grants the action on it.
 * The two halves must not be evaluated independently — gating the plan with
 * `pairs.some(([mod]) => planIncludesModule(tenant, mod))` let a role pass on
 * `billing:delete` while only `accounting` was in the plan, i.e. a permission
 * exercised on a module the clinic never bought. The same hole let an
 * `emr:read` holder read `/users/doctors` on an appointments-only plan.
 */
export function checkAnyPermission(pairs) {
  return async function anyPermissionMiddleware(req, _res, next) {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Not authenticated'));
      }

      if (!req._roleResolved) {
        req._roleResolved = await resolveRole(req);
      }

      const { isSystemAdmin, permissionMap } = req._roleResolved;
      // System admins bypass the plan gate and the permission matrix.
      if (isSystemAdmin) return next();
      if (!req.user.tenant) {
        return next(ApiError.forbidden('Clinic context is missing. Please log in again.'));
      }

      const perms = permissionMap();
      const holds = ([mod, act]) => (perms[mod] || []).includes(act);
      const inPlan = ([mod]) => planIncludesModule(req.user.tenant, mod);

      if (pairs.some((pair) => inPlan(pair) && holds(pair))) {
        return next();
      }

      // The role holds one of the actions but on a module the plan excludes —
      // report the upgrade path instead of a bare permission denial, so the
      // clinic admin sees why the entitlement they configured is inert.
      const unplanned = pairs.find((pair) => holds(pair) && !inPlan(pair));
      if (unplanned) {
        return next(
          ApiError.forbidden(
            `Your plan does not include the ${unplanned[0]} module. Contact your platform administrator to upgrade.`,
          ),
        );
      }

      const label = pairs.map(([m, a]) => `${a} ${m}`).join(' or ');
      return next(ApiError.forbidden(`You do not have permission to ${label}`));
    } catch (err) {
      return next(err);
    }
  };
}
