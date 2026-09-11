import ApiError from "../../../utils/ApiError.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";
import AuditLog from "./auditLog.model.js";

export const getAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, action, adminId, targetType, targetId, startDate, endDate } = req.validatedQuery;
  const filter = {};

  if (action) filter.action = action;
  if (targetType) filter['target.type'] = targetType;
  if (targetId) filter['target.id'] = targetId;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  // H2: audit scoping. Only super_admin may inspect every actor's trail.
  // admin/support can only see their own actions (or those explicitly asked
  // for when they are the subject), never another admin's — and never
  // platform-wide tenant PII they have no right to read.
  const isSuperAdmin = req.siteAdmin?.role === 'super_admin';
  if (!isSuperAdmin) {
    const selfId = String(req.siteAdmin._id);
    if (adminId && String(adminId) !== selfId) {
      throw ApiError.forbidden('You can only view your own audit trail');
    }
    filter.admin = req.siteAdmin._id;
  } else if (adminId) {
    filter.admin = adminId;
  }

  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('admin', 'name email role')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    logs,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getAuditActions = asyncHandler(async (_req, res) => {
  const actions = AuditLog.schema.path('action').enumValues;
  return sendSuccess(res, { actions });
});

/**
 * Verify the integrity of the audit hash-chain. Detects any tampered,
 * inserted, or deleted entry. Expensive on large histories — super_admin only.
 */
export const verifyAuditLogs = asyncHandler(async (_req, res) => {
  const { verifyAuditChain } = await import('../../../utils/auditChain.js');
  const result = await verifyAuditChain();
  return sendSuccess(res, result);
});