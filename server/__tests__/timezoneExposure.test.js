import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * `GET /auth/my-permissions` is the client's only source for the clinic's IANA
 * timezone.
 *
 * The client needs it because every "local day" question has to be answered in
 * the *clinic's* zone: the server filters a `date=YYYY-MM-DD` query against its
 * own clinic-local midnight, so a client that picks the date in the browser's
 * zone silently queries the wrong day. The same zone drives every timestamp the
 * UI renders and every `datetime-local` value it submits.
 *
 * These tests pin the two properties that make that safe:
 *
 *   1. The zone is present on *both* response branches. The system-admin branch
 *      returns early, so a `timezone` added only to the final payload would hand
 *      admins `undefined` and silently drop them back to browser-local dates.
 *   2. A missing or invalid stored zone degrades to the server default instead
 *      of propagating `undefined` into `Intl`, which throws a `RangeError`.
 */

/**
 * Mocked at the top level so the controller (and the Mongoose models it pulls
 * in) is imported exactly once. Re-importing it per test recompiles the `User`
 * model and throws `OverwriteModelError`.
 */
const roleState = { current: null };
vi.mock('../middleware/checkPermission.js', () => ({
  resolveRole: () => Promise.resolve(roleState.current),
}));

const { getMyPermissions } = await import('../modules/auth/auth.controller.js');
const { normalizeTimeZone, defaultTimeZone, resolveTenantTimezone } = await import('../utils/timezoneUtils.js');

const originalDefaultTz = process.env.APP_DEFAULT_TZ;

beforeEach(() => {
  process.env.APP_DEFAULT_TZ = 'UTC';
  roleState.current = { isSystemAdmin: false, permissionMap: () => ({}) };
});

afterEach(() => {
  if (originalDefaultTz === undefined) delete process.env.APP_DEFAULT_TZ;
  else process.env.APP_DEFAULT_TZ = originalDefaultTz;
});

/** Call the controller and return the `data` payload it sends. */
const call = async ({ tenant, isSystemAdmin = false, permissions = {} } = {}) => {
  roleState.current = { isSystemAdmin, permissionMap: () => permissions };
  const res = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
  };
  await getMyPermissions({ user: { _id: 'user-1', tenant } }, res, () => {});
  return res.payload.data;
};

describe('normalizeTimeZone', () => {
  it('accepts a valid zone unchanged', () => {
    expect(normalizeTimeZone('Africa/Cairo')).toBe('Africa/Cairo');
    expect(normalizeTimeZone('America/New_York')).toBe('America/New_York');
    expect(normalizeTimeZone('  Asia/Kolkata  ')).toBe('Asia/Kolkata');
  });

  it('falls back to UTC rather than returning something Intl would reject', () => {
    for (const bad of ['Not/AZone', '', null, undefined, 7, {}, 'Europe/', 'a b']) {
      expect(normalizeTimeZone(bad)).toBe('UTC');
    }
  });
});

describe('resolveTenantTimezone', () => {
  it('returns the tenant zone when it is valid', () => {
    expect(resolveTenantTimezone({ timezone: 'Africa/Cairo' })).toBe('Africa/Cairo');
    expect(resolveTenantTimezone({ timezone: 'America/New_York' })).toBe('America/New_York');
  });

  it('falls back to the server default when the tenant has no zone', () => {
    // Pre-migration rows have no `timezone`, and a system-admin session has no
    // tenant at all.
    expect(resolveTenantTimezone({})).toBe('UTC');
    expect(resolveTenantTimezone(null)).toBe('UTC');
    expect(resolveTenantTimezone(undefined)).toBe('UTC');
  });

  it('falls back to the server default for an unusable zone', () => {
    // An invalid IANA name must never reach `Intl.DateTimeFormat` downstream.
    expect(resolveTenantTimezone({ timezone: 'Not/AZone' })).toBe('UTC');
    expect(resolveTenantTimezone({ timezone: '' })).toBe('UTC');
    expect(resolveTenantTimezone({ timezone: 42 })).toBe('UTC');
  });

  it('honours a non-UTC server default', () => {
    process.env.APP_DEFAULT_TZ = 'Europe/London';
    expect(defaultTimeZone()).toBe('Europe/London');
    expect(resolveTenantTimezone({})).toBe('Europe/London');
    // A *corrupt* stored zone must honour the configured default rather than
    // silently pinning the clinic to UTC — `normalizeTimeZone` collapses both
    // to 'UTC', so the resolver has to tell them apart.
    expect(resolveTenantTimezone({ timezone: 'Not/AZone' })).toBe('Europe/London');
    // An explicit tenant zone still wins over the default.
    expect(resolveTenantTimezone({ timezone: 'Africa/Cairo' })).toBe('Africa/Cairo');
  });
});

describe('GET /auth/my-permissions exposes the clinic timezone', () => {
  it('returns the tenant zone to a normal clinic user', async () => {
    const data = await call({ tenant: { timezone: 'Africa/Cairo', plan: 'pro', planModules: [] } });
    expect(data.timezone).toBe('Africa/Cairo');
  });

  it('returns a zone to a system admin too, despite the early return', async () => {
    // The system-admin branch returns before the plan mapping, so a `timezone`
    // added only to the final payload would leave admins on browser-local dates.
    const data = await call({ tenant: { timezone: 'America/New_York' }, isSystemAdmin: true });
    expect(data.timezone).toBe('America/New_York');
  });

  it('gives a system admin with no tenant a usable zone rather than undefined', async () => {
    const data = await call({ tenant: null, isSystemAdmin: true });
    expect(data.timezone).toBe('UTC');
  });

  it('falls back to the server default for a tenant with no stored zone', async () => {
    const data = await call({ tenant: { plan: 'pro', planModules: [] } });
    expect(data.timezone).toBe('UTC');
  });

  it('falls back for an invalid stored zone rather than passing it through', async () => {
    const data = await call({ tenant: { timezone: 'Mars/Olympus', plan: 'pro', planModules: [] } });
    expect(data.timezone).toBe('UTC');
  });

  it('reflects a non-UTC server default in the response', async () => {
    process.env.APP_DEFAULT_TZ = 'Africa/Cairo';
    const data = await call({ tenant: { plan: 'pro', planModules: [] } });
    expect(data.timezone).toBe('Africa/Cairo');
  });

  it('still returns the permission payload the UI depends on', async () => {
    const data = await call({
      tenant: { timezone: 'Africa/Cairo', plan: 'pro', planModules: ['patients'] },
      permissions: { patients: ['read', 'create'], billing: ['read'] },
    });
    expect(data.permissions.patients).toEqual(['read', 'create']);
    // billing is not in the plan, so the plan gate must empty it.
    expect(data.permissions.billing).toEqual([]);
    expect(data.plan).toBe('pro');
    expect(data.planModules).toEqual(['patients']);
  });
});
