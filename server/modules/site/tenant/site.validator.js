import { z } from "zod";

const baseFields = {
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  plan: z.string().optional(),
  status: z.enum(["trial", "active"]).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
};

export const tenantSchema = z.object({
  ...baseFields,
  adminPassword: z
    .string()
    .min(8, "Admin password must be at least 8 characters")
    .optional(),
});

export const tenantUpdateSchema = z.object({
  ...baseFields,
}).strict();

export const subscriptionSchema = z.object({
  plan: z.string().optional(),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
  status: z.enum(["active", "pending", "past_due", "cancelled"]).optional(),
});

export const paymentSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  paymentMethod: z.string().min(1, "Payment method is required"),
});
