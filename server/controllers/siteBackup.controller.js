import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/sendSuccess.js";
import { performBackup, listBackups, getBackupById } from "../services/backup.js";

export const getBackups = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const result = await listBackups(page, limit);
  return sendSuccess(res, result);
});

export const getBackup = asyncHandler(async (req, res) => {
  const log = await getBackupById(req.params.id);
  if (!log) {
    throw ApiError.notFound("Backup log not found");
  }
  return sendSuccess(res, log);
});

export const triggerManualBackup = asyncHandler(async (req, res) => {
  const log = await performBackup("manual", req.siteAdmin?._id || null);
  return sendSuccess(res, log);
});
