import * as site2faService from './site2fa.service.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess } from '../../../utils/sendSuccess.js';
import { setAuthCookies } from '../../../utils/jwt.js';

export const setup2fa = asyncHandler(async (req, res) => {
  const result = await site2faService.setup2fa(req.siteAdmin._id);
  return sendSuccess(res, result);
});

export const verify2fa = asyncHandler(async (req, res) => {
  const admin = await site2faService.verify2fa(req.siteAdmin._id, req.validatedBody.token);
  setAuthCookies(res, admin, 'site');
  req.auditDetails = { action: '2fa.enable' };
  return sendSuccess(res, { message: '2FA has been enabled successfully' });
});

export const disable2fa = asyncHandler(async (req, res) => {
  const admin = await site2faService.disable2fa(req.siteAdmin._id, req.validatedBody.token);
  setAuthCookies(res, admin, 'site');
  req.auditDetails = { action: '2fa.disable' };
  return sendSuccess(res, { message: '2FA has been disabled' });
});

export const get2faStatus = asyncHandler(async (req, res) => {
  const result = await site2faService.get2faStatus(req.siteAdmin._id);
  return sendSuccess(res, result);
});

export const verify2faLogin = asyncHandler(async (req, res) => {
  const { adminId, token, backupCode } = req.validatedBody;
  await site2faService.verify2faLogin(adminId, { token, backupCode });
  return sendSuccess(res, { verified: true });
});
