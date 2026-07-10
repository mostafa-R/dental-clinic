import Appointment from "../models/Appointment.js";

/**
 * Auto-create an appointment record from a `nextAppointment` date set on
 * a clinical note or treatment plan.  The created appointment is linked
 * to the same patient, branch, tenant and doctor so the WhatsApp reminder
 * cron can pick it up.
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
