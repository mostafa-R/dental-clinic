import mongoose from 'mongoose';

import ApiError from './ApiError.js';
import Patient from '../models/Patient.js';

function toObjectId(value) {
  if (value && typeof value === 'object' && value._id) value = value._id;
  if (mongoose.isValidObjectId(value)) return new mongoose.Types.ObjectId(String(value));
  return value;
}

export { toObjectId };

/**
 * Build a mongoose filter object scoped to the authenticated user's branch
 * and tenant.
 *
 * - site_admin WITH a tenant (platform admin): restricted to their own
 *   tenant's data, optionally narrowed to a single ?branch= query. This is the
 *   key tenant-isolation guard: a site admin can never see another clinic's
 *   records even though they hold the site_admin role.
 * - site_admin WITHOUT a tenant (the platform/seeder admin): no restriction,
 *   may optionally narrow with ?branch=.
 * - clinic_admin/other roles: restricted to their own branch.
 *
 * The branch/tenant values are normalized to ObjectIds so the result is safe
 * to use in both query helpers (find/countDocuments) and aggregation
 * pipelines ($match).
 */
export function filterByBranch(req) {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  const isSystemAdmin = req._roleResolved?.isSystemAdmin ?? ['site_admin', 'clinic_admin', 'super_admin'].includes(req.user.role);
  if (isSystemAdmin) {
    const filter = {};
    // Tenant isolation: clinic admins only see their own tenant's data.
    if (req.user.tenant) {
      filter.tenant = toObjectId(req.user.tenant);
    }
    const branch = req.query.branch;
    if (branch) filter.branch = toObjectId(branch);
    return filter;
  }

  if (!req.user.branch) {
    throw ApiError.forbidden('Your account is not assigned to a branch');
  }

  return { branch: toObjectId(req.user.branch) };
}

/**
 * Resolve the tenant to stamp on a new record.
 * - Platform/seeder admin (tenant: null): returns null so records stay unscoped.
 * - Clinic admin / staff: returns their tenant ObjectId.
 */
export function currentTenant(req) {
  if (!req.user) return null;
  if (req.user.tenant) return toObjectId(req.user.tenant);
  return null;
}

/**
 * Resolve the branch to assign when creating a record.
 * - site_admin/clinic_admin: must provide a branch (via body); otherwise bad request.
 * - other roles: forced to their own branch regardless of input.
 *
 * When the caller belongs to a tenant, the requested branch is verified to
 * belong to that tenant to prevent cross-tenant data injection.
 */
export async function resolveBranchForCreate(req, bodyBranch) {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  let branchId;

  const isSystemAdmin = req._roleResolved?.isSystemAdmin ?? ['site_admin', 'clinic_admin', 'super_admin'].includes(req.user.role);
  if (isSystemAdmin) {
    if (!bodyBranch) {
      throw ApiError.badRequest('branch is required', { branch: 'branch is required' });
    }
    branchId = toObjectId(bodyBranch);
  } else {
    if (!req.user.branch) {
      throw ApiError.forbidden('Your account is not assigned to a branch');
    }
    branchId = toObjectId(req.user.branch);
  }

  // Tenant isolation: when the caller has a tenant, the target branch must
  // belong to the same tenant.
  if (req.user.tenant) {
    const Branch = (await import('../models/Branch.js')).default;
    const branch = await Branch.findOne({ _id: branchId, tenant: toObjectId(req.user.tenant) }).lean();
    if (!branch) {
      throw ApiError.badRequest('The selected branch does not belong to your clinic', { branch: 'not found' });
    }
  }

  return branchId;
}

/**
 * Load a patient scoped to the authenticated user's branch. Used by nested
 * routes (e.g. /patients/:patientId/...) to guarantee the patient belongs to
 * the caller's branch before operating on EMR data attached to them.
 * Throws 404 when the patient does not exist in scope.
 */
export async function loadScopedPatient(req, patientId, select = 'patientId firstName lastName phone branch tenant') {
  if (!mongoose.isValidObjectId(patientId)) {
    throw ApiError.badRequest('Invalid patient id');
  }
  const patient = await Patient.findOne({ _id: toObjectId(patientId), ...filterByBranch(req) }).select(
    select,
  );
  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }
  return patient;
}
