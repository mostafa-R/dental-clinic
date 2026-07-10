import { Router } from 'express';
import { protectSite, authorizeSite } from '../middleware/siteAuth.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { getAuditLogs, getAuditActions } from '../controllers/siteAudit.controller.js';

const router = Router();

router.use(protectSite);

const auditQuerySchema = z.object({
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  action: z.string().optional(),
  adminId: z.string().optional(),
  targetType: z.enum(['tenant', 'branch', 'admin', 'subscription', 'plan', 'platform']).optional(),
  targetId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get('/', authorizeSite('super_admin', 'admin', 'support'), validate(auditQuerySchema, 'query'), getAuditLogs);
router.get('/actions', authorizeSite('super_admin', 'admin', 'support'), getAuditActions);

export default router;
