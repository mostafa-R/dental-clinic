import ApiError from './ApiError.js';

/**
 * Throws a 403 when the caller would grant an action they do not themselves
 * hold on a module. System admins are exempt (they already bypass every check).
 * This is the privilege-escalation guard shared by role create/update paths.
 */
export function assertCanGrantPermissions(userPermissionMap, permissions, { isSystemAdmin = false } = {}) {
  if (isSystemAdmin) return;
  const userPerms = userPermissionMap || {};
  for (const perm of permissions || []) {
    const granted = (perm && perm.actions) || [];
    if (!granted.length) continue;
    const held = userPerms[perm.module] || [];
    for (const action of granted) {
      if (!held.includes(action)) {
        throw ApiError.forbidden(`You cannot grant ${action} permission on ${perm.module} module`);
      }
    }
  }
}

/**
 * Build a Role query that bounds the target role to the caller's own tenant.
 * Platform users (no tenant) are unrestricted; tenant users can only ever
 * touch roles stamped with their own tenant (never another clinic's and never
 * platform-level roles).
 */
export function scopedRoleQuery(req, id) {
  const rawTenant = req.user?.tenant;
  const tenantId = rawTenant?._id ? String(rawTenant._id) : rawTenant ? String(rawTenant) : null;
  const query = { _id: id };
  if (tenantId) query.tenant = tenantId;
  return query;
}