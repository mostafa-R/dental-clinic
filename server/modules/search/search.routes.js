import { Router } from 'express';
import { z } from 'zod';

import { globalSearch } from './search.controller.js';
import { SEARCHABLE_MODULES } from './search.service.js';
import { protect } from '../../middleware/auth.js';
import { checkAnyPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';

const searchQuerySchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters').max(100),
});

// Admission control for the whole endpoint: hold `read` on at least one
// searchable module. Which sections actually come back is decided per module by
// the `can()` guards in the service, so this gate only has to answer "may this
// user search at all?" — it must not be narrower than that. See
// SEARCHABLE_MODULES for what the previous `patients:read`-only gate broke.
const canSearchAnything = checkAnyPermission(SEARCHABLE_MODULES.map((m) => [m, 'read']));

const router = Router();

/**
 * @swagger
 * /api/v1/search:
 *   get:
 *     tags: [Search]
  *     summary: Global search
  *     description: >
  *       Requires `read` on at least one searchable module (patients, appointments,
  *       billing, accounting, branches, users, roles, inventory, emr, prescriptions).
  *       Results are filtered per module, so a user only ever sees sections they
  *       are entitled to. PHI is masked during impersonation.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         description: Search term (at least 2 characters).
 *         schema: { type: string, minLength: 2, maxLength: 100 }
 *     responses:
 *       '200':
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/GlobalSearchResult' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, canSearchAnything, phiRestrict, validate(searchQuerySchema, 'query'), globalSearch);

export default router;
