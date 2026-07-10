import mongoose from 'mongoose';

import DentalChart from '../models/DentalChart.js';
import Invoice from '../models/Invoice.js';
import TreatmentPlan from '../models/TreatmentPlan.js';
import Commission from '../models/Commission.js';
import User from '../models/User.js';
import { loadScopedPatient, toObjectId } from '../utils/branchScope.js';
import { ensureNextAppointment } from '../utils/emrHelpers.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { emitToBranch } from '../socket/index.js';
import { sendSuccess } from '../utils/sendSuccess.js';

const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName' },
  { path: 'createdBy', select: 'name' },
  { path: 'updatedBy', select: 'name' },
];

function emitPlan(branchId, event, plan) {
  const payload = { plan: plan.toJSON ? plan.toJSON() : plan };
  emitToBranch(branchId, event, payload);
}

function normalizeItem(raw) {
  const item = { ...raw };
  if (item.tooth === undefined || item.tooth === null || item.tooth === '') {
    item.tooth = null;
  } else {
    const n = Number(item.tooth);
    item.tooth = Number.isInteger(n) && n >= 1 && n <= 32 ? n : null;
  }
  if (item.appointment) item.appointment = toObjectId(item.appointment);
  if (item.invoice) item.invoice = toObjectId(item.invoice);
  if (item.completedDate) item.completedDate = new Date(item.completedDate);
  return item;
}

async function loadPlan(patientId, planId, branchFilter) {
  if (!mongoose.isValidObjectId(planId)) {
    throw ApiError.badRequest('Invalid treatment plan id');
  }
  return TreatmentPlan.findOne({ _id: planId, patient: patientId, ...branchFilter }).populate(
    POPULATE,
  );
}

export const listTreatmentPlans = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const { page, limit } = req.validatedQuery;

  const filter = { patient: patient._id, branch: patient.branch };
  if (req.validatedQuery.status) filter.status = req.validatedQuery.status;
  const skip = (page - 1) * limit;
  const [plans, total] = await Promise.all([
    TreatmentPlan.find(filter).populate(POPULATE).sort('-createdAt').skip(skip).limit(limit),
    TreatmentPlan.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    plans,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getTreatmentPlan = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await loadPlan(patient._id, req.params.planId, { branch: patient.branch });
  if (!plan) {
    throw ApiError.notFound('Treatment plan not found');
  }
  return sendSuccess(res, { plan });
});

export const createTreatmentPlan = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;

  const nextApptId = await ensureNextAppointment({
    nextAppointment: data.nextAppointment,
    nextAppointmentNotes: data.nextAppointmentNotes,
    patient: patient._id,
    branch: patient.branch,
    tenant: patient.tenant,
    doctor: req.user._id,
    createdBy: req.user._id,
  });

  const plan = await TreatmentPlan.create({
    branch: patient.branch,
    tenant: patient.tenant,
    patient: patient._id,
    title: data.title,
    diagnosis: data.diagnosis || '',
    status: data.status || 'active',
    items: data.items.map(normalizeItem),
    nextAppointment: data.nextAppointment ? new Date(data.nextAppointment) : null,
    nextAppointmentNotes: data.nextAppointmentNotes || '',
    nextAppointmentCreated: nextApptId,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await plan.populate(POPULATE);
  emitPlan(patient.branch, 'treatment-plan:created', plan);

  return sendSuccess(res, { plan }, 201);
});

export const updateTreatmentPlan = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await loadPlan(patient._id, req.params.planId, { branch: patient.branch });
  if (!plan) {
    throw ApiError.notFound('Treatment plan not found');
  }

  const data = req.validatedBody;
  if (data.title !== undefined) plan.title = data.title;
  if (data.diagnosis !== undefined) plan.diagnosis = data.diagnosis;
  if (data.status) plan.status = data.status;

  if (data.nextAppointment !== undefined) {
    plan.nextAppointment = data.nextAppointment ? new Date(data.nextAppointment) : null;
    plan.nextAppointmentNotes = data.nextAppointmentNotes || '';
    if (data.nextAppointment && !plan.nextAppointmentCreated) {
      const apptId = await ensureNextAppointment({
        nextAppointment: data.nextAppointment,
        nextAppointmentNotes: data.nextAppointmentNotes,
        patient: patient._id,
        branch: patient.branch,
        tenant: patient.tenant,
        doctor: req.user._id,
        createdBy: req.user._id,
      });
      plan.nextAppointmentCreated = apptId;
    }
  }

  plan.updatedBy = req.user._id;

  await plan.save();
  await plan.populate(POPULATE);
  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  return sendSuccess(res, { plan });
});

export const archiveTreatmentPlan = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await loadPlan(patient._id, req.params.planId, { branch: patient.branch });
  if (!plan) {
    throw ApiError.notFound('Treatment plan not found');
  }

  plan.status = 'archived';
  plan.updatedBy = req.user._id;
  await plan.save();
  await plan.populate(POPULATE);
  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  return sendSuccess(res, { plan });
});

export const addTreatmentItem = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await loadPlan(patient._id, req.params.planId, { branch: patient.branch });
  if (!plan) {
    throw ApiError.notFound('Treatment plan not found');
  }

  plan.items.push(normalizeItem(req.validatedBody));
  plan.updatedBy = req.user._id;
  await plan.save();
  await plan.populate(POPULATE);
  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  return sendSuccess(res, { plan }, 201);
});

export const updateTreatmentItem = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await loadPlan(patient._id, req.params.planId, { branch: patient.branch });
  if (!plan) {
    throw ApiError.notFound('Treatment plan not found');
  }

  const item = plan.items.id(req.params.itemId);
  if (!item) {
    throw ApiError.notFound('Treatment item not found');
  }

  const data = normalizeItem(req.validatedBody);
  for (const key of [
    'tooth',
    'surfaces',
    'procedureCode',
    'procedureName',
    'description',
    'estimatedCost',
    'status',
    'appointment',
    'invoice',
    'notes',
  ]) {
    if (data[key] !== undefined) item[key] = data[key];
  }
  if (data.completedDate !== undefined) {
    item.completedDate = data.completedDate ? new Date(data.completedDate) : null;
  }
  if (data.status === 'completed' && !item.completedDate) {
    item.completedDate = new Date();
  }

  plan.updatedBy = req.user._id;
  await plan.save();
  await plan.populate(POPULATE);
  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  return sendSuccess(res, { plan });
});

export const removeTreatmentItem = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await loadPlan(patient._id, req.params.planId, { branch: patient.branch });
  if (!plan) {
    throw ApiError.notFound('Treatment plan not found');
  }

  const item = plan.items.id(req.params.itemId);
  if (!item) {
    throw ApiError.notFound('Treatment item not found');
  }
  if (plan.items.length <= 1) {
    throw ApiError.conflict('A treatment plan must keep at least one item');
  }

  item.deleteOne();
  plan.updatedBy = req.user._id;
  await plan.save();
  await plan.populate(POPULATE);
  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  return sendSuccess(res, { plan });
});

export const generateInvoice = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await loadPlan(patient._id, req.params.planId, { branch: patient.branch });
  if (!plan) {
    throw ApiError.notFound('Treatment plan not found');
  }

  const { itemIds, discount, tax, notes } = req.validatedBody;

  const selectedItems = plan.items.filter((item) => itemIds.includes(item._id.toString()));
  if (selectedItems.length === 0) {
    throw ApiError.badRequest('No valid items selected');
  }

  const invoiceItems = selectedItems.map((item) => ({
    description: item.tooth
      ? `${item.procedureName} (#${item.tooth})`
      : item.procedureName,
    quantity: 1,
    unitPrice: item.estimatedCost || 0,
  }));

  const invoice = await Invoice.create({
    tenant: patient.tenant,
    branch: patient.branch,
    patient: patient._id,
    items: invoiceItems,
    discount: discount || 0,
    tax: tax || 0,
    notes: notes || '',
    createdBy: req.user._id,
  });

  const { deductForProcedure } = await import('./inventory.controller.js');
  const deductionLog = [];
  for (const item of selectedItems) {
    item.invoice = invoice._id;
    if (item.status === 'pending') {
      item.status = 'completed';
      item.completedDate = new Date();
    }
    if (item.tooth) {
      const dentalChart = await DentalChart.findOne({ patient: patient._id }).lean();
      const tooth = dentalChart?.teeth?.find((t) => t.number === item.tooth);
      const toothState = tooth?.state || '';
      const deductions = await deductForProcedure(
        patient.branch,
        patient.tenant,
        toothState,
        item.procedureName,
        req.user._id,
      );
      if (deductions.length) deductionLog.push({ item: item.procedureName, deductions });
    }
  }
  plan.updatedBy = req.user._id;
  await plan.save();

  await invoice.populate([
    { path: 'patient', select: 'patientId firstName lastName phone' },
    { path: 'payments.recordedBy', select: 'name' },
    { path: 'createdBy', select: 'name' },
  ]);

  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  return sendSuccess(res, { invoice, plan, deductions: deductionLog }, 201);
});
