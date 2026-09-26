import mongoose from 'mongoose';

import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import {
  currentTenant,
  filterByBranch,
  resolveBranchForCreate,
  toObjectId,
} from '../../utils/branchScope.js';
import { auditTenantAction } from '../../middleware/audit.js';
import { stripPHI } from '../../middleware/phiRestrict.js';
import {
  completeRecall,
  createRecall,
  dismissRecall,
  findScopedRecall,
  listRecalls,
  markContacted,
  postponeRecall,
  scheduleRecall,
  updateRecall,
} from './recall.service.js';

function requireTenant(req) {
  const tenant = currentTenant(req) || toObjectId(req.body?.tenant);
  if (!tenant) throw ApiError.badRequest('Recall routes require a tenant');
  return tenant;
}

/**
 * Recall rows carry patient names, phone numbers and free-text staff notes, and
 * every recall route applies `phiRestrict`. These handlers used to ignore
 * `req.isImpersonation` entirely, so a support admin holding an impersonation
 * token read all of it in the clear — the `phiRestrict` middleware on the routes
 * was inert. Mask whenever the request is an impersonation session.
 */
function serialize(recall, req) {
  if (!req.isImpersonation) return recall;
  return stripPHI(
    recall && typeof recall.toJSON === 'function' ? recall.toJSON() : recall,
  );
}

/** Same masking, for the paginated list payload (`{ items, total, page, limit }`). */
function serializeList(data, req) {
  if (!req.isImpersonation) return data;
  return {
    ...data,
    items: (data?.items || []).map((r) =>
      stripPHI(r && typeof r.toJSON === 'function' ? r.toJSON() : r),
    ),
  };
}

function auditTarget(recall, extra = {}) {
  return {
    type: 'recall',
    id: String(recall._id),
    patient: recall.patient ? String(recall.patient._id || recall.patient) : undefined,
    status: recall.status,
    ...extra,
  };
}

export const listRecallHandler = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const scope = filterByBranch(req);
  const data = await listRecalls({ tenant, ...scope, ...req.validatedQuery });
  return sendSuccess(res, serializeList(data, req));
});

export const getRecallHandler = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const scope = filterByBranch(req);
  const recall = await findScopedRecall({ tenant, ...scope, id: req.params.id });
  return sendSuccess(res, { recall: serialize(recall, req) });
});

export const createRecallHandler = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const branch = await resolveBranchForCreate(req, req.validatedBody.branch);
  // NB: resolved tenant/branch spread LAST so a body-supplied branch can never
  // override the enforced scope (non-admin staff are pinned to their branch).
  const { recall } = await createRecall({
    ...req.validatedBody,
    tenant,
    branch,
    createdBy: req.user._id,
  });
  await recall.populate('patient', 'patientId firstName lastName phone branch tenant');
  await auditTenantAction(req, 'recall.create', auditTarget(recall), {
    recallType: recall.recallType,
    dueDate: recall.dueDate,
  });
  return sendSuccess(res, { recall: serialize(recall, req) }, 201);
});

export const updateRecallHandler = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const scope = filterByBranch(req);
  const recall = await updateRecall({
    tenant, ...scope, id: req.params.id, patch: req.validatedBody, actorId: req.user._id,
  });
  await auditTenantAction(req, 'recall.update', auditTarget(recall));
  return sendSuccess(res, { recall: serialize(recall, req) });
});

export const contactRecallHandler = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const scope = filterByBranch(req);
  const recall = await markContacted({
    tenant, ...scope, id: req.params.id, actorId: req.user._id, notes: req.validatedBody.notes,
  });
  await auditTenantAction(req, 'recall.contacted', auditTarget(recall), {
    contactAttempts: recall.contactAttempts,
  });
  return sendSuccess(res, { recall: serialize(recall, req) });
});

export const postponeRecallHandler = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const scope = filterByBranch(req);
  const recall = await postponeRecall({
    tenant, ...scope, id: req.params.id, actorId: req.user._id, ...req.validatedBody,
  });
  await auditTenantAction(req, 'recall.postpone', auditTarget(recall), {
    postponedUntil: recall.postponedUntil,
  });
  return sendSuccess(res, { recall: serialize(recall, req) });
});

export const scheduleRecallHandler = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const scope = filterByBranch(req);
  const recall = await scheduleRecall({
    tenant, ...scope, id: req.params.id, actorId: req.user._id, ...req.validatedBody,
  });
  await auditTenantAction(req, 'recall.schedule', auditTarget(recall), {
    appointment: String(recall.scheduledAppointment),
  });
  return sendSuccess(res, { recall: serialize(recall, req) });
});

export const completeRecallHandler = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const scope = filterByBranch(req);
  const recall = await completeRecall({
    tenant, ...scope, id: req.params.id, actorId: req.user._id, ...req.validatedBody,
  });
  await auditTenantAction(req, 'recall.complete', auditTarget(recall));
  return sendSuccess(res, { recall: serialize(recall, req) });
});

export const dismissRecallHandler = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const scope = filterByBranch(req);
  const recall = await dismissRecall({
    tenant, ...scope, id: req.params.id, actorId: req.user._id, ...req.validatedBody,
  });
  await auditTenantAction(req, 'recall.dismiss', auditTarget(recall));
  return sendSuccess(res, { recall: serialize(recall, req) });
});

export default {
  listRecallHandler,
  getRecallHandler,
  createRecallHandler,
  updateRecallHandler,
  contactRecallHandler,
  postponeRecallHandler,
  scheduleRecallHandler,
  completeRecallHandler,
  dismissRecallHandler,
};
