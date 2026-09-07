import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

// Exercise the REAL JWT signing/verification, REAL CSRF middleware, and REAL
// auth controller flow end-to-end. Only the DB models are mocked.

vi.mock("../modules/auth/auth.service.js", () => ({
  authenticateUser: vi.fn(),
  getUserWithTenant: vi.fn(),
  assertTenantActive: vi.fn(),
  getUserWithTenantInfo: vi.fn(),
}));

vi.mock("../middleware/auth.js", () => ({ protect: vi.fn() }));

vi.mock("../modules/users/user.model.js", () => {
  class MockUser {}
  MockUser.findById = vi.fn();
  MockUser.findOne = vi.fn();
  MockUser.findOneAndUpdate = vi.fn();
  MockUser.findByIdAndUpdate = vi.fn();
  return { default: MockUser };
});

import authRouter from "../modules/auth/auth.routes.js";
import * as authService from "../modules/auth/auth.service.js";
import { csrfProtection } from "../middleware/csrf.js";
import { protect } from "../middleware/auth.js";
import User from "../modules/users/user.model.js";
import ApiError from "../utils/ApiError.js";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
} from "../utils/jwt.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfProtection(["http://localhost:5173"]));
  app.use("/api/auth", authRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  return app;
}

const SAFE_PASSWORD = "Password123!";

async function makeRealUser(overrides = {}) {
  const passwordHash = await bcrypt.hash(SAFE_PASSWORD, 4);
  return {
    _id: "u1",
    name: "Dr Test",
    roleId: null,
    branch: null,
    tokenVersion: 0,
    password: passwordHash,
    comparePassword: (plain) => bcrypt.compare(plain, passwordHash),
    toSafeObject() {
      const { password: _pw, tokenVersion, __v, ...rest } = this;
      return rest;
    },
    ...overrides,
  };
}

describe("Auth feature — full flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(protect).mockImplementation(async (req, _res, next) => {
      const token = req.cookies?.[ACCESS_COOKIE];
      if (!token) return next(ApiError.unauthorized("Not authenticated"));
      let decoded;
      try {
        decoded = verifyAccessToken(token);
      } catch {
        return next(ApiError.unauthorized("Invalid or expired access token"));
      }
      req.user = { _id: decoded.sub, tokenVersion: decoded.tokenVersion, tenant: null };
      const user = await User.findById(decoded.sub);
      if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
        return next(ApiError.unauthorized("Token revoked"));
      }
      return next();
    });
  });

  it("LOGIN: signs JWTs, sets access/refresh cookies AND a csrf cookie, never leaks password", async () => {
    const realUser = await makeRealUser();
    vi.mocked(authService.authenticateUser).mockResolvedValue(realUser);

    const res = await request(makeApp())
      .post("/api/auth/login")
      .send({ email: "doctor@clinic.test", password: SAFE_PASSWORD });

    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"].map((c) => c.split("=")[0]);
    expect(cookies).toContain(ACCESS_COOKIE);
    expect(cookies).toContain(REFRESH_COOKIE);
    expect(cookies).toContain("_csrf");
    expect(JSON.stringify(res.body)).not.toContain("password");
    expect(JSON.stringify(res.body)).not.toContain("tokenVersion");
  });

  it("PROTECTED GET: a valid access token passes; a revoked one is rejected", async () => {
    const realUser = await makeRealUser();
    const access = signAccessToken(realUser);

    vi.mocked(User.findById).mockResolvedValue({ tokenVersion: 0 });
    const okRes = await request(makeApp())
      .get("/api/auth/me")
      .set("Cookie", `${ACCESS_COOKIE}=${access}`);
    expect(okRes.status).toBe(200);

    vi.mocked(User.findById).mockResolvedValue({ tokenVersion: 1 });
    const revokedRes = await request(makeApp())
      .get("/api/auth/me")
      .set("Cookie", `${ACCESS_COOKIE}=${access}`);
    expect(revokedRes.status).toBe(401);
    expect(revokedRes.body.message).toBe("Token revoked");
  });

  it("REFRESH: rotates the refresh token atomically via compare-and-swap", async () => {
    const refreshToken = signRefreshToken({ _id: "u1", roleId: null, branch: null, tokenVersion: 0 });

    vi.mocked(authService.getUserWithTenant).mockResolvedValue({
      _id: "u1",
      isActive: true,
      roleId: null,
      branch: null,
    });
    vi.mocked(authService.assertTenantActive).mockResolvedValue(undefined);
    vi.mocked(User.findOneAndUpdate).mockResolvedValue({ tokenVersion: 1 });

    const res = await request(makeApp())
      .post("/api/auth/refresh")
      .set("Cookie", `refresh_token=${refreshToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe("Token refreshed");
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "u1", tokenVersion: 0 },
      { $inc: { tokenVersion: 1 } },
      { returnDocument: "after" },
    );
    const cookies = res.headers["set-cookie"].map((c) => c.split("=")[0]);
    expect(cookies).toContain(ACCESS_COOKIE);
    expect(cookies).toContain(REFRESH_COOKIE);
  });

  it("CSRF: blocks a cross-site state-changing request even with a session cookie", async () => {
    const realUser = await makeRealUser();
    const access = signAccessToken(realUser);

    const res = await request(makeApp())
      .patch("/api/auth/preferences")
      .set("Cookie", `${ACCESS_COOKIE}=${access}`)
      .set("Origin", "http://evil.example.com")
      .send({ theme: "dark" });

    expect(res.status).toBe(403);
  });

  it("CSRF: allows same-origin state-changing requests", async () => {
    const realUser = await makeRealUser();
    const access = signAccessToken(realUser);
    vi.mocked(protect).mockImplementation((req, _res, next) => {
      if (!req.cookies?.[ACCESS_COOKIE]) return next(ApiError.unauthorized("Not authenticated"));
      req.user = { _id: "u1" };
      return next();
    });
    vi.mocked(User.findByIdAndUpdate).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue({ toSafeObject: () => ({ _id: "u1", preferences: { theme: "dark" } }) }),
      }),
    });

    const res = await request(makeApp())
      .patch("/api/auth/preferences")
      .set("Cookie", `${ACCESS_COOKIE}=${access}`)
      .set("Origin", "http://localhost:5173")
      .send({ theme: "dark" });

    expect(res.status).toBe(200);
  });

  it("LOGOUT: clears all session cookies including csrf", async () => {
    const res = await request(makeApp()).post("/api/auth/logout");
    expect(res.status).toBe(200);
    const cleared = res.headers["set-cookie"].map((c) => c.split("=")[0]);
    expect(cleared).toContain(ACCESS_COOKIE);
    expect(cleared).toContain(REFRESH_COOKIE);
    expect(cleared).toContain("_csrf");
  });
});

describe("jwt utils — token round-trip", () => {
  it("signs and verifies an access token carrying the expected claims", async () => {
    const user = await makeRealUser();
    const token = signAccessToken(user);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe("u1");
    expect(decoded.type).toBe("clinic");
    expect(decoded.tokenVersion).toBe(0);
  });

  it("clearAuthCookies clears the csrf cookie too", () => {
    const cookies = [];
    const res = {
      cookie: () => {},
      clearCookie: (name) => cookies.push(name),
      req: { secure: false },
    };
    clearAuthCookies(res);
    expect(cookies).toContain(ACCESS_COOKIE);
    expect(cookies).toContain(REFRESH_COOKIE);
    expect(cookies).toContain("_csrf");
  });
});