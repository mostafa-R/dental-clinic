/**
 * Phase 1 — Event Bus stable contract + compatibility adapter.
 *
 * Covers:
 *  1. New-shape events normalize, persist (eventId/schemaVersion/aggregate),
 *     and keep legacy aliases for existing consumers.
 *  2. Legacy `{ type, tenant, branch, data }` producers map into the contract
 *     byte-compatibly (same deterministic eventId as the equivalent new shape).
 *  3. Invalid events (missing type, malformed ids, half aggregate refs,
 *     bad versions, garbage input) are rejected safely: structured result,
 *     no throw, no EventLog row, no handler invocation.
 *  4. Rejection visibility without log spam: one error-log call per
 *     (reason, eventType) window no matter how often a broken producer fires.
 *  5. Duplicate delivery (same object or reconstructed) delivers once.
 *  6. Cross-tenant isolation: tenant A's rules never fire on tenant B events.
 *  7. Schema versions: v1 accepted (explicit or defaulted), others rejected.
 */

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../socket/index.js', () => ({ emitToBranch: vi.fn() }));
vi.mock('../services/whatsapp.js', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue({}) }));
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import {
  buildEventId,
  normalizeEvent,
  publishEvent,
  resetEventBusState,
  subscribeEvent,
} from '../services/eventBus.js';
import {
  handleEvent,
  startAutomationEngine,
  stopAutomationEngine,
} from '../services/automationEngine.js';
import { EVENT_SCHEMA_VERSION } from '../constants/automations.js';
import Automation from '../modules/automation/automation.model.js';
import AutomationRun from '../modules/automation/automationRun.model.js';
import EventLog from '../modules/automation/eventLog.model.js';
import { logError } from '../utils/logger.js';

const oid = () => new mongoose.Types.ObjectId();
let ruleSeq = 0;

function rejectCalls() {
  return vi.mocked(logError).mock.calls.filter(([, ctx]) => ctx && ctx.context === 'EventBus.reject');
}

describe('stable contract + legacy adapter', () => {
  beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) await mongoose.connect(uri);
  });

  afterAll(async () => {
    stopAutomationEngine();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    const colls = mongoose.connection.collections;
    for (const m of [EventLog, Automation, AutomationRun]) {
      if (colls[m.collection.name]) await colls[m.collection.name].deleteMany({});
    }
    try {
      await EventLog.syncIndexes();
    } catch {
      /* index already converging — best effort */
    }
    resetEventBusState();
    vi.clearAllMocks();
  });

  it('accepts the new shape and persists the full contract', async () => {
    const tenant = oid();
    const branch = oid();
    const appointmentId = oid();
    const actor = oid();
    const result = await publishEvent({
      eventType: 'appointment.completed',
      tenantId: tenant,
      branchId: branch,
      actorId: actor,
      aggregateType: 'appointment',
      aggregateId: appointmentId,
      metadata: { durationMin: 30 },
    });
    expect(result.status).toBe('delivered');
    expect(result.eventId).toMatch(/^evt_[0-9a-f]{24}$/);

    const row = await EventLog.findOne({ eventId: result.eventId }).lean();
    expect(row).toBeTruthy();
    expect(row.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
    expect(row.type).toBe('appointment.completed');
    expect(row.aggregateType).toBe('appointment');
    expect(String(row.aggregateId)).toBe(String(appointmentId));
    expect(String(row.actorId)).toBe(String(actor));
    expect(String(row.tenant)).toBe(String(tenant));
    expect(row.data.durationMin).toBe(30);
  });

  it('maps the legacy shape into the contract with working aliases', async () => {
    const tenant = oid();
    const branch = oid();
    const seen = [];
    const unsub = subscribeEvent('patient.created', (e) => seen.push(e));
    try {
      const result = await publishEvent({
        type: 'patient.created',
        tenant,
        branch,
        data: { patientId: 'PT-1', aggregateType: 'patient', aggregateId: oid() },
      });
      expect(result.status).toBe('delivered');
      expect(seen).toHaveLength(1);
      // Legacy aliases intact for existing consumers.
      expect(seen[0].type).toBe('patient.created');
      expect(String(seen[0].tenant)).toBe(String(tenant));
      expect(seen[0].data.patientId).toBe('PT-1');
      // …and the canonical fields ride along.
      expect(seen[0].eventType).toBe('patient.created');
      expect(seen[0].schemaVersion).toBe(EVENT_SCHEMA_VERSION);
      expect(seen[0].aggregateType).toBe('patient');
      expect(typeof seen[0].eventId).toBe('string');
    } finally {
      unsub();
    }
  });

  it('assigns the same deterministic id to equivalent old/new payloads', () => {
    const tenant = oid();
    const branch = oid();
    const at = new Date('2026-01-15T10:00:00.000Z');
    const agg = oid();
    const fromLegacy = normalizeEvent({
      type: 'invoice.paid',
      tenant,
      branch,
      data: { aggregateType: 'invoice', aggregateId: agg, total: 500 },
      occurredAt: at,
    });
    const fromNew = normalizeEvent({
      eventType: 'invoice.paid',
      tenantId: tenant,
      branchId: branch,
      aggregateType: 'invoice',
      aggregateId: agg,
      occurredAt: at,
      metadata: { aggregateType: 'invoice', aggregateId: agg, total: 500 },
    });
    expect(fromLegacy.ok).toBe(true);
    expect(fromNew.ok).toBe(true);
    expect(fromLegacy.event.eventId).toBe(fromNew.event.eventId);
  });

  it('respects caller-supplied event ids and rejects overlong ones', async () => {
    const tenant = oid();
    const ok = await publishEvent({
      eventId: '  clinic-123  ',
      eventType: 'queue.joined',
      tenantId: tenant,
      metadata: {},
    });
    expect(ok.status).toBe('delivered');
    expect(ok.eventId).toBe('clinic-123');

    const bad = await publishEvent({
      eventId: 'x'.repeat(129),
      eventType: 'queue.joined',
      tenantId: tenant,
      metadata: {},
    });
    expect(bad.status).toBe('rejected');
    expect(bad.reason).toBe('invalid-event-id');
  });
});

describe('invalid events: safe rejection, no spam', () => {
  beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    const colls = mongoose.connection.collections;
    if (colls[EventLog.collection.name]) await colls[EventLog.collection.name].deleteMany({});
    resetEventBusState();
    vi.clearAllMocks();
  });

  it('rejects a missing event type without throwing or persisting', async () => {
    const seen = [];
    const unsub = subscribeEvent('patient.created', (e) => seen.push(e));
    try {
      for (const input of [{ tenant: oid() }, { type: '', tenant: oid() }, { type: '  ', tenant: oid() }]) {
        const r = await publishEvent(input);
        expect(r.status).toBe('rejected');
        expect(r.reason).toBe('missing-event-type');
        expect(typeof r.error).toBe('string');
      }
      expect(seen).toHaveLength(0);
      expect(await EventLog.countDocuments()).toBe(0);
    } finally {
      unsub();
    }
  });

  it('rejects malformed ids with specific reasons', async () => {
    const goodTenant = oid();
    const cases = [
      [{ eventType: 'queue.joined', tenantId: 't1', metadata: {} }, 'malformed-tenant-id'],
      [{ eventType: 'queue.joined', metadata: {} }, 'missing-tenant'],
      [{ eventType: 'queue.joined', tenantId: goodTenant, branchId: 'zzz', metadata: {} }, 'malformed-branchId'],
      [{ eventType: 'queue.joined', tenantId: goodTenant, actorId: 12345, metadata: {} }, 'malformed-actorId'],
      [{
        eventType: 'queue.joined', tenantId: goodTenant, aggregateType: 'queue', metadata: {},
      }, 'incomplete-aggregate-ref'],
      [{
        eventType: 'queue.joined', tenantId: goodTenant, aggregateId: goodTenant, metadata: {},
      }, 'incomplete-aggregate-ref'],
      [{
        eventType: 'queue.joined', tenantId: goodTenant, aggregateId: 'nope', metadata: {},
      }, 'malformed-aggregateId'],
      [{ type: 'queue.joined', tenant: 'b1', branch: 'b2', data: {} }, 'malformed-tenant-id'],
    ];
    for (const [input, reason] of cases) {
      const r = await publishEvent(input);
      expect(r.status).toBe('rejected');
      expect(r.reason).toBe(reason);
    }
    expect(await EventLog.countDocuments()).toBe(0);
  });

  it('never throws on garbage input and never persists it', async () => {
    for (const input of [null, undefined, 'x', 42, [], {}]) {
      const r = await publishEvent(input);
      expect(r.status).toBe('rejected');
    }
    expect(await EventLog.countDocuments()).toBe(0);
  });

  it('logs a rejection once per reason window no matter how often it fires', async () => {
    const bad = { eventType: 'queue.joined', tenantId: 't1', metadata: {} };
    for (let i = 0; i < 3; i++) {
      const r = await publishEvent(bad);
      expect(r.status).toBe('rejected');
    }
    expect(rejectCalls()).toHaveLength(1);
    expect(rejectCalls()[0][1].reason).toBe('malformed-tenant-id');
    // A different reason still gets its own single row (visible, not lost).
    await publishEvent({ tenantId: oid(), metadata: {} });
    expect(rejectCalls()).toHaveLength(2);
  });

  it('keeps PHI out of the rejection record', async () => {
    await publishEvent({ eventType: 'queue.joined', tenantId: 't1', metadata: { 'patient.phone': '+201001234567' } });
    const calls = rejectCalls();
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).not.toContain('+201001234567');
    expect(JSON.stringify(calls[0])).not.toContain('patient.phone');
  });
});

describe('idempotent delivery', () => {
  beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    const colls = mongoose.connection.collections;
    if (colls[EventLog.collection.name]) await colls[EventLog.collection.name].deleteMany({});
    resetEventBusState();
    vi.clearAllMocks();
  });

  it('delivers a redelivered event object exactly once', async () => {
    const seen = [];
    const unsub = subscribeEvent('installment.overdue', (e) => seen.push(e));
    try {
      const event = {
        eventType: 'installment.overdue',
        tenantId: oid(),
        metadata: { planId: 'p1' },
      };
      const first = await publishEvent(event);
      const second = await publishEvent(event);
      expect(first.status).toBe('delivered');
      expect(second.status).toBe('duplicate');
      expect(second.eventId).toBe(first.eventId);
      expect(seen).toHaveLength(1);
      expect(await EventLog.countDocuments({ eventId: first.eventId })).toBe(1);
    } finally {
      unsub();
    }
  });

  it('treats a reconstructed identical event as the same delivery', async () => {
    const tenant = oid();
    const at = new Date('2026-03-01T12:00:00.000Z');
    const fixedAgg = oid();
    const first = await publishEvent({
      eventType: 'consent.signed', tenantId: tenant,
      aggregateType: 'consent', aggregateId: fixedAgg,
      occurredAt: at, metadata: { version: 2 },
    });
    const second = await publishEvent({
      eventType: 'consent.signed', tenantId: tenant,
      aggregateType: 'consent', aggregateId: fixedAgg,
      occurredAt: at, metadata: { version: 2 },
    });
    expect(first.status).toBe('delivered');
    expect(second.status).toBe('duplicate');
  });

  it('buildEventId is stable for identical input', () => {
    const base = {
      eventType: 'queue.joined', tenantId: oid(), branchId: oid(),
      actorId: null, aggregateType: null, aggregateId: null,
      occurredAt: new Date('2026-05-05T05:05:05.000Z'), metadata: { n: 1 },
    };
    expect(buildEventId(base)).toBe(buildEventId({ ...base }));
    expect(buildEventId({ ...base, metadata: { n: 2 } })).not.toBe(buildEventId(base));
  });
});

describe('schema versions', () => {
  it('accepts v1 explicitly and by default, rejects everything else', async () => {
    const tenant = oid();
    const okExplicit = normalizeEvent({ eventType: 'queue.joined', tenantId: tenant, schemaVersion: 1, metadata: {} });
    expect(okExplicit.ok).toBe(true);
    expect(okExplicit.event.schemaVersion).toBe(EVENT_SCHEMA_VERSION);

    const okDefault = normalizeEvent({ eventType: 'queue.joined', tenantId: tenant, metadata: {} });
    expect(okDefault.ok).toBe(true);

    // Explicit null/undefined defaults to the current version (lenient new-shape).
    expect(normalizeEvent({ eventType: 'queue.joined', tenantId: tenant, schemaVersion: null, metadata: {} }).ok).toBe(true);

    for (const schemaVersion of [0, 2, 99, -1, '1', 'x', NaN]) {
      const r = normalizeEvent({ eventType: 'queue.joined', tenantId: tenant, schemaVersion, metadata: {} });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('unsupported-schema-version');
    }
  });
});

describe('cross-tenant isolation through the bus + engine', () => {
  beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) await mongoose.connect(uri);
  });

  afterAll(async () => {
    stopAutomationEngine();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    const colls = mongoose.connection.collections;
    for (const m of [EventLog, Automation, AutomationRun]) {
      if (colls[m.collection.name]) await colls[m.collection.name].deleteMany({});
    }
    resetEventBusState();
    vi.clearAllMocks();
  });

  it("tenant A's rules never fire on tenant B's events (and fire on A's)", async () => {
    const tenantA = oid();
    const tenantB = oid();
    const rule = await Automation.create({
      tenant: tenantA,
      name: `isolation-probe-${++ruleSeq}`,
      trigger: { type: 'patient.created' },
      conditions: [],
      actions: [{ type: 'notify_branch', config: { message: 'new patient' } }],
      enabled: true,
      isActive: true,
      cooldownMinutes: 0,
    });

    // Direct engine delivery (what the bus hands to subscribers).
    await handleEvent({ type: 'patient.created', tenant: tenantB, branch: oid(), data: {} });
    expect(await AutomationRun.countDocuments({ automation: rule._id })).toBe(0);

    await handleEvent({ type: 'patient.created', tenant: tenantA, branch: oid(), data: {} });
    expect(await AutomationRun.countDocuments({ automation: rule._id })).toBe(1);

    // End-to-end through publishEvent with the engine subscribed.
    const stop = startAutomationEngine();
    try {
      await publishEvent({ type: 'patient.created', tenant: tenantA, branch: oid(), data: {} });
      expect(await AutomationRun.countDocuments({ automation: rule._id })).toBe(2);
    } finally {
      stop();
    }
  });
});
