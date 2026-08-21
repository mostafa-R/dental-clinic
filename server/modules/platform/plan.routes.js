import { Router } from "express";
import {
  createPlan,
  deletePlan,
  getPlan,
  getPlans,
  updatePlan,
} from "./plan.controller.js";
import { require2faSuperAdmin } from "../../middleware/require2fa.js";
import { authorizeSite, protectSite } from "../../middleware/siteAuth.js";
import { validate } from "../../middleware/validate.js";
import { z } from "zod";

const router = Router();

router.use(protectSite);

const planSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  price: z.number().min(0, "Price must be positive"),
  interval: z.enum(["month", "year"]).optional(),
  modules: z.array(z.string()).optional(),
  limits: z
    .object({
      maxBranches: z.number().min(0).optional(),
      maxDoctors: z.number().min(0).optional(),
      maxPatients: z.number().min(0).optional(),
      storage: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
  support: z.string().optional(),
  features: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * @swagger
 * /api/v1/site/plans:
 *   get:
 *     tags: [Platform Plans]
 *     summary: List subscription plans
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: List of plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plans:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Plan' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/", authorizeSite("super_admin", "admin", "support"), getPlans);

/**
 * @swagger
 * /api/v1/site/plans/{id}:
 *   get:
 *     tags: [Platform Plans]
 *     summary: Get a plan
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
 *         description: Plan details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { $ref: '#/components/schemas/Plan' }
 *       '400':
 *         description: Invalid plan id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", authorizeSite("super_admin", "admin", "support"), getPlan);

/**
 * @swagger
 * /api/v1/site/plans:
 *   post:
 *     tags: [Platform Plans]
 *     summary: Create a plan
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation.
 *     security:
 *       - siteAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price]
 *             properties:
 *               name: { type: string, minLength: 2 }
 *               price: { type: number, minimum: 0 }
 *               interval: { type: string, enum: [month, year] }
 *               modules: { type: array, items: { type: string } }
 *               limits:
 *                 type: object
 *                 properties:
 *                   maxBranches: { type: integer, minimum: 0 }
 *                   maxDoctors: { type: integer, minimum: 0 }
 *                   maxPatients: { type: integer, minimum: 0 }
 *                   storage: { type: string }
 *               support: { type: string }
 *               features: { type: array, items: { type: string } }
 *               isActive: { type: boolean }
 *     responses:
 *       '201':
 *         description: Plan created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { $ref: '#/components/schemas/Plan' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post("/", authorizeSite("super_admin"), require2faSuperAdmin, validate(planSchema), createPlan);

/**
 * @swagger
 * /api/v1/site/plans/{id}:
 *   put:
 *     tags: [Platform Plans]
 *     summary: Update a plan
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
 *               price: { type: number, minimum: 0 }
 *               interval: { type: string, enum: [month, year] }
 *               modules: { type: array, items: { type: string } }
 *               limits:
 *                 type: object
 *                 properties:
 *                   maxBranches: { type: integer, minimum: 0 }
 *                   maxDoctors: { type: integer, minimum: 0 }
 *                   maxPatients: { type: integer, minimum: 0 }
 *                   storage: { type: string }
 *               support: { type: string }
 *               features: { type: array, items: { type: string } }
 *               isActive: { type: boolean }
 *     responses:
 *       '200':
 *         description: Plan updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { $ref: '#/components/schemas/Plan' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.put("/:id", authorizeSite("super_admin"), require2faSuperAdmin, validate(planSchema), updatePlan);

/**
 * @swagger
 * /api/v1/site/plans/{id}:
 *   delete:
 *     tags: [Platform Plans]
 *     summary: Delete a plan
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
 *         description: Plan deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Plan deleted }
 *       '400':
 *         description: Invalid plan id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete("/:id", authorizeSite("super_admin"), require2faSuperAdmin, deletePlan);

export default router;
