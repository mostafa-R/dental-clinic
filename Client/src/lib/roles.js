import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { t } from './i18n';
import { DEFAULT_LANDING_PATH, NAV_ITEMS, ROLE_LANDING_PREFERENCE, moduleForPath } from './routes';
import { fetchMyPermissions } from '../features/users/userSlice';

const ROLE_LABELS = {
  site_admin: 'Site Admin',
  clinic_admin: 'Clinic Admin',
};

export function roleLabel(role) {
  if (!role) return role;
  const translated = t(`role.${role}`);
  return translated !== `role.${role}` ? translated : ROLE_LABELS[role] || role;
}

/**
 * Why a module is reachable. The denial reason is what lets the guard tell the
 * user "your plan does not include this" instead of a generic error, and it is
 * why `checkModuleAccess` is a thin wrapper rather than the primary function.
 *
 * - `granted`     — the module is visible
 * - `plan`        — the tenant's subscription does not include the module
 * - `permission`  — the module is in the plan but the role grants nothing usable
 * - `unknown`     — the permissions payload has not resolved (or failed)
 */
export function moduleAccessStatus(myPermissions, module, ...actions) {
  if (!myPermissions) return 'unknown';
  if (myPermissions.isSystemAdmin) return 'granted';
  // Subscription entitlement first: a module outside the tenant's plan stays
  // hidden even when the role document technically grants it.
  if (Array.isArray(myPermissions.planModules) && module && !myPermissions.planModules.includes(module)) {
    return 'plan';
  }
  const perms = myPermissions.permissions?.[module];
  if (!perms || perms.length === 0) return 'permission';
  if (actions.length === 0) return 'granted';
  return actions.some((a) => perms.includes(a)) ? 'granted' : 'permission';
}

/**
 * Pure permission predicate — the single source of truth for every
 * "can the current user do X" decision in the clinic UI: the URL guard, the
 * sidebar filter, dashboard cards and every button-level check.
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
  return moduleAccessStatus(myPermissions, module, ...actions) === 'granted';
}

/**
 * The page to land on: the role's usual one when it is actually reachable,
 * otherwise the first sidebar entry the user can open.
 *
 * This is what removed the redirect loop in the old `defaultRouteFor`, which
 * sent every `doctor` to `/appointments` regardless of grants — so a doctor
 * without the `appointments` module was bounced off it and then off
 * `/dashboard` in turn, forever.
 *
 * @param {object|null} myPermissions
 * @param {string} [role] - only a preference, never a guarantee
 * @returns {string} a path the user is allowed to see, or `DEFAULT_LANDING_PATH`
 *   when nothing is known yet (public pages, permissions still loading)
 */
export function landingPathFor(myPermissions, role) {
  const preferred = ROLE_LANDING_PREFERENCE[role];
  if (preferred && checkModuleAccess(myPermissions, moduleForPath(preferred))) {
    return preferred;
  }
  const firstAccessible = NAV_ITEMS.find((route) =>
    checkModuleAccess(myPermissions, route.module),
  );
  return firstAccessible ? firstAccessible.path : DEFAULT_LANDING_PATH;
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

/** The permission-aware landing path for the signed-in user. */
export function useLandingPath() {
  const myPermissions = useSelector((s) => s.users?.myPermissions);
  const role = useSelector((s) => s.auth?.user?.role);
  return landingPathFor(myPermissions, role);
}

/**
 * Keep `myPermissions` fresh for the life of the session.
 *
 * Without this, `permissionsStatus === 'idle'` fires exactly once and a plan
 * downgrade or a role edit made by an admin leaves every open tab showing the
 * full previous UI until a hard reload — the server keeps returning 403, so it
 * is a stale-UI problem rather than a security hole, but the menu, the URL guard
 * and the dashboard cards all disagree with the backend until then.
 *
 * Refetched on window focus, on tab visibility, and on a slow interval; each
 * trigger is skipped while a fetch is already in flight.
 */
export function usePermissionRevalidation(intervalMs = 5 * 60 * 1000) {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth?.user);
  const permissionsStatus = useSelector((s) => s.users?.permissionsStatus);

  useEffect(() => {
    if (!user || permissionsStatus === 'loading') return undefined;

    const revalidate = () => {
      if (document.visibilityState === 'hidden') return;
      dispatch(fetchMyPermissions());
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') revalidate();
    };

    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(revalidate, intervalMs);

    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [dispatch, user, permissionsStatus, intervalMs]);
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

export function useCanManageAccounting() {
  return usePermission('accounting', 'create', 'update', 'delete');
}

export function useCanManageInventory() {
  return usePermission('inventory', 'create', 'update', 'delete');
}

export function useCanManageRoles() {
  return usePermission('roles', 'create', 'update', 'delete');
}

export function useCanManageUsers() {
  return usePermission('users', 'create', 'update', 'delete');
}

export function useCanManageBranches() {
  return usePermission('branches', 'create', 'update', 'delete');
}

/** WhatsApp connect/disconnect/save are all `settings:update` on the server. */
export function useCanManageSettings() {
  return usePermission('settings', 'create', 'update', 'delete');
}

/**
 * Is the current user clinic-wide, i.e. does the UI need to offer a branch
 * picker because the server will expect an explicit branch on create?
 *
 * This is NOT the same question as `isSystemAdmin`, and conflating the two
 * breaks record creation. `resolveBranchForCreate` on the server requires an
 * explicit `branch` for any clinic-wide caller, so a role that qualifies here
 * but renders no branch field produces a form that always submits without a
 * branch and fails with "branch is required" — for the clinic manager on every
 * patient, appointment and invoice.
 *
 * Mirrors `isClinicWideRole` in `server/middleware/checkPermission.js`: a role
 * that can read/update/delete branches manages the clinic's branch structure
 * and is therefore clinic-wide. Platform roles qualify via `isSystemAdmin`.
 *
 * The branch module is checked *without* the plan gate on purpose: a clinic
 * whose plan omits `branches` still has branches, its manager still operates
 * across all of them, and hiding the picker would reintroduce the same 400.
 *
 * @param {object|null} myPermissions - `state.users.myPermissions`
 * @returns {boolean}
 */
export function isClinicWide(myPermissions) {
  if (!myPermissions) return false;
  if (myPermissions.isSystemAdmin) return true;
  const branchActions = myPermissions.permissions?.branches;
  if (!Array.isArray(branchActions)) return false;
  return ['read', 'update', 'delete'].some((action) => branchActions.includes(action));
}

/** Reactive clinic-wide check — see {@link isClinicWide}. */
export function useIsClinicWide() {
  const myPermissions = useSelector((s) => s.users?.myPermissions);
  return isClinicWide(myPermissions);
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
