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
  const tenantKey = String(tenant);
  const { to, message } = req.validatedBody;

  throttleTestSends(tenantKey);

  const settings = await WhatsAppSetting.findOne({ tenant }).select('+qrCode');
  if (settings?.status === 'connecting') {
    throw ApiError.badRequest('Still connecting — scan the QR code first');
  }

  await sendWhatsAppMessage(tenant, to, message);
  return sendSuccess(res, { sent: true, to, message });
});

// Per-tenant abuse guard on the free-form "send to any number" test endpoint:
// a clinic user with settings:update must not be able to blast arbitrary
// numbers at the clinic's expense. The log is in-memory by design (a restart
// resets it, which is fine for throttling).
const TEST_SEND_MAX = 5;
const TEST_SEND_WINDOW_MS = 60 * 60 * 1000;
const testSendLog = new Map();

function throttleTestSends(tenantKey) {
  const now = Date.now();
  const cutoff = now - TEST_SEND_WINDOW_MS;
  const recent = (testSendLog.get(tenantKey) || []).filter((ts) => ts > cutoff);
  if (recent.length >= TEST_SEND_MAX) {
    throw ApiError.tooManyRequests(
      `Test message limit reached (${TEST_SEND_MAX} per hour). Contact support if you need more.`,
    );
  }
  recent.push(now);
  testSendLog.set(tenantKey, recent);
}
