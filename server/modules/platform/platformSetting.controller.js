import * as platformSettingService from './platformSetting.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';

export const getPlatformSettings = asyncHandler(async (_req, res) => {
  const settings = await platformSettingService.getSettings();
  return sendSuccess(res, { settings });
});

export const updatePlatformSettings = asyncHandler(async (req, res) => {
  const settings = await platformSettingService.updateSettings(req.validatedBody);
  return sendSuccess(res, { settings });
});
