import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────
// Monitoring v1 — staging smoke test
//
// Drives the real engine / reporter / controller / middleware
// code paths (models mocked at the data-access boundary) to
// verify, end to end:
//   1. Redis disconnected         -> critical `redis` alert
//   2. Mongo unhealthy            -> critical `mongodb` alert
//   3. Backup failure event       -> critical `backup` alert + recovery
//   4. Tenant auto-suspension     -> warning `subscription` alert + recovery
//   5. Quota exceeded             -> warning `tenant_quota` alert
//   Lifecycle: active -> acknowledged -> resolved/recovered
//   RBAC: a user without monitoring:alerts:* cannot read or modify
// ─────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const docStore = new Map();
  return {
    alertModel: {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      updateOne: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    },
    tenantModel: {
      countDocuments: vi.fn(),
      find: vi.fn(),
    },
    health: { getSystemHealth: vi.fn() },
    perf: { getPerfStats: vi.fn() },
    abuse: { getAbuseStatsForTenants: vi.fn() },
    jwt: { verifyAccessToken: vi.fn() },
    adminModel: { findById: vi.fn() },
    createdDocs: [],
    memorySpy: null,
  };
});

vi.mock("../modules/site/alert/alert.model.js", () => ({ default: mocks.alertModel }));
vi.mock("../modules/site/tenant/tenant.model.js", () => ({ default: mocks.tenantModel }));
vi.mock("../utils/healthMonitor.js", () => ({ getSystemHealth: mocks.health.getSystemHealth }));
vi.mock("../utils/perfMonitor.js", () => ({ getPerfStats: mocks.perf.getPerfStats }));
vi.mock("../services/abuseDetection.js", () => ({
  getAbuseStatsForTenants: mocks.abuse.getAbuseStatsForTenants,
}));
vi.mock("../utils/jwt.js", () => ({ verifyAccessToken: mocks.jwt.verifyAccessToken }));
vi.mock("../modules/site/admin/admin.model.js", () => ({ default: mocks.adminModel }));

import SiteAlert from "../modules/site/alert/alert.model.js";
import Tenant from "../modules/site/tenant/tenant.model.js";
import {
  buildFingerprint,
  evaluateAlerts,
  raiseAlert,
  recoverAlert,
  resetAlertCooldowns,
} from "../modules/site/alert/alertEngine.js";
import { reportEventAlert } from "../modules/site/alert/alertReporter.js";
import {
  acknowledgeAlert,
  acknowledgeAllAlerts,
  resolveAlert,
} from "../modules/site/alert/siteAlert.controller.js";
import {
  authorizeSite,
  protectSite,
  requireSitePermission,
} from "../middleware/siteAuth.js";
import { SITE_PERMISSIONS } from "../constants/sitePermissions.js";

const MONITORING_ALERTS_VIEW = SITE_PERMISSIONS.MONITORING_ALERTS_VIEW;

const chainSelect = (leanResult) => ({
  select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(leanResult) }),
});

function healthOk() {
  mocks.health.getSystemHealth.mockResolvedValue({
    checks: [
      { component: "database", status: "ok" },
      { component: "redis", status: "ok" },
    ],
  });
}

function setHeapUsagePercent(pct) {
  mocks.memorySpy?.mockRestore();
  mocks.memorySpy = vi.spyOn(process, "memoryUsage").mockReturnValue({
    rss: 0,
    heapTotal: 1000,
    heapUsed: pct * 10,
    external: 0,
    arrayBuffers: 0,
  });
}

function newAlertDoc(args = {}) {
  return {
    _id: args._id || `id-${mocks.createdDocs.length + 1}`,
    type: args.type,
    severity: args.severity,
    scope: args.scope || "platform",
    title: args.title,
    message: args.message || "",
    source: args.source || "system",
    tenant: args.tenant ?? args.tenantId ?? null,
    fingerprint: args.fingerprint,
    status: args.status || "active",
    occurrenceCount: 1,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    save: vi.fn(async function () {
      this.occurrenceCount += 1;
      return this;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAlertCooldowns();
  mocks.createdDocs.length = 0;

  healthOk();
  mocks.perf.getPerfStats.mockReturnValue({ totals: { totalRequests: 100, totalErrors: 0 }, globalAvgMs: 20 });
  mocks.abuse.getAbuseStatsForTenants.mockResolvedValue([]);
  mocks.tenantModel.countDocuments.mockResolvedValue(0);
  mocks.tenantModel.find.mockReturnValue(
    chainSelect([
      // quarantine query returns this until a test overrides it
    ]),
  );
  mocks.alertModel.findOne.mockResolvedValue(null);
  mocks.alertModel.find.mockReturnValue(chainSelect([]));
  mocks.alertModel.create.mockImplementation(async (args) => {
    const doc = newAlertDoc(args);
    mocks.createdDocs.push(doc);
    return doc;
  });
  mocks.alertModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
  mocks.alertModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
  mocks.alertModel.findByIdAndUpdate.mockImplementation((id, update) => {
    const doc = newAlertDoc({ _id: String(id), type: "redis", severity: "critical", title: "Redis is disconnected" });
    Object.assign(doc, { status: update.status, acknowledgedAt: update.acknowledgedAt, acknowledgedBy: update.acknowledgedBy, resolvedAt: update.resolvedAt, resolvedBy: update.resolvedBy });
    return { then: (ok) => Promise.resolve(ok(doc)), catch: () => {} };
  });
});

afterEach(() => {
  mocks.memorySpy?.mockRestore();
  mocks.memorySpy = null;
});

// ── helpers ──────────────────────────────────────────────────
function makeNext() {
  const errRef = { err: undefined };
  return {
    errRef,
    next: (err) => {
      errRef.err = err;
    },
  };
}

function makeRes() {
  const calls = [];
  return {
    calls,
    status(code) {
      calls.push(["status", code]);
      return this;
    },
    json(body) {
      calls.push(["json", body]);
      return this;
    },
  };
}

function captured(type) {
  return mocks.createdDocs.find((d) => d.type === type);
}

// ── 1. Redis disconnected ────────────────────────────────────
describe("Smoke: Redis disconnected", () => {
  it("raises a critical platform redis alert when health reports redis unhealthy", async () => {
    mocks.health.getSystemHealth.mockResolvedValue({
      checks: [
        { component: "database", status: "ok" },
        { component: "redis", status: "unhealthy", details: { error: "ECONNREFUSED" } },
      ],
    });
    setHeapUsagePercent(10);

    const results = await evaluateAlerts();

    expect(results.redis).toBe("raised");
    const alert = captured("redis");
    expect(alert).toBeTruthy();
    expect(alert.severity).toBe("critical");
    expect(alert.status).toBe("active");
    expect(alert.message).toContain("ECONNREFUSED");
  });
});

// ── 2. Mongo unhealthy ───────────────────────────────────────
describe("Smoke: Mongo unhealthy", () => {
  it("raises a critical platform mongodb alert when the database check is unhealthy", async () => {
    mocks.health.getSystemHealth.mockResolvedValue({
      checks: [
        { component: "database", status: "unhealthy", details: { error: "serverStatus failed" } },
        { component: "redis", status: "ok" },
      ],
    });
    setHeapUsagePercent(10);

    const results = await evaluateAlerts();

    expect(results.mongo).toBe("raised");
    const alert = captured("mongodb");
    expect(alert).toBeTruthy();
    expect(alert.severity).toBe("critical");
    expect(alert.status).toBe("active");
  });
});

// ── 3. Backup failure event ──────────────────────────────────
describe("Smoke: Backup failure event", () => {
  it("raises a critical backup alert and recovers it after the next success", async () => {
    await reportEventAlert({
      type: "backup",
      severity: "critical",
      source: "backup",
      key: "scheduled",
      title: "Scheduled backup failed",
      message: "ENOSPC: no space left on device",
    });

    const alert = captured("backup");
    expect(alert).toBeTruthy();
    expect(alert.severity).toBe("critical");
    expect(alert.status).toBe("active");

    mocks.alertModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    const recovered = await reportEventAlert({
      action: "recover",
      type: "backup",
      source: "backup",
      key: "scheduled",
    });

    expect(recovered).toBe(1);
    expect(mocks.alertModel.updateMany).toHaveBeenCalledWith(
      { fingerprint: buildFingerprint({ type: "backup", source: "backup", key: "scheduled" }), status: { $in: ["active", "acknowledged"] } },
      expect.objectContaining({ $set: expect.objectContaining({ status: "resolved" }) }),
    );
  });
});

// ── 4. Tenant auto-suspension event ──────────────────────────
describe("Smoke: Tenant suspension event", () => {
  it("raises a tenant-scoped subscription warning and the evaluator recovers it once reactivated", async () => {
    await reportEventAlert({
      type: "subscription",
      severity: "warning",
      scope: "tenant",
      tenantId: "t-101",
      key: "suspension",
      title: "Tenant suspended (overdue subscription)",
      message: "\"Clinic A\" was auto-suspended for an overdue subscription.",
      source: "system",
    });

    const alert = captured("subscription");
    expect(alert).toBeTruthy();
    expect(alert.severity).toBe("warning");
    expect(alert.scope).toBe("tenant");
    expect(alert.tenant).toBe("t-101");
    expect(alert.status).toBe("active");

    // Tenant still suspended -> evaluator must keep the alert open.
    mocks.alertModel.find
      .mockReturnValueOnce(chainSelect([])) // tenant_quota lookup: none
      .mockReturnValueOnce(chainSelect([{ _id: "open-sub", tenant: "t-101" }])); // subscription lookup
    mocks.tenantModel.find.mockReturnValueOnce(
      chainSelect([{ _id: "t-101" }]),
    );
    await evaluateAlerts();
    expect(mocks.alertModel.updateOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ _id: "open-sub" }),
      expect.anything(),
    );

    // Reactivated -> evaluator resolves the open subscription alert.
    mocks.alertModel.find
      .mockReturnValueOnce(chainSelect([])) // tenant_quota lookup: none
      .mockReturnValueOnce(chainSelect([{ _id: "open-sub", tenant: "t-101" }])); // subscription lookup
    mocks.tenantModel.find.mockReturnValueOnce(chainSelect([]));
    await evaluateAlerts();

    expect(mocks.alertModel.updateOne).toHaveBeenCalledWith(
      { _id: "open-sub", status: { $in: ["active", "acknowledged"] } },
      { $set: { status: "resolved", resolvedAt: expect.any(Date) } },
    );
  });
});

// ── 5. Quota exceeded ────────────────────────────────────────
describe("Smoke: Quota exceeded", () => {
  it("raises a tenant_quota warning for each tenant flagged critical by abuse stats", async () => {
    mocks.abuse.getAbuseStatsForTenants.mockResolvedValue([
      { tenantId: "t-707", level: "critical", currentRate: 900, currentErrors: 480, reason: "Request rate exceeds allowed 500/min" },
    ]);
    setHeapUsagePercent(10);

    const results = await evaluateAlerts();

    expect(results.tenantAlerts).toBe(1);
    const alert = captured("tenant_quota");
    expect(alert).toBeTruthy();
    expect(alert.scope).toBe("tenant");
    expect(alert.tenant).toBe("t-707");
    expect(alert.severity).toBe("warning");
    expect(alert.status).toBe("active");
  });
});

// ── Lifecycle: active -> acknowledged -> resolved/recovered ──
describe("Smoke: Alert lifecycle", () => {
  it("moves a raised alert through active -> acknowledged -> resolved", async () => {
    const { created } = await raiseAlert({
      type: "redis",
      severity: "critical",
      title: "Redis is disconnected",
      source: "health",
    });
    expect(created).toBe(true);
    expect(captured("redis").status).toBe("active");

    const res = makeRes();
    const ackReq = {
      params: { id: captured("redis")._id },
      siteAdmin: { _id: "admin-1" },
      auditTargetName: undefined,
      auditDetails: undefined,
    };
    await acknowledgeAlert(ackReq, res);

    const ackBody = res.calls.find(([k]) => k === "json")[1];
    expect(ackBody.data.alert.status).toBe("acknowledged");
    expect(ackBody.data.alert.acknowledgedBy).toBe("admin-1");
    expect(ackReq.auditDetails.action).toBe("alert.acknowledge");

    const res2 = makeRes();
    const resolveReq = {
      params: { id: captured("redis")._id },
      siteAdmin: { _id: "admin-1" },
      auditTargetName: undefined,
      auditDetails: undefined,
    };
    await resolveAlert(resolveReq, res2);

    const resolveBody = res2.calls.find(([k]) => k === "json")[1];
    expect(resolveBody.data.alert.status).toBe("resolved");
    expect(resolveReq.auditDetails.action).toBe("alert.resolve");
  });

  it("recovers every open row for a fingerprint with a single recoverAlert call", async () => {
    await raiseAlert({ type: "mongodb", severity: "critical", title: "MongoDB is unhealthy", source: "health" });
    mocks.alertModel.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const recovered = await recoverAlert({ type: "mongodb", source: "health" });

    expect(recovered).toBe(1);
    expect(mocks.alertModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: buildFingerprint({ type: "mongodb", source: "health" }),
      }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "resolved" }) }),
    );
  });

  it("acknowledge-all flips every active row in one pass", async () => {
    mocks.alertModel.updateMany.mockResolvedValue({ modifiedCount: 3 });
    const res = makeRes();
    const req = { siteAdmin: { _id: "admin-1" }, auditDetails: undefined };

    await acknowledgeAllAlerts(req, res);

    expect(mocks.alertModel.updateMany).toHaveBeenCalledWith(
      { status: "active" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "acknowledged" }) }),
    );
    expect(res.calls.find(([k]) => k === "json")[1]).toEqual({ success: true, data: { acknowledged: 3 } });
    expect(req.auditDetails.action).toBe("alert.acknowledge_all");
  });
});

// ── RBAC: users without monitoring:alerts:* cannot read/modify ──
describe("Smoke: RBAC gate", () => {
  it("blocks unauthenticated requests at protectSite", async () => {
    const { errRef, next } = makeNext();
    await protectSite({ headers: {}, cookies: {} }, {}, next);
    expect(errRef.err?.statusCode).toBe(401);
  });

  it("denies read to an admin whose permission set lacks monitoring:alerts:view", async () => {
    const { errRef, next } = makeNext();
    requireSitePermission(MONITORING_ALERTS_VIEW)(
      { siteAdmin: { role: "admin", permissions: ["settings.view"] } },
      {},
      next,
    );
    expect(errRef.err?.statusCode).toBe(403);
  });

  it("denies manage to an admin who holds view only", async () => {
    const { errRef, next } = makeNext();
    requireSitePermission("monitoring:alerts:manage")(
      { siteAdmin: { role: "admin", permissions: ["monitoring:alerts:view"] } },
      {},
      next,
    );
    expect(errRef.err?.statusCode).toBe(403);
  });

  it("denies access to roles outside super_admin/admin even with view", async () => {
    const { errRef, next } = makeNext();
    authorizeSite("super_admin", "admin")(
      { siteAdmin: { role: "support", permissions: ["monitoring:alerts:view"] } },
      {},
      next,
    );
    expect(errRef.err?.statusCode).toBe(403);
  });

  it("allows an admin with the exact permission and always allows super_admin", async () => {
    const ok = makeNext();
    requireSitePermission(MONITORING_ALERTS_VIEW)(
      { siteAdmin: { role: "admin", permissions: ["monitoring:alerts:view"] } },
      {},
      ok.next,
    );
    expect(ok.errRef.err).toBeUndefined();

    const superOk = makeNext();
    requireSitePermission("monitoring:alerts:manage")(
      { siteAdmin: { role: "super_admin", permissions: [] } },
      {},
      superOk.next,
    );
    expect(superOk.errRef.err).toBeUndefined();
  });
});