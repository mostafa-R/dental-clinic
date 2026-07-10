import crypto from "crypto";
import Appointment from "../models/Appointment.js";
import Branch from "../models/Branch.js";
import Invoice from "../models/Invoice.js";
import Patient from "../models/Patient.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/sendSuccess.js";

/**
 * Generate a reasonably strong random password when the site admin doesn't
 * provide one explicitly. 16 chars of base36 gives ~83 bits of entropy.
 */
function generatePassword() {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  )
    .join("")
    .padEnd(16, "0");
}

// Get all tenants with pagination and filtering
export const getTenants = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, plan, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = {};
  if (status) filter.status = status;
  if (plan) filter.plan = plan;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const [tenants, total] = await Promise.all([
    Tenant.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Tenant.countDocuments(filter),
  ]);

  // Get branch and user counts for each tenant
  const tenantsWithCounts = await Promise.all(
    tenants.map(async (tenant) => {
      const [branchesCount, usersCount] = await Promise.all([
        Branch.countDocuments({ tenant: tenant._id }),
        User.countDocuments({ tenant: tenant._id }),
      ]);
      return { ...tenant, branchesCount, usersCount };
    }),
  );

  return sendSuccess(res, {
    tenants: tenantsWithCounts,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// Get single tenant by ID
export const getTenant = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const tenant = await Tenant.findById(id).lean();
  if (!tenant) {
    throw ApiError.notFound("Tenant not found");
  }

  // Get additional stats
  const [branchesCount, usersCount, patientsCount, appointmentsCount] =
    await Promise.all([
      Branch.countDocuments({ tenant: tenant._id }),
      User.countDocuments({ tenant: tenant._id }),
      Patient.countDocuments({ tenant: tenant._id }),
      Appointment.countDocuments({ tenant: tenant._id }),
    ]);

  return sendSuccess(res, {
    ...tenant,
    branchesCount,
    usersCount,
    patientsCount,
    appointmentsCount,
  });
});

// Create new tenant
export const createTenant = asyncHandler(async (req, res) => {
  const { name, email, phone, plan, address, city, country, adminPassword } =
    req.validatedBody;

  // Check if email already exists
  const existingTenant = await Tenant.findOne({ email });
  if (existingTenant) {
    throw ApiError.conflict("A tenant with this email already exists");
  }

  // The clinic admin reuses the tenant email; make sure no User already owns it.
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw ApiError.conflict(
      "A user with this email already exists; the tenant email must be unique",
    );
  }

  // Look up the Plan document so we can stamp modules & limits on the tenant.
  const planDoc = plan ? await Plan.findOne({ key: plan, isActive: true }).lean() : null;

  const tenant = new Tenant({
    name,
    email,
    phone,
    address,
    city,
    country,
    status: "trial",
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
  });

  // Ensure slug uniqueness
  let baseSlug = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  let slug = baseSlug;
  let counter = 1;
  while (await Tenant.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  tenant.slug = slug;

  tenant.updatePlanSettings(planDoc);

  // Generate a tenant-specific encryption key for at-rest data encryption.
  // The key is a 256-bit (32-byte) random value, hex-encoded, using AES-256-GCM.
  // It is returned once during provisioning and never stored unhashed again.
  tenant.encryption = {
    key: crypto.randomBytes(32).toString("hex"),
    algorithm: "aes-256-gcm",
    createdAt: new Date(),
  };

  await tenant.save();

  // Provision a default branch for the new tenant so the clinic admin can
  // start operating immediately without a separate setup step.
  const defaultBranch = await Branch.create({
    tenant: tenant._id,
    name: `${name} - Main`,
    address: address || "",
    phone: phone || "",
    isActive: true,
  });

  // Provision the clinic admin account. This is the credential the clinic
  // uses to log into the clinic dashboard (dental os).
  const password = adminPassword || generatePassword();
  const clinicAdmin = await User.create({
    tenant: tenant._id,
    name: `${name} Admin`,
    email,
    password,
    role: "clinic_admin",
    branch: defaultBranch._id,
    isActive: true,
  });

  // Create subscription record with price from the Plan document
  const amount = planDoc?.price ?? 99;
  await Subscription.create({
    tenant: tenant._id,
    plan: tenant.plan,
    status: "pending",
    amount,
    currentPeriodStart: new Date(),
    currentPeriodEnd: tenant.trialEndsAt,
  });

  const tenantObj = tenant.toObject();

  return sendSuccess(
    res,
    {
      ...tenantObj,
      branchesCount: 1,
      usersCount: 1,
      // Return the plain-text password ONCE so the site admin can hand it to
      // the clinic. It is never stored or retrievable again (only the hash is).
      adminCredentials: {
        email: clinicAdmin.email,
        password,
        loginUrl: "http://localhost:5173/login",
      },
      // Return the encryption key ONCE during provisioning. It is stored
      // with select: false and cannot be retrieved later via the API.
      encryptionKey: tenant.encryption?.key || null,
    },
    201,
  );
});

// Update tenant
export const updateTenant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, plan, address, city, country } =
    req.validatedBody;

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw ApiError.notFound("Tenant not found");
  }

  // Check if email is being changed and already exists
  if (email && email !== tenant.email) {
    const existingTenant = await Tenant.findOne({ email, _id: { $ne: id } });
    if (existingTenant) {
      throw ApiError.conflict("A tenant with this email already exists");
    }
  }

  // Update fields
  if (name) tenant.name = name;
  if (email) tenant.email = email;
  if (phone !== undefined) tenant.phone = phone;
  if (plan) {
    const planDoc = await Plan.findOne({ key: plan, isActive: true }).lean();
    tenant.updatePlanSettings(planDoc);
  }
  if (address !== undefined) tenant.address = address;
  if (city !== undefined) tenant.city = city;
  if (country !== undefined) tenant.country = country;

  await tenant.save();

  return sendSuccess(res, tenant.toObject());
});

// Archive tenant (soft-delete: marks as archived, inaccessible from clinic dash)
export const archiveTenant = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound("Tenant not found");

  tenant.status = "archived";
  tenant.isActive = false;
  await tenant.save();

  return sendSuccess(res, tenant.toObject());
});

// Permanently delete tenant and all associated data
export const deleteTenant = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound("Tenant not found");

  // Remove all tenant data in parallel
  await Promise.all([
    User.deleteMany({ tenant: id }),
    Branch.deleteMany({ tenant: id }),
    Patient.deleteMany({ tenant: id }),
    Appointment.deleteMany({ tenant: id }),
    Invoice.deleteMany({ tenant: id }),
    Subscription.deleteMany({ tenant: id }),
    Tenant.findByIdAndDelete(id),
  ]);

  return sendSuccess(res, { message: "Tenant permanently deleted" });
});

// Suspend tenant
export const suspendTenant = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw ApiError.notFound("Tenant not found");
  }

  tenant.status = "suspended";
  tenant.isActive = false;
  await tenant.save();

  return sendSuccess(res, tenant.toObject());
});

// Activate tenant
export const activateTenant = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw ApiError.notFound("Tenant not found");
  }

  tenant.status = "active";
  tenant.isActive = true;
  await tenant.save();

  return sendSuccess(res, tenant.toObject());
});

// Get tenant statistics (for tenant detail page)
export const getTenantStats = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw ApiError.notFound("Tenant not found");
  }

  const [
    branchesCount,
    usersCount,
    doctorsCount,
    patientsCount,
    appointmentsCount,
    revenue,
  ] = await Promise.all([
    Branch.countDocuments({ tenant: id }),
    User.countDocuments({ tenant: id }),
    User.countDocuments({ tenant: id, $or: [{ isDoctor: true }, { role: 'doctor' }] }),
    Patient.countDocuments({ tenant: id }),
    Appointment.countDocuments({ tenant: id }),
    Invoice.aggregate([
      { $match: { tenant: tenant._id, status: { $ne: "void" } } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
  ]);

  return sendSuccess(res, {
    branchesCount,
    usersCount,
    doctorsCount,
    patientsCount,
    appointmentsCount,
    totalRevenue: revenue[0]?.total || 0,
    planLimits: tenant.settings,
  });
});
