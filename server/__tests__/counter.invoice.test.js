import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/billing/invoice.model.js", () => ({
  default: { create: vi.fn() },
}));

vi.mock("../modules/patients/patient.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../modules/appointments/appointment.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../modules/patients/wallet.service.js", () => ({
  addTransaction: vi.fn(),
}));

vi.mock("../utils/branchScope.js", () => ({ toObjectId: (v) => v }));

vi.mock("../modules/users/user.model.js", () => ({ default: {} }));
vi.mock("../modules/billing/commission.model.js", () => ({ default: {} }));

import Counter from "../core/counters.js";
import { createInvoice } from "../modules/billing/invoice.service.js";
import Invoice from "../modules/billing/invoice.model.js";
import Patient from "../modules/patients/patient.model.js";
import Appointment from "../modules/appointments/appointment.model.js";

describe("Counter.next — session-aware sequence increments", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards the transaction session into findOneAndUpdate", async () => {
    const session = { id: "tx-session" };
    vi.spyOn(Counter, "findOneAndUpdate").mockResolvedValue({ seq: 7 });

    const seq = await Counter.next("invoice", "t1", session);

    expect(seq).toBe(7);
    expect(Counter.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "invoice:t1" },
      { $inc: { seq: 1 } },
      expect.objectContaining({
        session,
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }),
    );
  });

  it("omits session from the options when none is provided", async () => {
    vi.spyOn(Counter, "findOneAndUpdate").mockResolvedValue({ seq: 2 });

    await Counter.next("invoice", "t1");

    const options = vi.mocked(Counter.findOneAndUpdate).mock.calls[0][2];
    expect(options).not.toHaveProperty("session");
  });

  it("uses the session on the fallback findById read", async () => {
    const session = { id: "tx-session" };
    vi.spyOn(Counter, "findOneAndUpdate").mockResolvedValue(null);
    const chain = {
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ seq: 3 }),
    };
    vi.spyOn(Counter, "findById").mockReturnValue(chain);

    const seq = await Counter.next("invoice", "t1", session);

    expect(seq).toBe(3);
    expect(chain.session).toHaveBeenCalledWith(session);
  });
});

describe("createInvoice — appointment/patient consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const base = {
    data: {
      patient: "p1",
      appointment: "a1",
      items: [{ description: "Consultation", quantity: 1, unitPrice: 100 }],
    },
    branch: "b1",
    tenant: "t1",
    userId: "u1",
  };

  it("rejects when the appointment belongs to a different patient or branch", async () => {
    vi.mocked(Patient.findOne).mockResolvedValue({ _id: "p1" });
    vi.mocked(Appointment.findOne).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });

    await expect(createInvoice(base)).rejects.toMatchObject({ statusCode: 400 });

    expect(Appointment.findOne).toHaveBeenCalledWith({
      _id: "a1",
      branch: "b1",
      patient: "p1",
    });
    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it("links the invoice to the appointment when it matches the patient", async () => {
    vi.mocked(Patient.findOne).mockResolvedValue({ _id: "p1" });
    vi.mocked(Appointment.findOne).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ _id: "a1" }),
    });
    vi.mocked(Invoice.create).mockResolvedValue({
      _id: "inv1",
      populate: vi.fn().mockResolvedValue({ _id: "inv1" }),
    });

    await createInvoice(base);

    expect(Invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ patient: "p1", branch: "b1", appointment: "a1" }),
    );
  });

  it("creates without an appointment when none is supplied", async () => {
    vi.mocked(Patient.findOne).mockResolvedValue({ _id: "p1" });
    vi.mocked(Invoice.create).mockResolvedValue({
      _id: "inv1",
      populate: vi.fn().mockResolvedValue({ _id: "inv1" }),
    });

    await createInvoice({
      ...base,
      data: { ...base.data, appointment: undefined },
    });

    expect(Appointment.findOne).not.toHaveBeenCalled();
    expect(Invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ appointment: null }),
    );
  });
});
