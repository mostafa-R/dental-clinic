import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alertModel: {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    updateOne: vi.fn(),
  },
  tenantModel: {
    countDocuments: vi.fn(),
    find: vi.fn(),
  },
  health: { getSystemHealth: vi.fn() },
  perf: { getPerfStats: vi.fn() },
  abuse: { getAbuseStatsForTenants: vi.fn() },
  memorySpy: null,
}));

vi.mock("../modules/site/alert/alert.model.js", () => ({ default: mocks.alertModel }));
vi.mock("../modules/site/tenant/tenant.model.js", () => ({ default: mocks.tenantModel }));
vi.mock("../utils/healthMonitor.js", () => ({ getSystemHealth: mocks.health.getSystemHealth }));
vi.mock("../utils/perfMonitor.js", () => ({ getPerfStats: mocks.perf.getPerfStats }));
vi.mock("../services/abuseDetection.js", () => ({ getAbuseStatsForTenants: mocks.abuse.getAbuseStatsForTenants }));

import SiteAlert from "../modules/site/alert/alert.model.js";
import Tenant from "../modules/site/tenant/tenant.model.js";
import { getSystemHealth } from "../utils/healthMonitor.js";
import { getPerfStats } from "../utils/perfMonitor.js";
import { getAbuseStatsForTenants } from "../services/abuseDetection.js";
import {
  buildFingerprint,
  computeErrorRatePct,
  evaluateAlerts,
  raiseAlert,
  recoverAlert,
  resetAlertCooldowns,
} from "../modules/site/alert/alertEngine.js";

function chainSelect(leanResult) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(leanResult) }) };
}

function healthyHealth() {
  getSystemHealth.mockResolvedValue({
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

beforeEach(() => {
  vi.clearAllMocks();
  resetAlertCooldowns();
  mocks.alertModel.findOne.mockResolvedValue(null);
  mocks.alertModel.find.mockReturnValue(chainSelect([]));
  mocks.tenantModel.find.mockReturnValue(chainSelect([]));
  mocks.tenantModel.countDocuments.mockResolvedValue(0);
  mocks.alertModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
  mocks.alertModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
});

afterEach(() => {
  mocks.memorySpy?.mockRestore();
  mocks.memorySpy = null;
});

describe("buildFingerprint", () => {
  it("is deterministic and distinct across types / tenants / keys", () => {
    const a = buildFingerprint({ type: "redis", scope: "platform" });
    expect(a).toBe(buildFingerprint({ type: "redis", scope: "platform" }));
    expect(a).not.toBe(buildFingerprint({ type: "mongodb", scope: "platform" }));
    expect(
      buildFingerprint({ type: "tenant_quota", scope: "tenant", tenantId: "t1", key: "quota" }),
    ).toBe(buildFingerprint({ type: "tenant_quota", scope: "tenant", tenantId: "t1", key: "quota" }));
    expect(
      buildFingerprint({ type: "tenant_quota", scope: "tenant", tenantId: "t1", key: "quota" }),
    ).not.toBe(buildFingerprint({ type: "tenant_quota", scope: "tenant", tenantId: "t2", key: "quota" }));
  });
});

describe("computeErrorRatePct", () => {
  it("computes the request error percentage", () => {
    expect(computeErrorRatePct({ totalRequests: 100, totalErrors: 3 })).toBe(3);
    expect(computeErrorRatePct({ totalRequests: 0, totalErrors: 0 })).toBe(0);
  });
});

describe("raiseAlert", () => {
  it("creates one row on first observation, then bumps occurrences instead of creating more", async () => {
    mocks.alertModel.create.mockResolvedValueOnce({ _id: "a1" });
    const first = await raiseAlert({ type: "memory", severity: "critical", title: "High memory", source: "health" });
    expect(first.created).toBe(true);
    expect(first.deduplicated).toBe(false);
    expect(mocks.alertModel.create).toHaveBeenCalledTimes(1);
    expect(mocks.alertModel.create.mock.calls[0][0].fingerprint).toBe(buildFingerprint({ type: "memory", source: "health" }));

    // Cooldown window: the second raise is deduplicated without creating a row.
    const deduped = await raiseAlert({ type: "memory", severity: "critical", title: "High memory", source: "health" });
    expect(deduped.deduplicated).toBe(true);
    expect(mocks.alertModel.create).toHaveBeenCalledTimes(1);

    // After resetting cooldown, a second same-fingerprint observation bumps
    // the open document (occurrenceCount++, never demotes severity) and does
    // NOT create a new row.
    resetAlertCooldowns();
    const save = vi.fn();
    const openDoc = { _id: "a1", severity: "warning", occurrenceCount: 1, save };
    mocks.alertModel.findOne.mockResolvedValueOnce(openDoc);
    const bumped = await raiseAlert({ type: "memory", severity: "critical", title: "High memory", source: "health" });
    expect(bumped.created).toBe(false);
    expect(bumped.deduplicated).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(openDoc.occurrenceCount).toBe(2);
    expect(openDoc.severity).toBe("critical");
    expect(mocks.alertModel.create).toHaveBeenCalledTimes(1);
  });

  it("survives a unique-index race by returning the existing row", async () => {
    mocks.alertModel.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }));
    mocks.alertModel.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: "existing" });
    const out = await raiseAlert({ type: "redis", severity: "critical", title: "Redis down" });
    expect(out.created).toBe(false);
    expect(out.alert).toEqual({ _id: "existing" });
  });
});

describe("recoverAlert", () => {
  it("resolves open alerts for the fingerprint", async () => {
    mocks.alertModel.updateMany.mockResolvedValue({ modifiedCount: 2 });
    const count = await recoverAlert({ type: "mongodb", source: "health" });
    expect(count).toBe(2);
    expect(mocks.alertModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: buildFingerprint({ type: "mongodb", scope: "platform", source: "health" }),
        status: { $in: ["active", "acknowledged"] },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: "resolved" }),
      }),
    );
  });
});

describe("evaluateAlerts", () => {
  it("raises an alert for each unhealthy / over-threshold signal in a single pass", async () => {
    getSystemHealth.mockResolvedValue({
      checks: [
        { component: "database", status: "unhealthy", details: { error: "ping failed" } },
        { component: "redis", status: "unhealthy", details: {} },
      ],
    });
    mocks.perf.getPerfStats.mockReturnValue({ totals: { totalRequests: 100, totalErrors: 10 }, globalAvgMs: 900 });
    setHeapUsagePercent(95);
    mocks.tenantModel.countDocuments.mockResolvedValue(8);
    mocks.abuse.getAbuseStatsForTenants.mockResolvedValue([
      { tenantId: "t1", name: "Clinic A", level: "critical", currentRate: 2200, currentErrors: 3, reason: "Extreme rate" },
    ]);

    await evaluateAlerts();

    const createdTypes = mocks.alertModel.create.mock.calls.map((c) => c[0].type);
    for (const t of ["mongodb", "redis", "memory", "error_rate", "response_time", "tenant_spike", "tenant_quota"]) {
      expect(createdTypes).toContain(t);
    }
    // The tenant_quota alert is scoped to the tenant and carries tenant metadata.
    const quota = mocks.alertModel.create.mock.calls.find((c) => c[0].type === "tenant_quota")[0];
    expect(quota.scope).toBe("tenant");
    expect(quota.tenant).toBe("t1");
    expect(quota.meta.currentRate).toBe(2200);
  });

  it("recovers every signal when the whole platform is healthy", async () => {
    healthyHealth();
    mocks.perf.getPerfStats.mockReturnValue({ totals: { totalRequests: 100, totalErrors: 0 }, globalAvgMs: 80 });
    setHeapUsagePercent(40);
    mocks.tenantModel.countDocuments.mockResolvedValue(0);
    mocks.abuse.getAbuseStatsForTenants.mockResolvedValue([]);
    mocks.alertModel.updateMany.mockResolvedValue({ modifiedCount: 1 });

    await evaluateAlerts();

    const recovered = mocks.alertModel.updateMany.mock.calls.map((c) => c[0].fingerprint);
    const sourceOf = (type) =>
      type === "tenant_spike" || type === "quarantine" ? "platform"
      : type === "error_rate" || type === "response_time" ? "performance"
      : "health";
    for (const type of ["mongodb", "redis", "memory", "error_rate", "response_time", "tenant_spike", "quarantine"]) {
      expect(recovered).toContain(buildFingerprint({ type, scope: "platform", source: sourceOf(type) }));
    }
    expect(mocks.alertModel.create).not.toHaveBeenCalled();
  });

  it("raises trial_expiring when trials end within 7 days and recovers when none remain", async () => {
    healthyHealth();
    mocks.perf.getPerfStats.mockReturnValue({ totals: { totalRequests: 100, totalErrors: 0 }, globalAvgMs: 80 });
    setHeapUsagePercent(40);
    mocks.tenantModel.countDocuments.mockResolvedValue(0);
    mocks.abuse.getAbuseStatsForTenants.mockResolvedValue([]);
    mocks.tenantModel.find.mockReturnValue(
      chainSelect([{ _id: "t9", name: "Soon Clinic", trialEndsAt: new Date() }]),
    );

    const first = await evaluateAlerts();

    expect(first.trialsExpiring).toBe(1);
    const createdTypes = mocks.alertModel.create.mock.calls.map((c) => c[0].type);
    expect(createdTypes).toContain("trial_expiring");
    const trial = mocks.alertModel.create.mock.calls.find((c) => c[0].type === "trial_expiring")[0];
    expect(trial.severity).toBe("warning");
    expect(trial.meta.count).toBe(1);
    expect(trial.message).toContain("Soon Clinic");

    mocks.tenantModel.find.mockReturnValue(chainSelect([]));
    await evaluateAlerts();

    const recovered = mocks.alertModel.updateMany.mock.calls.map((c) => c[0].fingerprint);
    expect(recovered).toContain(
      buildFingerprint({ type: "trial_expiring", scope: "platform", source: "platform" }),
    );
  });

  it("recovers tenant_quota alerts whose tenant is no longer flagged", async () => {
    healthyHealth();
    mocks.perf.getPerfStats.mockReturnValue({ totals: { totalRequests: 100, totalErrors: 0 }, globalAvgMs: 80 });
    setHeapUsagePercent(40);
    // Build the "open quota alert" document set returned by the chain query.
    const openAlerts = [
      { _id: "q1", tenant: "t1", fingerprint: buildFingerprint({ type: "tenant_quota", scope: "tenant", tenantId: "t1", key: "quota" }) },
      { _id: "q2", tenant: "t2", fingerprint: buildFingerprint({ type: "tenant_quota", scope: "tenant", tenantId: "t2", key: "quota" }) },
    ];
    mocks.alertModel.find.mockReturnValue(chainSelect(openAlerts));
    // t1 still flagged, t2 recovered.
    mocks.abuse.getAbuseStatsForTenants.mockResolvedValue([
      { tenantId: "t1", name: "Clinic A", level: "critical", currentRate: 900, reason: "High rate" },
    ]);
    mocks.alertModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await evaluateAlerts();

    const resolvedId = mocks.alertModel.updateOne.mock.calls[0][0];
    expect(resolvedId).toEqual({ _id: "q2", status: { $in: ["active", "acknowledged"] } });
    expect(resolvedId).not.toEqual({ _id: "q1", status: { $in: ["active", "acknowledged"] } });
  });
});