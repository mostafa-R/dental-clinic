import mongoose from 'mongoose';

import Prescription from './prescription.model.js';
import User from '../users/user.model.js';
import { emitToBranch } from '../../socket/index.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { loadScopedPatient, toObjectId } from '../../utils/branchScope.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { stripPHI } from '../../middleware/phiRestrict.js';

const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName' },
  { path: 'doctor', select: 'name' },
  { path: 'createdBy', select: 'name' },
];

function emitRx(branchId, event, rx) {
  const payload = { prescription: rx.toJSON ? rx.toJSON() : rx };
  emitToBranch(branchId, event, payload);
}

async function assertDoctor(doctorId, branchId) {
  const doctor = await User.findById(doctorId);
  if (!doctor || (!doctor.isDoctor && doctor.role !== 'doctor')) {
    throw ApiError.badRequest('Referenced doctor does not exist or is not a doctor', {
      doctor: 'not found',
    });
  }
  // The prescribing doctor must belong to the same branch as the patient.
  if (String(doctor.branch) !== String(branchId)) {
    throw ApiError.badRequest('Doctor does not belong to this branch', {
      doctor: 'branch mismatch',
    });
  }
}

async function loadRx(patientId, rxId, branchId) {
  if (!mongoose.isValidObjectId(rxId)) {
    throw ApiError.badRequest('Invalid prescription id');
  }
  return Prescription.findOne({ _id: rxId, patient: patientId, branch: branchId, isActive: true }).populate(
    POPULATE,
  );
}

export const listPrescriptions = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const { page, limit } = req.validatedQuery;

  const filter = { patient: patient._id, branch: patient.branch, isActive: true };
  const skip = (page - 1) * limit;
  const [prescriptions, total] = await Promise.all([
    Prescription.find(filter).populate(POPULATE).sort('-issuedAt').skip(skip).limit(limit),
    Prescription.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    prescriptions: req.isImpersonation ? prescriptions.map((rx) => stripPHI(rx.toJSON())) : prescriptions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getPrescription = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const rx = await loadRx(patient._id, req.params.rxId, patient.branch);
  if (!rx) {
    throw ApiError.notFound('Prescription not found');
  }
  const data = req.isImpersonation ? stripPHI(rx.toJSON()) : rx;
  return sendSuccess(res, { prescription: data });
});

export const createPrescription = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;

  await assertDoctor(data.doctor, patient.branch);

  const rx = await Prescription.create({
    branch: patient.branch,
    tenant: patient.tenant,
    patient: patient._id,
    doctor: toObjectId(data.doctor),
    appointment: data.appointment ? toObjectId(data.appointment) : null,
    diagnosis: data.diagnosis || '',
    medications: data.medications,
    notes: data.notes || '',
    issuedAt: data.issuedAt ? new Date(data.issuedAt) : new Date(),
    createdBy: req.user._id,
  });
  await rx.populate(POPULATE);
  emitRx(patient.branch, 'prescription:created', rx);

  return sendSuccess(res, { prescription: rx }, 201);
});

export const updatePrescription = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const rx = await loadRx(patient._id, req.params.rxId, patient.branch);
  if (!rx) {
    throw ApiError.notFound('Prescription not found');
  }

  const data = req.validatedBody;
  if (data.diagnosis !== undefined) rx.diagnosis = data.diagnosis;
  if (data.notes !== undefined) rx.notes = data.notes;
  if (Array.isArray(data.medications)) rx.medications = data.medications;

  await rx.save();
  await rx.populate(POPULATE);
  emitRx(patient.branch, 'prescription:updated', rx);

  return sendSuccess(res, { prescription: rx });
});

export const deletePrescription = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const rx = await loadRx(patient._id, req.params.rxId, patient.branch);
  if (!rx) {
    throw ApiError.notFound('Prescription not found');
  }
  rx.isActive = false;
  await rx.save();
  emitRx(patient.branch, 'prescription:deleted', { _id: rx._id });

  return sendSuccess(res, { message: 'Prescription deleted' });
});
