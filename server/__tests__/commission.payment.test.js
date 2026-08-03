import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

vi.mock("../modules/billing/invoice.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../modules/appointments/appointment.model.js", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("../modules/users/user.model.js", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("../modules/billing/commission.model.js", () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));

vi.mock("../modules/patients/patient.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../modules/patients/wallet.service.js", () => ({
  addTransaction: vi.fn(),
}));

vi.mock("../core/transaction.js", () => ({
  withTransaction: vi.fn(async (fn) => {
    const session = { mock: true };
    return fn(session);
  }),
}));

vi.mock("../utils/branchScope.js", () => ({ toObjectId: (v) => v }));

import { addPayment } from "../modules/billing/invoice.service.js";
import Invoice from "../modules/billing/invoice.model.js";
import Appointment from "../modules/appointments/appointment.model.js";
import User from "../modules/users/user.model.js";
import Commission from "../modules/billing/commission.model.js";

const INV_ID = "507f1f77bcf86cd799439011";

function makeFresh({ total, appointment = "a1", payments = [] }) {
  const paidAmount = round(payments.reduce((s, p) => s + p.amount, 0));
  const fresh = {
    _id: INV_ID,
    tenant: "t1",
    branch: "b1",
    patient: "p1",
    appointment,
    invoiceNo: "INV-00001",
    total,
    paidAmount,
    status: paidAmount >= total ? "paid" : paidAmount > 0 ? "partial" : "unpaid",
    payments: [...payments],
    changelog: [],
    populate: vi.fn().mockResolvedValue({}),
    save: vi.fn(),
  };
  // Simulate the pre-validate recompute: paidAmount is a sum of the payments.
  fresh.save.mockImplementation(async () => {
    fresh.paidAmount = round(fresh.payments.reduce((s, p) => s + p.amount, 0));
    if (fresh.paidAmount >= total) fresh.status = "paid";
    else if (fresh.paidAmount > 0) fresh.status = "partial";
    else fresh.status = "unpaid";
  });
  return fresh;
}

function round(v) {
  return Math.round(v * 100) / 100;
}

function mockAppointmentDoctor() {
  vi.mocked(Appointment.findById).mockReturnValue({
    select: vi.fn().mockReturnThis(),
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue({ doctor: "doc1" }),
  });
}

function mockDoctor(commissionRate) {
  vi.mocked(User.findById).mockReturnValue({
    select: vi.fn().mockReturnThis(),
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue({ _id: "doc1", commissionRate, name: "Dr X", branch: "b1" }),
  });
}

describe("addPayment — commission on full payment (ISSUE-014)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accrues commission on the full invoice total when the invoice is fully paid", async () => {
    const fresh = makeFresh({ total: 100 });
    vi.mocked(Invoice.findOne).mockReturnValue({ session: vi.fn().mockResolvedValue(fresh) });
    mockAppointmentDoctor();
    mockDoctor(10);
    vi.mocked(Commission.findOne).mockReturnValue({ session: vi.fn().mockResolvedValue(null) });
    vi.mocked(Commission.create).mockResolvedValue([{}]);

    await addPayment(INV_ID, {}, { amount: 100, method: "cash", userId: "u1" });

    expect(Commission.findOne).toHaveBeenCalledTimes(1);
    expect(Commission.create).toHaveBeenCalledWith(
      [expect.objectContaining({ baseAmount: 100, rate: 10, invoice: INV_ID })],
      expect.objectContaining({ session: { mock: true } }),
    );
  });

  it("bases the commission on the full invoice total, not the final instalment", async () => {
    // 70 paid, final instalment of 30 completes the 100 invoice.
    const fresh = makeFresh({ total: 100, payments: [{ amount: 70 }] });
    vi.mocked(Invoice.findOne).mockReturnValue({ session: vi.fn().mockResolvedValue(fresh) });
    mockAppointmentDoctor();
    mockDoctor(10);
    vi.mocked(Commission.findOne).mockReturnValue({ session: vi.fn().mockResolvedValue(null) });
    vi.mocked(Commission.create).mockResolvedValue([{}]);

    await addPayment(INV_ID, {}, { amount: 30, method: "cash", userId: "u1" });

    expect(Commission.create).toHaveBeenCalledTimes(1);
    // Full invoice total (100), not the 30 that this payment contributed.
    expect(Commission.create).toHaveBeenCalledWith(
      [expect.objectContaining({ baseAmount: 100 })],
      expect.anything(),
    );
  });

  it("does not accrue commission on a partial payment", async () => {
    const fresh = makeFresh({ total: 100 });
    vi.mocked(Invoice.findOne).mockReturnValue({ session: vi.fn().mockResolvedValue(fresh) });
    mockAppointmentDoctor();
    mockDoctor(10);

    await addPayment(INV_ID, {}, { amount: 50, method: "cash", userId: "u1" });

    expect(Commission.findOne).not.toHaveBeenCalled();
    expect(Commission.create).not.toHaveBeenCalled();
  });

  it("re-earns a voided commission when a fully refunded invoice is paid in full again", async () => {
    const fresh = makeFresh({ total: 100, payments: [{ amount: 99.99 }] });
    vi.mocked(Invoice.findOne).mockReturnValue({ session: vi.fn().mockResolvedValue(fresh) });
    mockAppointmentDoctor();
    mockDoctor(10);

    const existing = {
      status: "void",
      baseAmount: 0,
      amount: 0,
      rate: 10,
      save: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(Commission.findOne).mockReturnValue({ session: vi.fn().mockResolvedValue(existing) });
    vi.mocked(Commission.create).mockResolvedValue([{}]);

    await addPayment(INV_ID, {}, { amount: 0.01, method: "cash", userId: "u1" });

    expect(Commission.create).not.toHaveBeenCalled();
    expect(existing.baseAmount).toBe(100);
    expect(existing.amount).toBe(10);
    expect(existing.status).toBe("pending");
    expect(existing.paidDate).toBeNull();
    expect(existing.save).toHaveBeenCalledWith(expect.objectContaining({ session: { mock: true } }));
  });

  it("skips commission when the doctor has no rate", async () => {
    const fresh = makeFresh({ total: 100 });
    vi.mocked(Invoice.findOne).mockReturnValue({ session: vi.fn().mockResolvedValue(fresh) });
    mockAppointmentDoctor();
    mockDoctor(0);

    await addPayment(INV_ID, {}, { amount: 100, method: "cash", userId: "u1" });

    expect(Commission.findOne).not.toHaveBeenCalled();
    expect(Commission.create).not.toHaveBeenCalled();
  });
});
