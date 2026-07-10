import { Router } from 'express';

import {
  cancelAppointment,
  createAppointment,
  getAppointment,
  listAppointments,
  transitionAppointment,
  updateAppointment,
} from '../controllers/appointment.controller.js';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { validate } from '../middleware/validate.js';
import {
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  transitionSchema,
  updateAppointmentSchema,
} from '../validators/appointment.validator.js';

const router = Router();

router.get('/', protect, checkPermission('appointments', 'read'), validate(listAppointmentsQuerySchema, 'query'), listAppointments);
router.get('/:id', protect, checkPermission('appointments', 'read'), getAppointment);
router.post('/', protect, checkPermission('appointments', 'create'), validate(createAppointmentSchema), createAppointment);
router.patch('/:id', protect, checkPermission('appointments', 'update'), validate(updateAppointmentSchema), updateAppointment);
router.patch('/:id/status', protect, checkPermission('appointments', 'update'), validate(transitionSchema), transitionAppointment);
router.delete('/:id', protect, checkPermission('appointments', 'delete'), cancelAppointment);

export default router;