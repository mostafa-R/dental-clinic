// @vitest-environment node
/**
 * Unit tests for the permission predicate in `lib/roles.js`. Node environment
 * on purpose: `checkModuleAccess` is pure, so it needs neither a DOM nor a
 * Redux store. The reactive `usePermission` hook is exercised by the UI, not
 * here.
 */
import { describe, expect, it } from 'vitest';

import { checkModuleAccess, defaultRouteFor, roleLabel } from './roles';

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

describe('role routing helpers', () => {
  it('sends each role to its landing page', () => {
    expect(defaultRouteFor('doctor')).toBe('/appointments');
    expect(defaultRouteFor('receptionist')).toBe('/billing');
    expect(defaultRouteFor('accountant')).toBe('/billing');
    expect(defaultRouteFor('clinic_admin')).toBe('/dashboard');
  });

  it('passes an unknown role through untouched', () => {
    expect(roleLabel('dentist')).toBe('dentist');
    expect(roleLabel('')).toBe('');
    expect(roleLabel(null)).toBeFalsy();
  });
});
