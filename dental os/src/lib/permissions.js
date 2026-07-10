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
  { key: 'chat', label: 'Chat' },
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
