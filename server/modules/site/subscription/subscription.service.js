import ApiError from '../../../utils/ApiError.js';
import { cacheDel, invalidateTenant } from '../../../utils/cache.js';
import { round2 } from '../../../constants/accounting.js';
import { withTransaction } from '../../../core/transaction.js';
import { planKeyOf, resolvePlanDoc } from '../../platform/plan.utils.js';
import Subscription from '../tenant/subscription.model.js';
import Tenant from '../tenant/tenant.model.js';

export async function getPlanPrice(planKey, billingCycle) {
  // Strict: plan is required, no 99 fallback.
  const planDoc = await resolvePlanDoc(planKey);
  if (planDoc?.price === undefined || planDoc?.price === null) {
    throw ApiError.badRequest('Plan price is required', { plan: 'price required' });
  }
  const price = planDoc.price;

  if (billingCycle === 'yearly') {
    // Always store yearly as 12x monthly so MRR calculation (amount / 12) is correct
    return round2(price * 12);
  }

  // For monthly billing cycle:
  // - If plan interval is 'year', divide by 12 to get monthly equivalent
  // - If plan interval is 'month', use price as-is
  return round2(planDoc?.interval === 'year' ? price / 12 : price);
}

export async function listSubscriptions() {
  return Subscription.find()
    .populate('tenant', 'name email plan status')
    .sort({ createdAt: -1 })
    .lean();
}

export async function getRevenueStats() {
  const now = new Date();

  const [
    totalRevenueAgg,
    monthlyRecurringAgg,
    yearlyRecurringAgg,
    pendingPayments,
    revenueByPlan,
    revenueByMonth,
  ] = await Promise.all([
    Subscription.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Subscription.aggregate([
      { $match: { status: 'active', billingCycle: 'monthly' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Subscription.aggregate([
      { $match: { status: 'active', billingCycle: 'yearly' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Subscription.find({
      status: { $in: ['pending', 'past_due'] },
      nextPaymentAt: { $lt: now },
    })
      .populate('tenant', 'name email')
      .select('tenant amount nextPaymentAt status')
      .lean(),
    Subscription.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$plan', revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
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
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  const pendingPaymentsFormatted = pendingPayments.map((p) => ({
    _id: p._id,
    tenantId: p.tenant?._id,
    tenantName: p.tenant?.name || 'Unknown',
    amount: p.amount,
    dueDate: p.nextPaymentAt,
    status: p.status,
  }));

  const monthlyRecurring = monthlyRecurringAgg[0]?.total || 0;
  const yearlyRecurring = yearlyRecurringAgg[0]?.total || 0;

  return {
    totalRevenue: totalRevenueAgg[0]?.total || 0,
    monthlyRecurring,
    yearlyRecurring,
    // Yearly subscriptions are stored as 12x monthly; dividing by 12 gives
    // the true MRR contribution so MRR is comparable across billing cycles.
    mrr: round2(monthlyRecurring + yearlyRecurring / 12),
    pendingPayments: pendingPaymentsFormatted,
    revenueByPlan: revenueByPlan.map((r) => ({ plan: r._id, revenue: r.revenue, count: r.count })),
    revenueByMonth: revenueByMonth.map((r) => ({
      month: `${r._id.year}-${String(r._id.month).padStart(2, '0')}`,
      total: r.total,
    })),
  };
}

export async function updateSubscription(id, { plan, planId, billingCycle, status }) {
  const subscription = await Subscription.findById(id).populate('tenant');
  if (!subscription) throw ApiError.notFound('Subscription not found');

  const planRef = plan ?? planId ?? null;
  let planDoc = null;
  if (planRef) {
    // Throws 400 on unknown/inactive plan — never silently keep the old
    // amount while stamping a plan key that has no limits/modules behind it.
    // Legacy keys on an unseeded DB resolve to null (hardcoded fallback).
    planDoc = await resolvePlanDoc(planRef);
    subscription.plan = planKeyOf(planDoc) || String(planRef).trim().toLowerCase().replace(/\s+/g, '_');
  }
  if (billingCycle) subscription.billingCycle = billingCycle;
  if (planRef || billingCycle) {
    subscription.amount = await getPlanPrice(subscription.plan, subscription.billingCycle);
  }
  if (status) subscription.status = status;

  await subscription.save();

  if (planRef && subscription.tenant) {
    const tenant = await Tenant.findById(subscription.tenant._id);
    if (tenant) {
      if (!planDoc) tenant.plan = subscription.plan;
      tenant.updatePlanSettings(planDoc);
      await tenant.save();
      // The cached tenant config (protect middleware) and module flag are
      // stale after a plan reassignment — drop both.
      await invalidateTenant(String(tenant._id));
      await cacheDel('modules', String(tenant._id));
    }
  }

  return subscription;
}

export async function processPayment(tenantId, { amount }) {
  // Subscription status + tenant activation land atomically. Without a single
  // transaction a failure between the two writes would leave a paid
  // subscription on a suspended/inactive tenant.
  return withTransaction(async (session) => {
    const subscription = await Subscription.findOne({ tenant: tenantId }).session(session);
    if (!subscription) throw ApiError.notFound('Subscription not found for this tenant');

    // Validate amount matches subscription amount (within small tolerance for floating point)
    const expectedAmount = subscription.amount;
    const tolerance = 0.01; // 1 cent tolerance
    if (Math.abs(amount - expectedAmount) > tolerance) {
      throw ApiError.badRequest(`Payment amount ${amount} does not match subscription amount ${expectedAmount}`);
    }

    // Check subscription status - don't reactivate cancelled subscriptions without validation
    if (subscription.status === 'cancelled') {
      throw ApiError.badRequest('Cannot process payment for cancelled subscription. Please create a new subscription.');
    }

    // Use separate Date objects to avoid mutation
    const paymentDate = new Date();
    const nextPayment = subscription.billingCycle === 'yearly'
      ? new Date(paymentDate.getFullYear() + 1, paymentDate.getMonth(), paymentDate.getDate())
      : new Date(paymentDate.getFullYear(), paymentDate.getMonth() + 1, paymentDate.getDate());

    subscription.status = 'active';
    subscription.lastPaymentAt = paymentDate;
    subscription.nextPaymentAt = nextPayment;
    subscription.currentPeriodStart = paymentDate;
    subscription.currentPeriodEnd = nextPayment;

    await subscription.save({ session });

    await Tenant.findByIdAndUpdate(tenantId, {
      status: 'active',
      isActive: true,
      subscriptionEndsAt: nextPayment,
    }, { session });

    await invalidateTenant(String(tenantId));
    return subscription;
  });
}
