import Appointment from "../models/Appointment.js";
import Branch from "../models/Branch.js";
import ClinicalNote from "../models/ClinicalNote.js";
import DentalChart from "../models/DentalChart.js";
import Invoice from "../models/Invoice.js";
import Patient from "../models/Patient.js";
import Subscription from "../models/Subscription.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/sendSuccess.js";

// Get global platform statistics
export const getGlobalStats = asyncHandler(async (_req, res) => {
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
    Tenant.countDocuments({ status: "active" }),
    Patient.countDocuments(),
    Appointment.countDocuments(),
    Tenant.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Invoice.aggregate([
      { $match: { status: { $ne: "void" } } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    Subscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: null, mrr: { $sum: "$amount" } } },
    ]),
  ]);

  // Calculate churn rate (simplified)
  const churnedTenants = await Tenant.countDocuments({
    status: "cancelled",
    updatedAt: { $gte: thirtyDaysAgo },
  });
  const churnRate =
    totalTenants > 0 ? (churnedTenants / totalTenants) * 100 : 0;

  const monthlyRecurring = subscriptionRevenue[0]?.mrr || 0;
  const arpa = activeTenants > 0 ? monthlyRecurring / activeTenants : 0;

  return sendSuccess(res, {
    totalTenants,
    activeTenants,
    totalPatients,
    totalAppointments,
    newTenantsThisMonth,
    totalRevenue: revenueAgg[0]?.total || 0,
    monthlyRecurring,
    arpa,
    churnRate,
  });
});

// Get growth data for charts
export const getGrowthData = asyncHandler(async (req, res) => {
  const { period = "6months" } = req.query;

  let startDate;
  const now = new Date();

  switch (period) {
    case "30days":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "12months":
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      break;
    case "6months":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
  }

  // Tenant growth by month
  const tenantGrowth = await Tenant.aggregate([
    {
      $match: { createdAt: { $gte: startDate } },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  // Patient growth by month
  const patientGrowth = await Patient.aggregate([
    {
      $match: { createdAt: { $gte: startDate } },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  // Revenue by month
  const revenueByMonth = await Invoice.aggregate([
    {
      $match: { status: { $ne: "void" }, createdAt: { $gte: startDate } },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        total: { $sum: "$total" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  // Format data for charts
  const formatMonthData = (data) =>
    data.map((d) => ({
      month: `${d._id.year}-${String(d._id.month).padStart(2, "0")}`,
      count: d.count || d.total,
    }));

  return sendSuccess(res, {
    tenants: formatMonthData(tenantGrowth),
    patients: formatMonthData(patientGrowth),
    revenue: formatMonthData(revenueByMonth),
  });
});

// Get tenant usage details
export const getTenantUsage = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    return sendSuccess(res, null);
  }

  const [branches, users, doctors, patients, chartEntries, clinicalNotes, storage] = await Promise.all([
    Branch.countDocuments({ tenant: tenantId }),
    User.countDocuments({ tenant: tenantId }),
    User.countDocuments({ tenant: tenantId, $or: [{ isDoctor: true }, { role: 'doctor' }] }),
    Patient.countDocuments({ tenant: tenantId }),
    DentalChart.countDocuments({ tenant: tenantId }),
    ClinicalNote.countDocuments({ tenant: tenantId }),
    // Storage: estimate from available data (charts × ~50KB per image + notes × ~10KB)
    Promise.resolve({ used: 0, limit: tenant.settings.storageLimit }),
  ]);

  // Estimate storage used from chart images and clinical notes
  const estimatedStorageMB = Math.round((chartEntries * 0.05 + clinicalNotes * 0.01) * 10) / 10;

  return sendSuccess(res, {
    branches: { used: branches, limit: tenant.settings.maxBranches },
    users: { used: users, limit: tenant.settings.maxDoctors * 3 },
    doctors: { used: doctors, limit: tenant.settings.maxDoctors },
    patients: { used: patients, limit: tenant.settings.maxPatients },
    storage: { used: estimatedStorageMB, limit: tenant.settings.storageLimit, unit: 'MB' },
  });
});
