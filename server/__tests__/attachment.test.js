import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  create: vi.fn(),
  aggregate: vi.fn(),
  loadScopedPatient: vi.fn(),
  setUploadedFile: vi.fn(),
  access: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  createReadStream: vi.fn(),
  encryptFile: vi.fn(),
  decryptFile: vi.fn(),
  decryptFileWithKeys: vi.fn(),
  isEncrypted: vi.fn(),
  assertFileSignature: vi.fn(),
  tenantFindById: vi.fn(),
}));

vi.mock("../modules/emr/attachment.model.js", () => ({
  default: {
    findOne: (...args) => mocks.findOne(...args),
    create: (...args) => mocks.create(...args),
    aggregate: (...args) => mocks.aggregate(...args),
  },
}));

// getTenantKey() loads the tenant's per-tenant encryption key via
// Tenant.findById(...).select("+encryption.key").lean().
vi.mock("../modules/site/tenant/tenant.model.js", () => ({
  default: {
    findById: (...args) => mocks.tenantFindById(...args),
  },
}));

vi.mock("../middleware/auth.js", () => ({
  protect: (req, _res, next) => {
    req.user = req.user || { _id: "u1", branch: "b1", tenant: "t1" };
    req.tenant = mocks.reqTenant;
    next();
  },
}));

vi.mock("../middleware/checkPermission.js", () => ({
  checkPermission: () => (req, _res, next) => {
    req._roleResolved = { isSystemAdmin: false };
    next();
  },
}));

vi.mock("../middleware/phiRestrict.js", () => ({
  phiRestrict: (_req, _res, next) => next(),
}));

vi.mock("../middleware/upload.js", () => ({
  uploadMedicalFile: {
    single: () => (req, _res, next) => {
      mocks.setUploadedFile(req);
      next();
    },
  },
  assertFileSignature: (...args) => mocks.assertFileSignature(...args),
  UPLOADS_ROOT: "C:\\uploads\\medical",
}));

vi.mock("../utils/branchScope.js", () => ({
  loadScopedPatient: (...args) => mocks.loadScopedPatient(...args),
  toObjectId: (v) => v,
}));

vi.mock("../utils/encryption.js", () => ({
  encryptFile: (...args) => mocks.encryptFile(...args),
  decryptFile: (...args) => mocks.decryptFile(...args),
  decryptFileWithKeys: (...args) => mocks.decryptFileWithKeys(...args),
  isEncrypted: (...args) => mocks.isEncrypted(...args),
}));

vi.mock("node:fs/promises", () => ({
  access: (...args) => mocks.access(...args),
  readFile: (...args) => mocks.readFile(...args),
  unlink: (...args) => mocks.unlink(...args),
}));

vi.mock("node:fs", () => ({
  createReadStream: (...args) => mocks.createReadStream(...args),
}));

import attachmentRouter from "../modules/emr/attachment.routes.js";

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/v1/emr/attachments", attachmentRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  return app;
}

function makeFileRecord(overrides = {}) {
  return {
    _id: "att1",
    filename: "abc.pdf",
    originalName: "report.pdf",
    mimeType: "application/pdf",
    size: 1024,
    type: "xray",
    caption: "",
    patient: "p1",
    branch: "b1",
    tenant: "t1",
    uploadedBy: "u1",
    uploadedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.findOne.mockReset();
  mocks.create.mockReset();
  mocks.aggregate.mockReset().mockResolvedValue([{ _id: null, total: 0 }]);
  mocks.reqTenant = undefined;
  mocks.loadScopedPatient.mockReset();
  mocks.setUploadedFile.mockImplementation((req) => {
    req.file = {
      path: "C:\\tmp\\abc.pdf",
      filename: "abc.pdf",
      originalname: "report.pdf",
      mimetype: "application/pdf",
      size: 1024,
    };
    req.body = req.body || {};
  });
  mocks.access.mockReset().mockRejectedValue(new Error("ENOENT"));
  mocks.readFile.mockReset().mockResolvedValue(Buffer.from("data"));
  mocks.unlink.mockReset().mockResolvedValue();
  mocks.createReadStream.mockReset();
  mocks.encryptFile.mockReset().mockResolvedValue();
  mocks.decryptFile.mockReset().mockResolvedValue();
  mocks.decryptFileWithKeys.mockReset().mockResolvedValue();
  mocks.isEncrypted.mockReset().mockReturnValue(true);
  mocks.assertFileSignature.mockReset().mockResolvedValue();
  mocks.tenantFindById.mockReset().mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ encryption: { key: "t1-key" } }),
    }),
  });
});

describe("POST /emr/attachments/upload", () => {
  it("rejects uploads without a scoped patient", async () => {
    mocks.loadScopedPatient.mockRejectedValue({ statusCode: 400, message: "Invalid patient id" });

    const res = await request(makeApp())
      .post("/api/v1/emr/attachments/upload")
      .attach("file", Buffer.from("x"), "report.pdf");

    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("persists the tenant/branch/patient ownership on the file record", async () => {
    mocks.loadScopedPatient.mockResolvedValue({ _id: "p1", branch: "b1", tenant: "t1" });
    mocks.create.mockResolvedValue(makeFileRecord());

    const res = await request(makeApp())
      .post("/api/v1/emr/attachments/upload")
      .attach("file", Buffer.from("x"), "report.pdf")
      .field("patient", "p1")
      .field("type", "xray");

    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: "t1",
        branch: "b1",
        patient: "p1",
        filename: "abc.pdf",
        originalName: "report.pdf",
        mimeType: "application/pdf",
        size: 1024,
        type: "xray",
        uploadedBy: "u1",
      }),
    );
    expect(res.body.data.file.url).toContain("/api/v1/emr/attachments/abc.pdf/download");
  });

  it("rejects an unknown attachment type", async () => {
    mocks.loadScopedPatient.mockResolvedValue({ _id: "p1", branch: "b1", tenant: "t1" });
    mocks.setUploadedFile.mockImplementation((req) => {
      req.file = {
        path: "C:\\tmp\\abc.pdf",
        filename: "abc.pdf",
        originalname: "report.pdf",
        mimetype: "application/pdf",
        size: 1024,
      };
      req.body = { patient: "p1", type: "bogus" };
    });

    const res = await request(makeApp())
      .post("/api/v1/emr/attachments/upload")
      .attach("file", Buffer.from("x"), "report.pdf");

    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // L4: the on-disk bytes must match the declared mimetype. A file renamed
  // to .pdf (or a polyglot) is rejected before it is encrypted/stored.
  it("rejects a file whose bytes do not match the declared mimetype", async () => {
    mocks.loadScopedPatient.mockResolvedValue({ _id: "p1", branch: "b1", tenant: "t1" });
    mocks.assertFileSignature.mockRejectedValue({
      statusCode: 400,
      message: "File content does not match type application/pdf",
    });

    const res = await request(makeApp())
      .post("/api/v1/emr/attachments/upload")
      .attach("file", Buffer.from("x"), "report.pdf")
      .field("patient", "p1");

    expect(res.status).toBe(400);
    expect(mocks.encryptFile).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.unlink).toHaveBeenCalledWith("C:\\tmp\\abc.pdf");
  });

  // Storage plan cap: enforcePlanLimits('storage') must reject the upload with
  // 403 when the tenant's existing usage already meets/exceeds storageLimit,
  // before any file is written or record created.
  it("rejects the upload when the tenant storage plan limit is reached", async () => {
    mocks.reqTenant = { _id: "t1", settings: { storageLimit: 5 } };
    // Existing usage = 8 MB, above the 5 MB cap.
    mocks.aggregate.mockResolvedValue([{ _id: null, total: 8 * 1024 * 1024 }]);
    mocks.loadScopedPatient.mockResolvedValue({ _id: "p1", branch: "b1", tenant: "t1" });

    const res = await request(makeApp())
      .post("/api/v1/emr/attachments/upload")
      .attach("file", Buffer.from("x"), "report.pdf")
      .field("patient", "p1");

    expect(res.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.encryptFile).not.toHaveBeenCalled();
  });

  it("allows the upload when storage usage is below the plan limit", async () => {
    mocks.reqTenant = { _id: "t1", settings: { storageLimit: 5 } };
    mocks.aggregate.mockResolvedValue([{ _id: null, total: 2 * 1024 * 1024 }]);
    mocks.loadScopedPatient.mockResolvedValue({ _id: "p1", branch: "b1", tenant: "t1" });
    mocks.create.mockResolvedValue(makeFileRecord());

    const res = await request(makeApp())
      .post("/api/v1/emr/attachments/upload")
      .attach("file", Buffer.from("x"), "report.pdf")
      .field("patient", "p1");

    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalled();
  });
});

describe("GET /emr/attachments/:filename/download", () => {
  it("scopes the lookup to the caller's branch and tenant (no blind download)", async () => {
    mocks.findOne.mockResolvedValue(null);

    const res = await request(makeApp()).get("/api/v1/emr/attachments/abc.pdf/download");

    expect(res.status).toBe(404);
    expect(mocks.findOne).toHaveBeenCalledWith({
      filename: "abc.pdf",
      isActive: true,
      branch: "b1",
      tenant: "t1",
    });
  });

  it("streams a file registered to the caller's scope", async () => {
    mocks.findOne.mockResolvedValue(makeFileRecord());
    mocks.access.mockResolvedValue();
    mocks.createReadStream.mockReturnValue(Readable.from([Buffer.from("data")]));

    const res = await request(makeApp()).get("/api/v1/emr/attachments/abc.pdf/download");

    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    expect(mocks.decryptFileWithKeys).toHaveBeenCalledWith(
      "C:\\uploads\\medical\\abc.pdf.enc",
      expect.stringContaining("tmp_"),
      ["t1-key"],
    );
  });

  it("blocks a file that is not registered even when the file exists on disk", async () => {
    mocks.findOne.mockResolvedValue(null);
    mocks.access.mockResolvedValue();

    const res = await request(makeApp()).get("/api/v1/emr/attachments/abc.pdf/download");

    expect(res.status).toBe(404);
  });

  // Path traversal: `../` in the filename must be stripped via path.basename,
  // so the lookup never leaves the uploads root regardless of Mongo state.
  it("strips path-traversal segments from the download filename", async () => {
    mocks.findOne.mockResolvedValue(null);

    const res = await request(makeApp()).get(
      "/api/v1/emr/attachments/..%2F..%2Fetc%2Fpasswd/download",
    );

    expect(res.status).toBe(404);
    expect(mocks.findOne).toHaveBeenCalledWith({
      filename: "passwd",
      isActive: true,
      branch: "b1",
      tenant: "t1",
    });
    // Even when the record exists, the on-disk path is build from the basenamed
    // filename only — nothing outside UPLOADS_ROOT can ever be opened.
    mocks.findOne.mockResolvedValue(makeFileRecord());
    mocks.access.mockResolvedValue();
    mocks.createReadStream.mockReturnValue(Readable.from([Buffer.from("data")]));

    const res2 = await request(makeApp()).get(
      "/api/v1/emr/attachments/..%2F..%2Fetected%2Freport.pdf/download",
    );

    expect(res2.status).toBe(200);
    expect(mocks.decryptFileWithKeys).toHaveBeenCalledWith(
      "C:\\uploads\\medical\\report.pdf.enc",
      expect.stringContaining("tmp_"),
      ["t1-key"],
    );
    expect(mocks.decryptFileWithKeys.mock.lastCall[0]).not.toMatch(/\.\./);
  });

  it("strips path-traversal segments from the delete filename", async () => {
    mocks.findOne.mockResolvedValue(null);

    const res = await request(makeApp()).delete(
      "/api/v1/emr/attachments/..%2F..%2Fetc%2Fpasswd",
    );

    expect(res.status).toBe(404);
    expect(mocks.findOne).toHaveBeenCalledWith({
      filename: "passwd",
      isActive: true,
      branch: "b1",
      tenant: "t1",
    });
  });
});

describe("DELETE /emr/attachments/:filename", () => {
  it("requires the record to be in the caller's scope before deleting", async () => {
    mocks.findOne.mockResolvedValue(null);

    const res = await request(makeApp()).delete("/api/v1/emr/attachments/abc.pdf");

    expect(res.status).toBe(404);
    expect(mocks.findOne).toHaveBeenCalledWith({
      filename: "abc.pdf",
      isActive: true,
      branch: "b1",
      tenant: "t1",
    });
  });

  it("soft-deletes the record and removes the on-disk files", async () => {
    const save = vi.fn().mockResolvedValue();
    mocks.findOne.mockResolvedValue({ ...makeFileRecord(), save });

    const res = await request(makeApp()).delete("/api/v1/emr/attachments/abc.pdf");

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
    expect(mocks.unlink).toHaveBeenCalledWith(expect.stringContaining("abc.pdf.enc"));
  });
});
