/**
 * Site Dashboard constants — role names and tenant status for the platform
 * admin UI.  Note: SITE_PERMISSIONS lives in lib/permissions.js (the source
 * of truth for site-admin permission strings).  Clinic-level roles are
 * managed dynamically via the backend RBAC system and are NOT hardcoded here.
 */

export const SITE_ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  SUPPORT: "support",
};

// Tenant status
export const TENANT_STATUS = {
  ACTIVE: "active",
  TRIAL: "trial",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
};

// Subscription plans (kept for backward compat, prefer Plan model)
export const PLANS = {
  STARTER: "starter",
  PROFESSIONAL: "professional",
  ENTERPRISE: "enterprise",
};
