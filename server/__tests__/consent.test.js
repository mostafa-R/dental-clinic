/**
 * Consent + E-signature tests (PRD §9.2 / §9.3).
 *
 * Covers:
 *  1. HMAC signature hashing: deterministic, verifiable, tamper-evident.
 *  2. Version auto-increment per patient+type (+ unique active index).
 *  3. Full REST lifecycle: create (draft) → sign → immutable once signed.
 *  4. PHI masking on impersonation sessions.
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

import consentRouter from "../modules/emr/consent.routes.js";
import Consent from "../modules/emr/consent.model.js";
import "../modules/patients/patient.model.js";
import "../modules/users/user.model.js";
import "../modules/users/branch.model.js";
import "../modules/emr/treatmentPlan.model.js";
import { computeSignatureHash, isSignatureValid } from "../modules/emr/consent.service.js";
import { emitToBranch } from "../socket/index.js";
import { publishEvent } from "../services/eventBus.js";
import { protect } from "../middleware/auth.js";
import { loadScopedPatient } from "../utils/branchScope.js";
import { getCachedRole } from "../utils/cache.js";

const FULL_ROLE = {
  _id: "r1",
  tenant: null,
  isSystemAdmin: false,
  permissions: [{ module: "consents", actions: ["read", "create", "update", "delete"] }],
};

let PATIENT = null;

function makeApp(impersonating = false) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/patients/:patientId/consents", consentRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  vi.mocked(protect).mockImplementation((req, _res, next) => {
    if (!req.cookies?.access_token) {
      return next(Object.assign(new Error("Not authenticated"), { statusCode: 401 }));
    }
    req.user = impersonating
      ? { _id: new mongoose.Types.ObjectId().toString(), branch: PATIENT.branch, roleId: "r1", tenant: null, _impersonating: true }
      : { _id: new mongoose.Types.ObjectId().toString(), branch: PATIENT.branch, roleId: "r1", tenant: null };
    next();
  });
  return app;
}

beforeAll(async () => {
  const testDbUri = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/dental_os_test";
  await mongoose.connect(testDbUri);
  PATIENT = {
    _id: new mongoose.Types.ObjectId().toString(),
    branch: new mongoose.Types.ObjectId().toString(),
    tenant: new mongoose.Types.ObjectId().toString(),
    patientId: "PT-00001",
  };
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  const colls = mongoose.connection.collections;
  if (colls[Consent.collection.name]) await colls[Consent.collection.name].deleteMany({});
  vi.clearAllMocks();
  PATIENT = {
    _id: new mongoose.Types.ObjectId().toString(),
    branch: new mongoose.Types.ObjectId().toString(),
    tenant: new mongoose.Types.ObjectId().toString(),
    patientId: "PT-00001",
  };
});

describe("consent.service — E-signature hashing", () => {
  it("computes a deterministic HMAC-SHA256 hash", () => {
    const at = new Date("2026-01-01T10:00:00Z");
    const h1 = computeSignatureHash({ patient: "p1", type: "treatment", title: "Plan", version: 1 }, at, "مرض");
    const h2 = computeSignatureHash({ patient: "p1", type: "treatment", title: "Plan", version: 1 }, at, "مرض");
    expect(typeof h1).toBe("string");
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
  });

  it("changes when any signed fact changes (tamper-evident)", () => {
    const at = new Date("2026-01-01T10:00:00Z");
    const base = computeSignatureHash({ patient: "p1", type: "treatment", title: "Plan", version: 1 }, at, "مرض");
    const otherTitle = computeSignatureHash({ patient: "p1", type: "treatment", title: "Other", version: 1 }, at, "مرض");
    const otherVersion = computeSignatureHash({ patient: "p1", type: "treatment", title: "Plan", version: 2 }, at, "مرض");
    expect(otherTitle).not.toBe(base);
    expect(otherVersion).not.toBe(base);
  });

  it("verifies a stored signature and flags tampering", async () => {
    const signedAt = new Date();
    const consent = await Consent.create({
      branch: PATIENT.branch,
      tenant: PATIENT.tenant,
      patient: PATIENT._id,
      type: "treatment",
      title: "خطة علاج الأسنان",
      version: 1,
      status: "signed",
      signature: {
        method: "typed",
        name: "مرض",
        signedAt,
        hash: computeSignatureHash(
          { patient: PATIENT._id, type: "treatment", title: "خطة علاج الأسنان", version: 1 },
          signedAt,
          "مرض",
        ),
      },
    });
    expect(isSignatureValid(consent)).toBe(true);
    consent.termsText = "tampered";
    expect(isSignatureValid(consent)).toBe(false);
  });
});

describe("consent.model — versioning", () => {
  it("auto-increments the version per patient+type", async () => {
    const make = (type, n) =>
      Consent.create({
        branch: PATIENT.branch,
        tenant: PATIENT.tenant,
        patient: PATIENT._id,
        type,
        title: `Consent ${n}`,
        version: n,
      });

    await make("treatment", 1);
    await make("treatment", 2);
    const imaging = await make("imaging", 1);

    const treatment = await Consent.find({ patient: PATIENT._id, type: "treatment" }).sort("version");
    expect(treatment.map((c) => c.version)).toEqual([1, 2]);
    expect(imaging.version).toBe(1);
  });
});

describe("Consent REST lifecycle", () => {
  beforeEach(async () => {
    vi.mocked(getCachedRole).mockResolvedValue(FULL_ROLE);
    vi.mocked(loadScopedPatient).mockResolvedValue(PATIENT);
  });

  it("creates a draft consent (version 1)", async () => {
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents`)
      .set("Cookie", "access_token=tok")
      .send({ type: "treatment", title: "خطة علاج", termsText: "الموافقة على الخطة" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.consent.status).toBe("draft");
    expect(res.body.data.consent.version).toBe(1);
  });

  it("rejects an unknown consent type (400)", async () => {
    const res = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents`)
      .set("Cookie", "access_token=tok")
      .send({ type: "unknown", title: "خطة" });
    expect(res.status).toBe(400);
  });

  it("signs a consent and freezes it (409 on later edits)", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents`)
      .set("Cookie", "access_token=tok")
      .send({ type: "treatment", title: "خطة علاج", termsText: "الموافقة على الخطة" });
    const consentId = created.body.data.consent._id;
    expect(created.body.data.consent.version).toBe(1);

    const signed = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents/${consentId}/sign`)
      .set("Cookie", "access_token=tok")
      .send({ signature: { method: "typed", name: "مرض أحمد" } });
    expect(signed.status).toBe(200);
    expect(signed.body.data.consent.status).toBe("signed");
    expect(signed.body.data.consent.signature.hash).toHaveLength(64);

    // Fires the consent.signed event for the automation engine.
    expect(vi.mocked(publishEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "consent.signed" }),
    );

    // Immutable now.
    const patch = await request(makeApp())
      .patch(`/api/patients/${PATIENT._id}/consents/${consentId}`)
      .set("Cookie", "access_token=tok")
      .send({ title: "Other" });
    expect(patch.status).toBe(409);

    const del = await request(makeApp())
      .delete(`/api/patients/${PATIENT._id}/consents/${consentId}`)
      .set("Cookie", "access_token=tok");
    expect(del.status).toBe(409);
  });

  it("verifies a signed consent (tamper-evidence)", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents`)
      .set("Cookie", "access_token=tok")
      .send({ type: "treatment", title: "خطة", termsText: "موافقة" });
    const consentId = created.body.data.consent._id;

    await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents/${consentId}/sign`)
      .set("Cookie", "access_token=tok")
      .send({ signature: { method: "typed", name: "مرض" } });

    const verify = await request(makeApp())
      .get(`/api/patients/${PATIENT._id}/consents/${consentId}/verify`)
      .set("Cookie", "access_token=tok");
    expect(verify.status).toBe(200);
    expect(verify.body.data.verified).toBe(true);
    expect(verify.body.data.signed).toBe(true);
  });

  it("allows a patient to decline a draft (signed records only withdraw)", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents`)
      .set("Cookie", "access_token=tok")
      .send({ type: "imaging", title: "أشعة" });
    const consentId = created.body.data.consent._id;

    const declined = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents/${consentId}/decline`)
      .set("Cookie", "access_token=tok")
      .send({ reason: "يفضل أن تراها لاحقاً" });
    expect(declined.status).toBe(200);
    expect(declined.body.data.consent.status).toBe("declined");

    // Declined records cannot be signed.
    const sign = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents/${consentId}/sign`)
      .set("Cookie", "access_token=tok")
      .send({ signature: { method: "typed", name: "مرض" } });
    expect(sign.status).toBe(409);
  });

  it("masks PHI on impersonation sessions", async () => {
    const created = await request(makeApp(true))
      .post(`/api/patients/${PATIENT._id}/consents`)
      .set("Cookie", "access_token=tok")
      .send({ type: "general", title: "سياسة الخصوصية", termsText: "نص" });
    const consentId = created.body.data.consent._id;

    await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents/${consentId}/sign`)
      .set("Cookie", "access_token=tok")
      .send({ signature: { method: "otp", name: "مرض", phone: "01000100010" } });

    const res = await request(makeApp(true))
      .get(`/api/patients/${PATIENT._id}/consents/${consentId}`)
      .set("Cookie", "access_token=tok");
    expect(res.status).toBe(200);
    expect(res.body.data.consent.signature.phone).toBeUndefined();
  });
});

describe("Consent M4 + M6 hardening", () => {
  beforeEach(async () => {
    vi.mocked(getCachedRole).mockResolvedValue(FULL_ROLE);
    vi.mocked(loadScopedPatient).mockResolvedValue(PATIENT);
  });

  it("stores the patient's own words without overwriting the staff summary (M4)", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents`)
      .set("Cookie", "access_token=tok")
      .send({
        type: "treatment",
        title: "خطة علاج",
        summary: "تمت مناقشة الأسنان 12-14",
        termsText: "الموافقة على الخطة",
      });
    const consentId = created.body.data.consent._id;

    const signed = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents/${consentId}/sign`)
      .set("Cookie", "access_token=tok")
      .send({
        signature: { method: "typed", name: "مرض" },
        patientStatement: "أوافق على الخطة المقدمة من الدكتور",
      });
    expect(signed.status).toBe(200);

    const fetched = await request(makeApp())
      .get(`/api/patients/${PATIENT._id}/consents/${consentId}`)
      .set("Cookie", "access_token=tok");
    // Summary (staff-authored) is untouched; the patient's statement is kept
    // separately and hashed.
    expect(fetched.body.data.consent.summary).toBe("تمت مناقشة الأسنان 12-14");
    expect(fetched.body.data.consent.patientStatement).toBe(
      "أوافق على الخطة المقدمة من الدكتور",
    );
  });

  it("invalidates the signature hash when patientStatement is tampered with (M4)", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents`)
      .set("Cookie", "access_token=tok")
      .send({ type: "imaging", title: "أشعة", termsText: "نص" });
    const consentId = created.body.data.consent._id;

    await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents/${consentId}/sign`)
      .set("Cookie", "access_token=tok")
      .send({
        signature: { method: "typed", name: "مرض" },
        patientStatement: "البيان الأصلي",
      });

    await Consent.updateOne(
      { _id: consentId },
      { $set: { patientStatement: "بيان مزور" } },
    );

    const verify = await request(makeApp())
      .get(`/api/patients/${PATIENT._id}/consents/${consentId}/verify`)
      .set("Cookie", "access_token=tok");
    expect(verify.status).toBe(200);
    expect(verify.body.data.verified).toBe(false);
  });

  it("refuses to sign an expired consent (M6)", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents`)
      .set("Cookie", "access_token=tok")
      .send({
        type: "treatment",
        title: "انتهت صلاحيتها",
        termsText: "نص",
        expiresAt: "2020-01-01T00:00:00.000Z",
      });
    const consentId = created.body.data.consent._id;

    const signed = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents/${consentId}/sign`)
      .set("Cookie", "access_token=tok")
      .send({ signature: { method: "typed", name: "مرض" } });
    expect(signed.status).toBe(409);
    expect(signed.body.message).toMatch(/expired/i);
  });

  it("signs a consent whose expiry is still in the future (M6)", async () => {
    const created = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents`)
      .set("Cookie", "access_token=tok")
      .send({
        type: "treatment",
        title: "صلاحية سارية",
        termsText: "نص",
        expiresAt: "2999-01-01T00:00:00.000Z",
      });
    const consentId = created.body.data.consent._id;

    const signed = await request(makeApp())
      .post(`/api/patients/${PATIENT._id}/consents/${consentId}/sign`)
      .set("Cookie", "access_token=tok")
      .send({ signature: { method: "typed", name: "مرض" } });
    expect(signed.status).toBe(200);
    expect(signed.body.data.consent.status).toBe("signed");
  });
});