/**
 * Typed Redis cache layer for frequently-accessed data.
 *
 * Provides namespace-isolated cache helpers with configurable TTLs.
 * Falls back gracefully when Redis is unavailable (returns null / no-ops).
 *
 * Cache keys follow the pattern: `dental:{namespace}:{id}`
 * Namespace TTLs:
 *   - role      : 5 minutes  (roles change infrequently)
 *   - tenant    : 2 minutes  (tenant status/plans can change)
 *   - user      : 1 minute   (user data can change on login)
 *   - permission: 5 minutes  (same as role)
 */

import { getRedis } from '../config/redis.js';

const PREFIX = 'dental:';
const DEFAULT_TTL = 300; // 5 minutes

const NAMESPACES = {
  role: 300,       // 5 min
  tenant: 120,     // 2 min
  user: 60,        // 1 min
  permission: 300, // 5 min
};

function buildKey(namespace, id) {
  return `${PREFIX}${namespace}:${id}`;
}

/**
 * Get a cached value by namespace and ID.
 * Returns parsed JSON or null on miss / Redis unavailable.
 */
export async function cacheGet(namespace, id) {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return null;
  try {
    const key = buildKey(namespace, id);
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with the namespace's default TTL.
 */
export async function cacheSet(namespace, id, value, ttlSeconds) {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return;
  const ttl = ttlSeconds || NAMESPACES[namespace] || DEFAULT_TTL;
  try {
    const key = buildKey(namespace, id);
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  } catch {
    // Silently fail — cache is best-effort
  }
}

/**
 * Delete a cached value.
 */
export async function cacheDel(namespace, id) {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return;
  try {
    const key = buildKey(namespace, id);
    await redis.del(key);
  } catch {
    // Silently fail
  }
}

/**
 * Delete all cached values matching a namespace pattern.
 * Uses SCAN to avoid blocking Redis on large key spaces.
 */
export async function cacheDelPattern(pattern) {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return;
  try {
    let cursor = '0';
    const matchPattern = `${PREFIX}${pattern}`;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', matchPattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch {
    // Silently fail
  }
}

// ─── Convenience helpers ───────────────────────────────────────────

/**
 * Cache a Role document. Called after role lookup or role update.
 */
export async function cacheRole(roleId, roleDoc) {
  await cacheSet('role', roleId, roleDoc);
}

/**
 * Get a cached Role document.
 */
export async function getCachedRole(roleId) {
  return cacheGet('role', roleId);
}

/**
 * Invalidate cached Role. Called when role is updated or deleted.
 */
export function invalidateRole(roleId) {
  return cacheDel('role', roleId);
}

// Alias kept for callers/tests that use the longer name.
export const invalidateRoleCache = invalidateRole;

/**
 * Invalidate all cached roles for a tenant.
 * NOTE: Roles are cached with tenant-scoped keys (namespace 'role', id = roleId),
 * but since we cannot enumerate all roleIds for a tenant from the cache alone,
 * we invalidate all role cache entries. This is safe because role changes are infrequent.
 */
export async function invalidateTenantRoles(_tenantId) {
  await cacheDelPattern(`role:*`);
}

/**
 * Cache tenant config (plan, planModules, status, etc.).
 */
export async function cacheTenant(tenantId, tenantDoc) {
  await cacheSet('tenant', tenantId, tenantDoc);
}

/**
 * Get a cached tenant config.
 */
export async function getCachedTenant(tenantId) {
  return cacheGet('tenant', tenantId);
}

/**
 * Invalidate cached tenant. Called when tenant is updated.
 */
export async function invalidateTenant(tenantId) {
  await cacheDel('tenant', tenantId);
  // tenantRouter caches subdomain lookups under `tenant:slug:{slug}` keys.
  // A tenantId → slug mapping is not derivable from the cache alone, so drop
  // every tenant-slug entry. This is safe because tenant status/plan/feature
  // changes are infrequent, and it ensures a suspension, subscription change,
  // or feature toggle is honored by the subdomain router immediately instead
  // of after the 5-minute slug TTL.
  await cacheDelPattern('tenant:slug:*');
}

/**
 * Invalidate cached permissions for a user.
 */
export async function invalidatePermission(userId, roleId) {
  await cacheDel('permission', `${userId}:${roleId}`);
}
