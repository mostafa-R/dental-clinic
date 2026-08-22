import { Router } from 'express';

import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import {
  createRole,
  deleteRole,
  getModules,
  getRole,
  listRoles,
  updateRole,
} from './role.controller.js';
import {
  createRoleFromTemplate,
  getPermissionMatrix,
  getRoleTemplates,
  toggleRoleStatus,
  updateRolePermissions,
} from './role.enhanced.controller.js';
import {
  createRoleSchema,
  updateRoleSchema
} from './role.validator.js';

const router = Router();

// All routes require authentication. Only super_admin (via the 'roles' module
// permission) can manage roles. For backwards compatibility, the built-in
// super_admin role always passes — checkPermission resolves it as isSystemAdmin.
/**
 * @swagger
 * /api/v1/roles/modules/list:
 *   get:
 *     tags: [Roles]
 *     summary: Get the module and action catalog
 *     description: Returns all modules and CRUD actions for the permission matrix UI. Requires `roles:read`.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Module and action catalog
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     modules:
 *                       type: array
 *                       items: { type: string }
 *                     actions:
 *                       type: array
 *                       items: { type: string, enum: [create, read, update, delete] }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/modules/list', protect, checkPermission('roles', 'read'), getModules);

/**
 * @swagger
 * /api/v1/roles:
 *   get:
 *     tags: [Roles]
 *     summary: List roles
 *     description: Returns roles for the current tenant (plus platform-level roles) along with the module/action catalog. Requires `roles:read`.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: List of roles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     roles:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Role' }
 *                     modules:
 *                       type: array
 *                       items: { type: string }
 *                     actions:
 *                       type: array
 *                       items: { type: string, enum: [create, read, update, delete] }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('roles', 'read'), listRoles);

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   get:
 *     tags: [Roles]
 *     summary: Get a role
 *     description: Requires `roles:read`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Role details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     role: { $ref: '#/components/schemas/Role' }
 *       '400':
 *         description: Invalid role id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', protect, checkPermission('roles', 'read'), getRole);

/**
 * @swagger
 * /api/v1/roles:
 *   post:
 *     tags: [Roles]
 *     summary: Create a custom role
 *     description: Requires `roles:create`. Role names must be unique within the tenant/branch.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, permissions]
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 60 }
 *               description: { type: string, maxLength: 300 }
 *               permissions:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 items: { $ref: '#/components/schemas/PermissionEntry' }
 *               branch: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '201':
 *         description: Role created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     role: { $ref: '#/components/schemas/Role' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', protect, checkPermission('roles', 'create'), validate(createRoleSchema), createRole);

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   patch:
 *     tags: [Roles]
 *     summary: Update a role
 *     description: Requires `roles:update`. Built-in roles cannot be renamed but their permissions can be edited.
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
 *               name: { type: string, minLength: 1, maxLength: 60 }
 *               description: { type: string, maxLength: 300 }
 *               permissions:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/PermissionEntry' }
 *               isActive: { type: boolean }
 *     responses:
 *       '200':
 *         description: Role updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     role: { $ref: '#/components/schemas/Role' }
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
router.patch('/:id', protect, checkPermission('roles', 'update'), validate(updateRoleSchema), updateRole);

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   delete:
 *     tags: [Roles]
 *     summary: Delete a custom role
 *     description: Requires `roles:delete`. Built-in roles cannot be deleted. Users assigned to the role are detached (roleId set to null).
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Role deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Role deleted }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.delete('/:id', protect, checkPermission('roles', 'delete'), deleteRole);

/**
 * Enhanced Role Management APIs
 */

/**
 * @swagger
 * /api/v1/roles/matrix:
 *   get:
 *     tags: [Roles]
 *     summary: Get complete permission matrix
 *     description: Returns the full permission matrix (module × role × action) for display in permission management UI
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Permission matrix
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     matrix: { type: object }
 *                     modules: { type: array }
 *                     actions: { type: array }
 *                     roles: { type: array }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/matrix', protect, checkPermission('roles', 'read'), getPermissionMatrix);

/**
 * @swagger
 * /api/v1/roles/templates:
 *   get:
 *     tags: [Roles]
 *     summary: Get role templates for copying
 *     description: Returns default and built-in roles that can be used as templates for creating new custom roles
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Role templates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     defaultRoles: { type: array }
 *                     builtInRoles: { type: array }
 *                     customRoles: { type: array }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/templates', protect, checkPermission('roles', 'read'), getRoleTemplates);

/**
 * @swagger
 * /api/v1/roles/create-from-template:
 *   post:
 *     tags: [Roles]
 *     summary: Create role from template
 *     description: Create a new custom role by copying permissions from an existing role
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
 *               name: { type: string, minLength: 2 }
 *               description: { type: string }
 *               baseRoleId: { type: string }
 *               permissions: { type: array }
 *     responses:
 *       '201':
 *         description: Role created from template
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     role: { $ref: '#/components/schemas/Role' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/create-from-template', protect, checkPermission('roles', 'create'), createRoleFromTemplate);

/**
 * @swagger
 * /api/v1/roles/{id}/permissions:
 *   put:
 *     tags: [Roles]
 *     summary: Update role permissions
 *     description: Update permissions for a specific role (supports partial updates)
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
 *             required: [permissions]
 *             properties:
 *               permissions:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/PermissionEntry' }
 *     responses:
 *       '200':
 *         description: Role permissions updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     role: { $ref: '#/components/schemas/Role' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/:id/permissions', protect, checkPermission('roles', 'update'), updateRolePermissions);

/**
 * @swagger
 * /api/v1/roles/{id}/toggle-status:
 *   patch:
 *     tags: [Roles]
 *     summary: Toggle role active status
 *     description: Activate or deactivate a role (deactivation detaches all users)
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
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       '200':
 *         description: Role status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     role: { $ref: '#/components/schemas/Role' }
 *                     message: { type: string }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id/toggle-status', protect, checkPermission('roles', 'update'), toggleRoleStatus);

export default router;
