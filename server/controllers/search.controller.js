import { filterByBranch } from '../utils/branchScope.js';
import Patient from '../models/Patient.js';
import Appointment from '../models/Appointment.js';
import Invoice from '../models/Invoice.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/sendSuccess.js';

export const globalSearch = asyncHandler(async (req, res) => {
  const q = req.query.q?.trim();
  if (!q || q.length < 2) {
    return sendSuccess(res, { patients: [], appointments: [], invoices: [] });
  }

  const branchFilter = filterByBranch(req);
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(esc, 'i');

  const matchedPatients = await Patient.find({
    ...branchFilter,
    $or: [
      { firstName: regex },
      { lastName: regex },
      { phone: regex },
      { email: regex },
      { patientId: regex },
    ],
  })
    .select('firstName lastName phone patientId')
    .limit(5)
    .lean();

  const matchedIds = matchedPatients.map((p) => p._id);

  const [appointments, invoices] = await Promise.all([
    Appointment.find({
      ...branchFilter,
      $or: [
        { reason: regex },
        ...(matchedIds.length ? [{ patient: { $in: matchedIds } }] : []),
      ],
    })
      .populate('patient', 'firstName lastName phone patientId')
      .populate('doctor', 'name')
      .limit(5)
      .lean(),

    Invoice.find({
      ...branchFilter,
      $or: [
        { invoiceNo: regex },
        ...(matchedIds.length ? [{ patient: { $in: matchedIds } }] : []),
      ],
    })
      .populate('patient', 'firstName lastName phone patientId')
      .limit(5)
      .lean(),
  ]);

  return sendSuccess(res, { patients: matchedPatients, appointments, invoices });
});
