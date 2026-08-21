import { Router } from "express";
import { z } from "zod";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "./platformSetting.controller.js";
import { require2faSuperAdmin } from "../../middleware/require2fa.js";
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

/**
 * @swagger
 * /api/v1/site/platform:
 *   get:
 *     tags: [Platform Settings]
 *     summary: Get platform settings
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Current platform settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     settings:
 *                       type: object
 *                       properties:
 *                         siteName: { type: string }
 *                         supportEmail: { type: string, nullable: true }
 *                         maintenanceMode: { type: boolean }
 *                         autoSuspendDays: { type: integer }
 *                         emailNotifications: { type: boolean }
 *                         allowedDomains: { type: array, items: { type: string } }
 *                         maxTenants: { type: integer }
 *                         defaultPlan: { type: string, enum: [starter, professional, enterprise] }
 *                         trialDays: { type: integer }
 *                         backupEnabled: { type: boolean }
 *                         backupRetentionDays: { type: integer }
 *                         backupTime: { type: string, description: HH:MM }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/", authorizeSite("super_admin", "admin", "support"), getPlatformSettings);

/**
 * @swagger
 * /api/v1/site/platform:
 *   put:
 *     tags: [Platform Settings]
 *     summary: Update platform settings
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation. Updating `allowedDomains`, `maintenanceMode`, or `autoSuspendDays` triggers immediate enforcement.
 *     security:
 *       - siteAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               siteName: { type: string, maxLength: 100 }
 *               supportEmail: { type: string, nullable: true }
 *               maintenanceMode: { type: boolean }
 *               autoSuspendDays: { type: integer, minimum: 0, maximum: 365 }
 *               emailNotifications: { type: boolean }
 *               allowedDomains:
 *                 type: array
 *                 maxItems: 50
 *                 items: { type: string, maxLength: 100 }
 *               maxTenants: { type: integer, minimum: 1, maximum: 100000 }
 *               defaultPlan: { type: string, enum: [starter, professional, enterprise] }
 *               trialDays: { type: integer, minimum: 1, maximum: 365 }
 *               backupEnabled: { type: boolean }
 *               backupRetentionDays: { type: integer, minimum: 1, maximum: 365 }
 *               backupTime: { type: string, pattern: "^\\d{2}:\\d{2}$", description: "HH:MM" }
 *     responses:
 *       '200':
 *         description: Platform settings updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     settings: { type: object }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.put("/", authorizeSite("super_admin"), require2faSuperAdmin, validate(platformSettingSchema), updatePlatformSettings);

export default router;
