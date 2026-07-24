import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  isActive: z.boolean().optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  isActive: z.boolean().optional(),
});
