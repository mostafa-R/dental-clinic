import mongoose from 'mongoose';

import ClinicalNote from './clinicalNote.model.js';
import User from '../users/user.model.js';
import { emitToBranch } from '../../socket/index.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { loadScopedPatient, toObjectId } from '../../utils/branchScope.js';
import { ensureNextAppointment } from '../../utils/emrHelpers.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { stripPHI } from '../../middleware/phiRestrict.js';

const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName' },
  { path: 'doctor', select: 'name' },
  { path: 'createdBy', select: 'name' },
];

function emitNote(branchId, event, note) {
  const payload = { note: note.toJSON ? note.toJSON() : note };
  emitToBranch(branchId, event, payload);
}

async function assertDoctor(doctorId, branchId) {
  const doctor = await User.findOne({ _id: doctorId, branch: branchId });
  if (!doctor || !doctor.isDoctor) {
    throw ApiError.badRequest('Referenced doctor does not exist or is not a doctor', {
      doctor: 'not found',
    });
  }
}

async function loadNote(patientId, noteId, branchId) {
  if (!mongoose.isValidObjectId(noteId)) {
    throw ApiError.badRequest('Invalid clinical note id');
  }
  return ClinicalNote.findOne({ _id: noteId, patient: patientId, branch: branchId, isActive: true }).populate(
    POPULATE,
  );
}

export const listClinicalNotes = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const { page, limit, appointment } = req.validatedQuery;

  const filter = { patient: patient._id, branch: patient.branch, isActive: true };
  if (appointment) filter.appointment = toObjectId(appointment);
  const skip = (page - 1) * limit;
  const [notes, total] = await Promise.all([
    ClinicalNote.find(filter).populate(POPULATE).sort('-visitDate').skip(skip).limit(limit),
    ClinicalNote.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    notes: req.isImpersonation ? notes.map((n) => stripPHI(n.toJSON())) : notes,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getClinicalNote = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const note = await loadNote(patient._id, req.params.noteId, patient.branch);
  if (!note) {
    throw ApiError.notFound('Clinical note not found');
  }
  const data = req.isImpersonation ? stripPHI(note.toJSON()) : note;
  return sendSuccess(res, { note: data });
});

export const createClinicalNote = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;

  await assertDoctor(data.doctor, patient.branch);

  const nextApptId = await ensureNextAppointment({
    nextAppointment: data.nextAppointment,
    nextAppointmentNotes: data.nextAppointmentNotes,
    patient: patient._id,
    branch: patient.branch,
    tenant: patient.tenant,
    doctor: toObjectId(data.doctor),
    createdBy: req.user._id,
  });

  const note = await ClinicalNote.create({
    branch: patient.branch,
    tenant: patient.tenant,
    patient: patient._id,
    doctor: toObjectId(data.doctor),
    appointment: data.appointment ? toObjectId(data.appointment) : null,
    visitDate: data.visitDate ? new Date(data.visitDate) : new Date(),
    chiefComplaint: data.chiefComplaint || '',
    examination: data.examination || '',
    diagnosis: data.diagnosis || '',
    plan: data.plan || '',
    attachments: (data.attachments || []).map((a) => ({
      type: a.type || 'xray',
      url: a.url,
      caption: a.caption || '',
      uploadedBy: req.user._id,
    })),
    nextAppointment: data.nextAppointment ? new Date(data.nextAppointment) : null,
    nextAppointmentNotes: data.nextAppointmentNotes || '',
    nextAppointmentCreated: nextApptId,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await note.populate(POPULATE);
  emitNote(patient.branch, 'clinical-note:created', note);

  return sendSuccess(res, { note: req.isImpersonation ? stripPHI(note.toJSON()) : note }, 201);
});

export const updateClinicalNote = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const note = await loadNote(patient._id, req.params.noteId, patient.branch);
  if (!note) {
    throw ApiError.notFound('Clinical note not found');
  }

  const data = req.validatedBody;
  if (data.visitDate) note.visitDate = new Date(data.visitDate);
  if (data.chiefComplaint !== undefined) note.chiefComplaint = data.chiefComplaint;
  if (data.examination !== undefined) note.examination = data.examination;
  if (data.diagnosis !== undefined) note.diagnosis = data.diagnosis;
  if (data.plan !== undefined) note.plan = data.plan;
  if (Array.isArray(data.attachments)) {
    note.attachments = data.attachments.map((a) => ({
      type: a.type || 'xray',
      url: a.url,
      caption: a.caption || '',
      uploadedBy: req.user._id,
    }));
  }
  if (data.nextAppointment !== undefined) {
    note.nextAppointment = data.nextAppointment ? new Date(data.nextAppointment) : null;
    note.nextAppointmentNotes = data.nextAppointmentNotes || '';
    if (data.nextAppointment && !note.nextAppointmentCreated) {
      const apptId = await ensureNextAppointment({
        nextAppointment: data.nextAppointment,
        nextAppointmentNotes: data.nextAppointmentNotes,
        patient: patient._id,
        branch: patient.branch,
        tenant: patient.tenant,
        doctor: note.doctor,
        createdBy: req.user._id,
      });
      note.nextAppointmentCreated = apptId;
    }
  }
  note.updatedBy = req.user._id;

  await note.save();
  await note.populate(POPULATE);
  emitNote(patient.branch, 'clinical-note:updated', note);

  return sendSuccess(res, { note: req.isImpersonation ? stripPHI(note.toJSON()) : note });
});

export const deleteClinicalNote = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const note = await loadNote(patient._id, req.params.noteId, patient.branch);
  if (!note) {
    throw ApiError.notFound('Clinical note not found');
  }
  note.isActive = false;
  await note.save();
  emitNote(patient.branch, 'clinical-note:deleted', { _id: note._id });

  return sendSuccess(res, { message: 'Clinical note deleted' });
});
