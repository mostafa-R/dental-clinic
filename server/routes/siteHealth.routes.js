import { Router } from 'express';
import { protectSite } from '../middleware/siteAuth.js';
import { getHealth } from '../controllers/siteHealth.controller.js';

const router = Router();

router.get('/', protectSite, getHealth);

export default router;
