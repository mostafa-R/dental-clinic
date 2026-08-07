import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../../middleware/audit.js';
import { require2faSuperAdmin } from '../../../middleware/require2fa.js';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { getAbuseChecks, removeQuarantine, setQuarantine } from './siteQuarantine.controller.js';

const router = Router();

router.use(protectSite);

router.put(
  '/:tenantId/remove',
  authorizeSite('super_admin'),
  require2faSuperAdmin,
  audit('quarantine.remove', 'tenant'),
  removeQuarantine,
);

router.put(
  '/:tenantId',
  authorizeSite('super_admin'),
  require2faSuperAdmin,
  audit('quarantine.set', 'tenant'),
  validate(z.object({ reason: z.string().optional() })),
  setQuarantine,
);

router.get(
  '/checks',
  authorizeSite('super_admin', 'admin'),
  getAbuseChecks,
);

export default router;
