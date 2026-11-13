import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import path from 'node:path';

/**
 * Phase 1.1 EMR attachment route tests (existing APIs only).
 * Verifies patient-scoped upload/download/delete with tenant/branch ownership
 * and authorization behavior at route level.
 */

const { recordStore, createRecord, findOneRecord, saveRecord, unlinkMock } = vi.hoisted(() => {
  const recordStore = new Map();
  const saveRecord = vi.fn(async function save() { return this; });
  const createRecord = vi.fn(async (doc) => {
    const rec = { _id: 'att1', ...doc, isActive: true, uploadedAt: new Date(), save: saveRecord };
    recordStore.set(String(rec.filename), rec);
    return rec;
  });
  const findOneRecord = vi.fn(async (filter) => {
    const rec = recordStore.get(String(filter.filename));
    if (!rec || rec.isActive === false) return null;
    if (filter.isActive === true && rec.isActive !== true) return null;
    // Ownership/scope matching: only return when record satisfies scope constraints in filter.
    if (filter.branch && String(rec.branch) !== String(filter.branch)) return null;
    if (filter.tenant && String(rec.tenant) !== String(filter.tenant)) return null;
    if (Object.prototype.hasOwnProperty.call(filter, '_id') && filter._id === null) return null;
    return rec;
  });
  const unlinkMock = vi.fn(async () => {});
  return { recordStore, createRecord, findOneRecord, saveRecord, unlinkMock };
});

vi.mock('../middleware/auth.js', () => ({
  protect: (req, _res, next) => {
    req.user = req.user || { _id: 'u1', tenant: 't1', branch: 'b1' };
    next();
  },
}));

vi.mock('../middleware/checkPermission.js', () => ({
  checkPermission: () => (req, _res, next) => {
    req._roleResolved = req._roleResolved || { isSystemAdmin: false, isTenantWide: false, permissionMap: () => ({ emr: ['read', 'create', 'delete'] }) };
    next();
  },
}));

vi.mock('../middleware/phiRestrict.js', () => ({
  phiRestrict: (_req, _res, next) => next(),
}));

vi.mock('../middleware/tenantRouter.js', () => ({
  enforcePlanLimits: () => (_req, _res, next) => next(),
}));

vi.mock('../middleware/upload.js', () => ({
  uploadMedicalFile: {
    single: () => (req, _res, next) => {
      if (req.headers['x-test-file'] === '1') {
        req.file = {
          path: '/tmp/upload.bin',
          filename: 'file123.jpg',
          originalname: 'xray.jpg',
          mimetype: 'image/jpeg',
          size: 1234,
        };
      }
      next();
    },
  },
  assertFileSignature: vi.fn(async () => {}),
  UPLOADS_ROOT: '/tmp/uploads',
}));

vi.mock('../utils/encryption.js', () => ({
  encryptFile: vi.fn(async () => {}),
  decryptFileWithKeys: vi.fn(async () => {}),
}));

vi.mock('../modules/site/tenant/tenant.model.js', () => ({
  default: { findById: vi.fn(() => ({ select: () => ({ lean: async () => ({ encryption: { key: 'k' } }) }) })) },
}));

vi.mock('../modules/emr/attachment.model.js', () => ({
  default: {
    create: (...a) => createRecord(...a),
    findOne: (...a) => findOneRecord(...a),
  },
}));

const loadScopedPatient = vi.fn();
const toObjectId = vi.fn((v) => v);
vi.mock('../utils/branchScope.js', () => ({
  loadScopedPatient: (...a) => loadScopedPatient(...a),
  toObjectId: (...a) => toObjectId(...a),
}));

vi.mock('node:fs/promises', () => ({
  unlink: (...a) => unlinkMock(...a),
  access: vi.fn(async () => {}),
}));

vi.mock('node:fs', () => ({
  createReadStream: vi.fn(() => ({
    pipe: (res) => res.end(),
    on: (evt, cb) => { if (evt === 'end') setImmediate(cb); return undefined; },
  })),
}));

const { default: attachmentRouter } = await import('../modules/emr/attachment.routes.js');

function appWith(user, roleResolved) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    req.user = user;
    req._roleResolved = roleResolved;
    next();
  });
  app.use('/api/v1/emr/attachments', attachmentRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return app;
}

beforeEach(() => {
  recordStore.clear();
  vi.clearAllMocks();
});

describe('EMR attachments patient-scoped ownership/authz (Phase 1.1)', () => {
  it('upload: scopes to patient in caller branch/tenant and stores patient/branch ownership', async () => {
    loadScopedPatient.mockResolvedValue({ _id: 'p1', branch: 'b1', tenant: 't1' });
    const app = appWith({ _id: 'u1', tenant: 't1', branch: 'b1' }, { isSystemAdmin: false });

    const res = await request(app)
      .post('/api/v1/emr/attachments/upload')
      .set('x-test-file', '1')
      .send({ patient: 'p1', type: 'xray' });

    expect(res.status, res.body?.message || JSON.stringify(res.body)).toBe(201);
    expect(loadScopedPatient).toHaveBeenCalled();
    expect(createRecord).toHaveBeenCalledWith(expect.objectContaining({
      patient: 'p1',
      branch: 'b1',
      tenant: 't1',
    }));
  });

  it('upload: rejects when patient is outside caller scope (tenant/branch ownership enforced)', async () => {
    const err = new Error('Patient not found');
    err.statusCode = 404;
    loadScopedPatient.mockRejectedValue(err);
    const app = appWith({ _id: 'u1', tenant: 't1', branch: 'b1' }, { isSystemAdmin: false });

    const res = await request(app)
      .post('/api/v1/emr/attachments/upload')
      .set('x-test-file', '1')
      .send({ patient: 'p-other-tenant' });

    expect(res.status, res.body?.message || JSON.stringify(res.body)).toBe(404);
    expect(createRecord).not.toHaveBeenCalled();
  });

  it('download: denies cross-branch access (same tenant, different branch)', async () => {
    // Record belongs to branch b2
    recordStore.set('file123.jpg', { _id: 'att1', filename: 'file123.jpg', branch: 'b2', tenant: 't1', isActive: true, save: saveRecord });
    const app = appWith({ _id: 'u1', tenant: 't1', branch: 'b1' }, { isSystemAdmin: false });

    const res = await request(app).get('/api/v1/emr/attachments/file123.jpg/download');
    expect(res.status).toBe(404);
  });

  it('download: denies cross-tenant access', async () => {
    recordStore.set('file123.jpg', { _id: 'att1', filename: 'file123.jpg', branch: 'b1', tenant: 't2', isActive: true, save: saveRecord });
    const app = appWith({ _id: 'u1', tenant: 't1', branch: 'b1' }, { isSystemAdmin: false });

    const res = await request(app).get('/api/v1/emr/attachments/file123.jpg/download');
    expect(res.status).toBe(404);
  });

  it('delete: soft-deletes only in-scope attachment and rejects cross-branch ownership', async () => {
    const owned = { _id: 'att1', filename: 'own.jpg', branch: 'b1', tenant: 't1', isActive: true, save: saveRecord };
    const foreign = { _id: 'att2', filename: 'foreign.jpg', branch: 'b2', tenant: 't1', isActive: true, save: saveRecord };
    recordStore.set('own.jpg', owned);
    recordStore.set('foreign.jpg', foreign);
    const app = appWith({ _id: 'u1', tenant: 't1', branch: 'b1' }, { isSystemAdmin: false });

    const ok = await request(app).delete('/api/v1/emr/attachments/own.jpg');
    expect(ok.status).toBe(200);
    expect(owned.isActive).toBe(false);
    expect(saveRecord).toHaveBeenCalled();

    const denied = await request(app).delete('/api/v1/emr/attachments/foreign.jpg');
    expect(denied.status).toBe(404);
    expect(foreign.isActive).toBe(true);
  });
});
