import Branch from '../models/Branch.js';
import Appointment from '../models/Appointment.js';
import Invoice from '../models/Invoice.js';
import Patient from '../models/Patient.js';
import User from '../models/User.js';
import { ROLES } from '../constants/roles.js';
import { round2 } from '../constants/accounting.js';
import asyncHandler from '../utils/asyncHandler.js';
import { filterByBranch } from '../utils/branchScope.js';
import { sendSuccess } from '../utils/sendSuccess.js';

const MODULES = [
  { key: 'patients', label: 'Patients', enabled: true },
  { key: 'appointments', label: 'Appointments', enabled: true },
  { key: 'billing', label: 'Billing', enabled: true },
  { key: 'inventory', label: 'Inventory', enabled: false },
];

export const getStats = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const role = req.user.role;
  const isSuperAdmin = role === 'site_admin' || role === 'super_admin';
  const isClinicAdmin = role === 'clinic_admin';

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const todayFilter = { ...branchFilter, start: { $gte: dayStart, $lte: dayEnd } };

  const [
    totalStaff,
    activeStaff,
    doctors,
    staffByRoleAgg,
    recentStaff,
    branches,
    totalPatients,
    todaysAppointments,
    queueAgg,
    billingOutstandingAgg,
    todaysInvoices,
  ] = await Promise.all([
    User.countDocuments(branchFilter),
    User.countDocuments({ ...branchFilter, isActive: true }),
    User.countDocuments({ ...branchFilter, $or: [{ isDoctor: true }, { role: 'doctor' }] }),
    User.aggregate([
      { $match: branchFilter },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    User.find(branchFilter)
      .sort('-createdAt')
      .limit(5)
      .select('name email role createdAt'),
    isSuperAdmin
      ? Branch.find(req.user.tenant ? { tenant: req.user.tenant } : {}).lean().sort('name')
      : isClinicAdmin
        ? Branch.find({ tenant: req.user.tenant }).lean().sort('name')
        : Branch.find({ _id: req.user.branch }).lean(),
    Patient.countDocuments(branchFilter),
    Appointment.countDocuments(todayFilter),
    Appointment.aggregate([
      { $match: todayFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { ...branchFilter, status: { $ne: 'void' } } },
      { $group: { _id: null, outstanding: { $sum: { $subtract: ['$total', '$paidAmount'] } } } },
    ]),
    Invoice.countDocuments({
      ...branchFilter,
      status: { $ne: 'void' },
      createdAt: { $gte: dayStart, $lte: dayEnd },
    }),
  ]);

  const queueByStatus = Object.fromEntries(queueAgg.map((q) => [q._id, q.count]));

  const branchIds = branches.map((b) => b._id);
  const branchCountsAgg = branchIds.length
    ? await User.aggregate([
        { $match: { branch: { $in: branchIds } } },
        { $group: { _id: '$branch', count: { $sum: 1 } } },
      ])
    : [];
  const countByBranch = new Map(branchCountsAgg.map((b) => [String(b._id), b.count]));

  const branchesWithStaff = branches.map((b) => ({
    _id: b._id,
    name: b.name,
    isActive: b.isActive,
    staffCount: countByBranch.get(String(b._id)) || 0,
  }));

  const staffByRole = ROLES.map((role) => ({
    role,
    count: staffByRoleAgg.find((r) => r._id === role)?.count || 0,
  })).filter((r) => r.count > 0);

  return sendSuccess(res, {
    summary: {
      totalStaff,
      activeStaff,
      inactiveStaff: totalStaff - activeStaff,
      doctors,
      branches: branchesWithStaff.length,
      totalPatients,
      todaysAppointments,
      todaysInvoices,
      outstanding: round2(billingOutstandingAgg[0]?.outstanding || 0),
    },
    queueByStatus,
    staffByRole,
    recentStaff,
    branches: branchesWithStaff,
    modules: MODULES,
  });
});
