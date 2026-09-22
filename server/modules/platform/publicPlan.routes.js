import { Router } from "express";
import { getPublicPlans } from "./plan.controller.js";

const router = Router();

/**
 * @swagger
 * /api/v1/public/plans:
 *   get:
 *     tags: [Public]
 *     summary: List active subscription plans
 *     description: >
 *       Public marketing endpoint — no authentication required. Powers the
 *       pricing landing page. Returns only active plans, sorted by price.
 *     responses:
 *       '200':
 *         description: List of active plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Plan' }
 */
router.get("/plans", getPublicPlans);

export default router;
