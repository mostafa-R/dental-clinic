import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { getRedis } from '../../../config/redis.js';
import ApiError from '../../../utils/ApiError.js';
import { logger, logInfo, logWarn } from '../../../utils/logger.js';
import SiteAdmin from '../admin/admin.model.js';
import { bootstrap2fa } from './site2fa.service.js';

// Recovery OTP storage - uses Redis with 5 minute expiry
const RECOVERY_OTP_PREFIX = 'recovery:otp:';
const RECOVERY_TOKEN_PREFIX = 'recovery:token:';
const OTP_EXPIRY_SECONDS = 300; // 5 minutes

export async function authenticateSiteAdmin(email, password) {
  const admin = await SiteAdmin.findOne({ email }).select('+password');
  if (!admin) throw ApiError.unauthorized('Invalid email or password');
  if (!admin.isActive) throw ApiError.forbidden('Account is disabled');

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) throw ApiError.unauthorized('Invalid email or password');

  if (admin.role === 'super_admin' && !admin.twoFactorEnabled) {
    throw ApiError.forbidden('Super admin must enable 2FA before logging in. Use the recovery endpoint or the seed bootstrap to configure it.');
  }

  return admin;
}

export function create2faChallenge(adminId) {
  return jwt.sign(
    { sub: adminId.toString(), type: '2fa_challenge' },
    process.env.JWT_2FA_SECRET || process.env.JWT_SECRET,
    { expiresIn: '5m' },
  );
}

export async function completeSiteAdminLogin(admin) {
  admin.lastLogin = new Date();
  await admin.save();
  return admin;
}

export async function refreshSiteAdmin(decoded, currentVersion) {
  if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== currentVersion) {
    return false;
  }
  return true;
}

export async function rotateSiteAdminToken(admin) {
  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();
  return admin;
}

export async function createSiteAdmin({ name, email, password, role }) {
  const existingAdmin = await SiteAdmin.findOne({ email });
  if (existingAdmin) throw ApiError.conflict('An admin with this email already exists');

  const admin = new SiteAdmin({ name, email, password, role: role || 'support' });
  await admin.save();
  return admin;
}

/**
 * @deprecated Use initiateRecovery and verifyRecoveryOtp instead
 * This method is kept for backward compatibility but should not be used
 */
export async function recoverSiteAdmin(email, recoveryKey) {
  const expected = process.env.SITE_RECOVERY_KEY;
  if (!expected) {
    throw ApiError.forbidden('Recovery is not configured on this server');
  }

  const providedHash = crypto.createHash('sha256').update(String(recoveryKey || '')).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  if (providedHash.length !== expectedHash.length || !crypto.timingSafeEqual(providedHash, expectedHash)) {
    throw ApiError.unauthorized('Invalid recovery key');
  }

  const admin = await SiteAdmin.findOne({ email: email.toLowerCase() });
  if (!admin || !admin.isActive) throw ApiError.unauthorized('Admin not found or disabled');
  if (admin.role !== 'super_admin') throw ApiError.forbidden('Recovery is only available for super admins');

  const result = await bootstrap2fa(admin);
  return { admin, ...result };
}

/**
 * Initiate recovery - validates recovery key and sends OTP to admin email
 */
export async function initiateRecovery(email, recoveryKey, { ip, userAgent }) {
  // Validate recovery key
  const expected = process.env.SITE_RECOVERY_KEY;
  if (!expected) {
    throw ApiError.forbidden('Recovery is not configured on this server');
  }

  const providedHash = crypto.createHash('sha256').update(String(recoveryKey || '')).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();

  if (providedHash.length !== expectedHash.length || !crypto.timingSafeEqual(providedHash, expectedHash)) {
    logWarn('Invalid recovery key attempt', { email, ip });
    throw ApiError.unauthorized('Invalid recovery key');
  }

  // Validate admin
  const admin = await SiteAdmin.findOne({ email: email.toLowerCase() });
  if (!admin || !admin.isActive) {
    throw ApiError.unauthorized('Admin not found or disabled');
  }
  if (admin.role !== 'super_admin') {
    throw ApiError.forbidden('Recovery is only available for super admins');
  }

  // Generate 6-digit OTP
  const otp = crypto.randomInt(100000, 999999).toString().padStart(6, '0');

  // Generate recovery token (JWT for verification)
  const recoveryToken = jwt.sign(
    {
      sub: admin._id.toString(),
      email: admin.email,
      type: 'recovery_init',
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  // Store OTP in Redis with 5 minute expiry
  const redis = getRedis();
  if (!redis) {
    throw ApiError.internalServerError('Redis is required for recovery');
  }

  await redis.setex(`${RECOVERY_OTP_PREFIX}${email.toLowerCase()}`, OTP_EXPIRY_SECONDS, otp);
  await redis.setex(`${RECOVERY_TOKEN_PREFIX}${email.toLowerCase()}`, OTP_EXPIRY_SECONDS, recoveryToken);

  // Send OTP via email
  await sendRecoveryOtpEmail(admin.email, otp, { ip, userAgent });

  logInfo('Recovery OTP sent', { email, ip });

  return { recoveryToken };
}

/**
 * Verify OTP and complete recovery
 */
export async function verifyRecoveryOtp(email, otp, recoveryToken, { ip, userAgent }) {
  const redis = getRedis();
  if (!redis) {
    throw ApiError.internalServerError('Redis is required for recovery');
  }

  // Verify recovery token
  let decoded;
  try {
    decoded = jwt.verify(recoveryToken, process.env.JWT_SECRET);
    if (decoded.type !== 'recovery_init' || decoded.email !== email.toLowerCase()) {
      throw new Error('Invalid token type');
    }
  } catch (err) {
    logWarn('Invalid recovery token', { email, ip, error: err.message });
    throw ApiError.unauthorized('Invalid or expired recovery token');
  }

  // Verify OTP from Redis
  const storedOtp = await redis.get(`${RECOVERY_OTP_PREFIX}${email.toLowerCase()}`);
  if (!storedOtp) {
    throw ApiError.unauthorized('OTP has expired. Please initiate recovery again.');
  }

  if (storedOtp !== otp) {
    // Increment failed attempts
    const failKey = `recovery:otp:fail:${email.toLowerCase()}`;
    const fails = await redis.incr(failKey);
    await redis.expire(failKey, 300); // 5 min window

    if (fails >= 3) {
      // Invalidate the OTP after 3 failed attempts
      await redis.del(`${RECOVERY_OTP_PREFIX}${email.toLowerCase()}`);
      await redis.del(`${RECOVERY_TOKEN_PREFIX}${email.toLowerCase()}`);
      logWarn('OTP locked after 3 failed attempts', { email, ip });
      throw ApiError.forbidden('Too many failed attempts. Please initiate recovery again.');
    }

    throw ApiError.unauthorized(`Invalid OTP. ${3 - fails} attempts remaining.`);
  }

  // Clear OTP from Redis (one-time use)
  await redis.del(`${RECOVERY_OTP_PREFIX}${email.toLowerCase()}`);
  await redis.del(`${RECOVERY_TOKEN_PREFIX}${email.toLowerCase()}`);

  // Get admin and bootstrap 2FA
  const admin = await SiteAdmin.findById(decoded.sub);
  if (!admin || !admin.isActive) {
    throw ApiError.unauthorized('Admin not found or disabled');
  }

  const result = await bootstrap2fa(admin);

  logInfo('Recovery completed, 2FA bootstrapped', { email, ip });

  return { admin, ...result };
}

/**
 * Send recovery OTP via email
 */
async function sendRecoveryOtpEmail(email, otp, { ip, userAgent }) {
  // Create transporter (configure based on environment)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || 'noreply@dentalos.com',
    to: email,
    subject: 'Dental OS - Account Recovery OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Account Recovery</h2>
        <p>A recovery attempt has been initiated for your Dental OS admin account.</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
          <p style="font-size: 14px; color: #666; margin-bottom: 10px;">Your verification code:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #007bff; margin: 0;">${otp}</p>
        </div>
        <p style="color: #666; font-size: 14px;">
          This code will expire in <strong>5 minutes</strong>.<br>
          If you did not request this recovery, please contact your system administrator immediately.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">
          Request details:<br>
          IP: ${ip}<br>
          Time: ${new Date().toISOString()}
        </p>
      </div>
    `,
    text: `
Account Recovery

A recovery attempt has been initiated for your Dental OS admin account.

Your verification code: ${otp}

This code will expire in 5 minutes.

If you did not request this recovery, please contact your system administrator immediately.

Request details:
IP: ${ip}
Time: ${new Date().toISOString()}
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logInfo('Recovery OTP email sent', { email });
  } catch (err) {
    logWarn('Failed to send recovery OTP email', { email, error: err.message });
    throw ApiError.internalServerError('Failed to send OTP email. Please try again.');
  }
}

/**
 * Log recovery attempt for audit trail
 */
export async function logRecoveryAttempt({ email, ip, userAgent, success, reason }) {
  try {
    const { default: AuditLog } = await import('../audit/auditLog.model.js');
    const SiteAdmin = (await import('../admin/admin.model.js')).default;

    // Find the admin to get their details
    const admin = await SiteAdmin.findOne({ email: email.toLowerCase() });

    await AuditLog.create({
      admin: admin?._id || null,
      adminEmail: email,
      adminRole: admin?.role || 'unknown',
      action: success ? '2fa.enable' : '2fa.disable', // Using closest action from enum
      target: {
        type: 'admin',
        id: admin?._id || null,
        name: email
      },
      details: {
        recoveryAttempt: true,
        success,
        reason,
        ip,
        userAgent,
        timestamp: new Date()
      },
      ip,
      userAgent
    });
  } catch (err) {
    logWarn('Failed to log recovery attempt', { email, error: err.message });
  }
}

/**
 * Alert on successful recovery (for monitoring/security teams)
 */
export async function alertRecoveryComplete({ email, ip, userAgent }) {
  // Log critical security event
  logger.warn({
    event: 'RECOVERY_COMPLETED',
    email,
    ip,
    userAgent,
    timestamp: new Date().toISOString()
  }, 'Site admin recovery completed - review for legitimacy');

  // If Slack webhook is configured, send alert
  if (process.env.SLACK_SECURITY_WEBHOOK) {
    try {
      const response = await fetch(process.env.SLACK_SECURITY_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '⚠️ Site Admin Recovery Completed',
          attachments: [{
            color: 'warning',
            fields: [
              { title: 'Email', value: email, short: true },
              { title: 'IP Address', value: ip, short: true },
              { title: 'Time', value: new Date().toISOString(), short: false }
            ]
          }]
        })
      });

      if (!response.ok) {
        logWarn('Failed to send Slack alert', { email, status: response.status });
      }
    } catch (err) {
      logWarn('Failed to send Slack security alert', { email, error: err.message });
    }
  }

  // If email alerting is configured
  if (process.env.SECURITY_ALERT_EMAIL) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@dentalos.com',
        to: process.env.SECURITY_ALERT_EMAIL,
        subject: '⚠️ Dental OS - Site Admin Recovery Alert',
        text: `A site admin recovery has been completed.\n\nEmail: ${email}\nIP: ${ip}\nTime: ${new Date().toISOString()}\n\nIf this was unexpected, please investigate immediately.`
      });
    } catch (err) {
      logWarn('Failed to send security alert email', { error: err.message });
    }
  }
}

const SAFE_ADMIN_FIELDS = '-password -twoFactorSecret -twoFactorBackupCodes';

export async function listSiteAdmins({ page, limit, role, search }) {
  const skip = (page - 1) * limit;
  const filter = {};
  if (role) filter.role = role;
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  const [admins, total] = await Promise.all([
    SiteAdmin.find(filter).select(SAFE_ADMIN_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    SiteAdmin.countDocuments(filter),
  ]);

  return {
    admins,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getSiteAdmin(id) {
  const admin = await SiteAdmin.findById(id).select(SAFE_ADMIN_FIELDS).lean();
  if (!admin) throw ApiError.notFound('Admin not found');
  return admin;
}

export async function updateSiteAdmin(id, { name, email, password, role, permissions }) {
  const admin = await SiteAdmin.findById(id);
  if (!admin) throw ApiError.notFound('Admin not found');

  if (email && email !== admin.email) {
    const existing = await SiteAdmin.findOne({ email, _id: { $ne: id } });
    if (existing) throw ApiError.conflict('An admin with this email already exists');
  }

  if (name) admin.name = name;
  if (email) admin.email = email;
  if (password) {
    admin.password = password;
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  }
  if (role) admin.role = role;
  if (permissions) admin.permissions = permissions;

  await admin.save();
  return admin;
}

export async function deleteSiteAdmin(id) {
  const admin = await SiteAdmin.findByIdAndDelete(id);
  if (!admin) throw ApiError.notFound('Admin not found');
  return admin;
}
