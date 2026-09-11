import { beforeEach, afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

import dentalChartRouter from "../modules/emr/dentalChart.routes.js";
import DentalChart from "../modules/emr/dentalChart.model.js";
import "../modules/patients/patient.model.js";
import "../modules/users/user.model.js";
import "../modules/users/branch.model.js";
import "../modules/emr/treatmentPlan.model.js";
import { emitToBranch } from "../socket/index.js";
import { protect } from "../middleware/auth.js";
import { loadScopedPatient } from "../utils/branchScope.js";
import { getCachedRole } from "../utils/cache.js";

const FULL_ROLE = {
  _id: "r1",
  tenant: null,
  isSystemAdmin: false,
  permissions: [{ module: "emr", actions: ["read", "update", "delete"] }],
};

let PATIENT;

function makeApp(impersonating = false) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/patients/:patientId/dental-chart", dentalChartRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message })
  );
  vi.mocked(protect).mockImplementation((req, _res, next) => {
    if (!req.cookies?.access_token) {
      return next(Object.assign(new Error("Not authenticated"), { statusCode: 401 }));
    }
    req.user = impersonating
      ? { _id: new mongoose.Types.ObjectId(), branch: PATIENT.branch, roleId: "r1", tenant: null, _impersonating: true }
      : { _id: new mongoose.Types.ObjectId(), branch: PATIENT.branch, roleId: "r1", tenant: null };
    next();
  });
  return app;
}

const AUTH = { Cookie: "access_token=tok" };

beforeAll(async () => {
  await mongoose.connect(process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/dental_os_test");
});

afterAll(async () => { await mongoose.disconnect(); });

beforeEach(async () => {
  const colls = mongoose.connection.collections;
  if (colls[DentalChart.collection.name]) await colls[DentalChart.collection.name].deleteMany({});
  vi.clearAllMocks();
  PATIENT = {
    _id: new mongoose.Types.ObjectId().toString(),
    branch: new mongoose.Types.ObjectId().toString(),
    tenant: new mongoose.Types.ObjectId().toString(),
    patientId: "PT-DC001",
  };
  vi.mocked(getCachedRole).mockResolvedValue(FULL_ROLE);
  vi.mocked(loadScopedPatient).mockResolvedValue(PATIENT);
});

describe("GET dental-chart", () => {
  it("creates a fresh 32-tooth sound chart on first access", async () => {
    const res = await request(makeApp()).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    expect(res.status).toBe(200);
    const chart = res.body.data.chart;
    expect(chart.teeth).toHaveLength(32);
    expect(chart.teeth.every((t) => t.state === "sound")).toBe(true);
    expect(chart.dentitionType).toBe("permanent");
    expect(chart.toothCount).toBe(32);
    expect(chart.missingCount).toBe(0);
  });

  it("returns the same chart on subsequent GETs (upsert idempotent)", async () => {
    const r1 = await request(makeApp()).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    const r2 = await request(makeApp()).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    expect(r1.body.data.chart._id).toBe(r2.body.data.chart._id);
    expect(r2.body.data.chart.teeth).toHaveLength(32);
  });

  it("masks PHI (notes) on impersonation", async () => {
    await request(makeApp()).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    const app = makeApp(true);
    const res = await request(app).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.chart.notes).toBeUndefined();
    expect(res.body.data.chart.teeth[0].notes).toBeUndefined();
  });
});

describe("PATCH dental-chart (bulk update)", () => {
  beforeEach(async () => {
    await request(makeApp()).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
  });

  it("updates dentitionType and notes", async () => {
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/dental-chart`)
      .set(AUTH)
      .send({ dentitionType: "mixed", notes: "Primary teeth present" });
    expect(res.status).toBe(200);
    expect(res.body.data.chart.dentitionType).toBe("mixed");
    expect(res.body.data.chart.notes).toBe("Primary teeth present");
  });

  it("merges tooth state and surfaces, archiving history", async () => {
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/dental-chart`)
      .set(AUTH)
      .send({ teeth: [{ number: 3, state: "caries", surfaces: { occlusal: "caries" } }] });
    expect(res.status).toBe(200);
    const t3 = res.body.data.chart.teeth.find((t) => t.number === 3);
    expect(t3.state).toBe("caries");
    expect(t3.surfaces.occlusal).toBe("caries");
    expect(res.body.data.chart.history.length).toBe(1);
    expect(res.body.data.chart.history[0].number).toBe(3);
    expect(res.body.data.chart.history[0].state).toBe("sound");
  });

  it("does not archive history for a no-op patch", async () => {
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/dental-chart`)
      .set(AUTH)
      .send({ teeth: [{ number: 1, state: "sound" }] });
    expect(res.status).toBe(200);
    expect(res.body.data.chart.history.length).toBe(0);
  });

  it("skips teeth with invalid numbers in the array (validation)", async () => {
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/dental-chart`)
      .set(AUTH)
      .send({ teeth: [{ number: 99, state: "caries" }] });
    expect(res.status).toBe(400);
  });

  it("returns 404 when chart does not exist", async () => {
    const otherPatient = { ...PATIENT, _id: new mongoose.Types.ObjectId().toString() };
    vi.mocked(loadScopedPatient).mockResolvedValue(otherPatient);
    const res = await request(makeApp())
      .patch(`/api/patients/${otherPatient._id}/dental-chart`)
      .set(AUTH)
      .send({ notes: "no chart" });
    expect(res.status).toBe(404);
  });

  it("rejects empty body (no fields)", async () => {
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/dental-chart`)
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
  });

  it("emits chart:updated", async () => {
    vi.clearAllMocks();
    await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/dental-chart`)
      .set(AUTH)
      .send({ teeth: [{ number: 5, state: "filled" }] });
    expect(emitToBranch).toHaveBeenCalledWith(
      PATIENT.branch,
      "chart:updated",
      expect.objectContaining({ chart: expect.objectContaining({ _id: expect.anything() }) })
    );
  });
});

describe("PATCH dental-chart/teeth/:number", () => {
  beforeEach(async () => {
    await request(makeApp()).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
  });

  it("updates a single tooth state, surfaces, and notes", async () => {
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/dental-chart/teeth/14`)
      .set(AUTH)
      .send({ state: "root_canal", notes: "Retreated" });
    expect(res.status).toBe(200);
    const t14 = res.body.data.chart.teeth.find((t) => t.number === 14);
    expect(t14.state).toBe("root_canal");
    expect(t14.notes).toBe("Retreated");
    expect(res.body.data.chart.history).toHaveLength(1);
    expect(res.body.data.chart.history[0].state).toBe("sound");
  });

  it("returns 400 for invalid tooth number", async () => {
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/dental-chart/teeth/0`)
      .set(AUTH)
      .send({ state: "caries" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when chart does not exist", async () => {
    const otherPatient = { ...PATIENT, _id: new mongoose.Types.ObjectId().toString() };
    vi.mocked(loadScopedPatient).mockResolvedValue(otherPatient);
    const res = await request(makeApp())
      .patch(`/api/patients/${otherPatient._id}/dental-chart/teeth/1`)
      .set(AUTH)
      .send({ state: "caries" });
    expect(res.status).toBe(404);
  });

  it("no-op edit returns 200 without history or emit", async () => {
    vi.clearAllMocks();
    const res = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/dental-chart/teeth/1`)
      .set(AUTH)
      .send({ state: "sound" });
    expect(res.status).toBe(200);
    expect(res.body.data.chart.history.length).toBe(0);
    expect(emitToBranch).not.toHaveBeenCalled();
  });

  it("emits chart:updated on real change", async () => {
    vi.clearAllMocks();
    await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/dental-chart/teeth/20`)
      .set(AUTH)
      .send({ state: "implant" });
    expect(emitToBranch).toHaveBeenCalledWith(
      PATIENT.branch,
      "chart:updated",
      expect.objectContaining({ chart: expect.anything() })
    );
  });
});
