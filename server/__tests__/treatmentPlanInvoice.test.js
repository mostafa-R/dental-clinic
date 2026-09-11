import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/emr/dentalChart.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../modules/emr/treatmentPlan.model.js", () => ({
  default: { findById: vi.fn() },
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

vi.mock("../services/inventoryCron.js", () => ({
  emitItemAlerts: vi.fn(() => {}),
}));

vi.mock("../modules/inventory/inventory.service.js", () => ({
  deductForProcedure: vi.fn(async () => ({ deductions: [], updatedItems: [], shortfall: 0 })),
}));

import mongoose from "mongoose";
import { generateInvoiceFromPlan } from "../modules/emr/treatmentPlan.service.js";
import DentalChart from "../modules/emr/dentalChart.model.js";
import TreatmentPlan from "../modules/emr/treatmentPlan.model.js";
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

// H2: `generateInvoiceFromPlan` re-reads the plan from the DB inside the
// transaction. Mock findById so `.session(session)` yields the given document.
function mockPlanRefresh(plan) {
  vi.mocked(TreatmentPlan.findById).mockReturnValue({
    session: vi.fn(async () => plan),
  });
  return plan;
}

function makePatient() {
  return { _id: OID(), tenant: OID(), branch: OID() };
}

describe("generateInvoiceFromPlan — transactional invoice + item linking (ISSUE-021)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the invoice and links items inside a single transaction", async () => {
    const plan = mockPlanRefresh(makePlan());
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
    // H2: the plan is re-read under the transaction session (snapshot isolation).
    expect(TreatmentPlan.findById).toHaveBeenCalledWith(plan._id);
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
    // Inventory deduction joins the same session, keyed on the procedure name
    // and carrying the invoice id for later reversal.
    expect(deductForProcedure).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: patient.branch,
        tenantId: patient.tenant,
        procedureName: "Filling",
        userId: "u1",
        invoiceId: invoice._id,
        session: expect.objectContaining({ mock: true }),
      }),
    );
    expect(result.invoice).toBe(invoice);
  });

  it("rejects items that are already invoiced instead of orphaning the previous invoice", async () => {
    const plan = mockPlanRefresh(makePlan());
    const patient = makePatient();
    const [cleanItem, , oldItem] = plan.items;

    await expect(
      generateInvoiceFromPlan(plan, patient, {
        itemIds: [cleanItem._id.toString(), oldItem._id.toString()],
        userId: "u1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    // The guard runs against the transactional snapshot, so the attempt still
    // enters the transaction and must abort before touching billing.
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(Invoice.create).not.toHaveBeenCalled();
    expect(plan.save).not.toHaveBeenCalled();
    // The not-yet-invoiced item is left untouched.
    expect(cleanItem.invoice).toBeNull();
  });

  it("catches an invoice committed concurrently after the caller loaded its snapshot", async () => {
    // The caller holds a stale plan where the item looks billable...
    const stalePlan = makePlan();
    const patient = makePatient();
    const [cleanItem] = stalePlan.items;

    // ...but by the time the transaction runs, the DB snapshot already
    // contains an invoice link (committed by another request). Same item ids
    // as the caller's snapshot — only the invoice link differs.
    const freshPlan = {
      ...stalePlan,
      items: stalePlan.items.map((item, i) =>
        i === 0 ? { ...item, invoice: OID() } : item,
      ),
      save: vi.fn().mockResolvedValue(undefined),
    };

    const refreshed = mockPlanRefresh(freshPlan);

    await expect(
      generateInvoiceFromPlan(stalePlan, patient, {
        itemIds: [cleanItem._id.toString()],
        userId: "u1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(Invoice.create).not.toHaveBeenCalled();
    expect(stalePlan.save).not.toHaveBeenCalled();
    expect(refreshed.items[0].invoice).toBe(freshPlan.items[0].invoice);
  });

  it("defaults to pending un-invoiced items when itemIds is omitted", async () => {
    const plan = mockPlanRefresh(makePlan());
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
