import { Router } from 'express';
import { createUser, deleteUser, getUser, listDoctors, listUsers, toggleUserActive, updateUser } from './user.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { createUserSchema, updateUserSchema } from './user.validator.js';
import { z } from 'zod';

const listUsersQuerySchema = z.object({
  roleId: z.string().length(24).optional(),
  isDoctor: z.enum(['true', 'false']).optional(),
  branch: z.string().length(24).optional(),
});

const router = Router();

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     tags: [Users]
 *     summary: List staff members
 *     description: Requires `users:read`. Clinic owners see only their own tenant's users; platform admins see all.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PaginationPage' }
 *       - { $ref: '#/components/parameters/PaginationLimit' }
 *       - in: query
 *         name: roleId
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *         description: Filter by role
 *       - in: query
 *         name: isDoctor
 *         schema: { type: string, enum: ['true', 'false'] }
 *       - in: query
 *         name: branch
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *         description: Filter by branch
 *     responses:
 *       '200':
 *         description: Paginated list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/User' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('users', 'read'), validate(listUsersQuerySchema, 'query'), listUsers);

/**
 * @swagger
 * /api/v1/users/doctors:
 *   get:
 *     tags: [Users]
 *     summary: List doctors
 *     description: Lightweight doctor list for booking appointments. Requires `appointments:create`.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: List of doctors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     doctors:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/User' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/doctors', protect, checkPermission('appointments', 'create'), listDoctors);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get a staff member
 *     description: Requires `users:read`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *       '400':
 *         description: Invalid user id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', protect, checkPermission('users', 'read'), getUser);

/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     tags: [Users]
 *     summary: Create a staff member
 *     description: Requires `users:create`. Enforces plan limits on the number of doctors and tenant/branch ownership.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, roleId]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 80 }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, maxLength: 128 }
 *               roleId: { $ref: '#/components/schemas/ObjectId' }
 *               phone: { type: string, maxLength: 30 }
 *               branch: { $ref: '#/components/schemas/ObjectId', nullable: true }
 *               isActive: { type: boolean, default: true }
 *               isDoctor: { type: boolean, default: false }
 *               commissionRate: { type: number, minimum: 0, maximum: 100 }
 *     responses:
 *       '201':
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', protect, checkPermission('users', 'create'), validate(createUserSchema), createUser);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update a staff member
 *     description: Requires `users:update`. Password changes revoke all existing sessions.
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
 *               name: { type: string, minLength: 2, maxLength: 80 }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, maxLength: 128 }
 *               phone: { type: string, maxLength: 30 }
 *               branch: { $ref: '#/components/schemas/ObjectId', nullable: true }
 *               isActive: { type: boolean }
 *               isDoctor: { type: boolean }
 *               roleId: { $ref: '#/components/schemas/ObjectId' }
 *               commissionRate: { type: number, minimum: 0, maximum: 100 }
 *     responses:
 *       '200':
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.patch('/:id', protect, checkPermission('users', 'update'), validate(updateUserSchema), updateUser);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Deactivate a staff member
 *     description: Soft-delete (deactivate). Requires `users:delete`. You cannot deactivate your own account.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: User deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: User deactivated }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', protect, checkPermission('users', 'delete'), deleteUser);

/**
 * @swagger
 * /api/v1/users/{id}/toggle-active:
 *   patch:
 *     tags: [Users]
 *     summary: Toggle a staff member's active status
 *     description: Requires `users:update`. You cannot deactivate your own account.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: User status toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id/toggle-active', protect, checkPermission('users', 'update'), toggleUserActive);

export default router;
