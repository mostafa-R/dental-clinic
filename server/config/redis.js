import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let redis = null;
let isConnected = false;
let cacheHits = 0;
let cacheMisses = 0;

export function getRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on('connect', () => { isConnected = true; });
    redis.on('close', () => { isConnected = false; });
    redis.on('error', (err) => { console.warn('[Redis]', err.message); });
  }
  return redis;
}

export async function connectRedis() {
  try {
    const client = getRedis();
    await client.connect();
    isConnected = true;
    console.log('Redis connected');
  } catch (err) {
    console.warn('Redis not available — running without cache:', err.message);
    isConnected = false;
  }
}

export async function cacheGet(key) {
  if (!redis || !isConnected) return null;
  try {
    const val = await redis.get(key);
    if (val !== null) {
      cacheHits++;
      return JSON.parse(val);
    }
    cacheMisses++;
    return null;
  } catch {
    cacheMisses++;
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 300) {
  if (!redis || !isConnected) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {}
}

export async function cacheDel(key) {
  if (!redis || !isConnected) return;
  try {
    await redis.del(key);
  } catch {}
}

export async function getRedisInfo() {
  if (!redis || !isConnected) {
    return { connected: false, cacheHits, cacheMisses, hitRate: 0 };
  }
  try {
    const info = await redis.info();
    const usedMemory = info.match(/used_memory_human:([^\r\n]+)/)?.[1]?.trim() || 'N/A';
    const totalConnections = info.match(/total_connections_received:([^\r\n]+)/)?.[1]?.trim() || 'N/A';
    const uptime = info.match(/uptime_in_seconds:([^\r\n]+)/)?.[1]?.trim() || 'N/A';
    const hitRate = (cacheHits + cacheMisses) > 0
      ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100)
      : 0;
    return {
      connected: true,
      usedMemory,
      totalConnections: parseInt(totalConnections, 10) || 0,
      uptime: parseInt(uptime, 10) || 0,
      cacheHits,
      cacheMisses,
      hitRate,
    };
  } catch {
    return { connected: true, cacheHits, cacheMisses, hitRate: 0 };
  }
}

export function resetCacheStats() {
  cacheHits = 0;
  cacheMisses = 0;
}

// --- Telemetry counters ---

const TELEMETRY_PREFIX = 'telemetry:';
const TELEMETRY_TTL = 86400;

export async function incrementTenantCounter(tenantId, counter) {
  if (!redis || !isConnected) return;
  const key = `${TELEMETRY_PREFIX}${counter}:${tenantId}`;
  try {
    await redis.multi()
      .incr(key)
      .expire(key, TELEMETRY_TTL)
      .exec();
  } catch {}
}

export async function decrementTenantCounter(tenantId, counter) {
  if (!redis || !isConnected) return;
  const key = `${TELEMETRY_PREFIX}${counter}:${tenantId}`;
  try {
    await redis.multi()
      .decr(key)
      .expire(key, TELEMETRY_TTL)
      .exec();
  } catch {}
}

export async function getTelemetryCounters() {
  if (!redis || !isConnected) return {};
  try {
    const result = {};
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${TELEMETRY_PREFIX}*`, 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        const val = await redis.get(key);
        const parts = key.replace(TELEMETRY_PREFIX, '').split(':');
        const counter = parts[0];
        const tenantId = parts.slice(1).join(':');
        if (!result[counter]) result[counter] = {};
        result[counter][tenantId] = parseInt(val, 10) || 0;
      }
    } while (cursor !== '0');
    return result;
  } catch {
    return {};
  }
}

export async function disconnectRedis() {
  if (redis && isConnected) {
    try {
      await redis.quit();
    } catch {}
    isConnected = false;
    redis = null;
  }
}

export async function getAggregatedTelemetry() {
  const counters = await getTelemetryCounters();
  const aggregated = {};
  for (const [counter, tenants] of Object.entries(counters)) {
    const total = Object.values(tenants).reduce((s, v) => s + v, 0);
    aggregated[counter] = { total, perTenant: tenants, tenantCount: Object.keys(tenants).length };
  }
  return aggregated;
}
