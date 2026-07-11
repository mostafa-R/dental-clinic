import { Router } from 'express';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { getUsersByTenant } from './siteUser.controller.js';

const router = Router();

router.use(protectSite);

router.get('/by-tenant/:tenantId', authorizeSite('super_admin', 'admin'), getUsersByTenant);

export default router;
