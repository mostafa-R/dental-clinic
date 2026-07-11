import Subscription from '../tenant/subscription.model.js';
import Tenant from '../tenant/tenant.model.js';
import Plan from '../../platform/plan.model.js';
import ApiError from '../../../utils/ApiError.js';

async function getPlanPrice(planKey, billingCycle) {
  const planDoc = await Plan.findOne({ key: planKey, isActive: true }).lean();
  const price = planDoc?.price ?? 99;
  if (billingCycle === 'yearly') {
    return planDoc?.interval === 'year' ? price : price * 10;
  }
  return price;
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
    revenueByPlan: revenueByPlan.map((r) => ({ plan: r._id, revenue: r.total, count: r.count })),
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

  const now = new Date();
  const nextPayment =
    subscription.billingCycle === 'yearly'
      ? new Date(now.setFullYear(now.getFullYear() + 1))
      : new Date(now.setMonth(now.getMonth() + 1));

  subscription.status = 'active';
  subscription.lastPaymentAt = new Date();
  subscription.nextPaymentAt = nextPayment;
  subscription.currentPeriodStart = new Date();
  subscription.currentPeriodEnd = nextPayment;

  await subscription.save();

  await Tenant.findByIdAndUpdate(tenantId, {
    status: 'active',
    isActive: true,
    subscriptionEndsAt: nextPayment,
  });

  return subscription;
}
