import { Router } from 'express';
import { getMe, getMyPermissions, login, logout, refresh, updatePreferences, verifyImpersonation } from './auth.controller.js';
import { protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { loginSchema, preferencesSchema } from './auth.validator.js';

const router = Router();

router.post('/login', validate(loginSchema), login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.post('/verify-impersonation', verifyImpersonation);
router.get('/me', protect, getMe);
router.get('/my-permissions', protect, getMyPermissions);
router.patch('/preferences', protect, validate(preferencesSchema), updatePreferences);

export default router;
