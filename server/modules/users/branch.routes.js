import { Router } from 'express';
import { createBranch, deleteBranch, listBranches, updateBranch } from './branch.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { createBranchSchema, updateBranchSchema } from './branch.validator.js';

const router = Router();

/**
 * @swagger
 * /api/v1/branches:
 *   get:
 *     tags: [Branches]
 *     summary: List branches
 *     description: Requires `branches:read`. Filters by tenant; `?isActive=true|false` filters by status.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ['true', 'false'] }
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
router.get('/', protect, checkPermission('branches', 'read'), listBranches);

/**
 * @swagger
 * /api/v1/branches:
 *   post:
 *     tags: [Branches]
 *     summary: Create a branch
 *     description: Requires `branches:create`. Enforces the tenant's `maxBranches` plan limit. The creator must belong to a tenant.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               address: { type: string, maxLength: 500 }
 *               phone: { type: string, maxLength: 30 }
 *               isActive: { type: boolean, default: true }
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
router.post('/', protect, checkPermission('branches', 'create'), validate(createBranchSchema), createBranch);

/**
 * @swagger
 * /api/v1/branches/{id}:
 *   patch:
 *     tags: [Branches]
 *     summary: Update a branch
 *     description: Requires `branches:update`.
 *     security:
 *       - cookieAuth: []
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
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               address: { type: string, maxLength: 500 }
 *               phone: { type: string, maxLength: 30 }
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
router.patch('/:id', protect, checkPermission('branches', 'update'), validate(updateBranchSchema), updateBranch);

/**
 * @swagger
 * /api/v1/branches/{id}:
 *   delete:
 *     tags: [Branches]
 *     summary: Delete a branch
 *     description: Requires `branches:delete`. The last branch of a tenant cannot be deleted, nor can a branch that still has assigned users.
 *     security:
 *       - cookieAuth: []
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
 *                     message: { type: string, example: Branch deleted }
 *       '400':
 *         description: Invalid branch id or cannot delete the only branch
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.delete('/:id', protect, checkPermission('branches', 'delete'), deleteBranch);

export default router;
