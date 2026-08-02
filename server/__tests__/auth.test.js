import { beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";

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
import { protect } from "../middleware/auth.js";
import User from "../modules/users/user.model.js";
import ApiError from "../utils/ApiError.js";
import { signRefreshToken } from "../utils/jwt.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  return app;
}

const unauth = () => Object.assign(new Error("Not authenticated"), { statusCode: 401 });

function setSessionUser(user = { _id: "u1", name: "Dr Test" }) {
  vi.mocked(protect).mockImplementation((req, _res, next) => {
    if (!req.cookies?.access_token) return next(unauth());
    req.user = user;
    next();
  });
}

describe("POST /api/auth/login", () => {
  it("returns the user and sets session cookies on success", async () => {
    vi.mocked(authService.authenticateUser).mockResolvedValue({
      _id: "u1",
      name: "Dr Test",
      toSafeObject: () => ({ _id: "u1", name: "Dr Test" }),
    });
    const res = await request(makeApp())
      .post("/api/auth/login")
      .send({ email: "doctor@clinic.test", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.name).toBe("Dr Test");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects invalid credentials with 401", async () => {
    vi.mocked(authService.authenticateUser).mockRejectedValue(
      ApiError.unauthorized("Invalid email or password"),
    );
    const res = await request(makeApp())
      .post("/api/auth/login")
      .send({ email: "doctor@clinic.test", password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("rejects a disabled account with 403", async () => {
    vi.mocked(authService.authenticateUser).mockRejectedValue(
      ApiError.forbidden("Account is disabled"),
    );
    const res = await request(makeApp())
      .post("/api/auth/login")
      .send({ email: "doctor@clinic.test", password: "password123" });
    expect(res.status).toBe(403);
  });

  it("rejects a suspended tenant with 403", async () => {
    vi.mocked(authService.authenticateUser).mockRejectedValue(
      ApiError.forbidden("Your clinic subscription is suspended. Contact your platform administrator."),
    );
    const res = await request(makeApp())
      .post("/api/auth/login")
      .send({ email: "doctor@clinic.test", password: "password123" });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("suspended");
  });

  it("returns 400 when the body fails validation", async () => {
    const res = await request(makeApp())
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.mocked(authService.getUserWithTenantInfo).mockResolvedValue({ _id: "u1", name: "Dr Test" });
  });

  it("returns the current user with a valid session cookie", async () => {
    setSessionUser({ _id: "u1", name: "Dr Test" });
    const res = await request(makeApp())
      .get("/api/auth/me")
      .set("Cookie", "access_token=tok");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.name).toBe("Dr Test");
  });

  it("returns 401 without a session cookie", async () => {
    const res = await request(makeApp()).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Not authenticated");
  });
});

describe("PATCH /api/auth/preferences", () => {
  it("updates and returns the user preferences", async () => {
    setSessionUser({ _id: "u1" });
    vi.mocked(User.findByIdAndUpdate).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue({
          toSafeObject: () => ({ _id: "u1", preferences: { language: "ar", theme: "dark" } }),
        }),
      }),
    });
    const res = await request(makeApp())
      .patch("/api/auth/preferences")
      .set("Cookie", "access_token=tok")
      .send({ language: "ar", theme: "dark" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.preferences).toEqual({ language: "ar", theme: "dark" });
  });

  it("rejects an empty body with 400", async () => {
    setSessionUser({ _id: "u1" });
    const res = await request(makeApp())
      .patch("/api/auth/preferences")
      .set("Cookie", "access_token=tok")
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects an invalid theme with 400", async () => {
    setSessionUser({ _id: "u1" });
    const res = await request(makeApp())
      .patch("/api/auth/preferences")
      .set("Cookie", "access_token=tok")
      .send({ theme: "neon" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears session cookies and returns a message", async () => {
    const res = await request(makeApp()).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toBe("Logged out");
  });
});

describe("POST /api/auth/refresh", () => {
  it("returns 401 when the refresh cookie is missing", async () => {
    const res = await request(makeApp()).post("/api/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Refresh token missing");
  });

  it("rotates the token and responds when the refresh token is valid", async () => {
    const user = { _id: "u1", roleId: null, branch: null, tokenVersion: 0 };
    const token = signRefreshToken(user);
    vi.mocked(authService.getUserWithTenant).mockResolvedValue({ ...user, isActive: true });
    vi.mocked(authService.assertTenantActive).mockResolvedValue(undefined);
    vi.mocked(User.findOneAndUpdate).mockResolvedValue({ tokenVersion: 1 });

    const res = await request(makeApp())
      .post("/api/auth/refresh")
      .set("Cookie", `refresh_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe("Token refreshed");
    expect(res.headers["set-cookie"]).toBeDefined();
  });
});
