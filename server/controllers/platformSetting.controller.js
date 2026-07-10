import PlatformSetting from "../models/PlatformSetting.js";
import asyncHandler from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/sendSuccess.js";
import { cacheGet, cacheSet } from "../config/redis.js";

const PS_CACHE_KEY = 'platform:settings';

export const getPlatformSettings = asyncHandler(async (_req, res) => {
  let settings = await cacheGet(PS_CACHE_KEY);
  if (!settings) {
    settings = await PlatformSetting.findOne().lean();
    if (!settings) {
      settings = await PlatformSetting.create({});
    }
    await cacheSet(PS_CACHE_KEY, settings, 600);
  }
  return sendSuccess(res, settings);
});

export const updatePlatformSettings = asyncHandler(async (req, res) => {
  const data = req.body;
  let settings = await PlatformSetting.findOne();
  if (!settings) {
    settings = await PlatformSetting.create(data);
  } else {
    Object.assign(settings, data);
    await settings.save();
  }
  await cacheSet(PS_CACHE_KEY, null, 1);
  return sendSuccess(res, settings.toObject());
});
