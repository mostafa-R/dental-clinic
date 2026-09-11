import { Router } from 'express';
import { getHealth } from './siteHealth.controller.js';
import { protectSite, authorizeSite } from '../../middleware/siteAuth.js';

const router = Router();

// Detailed health/telemetry endpoint. Restricted to super_admin: it exposes
// DB readyState, Redis info, Node version, memory, and pid.
router.get('/', protectSite, authorizeSite('super_admin'), getHealth);

export default router;
