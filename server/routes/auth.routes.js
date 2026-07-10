import { Router } from 'express';
import { getMe, getMyPermissions, login, logout, refresh, updatePreferences } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, preferencesSchema } from '../validators/auth.validator.js';

const router = Router();

router.post('/login', validate(loginSchema), login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/me', protect, getMe);
router.get('/my-permissions', protect, getMyPermissions);
router.patch('/preferences', protect, validate(preferencesSchema), updatePreferences);

export default router;
