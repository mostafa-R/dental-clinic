/**
 * Site Admin permissions — for the super-admin / platform dashboard only.
 * These are independent of the clinic RBAC modules defined in
 * server/constants/permissions.js (which govern tenant-level access).
 * This file is the source of truth for site-admin permission strings.
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
