import Subscription from "../models/Subscription.js";
import Tenant from "../models/Tenant.js";
import Plan from "../models/Plan.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/sendSuccess.js";

/**
 * Look up the Plan document and return the monthly amount.
 * Yearly is priced at monthly × 10 (2 months free).
 */
async function getPlanPrice(planKey, billingCycle) {
  const planDoc = await Plan.findOne({ key: planKey, isActive: true }).lean();
  const price = planDoc?.price ?? 99;
  if (billingCycle === "yearly") {
    return planDoc?.interval === "year" ? price : price * 10;
  }
  return price;
}

// Get all subscriptions
export const getSubscriptions = asyncHandler(async (_req, res) => {
  const subscriptions = await Subscription.find()
    .populate("tenant", "name email plan status")
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, subscriptions);
});

// Get revenue statistics
export const getRevenueStats = asyncHandler(async (_req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalRevenueAgg,
    monthlyRecurringAgg,
    yearlyRecurringAgg,
    pendingPayments,
    revenueByPlan,
    revenueByMonth,
  ] = await Promise.all([
    // Total revenue from all time
    Subscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    // Monthly recurring revenue (MRR)
    Subscription.aggregate([
      { $match: { status: "active", billingCycle: "monthly" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    // Yearly recurring revenue
    Subscription.aggregate([
      { $match: { status: "active", billingCycle: "yearly" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    // Pending/overdue payments
    Subscription.find({
      status: { $in: ["pending", "past_due"] },
      nextPaymentAt: { $lt: now },
    })
      .populate("tenant", "name email")
      .select("tenant amount nextPaymentAt status")
      .lean(),
    // Revenue by plan
    Subscription.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: "$plan",
          revenue: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    // Revenue by month (last 12 months)
    Subscription.aggregate([
      {
        $match: {
          status: "active",
          lastPaymentAt: {
            $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$lastPaymentAt" },
            month: { $month: "$lastPaymentAt" },
          },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
  ]);

  // Calculate pending payment amounts with due dates
  const pendingPaymentsFormatted = pendingPayments.map((p) => ({
    _id: p._id,
    tenantId: p.tenant?._id,
    tenantName: p.tenant?.name || "Unknown",
    amount: p.amount,
    dueDate: p.nextPaymentAt,
    status: p.status,
  }));

  return sendSuccess(res, {
    totalRevenue: totalRevenueAgg[0]?.total || 0,
    monthlyRecurring: monthlyRecurringAgg[0]?.total || 0,
    yearlyRecurring: yearlyRecurringAgg[0]?.total || 0,
    pendingPayments: pendingPaymentsFormatted,
    revenueByPlan: revenueByPlan.map((r) => ({
      plan: r._id,
      revenue: r.total,
      count: r.count,
    })),
    revenueByMonth: revenueByMonth.map((r) => ({
      month: `${r._id.year}-${String(r._id.month).padStart(2, "0")}`,
      total: r.total,
    })),
  });
});

// Update subscription
export const updateSubscription = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { plan, billingCycle, status } = req.validatedBody;

  const subscription = await Subscription.findById(id).populate("tenant");
  if (!subscription) {
    throw ApiError.notFound("Subscription not found");
  }

  if (plan) subscription.plan = plan;
  if (billingCycle) {
    subscription.billingCycle = billingCycle;
    subscription.amount = await getPlanPrice(plan || subscription.plan, billingCycle);
  }
  if (status) subscription.status = status;

  await subscription.save();

  // Sync tenant's planModules, limits, and settings
  if (plan && subscription.tenant) {
    const planDoc = await Plan.findOne({ key: plan, isActive: true }).lean();
    const tenant = await Tenant.findById(subscription.tenant._id);
    if (tenant) {
      tenant.updatePlanSettings(planDoc);
      await tenant.save();
    }
  }

  return sendSuccess(res, subscription.toObject());
});

// Process payment (simplified - would integrate with payment gateway in production)
export const processPayment = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { amount, paymentMethod } = req.validatedBody;

  const subscription = await Subscription.findOne({ tenant: tenantId });
  if (!subscription) {
    throw ApiError.notFound("Subscription not found for this tenant");
  }

  // In production, this would integrate with Stripe/PayPal/etc.
  // For now, we'll just update the subscription

  const now = new Date();
  const nextPayment =
    subscription.billingCycle === "yearly"
      ? new Date(now.setFullYear(now.getFullYear() + 1))
      : new Date(now.setMonth(now.getMonth() + 1));

  subscription.status = "active";
  subscription.lastPaymentAt = new Date();
  subscription.nextPaymentAt = nextPayment;
  subscription.currentPeriodStart = new Date();
  subscription.currentPeriodEnd = nextPayment;

  await subscription.save();

  // Activate tenant
  await Tenant.findByIdAndUpdate(tenantId, {
    status: "active",
    isActive: true,
    subscriptionEndsAt: nextPayment,
  });

  return sendSuccess(res, {
    message: "Payment processed successfully",
    subscription: subscription.toObject(),
  });
});