import { useSelector } from 'react-redux';
import { t } from './i18n';

const ROLE_LABELS = {
  site_admin: 'Site Admin',
  clinic_admin: 'Clinic Admin',
};

export function roleLabel(role) {
  if (!role) return role;
  const translated = t(`role.${role}`);
  return translated !== `role.${role}` ? translated : ROLE_LABELS[role] || role;
}

export function defaultRouteFor(role) {
  switch (role) {
    case 'doctor':
      return '/appointments';
    case 'accountant':
    case 'receptionist':
      return '/billing';
    default:
      return '/dashboard';
  }
}

/**
 * Pure permission predicate — the single source of truth for every
 * "can the current user do X" decision in the clinic UI.
 *
 * Mirrors the server gate in `middleware/checkPermission.js`: a role grant is
 * necessary but not sufficient, the tenant's plan must also include the module.
 *
 * @param {object|null} myPermissions - `state.users.myPermissions`
 * @param {string} module - module key from `server/constants/permissions.js`
 * @param {...string} actions - required actions. Omit for "any action on the
 *   module" (read-only visibility). When one or more are given the user needs
 *   **at least one** of them — a role granted only `create` must still see the
 *   controls it was actually granted, so this is `some`, never `every`.
 * @returns {boolean}
 */
export function checkModuleAccess(myPermissions, module, ...actions) {
  if (!myPermissions) return false;
  if (myPermissions.isSystemAdmin) return true;
  // Subscription entitlement first: a module outside the tenant's plan stays
  // hidden even when the role document technically grants it.
  if (Array.isArray(myPermissions.planModules) && module && !myPermissions.planModules.includes(module)) {
    return false;
  }
  const perms = myPermissions.permissions?.[module];
  if (!perms || perms.length === 0) return false;
  if (actions.length === 0) return true;
  return actions.some((a) => perms.includes(a));
}

/**
 * Reactive permission check. Subscribes to the store so a component re-renders
 * the moment `myPermissions` resolves (or is refreshed after a plan downgrade)
 * instead of waiting for an unrelated state change to force a repaint.
 */
export function usePermission(module, ...actions) {
  const myPermissions = useSelector((s) => s.users?.myPermissions);
  return checkModuleAccess(myPermissions, module, ...actions);
}

/* ---------------------------------------------------------------------------
 * Named permission hooks.
 *
 * Each is a thin wrapper over `usePermission`, so it obeys the rules of hooks:
 * call it unconditionally at the top level of a component, never inside a
 * callback, an effect, a loop, or a JSX expression. Hoist the result into a
 * variable and put that variable in the effect dependency array instead
 * (see `pages/Billing.jsx` for the reference pattern).
 *
 * They are named with a `use` prefix precisely so lint and the compiler can
 * treat them as hooks rather than as ordinary helpers.
 * ------------------------------------------------------------------------- */

export function useCanManagePatients() {
  return usePermission('patients', 'create', 'update', 'delete');
}

export function useCanViewBilling() {
  return usePermission('billing');
}

export function useCanManageBilling() {
  return usePermission('billing', 'create', 'update', 'delete');
}

export function useCanVoidBilling() {
  return usePermission('billing', 'delete');
}

export function useCanViewEmr() {
  return usePermission('emr');
}

export function useCanManageEmr() {
  return usePermission('emr', 'create', 'update', 'delete');
}

export function useCanManagePrescriptions() {
  return usePermission('prescriptions', 'create', 'update', 'delete');
}

export function useCanManageAppointments() {
  return usePermission('appointments', 'create', 'update', 'delete');
}

export function useCanViewAccounting() {
  return usePermission('accounting');
}

export function useCanManageAccounting() {
  return usePermission('accounting', 'create', 'update', 'delete');
}

export function useCanViewInventory() {
  return usePermission('inventory');
}

export function useCanManageInventory() {
  return usePermission('inventory', 'create', 'update', 'delete');
}

export function useCanViewRoles() {
  return usePermission('roles');
}

export function useCanManageRoles() {
  return usePermission('roles', 'create', 'update', 'delete');
}

export function useCanViewUsers() {
  return usePermission('users');
}

export function useCanManageUsers() {
  return usePermission('users', 'create', 'update', 'delete');
}

export function useCanManageBranches() {
  return usePermission('branches', 'create', 'update', 'delete');
}

/* Create-only checks — used to gate "new record" entry points, which a
 * create-only role must be able to reach. */

export function useCanCreatePatients() {
  return usePermission('patients', 'create');
}

export function useCanCreateAppointments() {
  return usePermission('appointments', 'create');
}

export function useCanCreateInvoices() {
  return usePermission('billing', 'create');
}
