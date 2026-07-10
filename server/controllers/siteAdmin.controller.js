import SiteAdmin from "../models/SiteAdmin.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/sendSuccess.js";

export const getAdmins = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, role, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = {};
  if (role) filter.role = role;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const [admins, total] = await Promise.all([
    SiteAdmin.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    SiteAdmin.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    admins,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const admin = await SiteAdmin.findById(req.params.id).lean();
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
  if (password) admin.password = password;
  if (role) admin.role = role;
  if (permissions) admin.permissions = permissions;

  await admin.save();
  return sendSuccess(res, admin.toSafeObject());
});

export const deleteAdmin = asyncHandler(async (req, res) => {
  const admin = await SiteAdmin.findByIdAndDelete(req.params.id);
  if (!admin) throw ApiError.notFound("Admin not found");
  return sendSuccess(res, { message: "Admin deleted" });
});

export const updateAdminPermissions = asyncHandler(async (req, res) => {
  const admin = await SiteAdmin.findById(req.params.id);
  if (!admin) throw ApiError.notFound("Admin not found");

  admin.permissions = req.body.permissions || [];
  await admin.save();
  return sendSuccess(res, admin.toSafeObject());
});
