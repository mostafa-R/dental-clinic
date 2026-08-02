import { beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
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

import { phiRestrict, stripPHI } from "../middleware/phiRestrict.js";
import authRouter from "../modules/auth/auth.routes.js";
import * as authService from "../modules/auth/auth.service.js";
import User from "../modules/users/user.model.js";

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

describe("stripPHI", () => {
  it("deletes top-level PHI fields but keeps identity and non-PHI fields", () => {
    const out = stripPHI({
      _id: "p1",
      patientId: "PT-00001",
      firstName: "Jane",
      lastName: "Doe",
      phone: "+15551234567",
      email: "jane@example.com",
      address: "123 Main St",
      dateOfBirth: new Date("1990-01-01"),
      gender: "female",
      branch: "b1",
    });
    expect(out.phone).toBeUndefined();
    expect(out.email).toBeUndefined();
    expect(out.address).toBeUndefined();
    expect(out.dateOfBirth).toBeUndefined();
    expect(out._id).toBe("p1");
    expect(out.patientId).toBe("PT-00001");
    expect(out.firstName).toBe("Jane");
    expect(out.lastName).toBe("Doe");
    expect(out.gender).toBe("female");
    expect(out.branch).toBe("b1");
  });

  it("deletes nested medical history and array item fields recursively", () => {
    const out = stripPHI({
      _id: "n1",
      chiefComplaint: "Pain",
      examination: "Swelling",
      diagnosis: "Caries",
      plan: "Filling",
      medicalHistory: { chronicConditions: [{ name: "Diabetes" }], allergies: [{ name: "Penicillin" }], notes: "sensitive" },
      medications: [{ name: "Amoxicillin", dose: "500mg" }],
      teeth: [{ number: 12, state: "decayed", notes: "deep cavity" }],
      items: [{ procedureName: "Filling", notes: "small" }],
      nextAppointmentNotes: "review in 2 weeks",
      emergencyContact: { name: "Sam", phone: "+1555123" },
      insurance: { provider: "Acme", policyNumber: "X1" },
    });
    expect(out.chiefComplaint).toBeUndefined();
    expect(out.examination).toBeUndefined();
    expect(out.diagnosis).toBeUndefined();
    expect(out.plan).toBeUndefined();
    expect(out.medicalHistory).toBeUndefined();
    expect(out.medications).toBeUndefined();
    expect(out.nextAppointmentNotes).toBeUndefined();
    expect(out.emergencyContact).toBeUndefined();
    expect(out.insurance).toBeUndefined();
    expect(out.teeth[0].notes).toBeUndefined();
    expect(out.teeth[0].number).toBe(12);
    expect(out.teeth[0].state).toBe("decayed");
    expect(out.items[0].notes).toBeUndefined();
    expect(out.items[0].procedureName).toBe("Filling");
  });

  it("preserves dates, object ids, and returns primitives as-is", () => {
    const date = new Date("2024-01-01");
    const out = stripPHI({ _id: { toString: () => "o1" }, createdAt: date, count: 3 });
    expect(out._id).toEqual({ toString: expect.any(Function) });
    expect(out.createdAt).toBe(date);
    expect(out.count).toBe(3);
    expect(stripPHI(null)).toBeNull();
    expect(stripPHI("text")).toBe("text");
  });

  it("strips PHI inside every element of an array", () => {
    const out = stripPHI([{ phone: "1" }, { email: "a@b.c" }]);
    expect(out[0].phone).toBeUndefined();
    expect(out[1].email).toBeUndefined();
  });
});

describe("phiRestrict middleware", () => {
  it("sets req.isImpersonation when the user is impersonating", () => {
    let seen;
    const req = { user: { _id: "u1", _impersonating: true, _impersonator: "Admin" } };
    phiRestrict(req, {}, () => {
      seen = true;
    });
    expect(seen).toBe(true);
    expect(req.isImpersonation).toBe(true);
  });

  it("leaves req.isImpersonation unset for normal sessions", () => {
    const req = { user: { _id: "u1" } };
    phiRestrict(req, {}, () => {});
    expect(req.isImpersonation).toBeUndefined();
  });
});

describe("POST /api/auth/verify-impersonation", () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset();
    vi.mocked(authService.assertTenantActive).mockReset();
    vi.mocked(authService.assertTenantActive).mockResolvedValue(undefined);
  });

  function mockUser() {
    vi.mocked(User.findById).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue({
          _id: "u1",
          name: "Dr Impersonated",
          isActive: true,
          tokenVersion: 0,
          tenant: { _id: "t1", plan: "professional", planModules: [], planId: null, status: "active", name: "C1", isActive: true },
          toSafeObject: () => ({ _id: "u1", name: "Dr Impersonated", role: "doctor" }),
        }),
      }),
    });
  }

  function impersonationToken(overrides = {}) {
    return jwt.sign(
      {
        sub: "u1",
        roleId: null,
        branch: "b1",
        tenant: "t1",
        type: "impersonation",
        impersonator: "siteadmin1",
        impersonatorName: "Support Admin",
        tokenVersion: 0,
        ...overrides,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30m" },
    );
  }

  it("sets the access_token cookie so subsequent clinic calls authenticate via protect", async () => {
    mockUser();
    const token = impersonationToken();
    const res = await request(makeApp())
      .post("/api/auth/verify-impersonation")
      .send({ token });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user._impersonating).toBe(true);
    expect(res.body.data.user._impersonator).toBe("Support Admin");

    const cookie = res.headers["set-cookie"]?.find((c) => c.startsWith("access_token="));
    expect(cookie).toBeDefined();
    expect(cookie).toContain(encodeURIComponent(token));
    expect(cookie).toContain("Max-Age=");
  });

  it("returns 400 when the token is not an impersonation token", async () => {
    mockUser();
    const token = jwt.sign({ sub: "u1", type: "clinic", tokenVersion: 0 }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    const res = await request(makeApp())
      .post("/api/auth/verify-impersonation")
      .send({ token });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Not an impersonation token");
  });

  it("returns 401 for an invalid or expired token", async () => {
    const res = await request(makeApp())
      .post("/api/auth/verify-impersonation")
      .send({ token: "not.a.jwt" });
    expect(res.status).toBe(401);
    expect(res.body.message).toContain("impersonation token");
  });
});
