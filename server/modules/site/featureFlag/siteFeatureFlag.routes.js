import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../../middleware/audit.js';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { getTenantModules, setModules, toggleModule } from './siteFeatureFlag.controller.js';

const router = Router();

router.use(protectSite);

router.get('/:tenantId', authorizeSite('super_admin', 'admin'), getTenantModules);

router.put(
  '/:tenantId/toggle',
  authorizeSite('super_admin'),
  audit('feature.toggle', 'tenant'),
  validate(z.object({ module: z.string(), enabled: z.boolean() })),
  toggleModule,
);

router.put(
  '/:tenantId/modules',
  authorizeSite('super_admin'),
  audit('feature.toggle', 'tenant'),
  validate(z.object({ modules: z.array(z.string()) })),
  setModules,
);

export default router;
