import { Router } from 'express';
import { protectSite, authorizeSite } from '../middleware/siteAuth.js';
import { getGlobalStats, getGrowthData, getTenantUsage } from '../controllers/siteAnalytics.controller.js';

const router = Router();

// All routes require site admin authentication
router.use(protectSite);

router.get(
  '/stats',
  authorizeSite('super_admin', 'admin', 'support'),
  getGlobalStats
);

router.get(
  '/growth',
  authorizeSite('super_admin', 'admin', 'support'),
  getGrowthData
);

router.get(
  '/usage/:tenantId',
  authorizeSite('super_admin', 'admin', 'support'),
  getTenantUsage
);

export default router;
