import mongoose from 'mongoose';

import Patient from './patient.model.js';
import Wallet from './wallet.model.js';
import InstallmentPlan from './installment.model.js';
import Branch from '../users/branch.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import Appointment from '../appointments/appointment.model.js';
import Invoice from '../billing/invoice.model.js';
import Commission from '../billing/commission.model.js';
import OwnerDrawing from '../accounting/ownerDrawing.model.js';
import TreatmentPlan from '../emr/treatmentPlan.model.js';
import Prescription from '../emr/prescription.model.js';
import DentalChart from '../emr/dentalChart.model.js';
import MedicalAttachment from '../emr/attachment.model.js';
import ClinicalNote from '../emr/clinicalNote.model.js';
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

  // PRD §6.3: a phone number is unique per Tenant+Branch.
  if (payload.phone && String(payload.phone).trim()) {
    const duplicate = await Patient.findOne({
      tenant,
      branch,
      phone: String(payload.phone).trim(),
    }).select('_id').lean();
    if (duplicate) {
      throw ApiError.conflict('A patient with this phone number already exists in this branch', {
        phone: 'already registered',
        existingPatient: duplicate._id,
      });
    }
  }

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

  // PRD §6.3: a phone number is unique per Tenant+Branch.
  if (payload.phone && String(payload.phone).trim()) {
    const targetBranch = payload.branch || existing.branch;
    const duplicate = await Patient.findOne({
      _id: { $ne: existing._id },
      tenant: existing.tenant,
      branch: targetBranch,
      phone: String(payload.phone).trim(),
    }).select('_id').lean();
    if (duplicate) {
      throw ApiError.conflict('A patient with this phone number already exists in this branch', {
        phone: 'already registered',
        existingPatient: duplicate._id,
      });
    }
  }

  const patient = await Patient.findOneAndUpdate(
    { _id: id, ...branchFilter },
    { $set: payload },
    { returnDocument: "after", runValidators: true },
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
    { returnDocument: "after" },
  );

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  emitToBranch(String(patient.branch), 'patient:archived', { _id: patient._id });
  return sendSuccess(res, { message: 'Patient archived' });
});

/**
 * GET /patients/duplicates
 * PRD §6.3: surface suspected duplicate records so staff can merge them.
 * Signals: identical phone within the same tenant+branch, and identical
 * name (case-insensitive) + date of birth. Only active patients count.
 */
export const findDuplicatePatients = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const baseMatch = { ...branchFilter, isActive: true };

  const patientProjection = {
    _id: '$_id',
    patientId: '$patientId',
    firstName: '$firstName',
    lastName: '$lastName',
    phone: '$phone',
    branch: '$branch',
    createdAt: '$createdAt',
  };
  const groupStages = [
    {
      $match: { ...baseMatch, phone: { $type: 'string', $gt: '' } },
    },
    {
      $group: {
        _id: { tenant: '$tenant', branch: '$branch', phone: '$phone' },
        patients: { $push: patientProjection },
      },
    },
    { $addFields: { count: { $size: '$patients' } } },
    { $match: { count: { $gt: 1 } } },
    {
      $project: {
        _id: 0,
        matchedOn: { $literal: 'phone' },
        key: '$_id.phone',
        patients: 1,
        count: 1,
      },
    },
  ];
  const nameDobGroupStages = [
    {
      $match: { ...baseMatch, dateOfBirth: { $type: 'date' }, firstName: { $nin: [null, ''] } },
    },
    {
      $group: {
        _id: {
          tenant: '$tenant',
          branch: '$branch',
          firstName: { $toLower: { $trim: { input: '$firstName' } } },
          lastName: { $toLower: { $trim: { input: '$lastName' } } },
          dateOfBirth: {
            $dateToString: { format: '%Y-%m-%d', date: '$dateOfBirth' },
          },
        },
        patients: { $push: patientProjection },
      },
    },
    { $addFields: { count: { $size: '$patients' } } },
    { $match: { count: { $gt: 1 } } },
    {
      $project: {
        _id: 0,
        matchedOn: { $literal: 'name+dob' },
        key: {
          $concat: ['$_id.firstName', ' ', '$_id.lastName', ' ', '$_id.dateOfBirth'],
        },
        patients: 1,
        count: 1,
      },
    },
  ];

  const [phoneGroups, nameDobGroups] = await Promise.all([
    Patient.aggregate(groupStages),
    Patient.aggregate(nameDobGroupStages),
  ]);

  const groups = [...phoneGroups, ...nameDobGroups].sort((a, b) => b.count - a.count);
  return sendSuccess(res, { groups, total: groups.length });
});

/**
 * POST /patients/:id/merge
 * PRD §6.3: merge a duplicate record into the surviving record. All clinical
 * and financial references are repointed inside a single transaction, wallet
 * balances are combined, and the duplicate is archived with `mergedInto`
 * pointing at the survivor.
 */
export const mergePatients = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const targetId = req.validatedBody?.duplicateOf;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(targetId)) {
    throw ApiError.badRequest('Invalid patient id');
  }
  if (String(id) === String(targetId)) {
    throw ApiError.badRequest('A patient cannot be merged into itself', {
      duplicateOf: 'must differ from the merged patient',
    });
  }

  const branchFilter = filterByBranch(req);
  const [source, target] = await Promise.all([
    Patient.findOne({ _id: id, ...branchFilter }),
    Patient.findOne({ _id: toObjectId(targetId), ...branchFilter }),
  ]);
  if (!source || !target) {
    throw ApiError.notFound('Patient not found');
  }
  if (!source.isActive || !target.isActive) {
    throw ApiError.badRequest('Both records must be active to merge');
  }
  // Merges stay within one branch (and one tenant): phone uniqueness and
  // numbering are scoped per branch, so cross-branch merges would break them.
  if (String(source.branch) !== String(target.branch)) {
    throw ApiError.badRequest('Records must belong to the same branch to merge', {
      duplicateOf: 'branch mismatch',
    });
  }
  const sourceTenant = source.tenant ? String(source.tenant) : '';
  const targetTenant = target.tenant ? String(target.tenant) : '';
  if (sourceTenant !== targetTenant) {
    throw ApiError.badRequest('Records must belong to the same clinic to merge', {
      duplicateOf: 'tenant mismatch',
    });
  }

  await withTransaction(async (session) => {
    // 1. Repoint every clinical/financial reference to the surviving record.
    const refModels = [
      Appointment,
      Invoice,
      Commission,
      OwnerDrawing,
      InstallmentPlan,
      TreatmentPlan,
      Prescription,
      MedicalAttachment,
      ClinicalNote,
    ];
    for (const Model of refModels) {
      await Model.updateMany({ patient: source._id }, { $set: { patient: target._id } }, { session });
    }

    // 2. Dental chart: unique per (branch, patient). Move it only if the
    // survivor has none; otherwise fold the history in and drop the duplicate.
    const sourceChart = await DentalChart.findOne({ patient: source._id }).session(session);
    if (sourceChart) {
      const targetChart = await DentalChart.findOne({ patient: target._id }).session(session);
      if (!targetChart) {
        sourceChart.patient = target._id;
        await sourceChart.save({ session });
      } else {
        targetChart.history.push(...sourceChart.history);
        if (!targetChart.notes && sourceChart.notes) targetChart.notes = sourceChart.notes;
        await targetChart.save({ session });
        await sourceChart.deleteOne({ session });
      }
    }

    // 3. Wallet: unique per (patient, branch). Combine balances + ledger.
    const sourceWallet = await Wallet.findOne({ patient: source._id }).session(session);
    if (sourceWallet) {
      const targetWallet = await Wallet.findOne({ patient: target._id }).session(session);
      if (!targetWallet) {
        sourceWallet.patient = target._id;
        await sourceWallet.save({ session });
      } else {
        for (const tx of sourceWallet.transactions) {
          targetWallet.transactions.push({
            ...tx.toObject(),
            description: `[merged] ${tx.description || ''}`.trim(),
          });
        }
        targetWallet.balance += sourceWallet.balance;
        await targetWallet.save({ session });
        await sourceWallet.deleteOne({ session });
      }
    }

    // 4. Archive the duplicate with an audit pointer to the survivor.
    source.isActive = false;
    source.mergedInto = target._id;
    await source.save({ session });
  });

  emitToBranch(String(target.branch), 'patient:merged', {
    mergedId: source._id,
    survivorId: target._id,
  });

  return sendSuccess(res, {
    message: 'Patients merged',
    mergedId: source._id,
    survivorId: target._id,
  });
});
