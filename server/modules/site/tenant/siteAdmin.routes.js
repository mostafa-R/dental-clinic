import { Router } from "express";
import { z } from "zod";
import { audit } from "../../../middleware/audit.js";
import { require2faSuperAdmin } from "../../../middleware/require2fa.js";
import { authorizeSite, protectSite } from "../../../middleware/siteAuth.js";
import { validate } from "../../../middleware/validate.js";
import {
  createAdmin,
  deleteAdmin,
  getAdmin,
  getAdmins,
  updateAdmin,
  updateAdminPermissions,
} from "./siteAdmin.controller.js";

const router = Router();

router.use(protectSite);

const adminSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  role: z.enum(["super_admin", "admin", "support"]).optional(),
  permissions: z.array(z.string()).optional(),
});

/**
 * @swagger
 * /api/v1/site/admins:
 *   get:
 *     tags: [Site Admins]
 *     summary: List site admins
 *     description: Site realm. Requires `super_admin` or `admin` role.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: List of admins
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     admins:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/SiteAdmin' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/", authorizeSite("super_admin", "admin"), getAdmins);

/**
 * @swagger
 * /api/v1/site/admins/{id}:
 *   get:
 *     tags: [Site Admins]
 *     summary: Get a site admin
 *     description: Site realm. Requires `super_admin` or `admin` role.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Admin details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     admin: { $ref: '#/components/schemas/SiteAdmin' }
 *       '400':
 *         description: Invalid admin id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", authorizeSite("super_admin", "admin"), getAdmin);

/**
 * @swagger
 * /api/v1/site/admins:
 *   post:
 *     tags: [Site Admins]
 *     summary: Create a site admin
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation.
 *     security:
 *       - siteAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string, minLength: 2 }
 *               email: { type: string }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [super_admin, admin, support] }
 *               permissions: { type: array, items: { type: string } }
 *     responses:
 *       '201':
 *         description: Admin created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     admin: { $ref: '#/components/schemas/SiteAdmin' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post("/", authorizeSite("super_admin"), require2faSuperAdmin, validate(adminSchema), audit("admin.create", "admin"), createAdmin);

/**
 * @swagger
 * /api/v1/site/admins/{id}/permissions:
 *   put:
 *     tags: [Site Admins]
 *     summary: Update admin permissions
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation.
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
 *             required: [permissions]
 *             properties:
 *               permissions: { type: array, items: { type: string } }
 *     responses:
 *       '200':
 *         description: Permissions updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     admin: { $ref: '#/components/schemas/SiteAdmin' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.put("/:id/permissions", authorizeSite("super_admin"), require2faSuperAdmin, validate(z.object({ permissions: z.array(z.string()) })), audit("admin.update_permissions", "admin"), updateAdminPermissions);

/**
 * @swagger
 * /api/v1/site/admins/{id}:
 *   put:
 *     tags: [Site Admins]
 *     summary: Update a site admin
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation.
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
 *               name: { type: string, minLength: 2 }
 *               email: { type: string }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [super_admin, admin, support] }
 *               permissions: { type: array, items: { type: string } }
 *     responses:
 *       '200':
 *         description: Admin updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     admin: { $ref: '#/components/schemas/SiteAdmin' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.put("/:id", authorizeSite("super_admin"), require2faSuperAdmin, validate(adminSchema), audit("admin.update", "admin"), updateAdmin);

/**
 * @swagger
 * /api/v1/site/admins/{id}:
 *   delete:
 *     tags: [Site Admins]
 *     summary: Delete a site admin
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Admin deleted
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
 *       '400':
 *         description: Invalid admin id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete("/:id", authorizeSite("super_admin"), require2faSuperAdmin, audit("admin.delete", "admin"), deleteAdmin);

export default router;
