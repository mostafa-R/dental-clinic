/**
 * Site Admin permissions — for the super-admin / platform dashboard only.
 * These are independent of the clinic RBAC modules defined in
 * server/constants/permissions.js (which govern tenant-level access).
 * This file is the source of truth for site-admin permission strings.
 */
import { SITE_ROLES } from "./roles.js";

const { SUPER_ADMIN, ADMIN, SUPPORT } = SITE_ROLES;

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

// Default role permissions
export const ROLE_PERMISSIONS = {
  super_admin: {
    description: "Full system access",
    permissions: Object.values(SITE_PERMISSIONS),
  },
  admin: {
    description: "Platform administrator with limited access",
    permissions: [
      SITE_PERMISSIONS.TENANTS_VIEW,
      SITE_PERMISSIONS.TENANTS_CREATE,
      SITE_PERMISSIONS.TENANTS_UPDATE,
      SITE_PERMISSIONS.SUBSCRIPTIONS_VIEW,
      SITE_PERMISSIONS.SUBSCRIPTIONS_UPDATE,
      SITE_PERMISSIONS.ANALYTICS_VIEW,
      SITE_PERMISSIONS.SETTINGS_VIEW,
    ],
  },
  support: {
    description: "Support staff with read-only access",
    permissions: [
      SITE_PERMISSIONS.TENANTS_VIEW,
      SITE_PERMISSIONS.SUBSCRIPTIONS_VIEW,
      SITE_PERMISSIONS.ANALYTICS_VIEW,
    ],
  },
};

// Check if user has permission
export const hasPermission = (userPermissions, permission) => {
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  return userPermissions.includes(permission);
};

// Check if user has any of the permissions
export const hasAnyPermission = (userPermissions, permissions) => {
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  return permissions.some((p) => userPermissions.includes(p));
};

// Check if user has all permissions
export const hasAllPermissions = (userPermissions, permissions) => {
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  return permissions.every((p) => userPermissions.includes(p));
};

// Resolve a site admin's effective permissions. Mirrors the backend
// effectiveSitePermissions(role, permissions) rule: stored permissions win,
// otherwise fall back to the role defaults. super_admin is always full access.
export function getEffectivePermissions(user) {
  if (!user) return [];
  const { role, permissions } = user;
  if (role === SUPER_ADMIN) return Object.values(SITE_PERMISSIONS);
  if (Array.isArray(permissions) && permissions.length > 0) return permissions;
  return ROLE_PERMISSIONS[role]?.permissions || [];
}

// Access map for the dashboard UI (navigation, routes and actions).
// Keyed entries mirror the backend authorizeSite(...) role lists for the
// underlying endpoints — no permission mapping is invented here. Where the
// frontend has a 1:1 permission string for an action it is attached so that
// hasPermission/hasAnyPermission are exercised directly.
export const SITE_ACCESS = {
  // ---- Pages / routes (mirror GET endpoints) ----
  dashboard: { roles: [SUPER_ADMIN, ADMIN, SUPPORT] },
  tenants: { roles: [SUPER_ADMIN, ADMIN, SUPPORT] },
  branches: { roles: [SUPER_ADMIN, ADMIN, SUPPORT] },
  plans: { roles: [SUPER_ADMIN, ADMIN, SUPPORT] },
  billing: { roles: [SUPER_ADMIN, ADMIN, SUPPORT] },
  analytics: { roles: [SUPER_ADMIN, ADMIN, SUPPORT] },
  admins: { roles: [SUPER_ADMIN, ADMIN] },
  auditLogs: { roles: [SUPER_ADMIN, ADMIN, SUPPORT] },
  errorLogs: { roles: [SUPER_ADMIN, ADMIN] },
  featureFlags: { roles: [SUPER_ADMIN, ADMIN] },
  health: { roles: [SUPER_ADMIN] },
  quarantine: { roles: [SUPER_ADMIN, ADMIN] },
  backups: { roles: [SUPER_ADMIN, ADMIN] },
  performance: { roles: [SUPER_ADMIN, ADMIN] },
  settings: { roles: [SUPER_ADMIN, ADMIN, SUPPORT] },

  // ---- Tenant management actions (strict: role-list only, no overlap fallback)
  "tenants.create": {
    roles: [SUPER_ADMIN, ADMIN],
    permission: SITE_PERMISSIONS.TENANTS_CREATE,
    strict: true,
  },
  "tenants.update": {
    roles: [SUPER_ADMIN, ADMIN],
    permission: SITE_PERMISSIONS.TENANTS_UPDATE,
    strict: true,
  },
  "tenants.suspend": { roles: [SUPER_ADMIN, ADMIN], strict: true },
  "tenants.activate": { roles: [SUPER_ADMIN, ADMIN], strict: true },
  "tenants.archive": { roles: [SUPER_ADMIN], strict: true },
  "tenants.delete": { roles: [SUPER_ADMIN], strict: true },
  "tenants.usage": { roles: [SUPER_ADMIN, ADMIN, SUPPORT], strict: true },
  "tenants.impersonate": { roles: [SUPER_ADMIN, ADMIN], strict: true },

  // ---- Branch management actions ----
  "branches.create": { roles: [SUPER_ADMIN, ADMIN], strict: true },
  "branches.update": { roles: [SUPER_ADMIN, ADMIN], strict: true },
  "branches.delete": { roles: [SUPER_ADMIN], strict: true },

  // ---- Billing actions ----
  "billing.update": { roles: [SUPER_ADMIN], strict: true },
  "billing.payment": { roles: [SUPER_ADMIN, ADMIN], strict: true },

  // ---- Plans management actions ----
  "plans.create": {
    roles: [SUPER_ADMIN],
    permission: SITE_PERMISSIONS.PLANS_CREATE,
    strict: true,
  },
  "plans.update": {
    roles: [SUPER_ADMIN],
    permission: SITE_PERMISSIONS.PLANS_UPDATE,
    strict: true,
  },
  "plans.delete": {
    roles: [SUPER_ADMIN],
    permission: SITE_PERMISSIONS.PLANS_DELETE,
    strict: true,
  },

  // ---- Admin management actions (permission assignment included) ----
  "admins.create": {
    roles: [SUPER_ADMIN],
    permission: SITE_PERMISSIONS.ADMINS_CREATE,
    strict: true,
  },
  "admins.update": {
    roles: [SUPER_ADMIN],
    permission: SITE_PERMISSIONS.ADMINS_UPDATE,
    strict: true,
  },
  "admins.delete": {
    roles: [SUPER_ADMIN],
    permission: SITE_PERMISSIONS.ADMINS_DELETE,
    strict: true,
  },

  // ---- Security / ops actions ----
  "quarantine.set": { roles: [SUPER_ADMIN], strict: true },
  "quarantine.remove": { roles: [SUPER_ADMIN], strict: true },
  "backups.trigger": { roles: [SUPER_ADMIN], strict: true },
  "performance.reset": { roles: [SUPER_ADMIN], strict: true },
  "featureFlags.toggle": { roles: [SUPER_ADMIN], strict: true },
  "settings.update": { roles: [SUPER_ADMIN], strict: true },
};

// Can a site admin access a route / nav item / action keyed by SITE_ACCESS?
// super_admin bypasses every check. Non-super-admin roles must (a) be in the
// entry role list, or (b) have an effective permission overlapping the default
// permissions of the allowed roles — the same permissive fallback the backend
// authorizeSite middleware applies.
export function canUserAccess(user, accessOrKey) {
  if (!user) return false;
  const access =
    typeof accessOrKey === "string" ? SITE_ACCESS[accessOrKey] : accessOrKey;
  if (!access) return false;

  const role = user.role;
  if (role === SUPER_ADMIN) return true;

  const effective = getEffectivePermissions(user);
  if (access.permission && !hasPermission(effective, access.permission)) {
    return false;
  }

  if (access.roles && access.roles.length > 0 && access.roles.includes(role)) {
    return true;
  }

  if (access.strict) {
    return false;
  }

  const required = new Set(
    (access.roles || [])
      .filter((r) => r !== SUPER_ADMIN)
      .flatMap((r) => ROLE_PERMISSIONS[r]?.permissions || []),
  );
  if (required.size > 0) {
    return hasAnyPermission(effective, [...required]);
  }
  return false;
}
