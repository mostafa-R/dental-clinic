/**
 * Site Admin permissions — platform-level RBAC strings, independent of the
 * tenant-level clinic RBAC modules (constants/permissions.js).
 *
 * This file is the server-side source of truth and mirrors the dashboard's
 * SITE_PERMISSIONS / ROLE_PERMISSIONS (dashboard/src/lib/permissions.js).
 *
 * Semantics:
 * - `super_admin` is always granted full access (bypasses the permission check).
 * - Every other role has a default permission set (ROLE_PERMISSIONS[role]).
 * - An admin whose stored `permissions` array is non-empty uses exactly that
 *   array as their effective permission set; an empty array falls back to the
 *   role default, so accounts created without explicit permissions keep their
 *   role's baseline grants.
 */

export const SITE_PERMISSIONS = {
  // Tenant Management
  TENANTS_VIEW: "tenants:view",
  TENANTS_CREATE: "tenants:create",
  TENANTS_UPDATE: "tenants:update",
  TENANTS_DELETE: "tenants:delete",
  TENANTS_SUSPEND: "tenants:suspend",
  TENANTS_ACTIVATE: "tenants:activate",

  // Subscription Management
  SUBSCRIPTIONS_VIEW: "subscriptions:view",
  SUBSCRIPTIONS_UPDATE: "subscriptions:update",
  SUBSCRIPTIONS_MANAGE_PAYMENTS: "subscriptions:manage_payments",

  // Analytics
  ANALYTICS_VIEW: "analytics:view",
  ANALYTICS_EXPORT: "analytics:export",

  // Admin Management
  ADMINS_VIEW: "admins:view",
  ADMINS_CREATE: "admins:create",
  ADMINS_UPDATE: "admins:update",
  ADMINS_DELETE: "admins:delete",

  // Platform Settings
  SETTINGS_VIEW: "settings:view",
  SETTINGS_UPDATE: "settings:update",

  // Plans Management
  PLANS_VIEW: "plans:view",
  PLANS_CREATE: "plans:create",
  PLANS_UPDATE: "plans:update",
  PLANS_DELETE: "plans:delete",
};

export const ALL_SITE_PERMISSIONS = Object.values(SITE_PERMISSIONS);

export const SITE_ROLE_DEFAULT_PERMISSIONS = {
  super_admin: ALL_SITE_PERMISSIONS,
  admin: [
    SITE_PERMISSIONS.TENANTS_VIEW,
    SITE_PERMISSIONS.TENANTS_CREATE,
    SITE_PERMISSIONS.TENANTS_UPDATE,
    SITE_PERMISSIONS.SUBSCRIPTIONS_VIEW,
    SITE_PERMISSIONS.SUBSCRIPTIONS_UPDATE,
    SITE_PERMISSIONS.ANALYTICS_VIEW,
    SITE_PERMISSIONS.SETTINGS_VIEW,
  ],
  support: [
    SITE_PERMISSIONS.TENANTS_VIEW,
    SITE_PERMISSIONS.SUBSCRIPTIONS_VIEW,
    SITE_PERMISSIONS.ANALYTICS_VIEW,
  ],
};

/**
 * Effective permission set for a site admin. A stored non-empty `permissions`
 * array overrides the role default; an empty array falls back to the role
 * default so legacy accounts are never silently locked out.
 */
export function effectiveSitePermissions(role, storedPermissions = []) {
  if (role === "super_admin") return ALL_SITE_PERMISSIONS;
  if (Array.isArray(storedPermissions) && storedPermissions.length > 0) {
    return storedPermissions;
  }
  return SITE_ROLE_DEFAULT_PERMISSIONS[role] || [];
}

/**
 * Sanitize a raw permissions array down to known permission strings.
 */
export function normalizeSitePermissions(permissions = []) {
  if (!Array.isArray(permissions)) return [];
  const known = new Set(ALL_SITE_PERMISSIONS);
  return [...new Set(permissions)].filter((p) => known.has(p));
}
