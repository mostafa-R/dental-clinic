import Appointment from '../../appointments/appointment.model.js';
import Branch from '../../users/branch.model.js';
import ClinicalNote from '../../emr/clinicalNote.model.js';
import DentalChart from '../../emr/dentalChart.model.js';
import Invoice from '../../billing/invoice.model.js';
import Patient from '../../patients/patient.model.js';
import Subscription from '../tenant/subscription.model.js';
import Tenant from '../tenant/tenant.model.js';
import User from '../../users/user.model.js';

export async function getGlobalStats() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalTenants,
    activeTenants,
    totalPatients,
    totalAppointments,
    newTenantsThisMonth,
    revenueAgg,
    subscriptionRevenue,
  ] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ status: 'active' }),
    Patient.countDocuments(),
    Appointment.countDocuments(),
    Tenant.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Invoice.aggregate([
      { $match: { status: { $ne: 'void' } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Subscription.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: null, mrr: { $sum: '$amount' } } },
    ]),
  ]);

  const churnedTenants = await Tenant.countDocuments({
    status: 'cancelled',
    updatedAt: { $gte: thirtyDaysAgo },
  });
  const churnRate = totalTenants > 0 ? (churnedTenants / totalTenants) * 100 : 0;
  const monthlyRecurring = subscriptionRevenue[0]?.mrr || 0;
  const arpa = activeTenants > 0 ? monthlyRecurring / activeTenants : 0;

  return {
    totalTenants,
    activeTenants,
    totalPatients,
    totalAppointments,
    newTenantsThisMonth,
    totalRevenue: revenueAgg[0]?.total || 0,
    monthlyRecurring,
    arpa,
    churnRate,
  };
}

export async function getGrowthData(period = '6months') {
  const now = new Date();
  let startDate;

  switch (period) {
    case '30days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '12months':
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      break;
    case '6months':
    default:
      startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
  }

  const [tenantGrowth, patientGrowth, revenueByMonth] = await Promise.all([
    Tenant.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Patient.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Invoice.aggregate([
      { $match: { status: { $ne: 'void' }, createdAt: { $gte: startDate } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, total: { $sum: '$total' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  const formatMonthData = (data) =>
    data.map((d) => ({
      month: `${d._id.year}-${String(d._id.month).padStart(2, '0')}`,
      count: d.count || d.total,
    }));

  return {
    tenants: formatMonthData(tenantGrowth),
    patients: formatMonthData(patientGrowth),
    revenue: formatMonthData(revenueByMonth),
  };
}

export async function getTenantUsage(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return null;

  const [branches, users, doctors, patients, chartEntries, clinicalNotes] = await Promise.all([
    Branch.countDocuments({ tenant: tenantId }),
    User.countDocuments({ tenant: tenantId }),
    User.countDocuments({ tenant: tenantId, $or: [{ isDoctor: true }, { role: 'doctor' }] }),
    Patient.countDocuments({ tenant: tenantId }),
    DentalChart.countDocuments({ tenant: tenantId }),
    ClinicalNote.countDocuments({ tenant: tenantId }),
  ]);

  const estimatedStorageMB = Math.round((chartEntries * 0.05 + clinicalNotes * 0.01) * 10) / 10;

  return {
    branches: { used: branches, limit: tenant.settings.maxBranches },
    users: { used: users, limit: tenant.settings.maxDoctors * 3 },
    doctors: { used: doctors, limit: tenant.settings.maxDoctors },
    patients: { used: patients, limit: tenant.settings.maxPatients },
    storage: { used: estimatedStorageMB, limit: tenant.settings.storageLimit, unit: 'MB' },
  };
}
