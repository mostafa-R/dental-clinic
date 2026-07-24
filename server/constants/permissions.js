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
 * document; `label` is shown in the UI. All role assignments are dynamic —
 * managed via the RBAC UI (Role collection). System admin access is determined
 * by the Role document's `isSystemAdmin` flag, never by hardcoded strings.
 */
export const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'patients', label: 'Patients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'billing', label: 'Billing & Invoices' },
  { key: 'accounting', label: 'Accounting & Finance' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'emr', label: 'Medical Records (EMR)' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'users', label: 'Staff & Users' },
  { key: 'branches', label: 'Branches' },
  { key: 'settings', label: 'Settings' },
  { key: 'roles', label: 'Roles & Permissions' },
  { key: 'chat', label: 'Clinic Chat' },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);