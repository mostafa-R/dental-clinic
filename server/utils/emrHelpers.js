import Appointment from "../modules/appointments/appointment.model.js";

const ACTIVE_STATUSES = ["scheduled", "confirmed", "checked_in", "in_progress"];

/**
 * Auto-create an appointment record from a `nextAppointment` date set on
 * a clinical note or treatment plan.  The created appointment is linked
 * to the same patient, branch, tenant and doctor so the WhatsApp reminder
 * cron can pick it up.
 *
 * Skips creation if the doctor already has an overlapping appointment.
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

  if (overlap) return null;

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
