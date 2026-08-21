import { Router } from "express";
import { require2fa, require2faSuperAdmin } from "../../../middleware/require2fa.js";
import { authorizeSite, protectSite, requireBranchAccess, requireTenantAccess } from "../../../middleware/siteAuth.js";
import { validate } from "../../../middleware/validate.js";
import { createBranchSchema, updateBranchSchema } from "../../users/branch.validator.js";
import {
  createBranch,
  deleteBranch,
  getBranch,
  getBranches,
  updateBranch,
} from "./siteBranch.controller.js";

const router = Router();

router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/branches:
 *   get:
 *     tags: [Site Branches]
 *     summary: List branches
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role. Optionally filtered by tenant.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: List of branches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     branches:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Branch' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/", authorizeSite("super_admin", "admin", "support"), getBranches);

/**
 * @swagger
 * /api/v1/site/branches/{id}:
 *   get:
 *     tags: [Site Branches]
 *     summary: Get a branch
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role and branch access.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Branch details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     branch: { $ref: '#/components/schemas/Branch' }
 *       '400':
 *         description: Invalid branch id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", authorizeSite("super_admin", "admin", "support"), requireBranchAccess, getBranch);

/**
 * @swagger
 * /api/v1/site/branches:
 *   post:
 *     tags: [Site Branches]
 *     summary: Create a branch
 *     description: Site realm. Requires `super_admin` or `admin` role, 2FA confirmation, and tenant access. Validates that the tenant exists.
 *     security:
 *       - siteAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, name]
 *             properties:
 *               tenantId: { $ref: '#/components/schemas/ObjectId' }
 *               name: { type: string }
 *               address: { type: string }
 *               phone: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       '201':
 *         description: Branch created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     branch: { $ref: '#/components/schemas/Branch' }
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
  requireTenantAccess,
  validate(createBranchSchema),
  createBranch,
);

/**
 * @swagger
 * /api/v1/site/branches/{id}:
 *   put:
 *     tags: [Site Branches]
 *     summary: Update a branch
 *     description: Site realm. Requires `super_admin` or `admin` role, 2FA confirmation, and branch access. Validates the branch belongs to the tenant (if specified).
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
 *               tenantId: { $ref: '#/components/schemas/ObjectId' }
 *               name: { type: string }
 *               address: { type: string }
 *               phone: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       '200':
 *         description: Branch updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     branch: { $ref: '#/components/schemas/Branch' }
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
  requireBranchAccess,
  validate(updateBranchSchema),
  updateBranch,
);

/**
 * @swagger
 * /api/v1/site/branches/{id}:
 *   delete:
 *     tags: [Site Branches]
 *     summary: Delete a branch
 *     description: Site realm. Requires `super_admin` role, 2FA confirmation, and branch access.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Branch deleted
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
router.delete("/:id", authorizeSite("super_admin"), require2faSuperAdmin, requireBranchAccess, deleteBranch);

export default router;
