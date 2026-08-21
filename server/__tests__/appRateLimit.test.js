import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// The global /api chain runs the maintenance + ipAllowlist middlewares, each of
// which does a PlatformSetting.findOne() probe. This test never connects
// mongoose, so without mocks every request stalls on the 10s buffer timeout and
// the versioned test (fresh limiter counters) cannot reach 429 within the 60s
// timeout. Those middlewares are unrelated to rate limiting, so stub them out.
vi.mock("../middleware/maintenance.js", () => ({
  maintenance: (_req, _res, next) => next(),
}));

vi.mock("../middleware/ipAllowlist.js", () => ({
  ipAllowlist: (_req, _res, next) => next(),
}));

import app from "../app.js";

const LIMIT = 20;

// Invalid email + short password => rejected by validate(loginSchema) with 400,
// so these requests never hit the DB and never log in.
const LOGIN_PAYLOAD = { email: "rate.limit.test@example", password: "short" };

async function exhaustAuthLimiter(path) {
  let lastStatus = 0;
  for (let i = 0; i < LIMIT + 1; i++) {
    const res = await request(app).post(path).send(LOGIN_PAYLOAD);
    lastStatus = res.status;
  }
  return lastStatus;
}

describe("auth rate limiting", () => {
  it(
    "rate-limits the versioned /api/v1/auth/login endpoint (brute-force bypass)",
    async () => {
      const status = await exhaustAuthLimiter("/api/v1/auth/login");
      expect(status).toBe(429);
    },
    60000,
  );

  it(
    "still rate-limits the unversioned /api/auth/login endpoint",
    async () => {
      const status = await exhaustAuthLimiter("/api/auth/login");
      expect(status).toBe(429);
    },
    60000,
  );
});
