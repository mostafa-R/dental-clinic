/**
 * Timezone naming + tenant resolution helpers.
 *
 * `normalizeTimeZone` hardens user/tenant-supplied IANA zone names before they
 * are handed to `Intl` (which throws on unknown zones) and the tenant lookup
 * provides a safe default so "no timezone configured yet" degrades to UTC
 * rather than a machine-dependent value.
 */

export function normalizeTimeZone(value) {
  if (value == null || value === '') return 'UTC';
  if (typeof value !== 'string') return 'UTC';
  const candidate = value.trim();
  if (!/^[A-Za-z0-9_+\-/.]+$/.test(candidate)) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return 'UTC';
  }
}

export function defaultTimeZone() {
  return normalizeTimeZone(process.env.APP_DEFAULT_TZ);
}

/**
 * Resolve the IANA timezone stashed on a tenant document (or a partial object
 * with a `.timezone` field). Falls back to APP_DEFAULT_TZ, then UTC.
 */
export function resolveTenantTimezone(tenant) {
  if (tenant && typeof tenant === 'object' && tenant.timezone) {
    return normalizeTimeZone(tenant.timezone);
  }
  return defaultTimeZone();
}

/**
 * Load a tenant's stored timezone from the DB. Used by controller-level code
 * that has a tenant id but not a populated tenant document.
 */
export async function loadTenantTimezone(tenantId) {
  if (!tenantId) return defaultTimeZone();
  try {
    const { default: Tenant } = await import('../modules/site/tenant/tenant.model.js');
    const tenant = await Tenant.findById(tenantId).select('timezone').lean();
    return tenant?.timezone ? normalizeTimeZone(tenant.timezone) : defaultTimeZone();
  } catch {
    return defaultTimeZone();
  }
}