import Tenant from '../models/Tenant.js';

const reqCounts = new Map();
const FLUSH_INTERVAL = 60 * 1000;
const ALERT_THRESHOLD = 500;
const QUARANTINE_THRESHOLD = 2000;
const ERROR_THRESHOLD = 50;
const COUNTER_WINDOW_MS = 60 * 1000;
const TENANT_BATCH_SIZE = 100;

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
}, FLUSH_INTERVAL);

function getKey(tenantId) {
  return String(tenantId || 'unknown');
}

export function trackRequest(tenantId, statusCode) {
  const key = getKey(tenantId);
  const now = Date.now();

  let entry = reqCounts.get(key);
  if (!entry || now - entry.start > COUNTER_WINDOW_MS) {
    entry = { start: now, count: 0, errors: 0 };
    reqCounts.set(key, entry);
  }

  entry.count++;
  if (statusCode >= 400) {
    entry.errors++;
  }

  return { count: entry.count, errors: entry.errors };
}

export async function checkAbuse(tenantId) {
  const key = getKey(tenantId);
  const entry = reqCounts.get(key);
  if (!entry) return { flagged: false, reason: null, level: 'ok' };

  const elapsed = Math.max((Date.now() - entry.start) / 1000, 1);
  const rate = Math.round(entry.count / elapsed * 60);

  if (rate >= QUARANTINE_THRESHOLD) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (tenant && tenant.isActive) {
        tenant.isActive = false;
        await tenant.save();
      }
    } catch {}
    return { flagged: true, reason: 'Extreme request rate — auto-quarantined', level: 'critical', rate };
  }

  if (rate >= ALERT_THRESHOLD) {
    return { flagged: true, reason: `High request rate (${rate} req/min)`, level: 'warning', rate };
  }

  if (entry.errors >= ERROR_THRESHOLD) {
    return { flagged: true, reason: `High error rate (${entry.errors} errors in window)`, level: 'warning', errors: entry.errors };
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
      const key = getKey(t._id);
      const entry = reqCounts.get(key);
      const check = entry ? await checkAbuse(t._id) : { flagged: false, level: 'ok' };

      results.push({
        tenantId: t._id,
        name: t.name,
        plan: t.plan,
        isActive: t.isActive,
        currentRate: entry ? Math.round(entry.count / Math.max((Date.now() - entry.start) / 1000, 1) * 60) : 0,
        currentErrors: entry?.errors || 0,
        flagged: check.flagged,
        level: check.level,
        reason: check.reason,
      });
    }

    skip += TENANT_BATCH_SIZE;
  } while (batch.length === TENANT_BATCH_SIZE);

  return results;
}

export function resetStatsForTenant(tenantId) {
  reqCounts.delete(getKey(tenantId));
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
    flushTimer = null;
  }
}
