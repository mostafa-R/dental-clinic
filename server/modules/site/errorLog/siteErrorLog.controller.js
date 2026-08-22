import ErrorLog from "./errorLog.model.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import ApiError from "../../../utils/ApiError.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";

export const getErrorLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, tenantId, statusCode, startDate, endDate } = req.query;

  const filter = {};
  if (tenantId) filter.tenant = tenantId;
  if (statusCode) filter.statusCode = parseInt(statusCode);
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
    ErrorLog.find(filter)
      .populate('tenant', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ErrorLog.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    logs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

export const getErrorLogStats = asyncHandler(async (req, res) => {
  const { tenantId, startDate, endDate } = req.query;
  const match = {};
  if (tenantId) match.tenant = tenantId;
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  const matchStage = Object.keys(match).length ? [{ $match: match }] : [];

  const stats = await ErrorLog.aggregate([
    ...matchStage,
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        '4xx': { $sum: { $cond: [{ $and: [{ $gte: ['$statusCode', 400] }, { $lt: ['$statusCode', 500] }] }, 1, 0] } },
        '5xx': { $sum: { $cond: [{ $gte: ['$statusCode', 500] }, 1, 0] } },
        byTenant: { $addToSet: '$tenant' },
      },
    },
  ]);

  const byStatus = await ErrorLog.aggregate([
    ...matchStage,
    { $group: { _id: '$statusCode', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  return sendSuccess(res, {
    stats: stats[0] || { total: 0, '4xx': 0, '5xx': 0, byTenant: [] },
    byStatus,
  });
});

export const resolveErrorLog = asyncHandler(async (req, res) => {
  const log = await ErrorLog.findByIdAndUpdate(
    req.params.id,
    { resolved: true, resolvedAt: new Date(), resolvedBy: req.user?._id || null },
    { returnDocument: "after" },
  );
  if (!log) throw ApiError.notFound('Error log not found');
  return sendSuccess(res, { log });
});
