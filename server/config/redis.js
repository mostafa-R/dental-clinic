import Redis from 'ioredis';

let redis = null;
let isConnected = false;
let shuttingDown = false;
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Resolved at call time, never at module-evaluation time. ESM evaluates every
 * import before the importing module's body runs, so a module-scope read here
 * would run before `dotenv.config()` in app.js and silently discard the
 * configured REDIS_URL in favour of the unauthenticated local default.
 */
function redisUrl() {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

/** Never log the password embedded in a redis:// URL. */
function redactUrl(url) {
  return String(url).replace(/\/\/([^@/]*):([^@/]*)@/, '//$1:***@');
}

export function getRedis() {
  if (!redis) {
    redis = new Redis(redisUrl(), {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 10) return null;
        // Jittered exponential backoff with a ceiling, so a fleet of replicas
        // does not retry in lockstep and turn a Redis blip into a synchronized
        // reconnect storm.
        const ceiling = Math.min(times * 200, 30000);
        return Math.round(ceiling * (0.5 + Math.random() / 2));
      },
      lazyConnect: true,
    });

    redis.on('connect', () => { isConnected = true; });
    redis.on('close', () => {
      if (isConnected) {
        console.warn('[Redis] Connection lost — caching, distributed rate limits, and abuse detection are degraded. Health: /api/site/health reports connected=false.');
      }
      isConnected = false;
    });
    redis.on('end', () => {
      isConnected = false;
      // A transient Redis outage must NOT kill the process. Callers already
      // degrade to in-memory stores, and exiting here previously turned a
      // few seconds of Redis unavailability into a full outage (all replicas
      // exiting together, then restarting into the same broken Redis).
      if (process.env.NODE_ENV === 'production' && !shuttingDown) {
        console.error('[Redis] FATAL: Redis connection permanently lost. Continuing with in-memory fallback so in-flight requests can drain; rate limits and caches are degraded until it recovers.');
      }
    });
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
    isConnected = false;
    if (process.env.NODE_ENV === 'production') {
      console.error(
        `[Redis] FATAL: Redis unavailable in production (${err.message}). Failing fast — refusing to start without Redis. Check REDIS_URL=${redactUrl(redisUrl())}`,
      );
      throw err;
    }
    console.warn(
      `[Redis] WARN: Redis unavailable (${err.message}). Caching, distributed rate limits, and abuse detection are DISABLED — running on in-memory fallback. Check REDIS_URL=${redactUrl(redisUrl())}`,
    );
  }
}

export function isRedisConnected() {
  return isConnected;
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

async function getTelemetryCounters() {
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
  shuttingDown = true;
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
