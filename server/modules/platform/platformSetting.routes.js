import { Router } from "express";
import { z } from "zod";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "./platformSetting.controller.js";
import { authorizeSite, protectSite } from "../../middleware/siteAuth.js";
import { validate } from "../../middleware/validate.js";

const platformSettingSchema = z.object({
  siteName: z.string().max(100).optional(),
  supportEmail: z.string().email().optional().or(z.literal("")),
  maintenanceMode: z.boolean().optional(),
  autoSuspendDays: z.number().int().min(0).max(365).optional(),
  emailNotifications: z.boolean().optional(),
  allowedDomains: z.array(z.string().max(100)).max(50).optional(),
  maxTenants: z.number().int().min(1).max(100000).optional(),
  defaultPlan: z.enum(["starter", "professional", "enterprise"]).optional(),
  trialDays: z.number().int().min(1).max(365).optional(),
  backupEnabled: z.boolean().optional(),
  backupRetentionDays: z.number().int().min(1).max(365).optional(),
  backupTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const router = Router();

router.use(protectSite);

router.get("/", authorizeSite("super_admin", "admin", "support"), getPlatformSettings);
router.put("/", authorizeSite("super_admin"), validate(platformSettingSchema), updatePlatformSettings);

export default router;
