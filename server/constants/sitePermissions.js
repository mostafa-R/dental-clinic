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

  // Platform analytics (system-wide, aggregated). `analytics:view` is the
  // coarse legacy grant; the finer `platform:*` / `analytics:*` strings below
  // gate individual dashboards. super_admin bypasses all of them.
  PLATFORM_OVERVIEW_VIEW: "platform:overview:view",
  FINANCIAL_VIEW: "financial:view",
  INVENTORY_VIEW: "inventory:view",
  PATIENT_ANALYTICS_VIEW: "patient:analytics:view",
  APPOINTMENTS_VIEW: "appointments:view",
  DOCTORS_VIEW: "doctors:view",
  TREATMENTS_VIEW: "treatments:view",
  USAGE_VIEW: "usage:view",
  ACTIVITY_VIEW: "activity:view",
  SAAS_BILLING_VIEW: "saas-billing:view",
  SECURITY_VIEW: "security:view",
  REPORTS_EXPORT: "reports:export",

  // Raw protected-health-information access (L2). Never part of any role
  // default — only super_admin (implicitly) or an explicit super_admin-granted
  // permission may reach PHI-bearing endpoints, and those endpoints audit.
  PATIENT_PHI_VIEW: "patient:phi:view",
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
    SITE_PERMISSIONS.PLATFORM_OVERVIEW_VIEW,
    SITE_PERMISSIONS.FINANCIAL_VIEW,
    SITE_PERMISSIONS.INVENTORY_VIEW,
    SITE_PERMISSIONS.PATIENT_ANALYTICS_VIEW,
    SITE_PERMISSIONS.APPOINTMENTS_VIEW,
    SITE_PERMISSIONS.DOCTORS_VIEW,
    SITE_PERMISSIONS.TREATMENTS_VIEW,
    SITE_PERMISSIONS.USAGE_VIEW,
    SITE_PERMISSIONS.ACTIVITY_VIEW,
    SITE_PERMISSIONS.SAAS_BILLING_VIEW,
  ],
  support: [
    SITE_PERMISSIONS.TENANTS_VIEW,
    SITE_PERMISSIONS.SUBSCRIPTIONS_VIEW,
    SITE_PERMISSIONS.ANALYTICS_VIEW,
    SITE_PERMISSIONS.PLATFORM_OVERVIEW_VIEW,
    SITE_PERMISSIONS.PATIENT_ANALYTICS_VIEW,
    SITE_PERMISSIONS.APPOINTMENTS_VIEW,
    SITE_PERMISSIONS.USAGE_VIEW,
    SITE_PERMISSIONS.ACTIVITY_VIEW,
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
