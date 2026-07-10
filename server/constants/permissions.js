/**
 * System modules and CRUD actions for the dynamic RBAC permission matrix.
 *
 * Each module is a protected resource. The permission matrix grants or denies
 * CRUD actions per module per role. This is the single source of truth — both
 * the backend (checkPermission middleware) and the frontend (permission matrix
 * UI) reference these lists.
 */

export const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'];

/**
 * Every module the system protects. The `key` is stored in the permission
 * document; `label` is shown in the UI; `roles` is the set of built-in roles
 * that get full CRUD by default when seeding (acts as a fallback so the system
 * keeps working even before custom roles are explicitly created).
 */
export const MODULES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'patients',
    label: 'Patients',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'appointments',
    label: 'Appointments',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'billing',
    label: 'Billing & Invoices',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'accounting',
    label: 'Accounting & Finance',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'emr',
    label: 'Medical Records (EMR)',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'prescriptions',
    label: 'Prescriptions',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'users',
    label: 'Staff & Users',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'branches',
    label: 'Branches',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'settings',
    label: 'Settings',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'roles',
    label: 'Roles & Permissions',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
  {
    key: 'chat',
    label: 'Clinic Chat',
    defaultRoles: ['site_admin', 'clinic_admin'],
  },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);