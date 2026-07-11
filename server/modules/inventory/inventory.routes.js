import { Router } from 'express';

import {
  adjustStock,
  createItem,
  deleteItem,
  getItem,
  listItems,
  updateItem,
} from './inventory.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import {
  adjustStockSchema,
  createItemSchema,
  listItemsQuerySchema,
  updateItemSchema,
} from './inventory.validator.js';

const router = Router();

router.get('/', protect, checkPermission('inventory', 'read'), validate(listItemsQuerySchema, 'query'), listItems);
router.get('/:id', protect, checkPermission('inventory', 'read'), getItem);
router.post('/', protect, checkPermission('inventory', 'create'), validate(createItemSchema), createItem);
router.patch('/:id', protect, checkPermission('inventory', 'update'), validate(updateItemSchema), updateItem);
router.delete('/:id', protect, checkPermission('inventory', 'delete'), deleteItem);
router.post('/:id/adjust', protect, checkPermission('inventory', 'update'), validate(adjustStockSchema), adjustStock);

export default router;
