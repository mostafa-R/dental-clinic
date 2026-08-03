import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/emr/dentalChart.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../modules/billing/invoice.model.js", () => ({
  default: { create: vi.fn() },
}));

vi.mock("../core/transaction.js", () => ({
  withTransaction: vi.fn(async (fn) => {
    const session = { mock: true };
    return fn(session);
  }),
}));

vi.mock("../modules/inventory/inventory.service.js", () => ({
  deductForProcedure: vi.fn(async () => []),
}));

import mongoose from "mongoose";
import { generateInvoiceFromPlan } from "../modules/emr/treatmentPlan.service.js";
import DentalChart from "../modules/emr/dentalChart.model.js";
import Invoice from "../modules/billing/invoice.model.js";
import { withTransaction } from "../core/transaction.js";
import { deductForProcedure } from "../modules/inventory/inventory.service.js";

const OID = () => new mongoose.Types.ObjectId();

function makePlan() {
  return {
    updatedBy: null,
    items: [
      { _id: OID(), procedureName: "Cleaning", tooth: null, status: "pending", completedDate: null, estimatedCost: 100, invoice: null },
      { _id: OID(), procedureName: "Filling", tooth: 12, status: "pending", completedDate: null, estimatedCost: 150, invoice: null },
      { _id: OID(), procedureName: "Old Extraction", tooth: null, status: "completed", completedDate: new Date(), estimatedCost: 80, invoice: OID() },
    ],
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function makePatient() {
  return { _id: OID(), tenant: OID(), branch: OID() };
}

describe("generateInvoiceFromPlan — transactional invoice + item linking (ISSUE-021)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the invoice and links items inside a single transaction", async () => {
    const plan = makePlan();
    const patient = makePatient();
    const [cleanItem, fillingItem] = plan.items;
    const invoice = { _id: OID(), populate: vi.fn().mockResolvedValue({}) };

    vi.mocked(DentalChart.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ teeth: [{ number: 12, state: "" }] }),
    });
    vi.mocked(Invoice.create).mockResolvedValue([invoice]);

    const result = await generateInvoiceFromPlan(plan, patient, {
      itemIds: [cleanItem._id.toString(), fillingItem._id.toString()],
      userId: "u1",
    });

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(Invoice.create).toHaveBeenCalledWith(
      [expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ description: "Cleaning" }),
          expect.objectContaining({ description: "Filling (#12)" }),
        ]),
      })],
      expect.objectContaining({ session: { mock: true } }),
    );
    // Items are linked to the invoice...
    expect(cleanItem.invoice).toBe(invoice._id);
    expect(fillingItem.invoice).toBe(invoice._id);
    // ...and persisted via plan.save inside the same transaction.
    expect(plan.save).toHaveBeenCalledWith(expect.objectContaining({ session: { mock: true } }));
    // Inventory deduction joins the same session.
    expect(deductForProcedure).toHaveBeenCalledWith(
      patient.branch,
      patient.tenant,
      "",
      "Filling",
      "u1",
      expect.objectContaining({ mock: true }),
    );
    expect(result.invoice).toBe(invoice);
  });

  it("rejects items that are already invoiced instead of orphaning the previous invoice", async () => {
    const plan = makePlan();
    const patient = makePatient();
    const [cleanItem, , oldItem] = plan.items;

    await expect(
      generateInvoiceFromPlan(plan, patient, {
        itemIds: [cleanItem._id.toString(), oldItem._id.toString()],
        userId: "u1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(withTransaction).not.toHaveBeenCalled();
    expect(Invoice.create).not.toHaveBeenCalled();
    // The not-yet-invoiced item is left untouched.
    expect(cleanItem.invoice).toBeNull();
  });

  it("defaults to pending un-invoiced items when itemIds is omitted", async () => {
    const plan = makePlan();
    const patient = makePatient();
    const [cleanItem, fillingItem, oldItem] = plan.items;
    const invoice = { _id: OID(), populate: vi.fn().mockResolvedValue({}) };

    vi.mocked(DentalChart.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ teeth: [] }),
    });
    vi.mocked(Invoice.create).mockResolvedValue([invoice]);

    const result = await generateInvoiceFromPlan(plan, patient, { userId: "u1" });

    expect(cleanItem.invoice).toBe(invoice._id);
    expect(fillingItem.invoice).toBe(invoice._id);
    // Completed / previously-invoiced items are never re-linked.
    expect(oldItem.invoice).not.toBe(invoice._id);
    expect(result.invoice).toBe(invoice);
  });

  it("rejects when no billable items are selected", async () => {
    const plan = makePlan();
    const patient = makePatient();

    await expect(
      generateInvoiceFromPlan(plan, patient, {
        itemIds: [OID().toString()],
        userId: "u1",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(withTransaction).not.toHaveBeenCalled();
    expect(Invoice.create).not.toHaveBeenCalled();
  });
});
