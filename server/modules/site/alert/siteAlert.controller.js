import SiteAlert from "./alert.model.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import ApiError from "../../../utils/ApiError.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";

export const getAlerts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, status, severity, type, tenantId } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (severity) filter.severity = severity;
  if (type) filter.type = type;
  if (tenantId) filter.tenant = tenantId;

  const [alerts, total] = await Promise.all([
    SiteAlert.find(filter)
      .populate("tenant", "name")
      .sort({ lastSeenAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean(),
    SiteAlert.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    alerts,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * Lightweight counts for the Topbar bell — cheap aggregate, no payload.
 */
export const getAlertSummary = asyncHandler(async (_req, res) => {
  const byStatus = await SiteAlert.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const bySeverity = await SiteAlert.aggregate([
    {
      $match: { status: { $ne: "resolved" } },
    },
    { $group: { _id: "$severity", count: { $sum: 1 } } },
  ]);

  const summary = {
    active: 0,
    acknowledged: 0,
    resolved: 0,
    open: 0,
    bySeverity: { critical: 0, warning: 0, info: 0 },
  };
  for (const row of byStatus) summary[row._id] = row.count;
  for (const row of bySeverity) summary.bySeverity[row._id] = row.count;
  summary.open = summary.active + summary.acknowledged;

  return sendSuccess(res, { summary });
});

/**
 * Most recent open (active + acknowledged) alerts, oldest-bumped-first.
 * Used by the Topbar dropdown and on-mount toast candidate list.
 */
export const getActiveAlerts = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const alerts = await SiteAlert.find({ status: { $ne: "resolved" } })
    .populate("tenant", "name")
    .sort({ lastSeenAt: -1 })
    .limit(parseInt(limit))
    .lean();
  return sendSuccess(res, { alerts });
});

export const getAlertById = asyncHandler(async (req, res) => {
  const alert = await SiteAlert.findById(req.params.id)
    .populate("tenant", "name email")
    .populate("acknowledgedBy", "name email")
    .populate("resolvedBy", "name email")
    .lean();
  if (!alert) throw ApiError.notFound("Alert not found");
  return sendSuccess(res, { alert });
});

export const acknowledgeAlert = asyncHandler(async (req, res) => {
  const admin = req.siteAdmin;
  const alert = await SiteAlert.findByIdAndUpdate(
    req.params.id,
    {
      status: "acknowledged",
      acknowledgedAt: new Date(),
      acknowledgedBy: admin?._id || null,
    },
    { returnDocument: "after" },
  );
  if (!alert) throw ApiError.notFound("Alert not found");

  req.auditTargetName = alert.title;
  req.auditDetails = {
    action: "alert.acknowledge",
    alertType: alert.type,
    severity: alert.severity,
    fingerprint: alert.fingerprint,
  };
  return sendSuccess(res, { alert });
});

export const resolveAlert = asyncHandler(async (req, res) => {
  const admin = req.siteAdmin;
  const alert = await SiteAlert.findByIdAndUpdate(
    req.params.id,
    {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy: admin?._id || null,
    },
    { returnDocument: "after" },
  );
  if (!alert) throw ApiError.notFound("Alert not found");

  req.auditTargetName = alert.title;
  req.auditDetails = {
    action: "alert.resolve",
    alertType: alert.type,
    severity: alert.severity,
    fingerprint: alert.fingerprint,
  };
  return sendSuccess(res, { alert });
});

export const acknowledgeAllAlerts = asyncHandler(async (req, res) => {
  const admin = req.siteAdmin;
  const result = await SiteAlert.updateMany(
    { status: "active" },
    {
      $set: {
        status: "acknowledged",
        acknowledgedAt: new Date(),
        acknowledgedBy: admin?._id || null,
      },
    },
  );

  req.auditDetails = {
    action: "alert.acknowledge_all",
    updated: result.modifiedCount || 0,
  };
  return sendSuccess(res, { acknowledged: result.modifiedCount || 0 });
});