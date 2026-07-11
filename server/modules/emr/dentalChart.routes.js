import { Router } from 'express';

import {
  getDentalChart,
  updateDentalChart,
  updateTooth,
} from './dentalChart.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import { updateDentalChartSchema, updateToothSchema } from './emr.validator.js';

const router = Router({ mergeParams: true });

router.get('/', protect, checkPermission('emr', 'read'), phiRestrict, getDentalChart);
router.patch('/', protect, checkPermission('emr', 'update'), validate(updateDentalChartSchema), updateDentalChart);
router.patch('/teeth/:number', protect, checkPermission('emr', 'update'), validate(updateToothSchema), updateTooth);

export default router;
