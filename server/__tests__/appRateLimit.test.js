import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// The global /api chain runs the maintenance + ipAllowlist middlewares, each of
// which does a PlatformSetting.findOne() probe. This test never connects
// mongoose, so without mocks every request stalls on the 10s buffer timeout.
// Those middlewares are unrelated to rate limiting, so stub them out.
vi.mock("../middleware/maintenance.js", () => ({
  maintenance: (_req, _res, next) => next(),
}));

vi.mock("../middleware/ipAllowlist.js", () => ({
  ipAllowlist: (_req, _res, next) => next(),
}));

import app from "../app.js";

// Invalid email + short password => rejected by validate(loginSchema) with 400,
// so these requests never hit the DB and never log in. The rate limiters run
// BEFORE the route handler, so they still count every request.
const LOGIN_PAYLOAD = { email: "rate.limit.test@example", password: "short" };

// app.js sets `trust proxy = 1`, so req.ip is taken from X-Forwarded-For.
// Different XFF values give isolated IP keys — this is what keeps the two
// limiter tests independent instead of leaking state like the old version.
const IP_A = "203.0.113.10"; // auth-limiter test (versioned)
const IP_B = "203.0.113.11"; // auth-limiter test (unversioned)

// The two auth limiters are both mounted on every login path
// (app.js: authLimiter max=20, emailAuthLimiter max=10), each with its own
// store. We must prove EACH one independently:
//  - email limiter: same account email + rotating IPs => 429 at limit=10.
//  - auth limiter:  fresh email per request + fixed IP       => 429 at limit=20.
async function hammer(path, { emailsPerRequest = false, xff }) {
  let last = null;
  const total = 25; // > both limits (10 and 20)
  for (let i = 0; i < total; i++) {
    const payload = emailsPerRequest
      ? { email: `rate.limit.${i}.${Date.now()}@example`, password: "short" }
      : LOGIN_PAYLOAD;
    const res = await request(app)
      .post(path)
      .set("X-Forwarded-For", xff)
      .send(payload);
    last = res;
  }
  return last;
}

// express-rate-limit v8 with standardHeaders:true + legacyHeaders:false emits
// a RateLimit-Policy header ("20;w=900") whose leading token is the limit.
// Asserting on it tells us WHICH limiter tripped (auth=20, email=10).
function limiterLimit(res) {
  const policy = String(res.headers["ratelimit-policy"] || "");
  const token = Number.parseInt(policy, 10);
  return Number.isNaN(token) ? null : token;
}

describe("auth rate limiting", () => {
  it(
    "email limiter blocks a targeted account after 10 attempts (rotating IPs)",
    async () => {
      // Rotating IPs mean the per-IP authLimiter never trips; only the
      // per-account emailAuthLimiter (max 10) can return 429 here.
      let last = null;
      for (let i = 0; i < 12; i++) {
        last = await request(app)
          .post("/api/v1/auth/login")
          .set("X-Forwarded-For", `198.51.100.${i}`)
          .send(LOGIN_PAYLOAD);
      }
      expect(last.status).toBe(429);
      expect(limiterLimit(last)).toBe(10);
      expect(last.body.message).toContain("for this account");
    },
    60000,
  );

  it(
    "auth limiter blocks the versioned /api/v1/auth/login endpoint after 20 (fresh emails, fixed IP)",
    async () => {
      // Fresh email per request => email key never exceeds 1; only the IP-keyed
      // authLimiter (max 20) can trip. Proves /api/v1/auth/login is covered.
      const res = await hammer("/api/v1/auth/login", {
        emailsPerRequest: true,
        xff: IP_A,
      });
      expect(res.status).toBe(429);
      expect(limiterLimit(res)).toBe(20);
      expect(res.body.message).not.toContain("for this account");
    },
    60000,
  );

  it(
    "auth limiter blocks the unversioned /api/auth/login endpoint after 20 (fresh emails, fixed IP)",
    async () => {
      // Same proof for the unversioned alias — with an independent IP so the
      // previous test's IP state cannot leak in.
      const res = await hammer("/api/auth/login", {
        emailsPerRequest: true,
        xff: IP_B,
      });
      expect(res.status).toBe(429);
      expect(limiterLimit(res)).toBe(20);
    },
    60000,
  );
});