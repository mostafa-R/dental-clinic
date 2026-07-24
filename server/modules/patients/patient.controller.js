import mongoose from 'mongoose';

import Patient from './patient.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
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

  // Plan limit: enforce maxPatients
  if (tenant) {
    const tenantDoc = await Tenant.findById(tenant).select('settings');
    const patientCount = await Patient.countDocuments({ tenant });
    const maxPatients = tenantDoc?.settings?.maxPatients ?? 999999;
    if (patientCount >= maxPatients) {
      throw ApiError.conflict(
        `Your plan allows a maximum of ${maxPatients} patients. Upgrade your plan to add more.`,
      );
    }
  }

  const patient = await Patient.create({ ...payload, branch, tenant });
  await patient.populate('branch', 'name');

  emitToBranch(String(branch), 'patient:created', { patient });
  return sendSuccess(res, { patient }, 201);
});

export const updatePatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid patient id');
  }

  const branchFilter = filterByBranch(req);
  const payload = normalizePayload(req.validatedBody);

  // Only system admin may reassign a patient to another branch.
  const canReassignBranch = req._roleResolved?.isSystemAdmin;
  if (!canReassignBranch) {
    delete payload.branch;
  } else if (payload.branch) {
    payload.branch = toObjectId(payload.branch);
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
  return sendSuccess(res, { patient });
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
