// Site Dashboard Roles (for platform administrators)
export const SITE_ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  SUPPORT: "support",
};

// Clinic Dashboard Roles (for tenant users)
export const CLINIC_ROLES = {
  CLINIC_ADMIN: "clinic_admin",
  DOCTOR: "doctor",
  ASSISTANT: "assistant",
  RECEPTIONIST: "receptionist",
  ACCOUNTANT: "accountant",
  INVENTORY_MANAGER: "inventory_manager",
};

// Permission levels for site dashboard
export const SITE_PERMISSIONS = {
  MANAGE_TENANTS: "manage_tenants",
  MANAGE_SUBSCRIPTIONS: "manage_subscriptions",
  MANAGE_BILLING: "manage_billing",
  VIEW_ANALYTICS: "view_analytics",
  MANAGE_ADMINS: "manage_admins",
  SYSTEM_SETTINGS: "system_settings",
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
