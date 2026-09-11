import mongoose from 'mongoose';

import { round2 } from '../../../constants/accounting.js';
import { SITE_ROLES } from '../admin/admin.model.js';
import Appointment from '../../appointments/appointment.model.js';
import MedicalAttachment from '../../emr/attachment.model.js';
import ClinicalNote from '../../emr/clinicalNote.model.js';
import DentalChart from '../../emr/dentalChart.model.js';
import TreatmentPlan from '../../emr/treatmentPlan.model.js';
import Commission from '../../billing/commission.model.js';
import Invoice from '../../billing/invoice.model.js';
import Expense from '../../accounting/expense.model.js';
import InventoryItem from '../../inventory/inventory.model.js';
import Patient from '../../patients/patient.model.js';
import Subscription from '../tenant/subscription.model.js';
import Tenant from '../tenant/tenant.model.js';
import User from '../../users/user.model.js';
import Branch from '../../users/branch.model.js';
import AuditLog from '../audit/auditLog.model.js';
import SiteAdmin from '../admin/admin.model.js';
import ErrorLog from '../errorLog/errorLog.model.js';
import { getPerfStats } from '../../../utils/perfMonitor.js';
import { getLoginSecuritySnapshot } from '../../../utils/loginThrottle.js';

const ACTIVE_APPOINTMENT_STATUSES = ['scheduled', 'confirmed', 'checked_in', 'in_progress'];

export const APPOINTMENT_ANALYTIC_STATUSES = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
];

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfTomorrow(date = new Date()) {
  const d = new Date(date);
  d.setHours(24, 0, 0, 0);
  return d;
}

function daysAgo(n, from = new Date()) {
  return new Date(from.getTime() - n * 24 * 60 * 60 * 1000);
}

function formatMonthKey(d) {
  return `${d._id.year || d.year}-${String(d._id.month || d.month).padStart(2, '0')}`;
}

function monthSeriesMatch({ startDate, endDate }) {
  const filter = { createdAt: {} };
  if (startDate) filter.createdAt.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filter.createdAt.$lte = end;
  }
  if (Object.keys(filter.createdAt).length === 0) delete filter.createdAt;
  return filter;
}

export async function getPlatformOverview() {
  const now = new Date();
  const dayStart = startOfDay(now);
  const tomorrow = startOfTomorrow(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDays = daysAgo(30, now);

  const [
    tenantAgg,
    userAgg,
    branchCount,
    patientCount,
    appointmentFacet,
    revenueAgg,
    expenseAgg,
    paymentAgg,
    commissionAgg,
    inventoryFacet,
    subscriptionAgg,
    errorsToday,
    errorsThirtyDays,
    unresolvedErrors,
    attachmentsAgg,
    tenants,
    health,
  ] = await Promise.all([
    Tenant.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          trial: { $sum: { $cond: [{ $eq: ['$status', 'trial'] }, 1, 0] } },
          suspended: { $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          archived: { $sum: { $cond: [{ $eq: ['$status', 'archived'] }, 1, 0] } },
          newThisMonth: { $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, 1, 0] } },
        },
      },
    ]),
    User.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          doctors: { $sum: { $cond: ['$isDoctor', 1, 0] } },
        },
      },
    ]),
    Branch.countDocuments({}),
    Patient.countDocuments({ isActive: true }),
    Appointment.aggregate([
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          today: [
            { $match: { start: { $gte: dayStart, $lt: tomorrow } } },
            { $count: 'count' },
          ],
          upcoming: [
            {
              $match: {
                start: { $gte: now },
                status: { $in: ACTIVE_APPOINTMENT_STATUSES },
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ]),
    Invoice.aggregate([
      { $match: { status: { $ne: 'void' } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          thisMonth: {
            $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, '$total', 0] },
          },
          today: {
            $sum: { $cond: [{ $gte: ['$createdAt', dayStart] }, '$total', 0] },
          },
        },
      },
    ]),
    Expense.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          thisMonth: {
            $sum: { $cond: [{ $gte: ['$date', monthStart] }, '$amount', 0] },
          },
        },
      },
    ]),
    Invoice.aggregate([
      { $unwind: '$payments' },
      {
        $group: {
          _id: null,
          collected: {
            $sum: { $cond: [{ $eq: ['$payments.isRefund', false] }, '$payments.amount', 0] },
          },
          paymentCount: {
            $sum: { $cond: [{ $eq: ['$payments.isRefund', false] }, 1, 0] },
          },
          refunds: {
            $sum: {
              $cond: [{ $eq: ['$payments.isRefund', true] }, { $abs: '$payments.amount' }, 0],
            },
          },
          refundCount: {
            $sum: { $cond: [{ $eq: ['$payments.isRefund', true] }, 1, 0] },
          },
        },
      },
    ]),
    Commission.aggregate([
      { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    InventoryItem.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          value: [
            {
              $group: {
                _id: null,
                value: { $sum: { $multiply: ['$quantity', '$costPerUnit'] } },
              },
            },
          ],
          lowStock: [
            { $match: { $expr: { $lte: ['$quantity', '$reorderPoint'] } } },
            { $count: 'count' },
          ],
          outOfStock: [{ $match: { quantity: 0 } }, { $count: 'count' }],
        },
      },
    ]),
    Subscription.aggregate([
      { $match: { status: 'active' } },
      {
        $addFields: {
          monthlyAmount: {
            $cond: [{ $eq: ['$billingCycle', 'yearly'] }, { $divide: ['$amount', 12] }, '$amount'],
          },
        },
      },
      { $group: { _id: null, mrr: { $sum: '$monthlyAmount' }, count: { $sum: 1 } } },
    ]),
    ErrorLog.countDocuments({ createdAt: { $gte: dayStart } }),
    ErrorLog.countDocuments({ createdAt: { $gte: thirtyDays } }),
    ErrorLog.countDocuments({ resolved: false }),
    MedicalAttachment.aggregate([
      { $group: { _id: null, bytes: { $sum: '$size' } } },
    ]),
    Tenant.find().select('settings.storageLimit').lean(),
  ]).catch(() => {
    throw new Error('Failed to aggregate platform overview');
  });

  const t = tenantAgg[0] || {};
  const u = userAgg[0] || {};
  const apptFacet = appointmentFacet[0] || {};
  const statusRow = Object.fromEntries((apptFacet.byStatus || []).map((s) => [s._id, s.count]));
  const rev = revenueAgg[0] || {};
  const exp = expenseAgg[0] || {};
  const pay = paymentAgg[0] || {};
  const commissionByStatus = Object.fromEntries(
    (commissionAgg || []).map((c) => [c._id, { amount: c.amount, count: c.count }]),
  );
  const inv = inventoryFacet[0] || {};
  const sub = subscriptionAgg[0] || { mrr: 0, count: 0 };
  let healthSummary = null;
  let healthStatus = 'unknown';
  if (health) {
    healthStatus = health.status || 'unknown';
    healthSummary = {
      status: healthStatus,
      healthy: health.summary?.healthy,
      degraded: health.summary?.degraded,
      unhealthy: health.summary?.unhealthy,
      criticalFailures: health.summary?.criticalFailures,
    };
  }

  const attachmentBytes = attachmentsAgg[0]?.bytes || 0;
  const storageLimitMB = tenants.reduce((sum, tdoc) => sum + (tdoc.settings?.storageLimit || 0), 0);

  const commission = {
    total: round2(
      (commissionByStatus.pending?.amount || 0) + (commissionByStatus.paid?.amount || 0),
    ),
    paid: round2(commissionByStatus.paid?.amount || 0),
    pending: round2(commissionByStatus.pending?.amount || 0),
    count: (commissionByStatus.pending?.count || 0) + (commissionByStatus.paid?.count || 0),
  };

  return {
    tenants: {
      total: t.total || 0,
      active: t.active || 0,
      trial: t.trial || 0,
      suspended: t.suspended || 0,
      cancelled: t.cancelled || 0,
      archived: t.archived || 0,
      newThisMonth: t.newThisMonth || 0,
    },
    users: {
      total: u.total || 0,
      active: u.active || 0,
      inactive: (u.total || 0) - (u.active || 0),
      doctors: u.doctors || 0,
    },
    healthcare: {
      branches: branchCount,
      patients: { totalActive: patientCount },
      appointments: {
        total: APPOINTMENT_ANALYTIC_STATUSES.reduce((sum, s) => sum + (statusRow[s] || 0), 0),
        today: apptFacet.today?.[0]?.count || 0,
        upcoming: apptFacet.upcoming?.[0]?.count || 0,
        ...statusRow,
      },
    },
    financial: {
      revenue: { total: round2(rev.total || 0), thisMonth: round2(rev.thisMonth || 0), today: round2(rev.today || 0) },
      expenses: { total: round2(exp.total || 0), thisMonth: round2(exp.thisMonth || 0) },
      payments: { collected: round2(pay.collected || 0), count: pay.paymentCount || 0 },
      refunds: { total: round2(pay.refunds || 0), count: pay.refundCount || 0 },
      commissions: commission,
    },
    inventory: {
      items: inv.total?.[0]?.count || 0,
      totalValue: round2(inv.value?.[0]?.value || 0),
      lowStock: inv.lowStock?.[0]?.count || 0,
      outOfStock: inv.outOfStock?.[0]?.count || 0,
    },
    subscriptions: {
      mrr: round2(sub.mrr || 0),
      arr: round2((sub.mrr || 0) * 12),
      activeCount: sub.count || 0,
    },
    system: {
      storage: {
        estimatedUsedMB: round2(attachmentBytes / 1024 / 1024),
        storageLimitMB,
        files: 0,
      },
      errors: {
        today: errorsToday,
        thirtyDays: errorsThirtyDays,
        unresolved: unresolvedErrors,
      },
      health: healthSummary,
      uptime: process.uptime(),
    },
    generatedAt: now.toISOString(),
  };
}

export async function getFinancialAnalytics(filters = {}) {
  const { tenantId, branchId, doctorId, startDate, endDate } = filters;
  const match = monthSeriesMatch({ startDate, endDate });
  if (tenantId) match.tenant = tenantId;
  if (branchId) match.branch = branchId;

  const invoiceLookupStages = doctorId
    ? [
        {
          $lookup: {
            from: 'appointments',
            localField: 'appointment',
            foreignField: '_id',
            as: 'appt',
          },
        },
        { $unwind: { path: '$appt', preserveNullAndEmptyArrays: true } },
        { $match: { 'appt.doctor': doctorId } },
      ]
    : [];

  const [
    revenueAgg,
    revenueByTenant,
    revenueByBranch,
    revenueByDoctor,
    revenueByService,
    revenueSeries,
    expenseAgg,
    expenseByCategory,
    expenseByBranch,
    paymentAgg,
    paymentByMethod,
    refundAgg,
    refundSeries,
    commissionAgg,
    commissionByDoctor,
    outstandingAgg,
  ] = await Promise.all([
    Invoice.aggregate([
      { $match: { ...match, status: { $ne: 'void' } } },
      ...invoiceLookupStages,
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Invoice.aggregate([
      { $match: { ...match, status: { $ne: 'void' } } },
      { $group: { _id: '$tenant', revenue: { $sum: '$total' }, invoices: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: 100 },
    ]),
    Invoice.aggregate([
      { $match: { ...match, status: { $ne: 'void' } } },
      { $group: { _id: '$branch', revenue: { $sum: '$total' }, invoices: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: 100 },
    ]),
    Promise.resolve(
      doctorId
        ? []
        : Invoice.aggregate([
            { $match: { ...match, status: { $ne: 'void' } } },
            {
              $lookup: {
                from: 'appointments',
                localField: 'appointment',
                foreignField: '_id',
                as: 'appt',
              },
            },
            { $unwind: { path: '$appt', preserveNullAndEmptyArrays: true } },
            {
              $lookup: { from: 'users', localField: 'appt.doctor', foreignField: '_id', as: 'doc' },
            },
            { $unwind: { path: '$doc', preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: '$doc._id',
                name: { $first: { $ifNull: ['$doc.name', 'Unassigned'] } },
                revenue: { $sum: '$total' },
              },
            },
            { $sort: { revenue: -1 } },
            { $limit: 100 },
          ]),
    ),
    Invoice.aggregate([
      { $match: { ...match, status: { $ne: 'void' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.description',
          revenue: { $sum: { $multiply: [{ $ifNull: ['$items.quantity', 1] }, { $ifNull: ['$items.unitPrice', 0] }] } },
          units: { $sum: { $ifNull: ['$items.quantity', 1] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 30 },
    ]),
    Invoice.aggregate([
      { $match: { ...match, status: { $ne: 'void' } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Expense.aggregate([
      { $match },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match },
      { $group: { _id: '$category', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    Expense.aggregate([
      { $match },
      { $group: { _id: '$branch', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
      { $limit: 100 },
    ]),
    Invoice.aggregate([
      { $match },
      { $unwind: '$payments' },
      { $match: { 'payments.isRefund': false } },
      {
        $group: {
          _id: null,
          total: { $sum: '$payments.amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    Invoice.aggregate([
      { $match },
      { $unwind: '$payments' },
      { $match: { 'payments.isRefund': false } },
      {
        $group: {
          _id: '$payments.method',
          total: { $sum: '$payments.amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),
    Invoice.aggregate([
      { $match },
      { $unwind: '$payments' },
      { $match: { 'payments.isRefund': true } },
      {
        $group: {
          _id: null,
          total: { $sum: { $abs: '$payments.amount' } },
          count: { $sum: 1 },
        },
      },
    ]),
    Invoice.aggregate([
      { $match },
      { $unwind: '$payments' },
      { $match: { 'payments.isRefund': true } },
      {
        $group: {
          _id: { year: { $year: '$payments.date' }, month: { $month: '$payments.date' } },
          total: { $sum: { $abs: '$payments.amount' } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Commission.aggregate([
      { $match },
      { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Commission.aggregate([
      { $match },
      {
        $group: {
          _id: '$doctor',
          earned: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { earned: -1 } },
      { $limit: 100 },
    ]),
    Invoice.aggregate([
      { $match: { ...match, status: { $in: ['unpaid', 'partial'] } } },
      { $group: { _id: null, total: { $sum: { $subtract: ['$total', '$paidAmount'] } } } },
    ]),
  ]);

  const commissionByStatus = Object.fromEntries(commissionAgg.map((c) => [c._id, c]));

  return {
    filters: { tenantId, branchId, doctorId, startDate, endDate },
    revenue: {
      total: round2(revenueAgg[0]?.total || 0),
      byTenant: revenueByTenant,
      byBranch: revenueByBranch,
      byDoctor: revenueByDoctor,
      byService: revenueByService.map((s) => ({ service: s._id, revenue: round2(s.revenue), units: s.units })),
      byMonth: revenueSeries.map((r) => ({ month: formatMonthKey(r), revenue: round2(r.revenue) })),
    },
    expenses: {
      total: round2(expenseAgg[0]?.total || 0),
      count: expenseAgg[0]?.count || 0,
      byCategory: expenseByCategory,
      byBranch: expenseByBranch,
    },
    payments: {
      total: round2(paymentAgg[0]?.total || 0),
      count: paymentAgg[0]?.count || 0,
      byMethod: paymentByMethod,
    },
    refunds: {
      total: round2(refundAgg[0]?.total || 0),
      count: refundAgg[0]?.count || 0,
      byMonth: refundSeries.map((r) => ({ month: formatMonthKey(r), total: round2(r.total) })),
    },
    commissions: {
      total: round2(
        (commissionByStatus.pending?.amount || 0) + (commissionByStatus.paid?.amount || 0),
      ),
      paid: round2(commissionByStatus.paid?.amount || 0),
      pending: round2(commissionByStatus.pending?.amount || 0),
      voided: round2(commissionByStatus.void?.amount || 0),
      count: commissionAgg.reduce((sum, c) => sum + (c.count || 0), 0),
      byDoctor: commissionByDoctor,
    },
    outstanding: round2(outstandingAgg[0]?.total || 0),
  };
}

export async function getInventoryAnalytics(filters = {}) {
  const itemMatch = {};
  if (filters.tenantId) itemMatch.tenant = filters.tenantId;
  if (filters.branchId) itemMatch.branch = filters.branchId;

  const [
    summary,
    byCategory,
    byBranch,
    byTenant,
    mostUsed,
    lowStock,
    outOfStock,
    expired,
    suppliers,
  ] = await Promise.all([
    InventoryItem.aggregate([
      { $match: itemMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          value: { $sum: { $multiply: ['$quantity', '$costPerUnit'] } },
          totalQuantity: { $sum: '$quantity' },
        },
      },
    ]),
    InventoryItem.aggregate([
      { $match: itemMatch },
      { $group: { _id: '$category', items: { $sum: 1 }, quantity: { $sum: '$quantity' }, value: { $sum: { $multiply: ['$quantity', '$costPerUnit'] } } } },
      { $sort: { value: -1 } },
    ]),
    InventoryItem.aggregate([
      { $match: itemMatch },
      { $group: { _id: '$branch', items: { $sum: 1 }, quantity: { $sum: '$quantity' }, value: { $sum: { $multiply: ['$quantity', '$costPerUnit'] } } } },
      { $sort: { value: -1 } },
      { $limit: 200 },
    ]),
    InventoryItem.aggregate([
      { $match: itemMatch },
      { $group: { _id: '$tenant', items: { $sum: 1 }, value: { $sum: { $multiply: ['$quantity', '$costPerUnit'] } } } },
      { $sort: { value: -1 } },
      { $limit: 200 },
    ]),
    InventoryItem.aggregate([
      { $match: itemMatch },
      { $unwind: { path: '$transactions', preserveNullAndEmptyArrays: false } },
      { $match: { 'transactions.type': { $in: ['stock_out', 'expired'] } } },
      { $group: { _id: '$name', consumed: { $sum: { $abs: '$transactions.quantity' } } } },
      { $sort: { consumed: -1 } },
      { $limit: 20 },
    ]),
    InventoryItem.aggregate([
      { $match: { ...itemMatch, $expr: { $lte: ['$quantity', '$reorderPoint'] } } },
      { $count: 'count' },
    ]),
    InventoryItem.aggregate([
      { $match: { ...itemMatch, quantity: 0 } },
      { $count: 'count' },
    ]),
    InventoryItem.aggregate([
      { $match: { ...itemMatch, expiryDate: { $lt: new Date() } } },
      { $count: 'count' },
    ]),
    InventoryItem.distinct('supplier', { ...itemMatch, supplier: { $ne: '' } }),
  ]);

  const [tenantDocs, branchDocs] = await Promise.all([
    Tenant.find().select('name _id').lean(),
    Branch.find().select('name tenant _id').lean(),
  ]);

  const branchNameMap = new Map((branchDocs || []).map((b) => [String(b._id), b.name]));
  const branchTenantMap = new Map((branchDocs || []).map((b) => [String(b._id), String(b.tenant)]));
  const tenantNameMap = new Map((tenantDocs || []).map((t) => [String(t._id), t.name]));

  return {
    filters: { tenantId: filters.tenantId, branchId: filters.branchId },
    summary: {
      items: summary[0]?.total || 0,
      totalQuantity: summary[0]?.totalQuantity || 0,
      inventoryValue: round2(summary[0]?.value || 0),
      lowStock: lowStock[0]?.count || 0,
      outOfStock: outOfStock[0]?.count || 0,
      expired: expired[0]?.count || 0,
      suppliers: suppliers.length,
    },
    byCategory,
    byBranch: byBranch.map((b) => ({
      _id: b._id,
      name: branchNameMap.get(String(b._id)) || 'Unknown',
      tenantId: branchTenantMap.get(String(b._id)) || null,
      tenantName: tenantNameMap.get(branchTenantMap.get(String(b._id))) || 'Unknown',
      items: b.items,
      quantity: b.quantity,
      value: round2(b.value),
    })),
    byTenant: byTenant.map((r) => ({
      _id: r._id,
      name: tenantNameMap.get(String(r._id)) || 'Unknown',
      items: r.items,
      value: round2(r.value),
    })),
    mostUsed: mostUsed.map((m) => ({ item: m._id, consumed: m.consumed })),
  };
}

export async function getPatientAnalytics(filters = {}) {
  const now = new Date();
  const dayStart = startOfDay(now);
  const thirtyDays = daysAgo(30, now);

  const match = {};
  if (filters.tenantId) match.tenant = filters.tenantId;
  if (filters.branchId) match.branch = filters.branchId;

  const appointmentMatch = {};
  if (filters.tenantId) appointmentMatch.tenant = filters.tenantId;
  if (filters.branchId) appointmentMatch.branch = filters.branchId;

  const [
    patientSummary,
    byTenant,
    byBranch,
    byGender,
    ageBuckets,
    newPatients,
    activePatients,
    appointmentCount,
    visitsByTenant,
    planByStatus,
  ] = await Promise.all([
    Patient.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          newThirtyDays: {
            $sum: { $cond: [{ $gte: ['$createdAt', thirtyDays] }, 1, 0] },
          },
        },
      },
    ]),
    Patient.aggregate([
      { $match: match },
      { $group: { _id: '$tenant', patients: { $sum: 1 } } },
      { $sort: { patients: -1 } },
      { $limit: 200 },
    ]),
    Patient.aggregate([
      { $match: match },
      { $group: { _id: '$branch', patients: { $sum: 1 } } },
      { $sort: { patients: -1 } },
      { $limit: 200 },
    ]),
    Patient.aggregate([
      { $match: match },
      { $group: { _id: '$gender', patients: { $sum: 1 } } },
    ]),
    Patient.aggregate([
      {
        $match: { ...match, dateOfBirth: { $ne: null } },
      },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lte: ['$dateOfBirth', new Date(now.getFullYear() - 65, 0, 1)] }, then: '65+' },
                { case: { $lte: ['$dateOfBirth', new Date(now.getFullYear() - 45, 0, 1)] }, then: '45-64' },
                { case: { $lte: ['$dateOfBirth', new Date(now.getFullYear() - 25, 0, 1)] }, then: '25-44' },
                { case: { $lte: ['$dateOfBirth', new Date(now.getFullYear() - 18, 0, 1)] }, then: '18-24' },
                { case: { $lte: ['$dateOfBirth', new Date(now.getFullYear() - 13, 0, 1)] }, then: '13-17' },
                { case: { $lte: ['$dateOfBirth', new Date(now.getFullYear() - 5, 0, 1)] }, then: '5-12' },
              ],
              default: '0-4',
            },
          },
          patients: { $sum: 1 },
        },
      },
    ]),
    Patient.countDocuments({ ...match, createdAt: { $gte: dayStart } }),
    Patient.countDocuments({ ...match, isActive: true }),
    Appointment.countDocuments(appointmentMatch),
    Appointment.aggregate([
      { $match: appointmentMatch },
      { $group: { _id: '$tenant', appointments: { $sum: 1 } } },
    ]),
    TreatmentPlan.aggregate([
      { $match: appointmentMatch },
      { $group: { _id: '$status', plans: { $sum: 1 } } },
    ]),
  ]);

  const tenantNames = await Tenant.find({ _id: { $in: byTenant.map((r) => r._id) } })
    .select('name')
    .lean();
  const tenantNameMap = new Map(tenantNames.map((t) => [String(t._id), t.name]));
  const branchNames = await Branch.find({ _id: { $in: byBranch.map((r) => r._id) } })
    .select('name')
    .lean();
  const branchNameMap = new Map(branchNames.map((b) => [String(b._id), b.name]));

  const planByStatusMap = Object.fromEntries(planByStatus.map((p) => [p._id, p.plans]));

  return {
    filters: { tenantId: filters.tenantId, branchId: filters.branchId },
    summary: {
      total: patientSummary[0]?.total || 0,
      active: activePatients,
      newToday: newPatients,
      newThirtyDays: patientSummary[0]?.newThirtyDays || 0,
      avgVisits: appointmentCount > 0 && (patientSummary[0]?.total || 0) > 0
        ? round2(appointmentCount / patientSummary[0].total)
        : 0,
    },
    byTenant: byTenant.map((r) => ({
      _id: r._id,
      name: tenantNameMap.get(String(r._id)) || 'Unknown',
      patients: r.patients,
      appointments: visitsByTenant.find((v) => String(v._id) === String(r._id))?.appointments || 0,
    })),
    byBranch: byBranch.map((r) => ({
      _id: r._id,
      name: branchNameMap.get(String(r._id)) || 'Unknown',
      patients: r.patients,
    })),
    byGender: byGender.map((g) => ({ gender: g._id, patients: g.patients })),
    byAgeGroup: ageBuckets,
    treatmentPlans: {
      total: planByStatus.reduce((sum, p) => sum + p.plans, 0),
      byStatus: planByStatusMap,
    },
    phiExposure: false,
  };
}

export async function getAppointmentAnalytics(filters = {}) {
  const now = new Date();
  const dayStart = startOfDay(now);
  const tomorrow = startOfTomorrow(now);

  const match = {};
  if (filters.tenantId) match.tenant = filters.tenantId;
  if (filters.branchId) match.branch = filters.branchId;
  if (filters.doctorId) match.doctor = filters.doctorId;
  if (filters.startDate || filters.endDate) {
    match.start = {};
    if (filters.startDate) match.start.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      match.start.$lte = end;
    }
  }

  const [
    byStatus,
    today,
    upcoming,
    byTenant,
    byBranch,
    byDoctor,
    byMonth,
    noShowRate,
  ] = await Promise.all([
    Appointment.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Appointment.countDocuments({ ...match, start: { $gte: dayStart, $lt: tomorrow } }),
    Appointment.countDocuments({
      ...match,
      start: { $gte: now },
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    }),
    Appointment.aggregate([
      { $match: match },
      { $group: { _id: '$tenant', appointments: { $sum: 1 } } },
      { $sort: { appointments: -1 } },
      { $limit: 200 },
    ]),
    Appointment.aggregate([
      { $match: match },
      { $group: { _id: '$branch', appointments: { $sum: 1 } } },
      { $sort: { appointments: -1 } },
      { $limit: 200 },
    ]),
    Appointment.aggregate([
      { $match: match },
      { $group: { _id: '$doctor', appointments: { $sum: 1 } } },
      { $sort: { appointments: -1 } },
      { $limit: 200 },
    ]),
    Appointment.aggregate([
      { $match: match },
      {
        $group: {
          _id: { year: { $year: '$start' }, month: { $month: '$start' } },
          appointments: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Appointment.aggregate([
      {
        $match: {
          ...match,
          status: { $in: ['completed', 'no_show'] },
        },
      },
      {
        $group: {
          _id: null,
          noShow: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
    ]),
  ]);

  const tenantDocs = await Tenant.find({ _id: { $in: byTenant.map((r) => r._id) } })
    .select('name')
    .lean();
  const tenantNameMap = new Map(tenantDocs.map((t) => [String(t._id), t.name]));
  const branchDocs = await Branch.find({ _id: { $in: byBranch.map((r) => r._id) } })
    .select('name')
    .lean();
  const branchNameMap = new Map(branchDocs.map((b) => [String(b._id), b.name]));
  const doctorDocs = await User.find({ _id: { $in: byDoctor.map((r) => r._id) } })
    .select('name')
    .lean();
  const doctorNameMap = new Map(doctorDocs.map((d) => [String(d._id), d.name]));

  const statusMap = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  const noShowRow = noShowRate[0] || { noShow: 0, total: 0 };

  return {
    filters: {
      tenantId: filters.tenantId,
      branchId: filters.branchId,
      doctorId: filters.doctorId,
      startDate: filters.startDate,
      endDate: filters.endDate,
    },
    summary: {
      total: APPOINTMENT_ANALYTIC_STATUSES.reduce((sum, s) => sum + (statusMap[s] || 0), 0),
      today,
      upcoming,
      byStatus: statusMap,
      noShowRate: noShowRow.total > 0 ? round2((noShowRow.noShow / noShowRow.total) * 100) : 0,
    },
    byTenant: byTenant.map((r) => ({
      _id: r._id,
      name: tenantNameMap.get(String(r._id)) || 'Unknown',
      appointments: r.appointments,
    })),
    byBranch: byBranch.map((r) => ({
      _id: r._id,
      name: branchNameMap.get(String(r._id)) || 'Unknown',
      appointments: r.appointments,
    })),
    byDoctor: byDoctor.map((r) => ({
      _id: r._id,
      name: doctorNameMap.get(String(r._id)) || 'Unknown',
      appointments: r.appointments,
    })),
    byMonth: byMonth.map((m) => ({
      month: formatMonthKey(m),
      appointments: m.appointments,
    })),
  };
}

export async function getDoctorPerformanceAnalytics(filters = {}) {
  const match = {};
  if (filters.tenantId) match.tenant = filters.tenantId;
  if (filters.branchId) match.branch = filters.branchId;
  if (filters.doctorId) match.doctor = filters.doctorId;
  if (filters.startDate) match.start = { $gte: new Date(filters.startDate) };

  const todayStart = startOfDay();
  const doctorByAppointment = await Appointment.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$doctor',
        appointments: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        noShow: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } },
        today: {
          $sum: { $cond: [{ $gte: ['$start', todayStart] }, 1, 0] },
        },
        lastSeen: { $max: '$start' },
      },
    },
    { $sort: { appointments: -1 } },
    { $limit: 200 },
  ]);

  const doctorIds = doctorByAppointment.map((d) => d._id).filter(Boolean);
  const commissionMatch = {};
  if (filters.tenantId) commissionMatch.tenant = filters.tenantId;
  if (filters.branchId) commissionMatch.branch = filters.branchId;
  if (filters.doctorId) commissionMatch.doctor = filters.doctorId;
  if (filters.startDate) commissionMatch.createdAt = { $gte: new Date(filters.startDate) };

  const [doctors, commissions, patientsTreated] = await Promise.all([
    doctorIds.length
      ? User.find({ _id: { $in: doctorIds } })
          .select('name isActive branch tenant')
          .populate('branch', 'name')
          .populate('tenant', 'name')
          .lean()
      : [],
    Commission.aggregate([
      { $match: { ...commissionMatch, doctor: { $in: doctorIds } } },
      {
        $group: {
          _id: '$doctor',
          earned: { $sum: '$amount' },
          paid: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] },
          },
        },
      },
    ]),
    Appointment.aggregate([
      { $match: { ...match, doctor: { $in: doctorIds } } },
      { $group: { _id: '$doctor', patients: { $addToSet: '$patient' } } },
    ]),
  ]);

  const commissionMap = new Map(commissions.map((c) => [String(c._id), c]));
  const patientMap = new Map(patientsTreated.map((p) => [String(p._id), p.patients.length]));
  const doctorMap = new Map(doctors.map((d) => [String(d._id), d]));

  const rows = doctorByAppointment.map((row) => {
    const doctor = doctorMap.get(String(row._id));
    const commission = commissionMap.get(String(row._id)) || { earned: 0, paid: 0, pending: 0 };
    return {
      _id: row._id,
      name: doctor?.name || 'Unknown',
      branch: doctor?.branch?.name || null,
      tenant: doctor?.tenant?.name || null,
      isActive: !!doctor?.isActive,
      appointments: row.appointments,
      completed: row.completed,
      cancelled: row.cancelled,
      noShow: row.noShow,
      today: row.today,
      lastSeen: row.lastSeen,
      distinctPatients: patientMap.get(String(row._id)) || 0,
      completionRate:
        row.appointments > 0
          ? round2((row.completed / row.appointments) * 100)
          : 0,
      noShowRate:
        row.completed + row.noShow > 0
          ? round2((row.noShow / (row.completed + row.noShow)) * 100)
          : 0,
      commissions: {
        earned: round2(commission.earned || 0),
        paid: round2(commission.paid || 0),
        pending: round2(commission.pending || 0),
      },
    };
  });

  return {
    filters: {
      tenantId: filters.tenantId,
      branchId: filters.branchId,
      startDate: filters.startDate,
    },
    doctors: rows,
    summary: {
      doctors: rows.length,
      totalAppointments: rows.reduce((s, r) => s + r.appointments, 0),
      totalCommissions: round2(rows.reduce((s, r) => s + r.commissions.earned, 0)),
    },
  };
}

export async function getTreatmentAnalytics(filters = {}) {
  const match = {};
  if (filters.tenantId) match.tenant = filters.tenantId;
  if (filters.branchId) match.branch = filters.branchId;
  if (filters.startDate || filters.endDate) {
    match.createdAt = {};
    if (filters.startDate) match.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
  }

  const [byStatus, byBranch, byTenant, revenueAgg, totalCostAgg, itemCompletions, mostCommonProcedures] =
    await Promise.all([
      TreatmentPlan.aggregate([{ $match: match }, { $group: { _id: '$status', plans: { $sum: 1 } } }]),
      TreatmentPlan.aggregate([
        { $match: match },
        { $group: { _id: '$branch', plans: { $sum: 1 } } },
        { $sort: { plans: -1 } },
        { $limit: 200 },
      ]),
      TreatmentPlan.aggregate([
        { $match: match },
        { $group: { _id: '$tenant', plans: { $sum: 1 } } },
        { $sort: { plans: -1 } },
        { $limit: 200 },
      ]),
      TreatmentPlan.aggregate([
        { $match: match },
        { $unwind: '$items' },
        { $match: { 'items.status': 'completed' } },
        { $group: { _id: null, revenue: { $sum: '$items.estimatedCost' } } },
      ]),
      TreatmentPlan.aggregate([
        { $match: match },
        { $unwind: '$items' },
        { $group: { _id: null, total: { $sum: '$items.estimatedCost' } } },
      ]),
      TreatmentPlan.aggregate([
        { $match: match },
        { $unwind: '$items' },
        { $group: { _id: '$items.status', count: { $sum: 1 } } },
      ]),
      TreatmentPlan.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.procedureName',
            count: { $sum: 1 },
            estimated: { $sum: '$items.estimatedCost' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
    ]);

  const branchDocs = await Branch.find({ _id: { $in: byBranch.map((r) => r._id) } })
    .select('name')
    .lean();
  const branchNameMap = new Map(branchDocs.map((b) => [String(b._id), b.name]));
  const tenantDocs = await Tenant.find({ _id: { $in: byTenant.map((r) => r._id) } })
    .select('name')
    .lean();
  const tenantNameMap = new Map(tenantDocs.map((t) => [String(t._id), t.name]));

  const statusMap = Object.fromEntries(byStatus.map((s) => [s._id, s.plans]));

  return {
    filters: { tenantId: filters.tenantId, branchId: filters.branchId, startDate: filters.startDate, endDate: filters.endDate },
    summary: {
      total: byStatus.reduce((sum, s) => sum + s.plans, 0),
      byStatus: statusMap,
      estimatedRevenue: round2(totalCostAgg[0]?.total || 0),
      completedRevenue: round2(revenueAgg[0]?.revenue || 0),
      completedItems: itemCompletions.find((i) => i._id === 'completed')?.count || 0,
    },
    byBranch: byBranch.map((r) => ({ _id: r._id, name: branchNameMap.get(String(r._id)) || 'Unknown', plans: r.plans })),
    byTenant: byTenant.map((r) => ({ _id: r._id, name: tenantNameMap.get(String(r._id)) || 'Unknown', plans: r.plans })),
    mostCommonProcedures: mostCommonProcedures.map((p) => ({
      procedure: p._id,
      count: p.count,
      estimated: round2(p.estimated),
    })),
    phiExposure: false,
  };
}

export async function getSaaSBillingAnalytics() {
  const now = new Date();

  const [
    byStatus,
    mrrAgg,
    revenueByPlan,
    revenueByMonth,
    recentChurned,
    renewalsUpcoming,
    trials,
  ] = await Promise.all([
    Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Subscription.aggregate([
      { $match: { status: 'active' } },
      {
        $addFields: {
          monthlyAmount: {
            $cond: [{ $eq: ['$billingCycle', 'yearly'] }, { $divide: ['$amount', 12] }, '$amount'],
          },
        },
      },
      { $group: { _id: null, mrr: { $sum: '$monthlyAmount' }, count: { $sum: 1 } } },
    ]),
    Subscription.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$plan',
          revenue: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    Subscription.aggregate([
      {
        $match: {
          status: 'active',
          lastPaymentAt: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$lastPaymentAt' }, month: { $month: '$lastPaymentAt' } },
          revenue: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Tenant.countDocuments({
      status: 'cancelled',
      updatedAt: { $gte: daysAgo(30, now) },
    }),
    Subscription.find({
      status: 'active',
      nextPaymentAt: {
        $gte: now,
        $lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    })
      .populate('tenant', 'name')
      .select('amount billingCycle nextPaymentAt plan')
      .lean(),
    Promise.all([
      Tenant.countDocuments({ status: { $in: ['trial', 'active'] } }),
      Tenant.countDocuments({ status: 'active' }),
      Tenant.countDocuments({ status: 'trial' }),
    ]),
  ]);

  const [trialFunnel, convertedCount, activeTrials] = trials;
  const totalTenants = await Tenant.countDocuments({});

  const statusMap = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  const mrr = mrrAgg[0]?.mrr || 0;
  const activeCount = mrrAgg[0]?.count || 0;
  const churnRate = totalTenants > 0 ? round2((recentChurned / totalTenants) * 100) : 0;
  const trialConversionRate =
    trialFunnel > 0 ? round2((convertedCount / trialFunnel) * 100) : 0;

  return {
    summary: {
      totalSubscriptions: byStatus.reduce((sum, s) => sum + s.count, 0),
      active: activeCount,
      activeTenants: convertedCount,
      trial: activeTrials,
      byStatus: {
        active: statusMap.active || 0,
        pending: statusMap.pending || 0,
        past_due: statusMap.past_due || 0,
        cancelled: statusMap.cancelled || 0,
      },
      mrr: round2(mrr),
      arr: round2(mrr * 12),
      churnRate,
      churnedLast30: recentChurned,
      trialConversionRate,
      renewalRevenueNext30Days: round2(
        renewalsUpcoming.reduce((sum, r) => sum + (r.amount || 0), 0),
      ),
    },
    revenueByPlan: revenueByPlan.map((r) => ({
      plan: r._id,
      revenue: round2(r.revenue),
      count: r.count,
    })),
    revenueByMonth: revenueByMonth.map((r) => ({
      month: formatMonthKey(r),
      revenue: round2(r.revenue),
    })),
    renewalsUpcoming: renewalsUpcoming.map((r) => ({
      subscriptionId: r._id,
      tenantId: r.tenant?._id,
      tenantName: r.tenant?.name || 'Unknown',
      plan: r.plan,
      amount: r.amount,
      billingCycle: r.billingCycle,
      nextPaymentAt: r.nextPaymentAt,
    })),
  };
}

export async function getSecurityMonitoring() {
  const now = new Date();
  const thirtyDays = daysAgo(30, now);

  const SECURITY_ACTIONS = [
    'admin.update_permissions',
    'role.permissions_change',
    'user.password_reset',
    'user.deactivate',
    'user.activate',
    '2fa.enable',
    '2fa.disable',
    'auth.recovery_attempt',
    'impersonation.start',
    'impersonation.end',
  ];

  const [admins, failedLoginSnapshot, securityEvents, impersonationLogs, auditTotal, chainResult] =
    await Promise.all([
      SiteAdmin.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            with2fa: { $sum: { $cond: ['$twoFactorEnabled', 1, 0] } },
            byRole: { $push: { role: '$role', count: 1 } },
          },
        },
      ]),
      getLoginSecuritySnapshot().catch(() => null),
      AuditLog.aggregate([
        { $match: { action: { $in: SECURITY_ACTIONS }, createdAt: { $gte: thirtyDays } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        {
          $match: {
            action: { $in: ['impersonation.start', 'impersonation.end'] },
            createdAt: { $gte: thirtyDays },
          },
        },
        { $group: { _id: '$action', count: { $sum: 1 } } },
      ]),
      AuditLog.countDocuments({}),
    ]);

  let chainValid = null;
  try {
    const { verifyAuditChain } = await import('../../../utils/auditChain.js');
    const result = await verifyAuditChain();
    chainValid = { valid: result.valid, checked: result.checked, errors: result.errors };
  } catch {
    chainValid = { valid: null, checked: 0, errors: ['Audit chain verification unavailable'] };
  }

  const adminRow = admins[0] || { total: 0, with2fa: 0 };

  return {
    summary: {
      siteAdmins: adminRow.total || 0,
      twoFactorEnabled: adminRow.with2fa || 0,
      twoFactorNotEnabled: (adminRow.total || 0) - (adminRow.with2fa || 0),
      securityEventsLast30Days: securityEvents.reduce((sum, e) => sum + e.count, 0),
      impersonationsLast30Days: impersonationLogs.reduce((sum, e) => sum + e.count, 0),
      totalAuditRecords: auditTotal,
      failedLoginChallenges: failedLoginSnapshot?.failed?.total ?? null,
      lockedAccounts: failedLoginSnapshot?.lockedAccounts?.length ?? null,
    },
    admin2fa: {
      total: adminRow.total || 0,
      enabled: adminRow.with2fa || 0,
      disabled: (adminRow.total || 0) - (adminRow.with2fa || 0),
      byRole: adminRow.byRole || [],
    },
    loginThrottle: failedLoginSnapshot,
    securityEvents: securityEvents.map((e) => ({ action: e._id, count: e.count })),
    impersonation: impersonationLogs.map((e) => ({ action: e._id, count: e.count })),
    auditChain: chainValid,
  };
}

export async function getSystemActivity() {
  const now = new Date();
  const dayStart = startOfDay(now);
  const thirtyDays = daysAgo(30, now);

  const perfStats = getPerfStats();
  const [errorsToday, errorsThirtyDays, unresolved, auditToday, health] = await Promise.all([
    ErrorLog.countDocuments({ createdAt: { $gte: dayStart } }),
    ErrorLog.countDocuments({ createdAt: { $gte: thirtyDays } }),
    ErrorLog.countDocuments({ resolved: false }),
    AuditLog.countDocuments({ createdAt: { $gte: dayStart } }),
    import('../../../utils/healthMonitor.js').then((m) => m.getSystemHealth()).catch(() => null),
  ]);

  const onlineSockets = await getOnlineSocketCount().catch(() => 0);

  let mongoStatus = 'unknown';
  let redisStatus = 'unknown';
  if (health) {
    const mongo = health.checks.find((c) => c.component === 'database');
    const redis = health.checks.find((c) => c.component === 'redis');
    mongoStatus = mongo?.status || 'unknown';
    redisStatus = redis?.status || 'unknown';
  }

  return {
    generatedAt: now.toISOString(),
    summary: {
      health: health?.status || 'unknown',
      uptime: Math.floor(process.uptime()),
      onlineSockets,
    },
    infrastructure: {
      mongodb: { status: mongoStatus },
      redis: { status: redisStatus },
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    },
    apiUsage: {
      totalRequests: perfStats.totals?.totalRequests || 0,
      avgResponseMs: round2(perfStats.globalAvgMs || 0),
      errorRate: perfStats.totals?.totalRequests
        ? round2((perfStats.totals.totalErrors / perfStats.totals.totalRequests) * 100)
        : 0,
      routesUnder200ms: perfStats.routesUnder200ms || 0,
    },
    errors: {
      today: errorsToday,
      thirtyDays: errorsThirtyDays,
      unresolved,
    },
    auditActivityToday: auditToday,
  };
}

async function getOnlineSocketCount() {
  try {
    const { getIO } = await import('../../../socket/index.js');
    const io = getIO();
    return io?.engine?.clientsCount || 0;
  } catch {
    return 0;
  }
}

export async function getBackgroundJobs() {
  const db = mongoose.connection.db;
  let locks;
  try {
    locks = await db.collection('cron_locks').find({}).toArray();
  } catch {
    locks = [];
  }
  const lockMap = new Map(locks.map((l) => [String(l._id), l]));
  const nowMs = Date.now();

  const catalog = [
    { key: 'suspension-cron', name: 'Tenant auto-suspend', schedule: 'daily 00:00', description: 'Suspends tenants with overdue subscriptions' },
    { key: 'no_show_cron', name: 'No-show detection', schedule: 'every 10 minutes', description: 'Marks un-arrived appointments as no-show' },
    { key: 'installment_cron', name: 'Installment overdue', schedule: 'daily 02:00', description: 'Marks overdue installments' },
    { key: 'whatsapp_reminder_cron', name: 'Appointment reminders', schedule: 'periodic', description: 'Sends WhatsApp appointment reminders' },
    { key: 'inventory_cron', name: 'Inventory maintenance', schedule: 'daily', description: 'Expiry / low-stock maintenance' },
    { key: 'consent_expiry_cron', name: 'Consent expiry', schedule: 'every 15 minutes', description: 'Expires pending consents' },
    { key: 'backup_scheduler', name: 'Backup scheduler', schedule: 'configured', description: 'Runs scheduled encrypted backups' },
    { key: 'abuse_monitor', name: 'Abuse detection flusher', schedule: 'periodic', description: 'Flushes suspicious activity counters' },
  ];

  return {
    jobs: catalog.map((job) => {
      const lock = lockMap.get(job.key);
      const running = !!(lock && lock.expiresAt && new Date(lock.expiresAt).getTime() > nowMs);
      return {
        ...job,
        running,
        lastAcquiredAt: lock?.acquiredAt || null,
        expiresAt: lock?.expiresAt || null,
      };
    }),
  };
}

export async function getUsageAnalytics() {
  const tenants = await Tenant.find()
    .select('name plan status settings storageLimit planModules')
    .sort('name')
    .lean();

  const tenantRows = [];
  for (const tenant of tenants) {
    const tenantId = tenant._id;
    const [branches, users, doctors, patients, appointments, chartEntries, clinicalNotes, attachmentBytes] =
      await Promise.all([
        Branch.countDocuments({ tenant: tenantId }),
        User.countDocuments({ tenant: tenantId }),
        User.countDocuments({ tenant: tenantId, isDoctor: true }),
        Patient.countDocuments({ tenant: tenantId, isActive: true }),
        Appointment.countDocuments({ tenant: tenantId }),
        DentalChart.countDocuments({ tenant: tenantId }),
        ClinicalNote.countDocuments({ tenant: tenantId }),
        MedicalAttachment.aggregate([
          { $match: { tenant: tenantId } },
          { $group: { _id: null, bytes: { $sum: '$size' } } },
        ]),
      ]);

    const estimatedStorageMB = Math.round(
      (attachmentBytes[0]?.bytes || 0) / 1024 / 1024 +
        (chartEntries * 0.05 + clinicalNotes * 0.01),
    );

    tenantRows.push({
      _id: tenant._id,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      usage: {
        branches,
        users,
        doctors,
        patients,
        appointments,
        files: 0,
        storageMB: round2(estimatedStorageMB),
      },
      limits: {
        branches: tenant.settings?.maxBranches ?? null,
        doctors: tenant.settings?.maxDoctors ?? null,
        patients: tenant.settings?.maxPatients ?? null,
        storageMB: tenant.settings?.storageLimit ?? null,
      },
    });
  }

  const planTotals = new Map();
  for (const row of tenantRows) {
    const key = row.plan || 'unknown';
    const cur = planTotals.get(key) || {
      tenants: 0,
      users: 0,
      doctors: 0,
      patients: 0,
      branches: 0,
      appointments: 0,
      storageMB: 0,
      storageLimitMB: 0,
    };
    cur.tenants += 1;
    cur.users += row.usage.users;
    cur.doctors += row.usage.doctors;
    cur.patients += row.usage.patients;
    cur.branches += row.usage.branches;
    cur.appointments += row.usage.appointments;
    cur.storageMB = round2(cur.storageMB + row.usage.storageMB);
    cur.storageLimitMB += row.limits.storageMB ?? 0;
    planTotals.set(key, cur);
  }

  const global = Array.from(planTotals.values()).reduce(
    (acc, p) => ({
      tenants: acc.tenants + p.tenants,
      users: acc.users + p.users,
      doctors: acc.doctors + p.doctors,
      patients: acc.patients + p.patients,
      branches: acc.branches + p.branches,
      appointments: acc.appointments + p.appointments,
      storageMB: round2(acc.storageMB + p.storageMB),
      storageLimitMB: acc.storageLimitMB + p.storageLimitMB,
    }),
    { tenants: 0, users: 0, doctors: 0, patients: 0, branches: 0, appointments: 0, storageMB: 0, storageLimitMB: 0 },
  );

  return {
    global,
    byPlan: Array.from(planTotals.entries()).map(([plan, usage]) => ({ plan, ...usage })),
    byTenant: tenantRows,
  };
}

export const SITE_ROLES_LIST = SITE_ROLES;