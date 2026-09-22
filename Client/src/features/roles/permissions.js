/**
 * Clinic permission definitions — mirrors the backend source of truth at
 * `server/constants/permissions.js`.  Both `CRUD_ACTIONS` and `MODULES` must
 * stay in sync with that file.  If you add or remove a module, update both.
 *
 * SINGLE SOURCE OF TRUTH: server/constants/permissions.js
 * This file is a frontend-only copy for the Dental OS clinic UI.
 * TODO: Consider extracting to a shared package to eliminate duplication.
 */

export const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'];

export const CRUD_LABELS = {
  create: 'Create',
  read: 'Read',
  update: 'Update',
  delete: 'Delete',
};

export const CRUD_SHORT = {
  create: 'C',
  read: 'R',
  update: 'U',
  delete: 'D',
};

/** Must match MODULES in server/constants/permissions.js (21 entries).
 * Frontend copy only for first-paint/offline — the server list from
 * GET /roles/modules/list always wins at runtime (see Roles.jsx). */
export const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'patients', label: 'Patients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'billing', label: 'Billing & Invoices' },
  { key: 'accounting', label: 'Accounting & Finance' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'emr', label: 'Medical Records (EMR)' },
  { key: 'treatment_plans', label: 'Treatment Plans' },
  { key: 'dental_chart', label: 'Dental Chart' },
  { key: 'clinical_notes', label: 'Clinical Notes' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'queue', label: 'Queue & Waitlist' },
  { key: 'installments', label: 'Installments & Payments' },
  { key: 'platform_settings', label: 'Platform Settings' },
  { key: 'users', label: 'Staff & Users' },
  { key: 'branches', label: 'Branches' },
  { key: 'settings', label: 'Clinic Settings' },
  { key: 'roles', label: 'Roles & Permissions' },
  { key: 'chat', label: 'Clinic Chat' },
  { key: 'consents', label: 'Consents & E-Signature' },
  { key: 'automations', label: 'Automation Rules' },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

export function moduleLabel(key) {
  const m = MODULES.find((mod) => mod.key === key);
  return m ? m.label : key;
}

export function hasPermission(roles, roleKey, module, action) {
  const role = roles?.find((r) => r.key === roleKey || r.name === roleKey);
  if (!role) return false;
  if (role.isSystemAdmin) return true;
  const perm = role.permissions?.find((p) => p.module === module);
  if (!perm) return false;
  return perm.actions?.includes(action);
}
