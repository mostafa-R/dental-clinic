import { Router } from 'express';
import { z } from 'zod';

import { globalSearch } from './search.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';

const searchQuerySchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters').max(100),
});

const router = Router();

router.get('/', protect, checkPermission('patients', 'read'), validate(searchQuerySchema, 'query'), globalSearch);

export default router;
