import Appointment from './appointment.model.js';
import { emitToBranch, emitToTenantQueue } from '../../socket/index.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { filterByBranch, toObjectId } from '../../utils/branchScope.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { stripPHI } from '../../middleware/phiRestrict.js';

// The waiting-room board only needs identification fields, never full PHI.
const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName' },
  { path: 'doctor', select: 'name' },
];

function startOfDay(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(d) {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
}

function serializeQueueEntry(appointment, req) {
  return req.isImpersonation ? stripPHI(appointment.toJSON()) : appointment;
}

/**
 * Broadcast a queue event to the branch room and the tenant Live Queue room
 * (PRD §6.2). Both emitters strip PHI for impersonated sockets themselves.
 */
function broadcastQueueEvent(branchId, tenantId, event, appointment) {
  const payload = { appointment: appointment.toJSON ? appointment.toJSON() : appointment };
  emitToBranch(String(branchId), event, payload);
  emitToTenantQueue(tenantId ? String(tenantId) : null, event, payload);
}

/**
 * GET /appointments/queue
 * PRD §6.2: today's live board — who is waiting (checked_in), who is in a
 * chair (in_progress), plus counts of finished visits for the day.
 */
export const getQueue = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const now = new Date();
  const dayFilter = {
    ...branchFilter,
    start: { $gte: startOfDay(now), $lte: endOfDay(now) },
  };

  const [waiting, inChair, completedCount] = await Promise.all([
    Appointment.find({ ...dayFilter, status: 'checked_in' })
      .populate(POPULATE)
      .sort({ start: 1 }),
    Appointment.find({ ...dayFilter, status: 'in_progress' })
      .populate(POPULATE)
      .sort({ start: 1 }),
    Appointment.countDocuments({ ...dayFilter, status: 'completed' }),
  ]);

  return sendSuccess(res, {
    queue: {
      waiting: waiting.map((a) => serializeQueueEntry(a, req)),
      inChair: inChair.map((a) => serializeQueueEntry(a, req)),
      completedToday: completedCount,
      updatedAt: new Date().toISOString(),
    },
  });
});

/**
 * POST /appointments/queue/call-next
 * PRD §6.2: call the next waiting patient (earliest scheduled) to a chair.
 * The claim is atomic — the status filter inside findOneAndUpdate guarantees
 * two receptionists pressing the button at once cannot seat the same patient.
 * Emits `queue.patient.called` to branch + tenant queue rooms.
 */
export const callNextPatient = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const { doctor } = req.validatedBody ?? {};

  const filter = {
    ...branchFilter,
    status: 'checked_in',
    start: { $gte: startOfDay(new Date()), $lte: endOfDay(new Date()) },
  };
  if (doctor) {
    filter.doctor = toObjectId(doctor);
  }

  const appointment = await Appointment.findOneAndUpdate(
    filter,
    { $set: { status: 'in_progress' } },
    { sort: { start: 1 }, returnDocument: 'after' },
  );
  if (!appointment) {
    throw ApiError.notFound('No waiting patients');
  }
  await appointment.populate(POPULATE);

  broadcastQueueEvent(appointment.branch, appointment.tenant, 'queue.patient.called', appointment);

  return sendSuccess(res, { appointment: serializeQueueEntry(appointment, req) });
});
