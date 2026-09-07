import TreatmentPlan from './treatmentPlan.model.js';
import User from '../users/user.model.js';
import { POPULATE, normalizeItem, loadPlan, generateInvoiceFromPlan } from './treatmentPlan.service.js';
import { loadScopedPatient } from '../../utils/branchScope.js';
import { ensureNextAppointment, assertAppointmentsForPatient } from '../../utils/emrHelpers.js';
import { withTransaction } from '../../core/transaction.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { emitToBranch } from '../../socket/index.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { stripPHI } from '../../middleware/phiRestrict.js';

function emitPlan(branchId, event, plan) {
  const payload = { plan: plan.toJSON ? plan.toJSON() : plan };
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

  // M2: the doctor driving the plan (and any follow-up appointment) must be a
  // real doctor in this branch — never silently whatever user is signed in.
  await assertDoctor(data.doctor, patient.branch);

  // M3: every item's appointment link must belong to this exact patient.
  await assertAppointmentsForPatient(
    data.items.map((item) => item.appointment),
    { patient: patient._id, branch: patient.branch },
  );

  const nextApptId = await ensureNextAppointment({
    nextAppointment: data.nextAppointment,
    nextAppointmentNotes: data.nextAppointmentNotes,
    patient: patient._id,
    branch: patient.branch,
    tenant: patient.tenant,
    doctor: data.doctor,
    createdBy: req.user._id,
  });

  const plan = await TreatmentPlan.create({
    branch: patient.branch,
    tenant: patient.tenant,
    patient: patient._id,
    title: data.title,
    diagnosis: data.diagnosis || '',
    // L2: a plan always starts active — client-supplied status is refused.
    status: 'active',
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
  // M2: when the caller supplies a doctor (e.g. for a follow-up appointment),
  // it must genuinely be a doctor in this branch.
  if (data.doctor !== undefined) {
    await assertDoctor(data.doctor, patient.branch);
  }
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
      // M2: a follow-up appointment cannot be booked without a real doctor in
      // this branch. Prefer the explicitly-supplied doctor; fall back to the
      // plan's creator, which is still verified to be a doctor.
      const followUpDoctor = data.doctor ?? plan.createdBy;
      await assertDoctor(followUpDoctor, patient.branch);
      const apptId = await ensureNextAppointment({
        nextAppointment: data.nextAppointment,
        nextAppointmentNotes: data.nextAppointmentNotes,
        patient: patient._id,
        branch: patient.branch,
        tenant: patient.tenant,
        doctor: followUpDoctor,
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
  // M3: the item's appointment link must belong to this exact patient.
  await assertAppointmentsForPatient(req.validatedBody.appointment, {
    patient: patient._id,
    branch: patient.branch,
  });
  plan.updatedBy = req.user._id;
  await plan.save();
  await plan.populate(POPULATE);
  emitPlan(patient.branch, 'treatment-plan:updated', plan);

  return sendSuccess(res, { plan: req.isImpersonation ? stripPHI(plan.toJSON()) : plan }, 201);
});

export const updateTreatmentItem = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = normalizeItem(req.validatedBody);

  // Fast-fail pre-check (cheap 404s; the authoritative guard re-runs below
  // inside the transaction where the plan is re-read with the session).
  const plan = await loadPlan(patient._id, req.params.planId, { branch: patient.branch });
  if (!plan) {
    throw ApiError.notFound('Treatment plan not found');
  }
  if (!plan.items.id(req.params.itemId)) {
    throw ApiError.notFound('Treatment item not found');
  }

  // M5: an invoiced item is financially frozen — changing its status (e.g. to
  // 'cancelled') after the invoice exists would desync billing from treatment.
  // The plan is re-read INSIDE the transaction (snapshot isolation) so a
  // concurrent generateInvoiceFromPlan either commits first (item.invoice set
  // → 409) or loses, closing the stale-read-overwrite race (H2-style).
  const updatedPlan = await withTransaction(async (session) => {
    const fresh = await TreatmentPlan.findOne({
      _id: req.params.planId,
      patient: patient._id,
      branch: patient.branch,
    }).session(session);
    if (!fresh) {
      throw ApiError.notFound('Treatment plan not found');
    }

    const item = fresh.items.id(req.params.itemId);
    if (!item) {
      throw ApiError.notFound('Treatment item not found');
    }
    if (item.invoice && (data.status !== undefined || data.completedDate !== undefined)) {
      throw ApiError.conflict(
        'Cannot change the status of a treatment item that has already been invoiced',
      );
    }

    // M3: a changed appointment link must belong to this exact patient.
    if (data.appointment !== undefined) {
      await assertAppointmentsForPatient(data.appointment, {
        patient: patient._id,
        branch: patient.branch,
      });
    }

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
    const activeItems = fresh.items.filter((i) => i.status !== 'cancelled');
    if (
      fresh.status === 'active' &&
      activeItems.length > 0 &&
      activeItems.every((i) => i.status === 'completed')
    ) {
      fresh.status = 'completed';
    }

    fresh.updatedBy = req.user._id;
    await fresh.save({ session });
    await fresh.populate(POPULATE);
    return fresh;
  });

  emitPlan(patient.branch, 'treatment-plan:updated', updatedPlan);

  return sendSuccess(res, { plan: req.isImpersonation ? stripPHI(updatedPlan.toJSON()) : updatedPlan });
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

  // result.plan is the plan re-read (and saved) inside the transaction — emit
  // that instead of the stale pre-transaction document.
  emitPlan(patient.branch, 'treatment-plan:updated', result.plan);

  const data = req.isImpersonation
    ? {
        invoice: stripPHI(result.invoice.toJSON ? result.invoice.toJSON() : result.invoice),
        plan: stripPHI(result.plan.toJSON ? result.plan.toJSON() : result.plan),
        deductions: result.deductions,
      }
    : result;

  return sendSuccess(res, data, 201);
});
