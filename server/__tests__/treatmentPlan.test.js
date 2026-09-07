/**
 * Treatment plan route tests for the EMR hardening pass:
 *  - M5: an invoiced item's status is frozen (409 on status/completedDate edits)
 *  - M2: create validates the doctor actually IS a doctor (400 otherwise)
 *  - L2: a plan always starts `active` — client-supplied status is refused
 *  - M3: item appointment refs must belong to this patient (400 otherwise)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";

vi.mock("../middleware/auth.js", () => ({ protect: vi.fn() }));
vi.mock("../utils/branchScope.js", () => ({ loadScopedPatient: vi.fn() }));
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
vi.mock("../socket/index.js", () => ({ emitToBranch: vi.fn() }));
vi.mock("../services/eventBus.js", () => ({ publishEvent: vi.fn() }));

import treatmentPlanRouter from "../modules/emr/treatmentPlan.routes.js";
import User from "../modules/users/user.model.js";
import Patient from "../modules/patients/patient.model.js";
import TreatmentPlan from "../modules/emr/treatmentPlan.model.js";
import "../modules/users/role.model.js";
import "../modules/users/branch.model.js";
import "../modules/appointments/appointment.model.js";
import "../modules/emr/clinicalNote.model.js";
import { protect } from "../middleware/auth.js";
import { loadScopedPatient } from "../utils/branchScope.js";
import { getCachedRole } from "../utils/cache.js";

const FULL_ROLE = {
  _id: "r1",
  tenant: null,
  isSystemAdmin: false,
  permissions: [
    { module: "emr", actions: ["create", "read", "update", "delete"] },
    { module: "billing", actions: ["create", "read"] },
  ],
};

let PATIENT = null;
let DOCTOR = null;
let STAFF = null;
let CURRENT_USER = null;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/patients/:patientId/treatment-plans", treatmentPlanRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  vi.mocked(protect).mockImplementation((req, _res, next) => {
    if (!req.cookies?.access_token) {
      return next(Object.assign(new Error("Not authenticated"), { statusCode: 401 }));
    }
    req.user = CURRENT_USER;
    next();
  });
  return app;
}

beforeAll(async () => {
  const testDbUri = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/dental_os_test";
  await mongoose.connect(testDbUri);
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  const colls = mongoose.connection.collections;
  for (const name of [
    "patients",
    "users",
    "treatmentplans",
    "appointments",
    "clinicalnotes",
    "consents",
  ]) {
    if (colls[name]) await colls[name].deleteMany({});
  }
  vi.clearAllMocks();

  const branch = new mongoose.Types.ObjectId();
  PATIENT = {
    _id: new mongoose.Types.ObjectId(),
    branch,
    tenant: new mongoose.Types.ObjectId(),
    patientId: "PT-TEST-01",
  };
  DOCTOR = await User.create({
    name: "Dr Test",
    email: `dr-${Date.now()}@test.com`,
    password: "Password123!",
    roleId: new mongoose.Types.ObjectId(),
    branch,
    isDoctor: true,
  });
  STAFF = await User.create({
    name: "Receptionist",
    email: `rec-${Date.now()}@test.com`,
    password: "Password123!",
    roleId: new mongoose.Types.ObjectId(),
    branch,
    isDoctor: false,
  });
  CURRENT_USER = {
    _id: STAFF._id,
    branch: branch.toString(),
    roleId: "r1",
    tenant: null,
  };

  vi.mocked(getCachedRole).mockResolvedValue(FULL_ROLE);
  vi.mocked(loadScopedPatient).mockResolvedValue(PATIENT);
});

async function createPlanWithItem(overrides = {}) {
  return TreatmentPlan.create({
    tenant: PATIENT.tenant,
    branch: PATIENT.branch,
    patient: PATIENT._id,
    title: "Test plan",
    status: "active",
    items: [
      {
        procedureName: "Cleaning",
        tooth: null,
        status: "pending",
        estimatedCost: 100,
        ...overrides,
      },
    ],
    createdBy: STAFF._id,
    updatedBy: STAFF._id,
  });
}

describe("M5 — invoiced treatment items are frozen", () => {
  it("rejects status changes on an item that has been invoiced", async () => {
    const invoiceId = new mongoose.Types.ObjectId();
    const plan = await createPlanWithItem({ invoice: invoiceId });

    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/treatment-plans/${plan._id}/items/${plan.items[0]._id}`)
      .set("Cookie", "access_token=tok")
      .send({ status: "cancelled" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/invoiced/i);
  });

  it("rejects completedDate changes on an invoiced item", async () => {
    const invoiceId = new mongoose.Types.ObjectId();
    const plan = await createPlanWithItem({ invoice: invoiceId });

    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/treatment-plans/${plan._id}/items/${plan.items[0]._id}`)
      .set("Cookie", "access_token=tok")
      .send({ status: "completed", completedDate: "2026-09-07T10:00:00.000Z" });

    expect(res.status).toBe(409);
  });

  it("still allows editing a non-invoiced item", async () => {
    const plan = await createPlanWithItem();

    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/treatment-plans/${plan._id}/items/${plan.items[0]._id}`)
      .set("Cookie", "access_token=tok")
      .send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body.data.plan.items[0].status).toBe("completed");
  });
});

describe("M2 + L2 — plan creation doctor + status rules", () => {
  it("creates a plan while ignoring a client-supplied status (always active)", async () => {
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/treatment-plans`)
      .set("Cookie", "access_token=tok")
      .send({
        title: "New plan",
        doctor: DOCTOR._id.toString(),
        status: "completed",
        items: [{ procedureName: "Filling", estimatedCost: 200 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.plan.status).toBe("active");
  });

  it("rejects creating a plan with a non-doctor as the doctor", async () => {
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/treatment-plans`)
      .set("Cookie", "access_token=tok")
      .send({
        title: "New plan",
        doctor: STAFF._id.toString(),
        items: [{ procedureName: "Filling" }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/doctor/i);
  });

  it("rejects creating a plan without a doctor", async () => {
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/treatment-plans`)
      .set("Cookie", "access_token=tok")
      .send({
        title: "New plan",
        items: [{ procedureName: "Filling" }],
      });

    expect(res.status).toBe(400);
  });
});

describe("M3 — item appointment refs are patient-scoped", () => {
  it("rejects an item pointing at an appointment that is not this patient's", async () => {
    // A random ObjectId matches no appointment belonging to PATIENT — the
    // scoped lookup comes back empty and the create is refused.
    const foreignAppt = new mongoose.Types.ObjectId();

    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/treatment-plans`)
      .set("Cookie", "access_token=tok")
      .send({
        title: "New plan",
        doctor: DOCTOR._id.toString(),
        items: [{ procedureName: "Filling", appointment: foreignAppt.toString() }],
      });

    expect(res.status).toBe(400);
  });
});