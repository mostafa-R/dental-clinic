import { Router } from 'express';

import {
  createDrawing,
  createExpense,
  deleteDrawing,
  deleteExpense,
  getAccountingSummary,
  listCommissions,
  listDrawings,
  listExpenses,
  updateCommissionStatus,
} from '../controllers/accounting.controller.js';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { validate } from '../middleware/validate.js';
import {
  accountingSummaryQuerySchema,
  createDrawingSchema,
  createExpenseSchema,
  listCommissionQuerySchema,
  listDrawingQuerySchema,
  listExpenseQuerySchema,
  payCommissionSchema,
} from '../validators/accounting.validator.js';

const router = Router();

/* Expenses */
router.get('/expenses', protect, checkPermission('accounting', 'read'), validate(listExpenseQuerySchema, 'query'), listExpenses);
router.post('/expenses', protect, checkPermission('accounting', 'create'), validate(createExpenseSchema), createExpense);
router.delete('/expenses/:id', protect, checkPermission('accounting', 'delete'), deleteExpense);

/* Owner drawings */
router.get('/drawings', protect, checkPermission('accounting', 'read'), validate(listDrawingQuerySchema, 'query'), listDrawings);
router.post('/drawings', protect, checkPermission('accounting', 'create'), validate(createDrawingSchema), createDrawing);
router.delete('/drawings/:id', protect, checkPermission('accounting', 'delete'), deleteDrawing);

/* Commissions */
router.get('/commissions', protect, checkPermission('accounting', 'read'), validate(listCommissionQuerySchema, 'query'), listCommissions);
router.patch('/commissions/:id', protect, checkPermission('accounting', 'update'), validate(payCommissionSchema), updateCommissionStatus);

/* Summary (P&L) */
router.get('/summary', protect, checkPermission('accounting', 'read'), validate(accountingSummaryQuerySchema, 'query'), getAccountingSummary);

export default router;