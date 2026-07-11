import { Router } from 'express';

import { globalSearch } from './search.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';

const router = Router();

router.get('/', protect, checkPermission('patients', 'read'), globalSearch);

export default router;
