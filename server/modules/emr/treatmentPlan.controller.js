import mongoose from 'mongoose';

import TreatmentPlan from './treatmentPlan.model.js';
import { POPULATE, normalizeItem, loadPlan, generateInvoiceFromPlan } from './treatmentPlan.service.js';
import { loadScopedPatient } from '../../utils/branchScope.js';
import { ensureNextAppointment } from '../../utils/emrHelpers.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { emitToBranch } from '../../socket/index.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { stripPHI } from '../../middleware/phiRestrict.js';

function emitPlan(branchId, event, plan) {
  const payload = { plan: plan.toJSON ? plan.toJSON() : plan };
  emitToBranch(branchId, event, payload);
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
    plans: req.isImpersonation ? plans.map((p) => stripPHI(p.toJSON())) : plans,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getTreatmentPlan = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await loadPlan(patient._id, req.params.planId, { branch: patient.branch });
  if (!plan) {
    throw ApiError.notFound('Treatment plan not found');
  }
  const data = req.isImpersonation ? stripPHI(plan.toJSON()) : plan;
  return sendSuccess(res, { plan: data });
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
    doctor: data.doctor || req.user._id,
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

  return sendSuccess(res, { plan: req.isImpersonation ? stripPHI(plan.toJSON()) : plan }, 201);
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
  if (data.status && data.status !== plan.status) {
    const allowed = {
      active: ['completed', 'archived'],
      completed: ['archived'],
      archived: [],
    };
    if (!allowed[plan.status]?.includes(data.status)) {
      throw ApiError.conflict(
        `Cannot transition treatment plan from "${plan.status}" to "${data.status}"`,
      );
    }
    plan.status = data.status;
  }

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
        doctor: data.doctor || req.user._id,
        createdBy: req.user._id,
      });
      plan.nextAppointmentCreated = apptId;
    }
  }

  plan.updatedBy = req.user._id;

  await plan.save();
  await plan.populate(POPULATE);
  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  return sendSuccess(res, { plan: req.isImpersonation ? stripPHI(plan.toJSON()) : plan });
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

  return sendSuccess(res, { plan: req.isImpersonation ? stripPHI(plan.toJSON()) : plan });
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

  return sendSuccess(res, { plan: req.isImpersonation ? stripPHI(plan.toJSON()) : plan }, 201);
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
    'tooth', 'surfaces', 'procedureCode', 'procedureName', 'description',
    'estimatedCost', 'status', 'appointment', 'notes',
  ]) {
    if (data[key] !== undefined) item[key] = data[key];
  }
  if (data.completedDate !== undefined) {
    item.completedDate = data.completedDate ? new Date(data.completedDate) : null;
  }
  if (data.status === 'completed' && !item.completedDate) {
    item.completedDate = new Date();
  }

  // PRD §6.5: a plan auto-completes once every non-cancelled item is done.
  const activeItems = plan.items.filter((i) => i.status !== 'cancelled');
  if (
    plan.status === 'active' &&
    activeItems.length > 0 &&
    activeItems.every((i) => i.status === 'completed')
  ) {
    plan.status = 'completed';
  }

  plan.updatedBy = req.user._id;
  await plan.save();
  await plan.populate(POPULATE);
  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  return sendSuccess(res, { plan: req.isImpersonation ? stripPHI(plan.toJSON()) : plan });
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
  if (item.invoice) {
    throw ApiError.conflict('Cannot delete a treatment item that has been invoiced');
  }
  if (item.status === 'completed') {
    throw ApiError.conflict('Cannot delete a completed treatment item');
  }

  item.deleteOne();
  plan.updatedBy = req.user._id;
  await plan.save();
  await plan.populate(POPULATE);
  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  return sendSuccess(res, { plan: req.isImpersonation ? stripPHI(plan.toJSON()) : plan });
});

export const generateInvoice = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await loadPlan(patient._id, req.params.planId, { branch: patient.branch });
  if (!plan) {
    throw ApiError.notFound('Treatment plan not found');
  }

  const result = await generateInvoiceFromPlan(plan, patient, {
    ...req.validatedBody,
    userId: req.user._id,
  });

  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  const data = req.isImpersonation
    ? {
        invoice: stripPHI(result.invoice.toJSON ? result.invoice.toJSON() : result.invoice),
        plan: stripPHI(result.plan.toJSON ? result.plan.toJSON() : result.plan),
        deductions: result.deductions,
      }
    : result;

  return sendSuccess(res, data, 201);
});
