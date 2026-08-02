import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/patients/patient.model.js", () => ({
  default: {
    create: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock("../modules/site/tenant/tenant.model.js", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("../core/counters.js", () => ({
  default: { findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}));

vi.mock("../utils/branchScope.js", () => ({
  currentTenant: (req) => req.user.tenant ?? null,
  resolveBranchForCreate: async (_req, bodyBranch) => bodyBranch || "b1",
  filterByBranch: vi.fn(),
  toObjectId: (v) => v,
}));

vi.mock("../utils/sendSuccess.js", () => ({ sendSuccess: vi.fn() }));

vi.mock("../middleware/phiRestrict.js", () => ({ stripPHI: (d) => d }));

vi.mock("../socket/index.js", () => ({ emitToBranch: vi.fn() }));

import { createPatient } from "../modules/patients/patient.controller.js";
import Patient from "../modules/patients/patient.model.js";
import Tenant from "../modules/site/tenant/tenant.model.js";
import Counter from "../core/counters.js";
import { sendSuccess } from "../utils/sendSuccess.js";
import { emitToBranch } from "../socket/index.js";

function makeRes() {
  return { status: vi.fn(function () { return this; }), json: vi.fn(function () { return this; }) };
}

function makeReq(tenant, body = {}) {
  return {
    user: { _id: "u1", branch: "b1", tenant },
    validatedBody: { firstName: "Test", lastName: "Patient", ...body },
    query: {},
    _roleResolved: { isSystemAdmin: false },
  };
}

async function runCreatePatient(req, res) {
  const next = vi.fn();
  createPatient(req, res, next);
  await new Promise((r) => setTimeout(r, 0));
  return { next };
}

function makePatientDoc() {
  const doc = { _id: "p1", patientId: "PT-00001", branch: "b1", populate: vi.fn() };
  doc.populate.mockResolvedValue(doc);
  return doc;
}

describe("createPatient — atomic maxPatients enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims a slot and rejects with 409 when the plan cap is exceeded", async () => {
    vi.mocked(Tenant.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({ settings: { maxPatients: 500 } }),
    });
    vi.mocked(Counter.findOneAndUpdate).mockResolvedValue({ seq: 501 });

    const res = makeRes();
    const { next } = await runCreatePatient(makeReq("t1"), res);

    expect(Counter.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "patient_slots:t1" },
      { $inc: { seq: 1 } },
      expect.objectContaining({ upsert: true, returnDocument: "after" }),
    );
    expect(Counter.updateOne).toHaveBeenCalledWith(
      { _id: "patient_slots:t1", seq: { $gt: 0 } },
      { $inc: { seq: -1 } },
    );
    expect(Patient.create).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 409 });
    expect(next.mock.calls[0][0].message).toContain("maximum of 500 patients");
  });

  it("releases the claimed slot when the create fails", async () => {
    vi.mocked(Tenant.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({ settings: { maxPatients: 500 } }),
    });
    vi.mocked(Counter.findOneAndUpdate).mockResolvedValue({ seq: 3 });
    vi.mocked(Patient.create).mockRejectedValue(new Error("db down"));

    const res = makeRes();
    const { next } = await runCreatePatient(makeReq("t1"), res);

    expect(Counter.updateOne).toHaveBeenCalledWith(
      { _id: "patient_slots:t1", seq: { $gt: 0 } },
      { $inc: { seq: -1 } },
    );
    expect(next.mock.calls[0][0]).toMatchObject({ message: "db down" });
  });

  it("persists the patient and keeps the slot when within the cap", async () => {
    vi.mocked(Tenant.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({ settings: { maxPatients: 500 } }),
    });
    vi.mocked(Counter.findOneAndUpdate).mockResolvedValue({ seq: 4 });
    const doc = makePatientDoc();
    vi.mocked(Patient.create).mockResolvedValue(doc);

    const res = makeRes();
    const { next } = await runCreatePatient(makeReq("t1"), res);

    expect(Counter.updateOne).not.toHaveBeenCalled();
    expect(Patient.create).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "b1", tenant: "t1" }),
    );
    expect(emitToBranch).toHaveBeenCalledWith("b1", "patient:created", { patient: doc });
    expect(sendSuccess).toHaveBeenCalledWith(res, { patient: doc }, 201);
    expect(next.mock.calls.length).toBe(0);
  });

  it("skips the slot claim entirely for non-tenant creators", async () => {
    const doc = makePatientDoc();
    vi.mocked(Patient.create).mockResolvedValue(doc);

    const res = makeRes();
    const { next } = await runCreatePatient(makeReq(null), res);

    expect(Tenant.findById).not.toHaveBeenCalled();
    expect(Counter.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Patient.create).toHaveBeenCalled();
    expect(next.mock.calls.length).toBe(0);
  });
});
