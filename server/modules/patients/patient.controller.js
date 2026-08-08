import mongoose from 'mongoose';

import Patient from './patient.model.js';
import Branch from '../users/branch.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import Counter from '../../core/counters.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { withTransaction } from '../../core/transaction.js';
import { currentTenant, filterByBranch, resolveBranchForCreate, toObjectId } from '../../utils/branchScope.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { stripPHI } from '../../middleware/phiRestrict.js';
import { emitToBranch } from '../../socket/index.js';

function buildSearchFilter(search) {
  if (!search?.trim()) return null;
  const term = escapeRegex(search.trim());
  const regex = new RegExp(term, 'i');
  return {
    $or: [
      { patientId: regex },
      { firstName: regex },
      { lastName: regex },
      { phone: regex },
      { email: regex },
    ],
  };
}

function normalizePayload(data) {
  const payload = { ...data };
  if (payload.dateOfBirth === '') {
    payload.dateOfBirth = null;
  } else if (payload.dateOfBirth) {
    payload.dateOfBirth = new Date(payload.dateOfBirth);
    if (Number.isNaN(payload.dateOfBirth.getTime())) {
      throw ApiError.badRequest('Invalid date of birth');
    }
  }
  return payload;
}

/**
 * Validate a target branch before reassigning a patient to it.
 * The branch must exist and belong to the patient's own tenant, so a patient
 * can never be moved into another clinic's branch (cross-tenant PHI leak).
 * Returns the branch as an ObjectId.
 */
async function resolveBranchForReassign(branchId, patientTenant) {
  const targetBranch = await Branch.findById(toObjectId(branchId)).select('_id tenant').lean();
  if (!targetBranch) {
    throw ApiError.badRequest('The selected branch does not exist', { branch: 'not found' });
  }

  const patientTenantStr = patientTenant ? String(patientTenant) : '';
  const branchTenantStr = targetBranch.tenant ? String(targetBranch.tenant) : '';

  // Tenant isolation: a tenant-scoped patient must only move within that tenant.
  if (patientTenantStr && branchTenantStr !== patientTenantStr) {
    throw ApiError.badRequest('The selected branch does not belong to this clinic', {
      branch: 'tenant mismatch',
    });
  }

  return toObjectId(targetBranch._id);
}

export const listPatients = asyncHandler(async (req, res) => {
  const { search, page, limit, isActive } = req.validatedQuery;

  const filter = { ...filterByBranch(req) };
  const searchFilter = buildSearchFilter(search);
  if (searchFilter) Object.assign(filter, searchFilter);
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const skip = (page - 1) * limit;
  const [patients, total] = await Promise.all([
    Patient.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('branch', 'name'),
    Patient.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    patients: req.isImpersonation ? patients.map((p) => stripPHI(p.toJSON())) : patients,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getPatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid patient id');
  }

  const branchFilter = filterByBranch(req);
  const patient = await Patient.findOne({ _id: id, ...branchFilter }).populate('branch', 'name');
  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  const data = req.isImpersonation ? stripPHI(patient.toJSON()) : patient;
  return sendSuccess(res, { patient: data });
});

export const createPatient = asyncHandler(async (req, res) => {
  const branch = await resolveBranchForCreate(req, req.validatedBody.branch);
  const tenant = currentTenant(req);
  const payload = normalizePayload(req.validatedBody);
  delete payload.branch;

  let maxPatients = 999999;
  if (tenant) {
    const tenantDoc = await Tenant.findById(tenant).select('settings');
    maxPatients = tenantDoc?.settings?.maxPatients ?? 999999;
  }

  // Plan limit: enforce maxPatients atomically. The slot claim ($inc on the
  // per-tenant counter) and the patient insert run inside a single MongoDB
  // transaction, so a crash between them — or any create failure — rolls the
  // counter back instead of leaking the slot (ISSUE-005).
  const patient = await withTransaction(async (session) => {
    if (tenant) {
      const slotDoc = await Counter.findOneAndUpdate(
        { _id: `patient_slots:${String(tenant)}` },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, session },
      );
      const used = slotDoc?.seq ?? 1;
      if (used > maxPatients) {
        // Aborting the transaction rolls back the $inc, so the slot is released.
        throw ApiError.conflict(
          `Your plan allows a maximum of ${maxPatients} patients. Upgrade your plan to add more.`,
        );
      }
    }

    const [created] = await Patient.create([{ ...payload, branch, tenant }], { session });
    await created.populate('branch', 'name');
    return created;
  });

  emitToBranch(String(branch), 'patient:created', { patient });
  return sendSuccess(
    res,
    { patient: req.isImpersonation ? stripPHI(patient.toJSON()) : patient },
    201,
  );
});

export const updatePatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid patient id');
  }

  const branchFilter = filterByBranch(req);
  const payload = normalizePayload(req.validatedBody);

  const existing = await Patient.findOne({ _id: id, ...branchFilter }).select('_id tenant branch');
  if (!existing) {
    throw ApiError.notFound('Patient not found');
  }

  // Only system admin may reassign a patient to another branch, and the
  // target branch must belong to the patient's own tenant.
  const canReassignBranch = req._roleResolved?.isSystemAdmin;
  if (!canReassignBranch) {
    delete payload.branch;
  } else if (payload.branch) {
    payload.branch = await resolveBranchForReassign(payload.branch, existing.tenant);
  }

  const patient = await Patient.findOneAndUpdate(
    { _id: id, ...branchFilter },
    { $set: payload },
    { new: true, runValidators: true },
  ).populate('branch', 'name');

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  emitToBranch(String(patient.branch?._id ?? patient.branch), 'patient:updated', { patient });
  return sendSuccess(res, { patient: req.isImpersonation ? stripPHI(patient.toJSON()) : patient });
});

export const archivePatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid patient id');
  }

  const branchFilter = filterByBranch(req);
  const patient = await Patient.findOneAndUpdate(
    { _id: id, ...branchFilter },
    { isActive: false },
    { new: true },
  );

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  emitToBranch(String(patient.branch), 'patient:archived', { _id: patient._id });
  return sendSuccess(res, { message: 'Patient archived' });
});
