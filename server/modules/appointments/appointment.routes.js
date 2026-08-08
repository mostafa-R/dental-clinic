import { Router } from 'express';

import {
  cancelAppointment,
  createAppointment,
  getAppointment,
  listAppointments,
  transitionAppointment,
  updateAppointment,
} from './appointment.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  transitionSchema,
  updateAppointmentSchema,
} from './appointment.validator.js';

const router = Router();

router.get('/', protect, checkPermission('appointments', 'read'), phiRestrict, validate(listAppointmentsQuerySchema, 'query'), listAppointments);
router.get('/:id', protect, checkPermission('appointments', 'read'), phiRestrict, getAppointment);
router.post('/', protect, checkPermission('appointments', 'create'), phiRestrict, validate(createAppointmentSchema), createAppointment);
router.patch('/:id', protect, checkPermission('appointments', 'update'), phiRestrict, validate(updateAppointmentSchema), updateAppointment);
router.patch('/:id/status', protect, checkPermission('appointments', 'update'), phiRestrict, validate(transitionSchema), transitionAppointment);
router.delete('/:id', protect, checkPermission('appointments', 'delete'), phiRestrict, cancelAppointment);

export default router;
