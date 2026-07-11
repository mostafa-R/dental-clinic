import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../../middleware/audit.js';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { getAbuseChecks, removeQuarantine, setQuarantine } from './siteQuarantine.controller.js';

const router = Router();

router.use(protectSite);

router.put(
  '/:tenantId',
  authorizeSite('super_admin'),
  audit('quarantine.set', 'tenant'),
  validate(z.object({ reason: z.string().optional() })),
  setQuarantine,
);

router.put(
  '/:tenantId/remove',
  authorizeSite('super_admin'),
  audit('quarantine.remove', 'tenant'),
  removeQuarantine,
);

router.get(
  '/checks',
  authorizeSite('super_admin', 'admin'),
  getAbuseChecks,
);

export default router;
