import { Router } from 'express';
import { require2fa } from '../../../middleware/require2fa.js';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { paymentSchema, createSubscriptionSchema, subscriptionSchema } from '../tenant/site.validator.js';
import {
  createSubscription,
  getRevenueStats,
  getSubscriptions,
  processPayment,
  updateSubscription,
} from './siteSubscription.controller.js';

const router = Router();

// All routes require site admin authentication
router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/subscriptions:
 *   get:
 *     tags: [Site Subscriptions]
 *     summary: List subscriptions
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: List of subscriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscriptions:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Subscription' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/',
  authorizeSite('super_admin', 'admin', 'support'),
  getSubscriptions
);

/**
 * @swagger
 * /api/v1/site/subscriptions/revenue:
 *   get:
 *     tags: [Site Subscriptions]
 *     summary: Get subscription revenue statistics
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Revenue statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: object }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/revenue',
  authorizeSite('super_admin', 'admin', 'support'),
  getRevenueStats
);

/**
 * @swagger
 * /api/v1/site/subscriptions/{id}:
 *   put:
 *     tags: [Site Subscriptions]
 *     summary: Update a subscription
 *     description: Site realm. Requires `super_admin` or `admin` role and 2FA confirmation.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
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
 *               plan: { $ref: '#/components/schemas/ObjectId' }
 *               status: { type: string, enum: [active, trialing, past_due, canceled, expired] }
 *               autoRenew: { type: boolean }
 *               startDate: { type: string, format: date-time }
 *               endDate: { type: string, format: date-time }
 *     responses:
 *       '200':
 *         description: Subscription updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscription: { $ref: '#/components/schemas/Subscription' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * @swagger
 * /api/v1/site/subscriptions/{tenantId}:
 *   post:
 *     tags: [Site Subscriptions]
 *     summary: Subscribe a clinic
 *     description: >
 *       Creates the subscription for a clinic that does not have one yet and
 *       stamps the plan's modules and limits onto the clinic. Previously the only
 *       way a subscription existed was as a side-effect of creating a new clinic
 *       (POST /tenants), so an existing clinic could never be subscribed.
 *       Requires `super_admin` role and 2FA confirmation. Returns 409 if the
 *       clinic already has a subscription — edit that one instead.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plan]
 *             properties:
 *               plan: { type: string, description: 'Plan key or ObjectId' }
 *               billingCycle: { type: string, enum: [monthly, yearly] }
 *               status: { type: string, enum: [active, pending], default: pending }
 *     responses:
 *       '201':
 *         description: Subscription created and plan stamped onto the clinic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Subscription' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         description: Clinic already has a subscription
 */
router.post(
  '/:tenantId',
  authorizeSite('super_admin'),
  require2fa,
  validate(createSubscriptionSchema),
  createSubscription
);

router.put(
  '/:id',
  authorizeSite('super_admin'),
  require2fa,
  validate(subscriptionSchema),
  updateSubscription
);

/**
 * @swagger
 * /api/v1/site/subscriptions/{tenantId}/payment:
 *   post:
 *     tags: [Site Subscriptions]
 *     summary: Record a manual subscription payment
 *     description: Site realm. Requires `super_admin` or `admin` role and 2FA confirmation. Records an offline payment against the tenant's subscription.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount: { type: number }
 *               method: { type: string, enum: [cash, card, transfer] }
 *               reference: { type: string }
 *               notes: { type: string }
 *     responses:
 *       '201':
 *         description: Payment recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     payment: { type: object }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:tenantId/payment',
  authorizeSite('super_admin', 'admin'),
  require2fa,
  validate(paymentSchema),
  processPayment
);

export default router;
