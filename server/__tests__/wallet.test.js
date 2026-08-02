import { beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";

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

import walletRouter from "../modules/patients/wallet.routes.js";
import * as walletService from "../modules/patients/wallet.service.js";
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

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/patients/:patientId/wallet", walletRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  return app;
}

describe("Wallet API contract", () => {
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

  it("returns the wallet with pagination", async () => {
    vi.mocked(walletService.getOrCreateWallet).mockResolvedValue({
      balance: 120,
      transactions: [],
      toJSON: () => ({ _id: "w1", balance: 120, transactions: [] }),
    });
    const res = await request(makeApp())
      .get("/api/patients/p1/wallet")
      .set("Cookie", "access_token=tok");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.wallet.balance).toBe(120);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it("records a credit transaction", async () => {
    vi.mocked(walletService.addTransaction).mockResolvedValue({ _id: "w1", balance: 150 });
    const res = await request(makeApp())
      .post("/api/patients/p1/wallet/transactions")
      .set("Cookie", "access_token=tok")
      .send({ type: "credit", amount: 150, description: "Top up" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.wallet.balance).toBe(150);
  });

  it("rejects an unknown transaction type (400)", async () => {
    const res = await request(makeApp())
      .post("/api/patients/p1/wallet/transactions")
      .set("Cookie", "access_token=tok")
      .send({ type: "withdraw", amount: 50 });
    expect(res.status).toBe(400);
  });

  it("rejects a non-positive amount (400)", async () => {
    const res = await request(makeApp())
      .post("/api/patients/p1/wallet/transactions")
      .set("Cookie", "access_token=tok")
      .send({ type: "debit", amount: 0 });
    expect(res.status).toBe(400);
  });

  it("denies recording transactions without billing:update (403)", async () => {
    vi.mocked(getCachedRole).mockResolvedValue(READ_ROLE);
    const res = await request(makeApp())
      .post("/api/patients/p1/wallet/transactions")
      .set("Cookie", "access_token=tok")
      .send({ type: "credit", amount: 50 });
    expect(res.status).toBe(403);
  });
});
