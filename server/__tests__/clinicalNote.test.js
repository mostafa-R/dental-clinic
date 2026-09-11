import { beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";

vi.mock("../middleware/auth.js", () => ({ protect: vi.fn() }));
vi.mock("../utils/branchScope.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadScopedPatient: vi.fn() };
});
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

import clinicalNoteRouter from "../modules/emr/clinicalNote.routes.js";
import ClinicalNote from "../modules/emr/clinicalNote.model.js";
import User from "../modules/users/user.model.js";
import Appointment from "../modules/appointments/appointment.model.js";
import "../modules/users/branch.model.js";
import "../modules/patients/patient.model.js";
import "../modules/users/role.model.js";
import { emitToBranch } from "../socket/index.js";
import { protect } from "../middleware/auth.js";
import { loadScopedPatient } from "../utils/branchScope.js";
import { getCachedRole } from "../utils/cache.js";

const FULL_ROLE = {
  _id: "r1",
  tenant: null,
  isSystemAdmin: false,
  permissions: [{ module: "emr", actions: ["create", "read", "update", "delete"] }],
};

let PATIENT;
let CURRENT_USER;

function makeApp(impersonating = false) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/patients/:patientId/clinical-notes", clinicalNoteRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message })
  );
  vi.mocked(protect).mockImplementation((req, _res, next) => {
    if (!req.cookies?.access_token) {
      return next(Object.assign(new Error("Not authenticated"), { statusCode: 401 }));
    }
    req.user = impersonating ? { ...CURRENT_USER, _impersonating: true } : CURRENT_USER;
    next();
  });
  return app;
}

const AUTH = { Cookie: "access_token=tok" };

function futureIso(hours = 48) {
  const d = new Date(Date.now() + hours * 3600000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}

beforeAll(async () => {
  const db = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/dental_os_test";
  await mongoose.connect(db);
  await Appointment.init();
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  const colls = mongoose.connection.collections;
  for (const name of ["users", "clinicalnotes", "appointments", "counters"]) {
    if (colls[name]) await colls[name].deleteMany({});
  }
  vi.clearAllMocks();

  const branch = new mongoose.Types.ObjectId();
  PATIENT = {
    _id: new mongoose.Types.ObjectId().toString(),
    branch: branch.toString(),
    tenant: new mongoose.Types.ObjectId().toString(),
    patientId: "PT-CN001",
  };
  const staff = await User.create({
    name: "Dr Note",
    email: `dr-note-${Date.now()}@test.com`,
    password: "Password123!",
    roleId: new mongoose.Types.ObjectId(),
    branch,
    isDoctor: true,
  });
  CURRENT_USER = {
    _id: staff._id.toString(),
    branch: branch.toString(),
    roleId: "r1",
    tenant: null,
  };
  vi.mocked(getCachedRole).mockResolvedValue(FULL_ROLE);
  vi.mocked(loadScopedPatient).mockResolvedValue(PATIENT);
});

const SOAP = () => ({
  doctor: CURRENT_USER._id,
  chiefComplaint: "Pain in upper left",
  examination: "Tender on palpation",
  diagnosis: "Caries",
  plan: "Restore tooth 12",
});

describe("createClinicalNote", () => {
  it("creates a note with SOAP fields and noteNo", async () => {
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send(SOAP());
    expect(res.status).toBe(201);
    const note = res.body.data.note;
    expect(note.noteNo).toMatch(/^CN-\d{5}$/);
    expect(note.chiefComplaint).toBe("Pain in upper left");
    expect(note.diagnosis).toBe("Caries");
    expect(note.plan).toBe("Restore tooth 12");
    expect(String(note.doctor._id)).toBe(CURRENT_USER._id);
    expect(emitToBranch).toHaveBeenCalledWith(
      PATIENT.branch,
      "clinical-note:created",
      expect.objectContaining({ note: expect.anything() }),
    );
  });

  it("rejects a non-doctor reference (400)", async () => {
    const staff = await User.create({
      name: "Reception",
      email: `rec-${Date.now()}@test.com`,
      password: "Password123!",
      roleId: new mongoose.Types.ObjectId(),
      branch: new mongoose.Types.ObjectId(PATIENT.branch),
      isDoctor: false,
    });
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send({ ...SOAP(), doctor: staff._id.toString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not a doctor/i);
  });

  it("rejects a doctor from another branch (400)", async () => {
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send({ ...SOAP(), doctor: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not exist/i);
  });

  it("rejects an appointment that belongs to another patient (400)", async () => {
    const other = await Appointment.create({
      patient: new mongoose.Types.ObjectId(),
      doctor: new mongoose.Types.ObjectId(CURRENT_USER._id),
      branch: new mongoose.Types.ObjectId(PATIENT.branch),
      tenant: new mongoose.Types.ObjectId(PATIENT.tenant),
      start: new Date(),
      end: new Date(Date.now() + 30 * 60000),
      status: "scheduled",
    });
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send({ ...SOAP(), appointment: other._id.toString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not belong to this patient/i);
  });

  it("creates a follow-up appointment when nextAppointment is provided", async () => {
    const start = futureIso(48);
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send({ ...SOAP(), nextAppointment: start, nextAppointmentNotes: "Recheck in 4 weeks" });
    expect(res.status).toBe(201);
    const created = await Appointment.findOne({ patient: PATIENT._id });
    expect(created).not.toBeNull();
    expect(created.reason).toBe("Recheck in 4 weeks");
    expect(created.status).toBe("scheduled");
    expect(String(res.body.data.note.nextAppointmentCreated)).toBe(String(created._id));
  });

  it("does not create a follow-up when nextAppointment is in the past", async () => {
    const past = new Date(Date.now() - 3600000).toISOString();
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send({ ...SOAP(), nextAppointment: past });
    expect(res.status).toBe(201);
    expect(res.body.data.note.nextAppointmentCreated).toBeNull();
    expect(await Appointment.countDocuments({ patient: PATIENT._id })).toBe(0);
  });

  it("masks PHI on impersonation", async () => {
    const res = await request(makeApp(true))
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send(SOAP());
    expect(res.status).toBe(201);
    expect(res.body.data.note.chiefComplaint).toBeUndefined();
    expect(res.body.data.note.diagnosis).toBeUndefined();
    expect(res.body.data.note.plan).toBeUndefined();
    expect(res.body.data.note.examination).toBeUndefined();
  });
});

describe("listClinicalNotes", () => {
  it("returns notes with pagination metadata", async () => {
    await request(makeApp()).post(`/api/patients/${PATIENT._id}/clinical-notes`).set(AUTH).send(SOAP());
    await request(makeApp()).post(`/api/patients/${PATIENT._id}/clinical-notes`).set(AUTH).send({ ...SOAP(), diagnosis: "Gingivitis" });
    const res = await request(makeApp()).get(`/api/patients/${PATIENT._id}/clinical-notes`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.notes).toHaveLength(2);
    expect(res.body.data.pagination.total).toBe(2);
    expect(res.body.data.pagination.pages).toBe(1);
  });

  it("excludes soft-deleted notes", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send(SOAP());
    await request(makeApp())
      .delete(`/api/patients/${PATIENT._id}/clinical-notes/${created.body.data.note._id}`)
      .set(AUTH);
    const res = await request(makeApp()).get(`/api/patients/${PATIENT._id}/clinical-notes`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.notes).toHaveLength(0);
  });

  it("masks PHI on impersonation", async () => {
    await request(makeApp()).post(`/api/patients/${PATIENT._id}/clinical-notes`).set(AUTH).send(SOAP());
    const res = await request(makeApp(true)).get(`/api/patients/${PATIENT._id}/clinical-notes`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.notes[0].chiefComplaint).toBeUndefined();
  });
});

describe("getClinicalNote", () => {
  it("returns 400 for invalid id", async () => {
    const res = await request(makeApp()).get(`/api/patients/${PATIENT._id}/clinical-notes/abc`).set(AUTH);
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    const res = await request(makeApp())
      .get(`/api/patients/${PATIENT._id}/clinical-notes/${new mongoose.Types.ObjectId()}`)
      .set(AUTH);
    expect(res.status).toBe(404);
  });

  it("returns the note", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send(SOAP());
    const res = await request(makeApp())
      .get(`/api/patients/${PATIENT._id}/clinical-notes/${created.body.data.note._id}`)
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.note.diagnosis).toBe("Caries");
  });

  it("returns 404 for a soft-deleted note", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send(SOAP());
    await request(makeApp())
      .delete(`/api/patients/${PATIENT._id}/clinical-notes/${created.body.data.note._id}`)
      .set(AUTH);
    const res = await request(makeApp())
      .get(`/api/patients/${PATIENT._id}/clinical-notes/${created.body.data.note._id}`)
      .set(AUTH);
    expect(res.status).toBe(404);
  });
});

describe("updateClinicalNote", () => {
  it("returns 400 for invalid id", async () => {
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/clinical-notes/abc`)
      .set(AUTH)
      .send({ plan: "Reline" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/clinical-notes/${new mongoose.Types.ObjectId()}`)
      .set(AUTH)
      .send({ plan: "Reline" });
    expect(res.status).toBe(404);
  });

  it("updates SOAP fields and emits clinical-note:updated", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send(SOAP());
    vi.clearAllMocks();
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/clinical-notes/${created.body.data.note._id}`)
      .set(AUTH)
      .send({ plan: "Crown preparation", diagnosis: "Fractured cusp" });
    expect(res.status).toBe(200);
    expect(res.body.data.note.plan).toBe("Crown preparation");
    expect(res.body.data.note.diagnosis).toBe("Fractured cusp");
    expect(emitToBranch).toHaveBeenCalledWith(
      PATIENT.branch,
      "clinical-note:updated",
      expect.objectContaining({ note: expect.anything() }),
    );
  });

  it("patches an existing attachment by _id and adds a new one", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send({ ...SOAP(), attachments: [{ type: "xray", url: "/api/attachments/x1.png" }] });
    const attachmentId = created.body.data.note.attachments[0]._id;
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/clinical-notes/${created.body.data.note._id}`)
      .set(AUTH)
      .send({
        attachments: [
          { _id: attachmentId, caption: "Updated caption" },
          { type: "photo", url: "/api/attachments/photo2.png" },
        ],
      });
    expect(res.status).toBe(200);
    const atts = res.body.data.note.attachments;
    expect(atts).toHaveLength(2);
    const patched = atts.find((a) => a._id === attachmentId);
    expect(patched.caption).toBe("Updated caption");
    expect(patched.type).toBe("xray");
  });

  it("rejects an attachment _id not on the note (400)", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send(SOAP());
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/clinical-notes/${created.body.data.note._id}`)
      .set(AUTH)
      .send({ attachments: [{ _id: new mongoose.Types.ObjectId().toString(), caption: "x" }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/attachment not found/i);
  });

  it("creates a follow-up when nextAppointment is added to a note", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send(SOAP());
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/clinical-notes/${created.body.data.note._id}`)
      .set(AUTH)
      .send({ nextAppointment: futureIso(72) });
    expect(res.status).toBe(200);
    expect(res.body.data.note.nextAppointmentCreated).not.toBeNull();
    expect(await Appointment.countDocuments({ patient: PATIENT._id })).toBe(1);
  });
});

describe("deleteClinicalNote", () => {
  it("returns 400 for invalid id", async () => {
    const res = await request(makeApp())
      .delete(`/api/patients/${PATIENT._id}/clinical-notes/abc`)
      .set(AUTH);
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    const res = await request(makeApp())
      .delete(`/api/patients/${PATIENT._id}/clinical-notes/${new mongoose.Types.ObjectId()}`)
      .set(AUTH);
    expect(res.status).toBe(404);
  });

  it("soft-deletes and emits clinical-note:deleted", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/clinical-notes`)
      .set(AUTH)
      .send(SOAP());
    vi.clearAllMocks();
    const res = await request(makeApp())
      .delete(`/api/patients/${PATIENT._id}/clinical-notes/${created.body.data.note._id}`)
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe("Clinical note deleted");
    const doc = await ClinicalNote.findById(created.body.data.note._id);
    expect(doc.isActive).toBe(false);
    expect(emitToBranch).toHaveBeenCalledWith(
      PATIENT.branch,
      "clinical-note:deleted",
      expect.objectContaining({ note: expect.objectContaining({ _id: expect.anything() }) }),
    );
  });
});