import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from "vitest";

const h = vi.hoisted(() => {
  const getRedis = vi.fn(() => null);
  const makeClient = () => {
    const pipe = {
      zremrangebyscore: vi.fn(),
      zadd: vi.fn(),
      expire: vi.fn(),
      incr: vi.fn(),
      exec: vi.fn(() => Promise.resolve([])),
    };
    return {
      status: "ready",
      pipeline: vi.fn(() => pipe),
      zcard: vi.fn(() => Promise.resolve(3)),
      get: vi.fn(() => Promise.resolve("2")),
      zremrangebyscore: vi.fn(() => Promise.resolve(1)),
      scan: vi.fn(() => Promise.resolve(["0", []])),
      del: vi.fn(() => Promise.resolve(1)),
    };
  };
  return {
    getRedis,
    makeClient,
    tenantFindById: vi.fn(() => Promise.resolve(null)),
    tenantFind: vi.fn(),
    appendAuditLog: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("../config/redis.js", () => ({ getRedis: h.getRedis }));
vi.mock("../modules/site/tenant/tenant.model.js", () => ({
  default: { findById: h.tenantFindById, find: h.tenantFind },
}));
vi.mock("../utils/auditChain.js", () => ({ appendAuditLog: h.appendAuditLog }));

import {
  trackRequest,
  getAbuseStatsByIp,
  getAbuseStatsForTenants,
  resetStatsForTenant,
  startAbuseCron,
  stopAbuseCron,
  stopAbuseFlusher,
} from "../services/abuseDetection.js";

const T0 = new Date("2026-06-01T12:00:00.000Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

beforeEach(() => {
  vi.setSystemTime(T0);
  h.getRedis.mockReturnValue(null);
  h.appendAuditLog.mockReset();
  h.appendAuditLog.mockResolvedValue(undefined);
  h.tenantFindById.mockReset();
  h.tenantFindById.mockResolvedValue(null);
  h.tenantFind.mockReturnValue({
    select() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    lean: () => Promise.resolve([]),
  });
});

afterEach(() => {
  h.getRedis.mockReturnValue(null);
});

afterAll(() => {
  stopAbuseFlusher();
  vi.useRealTimers();
});

async function hit(tenantId, status = 200, times = 1, stepMs = 0) {
  for (let i = 0; i < times; i++) {
    await trackRequest(tenantId, status);
    if (stepMs > 0 && i < times - 1) {
      vi.advanceTimersByTime(stepMs);
    }
  }
}

describe("trackRequest", () => {
  it("counts requests within the same window", async () => {
    await hit("t-mem-1", 200, 3);
    expect(h.getRedis).toHaveBeenCalled();
    expect(await trackRequest("t-mem-1", 200)).toEqual({ count: 4, errors: 0 });
  });

  it("accumulates 4xx/5xx responses as errors", async () => {
    await trackRequest("t-mem-2", 200);
    await trackRequest("t-mem-2", 401);
    await trackRequest("t-mem-2", 500);
    expect(await trackRequest("t-mem-2", 200)).toEqual({ count: 4, errors: 2 });
  });

  it("opens a new window once the counter window elapses", async () => {
    await trackRequest("t-mem-3", 200);
    vi.advanceTimersByTime(61_000);
    expect(await trackRequest("t-mem-3", 200)).toEqual({ count: 1, errors: 0 });
  });

  it("uses the unknown bucket for falsy tenant ids", async () => {
    await trackRequest(null, 200);
    expect(await trackRequest(undefined, 200)).toEqual({ count: 2, errors: 0 });
  });

  it("tracks via redis when a ready client is available", async () => {
    const client = h.makeClient();
    h.getRedis.mockReturnValue(client);
    const result = await trackRequest("t-redis", 200, 1);
    expect(client.pipeline).toHaveBeenCalled();
    expect(client.zcard).toHaveBeenCalledWith("abuse:t-redis");
    expect(client.get).toHaveBeenCalledWith("abuse_err:t-redis");
    expect(result.count).toBe(3);
    expect(result.errors).toBe(2);
  });
});

describe("abuse checks (in-memory)", () => {
  it("reports a low-traffic ip as ok", async () => {
    await hit("ip:203.0.113.11", 200, 1);
    const stats = await getAbuseStatsByIp();
    const row = stats.find((s) => s.ip === "203.0.113.11");
    expect(row).toMatchObject({ flagged: false, level: "ok" });
  });

  it("flags high request rates at warning level", async () => {
    await hit("ip:203.0.113.7", 200, 10);
    const stats = await getAbuseStatsByIp();
    const row = stats.find((s) => s.ip === "203.0.113.7");
    expect(row.flagged).toBe(true);
    expect(row.level).toBe("warning");
    expect(row.reason).toContain("High request rate (600 req/min)");
    expect(row.currentRate).toBe(600);
  });

  it("flags extreme request rates as critical", async () => {
    await hit("ip:203.0.113.10", 200, 40);
    const stats = await getAbuseStatsByIp();
    const row = stats.find((s) => s.ip === "203.0.113.10");
    expect(row.flagged).toBe(true);
    expect(row.level).toBe("critical");
    expect(row.reason).toContain("Extreme request rate (2400 req/min)");
  });

  it("flags a high error rate when the request rate is under the alert threshold", async () => {
    await hit("ip:203.0.113.9", 429, 50, 200);
    const stats = await getAbuseStatsByIp();
    const row = stats.find((s) => s.ip === "203.0.113.9");
    expect(row.level).toBe("warning");
    expect(row.reason).toContain("High error rate (50 errors in window)");
  });
});

describe("quarantine via getAbuseStatsForTenants", () => {
  function tenantRows(rows) {
    h.tenantFind.mockReturnValue({
      select() {
        return this;
      },
      skip() {
        return this;
      },
      limit() {
        return this;
      },
      lean: () => Promise.resolve(rows),
    });
  }

  it("auto-quarantines an extreme-rate active tenant", async () => {
    tenantRows([{ _id: "tenant-quar", name: "Acme", isActive: true, plan: "pro" }]);
    const tenant = {
      _id: "tenant-quar",
      name: "Acme",
      isActive: true,
      status: "active",
      save: vi.fn(() => Promise.resolve()),
    };
    h.tenantFindById.mockResolvedValue(tenant);

    await hit("tenant-quar", 200, 40);
    const stats = await getAbuseStatsForTenants();

    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ tenantId: "tenant-quar", flagged: true, level: "critical" });
    expect(tenant.isActive).toBe(false);
    expect(tenant.status).toBe("suspended");
    expect(tenant.quarantineReason).toContain("Extreme request rate");
    expect(tenant.save).toHaveBeenCalled();
    expect(h.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "quarantine.set",
        scope: "site",
        target: { type: "tenant", id: "tenant-quar", name: "Acme" },
      }),
    );
  });

  it("does not quarantine an inactive tenant", async () => {
    tenantRows([{ _id: "tenant-inact", name: "Old", isActive: false, plan: "free" }]);
    const tenant = { _id: "tenant-inact", isActive: false, save: vi.fn(() => Promise.resolve()) };
    h.tenantFindById.mockResolvedValue(tenant);

    await hit("tenant-inact", 200, 40);
    const stats = await getAbuseStatsForTenants();

    expect(stats[0].level).toBe("critical");
    expect(tenant.save).not.toHaveBeenCalled();
    expect(h.appendAuditLog).not.toHaveBeenCalled();
  });
});

describe("resetStatsForTenant", () => {
  it("removes an ip counter from the in-memory store", async () => {
    await hit("ip:203.0.113.12", 200, 5);
    const before = await getAbuseStatsByIp();
    expect(before.some((s) => s.ip === "203.0.113.12")).toBe(true);

    await resetStatsForTenant("ip:203.0.113.12");
    const after = await getAbuseStatsByIp();
    expect(after.some((s) => s.ip === "203.0.113.12")).toBe(false);
  });
});

describe("abuse cron", () => {
  it("scans tenant and ip stats without throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await hit("ip:203.0.113.7", 200, 10);
      startAbuseCron();
      await vi.advanceTimersByTimeAsync(60_000);
      stopAbuseCron();
      expect(warnSpy.mock.calls.some(([msg]) => String(msg).includes("203.0.113.9"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
      stopAbuseCron();
    }
  });
});