import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { currentTenant } from '../../utils/branchScope.js';
import WhatsAppSetting from './whatsappSetting.model.js';
import { getWhatsAppSettings, updateWhatsAppSettings, connectWhatsApp, disconnectWhatsApp, sendWhatsAppMessage, getWhatsAppStatus } from '../../services/whatsapp.js';

export const getSettings = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const settings = await getWhatsAppSettings(tenant);
  const result = settings.toObject();
  delete result.config?.session;
  delete result.config?.accessToken;
  delete result.qrCode;
  return sendSuccess(res, result);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const { provider, enabled, config, settings } = req.validatedBody;
  const updated = await updateWhatsAppSettings(tenant, { provider, enabled, config, settings });
  const result = updated.toObject();
  delete result.config?.session;
  delete result.config?.accessToken;
  delete result.qrCode;
  return sendSuccess(res, result);
});

export const connect = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const result = await connectWhatsApp(tenant);
  return sendSuccess(res, result);
});

export const getQrCode = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const settings = await getWhatsAppSettings(tenant);
  if (!settings.qrCode) {
    return sendSuccess(res, { qrCode: null, status: settings.status });
  }
  return sendSuccess(res, { qrCode: settings.qrCode, status: settings.status });
});

export const disconnect = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  await disconnectWhatsApp(tenant);
  return sendSuccess(res, { status: 'disconnected' });
});

export const status = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const settings = await getWhatsAppSettings(tenant);
  const wsStatus = await getWhatsAppStatus(tenant);
  return sendSuccess(res, {
    status: settings.status,
    connected: wsStatus.connected,
    ready: wsStatus.ready,
    enabled: settings.enabled,
    provider: settings.provider,
  });
});

export const testMessage = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const { to, message } = req.validatedBody;

  const settings = await WhatsAppSetting.findOne({ tenant }).select('+qrCode');
  if (settings?.status === 'connecting') {
    throw ApiError.badRequest('Still connecting — scan the QR code first');
  }

  await sendWhatsAppMessage(tenant, to, message);
  return sendSuccess(res, { sent: true, to, message });
});
