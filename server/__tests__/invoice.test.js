import { beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";

vi.mock("../modules/billing/invoice.service.js", () => ({
  listInvoices: vi.fn(),
  getBillingSummary: vi.fn(),
  getInvoice: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  addPayment: vi.fn(),
  voidInvoice: vi.fn(),
  refundPayment: vi.fn(),
  getInvoiceAging: vi.fn(),
}));

vi.mock("../middleware/auth.js", () => ({ protect: vi.fn() }));

vi.mock("../utils/branchScope.js", () => ({
  filterByBranch: (req) => (req.user.tenant ? { tenant: req.user.tenant } : { branch: req.user.branch }),
  currentTenant: (req) => req.user.tenant ?? null,
  resolveBranchForCreate: async (req, bodyBranch) =>
    req.user.tenant ? bodyBranch || req.user.branch : req.user.branch,
  toObjectId: (v) => v,
  loadScopedPatient: vi.fn(),
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

import invoiceRouter from "../modules/billing/invoice.routes.js";
import * as invoiceService from "../modules/billing/invoice.service.js";
import { protect } from "../middleware/auth.js";
import { getCachedRole } from "../utils/cache.js";
import Invoice from "../modules/billing/invoice.model.js";

const OID = () => new mongoose.Types.ObjectId();

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

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/billing", invoiceRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  return app;
}

let currentUser = { _id: "u1", branch: "b1", roleId: "r1", tenant: null };

describe("Invoice model — money/status contract (computeTotals)", () => {
  function buildInvoice(overrides = {}) {
    return new Invoice({
      tenant: OID(),
      branch: OID(),
      patient: OID(),
      invoiceNo: "INV-TEST-001",
      items: [{ description: "Consultation", quantity: 1, unitPrice: 100 }],
      ...overrides,
    });
  }

  it("computes subtotal/total and stays unpaid for an unpaid invoice", async () => {
    const doc = buildInvoice();
    await doc.validate();
    expect(doc.subtotal).toBe(100);
    expect(doc.total).toBe(100);
    expect(doc.status).toBe("unpaid");
    expect(doc.balance).toBe(100);
  });

  it("applies a percentage discount", async () => {
    const doc = buildInvoice({
      items: [{ description: "Cleaning", quantity: 10, unitPrice: 100 }],
      discountType: "percentage",
      discountRate: 10,
    });
    await doc.validate();
    expect(doc.subtotal).toBe(1000);
    expect(doc.discount).toBe(100);
    expect(doc.total).toBe(900);
  });

  it("marks the invoice paid when payments cover the total", async () => {
    const doc = buildInvoice({
      payments: [{ amount: 100, method: "cash" }],
    });
    await doc.validate();
    expect(doc.status).toBe("paid");
    expect(doc.paidAmount).toBe(100);
    expect(doc.balance).toBe(0);
  });

  it("marks the invoice partial for a partial payment", async () => {
    const doc = buildInvoice({
      payments: [{ amount: 50, method: "cash" }],
    });
    await doc.validate();
    expect(doc.status).toBe("partial");
    expect(doc.paidAmount).toBe(50);
  });

  it("reduces paidAmount when a refund is recorded", async () => {
    const doc = buildInvoice({
      payments: [
        { amount: 100, method: "cash" },
        { amount: -50, method: "cash", isRefund: true },
      ],
    });
    await doc.validate();
    expect(doc.paidAmount).toBe(50);
    expect(doc.status).toBe("partial");
  });

  it("never flips a void invoice back to a payable status", async () => {
    const doc = buildInvoice({
      status: "void",
      payments: [{ amount: 50, method: "cash" }],
    });
    await doc.validate();
    expect(doc.status).toBe("void");
  });
});

describe("Invoice API contract", () => {
  beforeEach(() => {
    currentUser = { _id: "u1", branch: "b1", roleId: "r1", tenant: null };
    vi.mocked(getCachedRole).mockResolvedValue(FULL_ROLE);
    vi.mocked(protect).mockImplementation((req, _res, next) => {
      if (!req.cookies?.access_token) {
        return next(Object.assign(new Error("Not authenticated"), { statusCode: 401 }));
      }
      req.user = currentUser;
      next();
    });
  });

  it("lists invoices with the success envelope", async () => {
    vi.mocked(invoiceService.listInvoices).mockResolvedValue({
      invoices: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 1 },
    });
    const res = await request(makeApp())
      .get("/api/billing")
      .set("Cookie", "access_token=tok");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invoices).toEqual([]);
  });

  it("returns the billing summary", async () => {
    vi.mocked(invoiceService.getBillingSummary).mockResolvedValue({
      summary: { count: 0, totalBilled: 0, totalPaid: 0, outstanding: 0 },
      byStatus: [],
    });
    const res = await request(makeApp())
      .get("/api/billing/summary")
      .set("Cookie", "access_token=tok");
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBeDefined();
  });

  it("returns a single invoice", async () => {
    vi.mocked(invoiceService.getInvoice).mockResolvedValue({ _id: "inv1", invoiceNo: "INV-00001", branch: "b1" });
    const res = await request(makeApp())
      .get("/api/billing/inv1")
      .set("Cookie", "access_token=tok");
    expect(res.status).toBe(200);
    expect(res.body.data.invoice.invoiceNo).toBe("INV-00001");
  });

  it("creates an invoice with 201 and the success envelope", async () => {
    vi.mocked(invoiceService.createInvoice).mockResolvedValue({
      _id: "inv1",
      branch: "b1",
      invoiceNo: "INV-00001",
      total: 100,
    });
    const res = await request(makeApp())
      .post("/api/billing")
      .set("Cookie", "access_token=tok")
      .send({
        patient: "64b000000000000000000001",
        branch: "64b000000000000000000002",
        items: [{ description: "Consultation", quantity: 1, unitPrice: 100 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invoice.invoiceNo).toBe("INV-00001");
  });

  it("rejects an invoice without line items (400)", async () => {
    const res = await request(makeApp())
      .post("/api/billing")
      .set("Cookie", "access_token=tok")
      .send({ patient: "64b000000000000000000001", items: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("records a payment on an invoice", async () => {
    vi.mocked(invoiceService.addPayment).mockResolvedValue({
      _id: "inv1",
      branch: "b1",
      invoiceNo: "INV-00001",
      paidAmount: 50,
    });
    const res = await request(makeApp())
      .post("/api/billing/inv1/payments")
      .set("Cookie", "access_token=tok")
      .send({ amount: 50, method: "cash" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("rejects a payment with a non-positive amount (400)", async () => {
    const res = await request(makeApp())
      .post("/api/billing/inv1/payments")
      .set("Cookie", "access_token=tok")
      .send({ amount: 0, method: "cash" });
    expect(res.status).toBe(400);
  });

  it("requires a reason when voiding an invoice (400)", async () => {
    const res = await request(makeApp())
      .post("/api/billing/inv1/void")
      .set("Cookie", "access_token=tok")
      .send({});
    expect(res.status).toBe(400);
  });

  it("denies creating an invoice without the billing:create permission (403)", async () => {
    vi.mocked(getCachedRole).mockResolvedValue(READ_ROLE);
    const res = await request(makeApp())
      .post("/api/billing")
      .set("Cookie", "access_token=tok")
      .send({
        patient: "64b000000000000000000001",
        items: [{ description: "Consultation", quantity: 1, unitPrice: 100 }],
      });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("You do not have permission to create billing");
  });

  it("blocks access when the tenant plan does not include billing (403)", async () => {
    currentUser = { ...currentUser, tenant: { _id: "t1", planModules: ["dashboard", "patients"] } };
    const res = await request(makeApp())
      .get("/api/billing")
      .set("Cookie", "access_token=tok");
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("does not include the billing module");
  });

  it("returns 401 without a session cookie", async () => {
    const res = await request(makeApp()).get("/api/billing");
    expect(res.status).toBe(401);
  });
});
