import { Router } from 'express';
import { protectSite, authorizeSite } from '../../../middleware/siteAuth.js';
import { require2faChallenge } from '../../../middleware/require2fa.js';
import { audit } from '../../../middleware/audit.js';
import { validate } from '../../../middleware/validate.js';
import { z } from 'zod';
import {
  setup2fa, verify2fa, disable2fa, get2faStatus, verify2faLogin,
} from './site2fa.controller.js';
import { setAuthCookies } from '../../../utils/jwt.js';
import { sendSuccess } from '../../../utils/sendSuccess.js';

const router = Router();

// Public: complete 2FA during login
router.post(
  '/verify-login',
  validate(z.object({
    adminId: z.string(),
    token: z.string().optional(),
    backupCode: z.string().optional(),
    challengeToken: z.string(),
  })),
  require2faChallenge,
  async (req, res, next) => {
    try {
      const { token, backupCode } = req.validatedBody;
      const admin = req._2faAdmin;

      if (!token && !backupCode) {
        return res.status(400).json({ success: false, message: 'Token or backup code required' });
      }

      // Re-verify against the admin from challenge
      req.validatedBody = { adminId: admin._id.toString(), token, backupCode };
      req.params = {};
      const origJson = res.json.bind(res);
      res.json = function (body) {
        if (body?.success && body?.data?.verified) {
          admin.lastLogin = new Date();
          admin.save().catch(() => {});
          setAuthCookies(res, admin, 'site');
          return origJson({ success: true, data: { user: admin.toSafeObject() } });
        }
        return origJson(body);
      };
      return next();
    } catch (err) { next(err); }
  },
  verify2faLogin,
);

// Protected: manage 2FA for the authenticated admin
router.use(protectSite);

router.get('/status', get2faStatus);
router.post('/setup', setup2fa);
router.post(
  '/verify',
  validate(z.object({ token: z.string().min(6) })),
  audit('2fa.enable', 'admin'),
  verify2fa,
);
router.post(
  '/disable',
  validate(z.object({ token: z.string().min(6) })),
  audit('2fa.disable', 'admin'),
  disable2fa,
);

export default router;
