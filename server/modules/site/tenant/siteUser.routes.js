import { Router } from 'express';
import { protectSite, authorizeSite } from '../../../middleware/siteAuth.js';
import { getUsersByTenant } from './siteUser.controller.js';

const router = Router();

router.use(protectSite);

router.get('/by-tenant/:tenantId', authorizeSite('super_admin', 'admin'), getUsersByTenant);

export default router;
