import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../config/redis.js", () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../middleware/siteAuth.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    protectSite: (_req, _res, next) => next(),
  };
});

vi.mock("../modules/site/analytics/siteAnalytics.service.js", () => ({
  getGlobalStats: vi.fn().mockResolvedValue({ totalTenants: 3 }),
  getGrowthData: vi.fn().mockResolvedValue({ tenants: [], patients: [], revenue: [] }),
  getRevenueByPlan: vi
    .fn()
    .mockResolvedValue([{ plan: "pro", count: 2, mrr: 198 }]),
  getTenantUsage: vi.fn().mockResolvedValue(null),
}));

import siteAnalyticsRouter from "../modules/site/analytics/siteAnalytics.routes.js";

function buildApp(siteAdmin) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (siteAdmin) req.siteAdmin = siteAdmin;
    next();
  });
  app.use("/api/v1/site/analytics", siteAnalyticsRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || err.status || 500).json({ message: err.message });
  });
  return app;
}

describe("site analytics routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns revenue grouped by plan for an authorized admin", async () => {
    const app = buildApp({ role: "super_admin", permissions: [] });
    const res = await request(app).get("/api/v1/site/analytics/plans");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([{ plan: "pro", count: 2, mrr: 198 }]);
  });

  it("returns the global stats envelope", async () => {
    const app = buildApp({ role: "super_admin", permissions: [] });
    const res = await request(app).get("/api/v1/site/analytics/stats");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalTenants).toBe(3);
  });

  it("401 for unauthenticated requests to /plans", async () => {
    const app = buildApp(null);
    const res = await request(app).get("/api/v1/site/analytics/plans");
    expect(res.status).toBe(401);
  });
});
