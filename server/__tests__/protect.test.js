import { beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";

vi.mock("../modules/users/user.model.js", () => {
  class MockUser {}
  MockUser.findById = vi.fn();
  return { default: MockUser };
});

vi.mock("../utils/cache.js", () => ({
  getCachedTenant: vi.fn(),
  cacheTenant: vi.fn(),
  invalidateTenant: vi.fn(),
}));

import { protect } from "../middleware/auth.js";
import User from "../modules/users/user.model.js";
import { getCachedTenant, cacheTenant } from "../utils/cache.js";
import { signAccessToken } from "../utils/jwt.js";

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.get("/protected", protect, (_req, res) =>
    res.status(200).json({ ok: true, user: _req.user._id, impersonating: !!_req.user._impersonating }),
  );
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  return app;
}

const activeTenant = {
  _id: "t1",
  plan: "professional",
  planModules: ["dashboard", "patients", "appointments", "billing"],
  planId: null,
  status: "active",
  name: "Clinic One",
  isActive: true,
  subscriptionEndsAt: null,
};

function makeUser({ tokenVersion = 0, isActive = true, tenant = activeTenant } = {}) {
  return {
    _doc: { tenant: tenant ? "t1" : null },
    _id: { toString: () => "u1" },
    name: "Dr Test",
    isActive,
    tokenVersion,
    tenant,
    toObject() {
      return {
        _id: "u1",
        name: "Dr Test",
        branch: "b1",
        roleId: null,
        tokenVersion,
        tenant: tenant ? { ...tenant } : null,
      };
    },
  };
}

function mockUser(user) {
  vi.mocked(User.findById).mockReturnValue({
    populate: vi.fn().mockReturnValue({
      populate: vi.fn().mockResolvedValue(user),
    }),
  });
}

describe("protect middleware", () => {
  beforeEach(() => {
    vi.mocked(getCachedTenant).mockReset();
    vi.mocked(cacheTenant).mockReset();
  });

  it("returns 401 when no access token cookie is present", async () => {
    const res = await request(makeApp()).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Not authenticated");
  });

  it("returns 401 for an invalid/expired access token", async () => {
    const res = await request(makeApp())
      .get("/protected")
      .set("Cookie", "access_token=not.a.jwt");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired access token");
  });

  it("returns 401 when the token has been revoked (tokenVersion mismatch)", async () => {
    mockUser(makeUser({ tokenVersion: 1 }));
    const token = signAccessToken({ _id: "u1", roleId: null, branch: "b1", tokenVersion: 0 });
    const res = await request(makeApp())
      .get("/protected")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toContain("revoked");
  });

  it("returns 403 for a disabled user", async () => {
    mockUser(makeUser({ isActive: false }));
    const token = signAccessToken({ _id: "u1", roleId: null, branch: "b1", tokenVersion: 0 });
    const res = await request(makeApp())
      .get("/protected")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Account is disabled");
  });

  it("returns 403 when the tenant subscription is suspended", async () => {
    mockUser(makeUser({ tenant: { ...activeTenant, status: "suspended" } }));
    vi.mocked(getCachedTenant).mockResolvedValue({ ...activeTenant, status: "suspended" });
    const token = signAccessToken({ _id: "u1", roleId: null, branch: "b1", tokenVersion: 0 });
    const res = await request(makeApp())
      .get("/protected")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("suspended");
  });

  it("passes the request through for a valid token on an active tenant", async () => {
    mockUser(makeUser());
    vi.mocked(getCachedTenant).mockResolvedValue(null);
    const token = signAccessToken({ _id: "u1", roleId: null, branch: "b1", tokenVersion: 0 });
    const res = await request(makeApp())
      .get("/protected")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(cacheTenant).toHaveBeenCalled();
  });

  it("marks the request as impersonating when the access token is an impersonation token", async () => {
    mockUser(makeUser());
    vi.mocked(getCachedTenant).mockResolvedValue(null);
    const token = signAccessToken(
      { _id: "u1", roleId: null, branch: "b1", tokenVersion: 0, impersonator: "siteadmin1" },
      "impersonation",
    );
    const res = await request(makeApp())
      .get("/protected")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.impersonating).toBe(true);
  });
});
