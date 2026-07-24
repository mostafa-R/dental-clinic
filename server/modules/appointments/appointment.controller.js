import mongoose from 'mongoose';

import Appointment, { canTransition } from './appointment.model.js';
import Patient from '../patients/patient.model.js';
import User from '../users/user.model.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { currentTenant, filterByBranch, resolveBranchForCreate, toObjectId } from '../../utils/branchScope.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { emitToBranch } from '../../socket/index.js';
import { sendSuccess } from '../../utils/sendSuccess.js';

const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName phone' },
  { path: 'doctor', select: 'name roleId isDoctor' },
  { path: 'branch', select: 'name' },
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
    appointments,
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

  return sendSuccess(res, { appointment });
});

async function assertReferences(payload, branchFilter) {
  const patient = await Patient.findOne({ _id: payload.patient, ...branchFilter });
  if (!patient) throw ApiError.badRequest('Referenced patient does not exist in this branch', { patient: 'not found' });

  const doctor = await User.findOne({ _id: payload.doctor, ...branchFilter });
  if (!doctor || !doctor.isDoctor) {
    throw ApiError.badRequest('Referenced doctor does not exist or is not a doctor', { doctor: 'not found' });
  }
}

const ACTIVE_STATUSES = ['scheduled', 'confirmed', 'checked_in', 'in_progress'];

async function assertNoOverlap({ doctor, branch, start, end, chair, excludeId }) {
  if (!start || !end) return;
  const filter = {
    doctor: toObjectId(doctor),
    branch: toObjectId(branch),
    status: { $in: ACTIVE_STATUSES },
    start: { $lt: end },
    end: { $gt: start },
  };
  if (chair) filter.chair = chair;
  if (excludeId) filter._id = { $ne: toObjectId(excludeId) };
  const conflict = await Appointment.findOne(filter).select('_id').lean();
  if (conflict) {
    throw ApiError.conflict('The doctor already has an appointment in this time slot', {
      overlappingAppointment: conflict._id,
    });
  }
}

export const createAppointment = asyncHandler(async (req, res) => {
  const data = req.validatedBody;
  const branch = await resolveBranchForCreate(req, data.branch);
  const tenant = currentTenant(req);

  await assertReferences({ patient: data.patient, doctor: data.doctor }, filterByBranch(req));

  const session = await mongoose.startSession();
  let appointment;
  try {
    await session.withTransaction(async () => {
      await assertNoOverlap({
        doctor: data.doctor,
        branch,
        start: data.start ? new Date(data.start) : null,
        end: data.end ? new Date(data.end) : null,
        chair: data.chair,
      });

      const docs = await Appointment.create([{
        patient: toObjectId(data.patient),
        doctor: toObjectId(data.doctor),
        branch,
        tenant,
        chair: data.chair || '',
        start: data.start ? new Date(data.start) : undefined,
        end: data.end ? new Date(data.end) : undefined,
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

  return sendSuccess(res, { appointment }, 201);
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

  if (data.patient) {
    const p = await Patient.findOne({ _id: data.patient, ...branchFilter });
    if (!p) throw ApiError.badRequest('Referenced patient does not exist in this branch', { patient: 'not found' });
  }
  if (data.doctor) {
    const d = await User.findOne({ _id: data.doctor, ...branchFilter });
    if (!d || !d.isDoctor) {
      throw ApiError.badRequest('Referenced doctor does not exist or is not a doctor', { doctor: 'not found' });
    }
  }

  const setPayload = { ...data };
  if (setPayload.patient) setPayload.patient = toObjectId(setPayload.patient);
  if (setPayload.doctor) setPayload.doctor = toObjectId(setPayload.doctor);
  if (setPayload.start) setPayload.start = new Date(setPayload.start);
  if (setPayload.end) setPayload.end = new Date(setPayload.end);
  delete setPayload.branch;

  // Check for double-booking when scheduling fields change.
  const newStart = setPayload.start || existing.start;
  const newEnd = setPayload.end || existing.end;
  const newDoctor = setPayload.doctor || existing.doctor;
  const newChair = setPayload.chair !== undefined ? setPayload.chair : existing.chair;
  if (setPayload.start || setPayload.end || setPayload.doctor) {
    await assertNoOverlap({
      doctor: newDoctor,
      branch: existing.branch,
      start: newStart,
      end: newEnd,
      chair: newChair,
      excludeId: id,
    });
  }

  const appointment = await Appointment.findOneAndUpdate(
    { _id: id, ...branchFilter },
    { $set: setPayload },
    { new: true, runValidators: true },
  ).populate(POPULATE);

  emitAppointment(existing.branch, 'appointment:updated', appointment);

  return sendSuccess(res, { appointment });
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
    return sendSuccess(res, { appointment });
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

  return sendSuccess(res, { appointment });
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
    return sendSuccess(res, { appointment });
  }

  if (!canTransition(appointment.status, 'cancelled')) {
    throw ApiError.conflict(`Cannot cancel an appointment that is "${appointment.status}"`);
  }

  appointment.status = 'cancelled';
  await appointment.save();
  await appointment.populate(POPULATE);

  emitAppointment(appointment.branch, 'appointment:statusChanged', appointment);

  return sendSuccess(res, { appointment });
});
