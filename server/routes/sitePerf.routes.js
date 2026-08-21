import { Router } from "express";
import { authorizeSite, protectSite } from "../middleware/siteAuth.js";
import { getPerfStats, resetPerfStats } from "../utils/perfMonitor.js";

const router = Router();

router.use(protectSite);

// site_admin

/**
 * @swagger
 * /api/v1/site/perf:
 *   get:
 *     tags: [Platform Performance]
 *     summary: Get in-process performance statistics
 *     description: Site realm. Requires `super_admin` or `admin` role. Returns request counts, average response times, and error counts tracked by the in-process perf monitor.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Performance statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRequests: { type: integer }
 *                     avgResponseTime: { type: number }
 *                     errorCount: { type: integer }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/", authorizeSite("super_admin", "admin"), (_req, res) => {
  const stats = getPerfStats();
  res.json({ success: true, data: stats });
});

/**
 * @swagger
 * /api/v1/site/perf/reset:
 *   post:
 *     tags: [Platform Performance]
 *     summary: Reset performance statistics
 *     description: Site realm. Requires `super_admin` role. Clears the in-process perf counters.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Statistics reset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Performance stats reset }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post("/reset", authorizeSite("super_admin"), (_req, res) => {
  resetPerfStats();
  res.json({ success: true, data: { message: "Performance stats reset" } });
});

export default router;
