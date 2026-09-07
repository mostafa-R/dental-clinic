import Appointment from "../modules/appointments/appointment.model.js";
import ApiError from "./ApiError.js";

const ACTIVE_STATUSES = ["scheduled", "confirmed", "checked_in", "in_progress"];

/**
 * Verify that every appointment reference actually belongs to the given
 * patient + branch. Cross-tenant / cross-patient refs (e.g. an EMR record
 * pointing at another patient's appointment) are rejected (M3).
 *
 * Accepts a single id, an array, or null/undefined (no-op).
 */
export async function assertAppointmentsForPatient(refs, { patient, branch }) {
  const ids = (Array.isArray(refs) ? refs : [refs]).filter(Boolean);
  if (ids.length === 0) return;

  const found = await Appointment.find({
    _id: { $in: ids },
    patient,
    branch,
  })
    .select('_id')
    .lean();
  const foundSet = new Set(found.map((a) => String(a._id)));
  const missing = ids.filter((id) => !foundSet.has(String(id)));
  if (missing.length > 0) {
    throw ApiError.badRequest(
      'One or more appointment references do not belong to this patient',
      { appointment: 'cross-patient reference' },
    );
  }
}

/**
 * Auto-create an appointment record from a `nextAppointment` date set on
 * a clinical note or treatment plan.  The created appointment is linked
 * to the same patient, branch, tenant and doctor so the WhatsApp reminder
 * cron can pick it up.
 *
 * A doctor overlap raises a conflict error instead of silently skipping the
 * booking — the caller (clinical note / treatment plan save) surfaces it so
 * the user is told the follow-up could not be scheduled.
 *
 * @returns {Promise<import('mongoose').Types.ObjectId|null>} The created
 *   appointment's _id, or null if no date was provided.
 */
export async function ensureNextAppointment({
  nextAppointment,
  nextAppointmentNotes,
  patient,
  branch,
  tenant,
  doctor,
  createdBy,
}) {
  if (!nextAppointment) return null;

  const start = new Date(nextAppointment);
  if (start <= new Date()) return null;

  // Default duration: 30 minutes
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  // Check for exact duplicate (same patient, doctor, branch, start time).
  const existing = await Appointment.findOne({
    patient,
    doctor,
    branch,
    start,
    status: { $ne: 'cancelled' },
  }).select('_id').lean();
  if (existing) return existing._id;

  const overlap = await Appointment.findOne({
    doctor,
    branch,
    status: { $in: ACTIVE_STATUSES },
    start: { $lt: end },
    end: { $gt: start },
  }).select('_id').lean();

  if (overlap) {
    throw ApiError.conflict(
      'The doctor already has an appointment overlapping this follow-up time.',
    );
  }

  const appt = await Appointment.create({
    patient,
    doctor,
    branch,
    tenant,
    start,
    end,
    reason: nextAppointmentNotes?.slice(0, 300) || "Follow-up visit",
    status: "scheduled",
    createdBy,
  });

  return appt._id;
}
