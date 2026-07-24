import crypto from 'crypto';
import ApiError from '../../../utils/ApiError.js';
import { cacheDelPattern, invalidateTenant, invalidateTenantRoles } from '../../../utils/cache.js';
import Appointment from '../../appointments/appointment.model.js';
import Invoice from '../../billing/invoice.model.js';
import ClinicalNote from '../../emr/clinicalNote.model.js';
import DentalChart from '../../emr/dentalChart.model.js';
import Patient from '../../patients/patient.model.js';
import Plan from '../../platform/plan.model.js';
import PlatformSetting from '../../platform/platformSetting.model.js';
import Branch from '../../users/branch.model.js';
import Role from '../../users/role.model.js';
import User from '../../users/user.model.js';
import Subscription from './subscription.model.js';
import Tenant from './tenant.model.js';

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

export async function createTenant({ name, email, phone, plan, status, address, city, country, adminPassword }) {
  const existingTenant = await Tenant.findOne({ email });
  if (existingTenant) {
    throw ApiError.conflict('A tenant with this email already exists');
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw ApiError.conflict('A user with this email already exists; the tenant email must be unique');
  }

  const planDoc = plan ? await Plan.findOne({ key: plan, isActive: true }).lean() : null;
  const platformSettings = await PlatformSetting.findOne().lean();
  const trialDays = platformSettings?.trialDays ?? 14;

  const tenantStatus = status || 'trial';
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  let subscriptionEndsAt = null;
  if (tenantStatus === 'active') {
    const billingCycle = planDoc?.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const periodDays = billingCycle === 'yearly' ? 365 : 30;
    subscriptionEndsAt = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);
  }

  const tenant = new Tenant({
    name,
    email,
    phone,
    address,
    city,
    country,
    status: tenantStatus,
    trialEndsAt: tenantStatus === 'trial' ? trialEndsAt : null,
    subscriptionEndsAt,
    isActive: tenantStatus === 'active',
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
    name: name,
    address: address || '',
    phone: phone || '',
    isActive: true,
  });

  const password = adminPassword || generatePassword();

  // Create or find the clinic_admin role for this tenant
  let clinicAdminRole = await Role.findOne({ key: 'clinic_admin', tenant: tenant._id }).lean();
  if (!clinicAdminRole) {
    const [created] = await Role.create([{
      tenant: tenant._id,
      name: 'Clinic Admin',
      key: 'clinic_admin',
      isSystemAdmin: false,
      isBuiltIn: true,
      permissions: [
        { module: 'dashboard', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'patients', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'appointments', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'billing', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'accounting', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'emr', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'prescriptions', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'users', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'branches', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'settings', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'roles', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'chat', actions: ['create', 'read', 'update', 'delete'] },
      ],
    }]);
    clinicAdminRole = created.toObject();
  }

  const clinicAdmin = await User.create({
    tenant: tenant._id,
    name: name,
    email,
    password,
    roleId: clinicAdminRole._id,
    branch: defaultBranch._id,
    isActive: true,
  });

  const amount = planDoc?.price ?? 99;
  await Subscription.create({
    tenant: tenant._id,
    plan: tenant.plan,
    status: tenantStatus === 'active' ? 'active' : 'pending',
    amount,
    currentPeriodStart: new Date(),
    currentPeriodEnd: subscriptionEndsAt || tenant.trialEndsAt,
  });

  const tenantObj = tenant.toObject();
  return {
    ...tenantObj,
    branchesCount: 1,
    usersCount: 1,
    adminCredentials: {
      email: clinicAdmin.email,
      loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`,
    },
  };
}

export async function updateTenant(id, { name, email, phone, plan, status, address, city, country }) {
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
  if (status && status !== tenant.status) {
    tenant.status = status;
    if (status === 'active') {
      tenant.isActive = true;
      if (!tenant.subscriptionEndsAt) {
        const billingCycle = tenant.plan === 'enterprise' ? 'yearly' : 'monthly';
        const periodDays = billingCycle === 'yearly' ? 365 : 30;
        tenant.subscriptionEndsAt = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);
      }
      tenant.trialEndsAt = null;
    } else if (status === 'trial') {
      tenant.isActive = true;
      tenant.subscriptionEndsAt = null;
      const platformSettings = await PlatformSetting.findOne().lean();
      const trialDays = platformSettings?.trialDays ?? 14;
      tenant.trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    } else if (status === 'suspended' || status === 'cancelled') {
      tenant.isActive = false;
    }
  }
  if (address !== undefined) tenant.address = address;
  if (city !== undefined) tenant.city = city;
  if (country !== undefined) tenant.country = country;

  await tenant.save();

  // Invalidate cached tenant so protect middleware picks up the new config
  await invalidateTenant(String(id));

  return tenant;
}

export async function archiveTenant(id) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound('Tenant not found');
  tenant.status = 'archived';
  tenant.isActive = false;
  await tenant.save();
  await invalidateTenant(String(id));
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
    ClinicalNote.deleteMany({ tenant: id }),
    DentalChart.deleteMany({ tenant: id }),
    Tenant.findByIdAndDelete(id),
  ]);

  // Invalidate all cached data for this tenant
  await invalidateTenant(String(id));
  await invalidateTenantRoles(String(id));
  await cacheDelPattern(`permission:*${id}*`);
}

export async function suspendTenant(id) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound('Tenant not found');
  tenant.status = 'suspended';
  tenant.isActive = false;
  await tenant.save();
  await invalidateTenant(String(id));
  return tenant;
}

export async function activateTenant(id) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound('Tenant not found');
  tenant.status = 'active';
  tenant.isActive = true;
  await tenant.save();
  await invalidateTenant(String(id));
  return tenant;
}

export async function getTenantStats(id) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw ApiError.notFound('Tenant not found');

  const [branchesCount, usersCount, doctorsCount, patientsCount, appointmentsCount, revenue] =
    await Promise.all([
      Branch.countDocuments({ tenant: id }),
      User.countDocuments({ tenant: id }),
      User.countDocuments({ tenant: id, isDoctor: true }),
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
