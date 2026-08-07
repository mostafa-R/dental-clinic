import { Router } from 'express';
import { require2fa } from '../../../middleware/require2fa.js';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { paymentSchema, subscriptionSchema } from '../tenant/site.validator.js';
import {
  getRevenueStats,
  getSubscriptions,
  processPayment,
  updateSubscription,
} from './siteSubscription.controller.js';

const router = Router();

// All routes require site admin authentication
router.use(protectSite);

router.get(
  '/',
  authorizeSite('super_admin', 'admin', 'support'),
  getSubscriptions
);

router.get(
  '/revenue',
  authorizeSite('super_admin', 'admin', 'support'),
  getRevenueStats
);

router.put(
  '/:id',
  authorizeSite('super_admin', 'admin'),
  require2fa,
  validate(subscriptionSchema),
  updateSubscription
);

router.post(
  '/:tenantId/payment',
  authorizeSite('super_admin', 'admin'),
  require2fa,
  validate(paymentSchema),
  processPayment
);

export default router;
