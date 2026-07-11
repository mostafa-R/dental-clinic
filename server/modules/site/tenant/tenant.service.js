import crypto from 'crypto';
import Appointment from '../../appointments/appointment.model.js';
import Branch from '../../users/branch.model.js';
import Invoice from '../../billing/invoice.model.js';
import Patient from '../../patients/patient.model.js';
import Plan from '../../platform/plan.model.js';
import Subscription from './subscription.model.js';
import Tenant from './tenant.model.js';
import User from '../../users/user.model.js';
import ApiError from '../../../utils/ApiError.js';

function generatePassword() {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export async function listTenants({ page, limit, status, plan, search }) {
  const skip = (page - 1) * limit;
  const filter = {};
  if (status) filter.status = status;
  if (plan) filter.plan = plan;
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  const [tenants, total] = await Promise.all([
    Tenant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Tenant.countDocuments(filter),
  ]);

  const tenantIds = tenants.map(t => t._id);
  const [branchCounts, userCounts] = tenantIds.length ? await Promise.all([
    Branch.aggregate([
      { $match: { tenant: { $in: tenantIds } } },
      { $group: { _id: '$tenant', count: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { tenant: { $in: tenantIds } } },
      { $group: { _id: '$tenant', count: { $sum: 1 } } },
    ]),
  ]) : [[], []];

  const branchCountMap = new Map(branchCounts.map(c => [String(c._id), c.count]));
  const userCountMap = new Map(userCounts.map(c => [String(c._id), c.count]));

  const tenantsWithCounts = tenants.map((tenant) => ({
    ...tenant,
    branchesCount: branchCountMap.get(String(tenant._id)) || 0,
    usersCount: userCountMap.get(String(tenant._id)) || 0,
  }));

  return {
    tenants: tenantsWithCounts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getTenantById(id) {
  const tenant = await Tenant.findById(id).lean();
  if (!tenant) throw ApiError.notFound('Tenant not found');

  const [branchesCount, usersCount, patientsCount, appointmentsCount] =
    await Promise.all([
      Branch.countDocuments({ tenant: tenant._id }),
      User.countDocuments({ tenant: tenant._id }),
      Patient.countDocuments({ tenant: tenant._id }),
      Appointment.countDocuments({ tenant: tenant._id }),
    ]);

  return { ...tenant, branchesCount, usersCount, patientsCount, appointmentsCount };
}

export async function createTenant({ name, email, phone, plan, address, city, country, adminPassword }) {
  const existingTenant = await Tenant.findOne({ email });
  if (existingTenant) {
    throw ApiError.conflict('A tenant with this email already exists');
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw ApiError.conflict('A user with this email already exists; the tenant email must be unique');
  }

  const planDoc = plan ? await Plan.findOne({ key: plan, isActive: true }).lean() : null;

  const tenant = new Tenant({
    name,
    email,
    phone,
    address,
    city,
    country,
    status: 'trial',
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  let baseSlug = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  let slug = baseSlug;
  let counter = 1;
  while (await Tenant.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  tenant.slug = slug;

  tenant.updatePlanSettings(planDoc);

  tenant.encryption = {
    key: crypto.randomBytes(32).toString('hex'),
    algorithm: 'aes-256-gcm',
    createdAt: new Date(),
  };

  await tenant.save();

  const defaultBranch = await Branch.create({
    tenant: tenant._id,
    name: `${name} - Main`,
    address: address || '',
    phone: phone || '',
    isActive: true,
  });

  const password = adminPassword || generatePassword();
  const clinicAdmin = await User.create({
    tenant: tenant._id,
    name: `${name} Admin`,
    email,
    password,
    role: 'clinic_admin',
    branch: defaultBranch._id,
    isActive: true,
  });

  const amount = planDoc?.price ?? 99;
  await Subscription.create({
    tenant: tenant._id,
    plan: tenant.plan,
    status: 'pending',
    amount,
    currentPeriodStart: new Date(),
    currentPeriodEnd: tenant.trialEndsAt,
  });

  const tenantObj = tenant.toObject();
  return {
    ...tenantObj,
    branchesCount: 1,
    usersCount: 1,
    adminCredentials: {
      email: clinicAdmin.email,
      password,
      loginUrl: 'http://localhost:5173/login',
    },
    encryptionKey: tenant.encryption?.key || null,
  };
}

export async function updateTenant(id, { name, email, phone, plan, address, city, country }) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound('Tenant not found');

  if (email && email !== tenant.email) {
    const existingTenant = await Tenant.findOne({ email, _id: { $ne: id } });
    if (existingTenant) {
      throw ApiError.conflict('A tenant with this email already exists');
    }
  }

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
  return tenant;
}

export async function archiveTenant(id) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound('Tenant not found');
  tenant.status = 'archived';
  tenant.isActive = false;
  await tenant.save();
  return tenant;
}

export async function deleteTenant(id) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound('Tenant not found');

  await Promise.all([
    User.deleteMany({ tenant: id }),
    Branch.deleteMany({ tenant: id }),
    Patient.deleteMany({ tenant: id }),
    Appointment.deleteMany({ tenant: id }),
    Invoice.deleteMany({ tenant: id }),
    Subscription.deleteMany({ tenant: id }),
    Tenant.findByIdAndDelete(id),
  ]);
}

export async function suspendTenant(id) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound('Tenant not found');
  tenant.status = 'suspended';
  tenant.isActive = false;
  await tenant.save();
  return tenant;
}

export async function activateTenant(id) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound('Tenant not found');
  tenant.status = 'active';
  tenant.isActive = true;
  await tenant.save();
  return tenant;
}

export async function getTenantStats(id) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound('Tenant not found');

  const [branchesCount, usersCount, doctorsCount, patientsCount, appointmentsCount, revenue] =
    await Promise.all([
      Branch.countDocuments({ tenant: id }),
      User.countDocuments({ tenant: id }),
      User.countDocuments({ tenant: id, $or: [{ isDoctor: true }, { role: 'doctor' }] }),
      Patient.countDocuments({ tenant: id }),
      Appointment.countDocuments({ tenant: id }),
      Invoice.aggregate([
        { $match: { tenant: tenant._id, status: { $ne: 'void' } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

  return {
    branchesCount,
    usersCount,
    doctorsCount,
    patientsCount,
    appointmentsCount,
    totalRevenue: revenue[0]?.total || 0,
    planLimits: tenant.settings,
  };
}
