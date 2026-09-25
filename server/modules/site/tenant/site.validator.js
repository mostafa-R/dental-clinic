import { z } from "zod";

const baseFields = {
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  // plan accepts a plan key ("pro_plus", case/space insensitive) or a plan
  // ObjectId — resolved strictly, unknown/inactive values are rejected.
  plan: z.string().optional(),
  planId: z.string().optional(),
  status: z.enum(["trial", "active"]).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
};

export const tenantSchema = z
  .object({
    ...baseFields,
    // Required: the platform admin sets the clinic admin's initial password
    // at provisioning time. The API never returns a generated plaintext
    // password, so we must not allow creating an account with an
    // auto-generated one that would have no secure delivery channel.
    adminPassword: z.string().min(8, "Admin password must be at least 8 characters"),
  })
  .refine((v) => v.plan || v.planId, {
    message: "Plan is required",
    path: ["plan"],
  });

export const tenantUpdateSchema = z.object({
  ...baseFields,
}).strict();

export const subscriptionSchema = z.object({
  plan: z.string().optional(),
  planId: z.string().optional(),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
  status: z.enum(["active", "pending", "past_due", "cancelled"]).optional(),
});

// Creating a subscription is the only place a plan can be omitted-and-defaulted
// nowhere: without a plan there is nothing to stamp onto the clinic, so it is
// required here (updateSubscription allows plan-less status-only edits).
export const createSubscriptionSchema = z
  .object({
    plan: z.string().optional(),
    planId: z.string().optional(),
    billingCycle: z.enum(["monthly", "yearly"]).optional(),
    status: z.enum(["active", "pending"]).optional(),
  })
  .refine((v) => v.plan || v.planId, {
    message: "Plan is required",
    path: ["plan"],
  });

export const paymentSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  paymentMethod: z.string().min(1, "Payment method is required"),
});
