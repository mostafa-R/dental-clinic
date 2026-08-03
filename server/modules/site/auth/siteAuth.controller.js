import { getRedis } from '../../../config/redis.js';
import ApiError from '../../../utils/ApiError.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { clearAuthCookies, setAuthCookies, SITE_REFRESH_COOKIE, verifyRefreshToken } from '../../../utils/jwt.js';
import { logInfo, logWarn } from '../../../utils/logger.js';
import { sendSuccess } from '../../../utils/sendSuccess.js';
import * as siteAuthService from './siteAuth.service.js';

export const siteLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody;
  const admin = await siteAuthService.authenticateSiteAdmin(email, password);

  if (admin.twoFactorEnabled) {
    const challengeToken = siteAuthService.create2faChallenge(admin._id);
    return sendSuccess(res, { requires2fa: true, challengeToken, adminId: admin._id });
  }

  await siteAuthService.completeSiteAdminLogin(admin);
  setAuthCookies(res, admin, 'site');
  return sendSuccess(res, { user: admin.toSafeObject() });
});

export const getSiteMe = asyncHandler((req, res) => {
  return sendSuccess(res, { user: req.siteAdmin.toSafeObject() });
});

export const siteRefresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[SITE_REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('Refresh token missing');

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const { default: SiteAdmin } = await import('../admin/admin.model.js');
  const admin = await SiteAdmin.findById(decoded.sub);
  if (!admin || !admin.isActive) {
    clearAuthCookies(res, 'site');
    throw ApiError.unauthorized('Admin no longer valid');
  }

  const valid = await siteAuthService.refreshSiteAdmin(decoded, admin.tokenVersion);
  if (!valid) {
    clearAuthCookies(res, 'site');
    throw ApiError.unauthorized('Token has been rotated, please log in again');
  }

  await siteAuthService.rotateSiteAdminToken(admin);
  setAuthCookies(res, admin, 'site');
  return sendSuccess(res, { message: 'Token refreshed' });
});

export const siteLogout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[SITE_REFRESH_COOKIE];
  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const { default: SiteAdmin } = await import('../admin/admin.model.js');
      await SiteAdmin.findByIdAndUpdate(decoded.sub, { $inc: { tokenVersion: 1 } });
    } catch {
      // Token already invalid — nothing to revoke.
    }
  }
  clearAuthCookies(res, 'site');
  return sendSuccess(res, { message: 'Logged out' });
});

export const createSiteAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.validatedBody;
  const admin = await siteAuthService.createSiteAdmin({ name, email, password, role });
  return sendSuccess(res, { admin: admin.toSafeObject() }, 201);
});

export const recoverSiteAdmin = asyncHandler(async (req, res) => {
  const { email, recoveryKey } = req.validatedBody;
  const clientIp = req.ip || req.connection.remoteAddress;

  // Rate limiting check using Redis (max 5 attempts per hour per IP)
  const redis = getRedis();
  if (redis) {
    const rateLimitKey = `recovery:ratelimit:${clientIp}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) {
      await redis.expire(rateLimitKey, 3600); // 1 hour window
    }
    if (attempts > 5) {
      logWarn('Recovery rate limited', { ip: clientIp, email, attempts });
      throw ApiError.tooManyRequests('Too many recovery attempts. Please try again later.');
    }
  }

  // IP allowlist check
  const allowedIps = process.env.ALLOWED_SITE_IPS?.split(',').map(ip => ip.trim()).filter(Boolean) || [];
  if (allowedIps.length > 0) {
    const { isIpAllowed } = await import('../../../utils/ipCheck.js');
    if (!isIpAllowed(clientIp, allowedIps)) {
      logWarn('Recovery blocked - IP not in allowlist', { ip: clientIp, email });
      throw ApiError.forbidden('Access denied from this IP address');
    }
  }

  const { admin, secret, otpauth, backupCodes } = await siteAuthService.recoverSiteAdmin(email, recoveryKey);
  setAuthCookies(res, admin, 'site');
  return sendSuccess(res, {
    user: admin.toSafeObject(),
    requires2faSetup: true,
    secret,
    otpauth,
    backupCodes,
  });
});

export const initiateRecovery = asyncHandler(async (req, res) => {
  const { email, recoveryKey } = req.validatedBody;
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Rate limiting check using Redis (max 5 attempts per hour per IP)
  const redis = getRedis();
  if (redis) {
    const rateLimitKey = `recovery:ratelimit:${clientIp}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) {
      await redis.expire(rateLimitKey, 3600); // 1 hour window
    }
    if (attempts > 5) {
      logWarn('Recovery rate limited', { ip: clientIp, email, attempts });
      await siteAuthService.logRecoveryAttempt({
        email,
        ip: clientIp,
        userAgent,
        success: false,
        reason: 'rate_limited'
      });
      throw ApiError.tooManyRequests('Too many recovery attempts. Please try again later.');
    }
  }

  // IP allowlist check
  const allowedIps = process.env.ALLOWED_SITE_IPS?.split(',').map(ip => ip.trim()).filter(Boolean) || [];
  if (allowedIps.length > 0) {
    const { isIpAllowed } = await import('../../../utils/ipCheck.js');
    if (!isIpAllowed(clientIp, allowedIps)) {
      logWarn('Recovery blocked - IP not in allowlist', { ip: clientIp, email });
      await siteAuthService.logRecoveryAttempt({
        email,
        ip: clientIp,
        userAgent,
        success: false,
        reason: 'ip_not_allowed'
      });
      throw ApiError.forbidden('Access denied from this IP address');
    }
  }

  // Initiate recovery - validates recovery key and sends OTP to email
  const result = await siteAuthService.initiateRecovery(email, recoveryKey, {
    ip: clientIp,
    userAgent
  });

  logInfo('Recovery initiated', { email, ip: clientIp });
  await siteAuthService.logRecoveryAttempt({
    email,
    ip: clientIp,
    userAgent,
    success: true,
    reason: 'initiated'
  });

  return sendSuccess(res, {
    message: 'OTP sent to your email. Please verify to complete recovery.',
    recoveryToken: result.recoveryToken,
    expiresIn: 300 // 5 minutes
  });
});

export const verifyRecoveryOtp = asyncHandler(async (req, res) => {
  const { email, otp, recoveryToken } = req.validatedBody;
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Rate limiting for OTP verification (max 10 attempts per hour)
  const redis = getRedis();
  if (redis) {
    const otpRateLimitKey = `recovery:otp:${clientIp}`;
    const attempts = await redis.incr(otpRateLimitKey);
    if (attempts === 1) {
      await redis.expire(otpRateLimitKey, 3600);
    }
    if (attempts > 10) {
      logWarn('OTP verification rate limited', { ip: clientIp, email, attempts });
      await siteAuthService.logRecoveryAttempt({
        email,
        ip: clientIp,
        userAgent,
        success: false,
        reason: 'otp_rate_limited'
      });
      throw ApiError.tooManyRequests('Too many OTP attempts. Please try again later.');
    }
  }

  // Verify OTP and complete recovery
  const { admin, secret, otpauth, backupCodes } = await siteAuthService.verifyRecoveryOtp(
    email,
    otp,
    recoveryToken,
    { ip: clientIp, userAgent }
  );

  logInfo('Recovery completed successfully', { email, ip: clientIp });
  await siteAuthService.logRecoveryAttempt({
    email,
    ip: clientIp,
    userAgent,
    success: true,
    reason: 'completed'
  });

  // Alert on successful recovery (for monitoring)
  await siteAuthService.alertRecoveryComplete({ email, ip: clientIp, userAgent });

  setAuthCookies(res, admin, 'site');
  return sendSuccess(res, {
    user: admin.toSafeObject(),
    requires2faSetup: true,
    secret,
    otpauth,
    backupCodes,
  });
});
