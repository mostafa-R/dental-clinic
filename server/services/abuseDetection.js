import Tenant from '../modules/site/tenant/tenant.model.js';

const ALERT_THRESHOLD = 500;
const QUARANTINE_THRESHOLD = 2000;
const ERROR_THRESHOLD = 50;
const COUNTER_WINDOW_MS = 60 * 1000;
const TENANT_BATCH_SIZE = 100;

// --- In-memory fallback (used when Redis is unavailable) ---
const reqCounts = new Map();

const flushTimer = setInterval(() => {
  try {
    const now = Date.now();
    for (const [key, entry] of reqCounts.entries()) {
      if (now - entry.start > COUNTER_WINDOW_MS * 2) {
        reqCounts.delete(key);
      }
    }
  } catch (err) {
    console.error('[Abuse] Flush error:', err);
  }
}, 60 * 1000);

// --- Redis-backed tracking ---
const ABUSE_PREFIX = 'abuse:';
const ABUSE_ERROR_PREFIX = 'abuse_err:';
const ABUSE_WINDOW_SECONDS = 120;

async function getRedisClient() {
  try {
    const { getRedis } = await import('../config/redis.js');
    const client = getRedis();
    if (client && client.status === 'ready') return client;
  } catch {}
  return null;
}

function getKey(tenantId) {
  return String(tenantId || 'unknown');
}

export async function trackRequest(tenantId, statusCode) {
  const key = getKey(tenantId);
  const redis = await getRedisClient();

  if (redis) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - ABUSE_WINDOW_SECONDS;

      const pipe = redis.pipeline();
      pipe.zremrangebyscore(`${ABUSE_PREFIX}${key}`, 0, windowStart);
      pipe.zadd(`${ABUSE_PREFIX}${key}`, now, `${now}:${Date.now()}`);
      pipe.expire(`${ABUSE_PREFIX}${key}`, ABUSE_WINDOW_SECONDS * 2);

      if (statusCode >= 400) {
        pipe.incr(`${ABUSE_ERROR_PREFIX}${key}`);
        pipe.expire(`${ABUSE_ERROR_PREFIX}${key}`, ABUSE_WINDOW_SECONDS * 2);
      }

      await pipe.exec();
      const count = await redis.zcard(`${ABUSE_PREFIX}${key}`);
      const errors = parseInt(await redis.get(`${ABUSE_ERROR_PREFIX}${key}`) || '0', 10);
      return { count, errors };
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  let entry = reqCounts.get(key);
  if (!entry || now - entry.start > COUNTER_WINDOW_MS) {
    entry = { start: now, count: 0, errors: 0 };
    reqCounts.set(key, entry);
  }
  entry.count++;
  if (statusCode >= 400) entry.errors++;
  return { count: entry.count, errors: entry.errors };
}

export async function checkAbuse(tenantId) {
  const key = getKey(tenantId);
  const redis = await getRedisClient();

  let rate = 0;
  let errors = 0;

  if (redis) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - ABUSE_WINDOW_SECONDS;
      await redis.zremrangebyscore(`${ABUSE_PREFIX}${key}`, 0, windowStart);
      const count = await redis.zcard(`${ABUSE_PREFIX}${key}`);
      errors = parseInt(await redis.get(`${ABUSE_ERROR_PREFIX}${key}`) || '0', 10);
      rate = Math.round((count / ABUSE_WINDOW_SECONDS) * 60);
    } catch {
      // Fall through
    }
  } else {
    const entry = reqCounts.get(key);
    if (!entry) return { flagged: false, reason: null, level: 'ok' };
    const elapsed = Math.max((Date.now() - entry.start) / 1000, 1);
    rate = Math.round((entry.count / elapsed) * 60);
    errors = entry.errors;
  }

  if (rate >= QUARANTINE_THRESHOLD) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (tenant && tenant.isActive) {
        tenant.isActive = false;
        tenant.quarantineReason = `Extreme request rate (${rate} req/min) — auto-quarantined`;
        tenant.quarantinePreviousStatus = tenant.status;
        tenant.status = 'suspended';
        await tenant.save();
      }
    } catch (err) {
      console.error('[AbuseDetection] Failed to quarantine tenant:', err.message);
    }
    return { flagged: true, reason: `Extreme request rate (${rate} req/min) — auto-quarantined`, level: 'critical', rate };
  }

  if (rate >= ALERT_THRESHOLD) {
    return { flagged: true, reason: `High request rate (${rate} req/min)`, level: 'warning', rate };
  }

  if (errors >= ERROR_THRESHOLD) {
    return { flagged: true, reason: `High error rate (${errors} errors in window)`, level: 'warning', errors };
  }

  return { flagged: false, reason: null, level: 'ok', rate };
}

export async function getAbuseStatsForTenants() {
  const results = [];
  let skip = 0;
  let batch;

  do {
    batch = await Tenant.find({})
      .select('name email isActive plan settings')
      .skip(skip)
      .limit(TENANT_BATCH_SIZE)
      .lean();

    for (const t of batch) {
      const check = await checkAbuse(t._id);
      const key = getKey(t._id);
      const redis = await getRedisClient();
      let currentRate = 0;
      let currentErrors = 0;

      if (redis) {
        try {
          const now = Math.floor(Date.now() / 1000);
          const windowStart = now - ABUSE_WINDOW_SECONDS;
          await redis.zremrangebyscore(`${ABUSE_PREFIX}${key}`, 0, windowStart);
          const count = await redis.zcard(`${ABUSE_PREFIX}${key}`);
          currentErrors = parseInt(await redis.get(`${ABUSE_ERROR_PREFIX}${key}`) || '0', 10);
          currentRate = Math.round((count / ABUSE_WINDOW_SECONDS) * 60);
        } catch {}
      } else {
        const entry = reqCounts.get(key);
        if (entry) {
          const elapsed = Math.max((Date.now() - entry.start) / 1000, 1);
          currentRate = Math.round((entry.count / elapsed) * 60);
          currentErrors = entry.errors;
        }
      }

      results.push({
        tenantId: t._id,
        name: t.name,
        plan: t.plan,
        isActive: t.isActive,
        currentRate,
        currentErrors,
        flagged: check.flagged,
        level: check.level,
        reason: check.reason,
      });
    }

    skip += TENANT_BATCH_SIZE;
  } while (batch.length === TENANT_BATCH_SIZE);

  return results;
}

export async function resetStatsForTenant(tenantId) {
  const key = getKey(tenantId);
  const redis = await getRedisClient();

  if (redis) {
    try {
      await redis.del(`${ABUSE_PREFIX}${key}`, `${ABUSE_ERROR_PREFIX}${key}`);
      return;
    } catch {}
  }
  reqCounts.delete(key);
}

let abuseCronTimer = null;

export function startAbuseCron() {
  abuseCronTimer = setInterval(async () => {
    try {
      const stats = await getAbuseStatsForTenants();
      for (const s of stats) {
        if (s.level === 'critical' && s.isActive) {
          const tenant = await Tenant.findById(s.tenantId);
          if (tenant && tenant.isActive) {
            tenant.isActive = false;
            tenant.quarantineReason = s.reason;
            tenant.quarantinePreviousStatus = tenant.status;
            tenant.status = 'suspended';
            await tenant.save();
            console.log(`[Abuse] Auto-quarantined tenant "${s.name}" — ${s.reason}`);
          }
        }
      }
    } catch (err) {
      console.error('[Abuse] Cron error:', err);
    }
  }, 60 * 1000);
  console.log('[Abuse] Abuse detection cron started (every 60s)');
}

export function stopAbuseCron() {
  if (abuseCronTimer) {
    clearInterval(abuseCronTimer);
    abuseCronTimer = null;
  }
}

export function stopAbuseFlusher() {
  if (flushTimer) {
    clearInterval(flushTimer);
  }
}
