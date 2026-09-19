/**
 * Phase 2 — Recall engine / due cron / reminder template.
 *
 * Covers: appointment.completed with an explicit recall window creates a
 * recall (no window → none); duplicate/redelivered events converge on one
 * recall; non-completed appointments are ignored; malformed events are safe;
 * the due cron is idempotent and claims atomically; reminders flow only
 * through the enabled template (cooldown dedupes); disabled template sends
 * nothing; template installation is idempotent.
 *
 * No real WhatsApp is ever sent (sendWhatsAppMessage is mocked).
 */

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import cookieParser from 'cookie-parser';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';

vi.mock('../socket/index.js', () => ({ emitToBranch: vi.fn() }));
vi.mock('../services/whatsapp.js', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue({}) }));
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

import automationRouter from '../modules/automation/automation.routes.js';
import Automation from '../modules/automation/automation.model.js';
import AutomationRun from '../modules/automation/automationRun.model.js';
import EventLog from '../modules/automation/eventLog.model.js';
import Recall from '../modules/recalls/recall.model.js';
import Patient from '../modules/patients/patient.model.js';
import Appointment from '../modules/appointments/appointment.model.js';
import AuditLog from '../modules/site/audit/auditLog.model.js';
import Branch from '../modules/users/branch.model.js';
import '../modules/users/user.model.js';
import '../modules/users/branch.model.js';
import { DEFAULT_TEMPLATES } from '../constants/automations.js';
import { handleRecallSourceEvent } from '../services/recallEngine.js';
import { processDueRecalls } from '../services/recallCron.js';
import { applyRule } from '../services/automationEngine.js';
import { publishEvent, resetEventBusState } from '../services/eventBus.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { protect } from '../middleware/auth.js';
import { getCachedRole } from '../utils/cache.js';

const oid = () => new mongoose.Types.ObjectId();
let CTX;
let CURRENT_USER;

const FULL_AUTOMATION_ROLE = {
  _id: 'r-auto',
  tenant: null,
  isSystemAdmin: false,
  permissions: [{ module: 'automations', actions: ['create', 'read', 'update', 'delete'] }],
};

function automationApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/automations', automationRouter);
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

  async function seedVisit(status = 'completed') {
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const patient = await Patient.create({
    tenant: CTX.tenant,
    branch: CTX.branch,
    patientId: `PTR-${tag}`.slice(0, 20),
    firstName: 'Engine',
    lastName: 'Patient',
    phone: `+2010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
  });
  const appointment = await Appointment.create({
    tenant: CTX.tenant,
    branch: CTX.branch,
    patient: patient._id,
    doctor: oid(),
    start: new Date(Date.now() - 86400000),
    end: new Date(Date.now() - 86400000 + 1800000),
    status,
  });
  return { patient, appointment };
}

describe('recall engine (appointment.completed)', () => {
  beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) await mongoose.connect(uri);
  });

  // NOTE: no per-block disconnect — the final describe closes the shared
  // connection. Disconnect/reconnect cycling between blocks raced in-flight
  // fire-and-forget publishes (MongoClientClosedError).

  beforeEach(async () => {
    const colls = mongoose.connection.collections;
    for (const m of [Recall, Patient, Appointment, AuditLog, EventLog, Automation, AutomationRun, Branch]) {
      if (colls[m.collection.name]) await colls[m.collection.name].deleteMany({});
    }
    try {
      await Recall.syncIndexes();
    } catch {
      /* best effort */
    }
    resetEventBusState();
    vi.clearAllMocks();
    CTX = { tenant: oid(), branch: oid(), user: oid() };
    await Branch.create({ _id: CTX.branch, tenant: CTX.tenant, name: 'Engine Branch' });
    CURRENT_USER = { _id: CTX.user, tenant: CTX.tenant, branch: CTX.branch, roleId: 'r-auto' };
    vi.mocked(getCachedRole).mockResolvedValue(FULL_AUTOMATION_ROLE);
  });

  it('creates a recall when the completed visit requests a window', async () => {
    const { appointment, patient } = await seedVisit('completed');
    const outcome = await handleRecallSourceEvent({
      eventId: 'evt-engine-1',
      eventType: 'appointment.completed',
      tenantId: CTX.tenant,
      branchId: CTX.branch,
      data: {
        id: String(appointment._id),
        status: 'completed',
        recallAfterDays: 180,
        recallType: 'hygiene',
        recallReason: '6-month hygiene',
      },
    });
    expect(outcome.status).toBe('created');

    const recall = await Recall.findOne({ patient: patient._id }).lean();
    expect(recall).toBeTruthy();
    expect(recall.recallType).toBe('hygiene');
    expect(recall.status).toBe('due');
    expect(String(recall.sourceAppointment)).toBe(String(appointment._id));
    expect(recall.sourceEventId).toBe('evt-engine-1');
    const daysOut = (new Date(recall.dueDate).getTime() - Date.now()) / 86400000;
    expect(daysOut).toBeGreaterThan(170);

    const audit = await AuditLog.findOne({ scope: 'tenant', action: 'recall.auto_create' }).lean();
    expect(audit).toBeTruthy();
  });

  it('creates nothing without an explicit recall window (no invented intervals)', async () => {
    const { appointment } = await seedVisit('completed');
    for (const data of [{ id: String(appointment._id), status: 'completed' }, { id: String(appointment._id), status: 'completed', recallAfterDays: 0 }]) {
      const outcome = await handleRecallSourceEvent({
        eventType: 'appointment.completed',
        tenantId: CTX.tenant,
        branchId: CTX.branch,
        data,
      });
      expect(outcome.status).toBe('skipped');
    }
    expect(await Recall.countDocuments()).toBe(0);
  });

  it('ignores non-completed, missing, and cross-tenant appointments', async () => {
    const { appointment } = await seedVisit('confirmed');
    const direct = await handleRecallSourceEvent({
      eventType: 'appointment.completed',
      tenantId: CTX.tenant,
      branchId: CTX.branch,
      data: { id: String(appointment._id), status: 'confirmed', recallAfterDays: 30 },
    });
    expect(direct.status).toBe('skipped');
    expect(direct.reason).toBe('not-completed');

    const missing = await handleRecallSourceEvent({
      eventType: 'appointment.completed',
      tenantId: CTX.tenant,
      branchId: CTX.branch,
      data: { id: String(oid()), status: 'completed', recallAfterDays: 30 },
    });
    expect(missing.status).toBe('skipped');
    expect(await Recall.countDocuments()).toBe(0);
  });

  it('converges redelivered events onto a single recall (idempotent)', async () => {
    const { appointment } = await seedVisit('completed');
    const data = { id: String(appointment._id), status: 'completed', recallAfterDays: 90 };
    const first = await handleRecallSourceEvent({
      eventId: 'evt-redeliver', eventType: 'appointment.completed',
      tenantId: CTX.tenant, branchId: CTX.branch, data,
    });
    const second = await handleRecallSourceEvent({
      eventId: 'evt-redeliver', eventType: 'appointment.completed',
      tenantId: CTX.tenant, branchId: CTX.branch, data,
    });
    expect(first.status).toBe('created');
    expect(second.status).toBe('deduped');
    expect(second.recallId).toBe(first.recallId);
    expect(await Recall.countDocuments()).toBe(1);
  });

  it('handles malformed events safely without throwing', async () => {
    for (const event of [null, {}, { eventType: 'appointment.completed' }, { eventType: 'invoice.paid', data: {} }]) {
      const outcome = await handleRecallSourceEvent(event);
      expect(['skipped', 'error']).toContain(outcome.status);
    }
    expect(await Recall.countDocuments()).toBe(0);
  });
});

describe('due cron + reminder template', () => {
  beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    const colls = mongoose.connection.collections;
    for (const m of [Recall, Patient, Appointment, AuditLog, EventLog, Automation, AutomationRun, Branch]) {
      if (colls[m.collection.name]) await colls[m.collection.name].deleteMany({});
    }
    try {
      await Recall.syncIndexes();
    } catch {
      /* best effort */
    }
    resetEventBusState();
    vi.clearAllMocks();
    CTX = { tenant: oid(), branch: oid(), user: oid() };
    await Branch.create({ _id: CTX.branch, tenant: CTX.tenant, name: 'Cron Branch' });
    // Enterprise plan so the automations module passes the plan gate.
    CURRENT_USER = { _id: CTX.user, tenant: { _id: CTX.tenant, plan: 'enterprise' }, branch: CTX.branch, roleId: 'r-auto' };
    vi.mocked(getCachedRole).mockResolvedValue(FULL_AUTOMATION_ROLE);
  });

  async function seedDueRecall(overrides = {}) {
    const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    const patient = await Patient.create({
      tenant: CTX.tenant,
      branch: CTX.branch,
      patientId: `PTR-${tag}`.slice(0, 20),
      firstName: 'Cron',
      lastName: 'Patient',
      phone: `+2011${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
    });
    return Recall.create({
      tenant: CTX.tenant,
      branch: CTX.branch,
      patient: patient._id,
      recallType: 'hygiene',
      dueDate: new Date(Date.now() - 86400000),
      status: 'due',
      createdBy: CTX.user,
      ...overrides,
    });
  }

  it('publishes recall.due once per due recall and is idempotent on rerun', async () => {
    await seedDueRecall();
    // Future recalls are not actionable.
    await seedDueRecall({ dueDate: new Date(Date.now() + 30 * 86400000), recallType: 'follow_up' });

    const first = await processDueRecalls({ lock: false });
    expect(first.processed).toBe(1);
    expect(await EventLog.countDocuments({ type: 'recall.due' })).toBe(1);

    const row = await EventLog.findOne({ type: 'recall.due' }).lean();
    expect(row.aggregateType).toBe('recall');
    expect(row.schemaVersion).toBe(1);
    // Persisted copy is PHI-stripped; phone never lands in data at rest.
    expect(JSON.stringify(row.data)).not.toMatch(/\+2011/);

    const second = await processDueRecalls({ lock: false });
    expect(second.processed).toBe(0);
    expect(await EventLog.countDocuments({ type: 'recall.due' })).toBe(1);
  });

  it('sends the reminder only through the enabled template (cooldown dedupes)', async () => {
    const recall = await seedDueRecall();
    const rule = await Automation.create({
      tenant: CTX.tenant,
      name: 'recall-cooldown-probe',
      trigger: { type: 'recall.due' },
      conditions: [],
      actions: [{ type: 'send_whatsapp', config: { to: '{{patient.phone}}', message: 'reminder' } }],
      enabled: true,
      isActive: true,
      cooldownMinutes: 1440,
    });

    const { applyRule } = await import('../services/automationEngine.js');
    const event = {
      eventType: 'recall.due', type: 'recall.due',
      tenantId: CTX.tenant, tenant: CTX.tenant,
      branchId: CTX.branch, branch: CTX.branch,
      occurredAt: new Date(),
      metadata: { recallId: String(recall._id) },
      data: { patient: { phone: '+201100000000', firstName: 'Cron' } },
    };
    const first = await applyRule(rule.toObject(), event);
    expect(first.status).toBe('success');
    expect(vi.mocked(sendWhatsAppMessage)).toHaveBeenCalledTimes(1);

    const second = await applyRule(rule.toObject(), event);
    expect(second.status).toBe('skipped');
    expect(vi.mocked(sendWhatsAppMessage)).toHaveBeenCalledTimes(1);
  });

  it('a disabled template never sends', async () => {
    await Automation.create({
      tenant: CTX.tenant,
      name: 'recall-disabled-probe',
      trigger: { type: 'recall.due' },
      conditions: [],
      actions: [{ type: 'send_whatsapp', config: { to: '{{patient.phone}}', message: 'reminder' } }],
      enabled: false,
      isActive: true,
      cooldownMinutes: 0,
    });
    const { handleEvent } = await import('../services/automationEngine.js');
    await handleEvent({
      eventType: 'recall.due', type: 'recall.due',
      tenantId: CTX.tenant, tenant: CTX.tenant,
      branchId: CTX.branch, branch: CTX.branch,
      occurredAt: new Date(), metadata: {}, data: {},
    });
    expect(vi.mocked(sendWhatsAppMessage)).not.toHaveBeenCalled();
    expect(await AutomationRun.countDocuments()).toBe(0);
  });

  it('installs the recall-reminder template idempotently', async () => {
    const template = DEFAULT_TEMPLATES.find((t) => t.key === 'recall-reminder');
    expect(template).toBeTruthy();
    expect(template.trigger.type).toBe('recall.due');
    expect(template.cooldownMinutes).toBeGreaterThan(0);

    const app = automationApp();
    const first = await request(app).post('/api/automations/install-templates').set(AUTH).send({});
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/automations/install-templates').set(AUTH).send({});
    expect(second.status).toBe(200);
    expect(await Automation.countDocuments({ tenant: CTX.tenant, key: 'recall-reminder', isActive: true })).toBe(1);
    expect(second.body.data.existing).toBeGreaterThanOrEqual(first.body.data.existing);
  });

  it('end-to-end: due cron event flows through publishEvent without breaking', async () => {
    const recall = await seedDueRecall();
    const result = await publishEvent({
      eventType: 'recall.due',
      tenantId: CTX.tenant,
      branchId: CTX.branch,
      aggregateType: 'recall',
      aggregateId: recall._id,
      metadata: { recallId: String(recall._id) },
    });
    expect(result.status).toBe('delivered');
  });
});
