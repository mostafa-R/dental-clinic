import { Router } from 'express';
import { getHealth } from './siteHealth.controller.js';

const router = Router();

router.get('/', getHealth);

export default router;
