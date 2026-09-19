import Recall, {
  ACTIVE_RECALL_STATUSES,
  buildDedupeKey,
  canTransitionRecall,
} from './recall.model.js';
import Appointment from '../appointments/appointment.model.js';
import Patient from '../patients/patient.model.js';
import User from '../users/user.model.js';
import Branch from '../users/branch.model.js';
import ApiError from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { toObjectId } from '../../utils/branchScope.js';

const PATIENT_SELECT = 'patientId firstName lastName phone branch tenant';
const TERMINAL_STATUSES = ['completed', 'dismissed'];
const LINKABLE_APPOINTMENT_STATUSES = ['scheduled', 'confirmed', 'checked_in', 'in_progress'];

function sameId(a, b) {
  return a && b && String(a) === String(b);
}

async function assertPatientInScope(patientId, tenant, branch) {
  const patient = await Patient.findOne({ _id: toObjectId(patientId), tenant: toObjectId(tenant) })
    .select('_id branch tenant')
    .lean();
  if (!patient) throw ApiError.notFound('Patient not found');
  if (branch && !sameId(patient.branch, branch)) {
    throw ApiError.badRequest('Patient does not belong to this branch');
  }
  return patient;
}

async function assertBranchInTenant(branch, tenant) {
  const doc = await Branch.findOne({ _id: toObjectId(branch), tenant: toObjectId(tenant) })
    .select('_id')
    .lean();
  if (!doc) throw ApiError.badRequest('Branch does not belong to this tenant');
  return doc;
}

async function assertAssigneeInTenant(assignedTo, tenant) {
  if (!assignedTo) return null;
  const user = await User.findOne({ _id: toObjectId(assignedTo), tenant: toObjectId(tenant) })
    .select('_id')
    .lean();
  if (!user) throw ApiError.badRequest('Assigned user does not belong to this tenant');
  return user._id;
}

function assertDueDate(dueDate) {
  const d = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest('Invalid dueDate');
  return d;
}

/**
 * Find one recall by id within the tenant (+branch when given).
 * Cross-scope ids return 404 (never 403) to prevent enumeration — the same
 * convention as the tenant-isolation guards elsewhere.
 */
export async function findScopedRecall({ tenant, branch, id }) {
  if (!id) throw ApiError.badRequest('Invalid recall id');
  let oid;
  try {
    oid = toObjectId(id);
  } catch {
    throw ApiError.badRequest('Invalid recall id');
  }
  const filter = { _id: oid, tenant: toObjectId(tenant) };
  if (branch) filter.branch = toObjectId(branch);
  const recall = await Recall.findOne(filter).populate('patient', PATIENT_SELECT);
  if (!recall) throw ApiError.notFound('Recall not found');
  return recall;
}

function toDuplicateConflict() {
  return ApiError.conflict('An active recall already exists for this patient, type and source');
}

export async function createRecall(input) {
  const {
    tenant, branch, patient, sourceAppointment, sourceTreatmentPlan, sourceEventId,
    recallType, reason, dueDate, priority, assignedTo, notes, createdBy,
  } = input || {};
  if (!tenant) throw ApiError.badRequest('tenant is required');
  if (!branch) throw ApiError.badRequest('branch is required');
  if (!patient) throw ApiError.badRequest('patient is required');

  await assertBranchInTenant(branch, tenant);
  await assertPatientInScope(patient, tenant, branch);
  const assigneeId = assignedTo ? await assertAssigneeInTenant(assignedTo, tenant) : null;
  const due = assertDueDate(dueDate);

  const dedupeKey = buildDedupeKey({
    recallType, sourceAppointment, sourceTreatmentPlan, dueDate: due,
  });
  const existing = await Recall.findOne({
    tenant: toObjectId(tenant),
    patient: toObjectId(patient),
    dedupeKey,
    status: { $in: ACTIVE_RECALL_STATUSES },
  }).select('_id');
  if (existing) throw toDuplicateConflict();

  try {
    const recall = await Recall.create({
      tenant: toObjectId(tenant),
      branch: toObjectId(branch),
      patient: toObjectId(patient),
      sourceAppointment: sourceAppointment ? toObjectId(sourceAppointment) : null,
      sourceTreatmentPlan: sourceTreatmentPlan ? toObjectId(sourceTreatmentPlan) : null,
      sourceEventId: sourceEventId || null,
      recallType: recallType || 'follow_up',
      reason: reason || '',
      dueDate: due,
      priority: priority || 'normal',
      assignedTo: assigneeId,
      notes: notes || '',
      createdBy: createdBy ? toObjectId(createdBy) : null,
      updatedBy: createdBy ? toObjectId(createdBy) : null,
    });
    return { recall, created: true };
  } catch (err) {
    // Race backstop: a concurrent create won the unique partial index.
    if (err && err.code === 11000) throw toDuplicateConflict();
    throw err;
  }
}

/**
 * Idempotent create: returns the existing active recall when the
 * tenant+patient+type+source+due-day already has one (including when a
 * concurrent insert wins the race).
 */
export async function createRecallIfMissing(input) {
  const {
    tenant, patient, recallType, sourceAppointment, sourceTreatmentPlan, dueDate,
  } = input || {};
  if (tenant && patient) {
    const due = dueDate ? new Date(dueDate) : null;
    const dedupeKey = buildDedupeKey({ recallType, sourceAppointment, sourceTreatmentPlan, dueDate: due });
    const existing = await Recall.findOne({
      tenant: toObjectId(tenant),
      patient: toObjectId(patient),
      dedupeKey,
      status: { $in: ACTIVE_RECALL_STATUSES },
    });
    if (existing) return { recall: existing, created: false };
  }
  try {
    return await createRecall(input);
  } catch (err) {
    if (err && err.statusCode === 409) {
      const retry = await Recall.findOne({
        tenant: toObjectId(tenant),
        patient: toObjectId(patient),
        dedupeKey: buildDedupeKey({
          recallType,
          sourceAppointment,
          sourceTreatmentPlan,
          dueDate: dueDate ? new Date(dueDate) : null,
        }),
        status: { $in: ACTIVE_RECALL_STATUSES },
      });
      if (retry) return { recall: retry, created: false };
    }
    throw err;
  }
}

async function resolvePatientIds(tenant, search) {
  const term = String(search || '').trim();
  if (!term) return null;
  const regex = new RegExp(escapeRegex(term), 'i');
  const patients = await Patient.find({
    tenant: toObjectId(tenant),
    $or: [{ patientId: regex }, { firstName: regex }, { lastName: regex }, { phone: regex }],
  }).select('_id').limit(200).lean();
  return patients.map((p) => p._id);
}

export async function listRecalls({
  tenant, branch, status, recallType, assignedTo, dueFrom, dueTo, patient,
  page = 1, limit = 50,
}) {
  if (!tenant) throw ApiError.badRequest('tenant is required');
  const filter = { tenant: toObjectId(tenant) };
  if (branch) filter.branch = toObjectId(branch);
  if (status) filter.status = status;
  if (recallType) filter.recallType = recallType;
  if (assignedTo) filter.assignedTo = toObjectId(assignedTo);
  if (dueFrom || dueTo) {
    filter.dueDate = {};
    if (dueFrom) filter.dueDate.$gte = new Date(dueFrom);
    if (dueTo) filter.dueDate.$lte = new Date(dueTo);
  }
  if (patient) {
    let patientIds = null;
    try {
      patientIds = [toObjectId(patient)];
    } catch {
      patientIds = await resolvePatientIds(tenant, patient);
    }
    filter.patient = { $in: patientIds || [] };
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const [items, total] = await Promise.all([
    Recall.find(filter)
      .populate('patient', PATIENT_SELECT)
      .sort({ dueDate: 1, createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Recall.countDocuments(filter),
  ]);
  return { items, total, page: safePage, limit: safeLimit };
}

/** Due-work queue for the cron: actionable recalls whose date has come. */
export async function listDueRecalls({ tenant, now = new Date(), limit = 200 } = {}) {
  const filter = {
    status: { $in: ['due', 'contacted'] },
    dueDate: { $lte: now instanceof Date ? now : new Date(now) },
  };
  if (tenant) filter.tenant = toObjectId(tenant);
  return Recall.find(filter).sort({ dueDate: 1 }).limit(Math.min(1000, limit)).lean();
}

async function applyTransition(recall, to, actorId, extra = {}) {
  if (!canTransitionRecall(recall.status, to)) {
    throw ApiError.conflict(`Cannot transition recall from ${recall.status} to ${to}`);
  }
  recall.status = to;
  Object.assign(recall, extra);
  if (actorId) recall.updatedBy = toObjectId(actorId);
  await recall.save();
  return recall;
}

export async function updateRecall({ tenant, branch, id, patch = {}, actorId }) {
  const recall = await findScopedRecall({ tenant, branch, id });
  if (TERMINAL_STATUSES.includes(recall.status)) {
    throw ApiError.conflict(`Cannot modify a ${recall.status} recall`);
  }
  if (patch.status !== undefined) {
    throw ApiError.badRequest('Use the transition endpoints to change status');
  }
  const allowed = ['reason', 'priority', 'notes', 'outcome'];
  for (const key of allowed) {
    if (patch[key] !== undefined) recall[key] = patch[key];
  }
  if (patch.assignedTo !== undefined) {
    recall.assignedTo = patch.assignedTo
      ? await assertAssigneeInTenant(patch.assignedTo, tenant)
      : null;
  }
  if (patch.dueDate !== undefined) {
    recall.dueDate = assertDueDate(patch.dueDate);
    recall.dedupeKey = buildDedupeKey({
      recallType: recall.recallType,
      sourceAppointment: recall.sourceAppointment,
      sourceTreatmentPlan: recall.sourceTreatmentPlan,
      dueDate: recall.dueDate,
    });
  }
  if (actorId) recall.updatedBy = toObjectId(actorId);
  try {
    await recall.save();
  } catch (err) {
    if (err && err.code === 11000) throw toDuplicateConflict();
    throw err;
  }
  return recall;
}

export async function markContacted({ tenant, branch, id, actorId, notes }) {
  const recall = await findScopedRecall({ tenant, branch, id });
  if (TERMINAL_STATUSES.includes(recall.status)) {
    throw ApiError.conflict(`Cannot contact a ${recall.status} recall`);
  }
  recall.contactAttempts = (recall.contactAttempts || 0) + 1;
  recall.lastContactedAt = new Date();
  if (notes !== undefined) recall.notes = notes;
  if (recall.status === 'due') recall.status = 'contacted';
  if (actorId) recall.updatedBy = toObjectId(actorId);
  await recall.save();
  return recall;
}

export async function postponeRecall({ tenant, branch, id, postponedUntil, actorId, notes }) {
  const recall = await findScopedRecall({ tenant, branch, id });
  const until = postponedUntil instanceof Date ? postponedUntil : new Date(postponedUntil);
  if (Number.isNaN(until.getTime())) throw ApiError.badRequest('Invalid postponedUntil');
  if (until.getTime() <= Date.now()) throw ApiError.badRequest('postponedUntil must be in the future');
  if (notes !== undefined) recall.notes = notes;
  return applyTransition(recall, 'postponed', actorId, { postponedUntil: until });
}

export async function scheduleRecall({ tenant, branch, id, appointmentId, actorId }) {
  const recall = await findScopedRecall({ tenant, branch, id });
  let appointmentOid;
  try {
    appointmentOid = toObjectId(appointmentId);
  } catch {
    throw ApiError.badRequest('Invalid appointment id');
  }
  const appointment = await Appointment.findOne({
    _id: appointmentOid,
    tenant: toObjectId(tenant),
    patient: recall.patient,
  }).select('_id branch status patient').lean();
  if (!appointment) throw ApiError.notFound('Appointment not found for this patient');
  if (!sameId(appointment.branch, recall.branch)) {
    throw ApiError.badRequest('Appointment does not belong to the recall branch');
  }
  if (!LINKABLE_APPOINTMENT_STATUSES.includes(appointment.status)) {
    throw ApiError.badRequest(`Cannot link a ${appointment.status} appointment`);
  }
  return applyTransition(recall, 'scheduled', actorId, { scheduledAppointment: appointment._id });
}

export async function completeRecall({ tenant, branch, id, actorId, outcome }) {
  const recall = await findScopedRecall({ tenant, branch, id });
  return applyTransition(recall, 'completed', actorId, outcome !== undefined ? { outcome } : {});
}

export async function dismissRecall({ tenant, branch, id, actorId, outcome }) {
  const recall = await findScopedRecall({ tenant, branch, id });
  return applyTransition(recall, 'dismissed', actorId, outcome !== undefined ? { outcome } : {});
}
