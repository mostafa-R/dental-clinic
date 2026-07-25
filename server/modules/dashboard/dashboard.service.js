import Branch from '../users/branch.model.js';
import Appointment from '../appointments/appointment.model.js';
import Invoice from '../billing/invoice.model.js';
import Patient from '../patients/patient.model.js';
import User from '../users/user.model.js';
import { round2 } from '../../constants/accounting.js';

export async function getDashboardStats(branchFilter, user, isSystemAdmin = false) {

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const todayFilter = { ...branchFilter, start: { $gte: dayStart, $lte: dayEnd } };

  const [
    staffStats,
    recentStaff,
    branches,
    totalPatients,
    appointmentStats,
    billingOutstandingAgg,
    todaysInvoices,
  ] = await Promise.all([
    User.aggregate([
      { $match: branchFilter },
      {
        $facet: {
          totalStaff: [{ $count: 'count' }],
          activeStaff: [{ $match: { isActive: true } }, { $count: 'count' }],
          doctors: [{ $match: { isDoctor: true } }, { $count: 'count' }],
          byRole: [
            { $group: { _id: '$roleId', count: { $sum: 1 } } },
            {
              $lookup: {
                from: 'roles',
                localField: '_id',
                foreignField: '_id',
                as: 'roleDoc',
              },
            },
            { $unwind: { path: '$roleDoc', preserveNullAndEmptyArrays: true } },
            { $project: { _id: 1, name: { $ifNull: ['$roleDoc.name', 'Unknown'] }, count: 1 } },
          ],
        },
      },
    ]),
    User.find(branchFilter)
      .sort('-createdAt')
      .limit(5)
      .select('name email roleId isDoctor createdAt'),
    isSystemAdmin
      ? Branch.find(user.tenant ? { tenant: user.tenant } : { _id: { $in: [] } }).lean().sort('name')
      : Branch.find({ _id: user.branch }).lean(),
    Patient.countDocuments(branchFilter),
    Appointment.aggregate([
      { $match: todayFilter },
      {
        $facet: {
          count: [{ $count: 'count' }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        },
      },
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

  const staffRow = staffStats[0] || {};
  const totalStaff = staffRow.totalStaff?.[0]?.count || 0;
  const activeStaff = staffRow.activeStaff?.[0]?.count || 0;
  const doctors = staffRow.doctors?.[0]?.count || 0;
  const staffByRoleAgg = staffRow.byRole || [];

  const apptRow = appointmentStats[0] || {};
  const todaysAppointments = apptRow.count?.[0]?.count || 0;
  const queueAgg = apptRow.byStatus || [];

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

  const staffByRole = staffByRoleAgg.map((r) => ({
    role: r.name || 'Unknown',
    count: r.count,
  }));

  return {
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
    modules: [
      { key: 'patients', label: 'Patients', enabled: true },
      { key: 'appointments', label: 'Appointments', enabled: true },
      { key: 'billing', label: 'Billing', enabled: true },
      { key: 'accounting', label: 'Accounting', enabled: true },
      { key: 'inventory', label: 'Inventory', enabled: true },
      { key: 'branches', label: 'Branches', enabled: true },
      { key: 'chat', label: 'Chat', enabled: true },
      { key: 'users', label: 'Users', enabled: true },
      { key: 'roles', label: 'Roles', enabled: true },
      { key: 'settings', label: 'Settings', enabled: true },
    ],
  };
}
