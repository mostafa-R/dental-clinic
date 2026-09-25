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

/**
 * Create a subscription for a clinic that does not have one yet.
 *
 * Until now the ONLY way a Subscription document came into existence was as a
 * side-effect of createTenant (POST /tenants), so an existing clinic could
 * never be subscribed from the billing screen — there was no POST route and no
 * createSubscription service function. Subscriptions are looked up by
 * `findOne({ tenant })` (see processPayment), so a silent second row would make
 * every payment/activation ambiguous: hence the explicit 409.
 */
export async function createSubscription(tenantId, { plan, planId, billingCycle, status }) {
  // Plan resolution happens before the transaction so a bad plan ref fails
  // fast with a 400 and never opens a session.
  const planRef = plan ?? planId ?? null;
  if (!planRef) {
    throw ApiError.badRequest('Plan is required', { plan: 'required' });
  }
  const planDoc = await resolvePlanDoc(planRef);
  const cycle = billingCycle ?? 'monthly';
  const amount = await getPlanPrice(planKeyOf(planDoc), cycle);

  const subscription = await withTransaction(async (session) => {
    const tenant = await Tenant.findById(tenantId).session(session);
    if (!tenant) throw ApiError.notFound('Tenant not found');

    const existing = await Subscription.findOne({ tenant: tenantId }).session(session);
    if (existing) {
      throw ApiError.conflict(
        'This clinic already has a subscription. Edit the existing one to change its plan.',
      );
    }

    // Stamp the plan onto the clinic: planModules + settings.* limits + planId.
    // This is the step the caller actually cares about — without it the clinic
    // keeps whatever modules it had before and the new plan looks "ignored".
    tenant.updatePlanSettings(planDoc);

    const nextStatus = status ?? 'pending';
    const periodEnd =
      nextStatus === 'active'
        ? new Date(
            Date.now() + (cycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000,
          )
        : null;

    if (nextStatus === 'active') {
      tenant.status = 'active';
      tenant.isActive = true;
      tenant.subscriptionEndsAt = periodEnd;
      tenant.trialEndsAt = null;
    }
    await tenant.save({ session });

    const [created] = await Subscription.create(
      [
        {
          tenant: tenant._id,
          plan: planKeyOf(planDoc),
          status: nextStatus,
          billingCycle: cycle,
          amount,
          currentPeriodStart: nextStatus === 'active' ? new Date() : null,
          currentPeriodEnd: periodEnd,
          nextPaymentAt: periodEnd,
        },
      ],
      { session },
    );

    // Populate the clinic on the way out so the response matches what
    // listSubscriptions returns. Without this the caller gets a bare ObjectId
    // for `tenant` and has to re-fetch the whole list just to render a name.
    return created.populate('tenant', 'name email plan status');
  });

  // Cache invalidation stays outside the transaction (see updateSubscription).
  await invalidateTenant(String(tenantId));
  await cacheDel('modules', String(tenantId));

  return subscription;
}

export async function updateSubscription(id, { plan, planId, billingCycle, status }) {
  // Subscription + tenant plan stamping land in ONE transaction. Saving the
  // subscription first and stamping the tenant afterwards left a real failure
  // mode: if updatePlanSettings threw (e.g. a plan with no limits.storage), the
  // plan key and the new amount were already persisted while the clinic kept
  // the old planModules — and the API returned 500, so the retry re-applied
  // nothing. Now either both land or neither does.
  return withTransaction(async (session) => {
    const subscription = await Subscription.findById(id)
      .populate('tenant')
      .session(session);
    if (!subscription) throw ApiError.notFound('Subscription not found');

    const planRef = plan ?? planId ?? null;
    // resolvePlanDoc throws 400 on unknown/inactive plan — never silently keep
    // the old amount while stamping a plan key that has no limits/modules.
    const planDoc = planRef ? await resolvePlanDoc(planRef) : null;
    if (planDoc) subscription.plan = planKeyOf(planDoc);
    if (billingCycle) subscription.billingCycle = billingCycle;
    if (planDoc || billingCycle) {
      subscription.amount = await getPlanPrice(subscription.plan, subscription.billingCycle);
    }
    if (status) subscription.status = status;

    await subscription.save({ session });

    if (planDoc) {
      if (!subscription.tenant) {
        throw ApiError.badRequest(
          'Subscription has no clinic attached — reassign the subscription before changing its plan.',
        );
      }
      const tenant = await Tenant.findById(subscription.tenant._id).session(session);
      if (!tenant) throw ApiError.notFound('Tenant not found');
      tenant.updatePlanSettings(planDoc);
      await tenant.save({ session });
    }

    return subscription;
  }).then(async (subscription) => {
    // The cached tenant config (protect middleware) and module flag are stale
    // after a plan reassignment — drop both. Cache writes are deliberately
    // outside the transaction: a Redis failure must not roll back Mongo.
    if (plan || planId) {
      await invalidateTenant(String(subscription.tenant._id));
      await cacheDel('modules', String(subscription.tenant._id));
    }
    return subscription;
  });
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
