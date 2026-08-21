import { Router } from 'express';
import { getMe, getMyPermissions, login, logout, refresh, updatePreferences, verifyImpersonation } from './auth.controller.js';
import { protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { loginSchema, preferencesSchema } from './auth.validator.js';

const router = Router();

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in as clinic staff
 *     description: Authenticates a staff member and sets the `access_token` and `refresh_token` HTTP-only cookies.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       '200':
 *         description: Login successful
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
 *       '429':
 *         description: Too many login attempts, please try again later
 */
router.post('/login', validate(loginSchema), login);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out
 *     description: Revokes the refresh token and clears the authentication cookies.
 *     responses:
 *       '200':
 *         description: Logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Logged out }
 */
router.post('/logout', logout);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: Rotates the refresh token (HTTP-only `refresh_token` cookie) and issues a new access token.
 *     responses:
 *       '200':
 *         description: Token refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Token refreshed }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '429':
 *         description: Too many requests, please slow down
 */
router.post('/refresh', refresh);

/**
 * @swagger
 * /api/v1/auth/verify-impersonation:
 *   post:
 *     tags: [Auth]
 *     summary: Activate an impersonation session
 *     description: Exchanges a bearer impersonation token (from `/site/impersonation/start`) for a clinic session cookie so the admin can act as the target user with PHI masking.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: Impersonation JWT }
 *     responses:
 *       '200':
 *         description: Impersonation session established
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       allOf:
 *                         - $ref: '#/components/schemas/User'
 *                         - type: object
 *                           properties:
 *                             _impersonating: { type: boolean, example: true }
 *                             _impersonator: { type: string }
 *       '400':
 *         description: Token is required or not an impersonation token
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/verify-impersonation', verifyImpersonation);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current user
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Current user details
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
 */
router.get('/me', protect, getMe);

/**
 * @swagger
 * /api/v1/auth/my-permissions:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current user's permissions
 *     description: Returns the resolved role's permission map for the permission matrix UI.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Permission map for the current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     isSystemAdmin: { type: boolean }
 *                     permissions:
 *                       type: object
 *                       additionalProperties:
 *                         type: array
 *                         items: { type: string, enum: [create, read, update, delete] }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/my-permissions', protect, getMyPermissions);

/**
 * @swagger
 * /api/v1/auth/preferences:
 *   patch:
 *     tags: [Auth]
 *     summary: Update the current user's preferences
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               language: { type: string, enum: [en, ar] }
 *               theme: { type: string, enum: [light, dark] }
 *     responses:
 *       '200':
 *         description: Preferences updated
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
 */
router.patch('/preferences', protect, validate(preferencesSchema), updatePreferences);

export default router;
