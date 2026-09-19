/**
 * Phase 3 — Critical End-to-End Clinic Journey
 *
 * Exercises the REAL full-stack app (app.js) exactly as production routes it:
 *   Login → Create Patient → Book Appointment → Confirm → Check-in →
 *   Live Queue (waiting → in-chair) → FDI Dental Chart → Clinical Note →
 *   Treatment Plan → Invoice generation (with inventory auto-deduction) →
 *   Payment → Balanced accounting journal → Complete visit →
 *   Recall engine auto-creation (async event bus) → Manual recall creation →
 *   Recall transitions (contact → postpone → schedule → complete) →
 *   Tamper-evident audit chain → Logout.
 *
 * Auth is the real cookie flow: POST /api/v1/auth/login, then the
 * `access_token` cookie is forwarded on every request (protect only reads
 * cookies, no Bearer). Mutating requests carry the allowed Origin so CSRF
 * passes. The recall engine runs in-process, so recall creation is polled
 * (the event bus delivers asynchronously).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock infra BEFORE importing app.js (hoisted by vitest).
vi.mock('../config/redis.js', () => ({
  getRedis: vi.fn(() => null),
  connectRedis: vi.fn(async () => {}),
  isRedisConnected: vi.fn(() => false),
  getRedisInfo: vi.fn(async () => ({ status: 'down' })),
  incrementTenantCounter: vi.fn(async () => {}),
  disconnectRedis: vi.fn(async () => {}),
  getAggregatedTelemetry: vi.fn(async () => ({})),
}));

// NOTE: logger and cache are intentionally NOT mocked — app.js builds on the
// real pino instance (health.test.js imports app.js the same way), and the
// real cache layer already no-ops against the mocked Redis, so tenant/role
// lookups always hit the DB (fresh state).

const PASSWORD = 'Admin@2026!';
const SUFFIX = `${Date.now()}`;
const TENANT_SLUG = `e2e-${SUFFIX}`;
const HOST = `${TENANT_SLUG}.dentalos.app`;
// Reflect the app's own CORS allowlist (app.js: CLIENT_URL split or the
// localhost dev default) so Origin checks pass for mutating requests.
const ORIGIN = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean)[0];
const FD_EMAIL = `front-${SUFFIX}@test.com`;
const DOC_EMAIL = `doctor-${SUFFIX}@test.com`;
const PATIENT_EMAIL = `patient-${SUFFIX}@test.com`;

// Pick a fixed-offset IANA zone so `Date.now()` lands at ~12:00 local time:
// a booking at now+90min stays inside the same local day, which the queue
// board ("today") expects.
function resolveTestTimezone() {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const offsetMinutes = (((720 - utcMinutes) % 1440) + 1440) % 1440;
  const offsetHours = Math.round(offsetMinutes / 60) % 24;
  if (offsetHours === 0) return 'Etc/GMT0';
  if (offsetHours <= 12) return `Etc/GMT-${offsetHours}`;
  return `Etc/GMT+${24 - offsetHours}`;
}

// Seven days fully open so booking is never blocked by the weekday default.
function allDaysOpen() {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return Object.fromEntries(days.map((d) => [d, { open: '00:00', close: '23:59', closed: false }]));
}

describe('Phase 3 — Critical End-to-End Clinic Journey', () => {
  let app;
  let Tenant, Branch, Role, User, Patient, Appointment;
  let Recall, Invoice, JournalEntry, AuditLog, InventoryItem;
  let DentalChart, ClinicalNote, TreatmentPlan;
  let startEngine, stopEngine, verifyAuditChain;

  // Seeded identities.
  let tenant; // _id
  let branchId;
  let roleId;
  let frontDeskId;
  let doctorId;

  // Journey state.
  let patientId;
  let appointmentId;
  let followUpAppointmentId;
  let planId;
  let itemIds;
  let invoiceId;
  let invoiceTotal;
  let inventoryItemId;
  let engineRecallId;
  let manualRecallId;

  // Auth.
  let fdToken = '';
  let fdRefresh = '';
  let doctorToken = '';

  function cookieHeader(token, refresh) {
    return `access_token=${token}; refresh_token=${refresh}`;
  }

  async function call(method, path, { token, refresh = '', body, host = HOST } = {}) {
    let req = request(app)[method](path)
      .set('Host', host)
      .set('Origin', ORIGIN);
    if (token) req.set('Cookie', cookieHeader(token, refresh));
    if (body !== undefined) req.send(body);
    return req;
  }

  async function login(email, password) {
    const res = await call('post', '/api/v1/auth/login', { body: { email, password } });
    expect(res.status, `login failed: ${JSON.stringify(res.body)}`).toBe(200);
    const setCookies = res.headers['set-cookie'] || [];
    const parseCookies = (name) => {
      const row = setCookies.find((c) => c.startsWith(`${name}=`));
      return row ? row.split(';')[0].slice(name.length + 1) : '';
    };
    const access = parseCookies('access_token');
    const refresh = parseCookies('refresh_token');
    expect(access, 'login must set access_token cookie').toBeTruthy();
    return { access, refresh, user: res.body.data.user };
  }

  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(testDbUri);
    }

    app = (await import('../app.js')).default;

    Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    Branch = (await import('../modules/users/branch.model.js')).default;
    Role = (await import('../modules/users/role.model.js')).default;
    User = (await import('../modules/users/user.model.js')).default;
    Patient = (await import('../modules/patients/patient.model.js')).default;
    Appointment = (await import('../modules/appointments/appointment.model.js')).default;
    Recall = (await import('../modules/recalls/recall.model.js')).default;
    Invoice = (await import('../modules/billing/invoice.model.js')).default;
    JournalEntry = (await import('../modules/accounting/journalEntry.model.js')).default;
    AuditLog = (await import('../modules/site/audit/auditLog.model.js')).default;
    await AuditLog.deleteMany({});
    InventoryItem = (await import('../modules/inventory/inventory.model.js')).default;
    DentalChart = (await import('../modules/emr/dentalChart.model.js')).default;
    ClinicalNote = (await import('../modules/emr/clinicalNote.model.js')).default;
    TreatmentPlan = (await import('../modules/emr/treatmentPlan.model.js')).default;

    const { MODULE_KEYS, CRUD_ACTIONS } = await import('../constants/permissions.js');
    const engine = await import('../services/recallEngine.js');
    startEngine = engine.startRecallEngine;
    stopEngine = engine.stopRecallEngine;
    ({ verifyAuditChain } = await import('../utils/auditChain.js'));
    const enterprisePlanModules = ['dashboard', 'patients', 'appointments', 'billing', 'accounting', 'emr', 'prescriptions', 'consents', 'users', 'branches', 'inventory', 'roles', 'settings', 'automations', 'chat'];

    // Pre-clean our unique records (serial suite, shared DB).
    await Promise.all([
      Tenant.deleteOne({ slug: TENANT_SLUG }),
      User.deleteMany({ email: { $in: [FD_EMAIL, DOC_EMAIL] } }),
    ]);

    tenant = (
      await Tenant.create({
        name: `E2E Clinic ${SUFFIX}`,
        email: `clinic-${SUFFIX}@test.com`,
        slug: TENANT_SLUG,
        plan: 'enterprise',
        planModules: enterprisePlanModules,
        status: 'active',
        isActive: true,
        timezone: resolveTestTimezone(),
      })
    )._id;

    const branch = await Branch.create({
      tenant,
      name: 'E2E Main Branch',
      address: `Test Street ${SUFFIX}`,
      phone: '+201001234500',
      workingHours: allDaysOpen(),
    });
    branchId = branch._id;

    const role = await Role.create({
      tenant,
      branch: branchId,
      name: `E2E Staff ${SUFFIX}`,
      permissions: MODULE_KEYS.map((m) => ({ module: m, actions: [...CRUD_ACTIONS] })),
    });
    roleId = role._id;

    const frontDesk = await User.create({
      tenant,
      branch: branchId,
      roleId,
      name: 'Front Desk E2E',
      email: FD_EMAIL,
      password: PASSWORD,
      tokenVersion: 0,
      isActive: true,
    });
    frontDeskId = frontDesk._id;

    const doctor = await User.create({
      tenant,
      branch: branchId,
      roleId,
      name: 'Doctor E2E',
      email: DOC_EMAIL,
      password: PASSWORD,
      tokenVersion: 0,
      isActive: true,
      isDoctor: true,
    });
    doctorId = doctor._id;

    // The recall engine delivers `appointment.completed` → recall in-process.
    startEngine();
  }, 30000);

  afterAll(async () => {
    try { stopEngine(); } catch {}

    if (tenant) {
      await Promise.all([
        JournalEntry.deleteMany({ tenant }),
        Invoice.deleteMany({ tenant }),
        Recall.deleteMany({ tenant }),
        Appointment.deleteMany({ tenant }),
        TreatmentPlan.deleteMany({ tenant }),
        ClinicalNote.deleteMany({ tenant }),
        DentalChart.deleteMany({ tenant }),
        Patient.deleteMany({ tenant }),
        User.deleteMany({ tenant }),
        Role.deleteMany({ tenant }),
        Branch.deleteMany({ tenant }),
        Tenant.deleteOne({ _id: tenant }).catch(() => {}),
      ]);
      if (inventoryItemId) await InventoryItem.deleteMany({ _id: inventoryItemId }).catch(() => {});
    }
    await mongoose.disconnect();
  });

  it('runs the full clinic journey end to end', async () => {
  // ── 1. Login (real credential flow, real cookies) ───────────────────────
    let loginRes = await login(FD_EMAIL, PASSWORD);
    fdToken = loginRes.access;
    fdRefresh = loginRes.refresh;

    const docLogin = await login(DOC_EMAIL, PASSWORD);
    doctorToken = docLogin.access;

    // ── 2. Create a patient (front desk) ────────────────────────────────────
    const patientRes = await call('post', '/api/v1/patients', {
      token: fdToken,
      refresh: fdRefresh,
      body: {
        firstName: 'Ahmed',
        lastName: 'E2E',
        phone: '+201001234567',
        gender: 'male',
        dateOfBirth: '1990-05-15T00:00:00.000Z',
        email: PATIENT_EMAIL,
      },
    });
    expect(patientRes.status, JSON.stringify(patientRes.body)).toBe(201);
    patientId = patientRes.body.data.patient._id;

    // ── 3. Book an appointment (start = now+90min, still today locally) ─────
    const start = new Date(Date.now() + 90 * 60000);
    const end = new Date(start.getTime() + 30 * 60000);
    const apptRes = await call(
      'post',
      '/api/v1/appointments',
      {
        token: fdToken,
        refresh: fdRefresh,
        body: {
          patient: patientId,
          doctor: doctorId,
          start: start.toISOString(),
          end: end.toISOString(),
          reason: 'Initial consultation',
          notes: 'Phase 3 e2e booking',
        },
      },
    );
    expect(apptRes.status, JSON.stringify(apptRes.body)).toBe(201);
    appointmentId = apptRes.body.data.appointment._id;
    expect(apptRes.body.data.appointment.status).toBe('scheduled');

    // ── 4. Confirm the appointment ──────────────────────────────────────────
    const confirmRes = await call('patch', `/api/v1/appointments/${appointmentId}/status`, {
      token: fdToken,
      refresh: fdRefresh,
      body: { status: 'confirmed' },
    });
    expect(confirmRes.status, JSON.stringify(confirmRes.body)).toBe(200);
    expect(confirmRes.body.data.appointment.status).toBe('confirmed');

    // ── 5. Patient arrives → check in (joins live queue) ────────────────────
    const checkInRes = await call('patch', `/api/v1/appointments/${appointmentId}/status`, {
      token: fdToken,
      refresh: fdRefresh,
      body: { status: 'checked_in' },
    });
    expect(checkInRes.status, JSON.stringify(checkInRes.body)).toBe(200);
    expect(checkInRes.body.data.appointment.status).toBe('checked_in');

    const queueRes = await call('get', '/api/v1/appointments/queue', {
      token: fdToken,
      refresh: fdRefresh,
    });
    expect(queueRes.status).toBe(200);
    const { queue } = queueRes.body.data;
    expect(queue.waiting.some((a) => String(a.patient?._id) === patientId)).toBe(true);

    // ── 6. Call the patient to the chair ────────────────────────────────────
    const callRes = await call('post', '/api/v1/appointments/queue/call-next', {
      token: fdToken,
      refresh: fdRefresh,
      body: { doctor: doctorId },
    });
    expect(callRes.status, JSON.stringify(callRes.body)).toBe(200);
    expect(String(callRes.body.data.appointment._id)).toBe(appointmentId);
    expect(callRes.body.data.appointment.status).toBe('in_progress');

    const afterCallQueue = await call('get', '/api/v1/appointments/queue', {
      token: fdToken,
      refresh: fdRefresh,
    });
    expect(
      afterCallQueue.body.data.queue.inChair.some((a) => String(a.patient?._id) === patientId),
    ).toBe(true);

    // ── 7. Dental chart (doctor): auto-create + FDI updates ─────────────────
    const chartGet = await call('get', `/api/v1/patients/${patientId}/dental-chart`, {
      token: doctorToken,
    });
    expect(chartGet.status, JSON.stringify(chartGet.body)).toBe(200);
    expect(chartGet.body.data.chart.teeth).toHaveLength(32);

    const chartPatch = await call('patch', `/api/v1/patients/${patientId}/dental-chart`, {
      token: doctorToken,
      body: {
        teeth: [
          { fdi: 16, state: 'caries', surfaces: { mesial: 'caries' } },
          { fdi: 26, state: 'filled', surfaces: { occlusal: 'restored' } },
          { fdi: 36, state: 'root_canal' },
        ],
      },
    });
    expect(chartPatch.status, JSON.stringify(chartPatch.body)).toBe(200);
    const teeth = chartPatch.body.data.chart.teeth;
    const tooth16 = teeth.find((t) => t.fdi === 16 || t.number === 16);
    expect(tooth16.state).toBe('caries');
    expect(teeth.find((t) => t.fdi === 26 || t.number === 26).state).toBe('filled');
    expect(teeth.find((t) => t.fdi === 36 || t.number === 36).state).toBe('root_canal');

    // ── 8. Clinical note (doctor) ───────────────────────────────────────────
    const noteRes = await call('post', `/api/v1/patients/${patientId}/clinical-notes`, {
      token: doctorToken,
      body: {
        doctor: doctorId,
        appointment: appointmentId,
        visitDate: new Date().toISOString(),
        chiefComplaint: 'Pain on the upper right side while chewing.',
        examination: 'FDI 16 deep caries mesially; FDI 26 old restoration; FDI 36 tender.',
        diagnosis: 'Dental caries on FDI 16.',
        plan: 'Composite filling FDI 16; root canal therapy FDI 36; monitor FDI 26.',
      },
    });
    expect(noteRes.status, JSON.stringify(noteRes.body)).toBe(201);
    expect(noteRes.body.data.note.doctor).toBeTruthy();

    // ── 9. Treatment plan (doctor) ──────────────────────────────────────────
    const planRes = await call('post', `/api/v1/patients/${patientId}/treatment-plans`, {
      token: doctorToken,
      body: {
        title: 'Phase 3 Comprehensive Plan',
        diagnosis: 'Caries FDI 16; root canal indicated FDI 36.',
        doctor: doctorId,
        items: [
          { fdi: 16, procedureName: 'Composite Resin Filling', estimatedCost: 350 },
          { fdi: 36, procedureName: 'Root Canal Therapy', estimatedCost: 800 },
        ],
      },
    });
    expect(planRes.status, JSON.stringify(planRes.body)).toBe(201);
    planId = planRes.body.data.plan._id;
    itemIds = planRes.body.data.plan.items.map((i) => i._id);
    expect(itemIds).toHaveLength(2);

    // ── 10. Stock the clinic inventory (composite needed for the filling) ───
    const itemRes = await call('post', '/api/v1/inventory', {
      token: fdToken,
      refresh: fdRefresh,
      body: {
        name: `Composite Resin ${SUFFIX}`,
        category: 'filling_material',
        unit: 'tube',
        quantity: 10,
        costPerUnit: 120,
        reorderPoint: 2,
      },
    });
    expect(itemRes.status, JSON.stringify(itemRes.body)).toBe(201);
    inventoryItemId = itemRes.body.data.item._id;

    const adjustRes = await call('post', `/api/v1/inventory/${inventoryItemId}/adjust`, {
      token: fdToken,
      refresh: fdRefresh,
      body: { type: 'adjustment', quantity: -2, reason: `Counting check ${SUFFIX}` },
    });
    expect(adjustRes.status, JSON.stringify(adjustRes.body)).toBe(200);
    expect(adjustRes.body.data.item.quantity).toBe(8);

    // ── 11. Generate invoice from the plan (auto-deducts composite) ──────────
    const invoiceRes = await call(
      'post',
      `/api/v1/patients/${patientId}/treatment-plans/${planId}/invoice`,
      { token: doctorToken, body: { itemIds } },
    );
    expect(invoiceRes.status, JSON.stringify(invoiceRes.body)).toBe(201);
    invoiceId = invoiceRes.body.data.invoice._id;
    invoiceTotal = invoiceRes.body.data.invoice.total;
    expect(invoiceTotal).toBe(1150);
    expect(invoiceRes.body.data.deductions.length).toBeGreaterThanOrEqual(1);

    // Composite qty: 10 − 2 stock-out − 1 auto-deduction = 7.
    const itemGet = await call('get', `/api/v1/inventory/${inventoryItemId}`, {
      token: fdToken,
      refresh: fdRefresh,
    });
    expect(itemGet.status).toBe(200);
    expect(itemGet.body.data.item.quantity).toBe(7);

    // ── 12. Pay the invoice in full (cash) ──────────────────────────────────
    const payRes = await call('post', `/api/v1/billing/${invoiceId}/payments`, {
      token: fdToken,
      refresh: fdRefresh,
      body: { amount: invoiceTotal, method: 'cash', notes: 'Phase 3 cash payment' },
    });
    expect(payRes.status, JSON.stringify(payRes.body)).toBe(200);
    expect(payRes.body.data.invoice.status).toBe('paid');

    // ── 13. Balanced double-entry journal ───────────────────────────────────
    const journalRes = await call('get', '/api/v1/accounting/journal', {
      token: fdToken,
      refresh: fdRefresh,
    });
    expect(journalRes.status, JSON.stringify(journalRes.body)).toBe(200);
    const { entries, balances } = journalRes.body.data;
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(balances.totalDebit).toBeGreaterThan(0);
    expect(balances.totalDebit).toBeCloseTo(balances.totalCredit, 2);

    // ── 14. Complete the visit with an explicit 90-day hygiene recall ───────
    const completeRes = await call('patch', `/api/v1/appointments/${appointmentId}/status`, {
      token: fdToken,
      refresh: fdRefresh,
      body: {
        status: 'completed',
        recallAfterDays: 90,
        recallType: 'hygiene',
        recallReason: 'Routine hygiene recall after composite filling',
      },
    });
    expect(completeRes.status, JSON.stringify(completeRes.body)).toBe(200);
    expect(completeRes.body.data.appointment.status).toBe('completed');

    // ── 15. Poll the recall engine (async event bus) ────────────────────────
    let engineRecall = null;
    for (let i = 0; i < 40; i += 1) {
      const listRes = await call(
        'get',
        `/api/v1/recalls?patient=${patientId}&recallType=hygiene&status=due`,
        { token: fdToken, refresh: fdRefresh },
      );
      const hit = (listRes.body.data.items || []).find(
        (r) => String(r.sourceAppointment) === appointmentId,
      );
      if (hit) {
        engineRecall = hit;
        break;
      }
      await delay(250);
    }
    expect(engineRecall, 'recall engine should auto-create a hygiene recall').toBeTruthy();
    engineRecallId = engineRecall._id;
    expect(engineRecall.recallType).toBe('hygiene');
    expect(engineRecall.dueDate).toBeTruthy();

    // ── 16. Manual recall creation + full lifecycle on the engine recall ────
    const dueSoon = new Date(Date.now() + 7 * 86400000).toISOString();
    const manualRes = await call('post', '/api/v1/recalls', {
      token: fdToken,
      refresh: fdRefresh,
      body: {
        patient: patientId,
        recallType: 'periodic_check',
        reason: 'Routine periodic check-up',
        dueDate: dueSoon,
        priority: 'normal',
        notes: 'Manual recall from front desk',
      },
    });
    expect(manualRes.status, JSON.stringify(manualRes.body)).toBe(201);
    manualRecallId = manualRes.body.data.recall._id;
    expect(manualRes.body.data.recall.status).toBe('due');

    // contact (engine recall) → contacted
    const contactRes = await call('post', `/api/v1/recalls/${engineRecallId}/contact`, {
      token: fdToken,
      refresh: fdRefresh,
      body: { notes: 'Called the patient, they will come back' },
    });
    expect(contactRes.status, JSON.stringify(contactRes.body)).toBe(200);
    expect(contactRes.body.data.recall.status).toBe('contacted');
    expect(contactRes.body.data.recall.contactAttempts).toBe(1);

    // postpone (engine recall)
    const postponeRes = await call('post', `/api/v1/recalls/${engineRecallId}/postpone`, {
      token: fdToken,
      refresh: fdRefresh,
      body: { postponedUntil: new Date(Date.now() + 14 * 86400000).toISOString() },
    });
    expect(postponeRes.status, JSON.stringify(postponeRes.body)).toBe(200);
    expect(postponeRes.body.data.recall.status).toBe('postponed');

    // ── 17. Follow-up appointment (linkable: scheduled) for the recall ───────
    const followStart = new Date(Date.now() + 24 * 3600000);
    const followEnd = new Date(followStart.getTime() + 30 * 60000);
    const followUpRes = await call('post', '/api/v1/appointments', {
      token: fdToken,
      refresh: fdRefresh,
      body: {
        patient: patientId,
        doctor: doctorId,
        start: followStart.toISOString(),
        end: followEnd.toISOString(),
        reason: 'Hygiene follow-up',
      },
    });
    expect(followUpRes.status, JSON.stringify(followUpRes.body)).toBe(201);
    followUpAppointmentId = followUpRes.body.data.appointment._id;
    expect(followUpAppointmentId).toBeTruthy();

    // schedule the engine recall against the follow-up appointment
    const scheduleRes = await call('post', `/api/v1/recalls/${engineRecallId}/schedule`, {
      token: fdToken,
      refresh: fdRefresh,
      body: { appointmentId: followUpAppointmentId },
    });
    expect(scheduleRes.status, JSON.stringify(scheduleRes.body)).toBe(200);
    expect(scheduleRes.body.data.recall.status).toBe('scheduled');
    expect(String(scheduleRes.body.data.recall.scheduledAppointment)).toBe(followUpAppointmentId);

    // complete the engine recall
    const completeRecallRes = await call('post', `/api/v1/recalls/${engineRecallId}/complete`, {
      token: fdToken,
      refresh: fdRefresh,
      body: { outcome: 'Patient attended the hygiene follow-up' },
    });
    expect(completeRecallRes.status, JSON.stringify(completeRecallRes.body)).toBe(200);
    expect(completeRecallRes.body.data.recall.status).toBe('completed');

    // ── 18. Verify the recall audit trail ───────────────────────────────────
    const manualAudits = await AuditLog.find({
      'target.type': 'recall',
      'target.patient': String(patientId),
    })
      .sort({ createdAt: 1 })
      .lean();
    const manualActions = manualAudits.map((a) => a.action);
    expect(manualActions).toContain('recall.create');
    expect(manualActions).toContain('recall.contacted');
    expect(manualActions).toContain('recall.postpone');
    expect(manualActions).toContain('recall.schedule');
    expect(manualActions).toContain('recall.complete');

    const autoAudit = await AuditLog.findOne({
      action: 'recall.auto_create',
      'target.id': String(engineRecallId),
    }).lean();
    expect(autoAudit).toBeTruthy();

    const { valid, errors } = await verifyAuditChain();
    expect(valid, `audit chain broken: ${JSON.stringify(errors)}`).toBe(true);

    // ── 19. Logout → access token revoked ───────────────────────────────────
    const logoutRes = await call('post', '/api/v1/auth/logout', {
      token: fdToken,
      refresh: fdRefresh,
    });
    expect(logoutRes.status, JSON.stringify(logoutRes.body)).toBe(200);

    const meAfter = await call('get', '/api/v1/auth/me', {
      token: fdToken,
      refresh: fdRefresh,
    });
    expect(meAfter.status).toBe(401);
  });
});