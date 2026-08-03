import { Router } from 'express';
import { authorizeSite, protectSite, requireTenantAccess } from '../../../middleware/siteAuth.js';
import { getUsersByTenant } from './siteUser.controller.js';

const router = Router();

router.use(protectSite);

// Get users by tenant - requires tenant access validation
router.get('/by-tenant/:tenantId', authorizeSite('super_admin', 'admin'), requireTenantAccess, getUsersByTenant);

export default router;
