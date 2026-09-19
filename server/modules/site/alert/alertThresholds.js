/**
 * Monitoring v1 — alert thresholds.
 * Every threshold is overridable via env (ALERT_*). Pure constants so the
 * evaluator stays testable.
 */
export const ALERT_THRESHOLDS = {
  // Platform request error rate (errors / total requests) in percent
  ERROR_RATE_PERCENT: Number(process.env.ALERT_ERROR_RATE_PCT) || 2,

  // Process heap usage in percent
  MEMORY_USAGE_PERCENT: Number(process.env.ALERT_MEMORY_PCT) || 90,

  // Global average response time in ms (PRD target is < 200ms per route)
  RESPONSE_TIME_MS: Number(process.env.ALERT_RESPONSE_MS) || 500,

  // Tenant creations per rolling hour before it is considered a spike
  TENANT_SPIKE_PER_HOUR: Number(process.env.ALERT_TENANT_SPIKE) || 5,

  // Tenant abuse rate (req/min) before a tenant_quota alert fires
  TENANT_QUOTA_RATE_PER_MIN: Number(process.env.ALERT_QUOTA_RATE) || 500,
};

export const ALERT_SEVERITIES = ["critical", "warning", "info"];

export const ALERT_SOURCES = {
  HEALTH: "health",
  PERF: "performance",
  PLATFORM: "platform",
  SYSTEM: "system",
};