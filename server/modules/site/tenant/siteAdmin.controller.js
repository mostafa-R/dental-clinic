import ApiError from "../../../utils/ApiError.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";
import SiteAdmin from "../admin/admin.model.js";

const SAFE_ADMIN_FIELDS = "-password -twoFactorSecret -twoFactorBackupCodes";

export const getAdmins = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, role, search } = req.query;
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (safePage - 1) * safeLimit;

  const filter = {};
  if (role) filter.role = role;
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
    ];
  }

  const [admins, total] = await Promise.all([
    SiteAdmin.find(filter).select(SAFE_ADMIN_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    SiteAdmin.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    admins,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const admin = await SiteAdmin.findById(req.params.id).select(SAFE_ADMIN_FIELDS).lean();
  if (!admin) throw ApiError.notFound("Admin not found");
  return sendSuccess(res, admin);
});

export const createAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, role, permissions } = req.validatedBody;

  const existing = await SiteAdmin.findOne({ email });
  if (existing) throw ApiError.conflict("An admin with this email already exists");

  const admin = await SiteAdmin.create({
    name,
    email,
    password,
    role: role || "support",
    permissions: permissions || [],
    isActive: true,
  });

  return sendSuccess(res, { admin: admin.toSafeObject() }, 201);
});

export const updateAdmin = asyncHandler(async (req, res) => {
  const admin = await SiteAdmin.findById(req.params.id);
  if (!admin) throw ApiError.notFound("Admin not found");

  const { name, email, password, role, permissions } = req.validatedBody;

  if (email && email !== admin.email) {
    const existing = await SiteAdmin.findOne({ email, _id: { $ne: req.params.id } });
    if (existing) throw ApiError.conflict("An admin with this email already exists");
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
  return sendSuccess(res, admin.toSafeObject());
});

export const deleteAdmin = asyncHandler(async (req, res) => {
  const admin = await SiteAdmin.findById(req.params.id);
  if (!admin) throw ApiError.notFound("Admin not found");

  // Prevent self-deletion
  if (String(admin._id) === String(req.siteAdmin._id)) {
    throw ApiError.forbidden("Cannot delete your own account");
  }

  // Prevent deleting the last super_admin
  if (admin.role === "super_admin") {
    const superAdminCount = await SiteAdmin.countDocuments({ role: "super_admin" });
    if (superAdminCount <= 1) {
      throw ApiError.conflict("Cannot delete the last super_admin account");
    }
  }

  await admin.deleteOne();
  return sendSuccess(res, { message: "Admin deleted" });
});

export const updateAdminPermissions = asyncHandler(async (req, res) => {
  const admin = await SiteAdmin.findById(req.params.id);
  if (!admin) throw ApiError.notFound("Admin not found");

  admin.permissions = req.validatedBody.permissions || [];
  await admin.save();
  return sendSuccess(res, admin.toSafeObject());
});
