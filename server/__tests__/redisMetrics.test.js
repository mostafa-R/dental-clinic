import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const subscribers = [];
  return {
    subscribers,
    emit(ev, cb) { subscribers[ev] = cb; },
    isConnected: false,
    client: {
      multi: vi.fn(() => {
        const ops = [];
        const self = {
          incrby(...a) { ops.push(["incrby", ...a]); return self; },
          expire(...a) { ops.push(["expire", ...a]); return self; },
          async exec() { return ops; },
        };
        return self;
      }),
      mget: vi.fn(),
      scan: vi.fn(),
      set: vi.fn(),
    },
  };
});

vi.mock("../config/redis.js", () => ({
  isRedisConnected: () => state.isConnected,
  getRedis: () => (state.getRedisNull ? null : state.client),
}));

vi.mock("../utils/perfMonitor.js", () => ({
  getPerfStats: () => ({
    totals: { totalRequests: 100, totalErrors: 5, totalRoutes: 12 },
    routes: [{ avgMs: 50, count: 4 }],
  }),
}));

vi.mock("../utils/dbMonitor.js", () => ({
  getDbStats: () => ({
    summary: { totalQueries: 200, totalSlowQueries: 3, totalErrors: 1 },
    queries: [{ avgDuration: 10, count: 5 }],
  }),
}));

vi.mock("../utils/errorMonitor.js", () => ({
  getErrorMonitoringStats: () => ({ summary: { totalErrors: 7 } }),
}));

describe("utils/redisMetrics", () => {
  let metrics;

  beforeEach(async () => {
    vi.resetModules();
    metrics = await import("../utils/redisMetrics.js");
    state.isConnected = false;
    state.getRedisNull = false;
    vi.clearAllMocks();
    state.client.mget.mockResolvedValue(["100", "2000", "5", "12", "200", "50", "3", "1", "7"]);
    state.client.scan.mockResolvedValue(["0", []]);
    state.client.set.mockResolvedValue("OK");
  });

  it("flushMetricsToRedis reports shared:false when Redis is down", async () => {
    const result = await metrics.flushMetricsToRedis();
    expect(result).toEqual({ shared: false, published: false });
    expect(state.client.multi).not.toHaveBeenCalled();
  });

  it("flushMetricsToRedis publishes deltas on the first tick (full snapshot)", async () => {
    state.isConnected = true;
    const result = await metrics.flushMetricsToRedis();

    expect(result).toEqual({ shared: true, published: true });
    expect(state.client.multi).toHaveBeenCalled();
    expect(state.client.set).toHaveBeenCalledWith(
      expect.stringContaining(`metrics:worker:${process.pid}`),
      expect.any(String),
      "EX",
      60,
    );
  });

  it("flushMetricsToRedis computes deltas between ticks", async () => {
    state.isConnected = true;
    await metrics.flushMetricsToRedis(); // first tick seeds prev

    // Second tick with identical stats => zero deltas, published:false.
    const result = await metrics.flushMetricsToRedis();
    expect(result).toEqual({ shared: true, published: false });
  });

  it("getClusterMetrics reports disabled when Redis is down", async () => {
    const result = await metrics.getClusterMetrics();
    expect(result).toEqual({ enabled: false, shared: false });
  });

  it("getClusterMetrics aggregates worker values when connected", async () => {
    state.isConnected = true;
    state.client.scan.mockResolvedValue(["0", ["metrics:worker:100", "metrics:worker:200"]]);

    const result = await metrics.getClusterMetrics();

    expect(result).toEqual({
      enabled: true,
      shared: true,
      workers: 2,
      updatedAt: expect.any(String),
      requests: { total: 100, errors: 5, errorRate: 5, avgResponseMs: 20, observedRoutes: 12 },
      database: { totalQueries: 200, slowQueries: 3, errors: 1, slowQueryPercentage: 2, avgQueryMs: 0.25 },
      errors: { total: 7 },
    });
  });

  it("getClusterMetrics returns shared:false when the client is missing", async () => {
    state.isConnected = true;
    state.getRedisNull = true;
    expect(await metrics.getClusterMetrics()).toEqual({ enabled: true, shared: false });
    state.getRedisNull = false;
  });

  it("startMetricsExport kicks off an immediate flush and interval", async () => {
    state.isConnected = true;
    await metrics.flushMetricsToRedis();
    metrics.startMetricsExport(60000);
    metrics.stopMetricsExport();
    expect(state.client.multi).toHaveBeenCalled();
  });

  it("startMetricsExport is idempotent until stopped", async () => {
    state.isConnected = true;
    metrics.startMetricsExport(60000);
    metrics.startMetricsExport(60000);
    metrics.stopMetricsExport();
  });
});