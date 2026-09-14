import { z } from "zod";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayHoursSchema = z
  .object({
    open: z.string().regex(TIME_RE, "Time must be in HH:MM format").nullable().optional(),
    close: z.string().regex(TIME_RE, "Time must be in HH:MM format").nullable().optional(),
    closed: z.boolean().optional(),
  })
  .superRefine((day, ctx) => {
    if (day.closed) return;
    if (!day.open || !day.close) {
      ctx.addIssue({
        code: "custom",
        message: "Open and close times are required when the clinic is open",
        path: ["open"],
      });
      return;
    }
    if (day.open >= day.close) {
      ctx.addIssue({
        code: "custom",
        message: "Open time must be before close time",
        path: ["open"],
      });
    }
  });

const workingHoursSchema = z
  .object({
    sunday: dayHoursSchema.optional(),
    monday: dayHoursSchema.optional(),
    tuesday: dayHoursSchema.optional(),
    wednesday: dayHoursSchema.optional(),
    thursday: dayHoursSchema.optional(),
    friday: dayHoursSchema.optional(),
    saturday: dayHoursSchema.optional(),
  })
  .optional();

const scheduleFields = {
  workingHours: workingHoursSchema,
  breakStart: z.string().regex(TIME_RE, "Time must be in HH:MM format").nullable().optional(),
  breakEnd: z.string().regex(TIME_RE, "Time must be in HH:MM format").nullable().optional(),
  slotDuration: z.number().int().min(5).max(120).optional(),
  bufferTime: z.number().int().min(0).max(60).optional(),
};

export const createBranchSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  isActive: z.boolean().optional(),
  ...scheduleFields,
});

export const updateBranchSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  isActive: z.boolean().optional(),
  ...scheduleFields,
});