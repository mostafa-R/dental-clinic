import Patient from '../patients/patient.model.js';
import Appointment from '../appointments/appointment.model.js';
import Invoice from '../billing/invoice.model.js';

export async function globalSearch(branchFilter, query) {
  const q = query?.trim();
  if (!q || q.length < 2) {
    return { patients: [], appointments: [], invoices: [] };
  }

  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(esc, 'i');

  const matchedPatients = await Patient.find({
    ...branchFilter,
    $or: [{ firstName: regex }, { lastName: regex }, { phone: regex }, { email: regex }, { patientId: regex }],
  })
    .select('firstName lastName phone patientId')
    .limit(5)
    .lean();

  const matchedIds = matchedPatients.map((p) => p._id);

  const [appointments, invoices] = await Promise.all([
    Appointment.find({
      ...branchFilter,
      $or: [{ reason: regex }, ...(matchedIds.length ? [{ patient: { $in: matchedIds } }] : [])],
    })
      .populate('patient', 'firstName lastName phone patientId')
      .populate('doctor', 'name')
      .limit(5)
      .lean(),
    Invoice.find({
      ...branchFilter,
      $or: [{ invoiceNo: regex }, ...(matchedIds.length ? [{ patient: { $in: matchedIds } }] : [])],
    })
      .populate('patient', 'firstName lastName phone patientId')
      .limit(5)
      .lean(),
  ]);

  return { patients: matchedPatients, appointments, invoices };
}
