import { Router } from 'express';
import { protectSite, authorizeSite } from '../middleware/siteAuth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { startImpersonation, endImpersonation } from '../controllers/siteImpersonation.controller.js';

const router = Router();

router.use(protectSite);

router.post(
  '/start',
  authorizeSite('super_admin', 'admin'),
  audit('impersonation.start', 'tenant'),
  validate(z.object({
    userId: z.string(),
    tenantId: z.string(),
  })),
  startImpersonation,
);

router.post(
  '/end',
  authorizeSite('super_admin', 'admin'),
  endImpersonation,
);

export default router;
