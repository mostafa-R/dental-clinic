/**
 * Tests for the queue notification service (PRD §6.2): the five patient-facing
 * WhatsApp flows — queue.joined, queue.position_changed, queue.near_turn,
 * queue.turn_now and the completed-visit summary — plus their dedup flags,
 * the automation-template guard and the periodic position scanner.
 *
 * DB boundary (models) and side effects (WhatsApp sender, Event Bus, tenant
 * timezone) are mocked; the ordering / decision logic comes from the REAL
 * queueEngine so these tests exercise the actual derivation, not a double of it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Chainable query stub shared by all model stubs.
// ---------------------------------------------------------------------------
function chain(initial) {
  const c = {
    select: vi.fn(() => c),
    sort: vi.fn(() => c),
    limit: vi.fn(() => c),
    populate: vi.fn(() => c),
    lean: vi.fn(async () => initial),
  };
  return c;
}

// ---------------------------------------------------------------------------
// Today in UTC — used by the test fixtures so isSameClinicDay / zonedTodayRangeUtc
// treat the appointments as "today" and the scanner picks them up.
// ---------------------------------------------------------------------------
function todayAt(h = 10, m = 0) {
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return d;
}

function todayMinusMins(mins) {
  return new Date(Date.now() - mins * 60000);
}

// ---------------------------------------------------------------------------
// Hoisted stubs — accessible inside vi.mock factories via h.*
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const aptFindResults = [];
  return {
    aptFindResults,
    AppointmentStub: {
      findByIdAndUpdate: vi.fn(async () => ({})),
      find: vi.fn(() => chain([])),
      findById: vi.fn(() => chain({ start: todayAt(11, 0) })),
    },
    WhatsAppSettingStub: {
      findOne: vi.fn(() => chain({ _id: 'set123' })),
      find: vi.fn(() => chain([])),
    },
    TreatmentPlanStub: {
      find: vi.fn(() => chain({ items: [] })),
    },
    whatsappSend: vi.fn(async () => undefined),
    automationGuard: vi.fn(async () => false),
    publishEvent: vi.fn(async () => undefined),
    loadTenantTz: vi.fn(async () => 'UTC'),
  };
});

const {
  aptFindResults,
  AppointmentStub,
  WhatsAppSettingStub,
  TreatmentPlanStub,
  whatsappSend,
  automationGuard,
  publishEvent,
  loadTenantTz,
} = h;

vi.mock('../modules/appointments/appointment.model.js', () => ({
  default: h.AppointmentStub,
}));
vi.mock('../modules/whatsapp/whatsappSetting.model.js', () => ({
  default: h.WhatsAppSettingStub,
}));
vi.mock('../modules/emr/treatmentPlan.model.js', () => ({
  default: h.TreatmentPlanStub,
}));
vi.mock('../services/whatsapp.js', () => ({ sendWhatsAppMessage: h.whatsappSend }));
vi.mock('../services/automationEngine.js', () => ({
  isAutomationTemplateEnabled: h.automationGuard,
}));
vi.mock('../services/eventBus.js', () => ({ publishEvent: h.publishEvent }));
vi.mock('../utils/timezoneUtils.js', () => ({ loadTenantTimezone: h.loadTenantTz }));

// ---------------------------------------------------------------------------
// Import the code under test AFTER mocks are registered
// ---------------------------------------------------------------------------
import {
  notifyQueueJoined,
  notifyTurnNow,
  notifyVisitCompleted,
  scanAndNotifyQueuePositions,
  buildJoinedMessage,
  buildTurnNowMessage,
  buildCompletedMessage,
} from '../services/queueNotificationService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeApt(overrides = {}) {
  return {
    _id: 'appt123',
    tenant: 'tenant1',
    branch: 'branch1',
    doctor: { _id: 'doc1', name: 'أحمد' },
    patient: { _id: 'pat1', firstName: 'محمد', phone: '+201000000000' },
    start: todayMinusMins(0), // "now" = latest start in the queue
    reason: 'كشف دورة',
    status: 'scheduled',
    ...overrides,
  };
}

function member(id, startMin) {
  return {
    _id: id,
    start: todayMinusMins(startMin),
    createdAt: new Date(Date.now() - (startMin + 60) * 60000),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  aptFindResults.length = 0;

  WhatsAppSettingStub.findOne.mockImplementation(() => chain({ _id: 'set123' }));
  WhatsAppSettingStub.find.mockImplementation(() => chain([]));
  TreatmentPlanStub.find.mockImplementation(() => chain({ items: [] }));
  automationGuard.mockResolvedValue(false);
  AppointmentStub.findById.mockImplementation(() => chain({ start: todayAt(11, 0) }));
  AppointmentStub.findByIdAndUpdate.mockResolvedValue({});
  AppointmentStub.find.mockImplementation(() => chain(aptFindResults.shift() ?? []));
});

// ===========================================================================
// Message builders
// ===========================================================================
describe('message builders', () => {
  it('joined message includes doctor name, queue number and count', () => {
    const msg = buildJoinedMessage({
      firstName: 'محمد',
      doctorName: 'أحمد',
      queueNumber: 3,
      patientsAhead: 2,
    });
    expect(msg).toContain('محمد');
    expect(msg).toContain('د. أحمد');
    expect(msg).toContain('3');
    expect(msg).toContain('مرضى');
  });

  it('turn-now message points to the doctor room', () => {
    const msg = buildTurnNowMessage({ firstName: 'محمد', doctorName: 'أحمد' });
    expect(msg).toContain('حان دورك الآن');
    expect(msg).toContain('د. أحمد');
  });

  it('completed message renders the next appointment date', () => {
    const msg = buildCompletedMessage({
      firstName: 'محمد',
      doctorName: 'أحمد',
      summaryLines: ['تنظيف', 'حشو'],
      nextAppointment: { dayStr: 'السبت 1 فبراير', timeStr: '01:00 م' },
    });
    expect(msg).toContain('تنظيف');
    expect(msg).toContain('السبت 1 فبراير');
    expect(msg).toContain('تذكير');
  });
});

// ===========================================================================
// Flow 1 — queue.joined
// ===========================================================================
describe('notifyQueueJoined (flow 1)', () => {
  it('publishes queue.joined, computes position, sends WhatsApp, marks flags', async () => {
    aptFindResults.push([member('a', 30), member('b', 15)]);

    await notifyQueueJoined(makeApt());

    expect(publishEvent).toHaveBeenCalledTimes(1);
    const ev = publishEvent.mock.calls[0][0];
    expect(ev.type).toBe('queue.joined');
    expect(ev.data.queueNumber).toBe(3);
    expect(ev.data.patientsAhead).toBe(2);
    expect(ev.data.patient.phone).toBe('+201000000000');

    expect(whatsappSend).toHaveBeenCalledTimes(1);
    expect(whatsappSend.mock.calls[0][1]).toBe('+201000000000');
    expect(whatsappSend.mock.calls[0][2]).toContain('3');

    const sets = AppointmentStub.findByIdAndUpdate.mock.calls.map((c) => c[1].$set);
    expect(sets.find((s) => s.queueJoinedNotifiedAt)).toMatchObject({
      queueNumber: 3,
      lastQueueAheadNotified: 2,
    });
  });

  it('is skipped for a non-today appointment (next-day booking)', async () => {
    await notifyQueueJoined(
      makeApt({ start: new Date(Date.now() + 2 * 24 * 3600000) }),
    );
    expect(publishEvent).not.toHaveBeenCalled();
    expect(whatsappSend).not.toHaveBeenCalled();
  });

  it('is idempotent when queueJoinedNotifiedAt is already set', async () => {
    await notifyQueueJoined(
      makeApt({ queueJoinedNotifiedAt: new Date() }),
    );
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('still publishes the event but does NOT double-send when the queue-joined automation template is enabled', async () => {
    automationGuard.mockResolvedValue(true);
    await notifyQueueJoined(makeApt());
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(whatsappSend).not.toHaveBeenCalled();
  });

  it('does not send WhatsApp when the channel is not ready', async () => {
    WhatsAppSettingStub.findOne.mockImplementation(() => chain(null));
    await notifyQueueJoined(makeApt());
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(whatsappSend).not.toHaveBeenCalled();
  });

  it('publishes queue.joined for a first-comer as #1 with zero ahead', async () => {
    await notifyQueueJoined(makeApt());
    expect(publishEvent.mock.calls[0][0].data).toMatchObject({
      queueNumber: 1,
      patientsAhead: 0,
    });
  });
});

// ===========================================================================
// Flow 4 — queue.turn_now
// ===========================================================================
describe('notifyTurnNow (flow 4)', () => {
  it('publishes queue.turn_now + WhatsApp, sets turnNotifiedAt', async () => {
    await notifyTurnNow(makeApt({ status: 'in_progress' }));
    expect(publishEvent.mock.calls[0][0].type).toBe('queue.turn_now');
    expect(whatsappSend).toHaveBeenCalledTimes(1);
    expect(AppointmentStub.findByIdAndUpdate.mock.calls[0][1].$set.turnNotifiedAt).toBeInstanceOf(Date);
  });

  it('is idempotent after turnNotifiedAt', async () => {
    await notifyTurnNow(makeApt({ turnNotifiedAt: new Date() }));
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('suppresses WhatsApp when queue-turn-now template is enabled', async () => {
    automationGuard.mockResolvedValue(true);
    await notifyTurnNow(makeApt({ status: 'in_progress' }));
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(whatsappSend).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Flow 5 — appointment.completed (visit summary + next appointment)
// ===========================================================================
describe('notifyVisitCompleted (flow 5)', () => {
  it('builds the summary from a treatment plan + renders the next appointment', async () => {
    const tpResult = [{ items: [{ procedureName: 'تنظيف الأسنان' }, { procedureName: 'حشو تجميلي' }] }];
    TreatmentPlanStub.find.mockImplementation(() => chain(tpResult));
    AppointmentStub.findById.mockImplementation(() => chain({ start: todayAt(11, 0) }));

    await notifyVisitCompleted(makeApt({ status: 'completed' }), {
      nextAppointmentId: 'apptFOLLOW',
    });

    expect(publishEvent.mock.calls[0][0].type).toBe('appointment.completed');
    const data = publishEvent.mock.calls[0][0].data;
    expect(data.summaryLines).toEqual(['تنظيف الأسنان', 'حشو تجميلي']);
    expect(data.nextAppointment).toBeTruthy();

    expect(whatsappSend).toHaveBeenCalledTimes(1);
    expect(whatsappSend.mock.calls[0][2]).toContain('تنظيف الأسنان');
    expect(whatsappSend.mock.calls[0][2]).toContain('موعدك القادم');

    const set = AppointmentStub.findByIdAndUpdate.mock.calls.at(-1)[1].$set;
    expect(set.completedSummarySentAt).toBeInstanceOf(Date);
    expect(String(set.nextAppointmentId)).toBe('apptFOLLOW');
  });

  it('falls back to the appointment reason when no treatment plan exists', async () => {
    await notifyVisitCompleted(makeApt({ status: 'completed' }));
    const data = publishEvent.mock.calls[0][0].data;
    expect(data.summaryLines).toEqual(['كشف دورة']);
  });

  it('is suppressed when the post-visit-survey template is enabled (no double "completed" messages)', async () => {
    automationGuard.mockResolvedValue(true);
    await notifyVisitCompleted(makeApt({ status: 'completed' }));
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(whatsappSend).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Periodic scanner (flows 2 & 3)
// ===========================================================================
describe('periodic scanner (flows 2 & 3)', () => {
  function liveApts(count = 9) {
    return Array.from({ length: count }, (_, i) => ({
      _id: `apt${i}`,
      tenant: 'tenant1',
      branch: 'branch1',
      doctor: { _id: 'doc1', name: 'أحمد' },
      patient: { _id: `pat${i}`, firstName: `م${i}`, phone: `+20${i}00000000` },
      start: todayMinusMins((count - i) * 15), // earlier = lower position
      createdAt: new Date(Date.now() - (count - i) * 15 * 60000 - 1000),
      status: 'scheduled',
      lastQueueAheadNotified: null,
      nearTurnNotifiedAt: null,
      turnNotifiedAt: null,
    }));
  }

  it('fires near_turn for the top open slots and milestone updates at 8 / 6 / 4', async () => {
    const apts = liveApts(9);
    WhatsAppSettingStub.find.mockImplementation(() => chain([{ tenant: 'tenant1' }]));
    aptFindResults.push(apts, []); // 1st find = live queue, 2nd = avg-session history

    await scanAndNotifyQueuePositions();

    const calls = publishEvent.mock.calls;
    const nearTurns = calls.filter((c) => c[0].type === 'queue.near_turn');
    const milestones = calls.filter((c) => c[0].type === 'queue.position_changed');

    // near_turn: ahead ≤ 3 with wait = ahead × 20 ≤ 90
    expect(nearTurns.length).toBe(4);
    expect(nearTurns.map((c) => c[0].data.patientsAhead)).toEqual([0, 1, 2, 3]);
    expect(nearTurns[3][0].data.estimatedWaitMinutes).toBe(60);

    // milestones: ahead 4,6,8 (>90 wait → not near-turn → milestone fires)
    expect(milestones.map((c) => c[0].data.patientsAhead)).toEqual([4, 6, 8]);
  });

  it('skips when the queue-notifications channel is off for the tenant', async () => {
    WhatsAppSettingStub.find.mockImplementation(() => chain([]));
    await scanAndNotifyQueuePositions();
    expect(publishEvent).not.toHaveBeenCalled();
    expect(whatsappSend).not.toHaveBeenCalled();
  });

  it('nearTurnAlreadyNotified deduplicates on the second scan', async () => {
    const apts1 = liveApts(5);
    WhatsAppSettingStub.find.mockImplementation(() => chain([{ tenant: 'tenant1' }]));
    aptFindResults.push(apts1, []);
    await scanAndNotifyQueuePositions();

    const types1 = publishEvent.mock.calls.map((c) => c[0].type);
    // near-turn for ahead 0..3 + position milestone at ahead 4 (threshold)
    expect(types1).toEqual([
      'queue.near_turn',
      'queue.near_turn',
      'queue.near_turn',
      'queue.near_turn',
      'queue.position_changed',
    ]);

    publishEvent.mockClear();

    // Second scan: all appointments now have nearTurnNotifiedAt set, so no
    // near-turn and no position milestone should fire.
    const apts2 = apts1.map((a) => ({
      ...a,
      nearTurnNotifiedAt: new Date(),
    }));
    aptFindResults.push(apts2, []);
    await scanAndNotifyQueuePositions();
    expect(publishEvent).not.toHaveBeenCalled();
  });
});