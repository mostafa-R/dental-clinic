import { Router } from "express";
import { require2faSuperAdmin } from "../../../middleware/require2fa.js";
import { authorizeSite, protectSite } from "../../../middleware/siteAuth.js";
import { getBackup, getBackups, triggerManualBackup } from "./siteBackup.controller.js";

const router = Router();

router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/backups:
 *   get:
 *     tags: [Site Backups]
 *     summary: List backups
 *     description: Site realm. Requires `super_admin` or `admin` role.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: List of backups
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     backups:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BackupLog' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/", authorizeSite("super_admin", "admin"), getBackups);

/**
 * @swagger
 * /api/v1/site/backups/{id}:
 *   get:
 *     tags: [Site Backups]
 *     summary: Get a backup
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
 *         description: Backup details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     backup: { $ref: '#/components/schemas/BackupLog' }
 *       '400':
 *         description: Invalid backup id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", authorizeSite("super_admin", "admin"), getBackup);

/**
 * @swagger
 * /api/v1/site/backups:
 *   post:
 *     tags: [Site Backups]
 *     summary: Trigger a manual backup
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation. Runs an on-demand database backup immediately.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '201':
 *         description: Backup triggered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     backup: { $ref: '#/components/schemas/BackupLog' }
 *                     message: { type: string }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post("/", authorizeSite("super_admin"), require2faSuperAdmin, triggerManualBackup);

export default router;
