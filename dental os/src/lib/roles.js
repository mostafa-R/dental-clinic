import { t } from './i18n';
import { store } from '../app/store';

const ROLE_LABELS = {
  site_admin: 'Site Admin',
  clinic_admin: 'Clinic Admin',
};

export function roleLabel(role) {
  if (!role) return role;
  const translated = t(`role.${role}`);
  return translated !== `role.${role}` ? translated : ROLE_LABELS[role] || role;
}

export function defaultRouteFor() {
  return '/dashboard';
}

function hasModuleAction(module, ...actions) {
  const state = store.getState();
  const mp = state.users?.myPermissions;
  if (!mp) return false;
  if (mp.isSystemAdmin) return true;
  const perms = mp.permissions?.[module];
  if (!perms || perms.length === 0) return false;
  if (actions.length === 0) return perms.length > 0;
  return actions.some((a) => perms.includes(a));
}

export function canManagePatients() {
  return hasModuleAction('patients', 'create', 'update', 'delete');
}

export function canViewBilling() {
  return hasModuleAction('billing');
}

export function canManageBilling() {
  return hasModuleAction('billing', 'create', 'update', 'delete');
}

export function canVoidBilling() {
  return hasModuleAction('billing', 'delete');
}

export function canViewEmr() {
  return hasModuleAction('emr');
}

export function canManageEmr() {
  return hasModuleAction('emr', 'create', 'update', 'delete');
}

export function canManagePrescriptions() {
  return hasModuleAction('prescriptions', 'create', 'update', 'delete');
}

export function canManageAppointments() {
  return hasModuleAction('appointments', 'create', 'update', 'delete');
}

export function canViewAccounting() {
  return hasModuleAction('accounting');
}

export function canManageAccounting() {
  return hasModuleAction('accounting', 'create', 'update', 'delete');
}

export function canViewInventory() {
  return hasModuleAction('inventory');
}

export function canManageInventory() {
  return hasModuleAction('inventory', 'create', 'update', 'delete');
}

export function canViewRoles() {
  return hasModuleAction('roles');
}

export function canManageRoles() {
  return hasModuleAction('roles', 'create', 'update', 'delete');
}

export function canViewUsers() {
  return hasModuleAction('users');
}

export function canManageUsers() {
  return hasModuleAction('users', 'create', 'update', 'delete');
}

export function canManageBranches() {
  return hasModuleAction('branches', 'create', 'update', 'delete');
}
