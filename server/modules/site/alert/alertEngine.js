import crypto from "node:crypto";
import cron from "node-cron";

import SiteAlert from "./alert.model.js";
import { ALERT_THRESHOLDS } from "./alertThresholds.js";
import { getSystemHealth } from "../../../utils/healthMonitor.js";
import { getPerfStats } from "../../../utils/perfMonitor.js";
import { getAbuseStatsForTenants } from "../../../services/abuseDetection.js";
import Tenant from "../tenant/tenant.model.js";

/**
 * Site Alert Engine — Monitoring v1.
 *
 * Two inputs:
 *   1. Periodic evaluator (cron, every minute) driven by healthMonitor /
 *      perfMonitor / abuse stats.
 *   2. Event-driven hooks (quarantine, backup failure, subscription) that
 *      call raiseAlert/recoverAlert directly from controllers.
 *
 * Alert Spam Prevention:
 *   - One document per `fingerprint` while open. Repeated observations bump
 *     `occurrenceCount` + `lastSeenAt` instead of creating new rows.
 *   - `recoverAlert` flips an open alert to resolved; a fresh episode then
 *     creates a brand-new row (historical record preserved, new fingerprint
 *     episode visible in the feed).
 *   - A tiny in-memory cooldown caps DB writes per fingerprint.
 *
 * PHI: metadata passed here is never patient data — tenant names/ids only.
 */

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

export function buildFingerprint({ type, scope = "platform", tenantId = null, source = "system", key = "" }) {
  const canonical = [type, scope, String(tenantId || ""), source, key].join("|");
  return `alert_${crypto.createHash("sha1").update(canonical).digest("hex").slice(0, 24)}`;
}

// ---------------------------------------------------------------------------
// Write path (raise / recover) with dedup + cooldown
// ---------------------------------------------------------------------------

const COOLDOWN_MS = 30 * 1000;
const lastWrite = new Map(); // fingerprint -> ms

function cooledDown(fingerprint) {
  const at = lastWrite.get(fingerprint);
  if (at !== undefined && Date.now() - at < COOLDOWN_MS) return true;
  lastWrite.set(fingerprint, Date.now());
  return false;
}

/**
 * Push a newly created alert to connected site admins. Realtime is
 * best-effort: socket.io may be uninitialized (tests, workers) — never throw.
 */
function notifyAdmins(payload) {
  import("../../../socket/index.js").then(({ emitToAdmins }) => {
    try {
      emitToAdmins("admin:alerts-changed", payload);
    } catch {
      /* realtime optional */
    }
  }).catch(() => {
    /* realtime optional */
  });
}

/**
 * Create — or bump — an alert for `fingerprint`. Never throws; returns the
 * resulting document plus whether a new alert row was created.
 */
export async function raiseAlert({
  type,
  severity,
  scope = "platform",
  title,
  message = "",
  source = "system",
  tenantId = null,
  key = "",
  meta = {},
}) {
  const fingerprint = buildFingerprint({ type, scope, tenantId, source, key });
  if (cooledDown(fingerprint)) {
    const existingOpen = await SiteAlert.findOne({ fingerprint, status: { $ne: "resolved" } });
    return { alert: existingOpen || null, created: false, deduplicated: true };
  }

  const now = new Date();
  try {
    const open = await SiteAlert.findOne({
      fingerprint,
      status: { $in: ["active", "acknowledged"] },
    });

    if (open) {
      open.occurrenceCount += 1;
      open.lastSeenAt = now;
      open.message = message;
      // Never demote severity below the highest seen while the alert is open.
      const rank = { info: 0, warning: 1, critical: 2 };
      if (rank[severity] > rank[open.severity]) open.severity = severity;
      await open.save();
      return { alert: open, created: false, deduplicated: true };
    }

    const alert = await SiteAlert.create({
      type,
      severity,
      scope,
      title,
      message,
      source,
      tenant: tenantId,
      fingerprint,
      firstSeenAt: now,
      lastSeenAt: now,
      meta: meta && typeof meta === "object" ? meta : {},
    });
    notifyAdmins({ type, severity, title, tenantId });
    return { alert, created: true, deduplicated: false };
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await SiteAlert.findOne({ fingerprint });
      return { alert: existing, created: false, deduplicated: true };
    }
    console.error("[AlertEngine] raiseAlert failed:", err.message);
    return { alert: null, created: false, error: err.message };
  }
}

/**
 * Resolve every open alert (active or acknowledged) for `fingerprint`.
 * Returns the number of alert rows transitioned to resolved.
 */
export async function recoverAlert({
  type,
  scope = "platform",
  tenantId = null,
  source = "system",
  key = "",
  resolvedBy = null,
}) {
  const fingerprint = buildFingerprint({ type, scope, tenantId, source, key });
  const result = await SiteAlert.updateMany(
    { fingerprint, status: { $in: ["active", "acknowledged"] } },
    { $set: { status: "resolved", resolvedAt: new Date(), resolvedBy: resolvedBy || null } },
  );
  return result.modifiedCount || 0;
}

// ---------------------------------------------------------------------------
// Periodic evaluator
// ---------------------------------------------------------------------------

function memoryUsagePercent() {
  const { heapUsed, heapTotal } = process.memoryUsage();
  return heapTotal > 0 ? Math.round((heapUsed / heapTotal) * 1000) / 10 : 0;
}

export function computeErrorRatePct(totals = {}) {
  const { totalRequests = 0, totalErrors = 0 } = totals;
  return totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
}

/**
 * Evaluate every platform + tenant check once. Safe to run concurrently with
 * itself (each alert row is fingerprint-scoped and upserted).
 */
export async function evaluateAlerts({ batchTenants = Infinity } = {}) {
  const results = {
    mongo: null,
    redis: null,
    memory: null,
    errorRatePct: 0,
    avgMs: 0,
    tenantSpike: 0,
    tenantAlerts: 0,
    trialsExpiring: 0,
  };

  // -- Infrastructure (Mongo / Redis) ------------------------------------
  let health;
  try {
    health = await getSystemHealth();
  } catch (err) {
    console.error("[AlertEngine] getSystemHealth failed:", err.message);
    health = { checks: [] };
  }

  const dbCheck = health.checks?.find((c) => c.component === "database");
  if (dbCheck) {
    if (dbCheck.status === "unhealthy") {
      const { created } = await raiseAlert({
        type: "mongodb",
        severity: "critical",
        title: "MongoDB is unhealthy",
        message: dbCheck.details?.error || "MongoDB ping/status check failed",
        source: "health",
        meta: { status: dbCheck.status, responseTime: dbCheck.details?.responseTime || null },
      });
      results.mongo = created ? "raised" : "updated";
    } else {
      results.mongo = (await recoverAlert({ type: "mongodb", source: "health" })) > 0 ? "recovered" : "ok";
    }
  }

  const redisCheck = health.checks?.find((c) => c.component === "redis");
  if (redisCheck) {
    if (redisCheck.status === "unhealthy") {
      const { created } = await raiseAlert({
        type: "redis",
        severity: "critical",
        title: "Redis is disconnected",
        message: redisCheck.details?.error || "Redis connectivity check failed",
        source: "health",
        meta: { connected: false, responseTime: redisCheck.details?.responseTime || null },
      });
      results.redis = created ? "raised" : "updated";
    } else {
      results.redis = (await recoverAlert({ type: "redis", source: "health" })) > 0 ? "recovered" : "ok";
    }
  }

  // -- Memory -------------------------------------------------------------
  const memPct = memoryUsagePercent();
  if (memPct > ALERT_THRESHOLDS.MEMORY_USAGE_PERCENT) {
    const { created } = await raiseAlert({
      type: "memory",
      severity: "critical",
      title: "High memory usage",
      message: `Process heap usage is at ${memPct}% of the heap limit.`,
      source: "health",
      meta: { heapUsedPercent: memPct },
    });
    results.memory = created ? "raised" : "updated";
  } else {
    results.memory = (await recoverAlert({ type: "memory", source: "health" })) > 0 ? "recovered" : "ok";
  }

  // -- Performance (error rate % + global avg response time) --------------
  const perf = getPerfStats();
  results.errorRatePct = computeErrorRatePct(perf?.totals);
  results.avgMs = perf?.globalAvgMs || 0;

  if (results.errorRatePct > ALERT_THRESHOLDS.ERROR_RATE_PERCENT) {
    await raiseAlert({
      type: "error_rate",
      severity: "critical",
      title: "Elevated platform error rate",
      message: `Error rate is at ${results.errorRatePct.toFixed(2)}% (threshold ${ALERT_THRESHOLDS.ERROR_RATE_PERCENT}%).`,
      source: "performance",
      meta: { errorRatePct: results.errorRatePct, totalErrors: perf.totals?.totalErrors || 0 },
    });
  } else {
    await recoverAlert({ type: "error_rate", source: "performance" });
  }

  if (results.avgMs > ALERT_THRESHOLDS.RESPONSE_TIME_MS) {
    await raiseAlert({
      type: "response_time",
      severity: "warning",
      title: "Slow average response time",
      message: `Global average response time is ${results.avgMs}ms (threshold ${ALERT_THRESHOLDS.RESPONSE_TIME_MS}ms).`,
      source: "performance",
      meta: { avgMs: results.avgMs },
    });
  } else {
    await recoverAlert({ type: "response_time", source: "performance" });
  }

  // -- Tenant creation spike ----------------------------------------------
  const spikeCutoff = new Date(Date.now() - 60 * 60 * 1000);
  results.tenantSpike = await Tenant.countDocuments({ createdAt: { $gte: spikeCutoff } });
  if (results.tenantSpike >= ALERT_THRESHOLDS.TENANT_SPIKE_PER_HOUR) {
    await raiseAlert({
      type: "tenant_spike",
      severity: "warning",
      title: "Abnormal tenant creation spike",
      message: `${results.tenantSpike} tenants were created in the last hour (threshold ${ALERT_THRESHOLDS.TENANT_SPIKE_PER_HOUR}).`,
      source: "platform",
      meta: { createdLastHour: results.tenantSpike },
    });
  } else {
    await recoverAlert({ type: "tenant_spike", source: "platform" });
  }

  // -- Tenant quota / abuse + auto-quarantine visibility ------------------
  const abuse = await getAbuseStatsForTenants();
  const flaggedIds = new Set();
  for (const s of abuse.slice(0, batchTenants)) {
    if (s.level === "critical") {
      flaggedIds.add(String(s.tenantId));
      await raiseAlert({
        type: "tenant_quota",
        severity: "warning",
        scope: "tenant",
        tenantId: s.tenantId,
        key: "quota",
        title: "Tenant request quota breach",
        message: s.reason || `Tenant exceeded allowed request rate (${s.currentRate} req/min).`,
        source: "platform",
        meta: { currentRate: s.currentRate, currentErrors: s.currentErrors },
      });
    }
  }
  results.tenantAlerts = flaggedIds.size;

  // Recover tenant_quota alerts whose tenant is no longer flagged.
  const openQuotaAlerts = await SiteAlert.find({
    type: "tenant_quota",
    status: { $in: ["active", "acknowledged"] },
  }).select("fingerprint tenant").lean();
  for (const open of openQuotaAlerts) {
    if (open.tenant && !flaggedIds.has(String(open.tenant))) {
      await SiteAlert.updateOne(
        { _id: open._id, status: { $in: ["active", "acknowledged"] } },
        { $set: { status: "resolved", resolvedAt: new Date() } },
      );
    }
  }

  // Recover tenant-scoped subscription/suspension alerts whose tenant is no
  // longer suspended (reactivated by an admin) so the feed stays current.
  const openSubAlerts = await SiteAlert.find({
    type: "subscription",
    status: { $in: ["active", "acknowledged"] },
    tenant: { $ne: null },
  }).select("tenant").lean();
  if (openSubAlerts.length > 0) {
    const tenantIds = [...new Set(openSubAlerts.map((a) => a.tenant))];
    const stillSuspended = await Tenant.find({ _id: { $in: tenantIds }, status: "suspended" })
      .select("_id")
      .lean();
    const stillIds = new Set(stillSuspended.map((t) => String(t._id)));
    for (const open of openSubAlerts) {
      if (!stillIds.has(String(open.tenant))) {
        await SiteAlert.updateOne(
          { _id: open._id, status: { $in: ["active", "acknowledged"] } },
          { $set: { status: "resolved", resolvedAt: new Date() } },
        );
      }
    }
  }

  // Surface currently-quarantined tenants (automatic or manual) as alerts
  // (raiseAlert dedups on the single fingerprint); recover when none remain.
  const quarantined = await Tenant.find({
    status: "suspended",
    quarantineReason: { $ne: null },
  }).select("name _id").lean();

  if (quarantined.length > 0) {
    await raiseAlert({
      type: "quarantine",
      severity: "warning",
      title: "Tenant(s) quarantined",
      message: `${quarantined.length} tenant(s) are currently quarantined.`,
      source: "platform",
      meta: { count: quarantined.length },
    });
  } else {
    await recoverAlert({ type: "quarantine", source: "platform" });
  }

  // -- Trials expiring within 7 days --------------------------------------
  const trialWindowEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const expiringTrials = await Tenant.find({
    status: "trial",
    trialEndsAt: { $gte: new Date(), $lte: trialWindowEnd },
  }).select("name trialEndsAt").lean();

  results.trialsExpiring = expiringTrials.length;
  if (expiringTrials.length > 0) {
    const names = expiringTrials.slice(0, 5).map((tr) => tr.name || String(tr._id)).join(", ");
    await raiseAlert({
      type: "trial_expiring",
      severity: "warning",
      title: "Trials expiring soon",
      message: `${expiringTrials.length} trial tenant(s) expire within 7 days: ${names}${expiringTrials.length > 5 ? "…" : ""}`,
      source: "platform",
      meta: { count: expiringTrials.length },
    });
  } else {
    await recoverAlert({ type: "trial_expiring", source: "platform" });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Cron lifecycle
// ---------------------------------------------------------------------------

let alertTask = null;

export function startAlertCron() {
  if (alertTask) {
    alertTask.stop();
    alertTask = null;
  }
  alertTask = cron.schedule("* * * * *", () => {
    evaluateAlerts().catch((err) => {
      console.error("[AlertEngine] evaluateAlerts failed:", err.message);
    });
  });
  console.log("[AlertEngine] Alert monitoring cron started (every minute)");
}

export function stopAlertCron() {
  if (alertTask) {
    alertTask.stop();
    alertTask = null;
    console.log("[AlertEngine] Alert monitoring cron stopped");
  }
}

// Test hook.
export function resetAlertCooldowns() {
  lastWrite.clear();
}