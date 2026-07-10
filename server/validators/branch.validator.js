import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});
