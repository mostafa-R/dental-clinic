import { Router } from 'express';

import {
  createAutomation,
  deleteAutomation,
  getAutomation,
  installTemplates,
  listAutomations,
  listRuns,
  listTriggers,
  getRun,
  testAutomation,
  updateAutomation,
} from './automation.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import {
  createAutomationSchema,
  installTemplatesSchema,
  listQuerySchema,
  listRunsQuerySchema,
  testAutomationSchema,
  updateAutomationSchema,
} from './automation.validator.js';

const router = Router();

/**
 * @swagger
 * /api/v1/automations/triggers:
 *   get:
 *     tags: [Automations]
 *     summary: List supported trigger types, condition ops and action types
 *     description: Requires `automations:read`.
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       '200':
 *         description: Trigger/action catalog
 *       '401': { $ref: '#/components/responses/Unauthorized' }
 *       '403': { $ref: '#/components/responses/Forbidden' }
 */
router.get('/triggers', protect, checkPermission('automations', 'read'), listTriggers);

/**
 * @swagger
 * /api/v1/automations/install-templates:
 *   post:
 *     tags: [Automations]
 *     summary: Install the built-in automation templates (idempotent)
 *     description: Requires `automations:create`.
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       '200':
 *         description: Template install summary
 */
router.post(
  '/install-templates',
  protect,
  checkPermission('automations', 'create'),
  validate(installTemplatesSchema),
  installTemplates,
);

/**
 * @swagger
 * /api/v1/automations:
 *   get:
 *     tags: [Automations]
 *     summary: List automation rules
 *     description: Requires `automations:read`. Optional `enabled` and `trigger` filters.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: enabled
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: trigger
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Automation rules
 */
router.get('/', protect, checkPermission('automations', 'read'), validate(listQuerySchema, 'query'), listAutomations);

/**
 * @swagger
 * /api/v1/automations/runs:
 *   get:
 *     tags: [Automations]
 *     summary: List recent engine executions
 *     description: Requires `automations:read`. Optionally scoped to a rule via `automation`.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: automation
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Execution log
 */
router.get('/runs', protect, checkPermission('automations', 'read'), validate(listRunsQuerySchema, 'query'), listRuns);

/**
 * @swagger
 * /api/v1/automations:
 *   post:
 *     tags: [Automations]
 *     summary: Create an automation rule (Trigger → Condition → Action)
 *     description: Requires `automations:create`.
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, trigger, actions]
 *             properties:
 *               name: { type: string, maxLength: 120 }
 *               description: { type: string, maxLength: 500 }
 *               branch: { $ref: '#/components/schemas/ObjectId' }
 *               enabled: { type: boolean, default: true }
 *               trigger:
 *                 type: object
 *                 required: [type]
 *                 properties:
 *                   type: { type: string }
 *               conditions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     field: { type: string }
 *                     op: { type: string }
 *                     value: {}
 *               actions:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   properties:
 *                     type: { type: string, enum: [send_whatsapp, notify_branch, webhook] }
 *                     config: { type: object }
 *               cooldownMinutes: { type: number, minimum: 0, default: 0 }
 *     responses:
 *       '201':
 *         description: Rule created
 */
router.post('/', protect, checkPermission('automations', 'create'), validate(createAutomationSchema), createAutomation);

/**
 * @swagger
 * /api/v1/automations/runs/{runId}:
 *   get:
 *     tags: [Automations]
 *     summary: Get a single engine run
 *     description: Requires `automations:read`.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Run details
 */
router.get('/runs/:runId', protect, checkPermission('automations', 'read'), getRun);

/**
 * @swagger
 * /api/v1/automations/{id}:
 *   get:
 *     tags: [Automations]
 *     summary: Get an automation rule
 *     description: Requires `automations:read`.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Automation rule
 */
router.get('/:id', protect, checkPermission('automations', 'read'), getAutomation);

/**
 * @swagger
 * /api/v1/automations/{id}:
 *   patch:
 *     tags: [Automations]
 *     summary: Update an automation rule (e.g. toggle `enabled`)
 *     description: Requires `automations:update`.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Automation updated
 */
router.patch('/:id', protect, checkPermission('automations', 'update'), validate(updateAutomationSchema), updateAutomation);

/**
 * @swagger
 * /api/v1/automations/{id}:
 *   delete:
 *     tags: [Automations]
 *     summary: Soft-delete an automation rule
 *     description: Requires `automations:delete`.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Automation deleted
 */
router.delete('/:id', protect, checkPermission('automations', 'delete'), deleteAutomation);

/**
 * @swagger
 * /api/v1/automations/{id}/test:
 *   post:
 *     tags: [Automations]
 *     summary: Dry-run a rule against a simulated event (no side effects)
 *     description: Requires `automations:update`.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Dry-run result
 */
router.post('/:id/test', protect, checkPermission('automations', 'update'), validate(testAutomationSchema), testAutomation);

export default router;