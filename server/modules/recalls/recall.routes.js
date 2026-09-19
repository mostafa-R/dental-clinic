import { Router } from 'express';

import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  completeRecallHandler,
  contactRecallHandler,
  createRecallHandler,
  dismissRecallHandler,
  getRecallHandler,
  listRecallHandler,
  postponeRecallHandler,
  scheduleRecallHandler,
  updateRecallHandler,
} from './recall.controller.js';
import {
  contactRecallSchema,
  createRecallSchema,
  listRecallsQuerySchema,
  outcomeSchema,
  postponeRecallSchema,
  scheduleRecallSchema,
  updateRecallSchema,
} from './recall.validator.js';

const router = Router();

// Recalls are appointment-pipeline artifacts (follow-ups that become
// appointments), so they reuse the `appointments` RBAC module — no RBAC
// matrix/plan change required, and every plan with appointments keeps access.
const read = checkPermission('appointments', 'read');
const write = checkPermission('appointments', 'create');
const manage = checkPermission('appointments', 'update');

/**
 * @swagger
 * /api/v1/recalls:
 *   get:
 *     tags: [Recalls]
 *     summary: List recalls with pagination and filters
 *     description: Requires `appointments:read`. Tenant-scoped; non-admin staff see only their branch.
 */
router.get('/', protect, read, phiRestrict, validate(listRecallsQuerySchema, 'query'), listRecallHandler);

/**
 * @swagger
 * /api/v1/recalls:
 *   post:
 *     tags: [Recalls]
 *     summary: Create a recall
 *     description: Requires `appointments:create`. Rejects duplicate active recalls (409).
 */
router.post('/', protect, write, phiRestrict, validate(createRecallSchema), createRecallHandler);

/**
 * @swagger
 * /api/v1/recalls/{id}:
 *   get:
 *     tags: [Recalls]
 *     summary: Get one recall
 */
router.get('/:id', protect, read, phiRestrict, getRecallHandler);

/**
 * @swagger
 * /api/v1/recalls/{id}:
 *   patch:
 *     tags: [Recalls]
 *     summary: Update recall fields (status changes use the transition endpoints)
 */
router.patch('/:id', protect, manage, phiRestrict, validate(updateRecallSchema), updateRecallHandler);

/**
 * @swagger
 * /api/v1/recalls/{id}/contact:
 *   post:
 *     tags: [Recalls]
 *     summary: Mark a recall as contacted (bumps contact attempts)
 */
router.post('/:id/contact', protect, manage, phiRestrict, validate(contactRecallSchema), contactRecallHandler);

/**
 * @swagger
 * /api/v1/recalls/{id}/postpone:
 *   post:
 *     tags: [Recalls]
 *     summary: Postpone a recall to a future date
 */
router.post('/:id/postpone', protect, manage, phiRestrict, validate(postponeRecallSchema), postponeRecallHandler);

/**
 * @swagger
 * /api/v1/recalls/{id}/schedule:
 *   post:
 *     tags: [Recalls]
 *     summary: Link a recall to its fulfillment appointment
 */
router.post('/:id/schedule', protect, manage, phiRestrict, validate(scheduleRecallSchema), scheduleRecallHandler);

/**
 * @swagger
 * /api/v1/recalls/{id}/complete:
 *   post:
 *     tags: [Recalls]
 *     summary: Complete a recall
 */
router.post('/:id/complete', protect, manage, phiRestrict, validate(outcomeSchema), completeRecallHandler);

/**
 * @swagger
 * /api/v1/recalls/{id}/dismiss:
 *   post:
 *     tags: [Recalls]
 *     summary: Dismiss a recall
 */
router.post('/:id/dismiss', protect, manage, phiRestrict, validate(outcomeSchema), dismissRecallHandler);

export default router;
