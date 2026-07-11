import { Router } from 'express';
import { getStats } from './dashboard.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';

const router = Router();

router.get('/stats', protect, checkPermission('dashboard', 'read'), getStats);

export default router;
