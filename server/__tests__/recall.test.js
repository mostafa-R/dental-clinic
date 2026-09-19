/**
 * Phase 2 — Recall model / service / API / security.
 *
 * Covers: validation, duplicate prevention (app + unique index race),
 * tenant/branch isolation (404, never 403, on cross-scope ids), RBAC denial
 * via the appointments module, legal/illegal status transitions, postpone /
 * contact / schedule / complete / dismiss flows, appointment-link guards,
 * audit rows, and PHI-safe list responses.
 */

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import cookieParser from 'cookie-parser';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';

vi.mock('../middleware/auth.js', () => ({ protect: vi.fn() }));
vi.mock('../modules/users/role.model.js', () => {
  class MockRole {}
  MockRole.findById = vi.fn();
  return { default: MockRole };
});
vi.mock('../utils/cache.js', () => ({
  getCachedRole: vi.fn(),
  cacheRole: vi.fn(),
  invalidateRole: vi.fn(),
  getCachedPermission: vi.fn(),
  cachePermission: vi.fn(),
  invalidatePermission: vi.fn(),
}));
vi.mock('../socket/index.js', () => ({ emitToBranch: vi.fn() }));

import recallRouter from '../modules/recalls/recall.routes.js';
import Recall from '../modules/recalls/recall.model.js';
import Patient from '../modules/patients/patient.model.js';
import Appointment from '../modules/appointments/appointment.model.js';
import AuditLog from '../modules/site/audit/auditLog.model.js';
import Branch from '../modules/users/branch.model.js';
import '../modules/users/user.model.js';
import '../modules/users/branch.model.js';
import { protect } from '../middleware/auth.js';
import { getCachedRole } from '../utils/cache.js';
import { createRecallIfMissing } from '../modules/recalls/recall.service.js';
import { buildDedupeKey } from '../modules/recalls/recall.model.js';

const oid = () => new mongoose.Types.ObjectId();

function roleWith(appointmentsActions) {
  return {
    _id: 'r-recall',
    tenant: null,
    isSystemAdmin: false,
    permissions: [{ module: 'appointments', actions: appointmentsActions }],
  };
}

let CTX; // { tenantA, tenantB, branchA1, branchA2, branchB, patientA, userA }
let CURRENT_USER;
let CURRENT_ROLE;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/recalls', recallRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  vi.mocked(protect).mockImplementation((req, _res, next) => {
    if (!req.cookies?.access_token) {
      return next(Object.assign(new Error('Not authenticated'), { statusCode: 401 }));
    }
    req.user = CURRENT_USER;
    next();
  });
  return app;
}

const AUTH = { Cookie: 'access_token=tok' };
const futureDate = (days) => new Date(Date.now() + days * 86400000).toISOString();

describe('Recall API', () => {
  beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    const colls = mongoose.connection.collections;
    for (const m of [Recall, Patient, Appointment, AuditLog, Branch]) {
      if (colls[m.collection.name]) await colls[m.collection.name].deleteMany({});
    }
    try {
      await Recall.syncIndexes();
    } catch {
      /* best effort */
    }
    vi.clearAllMocks();

    const tenantA = oid();
    const tenantB = oid();
    const branchA1 = oid();
    const branchA2 = oid();
    const branchB = oid();
    const userA = oid();
    await Branch.create([
      { _id: branchA1, tenant: tenantA, name: 'Branch A1' },
      { _id: branchA2, tenant: tenantA, name: 'Branch A2' },
      { _id: branchB, tenant: tenantB, name: 'Branch B' },
    ]);
    const patientA = await Patient.create({
      tenant: tenantA,
      branch: branchA1,
      patientId: 'PT-RECALL-1',
      firstName: 'Recall',
      lastName: 'Patient',
      phone: '+201000000001',
    });
    CTX = { tenantA, tenantB, branchA1, branchA2, branchB, patientA, userA };
    CURRENT_USER = { _id: userA, tenant: tenantA, branch: branchA1, roleId: 'r-recall' };
    CURRENT_ROLE = roleWith(['create', 'read', 'update', 'delete']);
    vi.mocked(getCachedRole).mockImplementation(async () => CURRENT_ROLE);
  });

  function createPayload(overrides = {}) {
    return {
      branch: String(CTX.branchA1),
      patient: String(CTX.patientA._id),
      recallType: 'hygiene',
      reason: '6-month hygiene',
      dueDate: futureDate(30),
      ...overrides,
    };
  }

  it('creates a recall (201) and writes an audit row', async () => {
    const res = await request(makeApp()).post('/api/recalls').set(AUTH).send(createPayload());
    expect(res.status).toBe(201);
    expect(res.body.data.recall.status).toBe('due');
    expect(res.body.data.recall.dedupeKey).toBeTruthy();

    const audit = await AuditLog.findOne({ scope: 'tenant', action: 'recall.create' }).lean();
    expect(audit).toBeTruthy();
    expect(String(audit.tenantActor)).toBe(String(CTX.userA));
  });

  it('rejects invalid status/type at validation (400) and missing fields', async () => {
    const badType = await request(makeApp()).post('/api/recalls').set(AUTH)
      .send(createPayload({ recallType: 'braces' }));
    expect(badType.status).toBe(400);
    const noDate = await request(makeApp()).post('/api/recalls').set(AUTH)
      .send(createPayload({ dueDate: undefined }));
    expect(noDate.status).toBe(400);
  });

  it('prevents duplicate active recalls (409), including races', async () => {
    const app = makeApp();
    const first = await request(app).post('/api/recalls').set(AUTH).send(createPayload());
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/recalls').set(AUTH).send(createPayload());
    expect(second.status).toBe(409);

    // Same patient+type but a different due day is a distinct recall.
    const otherDay = await request(app).post('/api/recalls').set(AUTH)
      .send(createPayload({ dueDate: futureDate(60) }));
    expect(otherDay.status).toBe(201);
  });

  it('createRecallIfMissing is idempotent, even under concurrency', async () => {
    const input = {
      tenant: CTX.tenantA,
      branch: CTX.branchA1,
      patient: CTX.patientA._id,
      recallType: 'follow_up',
      dueDate: new Date(Date.now() + 20 * 86400000),
      createdBy: CTX.userA,
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createRecallIfMissing(input)),
    );
    const ids = new Set(results.map((r) => String(r.recall._id)));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.created).length).toBe(1);
    expect(await Recall.countDocuments({ patient: CTX.patientA._id })).toBe(1);
  });

  it('lists with filters and pagination, populating limited patient fields', async () => {
    const app = makeApp();
    await request(app).post('/api/recalls').set(AUTH).send(createPayload());
    await request(app).post('/api/recalls').set(AUTH)
      .send(createPayload({ recallType: 'follow_up', dueDate: futureDate(10) }));

    const all = await request(app).get('/api/recalls').set(AUTH);
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBe(2);
    expect(all.body.data.items[0].dueDate <= all.body.data.items[1].dueDate).toBe(true);

    const filtered = await request(app).get('/api/recalls').query({ recallType: 'hygiene' }).set(AUTH);
    expect(filtered.body.data.total).toBe(1);

    // PHI-safe: populated patient carries contact fields, never sensitive extras.
    const patient = all.body.data.items[0].patient;
    expect(patient.firstName).toBe('Recall');
    expect(patient.phone).toBe('+201000000001');
    expect(patient.nationalId).toBeUndefined();
  });

  it('runs the full status lifecycle and blocks illegal transitions', async () => {
    const app = makeApp();
    const created = await request(app).post('/api/recalls').set(AUTH).send(createPayload());
    const id = created.body.data.recall._id;

    const contacted = await request(app).post(`/api/recalls/${id}/contact`).set(AUTH).send({});
    expect(contacted.status).toBe(200);
    expect(contacted.body.data.recall.status).toBe('contacted');
    expect(contacted.body.data.recall.contactAttempts).toBe(1);
    expect(contacted.body.data.recall.lastContactedAt).toBeTruthy();

    // contacted -> due is an illegal backward transition (use postpone).
    const back = await request(app).patch(`/api/recalls/${id}`).set(AUTH).send({ status: 'due' });
    expect(back.status).toBe(400);

    const postponed = await request(app).post(`/api/recalls/${id}/postpone`).set(AUTH)
      .send({ postponedUntil: futureDate(45) });
    expect(postponed.status).toBe(200);
    expect(postponed.body.data.recall.status).toBe('postponed');

    const past = await request(app).post(`/api/recalls/${id}/postpone`).set(AUTH)
      .send({ postponedUntil: new Date(Date.now() - 86400000).toISOString() });
    expect(past.status).toBe(400);

    // Link to an appointment of the same patient+branch.
    const appointment = await Appointment.create({
      tenant: CTX.tenantA,
      branch: CTX.branchA1,
      patient: CTX.patientA._id,
      doctor: oid(),
      start: new Date(Date.now() + 50 * 86400000),
      end: new Date(Date.now() + 50 * 86400000 + 1800000),
      status: 'scheduled',
    });
    const scheduled = await request(app).post(`/api/recalls/${id}/schedule`).set(AUTH)
      .send({ appointmentId: String(appointment._id) });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.data.recall.status).toBe('scheduled');

    const done = await request(app).post(`/api/recalls/${id}/complete`).set(AUTH)
      .send({ outcome: 'Attended, all clear' });
    expect(done.status).toBe(200);
    expect(done.body.data.recall.status).toBe('completed');

    // Terminal states are frozen.
    const frozen = await request(app).post(`/api/recalls/${id}/dismiss`).set(AUTH).send({});
    expect(frozen.status).toBe(409);
    const frozenPatch = await request(app).patch(`/api/recalls/${id}`).set(AUTH).send({ notes: 'x' });
    expect(frozenPatch.status).toBe(409);
  });

  it('dismisses from due and audits every transition', async () => {
    const app = makeApp();
    const created = await request(app).post('/api/recalls').set(AUTH).send(createPayload());
    const id = created.body.data.recall._id;
    const dismissed = await request(app).post(`/api/recalls/${id}/dismiss`).set(AUTH)
      .send({ outcome: 'Patient moved away' });
    expect(dismissed.status).toBe(200);

    const actions = await AuditLog.find({ scope: 'tenant', action: { $regex: /^recall\./ } })
      .distinct('action');
    expect(actions).toEqual(expect.arrayContaining(['recall.create', 'recall.dismiss']));
  });

  it('rejects cross-tenant reads/updates with 404 (no enumeration)', async () => {
    const app = makeApp();
    const created = await request(app).post('/api/recalls').set(AUTH).send(createPayload());
    const id = created.body.data.recall._id;

    CURRENT_USER = { _id: oid(), tenant: CTX.tenantB, branch: CTX.branchB, roleId: 'r-recall' };
    expect((await request(app).get(`/api/recalls/${id}`).set(AUTH)).status).toBe(404);
    expect((await request(app).patch(`/api/recalls/${id}`).set(AUTH).send({ notes: 'x' })).status).toBe(404);
    expect((await request(app).post(`/api/recalls/${id}/complete`).set(AUTH).send({})).status).toBe(404);
    expect((await request(app).get('/api/recalls').set(AUTH)).body.data.total).toBe(0);
  });

  it('enforces branch isolation for non-admin staff', async () => {
    const app = makeApp();
    const created = await request(app).post('/api/recalls').set(AUTH).send(createPayload());
    const id = created.body.data.recall._id;

    // Same tenant, other branch: invisible and untouchable.
    CURRENT_USER = { _id: oid(), tenant: CTX.tenantA, branch: CTX.branchA2, roleId: 'r-recall' };
    expect((await request(app).get(`/api/recalls/${id}`).set(AUTH)).status).toBe(404);
    expect((await request(app).get('/api/recalls').set(AUTH)).body.data.total).toBe(0);

    // Creation is forced into the caller's own branch regardless of body.
    const forced = await request(app).post('/api/recalls').set(AUTH).send({
      ...createPayload(),
      branch: String(CTX.branchA1),
      patient: String(CTX.patientA._id),
      dueDate: futureDate(90),
    });
    expect(forced.status).toBe(400); // patient lives in branchA1, caller in branchA2
  });

  it('denies RBAC without appointments:update and requires auth', async () => {
    const app = makeApp();
    const created = await request(app).post('/api/recalls').set(AUTH).send(createPayload());
    expect(created.status).toBe(201);

    CURRENT_ROLE = roleWith(['read']);
    const denied = await request(app).post(`/api/recalls/${created.body.data.recall._id}/complete`)
      .set(AUTH).send({});
    expect(denied.status).toBe(403);

    CURRENT_ROLE = roleWith([]);
    expect((await request(app).get('/api/recalls').set(AUTH)).status).toBe(403);
    expect((await request(makeApp()).get('/api/recalls')).status).toBe(401);
  });

  it('refuses to link foreign or cancelled appointments', async () => {
    const app = makeApp();
    const created = await request(app).post('/api/recalls').set(AUTH).send(createPayload());
    const id = created.body.data.recall._id;

    const cancelled = await Appointment.create({
      tenant: CTX.tenantA, branch: CTX.branchA1, patient: CTX.patientA._id, doctor: oid(),
      start: new Date(Date.now() + 50 * 86400000),
      end: new Date(Date.now() + 50 * 86400000 + 1800000),
      status: 'cancelled',
    });
    expect((await request(app).post(`/api/recalls/${id}/schedule`).set(AUTH)
      .send({ appointmentId: String(cancelled._id) })).status).toBe(400);

    expect((await request(app).post(`/api/recalls/${id}/schedule`).set(AUTH)
      .send({ appointmentId: String(oid()) })).status).toBe(404);
  });

  it('buildDedupeKey separates sources and manual due-days', () => {
    const a = oid();
    expect(buildDedupeKey({ recallType: 'hygiene', dueDate: new Date('2026-06-01T10:00:00Z') }))
      .toBe(buildDedupeKey({ recallType: 'hygiene', dueDate: new Date('2026-06-01T22:00:00Z') }));
    expect(buildDedupeKey({ recallType: 'hygiene', dueDate: new Date('2026-06-02T10:00:00Z') }))
      .not.toBe(buildDedupeKey({ recallType: 'hygiene', dueDate: new Date('2026-06-01T10:00:00Z') }));
    expect(buildDedupeKey({ recallType: 'follow_up', sourceAppointment: a, dueDate: new Date() }))
      .not.toBe(buildDedupeKey({ recallType: 'follow_up', dueDate: new Date() }));
  });
});
