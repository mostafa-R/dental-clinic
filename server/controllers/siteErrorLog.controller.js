import ErrorLog from '../models/ErrorLog.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/sendSuccess.js';

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
  const stats = await ErrorLog.aggregate([
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
    { $group: { _id: '$statusCode', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  return sendSuccess(res, {
    stats: stats[0] || { total: 0, '4xx': 0, '5xx': 0, byTenant: [] },
    byStatus,
  });
});
