import ApiError from '../../../utils/ApiError.js';
import Plan from '../../platform/plan.model.js';
import Subscription from '../tenant/subscription.model.js';
import Tenant from '../tenant/tenant.model.js';

async function getPlanPrice(planKey, billingCycle) {
  const planDoc = await Plan.findOne({ key: planKey, isActive: true }).lean();
  const price = planDoc?.price ?? 99;

  if (billingCycle === 'yearly') {
    // Always store yearly as 12x monthly so MRR calculation (amount / 12) is correct
    return price * 12;
  }

  // For monthly billing cycle:
  // - If plan interval is 'year', divide by 12 to get monthly equivalent
  // - If plan interval is 'month', use price as-is
  return planDoc?.interval === 'year' ? price / 12 : price;
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

  return {
    totalRevenue: totalRevenueAgg[0]?.total || 0,
    monthlyRecurring: monthlyRecurringAgg[0]?.total || 0,
    yearlyRecurring: yearlyRecurringAgg[0]?.total || 0,
    pendingPayments: pendingPaymentsFormatted,
    revenueByPlan: revenueByPlan.map((r) => ({ plan: r._id, revenue: r.revenue, count: r.count })),
    revenueByMonth: revenueByMonth.map((r) => ({
      month: `${r._id.year}-${String(r._id.month).padStart(2, '0')}`,
      total: r.total,
    })),
  };
}

export async function updateSubscription(id, { plan, billingCycle, status }) {
  const subscription = await Subscription.findById(id).populate('tenant');
  if (!subscription) throw ApiError.notFound('Subscription not found');

  if (plan) subscription.plan = plan;
  if (billingCycle) {
    subscription.billingCycle = billingCycle;
    subscription.amount = await getPlanPrice(plan || subscription.plan, billingCycle);
  }
  if (status) subscription.status = status;

  await subscription.save();

  if (plan && subscription.tenant) {
    const planDoc = await Plan.findOne({ key: plan, isActive: true }).lean();
    const tenant = await Tenant.findById(subscription.tenant._id);
    if (tenant) {
      tenant.updatePlanSettings(planDoc);
      await tenant.save();
    }
  }

  return subscription;
}

export async function processPayment(tenantId, { amount }) {
  const subscription = await Subscription.findOne({ tenant: tenantId });
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

  await subscription.save();

  await Tenant.findByIdAndUpdate(tenantId, {
    status: 'active',
    isActive: true,
    subscriptionEndsAt: nextPayment,
  });

  return subscription;
}
