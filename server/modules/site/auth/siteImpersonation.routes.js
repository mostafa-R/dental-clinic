import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../../middleware/audit.js';
import { require2fa } from '../../../middleware/require2fa.js';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { endImpersonation, startImpersonation } from './siteImpersonation.controller.js';

const router = Router();

router.use(protectSite);

// Start impersonation - sensitive operation, requires 2FA
router.post(
  '/start',
  authorizeSite('super_admin', 'admin'),
  require2fa,
  audit('impersonation.start', 'tenant'),
  validate(z.object({
    userId: z.string(),
    tenantId: z.string(),
  })),
  startImpersonation,
);

// End impersonation - no 2FA required (just logging)
router.post(
  '/end',
  authorizeSite('super_admin', 'admin'),
  audit('impersonation.end', 'user'),
  endImpersonation,
);

export default router;
