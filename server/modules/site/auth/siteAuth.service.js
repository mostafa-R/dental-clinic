import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import SiteAdmin from '../admin/admin.model.js';
import ApiError from '../../../utils/ApiError.js';
import { bootstrap2fa } from './site2fa.service.js';

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
