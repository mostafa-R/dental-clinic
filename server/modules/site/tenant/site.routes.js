import { Router } from "express";
import { audit } from "../../../middleware/audit.js";
import { require2fa, require2faSuperAdmin } from "../../../middleware/require2fa.js";
import { authorizeSite, protectSite } from "../../../middleware/siteAuth.js";
import { validate } from "../../../middleware/validate.js";
import {
  activateTenant,
  archiveTenant,
  createTenant,
  deleteTenant,
  getTenant,
  getTenants,
  getTenantStats,
  suspendTenant,
  updateTenant,
} from "./site.controller.js";
import { tenantSchema, tenantUpdateSchema } from "./site.validator.js";

const router = Router();

// All routes require site admin authentication
router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/tenants:
 *   get:
 *     tags: [Site Tenants]
 *     summary: List tenants
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: List of tenants
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenants:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Site' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/", authorizeSite("super_admin", "admin", "support"), getTenants);

/**
 * @swagger
 * /api/v1/site/tenants/{id}/stats:
 *   get:
 *     tags: [Site Tenants]
 *     summary: Get tenant statistics
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Tenant statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: object }
 *       '400':
 *         description: Invalid tenant id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id/stats",
  authorizeSite("super_admin", "admin", "support"),
  getTenantStats,
);

/**
 * @swagger
 * /api/v1/site/tenants/{id}:
 *   get:
 *     tags: [Site Tenants]
 *     summary: Get a tenant
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Tenant details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenant: { $ref: '#/components/schemas/Site' }
 *       '400':
 *         description: Invalid tenant id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", authorizeSite("super_admin", "admin", "support"), getTenant);

/**
 * @swagger
 * /api/v1/site/tenants:
 *   post:
 *     tags: [Site Tenants]
 *     summary: Create a tenant
 *     description: Site realm. Requires `super_admin` or `admin` role and 2FA confirmation. Provisioning a tenant creates its database, plan subscription, and initial admin.
 *     security:
 *       - siteAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, plan, admin]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               plan: { type: string }
 *               admin:
 *                 type: object
 *                 properties:
 *                   name: { type: string }
 *                   email: { type: string }
 *                   password: { type: string }
 *     responses:
 *       '201':
 *         description: Tenant created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenant: { $ref: '#/components/schemas/Site' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  "/",
  authorizeSite("super_admin", "admin"),
  require2fa,
  validate(tenantSchema),
  audit('tenant.create', 'tenant'),
  createTenant,
);

/**
 * @swagger
 * /api/v1/site/tenants/{id}:
 *   put:
 *     tags: [Site Tenants]
 *     summary: Update a tenant
 *     description: Site realm. Requires `super_admin` or `admin` role and 2FA confirmation.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               plan: { type: string }
 *     responses:
 *       '200':
 *         description: Tenant updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenant: { $ref: '#/components/schemas/Site' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  "/:id",
  authorizeSite("super_admin", "admin"),
  require2fa,
  validate(tenantUpdateSchema),
  audit('tenant.update', 'tenant'),
  updateTenant,
);

/**
 * @swagger
 * /api/v1/site/tenants/{id}/suspend:
 *   put:
 *     tags: [Site Tenants]
 *     summary: Suspend a tenant
 *     description: Site realm. Requires `super_admin` or `admin` role and 2FA confirmation. Suspended tenants block all clinic traffic.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Tenant suspended
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenant: { $ref: '#/components/schemas/Site' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  "/:id/suspend",
  authorizeSite("super_admin", "admin"),
  require2fa,
  audit('tenant.suspend', 'tenant'),
  suspendTenant,
);

/**
 * @swagger
 * /api/v1/site/tenants/{id}/activate:
 *   put:
 *     tags: [Site Tenants]
 *     summary: Activate a tenant
 *     description: Site realm. Requires `super_admin` or `admin` role and 2FA confirmation.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Tenant activated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenant: { $ref: '#/components/schemas/Site' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  "/:id/activate",
  authorizeSite("super_admin", "admin"),
  require2fa,
  audit('tenant.activate', 'tenant'),
  activateTenant,
);

/**
 * @swagger
 * /api/v1/site/tenants/{id}/archive:
 *   put:
 *     tags: [Site Tenants]
 *     summary: Archive a tenant
 *     description: Site realm. Destructive. Requires `super_admin` role and 2FA confirmation.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Tenant archived
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenant: { $ref: '#/components/schemas/Site' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  "/:id/archive",
  authorizeSite("super_admin"),
  require2faSuperAdmin,
  audit('tenant.archive', 'tenant'),
  archiveTenant,
);

/**
 * @swagger
 * /api/v1/site/tenants/{id}:
 *   delete:
 *     tags: [Site Tenants]
 *     summary: Delete a tenant
 *     description: Site realm. Most destructive operation. Requires `super_admin` role and 2FA confirmation.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Tenant deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  "/:id",
  authorizeSite("super_admin"),
  require2faSuperAdmin,
  audit('tenant.delete', 'tenant'),
  deleteTenant,
);

export default router;
