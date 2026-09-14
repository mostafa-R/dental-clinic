/**
 * S1 — FDI (ISO 3950) unification, backward-compatibility contract.
 *
 * Canonical code is FDI (`fdi`); legacy Universal (`number`/`tooth`) stays
 * accepted on every write path and is normalized server-side, so pre-S1
 * clients keep working byte-for-byte while new integrations send `fdi`.
 *
 * Covers: converters, normalizeItem funnel, chart bulk + single-tooth
 * endpoints (legacy + FDI + invalid inputs), plan persistence, history.
 */

import { beforeEach, afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";

import {
  describeTooth,
  fdiToUniversal,
  isValidFdi,
  normalizeToothRef,
  universalToFdi,
} from "../constants/dental.js";
import { normalizeItem } from "../modules/emr/treatmentPlan.service.js";

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
import TreatmentPlan from "../modules/emr/treatmentPlan.model.js";
import "../modules/patients/patient.model.js";
import "../modules/users/user.model.js";
import "../modules/users/branch.model.js";
import { protect } from "../middleware/auth.js";
import { loadScopedPatient } from "../utils/branchScope.js";
import { getCachedRole } from "../utils/cache.js";

const FULL_ROLE = {
  _id: "r1",
  tenant: null,
  isSystemAdmin: false,
  permissions: [{ module: "emr", actions: ["read", "update", "delete", "create"] }],
};

let PATIENT;

function makeApp() {
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
    req.user = { _id: new mongoose.Types.ObjectId(), branch: PATIENT.branch, roleId: "r1", tenant: null };
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
  for (const name of [DentalChart.collection.name, TreatmentPlan.collection.name]) {
    if (colls[name]) await colls[name].deleteMany({});
  }
  vi.clearAllMocks();
  PATIENT = {
    _id: new mongoose.Types.ObjectId().toString(),
    branch: new mongoose.Types.ObjectId().toString(),
    tenant: new mongoose.Types.ObjectId().toString(),
    patientId: "PT-FDI001",
  };
  vi.mocked(getCachedRole).mockResolvedValue(FULL_ROLE);
  vi.mocked(loadScopedPatient).mockResolvedValue(PATIENT);
});

describe("FDI converters", () => {
  it("round-trips all 32 permanent teeth", () => {
    for (let u = 1; u <= 32; u++) {
      const fdi = universalToFdi(u);
      expect(isValidFdi(fdi)).toBe(true);
      expect(fdiToUniversal(fdi)).toBe(u);
      expect(describeTooth(u).fdi).toBe(fdi);
    }
  });

  it("maps quadrant boundaries correctly", () => {
    expect(universalToFdi(1)).toBe(18);
    expect(universalToFdi(8)).toBe(11);
    expect(universalToFdi(9)).toBe(21);
    expect(universalToFdi(16)).toBe(28);
    expect(universalToFdi(17)).toBe(38);
    expect(universalToFdi(24)).toBe(31);
    expect(universalToFdi(25)).toBe(41);
    expect(universalToFdi(32)).toBe(48);
  });

  it("rejects non-FDI codes", () => {
    for (const bad of [0, 9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 51, 85, 99, 11.5, "abc", null, undefined, ""]) {
      expect(isValidFdi(bad)).toBe(false);
      expect(fdiToUniversal(bad)).toBeNull();
    }
    expect(universalToFdi(0)).toBeNull();
    expect(universalToFdi(33)).toBeNull();
  });

  it("normalizeToothRef prefers FDI on conflict and tolerates legacy shapes", () => {
    expect(normalizeToothRef({ fdi: 28 })).toEqual({ universal: 16, fdi: 28 });
    expect(normalizeToothRef({ number: 16 })).toEqual({ universal: 16, fdi: 28 });
    expect(normalizeToothRef({ tooth: 1 })).toEqual({ universal: 1, fdi: 18 });
    expect(normalizeToothRef(8)).toEqual({ universal: 8, fdi: 11 });
    // FDI wins when both sides disagree.
    expect(normalizeToothRef({ fdi: 11, number: 16 })).toEqual({ universal: 8, fdi: 11 });
    expect(normalizeToothRef({ fdi: 99, number: 16 })).toEqual({ universal: 16, fdi: 28 });
    expect(normalizeToothRef({ fdi: 99 })).toBeNull();
    expect(normalizeToothRef({ number: 99 })).toBeNull();
    expect(normalizeToothRef(null)).toBeNull();
    expect(normalizeToothRef({})).toBeNull();
  });
});

describe("normalizeItem tooth-code funnel", () => {
  const base = { procedureName: "Filling" };

  it("derives Universal tooth from an FDI-only item", () => {
    expect(normalizeItem({ ...base, fdi: 28 })).toMatchObject({ tooth: 16, fdi: 28 });
  });

  it("derives FDI from a legacy Universal-only item (backward compat)", () => {
    expect(normalizeItem({ ...base, tooth: 16 })).toMatchObject({ tooth: 16, fdi: 28 });
  });

  it("lets FDI win when both disagree", () => {
    expect(normalizeItem({ ...base, tooth: 1, fdi: 48 })).toMatchObject({ tooth: 32, fdi: 48 });
  });

  it("nulls both codes for whole-mouth items", () => {
    expect(normalizeItem({ ...base })).toMatchObject({ tooth: null, fdi: null });
    expect(normalizeItem({ ...base, tooth: null, fdi: null })).toMatchObject({ tooth: null, fdi: null });
  });

  it("nulls both codes for out-of-range input (same as pre-S1)", () => {
    expect(normalizeItem({ ...base, tooth: 99 })).toMatchObject({ tooth: null, fdi: null });
    expect(normalizeItem({ ...base, fdi: 99 })).toMatchObject({ tooth: null, fdi: null });
  });
});

describe("chart endpoints: dual-code contract", () => {
  it("fresh charts carry FDI on every tooth", async () => {
    const res = await request(makeApp()).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    expect(res.status).toBe(200);
    const teeth = res.body.data.chart.teeth;
    expect(teeth).toHaveLength(32);
    const byNumber = new Map(teeth.map((t) => [t.number, t]));
    expect(byNumber.get(1).fdi).toBe(18);
    expect(byNumber.get(16).fdi).toBe(28);
    expect(byNumber.get(32).fdi).toBe(48);
  });

  it("bulk PATCH accepts canonical FDI and preserves the legacy number", async () => {
    const app = makeApp();
    await request(app).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    const res = await request(app)
      .patch(`/api/patients/${PATIENT._id}/dental-chart`)
      .set(AUTH)
      .send({ teeth: [{ fdi: 28, state: "caries" }] });
    expect(res.status).toBe(200);
    const tooth = res.body.data.chart.teeth.find((t) => t.number === 16);
    expect(tooth.state).toBe("caries");
    expect(tooth.fdi).toBe(28);
  });

  it("bulk PATCH keeps accepting legacy Universal numbers (backward compat)", async () => {
    const app = makeApp();
    await request(app).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    const res = await request(app)
      .patch(`/api/patients/${PATIENT._id}/dental-chart`)
      .set(AUTH)
      .send({ teeth: [{ number: 16, state: "filled" }] });
    expect(res.status).toBe(200);
    const tooth = res.body.data.chart.teeth.find((t) => t.number === 16);
    expect(tooth.state).toBe("filled");
    expect(tooth.fdi).toBe(28);
  });

  it("bulk PATCH rejects invalid FDI, primary codes, and codeless entries", async () => {
    const app = makeApp();
    await request(app).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    for (const teeth of [[{ fdi: 99, state: "caries" }], [{ fdi: 51, state: "caries" }], [{ state: "caries" }]]) {
      const res = await request(app)
        .patch(`/api/patients/${PATIENT._id}/dental-chart`)
        .set(AUTH)
        .send({ teeth });
      expect(res.status).toBe(400);
    }
  });

  it("single-tooth PATCH accepts an FDI path code", async () => {
    const app = makeApp();
    await request(app).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    const res = await request(app)
      .patch(`/api/patients/${PATIENT._id}/dental-chart/teeth/48`)
      .set(AUTH)
      .send({ state: "crown" });
    expect(res.status).toBe(200);
    const tooth = res.body.data.chart.teeth.find((t) => t.number === 32);
    expect(tooth.state).toBe("crown");
    expect(tooth.fdi).toBe(48);
  });

  it("single-tooth PATCH keeps the legacy path code working and rejects garbage", async () => {
    const app = makeApp();
    await request(app).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    const ok = await request(app)
      .patch(`/api/patients/${PATIENT._id}/dental-chart/teeth/16`)
      .set(AUTH)
      .send({ state: "filled" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.chart.teeth.find((t) => t.number === 16).state).toBe("filled");
    for (const bad of ["99", "abc", "0"]) {
      const res = await request(app)
        .patch(`/api/patients/${PATIENT._id}/dental-chart/teeth/${bad}`)
        .set(AUTH)
        .send({ state: "filled" });
      expect(res.status).toBe(400);
    }
  });

  it("history snapshots carry the FDI code", async () => {
    const app = makeApp();
    await request(app).get(`/api/patients/${PATIENT._id}/dental-chart`).set(AUTH);
    const res = await request(app)
      .patch(`/api/patients/${PATIENT._id}/dental-chart`)
      .set(AUTH)
      .send({ teeth: [{ number: 1, state: "caries" }] });
    expect(res.status).toBe(200);
    const entry = res.body.data.chart.history.find((h) => h.number === 1);
    expect(entry).toBeDefined();
    expect(entry.fdi).toBe(18);
    expect(entry.state).toBe("sound");
  });
});

describe("plan persistence: dual tooth codes", () => {
  function planDoc(items) {
    return new TreatmentPlan({
      tenant: new mongoose.Types.ObjectId(PATIENT.tenant),
      branch: new mongoose.Types.ObjectId(PATIENT.branch),
      patient: new mongoose.Types.ObjectId(PATIENT._id),
      title: "Root canal course",
      items: items.map(normalizeItem),
      createdBy: new mongoose.Types.ObjectId(),
    });
  }

  it("stores both codes for FDI-first items", async () => {
    const saved = await planDoc([{ procedureName: "Crown", fdi: 11 }]).save();
    expect(saved.items[0].tooth).toBe(8);
    expect(saved.items[0].fdi).toBe(11);
  });

  it("backfills FDI for legacy Universal items on save", async () => {
    const saved = await planDoc([{ procedureName: "Filling", tooth: 16 }]).save();
    expect(saved.items[0].tooth).toBe(16);
    expect(saved.items[0].fdi).toBe(28);
  });
});
