import * as redisConfig from '../config/redis.js';
import { getPerfStats } from './perfMonitor.js';
import { getDbStats } from './dbMonitor.js';
import { getErrorMonitoringStats } from './errorMonitor.js';

/**
 * Redis-backed shared metrics for multi-worker deployments.
 *
 * Per-process monitors (perfMonitor / dbMonitor / errorMonitor) keep their own
 * in-memory maps, so a single-worker view is lost on restart and invisible to
 * other workers. This exporter periodically flushes the *deltas* of the local
 * monitors into additive Redis counters. Any worker (or a restarted process)
 * can then read the same aggregated picture via getClusterMetrics().
 *
 * Disabled-safe: if Redis is not connected (or the env is unset) every call
 * degrades to non-throwing local-only behavior and reports shared:false.
 */

const PREFIX = 'metrics:';
const TTL_SECONDS = 60 * 60 * 24 * 7; // metrics age out after 7 days
const WORKER_PREFIX = `${PREFIX}worker:`;

const KEYS = [
  'req_total',
  'req_ms_total',
  'req_errors',
  'routes_total',
  'db_queries',
  'db_ms_total',
  'db_slow',
  'db_errors',
  'er_errors',
];

const fullKey = (name) => `${PREFIX}${name}`;

let prev = null;
let timer = null;

function redisAvailable() {
  if (typeof redisConfig.isRedisConnected !== 'function') return false;
  return redisConfig.isRedisConnected();
}

function getClient() {
  if (typeof redisConfig.getRedis !== 'function') return null;
  return redisConfig.getRedis();
}

function snapshotLocal() {
  const perf = getPerfStats();
  const db = getDbStats();
  const err = getErrorMonitoringStats();

  return {
    req_total: perf.totals.totalRequests,
    req_ms_total: perf.routes.reduce((sum, r) => sum + r.avgMs * r.count, 0),
    req_errors: perf.totals.totalErrors,
    routes_total: perf.totals.totalRoutes,
    db_queries: db.summary.totalQueries,
    db_ms_total: db.queries.reduce((sum, q) => sum + q.avgDuration * q.count, 0),
    db_slow: db.summary.totalSlowQueries,
    db_errors: db.summary.totalErrors || 0,
    er_errors: err.summary?.totalErrors || 0,
  };
}

function deltaSince(prevLocal, cur, key) {
  if (!prevLocal) return cur[key];
  return Math.max(0, cur[key] - prevLocal[key]);
}

/**
 * Flush local metrics deltas into Redis. Non-blocking — never throws.
 * Returns `{ shared, published }`.
 */
export async function flushMetricsToRedis() {
  if (!redisAvailable()) {
    prev = null;
    return { shared: false, published: false };
  }

  const client = getClient();
  if (!client) return { shared: false, published: false };

  const cur = snapshotLocal();
  const deltas = {};
  let hasTraffic = false;
  for (const key of KEYS) {
    deltas[key] = deltaSince(prev, cur, key);
    if (deltas[key] > 0) hasTraffic = true;
  }
  // Free the previous reference so a reset process doesn't double count.
  prev = cur;

  // Only write when there is real traffic (avoids waking the store on idle).
  if (!hasTraffic) {
    await refreshHeartbeat(client);
    return { shared: true, published: false };
  }

  try {
    const pipeline = client.multi();
    for (const key of KEYS) {
      pipeline.incrby(fullKey(key), deltas[key]);
      pipeline.expire(fullKey(key), TTL_SECONDS);
    }
    await pipeline.exec();
    await refreshHeartbeat(client);
    return { shared: true, published: true };
  } catch (error) {
    prev = null; // next tick re-seeds rather than compounding
    console.warn('[Metrics] Failed to publish shared metrics to Redis:', error.message);
    return { shared: false, published: false };
  }
}

async function refreshHeartbeat(client) {
  try {
    await client.set(`${WORKER_PREFIX}${process.pid}`, new Date().toISOString(), 'EX', 60);
  } catch {
    // Non-fatal; heartbeats are best-effort.
  }
}

/**
 * Read the cluster-wide aggregated metrics (all publishing workers combined).
 * Always resolves to a plain object; never throws.
 */
export async function getClusterMetrics() {
  if (!redisAvailable()) {
    return { enabled: false, shared: false };
  }

  const client = getClient();
  if (!client) return { enabled: true, shared: false };

  try {
    const values = await client.mget(KEYS.map(fullKey));
    const asNumber = (v) => Number(v) || 0;
    const [reqTotal, reqMsTotal, reqErrors, routesTotal, dbQueries, dbMsTotal, dbSlow, dbErrors, erErrors] =
      values.map(asNumber);

    const workerIds = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${WORKER_PREFIX}*`, 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) workerIds.push(key.slice(WORKER_PREFIX.length));
    } while (cursor !== '0');

    const reqRate = reqTotal > 0 ? Math.round((reqErrors / reqTotal) * 10000) / 100 : 0;
    const dbSlowPct = dbQueries > 0 ? Math.round((dbSlow / dbQueries) * 100) : 0;

    return {
      enabled: true,
      shared: true,
      workers: workerIds.length,
      updatedAt: new Date().toISOString(),
      requests: {
        total: reqTotal,
        errors: reqErrors,
        errorRate: reqRate,
        avgResponseMs: reqTotal > 0 ? Math.round((reqMsTotal / reqTotal) * 10) / 10 : 0,
        observedRoutes: routesTotal,
      },
      database: {
        totalQueries: dbQueries,
        slowQueries: dbSlow,
        errors: dbErrors,
        slowQueryPercentage: dbSlowPct,
        avgQueryMs: dbQueries > 0 ? Math.round((dbMsTotal / dbQueries) * 100) / 100 : 0,
      },
      errors: { total: erErrors },
    };
  } catch (error) {
    return { enabled: true, shared: false, error: error.message };
  }
}

const DEFAULT_EXPORT_INTERVAL_MS = 30_000;

/**
 * Start the background exporter. Call once after Redis is connected.
 */
export function startMetricsExport(intervalMs = DEFAULT_EXPORT_INTERVAL_MS) {
  if (timer) return;
  flushMetricsToRedis().catch(() => {});
  timer = setInterval(() => {
    flushMetricsToRedis().catch(() => {});
  }, intervalMs);
  timer.unref?.();
}

export function stopMetricsExport() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}