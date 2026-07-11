import mongoose from "mongoose";

export const SUBSCRIPTION_STATUS = {
  ACTIVE: "active",
  PENDING: "pending",
  PAST_DUE: "past_due",
  CANCELLED: "cancelled",
};

export const BILLING_CYCLE = {
  MONTHLY: "monthly",
  YEARLY: "yearly",
};

const subscriptionSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
    },
    plan: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.PENDING,
    },
    billingCycle: {
      type: String,
      enum: Object.values(BILLING_CYCLE),
      default: BILLING_CYCLE.MONTHLY,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    currentPeriodStart: {
      type: Date,
      default: null,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    lastPaymentAt: {
      type: Date,
      default: null,
    },
    nextPaymentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
