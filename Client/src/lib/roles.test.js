// @vitest-environment node
/**
 * Unit tests for the permission predicate in `lib/roles.js`. Node environment
 * on purpose: `checkModuleAccess`, `moduleAccessStatus` and `landingPathFor`
 * are pure, so they need neither a DOM nor a Redux store. The reactive
 * `usePermission` / `useLandingPath` hooks are exercised by the UI, not here.
 */
import { describe, expect, it } from 'vitest';

import { checkModuleAccess, isClinicWide, landingPathFor, moduleAccessStatus, roleLabel } from './roles';
import { NAV_ITEMS, NAV_ROUTES, moduleForPath } from './routes';

/** Build a `myPermissions` payload the way `state.users.myPermissions` looks. */
const perms = (permissions, planModules, isSystemAdmin = false) => ({
  permissions,
  planModules,
  isSystemAdmin,
});

const FULL_PLAN = ['patients', 'appointments', 'billing', 'emr', 'inventory', 'accounting', 'roles', 'users', 'branches'];

describe('checkModuleAccess - action semantics', () => {
  it('grants when the role holds any one of the required actions', () => {
    // The original bug ANDed the action list, so a create-only role was shown
    // nothing at all. A grant on a single action must be enough.
    const p = perms({ patients: ['create'] }, FULL_PLAN);
    expect(checkModuleAccess(p, 'patients', 'create', 'update', 'delete')).toBe(true);
  });

  it('grants an update-only role the controls it was actually given', () => {
    const p = perms({ patients: ['update'] }, FULL_PLAN);
    expect(checkModuleAccess(p, 'patients', 'create', 'update', 'delete')).toBe(true);
    expect(checkModuleAccess(p, 'patients', 'create')).toBe(false);
  });

  it('denies when the role holds none of the required actions', () => {
    const p = perms({ patients: ['read'] }, FULL_PLAN);
    expect(checkModuleAccess(p, 'patients', 'create', 'update', 'delete')).toBe(false);
  });

  it('treats a read-only role as unable to create', () => {
    const p = perms({ patients: ['read'] }, FULL_PLAN);
    expect(checkModuleAccess(p, 'patients', 'create')).toBe(false);
  });

  it('grants on module visibility when no action is requested', () => {
    const p = perms({ billing: ['read'] }, FULL_PLAN);
    expect(checkModuleAccess(p, 'billing')).toBe(true);
  });

  it('denies visibility for a module the role does not touch', () => {
    const p = perms({ patients: ['read'] }, FULL_PLAN);
    expect(checkModuleAccess(p, 'billing')).toBe(false);
  });
});

describe('checkModuleAccess - subscription gate', () => {
  it('denies a module the tenant plan does not include', () => {
    const p = perms({ billing: ['read', 'create'] }, ['patients', 'appointments']);
    expect(checkModuleAccess(p, 'billing', 'read')).toBe(false);
  });

  it('grants a module the tenant plan does include', () => {
    const p = perms({ patients: ['read'] }, ['patients']);
    expect(checkModuleAccess(p, 'patients', 'read')).toBe(true);
  });

  it('ignores the plan gate when no plan list is present', () => {
    const p = perms({ patients: ['read'] }, undefined);
    expect(checkModuleAccess(p, 'patients', 'read')).toBe(true);
  });
});

describe('checkModuleAccess - system admin and malformed input', () => {
  it('lets a system admin through regardless of role grants', () => {
    const p = perms({}, [], true);
    expect(checkModuleAccess(p, 'billing', 'create')).toBe(true);
  });

  it('denies a system admin whose plan omits nothing relevant', () => {
    // A system admin still bypasses the plan gate by design, matching the
    // server's `isSystemAdmin` short-circuit.
    const p = perms({ patients: ['read'] }, [], true);
    expect(checkModuleAccess(p, 'patients', 'delete')).toBe(true);
  });

  it('denies an unresolvable permission payload rather than throwing', () => {
    expect(checkModuleAccess(null, 'patients', 'read')).toBe(false);
    expect(checkModuleAccess(undefined, 'patients', 'read')).toBe(false);
    expect(checkModuleAccess({}, 'patients', 'read')).toBe(false);
    expect(checkModuleAccess(perms({ patients: [] }, FULL_PLAN), 'patients', 'read')).toBe(false);
  });
});

describe('moduleAccessStatus - denial reasons', () => {
  it('separates a plan denial from a role denial', () => {
    // The AccessDenied screen shows a different message for each, so the reason
    // has to be distinguishable rather than a bare false.
    const outsidePlan = perms({ billing: ['read'] }, ['patients']);
    expect(moduleAccessStatus(outsidePlan, 'billing')).toBe('plan');

    const inPlanNoGrant = perms({ patients: ['read'] }, FULL_PLAN);
    expect(moduleAccessStatus(inPlanNoGrant, 'billing')).toBe('permission');
  });

  it('reports a wrong-action denial as a permission problem, not a plan one', () => {
    const p = perms({ patients: ['read'] }, FULL_PLAN);
    expect(moduleAccessStatus(p, 'patients', 'create')).toBe('permission');
    expect(moduleAccessStatus(p, 'patients', 'read')).toBe('granted');
  });

  it('treats a missing payload as unknown, never as granted', () => {
    expect(moduleAccessStatus(null, 'patients')).toBe('unknown');
    expect(moduleAccessStatus(undefined, 'patients')).toBe('unknown');
  });

  it('treats a resolved but empty payload as a role denial, not unknown', () => {
    // The distinction is deliberate and drives the AccessDenied wording: `null`
    // means "not loaded yet, keep waiting", whereas a real 200 response that
    // grants nothing means "loaded, and the answer is no".
    expect(moduleAccessStatus({}, 'patients')).toBe('permission');
    expect(moduleAccessStatus({ permissions: {} }, 'patients')).toBe('permission');
  });

  it('grants a system admin anything, so no reason is ever reported', () => {
    const p = perms({}, [], true);
    expect(moduleAccessStatus(p, 'billing', 'delete')).toBe('granted');
  });

  it('agrees with checkModuleAccess on every case', () => {
    const cases = [
      [perms({ patients: ['read'] }, FULL_PLAN), 'patients', 'read'],
      [perms({ patients: ['read'] }, FULL_PLAN), 'patients', 'create'],
      [perms({ billing: ['read'] }, ['patients']), 'billing', 'read'],
      [perms({ patients: [] }, FULL_PLAN), 'patients', 'read'],
      [perms({}, [], true), 'roles', 'delete'],
      [null, 'patients', 'read'],
    ];
    for (const [p, module, action] of cases) {
      expect(moduleAccessStatus(p, module, action) === 'granted').toBe(
        checkModuleAccess(p, module, action),
      );
    }
  });
});

describe('sidebar and URL guard agree', () => {
  // The whole point of the shared registry: for any permission payload, the set
  // of visible menu items is exactly the set of URLs the guard lets through.
  // Both sides are computed independently — the sidebar from `NAV_ITEMS`, the
  // guard from `moduleForPath` — so a route that drifts out of one of them
  // shows up here.
  const sidebarVisibility = (myPermissions) =>
    new Set(
      NAV_ITEMS.filter((item) => checkModuleAccess(myPermissions, item.module)).map(
        (item) => item.path,
      ),
    );

  const guardReachability = (myPermissions) =>
    new Set(
      NAV_ROUTES.filter((route) => checkModuleAccess(myPermissions, moduleForPath(route.path))).map(
        (route) => route.path,
      ),
    );

  it('never shows a menu item the guard would deny', () => {
    // Sidebar ⊆ guard, not equality: the guard also covers the `nav: false`
    // routes that have no menu entry at all (`/patients/:id`, its EMR tab). The
    // invariant that matters is that nothing clickable is un-openable.
    const payloads = [
      perms({ patients: ['read'], billing: ['read'], chat: ['read'] }, ['patients', 'billing', 'chat']),
      perms({ appointments: ['read'] }, ['appointments']),
      perms({ patients: ['read', 'create', 'update', 'delete'] }, ['patients', 'emr']),
      perms({}, [], true),
    ];

    for (const p of payloads) {
      const visible = sidebarVisibility(p);
      const reachable = guardReachability(p);
      for (const path of visible) {
        expect(reachable.has(path), path).toBe(true);
      }
      // And a visible item must be gated on the same module the guard reads.
      for (const path of visible) {
        const item = NAV_ITEMS.find((i) => i.path === path);
        expect(checkModuleAccess(p, moduleForPath(path)), path).toBe(item.module && checkModuleAccess(p, item.module));
      }
    }
  });

  it('keeps every nav item pointing at a registered route', () => {
    const paths = new Set(NAV_ROUTES.map((r) => r.path));
    for (const item of NAV_ITEMS) {
      expect(paths.has(item.path), item.path).toBe(true);
      expect(moduleForPath(item.path), item.path).toBe(item.module);
    }
  });

  it('hides an out-of-plan module from the menu and denies its URL alike', () => {
    const payload = perms({ inventory: ['read', 'create'] }, ['patients', 'appointments']);
    const inventory = NAV_ITEMS.find((i) => i.path === '/inventory');
    expect(checkModuleAccess(payload, inventory.module)).toBe(false);
    expect(guardReachability(payload).has('/inventory')).toBe(false);
    expect(sidebarVisibility(payload).has('/inventory')).toBe(false);
  });
});

describe('landing path', () => {
  it('sends each role to its preferred page when that page is reachable', () => {
    expect(landingPathFor(perms({ appointments: ['read'] }, FULL_PLAN), 'doctor')).toBe('/appointments');
    expect(landingPathFor(perms({ billing: ['read'] }, FULL_PLAN), 'receptionist')).toBe('/billing');
    expect(landingPathFor(perms({ billing: ['read'] }, FULL_PLAN), 'accountant')).toBe('/billing');
  });

  // The bug `defaultRouteFor` had, and the redirect loop it caused: a doctor
  // without the appointments module was sent to /appointments, bounced off it,
  // then off /dashboard in turn, forever. The landing path must instead be a
  // page the user can actually open.
  it('falls back to an accessible page when the preferred one is not permitted', () => {
    const noAppointments = perms({ patients: ['read'] }, FULL_PLAN);
    expect(landingPathFor(noAppointments, 'doctor')).not.toBe('/appointments');
    expect(landingPathFor(noAppointments, 'doctor')).toBe('/patients');
  });

  it('never returns a page whose module the role lacks', () => {
    const p = perms({ billing: ['read'] }, ['billing']);
    // Only the billing module is in the plan, so nothing else may be offered.
    expect(landingPathFor(p, 'doctor')).toBe('/billing');
  });

  it('falls back to the default landing path when nothing is known yet', () => {
    // Permissions still loading, or a signed-out visitor: do not guess.
    expect(landingPathFor(undefined, 'doctor')).toBe('/dashboard');
    expect(landingPathFor(null, 'doctor')).toBe('/dashboard');
  });

  it('ignores the preferred route when the plan does not include its module', () => {
    // Held permission, but the module is outside the plan.
    const p = perms({ appointments: ['read'] }, ['patients']);
    expect(landingPathFor(p, 'doctor')).not.toBe('/appointments');
  });

  it('passes an unknown role through untouched', () => {
    expect(roleLabel('dentist')).toBe('dentist');
    expect(roleLabel('')).toBe('');
    expect(roleLabel(null)).toBeFalsy();
  });
});

describe('isClinicWide - who gets a branch picker', () => {
  it('treats a manager holding the branches grant as clinic-wide', () => {
    // The clinic manager is no longer a system admin, but it still creates
    // records across every branch, and the server demands an explicit branch
    // from it — so the picker has to render for it.
    const p = perms({ branches: ['create', 'read', 'update', 'delete'], patients: ['create'] }, FULL_PLAN);
    expect(isClinicWide(p)).toBe(true);
  });

  it('treats a system admin as clinic-wide regardless of grants', () => {
    expect(isClinicWide(perms({}, [], true))).toBe(true);
  });

  it('leaves a branch-scoped staff user without a picker', () => {
    const p = perms({ patients: ['create', 'read'] }, ['patients']);
    expect(isClinicWide(p)).toBe(false);
  });

  it('ignores a create-only branches grant', () => {
    // Creating a branch is not the same as choosing where records live.
    expect(isClinicWide(perms({ branches: ['create'] }, FULL_PLAN))).toBe(false);
  });

  it('does not require the branches module to be in the plan', () => {
    // A clinic on a plan without `branches` still has branches; gating the
    // picker on the plan would reintroduce the "branch is required" 400.
    const p = perms({ branches: ['read'] }, ['patients']);
    expect(isClinicWide(p)).toBe(true);
  });

  it('is false before permissions resolve', () => {
    expect(isClinicWide(undefined)).toBe(false);
    expect(isClinicWide(null)).toBe(false);
    expect(isClinicWide(perms({}, []))).toBe(false);
  });
});
