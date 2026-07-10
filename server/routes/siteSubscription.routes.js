import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { protectSite, authorizeSite } from '../middleware/siteAuth.js';
import {
  getSubscriptions,
  getRevenueStats,
  updateSubscription,
  processPayment,
} from '../controllers/siteSubscription.controller.js';
import { subscriptionSchema, paymentSchema } from '../validators/site.validator.js';

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
  validate(subscriptionSchema),
  updateSubscription
);

router.post(
  '/:tenantId/payment',
  authorizeSite('super_admin', 'admin'),
  validate(paymentSchema),
  processPayment
);

export default router;
