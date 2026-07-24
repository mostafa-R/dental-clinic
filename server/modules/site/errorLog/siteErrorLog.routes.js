import { Router } from 'express';
import { protectSite, authorizeSite } from '../../../middleware/siteAuth.js';
import { getErrorLogs, getErrorLogStats, resolveErrorLog } from './siteErrorLog.controller.js';

const router = Router();

router.use(protectSite);

router.get('/', authorizeSite('super_admin', 'admin'), getErrorLogs);
router.get('/stats', authorizeSite('super_admin', 'admin'), getErrorLogStats);
router.patch('/:id/resolve', authorizeSite('super_admin', 'admin'), resolveErrorLog);

export default router;
