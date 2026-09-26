import { describe, it, expect } from 'vitest';
import { visibleModules } from '../modules/dashboard/dashboard.service.js';
import { MODULES } from '../constants/permissions.js';

const keys = (tenant, perms, isSystemAdmin) =>
  visibleModules(tenant, perms, isSystemAdmin).map((m) => m.key);

const plan = (...modules) => ({ planModules: modules });

describe('dashboard module list', () => {
  it('never lists the dashboard the caller is already looking at', () => {
    const list = keys(null, {}, true);
    expect(list).not.toContain('dashboard');
  });

  it('returns only modules the tenant plan includes', () => {
    const list = keys(plan('patients', 'appointments'), { patients: ['read'], appointments: ['read'] });
    expect(list.sort()).toEqual(['appointments', 'patients']);
  });

  it('drops a module the plan includes when the role grants nothing on it', () => {
    // Plan says yes, permissions say no. The card would have led to
    // AccessDenied, so it must not be rendered at all.
    const list = keys(plan('patients', 'billing'), { patients: ['read'] });
    expect(list).toEqual(['patients']);
    expect(list).not.toContain('billing');
  });

  it('drops a module the role grants when the plan does not include it', () => {
    const list = keys(plan('patients'), { patients: ['read'], billing: ['read', 'create'] });
    expect(list).toEqual(['patients']);
    expect(list).not.toContain('billing');
  });

  it('counts a single granted action as access, not a full permission set', () => {
    // `permissions: ['create']` only still opens the module page.
    const list = keys(plan('inventory'), { inventory: ['create'] });
    expect(list).toEqual(['inventory']);
  });

  it('returns nothing when the plan has no modules at all', () => {
    expect(keys({ planModules: [] }, { patients: ['read'] })).toEqual([]);
    expect(keys({}, { patients: ['read'] })).toEqual([]);
    expect(keys({ planModules: null }, { patients: ['read'] })).toEqual([]);
  });

  it('ignores catalog keys the plan cannot name', () => {
    // A typo or a module that no longer exists must not crash the dashboard.
    const list = keys(plan('patients', 'not_a_module'), { patients: ['read'] });
    expect(list).toEqual(['patients']);
  });

  describe('platform admins (no tenant)', () => {
    it('sees every catalog module when flagged system admin', () => {
      const list = keys(null, {}, true);
      expect(list.length).toBe(MODULES.length - 1);
    });

    it('is still limited to granted modules when not a system admin', () => {
      // `tenant == null` makes planIncludesModule permissive, so the
      // permission half is the only thing left holding the line.
      const list = keys(null, { patients: ['read'] });
      expect(list).toEqual(['patients']);
    });
  });

  it('never returns an `enabled` flag', () => {
    // The flag is what let unopenable modules ship as greyed "in development"
    // cards. Absence is the contract now.
    for (const m of visibleModules(plan('patients'), { patients: ['read'] })) {
      expect(m).toEqual({ key: expect.any(String), label: expect.any(String) });
      expect('enabled' in m).toBe(false);
    }
  });

  it('preserves catalog order', () => {
    const list = keys(null, {}, true);
    const expected = MODULES.filter((m) => m.key !== 'dashboard').map((m) => m.key);
    expect(list).toEqual(expected);
  });
});
