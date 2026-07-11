import AuditLog from "./auditLog.model.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";

export const getAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, action, adminId, targetType, targetId, startDate, endDate } = req.validatedQuery;
  const filter = {};

  if (action) filter.action = action;
  if (adminId) filter.admin = adminId;
  if (targetType) filter['target.type'] = targetType;
  if (targetId) filter['target.id'] = targetId;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
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
