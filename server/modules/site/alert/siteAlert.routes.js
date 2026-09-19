import { Router } from "express";
import {
  authorizeSite,
  protectSite,
  requireSitePermission,
} from "../../../middleware/siteAuth.js";
import { audit } from "../../../middleware/audit.js";
import {
  acknowledgeAlert,
  acknowledgeAllAlerts,
  getActiveAlerts,
  getAlertById,
  getAlertSummary,
  getAlerts,
  resolveAlert,
} from "./siteAlert.controller.js";
import { SITE_PERMISSIONS } from "../../../constants/sitePermissions.js";

const { MONITORING_ALERTS_VIEW, MONITORING_ALERTS_MANAGE } = SITE_PERMISSIONS;

const router = Router();

router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/alerts:
 *   get:
 *     tags: [Site Alerts]
 *     summary: List platform alerts
 *     description: Site realm. Requires super_admin or admin role with `monitoring:alerts:view`.
 *     security: [{ bearerAuth: [] }, { siteCookieAuth: [] }]
 *     parameters:
 *       - in: query, name: status, schema: { type: string, enum: [active, acknowledged, resolved] }
 *       - in: query, name: severity, schema: { type: string, enum: [critical, warning, info] }
 *       - in: query, name: type, schema: { type: string }
 *       - in: query, name: tenantId, schema: { type: string }
 *       - in: query, name: page, schema: { type: integer }
 *       - in: query, name: limit, schema: { type: integer }
 *     responses:
 *       '200': { description: List of alerts }
 *       '401': { $ref: '#/components/responses/Unauthorized' }
 *       '403': { $ref: '#/components/responses/Forbidden' }
 */
router.get("/", authorizeSite("super_admin", "admin"), requireSitePermission(MONITORING_ALERTS_VIEW), getAlerts);

/**
 * @swagger
 * /api/v1/site/alerts/summary:
 *   get:
 *     tags: [Site Alerts]
 *     summary: Alert counts by status and open severity
 *     security: [{ bearerAuth: [] }, { siteCookieAuth: [] }]
 *     responses:
 *       '200': { description: Alert summary }
 */
router.get("/summary", authorizeSite("super_admin", "admin"), requireSitePermission(MONITORING_ALERTS_VIEW), getAlertSummary);

/**
 * @swagger
 * /api/v1/site/alerts/active:
 *   get:
 *     tags: [Site Alerts]
 *     summary: Latest open alerts (bell dropdown)
 *     security: [{ bearerAuth: [] }, { siteCookieAuth: [] }]
 *     responses:
 *       '200': { description: Open alerts }
 */
router.get("/active", authorizeSite("super_admin", "admin"), requireSitePermission(MONITORING_ALERTS_VIEW), getActiveAlerts);

/**
 * @swagger
 * /api/v1/site/alerts/read-all:
 *   post:
 *     tags: [Site Alerts]
 *     summary: Acknowledge all open alerts
 *     description: Requires `monitoring:alerts:manage`. Audited.
 *     security: [{ bearerAuth: [] }, { siteCookieAuth: [] }]
 *     responses:
 *       '200': { description: Alerts acknowledged }
 */
router.post("/read-all", authorizeSite("super_admin", "admin"), requireSitePermission(MONITORING_ALERTS_MANAGE), audit("alert.acknowledge_all", "alert"), acknowledgeAllAlerts);

/**
 * @swagger
 * /api/v1/site/alerts/{id}:
 *   get:
 *     tags: [Site Alerts]
 *     summary: Get alert by id
 *     security: [{ bearerAuth: [] }, { siteCookieAuth: [] }]
 *     parameters:
 *       - in: path, name: id, required: true, schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200': { description: Alert }
 *       '404': { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id", authorizeSite("super_admin", "admin"), requireSitePermission(MONITORING_ALERTS_VIEW), getAlertById);

/**
 * @swagger
 * /api/v1/site/alerts/{id}/acknowledge:
 *   post:
 *     tags: [Site Alerts]
 *     summary: Acknowledge an alert
 *     description: Requires `monitoring:alerts:manage`. Audited.
 *     security: [{ bearerAuth: [] }, { siteCookieAuth: [] }]
 *     parameters:
 *       - in: path, name: id, required: true, schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200': { description: Alert acknowledged }
 *       '404': { $ref: '#/components/responses/NotFound' }
 */
router.post("/:id/acknowledge", authorizeSite("super_admin", "admin"), requireSitePermission(MONITORING_ALERTS_MANAGE), audit("alert.acknowledge", "alert"), acknowledgeAlert);

/**
 * @swagger
 * /api/v1/site/alerts/{id}/resolve:
 *   post:
 *     tags: [Site Alerts]
 *     summary: Resolve an alert
 *     description: Requires `monitoring:alerts:manage`. Audited.
 *     security: [{ bearerAuth: [] }, { siteCookieAuth: [] }]
 *     parameters:
 *       - in: path, name: id, required: true, schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200': { description: Alert resolved }
 *       '404': { $ref: '#/components/responses/NotFound' }
 */
router.post("/:id/resolve", authorizeSite("super_admin", "admin"), requireSitePermission(MONITORING_ALERTS_MANAGE), audit("alert.resolve", "alert"), resolveAlert);

export default router;