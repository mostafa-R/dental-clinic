import Branch from '../users/branch.model.js';
import Appointment from '../appointments/appointment.model.js';
import Invoice from '../billing/invoice.model.js';
import Patient from '../patients/patient.model.js';
import User from '../users/user.model.js';
import { round2 } from '../../constants/accounting.js';
import { planIncludesModule } from '../../constants/plans.js';
import { MODULES } from '../../constants/permissions.js';

/**
 * The modules the caller can actually open, in catalog order.
 *
 * Both conditions have to hold, and they are different questions:
 *   - the tenant's plan must include the module (it was paid for), and
 *   - the caller's role must grant at least one action on it.
 *
 * Previously this shipped the whole hardcoded catalog with an `enabled` flag
 * and let the UI grey the rest out under an "in development" label. That was
 * wrong twice over: an unsold module is not "in development", it is not
 * entitled; and a module the role cannot open was still shown, so the card led
 * straight to AccessDenied. The list now contains only real destinations.
 *
 * `dashboard` itself is excluded — the caller is already looking at it.
 *
 * The catalog comes from `constants/permissions.js` instead of a local copy:
 * the local list had drifted to 10 of the 21 modules, so newer ones never
 * appeared here at all.
 */
export function visibleModules(tenant, perms, isSystemAdmin) {
  return MODULES
    .filter((m) => m.key !== 'dashboard')
    .filter((m) => planIncludesModule(tenant, m.key))
    .filter((m) => isSystemAdmin || (perms[m.key] || []).length > 0)
    .map(({ key, label }) => ({ key, label }));
}

export async function getDashboardStats(branchFilter, user, role = {}) {
  // `role` is `req._roleResolved` from middleware/checkPermission.js. It used
  // to be passed as a bare `isSystemAdmin` boolean, which did not carry the
  // permission map — the module list needs both.
  const isSystemAdmin = !!role.isSystemAdmin;
  const perms =
    typeof role.permissionMap === 'function' ? role.permissionMap() || {} : {};

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
    isSystemAdmin || user.tenant
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
    modules: visibleModules(user.tenant, perms, isSystemAdmin),
  };
}
