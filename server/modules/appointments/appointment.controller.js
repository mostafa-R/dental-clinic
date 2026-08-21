import mongoose from 'mongoose';

import { emitToBranch } from '../../socket/index.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { currentTenant, filterByBranch, resolveBranchForCreate, toObjectId } from '../../utils/branchScope.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { stripPHI } from '../../middleware/phiRestrict.js';
import Patient from '../patients/patient.model.js';
import Branch from '../users/branch.model.js';
import DoctorAvailability, { AVAILABILITY_TYPE } from '../users/doctorAvailability.model.js';
import User from '../users/user.model.js';
import Appointment, { canTransition } from './appointment.model.js';

const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName phone' },
  { path: 'doctor', select: 'name roleId isDoctor workingHours appointmentSettings' },
  { path: 'branch', select: 'name workingHours breakStart breakEnd' },
];

function toObjectIdList(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map((v) => toObjectId(v));
  return [toObjectId(value)];
}

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

function emitAppointment(branchId, event, appointment) {
  const payload = {
    appointment: appointment.toJSON ? appointment.toJSON() : appointment,
  };
  const resolved = branchId?._id ?? branchId;
  emitToBranch(String(resolved), event, payload);
}

/**
 * Serialize an appointment for the response. During an impersonation session
 * the populated patient/doctor fields carry PHI (phone, etc.) and must be
 * stripped before leaving the API.
 */
function serializeAppointment(appointment, req) {
  return req.isImpersonation ? stripPHI(appointment.toJSON()) : appointment;
}

async function loadAppointment(id, branchFilter) {
  const appointment = await Appointment.findOne({ _id: id, ...branchFilter }).populate(POPULATE);
  return appointment;
}

export const listAppointments = asyncHandler(async (req, res) => {
  const { from, to, date, doctor, patient, status, page, limit } = req.validatedQuery;

  const filter = { ...filterByBranch(req) };

  if (date) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) {
      filter.start = { $gte: startOfDay(d), $lte: endOfDay(d) };
    }
  } else {
    const range = {};
    if (from) range.$gte = new Date(from);
    if (to) range.$lte = new Date(to);
    if (Object.keys(range).length) filter.start = range;
  }

  if (doctor) filter.doctor = toObjectId(doctor);
  if (patient) {
    if (mongoose.isValidObjectId(patient)) {
      filter.patient = toObjectId(patient);
    } else {
      const term = escapeRegex(patient);
      const regex = new RegExp(term, 'i');
      const matching = await Patient.find({
        ...filterByBranch(req),
        $or: [
          { patientId: regex },
          { firstName: regex },
          { lastName: regex },
          { phone: regex },
        ],
      }).select('_id').lean();
      filter.patient = { $in: matching.map((p) => p._id) };
    }
  }
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [appointments, total] = await Promise.all([
    Appointment.find(filter).populate(POPULATE).sort('-start').skip(skip).limit(limit),
    Appointment.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    appointments: req.isImpersonation
      ? appointments.map((a) => serializeAppointment(a, req))
      : appointments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid appointment id');
  }

  const appointment = await loadAppointment(id, filterByBranch(req));
  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  return sendSuccess(res, { appointment: serializeAppointment(appointment, req) });
});

async function assertReferences(payload, branchFilter) {
  const patient = await Patient.findOne({ _id: payload.patient, ...branchFilter });
  if (!patient) throw ApiError.badRequest('Referenced patient does not exist in this branch', { patient: 'not found' });

  const doctor = await User.findOne({ _id: payload.doctor, ...branchFilter });
  if (!doctor || !doctor.isDoctor) {
    throw ApiError.badRequest('Referenced doctor does not exist or is not a doctor', { doctor: 'not found' });
  }

  return { patient, doctor };
}

const ACTIVE_STATUSES = ['scheduled', 'confirmed', 'checked_in', 'in_progress'];

/**
 * Check for doctor appointment overlaps
 */
async function assertNoDoctorOverlap({ doctor, branch, start, end, excludeId }) {
  if (!start || !end) return;
  const filter = {
    doctor: toObjectId(doctor),
    branch: toObjectId(branch),
    status: { $in: ACTIVE_STATUSES },
    start: { $lt: end },
    end: { $gt: start },
  };
  if (excludeId) filter._id = { $ne: toObjectId(excludeId) };
  const conflict = await Appointment.findOne(filter).select('_id start end').lean();
  if (conflict) {
    throw ApiError.conflict('The doctor already has an appointment in this time slot', {
      overlappingAppointment: conflict._id,
      overlappingTime: { start: conflict.start, end: conflict.end },
    });
  }
}

/**
 * Check for patient appointment overlaps (same patient can't have overlapping appointments)
 */
async function assertNoPatientOverlap({ patient, branch, start, end, excludeId }) {
  if (!start || !end) return;
  const filter = {
    patient: toObjectId(patient),
    branch: toObjectId(branch),
    status: { $in: ACTIVE_STATUSES },
    start: { $lt: end },
    end: { $gt: start },
  };
  if (excludeId) filter._id = { $ne: toObjectId(excludeId) };
  const conflict = await Appointment.findOne(filter).select('_id start end doctor').populate('doctor', 'name').lean();
  if (conflict) {
    throw ApiError.conflict('The patient already has an appointment in this time slot', {
      overlappingAppointment: conflict._id,
      overlappingTime: { start: conflict.start, end: conflict.end },
      withDoctor: conflict.doctor?.name || 'Unknown',
    });
  }
}

/**
 * Check if appointment falls within clinic working hours
 */
async function assertClinicHours(branch, start, end) {
  if (!start || !end) return;

  // Reload branch with working hours if not populated. NOT lean — the
  // isWithinWorkingHours schema method must survive on the document.
  const branchDoc = branch?.workingHours
    ? branch
    : await Branch.findById(branch?._id || branch);

  if (!branchDoc) return;

  const result = branchDoc.isWithinWorkingHours?.(start, end);
  if (result && !result.valid) {
    throw ApiError.badRequest(result.reason || 'Appointment is outside clinic working hours');
  }
}

/**
 * Check if doctor is available (working hours and availability exceptions)
 */
async function assertDoctorAvailability(doctor, branch, start, end) {
  if (!start || !end) return;

  // Check doctor's working hours. NOT lean — isAvailableAt is a schema
  // method and must survive on the document.
  const doctorDoc = doctor?.workingHours
    ? doctor
    : await User.findById(doctor?._id || doctor).select('workingHours appointmentSettings isDoctor');

  if (!doctorDoc) return;

  const availability = doctorDoc.isAvailableAt?.(start, end);
  if (availability && !availability.available) {
    throw ApiError.badRequest(availability.reason || 'Doctor is not available at this time');
  }

  // Check for availability exceptions (time off, vacation, etc.)
  const exception = await DoctorAvailability.findOne({
    doctor: toObjectId(doctorDoc._id),
    branch: toObjectId(branch._id || branch),
    start: { $lt: end },
    end: { $gt: start },
    type: { $in: [AVAILABILITY_TYPE.TIME_OFF, AVAILABILITY_TYPE.VACATION, AVAILABILITY_TYPE.SICK_LEAVE, AVAILABILITY_TYPE.BLOCKED] },
  }).select('_id type reason').lean();

  if (exception) {
    const reasonText = {
      [AVAILABILITY_TYPE.TIME_OFF]: 'Time off',
      [AVAILABILITY_TYPE.VACATION]: 'Vacation',
      [AVAILABILITY_TYPE.SICK_LEAVE]: 'Sick leave',
      [AVAILABILITY_TYPE.BLOCKED]: 'Blocked',
    };
    throw ApiError.conflict(
      `Doctor is unavailable: ${reasonText[exception.type] || 'Unavailable'}${exception.reason ? ` (${exception.reason})` : ''}`,
      { availabilityException: exception._id }
    );
  }
}

export const createAppointment = asyncHandler(async (req, res) => {
  const data = req.validatedBody;
  const branch = await resolveBranchForCreate(req, data.branch);
  const tenant = currentTenant(req);

  // Validate references and get populated documents
  const { patient, doctor } = await assertReferences(
    { patient: data.patient, doctor: data.doctor },
    filterByBranch(req)
  );

  const start = data.start ? new Date(data.start) : null;
  const end = data.end ? new Date(data.end) : null;

  // Validate clinic working hours
  await assertClinicHours(branch, start, end);

  // Validate doctor availability
  await assertDoctorAvailability(doctor, branch, start, end);

  // Check for doctor double-booking
  await assertNoDoctorOverlap({
    doctor: data.doctor,
    branch,
    start,
    end,
  });

  // Check for patient double-booking
  await assertNoPatientOverlap({
    patient: data.patient,
    branch,
    start,
    end,
  });

  const session = await mongoose.startSession();
  let appointment;
  try {
    await session.withTransaction(async () => {
      const docs = await Appointment.create([{
        patient: toObjectId(data.patient),
        doctor: toObjectId(data.doctor),
        branch,
        tenant,
        chair: data.chair || '',
        start,
        end,
        status: data.status || 'scheduled',
        reason: data.reason || '',
        notes: data.notes || '',
        createdBy: req.user._id,
      }], { session });
      appointment = docs[0];
    });
  } finally {
    session.endSession();
  }

  await appointment.populate(POPULATE);
  emitAppointment(branch, 'appointment:created', appointment);

  return sendSuccess(res, { appointment: serializeAppointment(appointment, req) }, 201);
});

export const updateAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid appointment id');
  }

  const branchFilter = filterByBranch(req);
  const data = req.validatedBody;

  const existing = await Appointment.findOne({ _id: id, ...branchFilter });
  if (!existing) {
    throw ApiError.notFound('Appointment not found');
  }

  // Determine new values
  const newStart = data.start ? new Date(data.start) : existing.start;
  const newEnd = data.end ? new Date(data.end) : existing.end;
  const newDoctor = data.doctor ? toObjectId(data.doctor) : existing.doctor;
  const newPatient = data.patient ? toObjectId(data.patient) : existing.patient;

  // Validate patient if changing
  let patient = null;
  if (data.patient) {
    patient = await Patient.findOne({ _id: data.patient, ...branchFilter });
    if (!patient) throw ApiError.badRequest('Referenced patient does not exist in this branch', { patient: 'not found' });
  }

  // Validate doctor if changing
  let doctor = null;
  if (data.doctor) {
    doctor = await User.findOne({ _id: data.doctor, ...branchFilter });
    if (!doctor || !doctor.isDoctor) {
      throw ApiError.badRequest('Referenced doctor does not exist or is not a doctor', { doctor: 'not found' });
    }
  }

  // Only run availability checks if time, doctor, or patient changes
  if (data.start || data.end || data.doctor || data.patient) {
    // NOT lean: isWithinWorkingHours / isAvailableAt are schema methods and
    // are stripped from lean documents.
    const branch = await Branch.findById(existing.branch);
    const doctorToCheck = doctor || await User.findById(existing.doctor).select('workingHours appointmentSettings isDoctor');

    // Validate clinic working hours
    await assertClinicHours(branch, newStart, newEnd);

    // Validate doctor availability
    await assertDoctorAvailability(doctorToCheck, branch, newStart, newEnd);

    // Check for doctor double-booking
    await assertNoDoctorOverlap({
      doctor: newDoctor,
      branch: existing.branch,
      start: newStart,
      end: newEnd,
      excludeId: id,
    });

    // Check for patient double-booking
    await assertNoPatientOverlap({
      patient: newPatient,
      branch: existing.branch,
      start: newStart,
      end: newEnd,
      excludeId: id,
    });
  }

  const setPayload = { ...data };
  if (setPayload.patient) setPayload.patient = toObjectId(setPayload.patient);
  if (setPayload.doctor) setPayload.doctor = toObjectId(setPayload.doctor);
  if (setPayload.start) setPayload.start = new Date(setPayload.start);
  if (setPayload.end) setPayload.end = new Date(setPayload.end);
  delete setPayload.branch;

  const appointment = await Appointment.findOneAndUpdate(
    { _id: id, ...branchFilter },
    { $set: setPayload },
    { new: true, runValidators: true },
  ).populate(POPULATE);

  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  emitAppointment(existing.branch, 'appointment:updated', appointment);

  return sendSuccess(res, { appointment: serializeAppointment(appointment, req) });
});

/**
 * Guarded status transition. Only the status field is mutated here, so billing
 * and medical data tied to a completed visit are never altered by this route.
 */
export const transitionAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid appointment id');
  }

  const branchFilter = filterByBranch(req);
  const { status: nextStatus } = req.validatedBody;

  const appointment = await Appointment.findOne({ _id: id, ...branchFilter });
  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  if (appointment.status === nextStatus) {
    await appointment.populate(POPULATE);
    return sendSuccess(res, { appointment: serializeAppointment(appointment, req) });
  }

  if (!canTransition(appointment.status, nextStatus)) {
    throw ApiError.conflict(
      `Cannot transition from "${appointment.status}" to "${nextStatus}"`,
    );
  }

  appointment.status = nextStatus;
  await appointment.save();
  await appointment.populate(POPULATE);

  emitAppointment(appointment.branch, 'appointment:statusChanged', appointment);

  return sendSuccess(res, { appointment: serializeAppointment(appointment, req) });
});

export const cancelAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid appointment id');
  }

  const branchFilter = filterByBranch(req);
  const appointment = await Appointment.findOne({ _id: id, ...branchFilter });
  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  if (appointment.status === 'cancelled') {
    await appointment.populate(POPULATE);
    return sendSuccess(res, { appointment: serializeAppointment(appointment, req) });
  }

  if (!canTransition(appointment.status, 'cancelled')) {
    throw ApiError.conflict(`Cannot cancel an appointment that is "${appointment.status}"`);
  }

  appointment.status = 'cancelled';
  await appointment.save();
  await appointment.populate(POPULATE);

  emitAppointment(appointment.branch, 'appointment:statusChanged', appointment);

  return sendSuccess(res, { appointment: serializeAppointment(appointment, req) });
});
