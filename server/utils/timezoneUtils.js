/**
 * Timezone naming + tenant resolution helpers.
 *
 * `normalizeTimeZone` hardens user/tenant-supplied IANA zone names before they
 * are handed to `Intl` (which throws on unknown zones) and the tenant lookup
 * provides a safe default so "no timezone configured yet" degrades to UTC
 * rather than a machine-dependent value.
 */

// Zone validation shells out to ICU, and `zonedDates` normalises on every
// public entry point (some of which run per-row in migrations). The result is a
// pure function of the input string, so memoise it; the candidate set is tiny
// and bounded by whatever ends up in a `timezone` column.
const zoneCache = new Map();

export function normalizeTimeZone(value) {
  if (value == null || value === '') return 'UTC';
  if (typeof value !== 'string') return 'UTC';
  const candidate = value.trim();
  if (!/^[A-Za-z0-9_+\-/.]+$/.test(candidate)) return 'UTC';

  const cached = zoneCache.get(candidate);
  if (cached !== undefined) return cached;

  let resolved = 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    resolved = candidate;
  } catch {
    resolved = 'UTC';
  }

  zoneCache.set(candidate, resolved);
  return resolved;
}

export function defaultTimeZone() {
  return normalizeTimeZone(process.env.APP_DEFAULT_TZ);
}

/**
 * Resolve a stored zone string, or `null` when it is missing/unusable.
 *
 * `normalizeTimeZone` collapses every failure to `'UTC'`, which cannot be told
 * apart from a tenant that genuinely stores `'UTC'`. Comparing against the
 * trimmed input distinguishes the two, so callers can honour `APP_DEFAULT_TZ`
 * for a *corrupt* value instead of silently pinning the clinic to UTC.
 */
function validStoredZone(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (candidate === '') return null;
  return normalizeTimeZone(candidate) === candidate ? candidate : null;
}

/**
 * Resolve the IANA timezone stashed on a tenant document (or a partial object
 * with a `.timezone` field). Falls back to APP_DEFAULT_TZ, then UTC.
 */
export function resolveTenantTimezone(tenant) {
  const stored = tenant && typeof tenant === 'object' ? validStoredZone(tenant.timezone) : null;
  return stored ?? defaultTimeZone();
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
    return resolveTenantTimezone(tenant);
  } catch {
    return defaultTimeZone();
  }
}