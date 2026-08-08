import request from "supertest";
import { describe, expect, it } from "vitest";
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
