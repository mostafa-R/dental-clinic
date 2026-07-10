import { Router } from "express";
import { z } from "zod";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "../controllers/platformSetting.controller.js";
import { authorizeSite, protectSite } from "../middleware/siteAuth.js";
import { validate } from "../middleware/validate.js";

const platformSettingSchema = z.object({
  siteName: z.string().optional(),
  supportEmail: z.string().email().optional().or(z.literal("")),
  maintenanceMode: z.boolean().optional(),
  autoSuspendDays: z.number().int().min(0).optional(),
  backupEnabled: z.boolean().optional(),
  backupRetentionDays: z.number().int().min(1).max(365).optional(),
  backupTime: z.string().optional(),
}).passthrough();

const router = Router();

router.use(protectSite);

router.get("/", authorizeSite("super_admin", "admin", "support"), getPlatformSettings);
router.put("/", authorizeSite("super_admin"), validate(platformSettingSchema), updatePlatformSettings);

export default router;
