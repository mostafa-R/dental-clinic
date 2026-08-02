import { beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";

vi.mock("../modules/patients/installment.model.js", () => {
  const chainable = () => {
    const ch = {
      sort: () => ch,
      skip: () => ch,
      limit: () => ch,
      populate: () => ch,
      then: (resolve) => resolve([]),
      catch: () => {},
    };
    return ch;
  };
  class MockInstallmentPlan {}
  MockInstallmentPlan.find = vi.fn(() => chainable());
  MockInstallmentPlan.countDocuments = vi.fn();
  MockInstallmentPlan.create = vi.fn();
  return { default: MockInstallmentPlan };
});

vi.mock("../modules/patients/wallet.service.js", () => ({
  getOrCreateWallet: vi.fn(),
  addTransaction: vi.fn(),
}));

vi.mock("../middleware/auth.js", () => ({ protect: vi.fn() }));

vi.mock("../utils/branchScope.js", () => ({
  loadScopedPatient: vi.fn(),
  filterByBranch: (req) => ({ branch: req.user.branch }),
}));

vi.mock("../modules/users/role.model.js", () => {
  class MockRole {}
  MockRole.findById = vi.fn();
  return { default: MockRole };
});

vi.mock("../utils/cache.js", () => ({
  getCachedRole: vi.fn(),
  cacheRole: vi.fn(),
  invalidateRole: vi.fn(),
  getCachedPermission: vi.fn(),
  cachePermission: vi.fn(),
  invalidatePermission: vi.fn(),
}));

import installmentPlanRouter from "../modules/patients/installmentPlan.routes.js";
import InstallmentPlan from "../modules/patients/installment.model.js";
import { protect } from "../middleware/auth.js";
import { loadScopedPatient } from "../utils/branchScope.js";
import { getCachedRole } from "../utils/cache.js";

const FULL_ROLE = {
  _id: "r1",
  tenant: null,
  isSystemAdmin: false,
  permissions: [{ module: "billing", actions: ["read", "create", "update", "delete"] }],
};

const READ_ROLE = {
  _id: "r1",
  tenant: null,
  isSystemAdmin: false,
  permissions: [{ module: "billing", actions: ["read"] }],
};

const PATIENT = { _id: "p1", branch: "b1", tenant: "t1", patientId: "PT-00001" };
const DUE = "2026-09-01T00:00:00.000Z";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/patients/:patientId/installments", installmentPlanRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  return app;
}

describe("Installment plan API contract", () => {
  beforeEach(() => {
    vi.mocked(getCachedRole).mockResolvedValue(FULL_ROLE);
    vi.mocked(loadScopedPatient).mockResolvedValue(PATIENT);
    vi.mocked(protect).mockImplementation((req, _res, next) => {
      if (!req.cookies?.access_token) {
        return next(Object.assign(new Error("Not authenticated"), { statusCode: 401 }));
      }
      req.user = { _id: "u1", branch: "b1", roleId: "r1", tenant: null };
      next();
    });
  });

  it("rejects a plan whose installments do not sum to the total (400)", async () => {
    const res = await request(makeApp())
      .post("/api/patients/p1/installments")
      .set("Cookie", "access_token=tok")
      .send({
        title: "Dental Plan",
        totalAmount: 100,
        installments: [{ dueDate: DUE, amount: 60 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Sum of installments must equal total amount");
    expect(InstallmentPlan.create).not.toHaveBeenCalled();
  });

  it("creates an installment plan (201)", async () => {
    vi.mocked(InstallmentPlan.create).mockResolvedValue({
      _id: "plan1",
      title: "Dental Plan",
      totalAmount: 100,
      installments: [{ number: 1, dueDate: DUE, amount: 100, status: "pending" }],
    });
    const res = await request(makeApp())
      .post("/api/patients/p1/installments")
      .set("Cookie", "access_token=tok")
      .send({
        title: "Dental Plan",
        totalAmount: 100,
        installments: [{ dueDate: DUE, amount: 100 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.installmentPlan.title).toBe("Dental Plan");
  });

  it("rejects a plan with no installments (400)", async () => {
    const res = await request(makeApp())
      .post("/api/patients/p1/installments")
      .set("Cookie", "access_token=tok")
      .send({ title: "Plan", totalAmount: 100, installments: [] });
    expect(res.status).toBe(400);
  });

  it("rejects a non-positive total amount (400)", async () => {
    const res = await request(makeApp())
      .post("/api/patients/p1/installments")
      .set("Cookie", "access_token=tok")
      .send({ title: "Plan", totalAmount: 0, installments: [{ dueDate: DUE, amount: 0 }] });
    expect(res.status).toBe(400);
  });

  it("rejects an installment payment without an installmentId (400)", async () => {
    const res = await request(makeApp())
      .post("/api/patients/p1/installments/plan1/pay")
      .set("Cookie", "access_token=tok")
      .send({ amount: 50, paymentMethod: "cash" });
    expect(res.status).toBe(400);
  });

  it("rejects an installment payment with an invalid payment method (400)", async () => {
    const res = await request(makeApp())
      .post("/api/patients/p1/installments/plan1/pay")
      .set("Cookie", "access_token=tok")
      .send({
        installmentId: "64b000000000000000000001",
        amount: 50,
        paymentMethod: "bitcoin",
      });
    expect(res.status).toBe(400);
  });

  it("lists installment plans with the success envelope", async () => {
    vi.mocked(InstallmentPlan.countDocuments).mockResolvedValue(0);
    const res = await request(makeApp())
      .get("/api/patients/p1/installments")
      .set("Cookie", "access_token=tok");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.installmentPlans).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it("denies creating a plan without billing:create (403)", async () => {
    vi.mocked(getCachedRole).mockResolvedValue(READ_ROLE);
    const res = await request(makeApp())
      .post("/api/patients/p1/installments")
      .set("Cookie", "access_token=tok")
      .send({
        title: "Dental Plan",
        totalAmount: 100,
        installments: [{ dueDate: DUE, amount: 100 }],
      });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("You do not have permission to create billing");
  });
});
