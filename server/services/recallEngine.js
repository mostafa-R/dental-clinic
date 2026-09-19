import mongoose from 'mongoose';

import Appointment from '../modules/appointments/appointment.model.js';
import { RECALL_TYPES } from '../modules/recalls/recall.model.js';
import { createRecallIfMissing } from '../modules/recalls/recall.service.js';
import { appendAuditLog } from '../utils/auditChain.js';
import { subscribeEvent } from './eventBus.js';

/**
 * Recall generation (Phase 2) — subscribes to `appointment.completed`.
 *
 * A recall is created ONLY when the completed visit explicitly requests one:
 * the event metadata must carry `recallAfterDays` (days from completion) or
 * an explicit `recallDueDate`, plus optional `recallType`/`recallReason`.
 * There is intentionally no default clinical interval — inventing one would
 * be medical advice. Front-desk staff opt in per visit (or create recalls
 * manually via POST /api/v1/recalls).
 *
 * Idempotency: creation funnels through createRecallIfMissing, whose dedupe
 * key (tenant+patient+type+source appointment) makes redelivered events and
 * concurrent subscribers converge on a single recall. Cancelled/invalid
 * appointments are re-read from the DB and skipped unless completed.
 */

function toObjectIdOrNull(value) {
  try {
    if (!value) return null;
    if (!mongoose.isValidObjectId(value)) return null;
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

function resolveRecallWindow(data = {}) {
  if (data.recallDueDate) {
    const due = new Date(data.recallDueDate);
    if (!Number.isNaN(due.getTime())) return { dueDate: due };
    return { invalid: true };
  }
  if (data.recallAfterDays !== undefined && data.recallAfterDays !== null) {
    const days = Number(data.recallAfterDays);
    if (!Number.isFinite(days) || days < 1 || days > 730) return { invalid: true };
    return { dueDate: new Date(Date.now() + days * 86400000) };
  }
  return {};
}

function resolveRecallType(data = {}) {
  if (typeof data.recallType === 'string' && RECALL_TYPES.includes(data.recallType)) {
    return data.recallType;
  }
  return 'follow_up';
}

export async function handleRecallSourceEvent(event) {
  try {
    if (!event) return { status: 'skipped', reason: 'no-event' };
    const eventType = event.eventType || event.type;
    if (eventType !== 'appointment.completed') return { status: 'skipped', reason: 'not-a-completion' };

    const data = event.data || event.metadata || {};
    const window = resolveRecallWindow(data);
    if (window.invalid) return { status: 'skipped', reason: 'invalid-recall-window' };
    if (!window.dueDate) return { status: 'skipped', reason: 'no-recall-requested' };

    // Source of truth: re-read the appointment; only completed visits qualify.
    const appointmentId = toObjectIdOrNull(
      event.aggregateId || data.appointment?._id || data.appointment || data.id,
    );
    if (!appointmentId) return { status: 'skipped', reason: 'no-appointment-ref' };
    const appointment = await Appointment.findById(appointmentId)
      .select('_id tenant branch patient doctor status')
      .lean();
    if (!appointment) return { status: 'skipped', reason: 'appointment-not-found' };
    if (appointment.status !== 'completed') return { status: 'skipped', reason: 'not-completed' };
    if (!appointment.tenant || !appointment.branch || !appointment.patient) {
      return { status: 'skipped', reason: 'appointment-unscoped' };
    }

    const actorId = toObjectIdOrNull(event.actorId);
    const { recall, created } = await createRecallIfMissing({
      tenant: appointment.tenant,
      branch: appointment.branch,
      patient: appointment.patient,
      sourceAppointment: appointment._id,
      sourceEventId: event.eventId || null,
      recallType: resolveRecallType(data),
      reason: typeof data.recallReason === 'string' ? data.recallReason.slice(0, 500) : '',
      dueDate: window.dueDate,
      createdBy: actorId,
    });

    if (created) {
      try {
        await appendAuditLog({
          admin: null,
          tenantActor: actorId ? String(actorId) : null,
          scope: 'tenant',
          adminEmail: '',
          adminRole: '',
          action: 'recall.auto_create',
          target: { type: 'recall', id: String(recall._id) },
          details: {
            sourceAppointment: String(appointment._id),
            eventId: event.eventId || null,
            dueDate: recall.dueDate,
          },
          requestId: null,
          ip: '',
          userAgent: 'recall-engine',
        });
      } catch (err) {
        console.error('[RecallEngine] Failed to persist auto-create audit:', err.message);
      }
    }
    return { status: created ? 'created' : 'deduped', recallId: String(recall._id) };
  } catch (err) {
    console.error('[RecallEngine] handler error:', err.message);
    return { status: 'error', error: err.message };
  }
}

let unsubscribe = null;

/** Register the recall generator on the Event Bus. Idempotent. */
export function startRecallEngine() {
  if (unsubscribe) return stopRecallEngine;
  unsubscribe = subscribeEvent('appointment.completed', handleRecallSourceEvent);
  console.log('[RecallEngine] Subscribed to appointment.completed');
  return stopRecallEngine;
}

export function stopRecallEngine() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
