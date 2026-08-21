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

/**
 * @swagger
 * /api/v1/inventory:
 *   get:
 *     tags: [Inventory]
 *     summary: List inventory items
 *     description: Requires `inventory:read`. Searches by name/SKU and filters by category or low stock.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: search
 *         schema: { type: string, maxLength: 100 }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [anesthetic, filling_material, consumable, instrument, medication, hygiene, other] }
 *       - in: query
 *         name: lowStock
 *         schema: { type: string, enum: ['true', 'false'] }
 *     responses:
 *       '200':
 *         description: List of inventory items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/InventoryItem' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('inventory', 'read'), validate(listItemsQuerySchema, 'query'), listItems);

/**
 * @swagger
 * /api/v1/inventory/{id}:
 *   get:
 *     tags: [Inventory]
 *     summary: Get an inventory item
 *     description: Requires `inventory:read`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Inventory item details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     item: { $ref: '#/components/schemas/InventoryItem' }
 *       '400':
 *         description: Invalid item id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', protect, checkPermission('inventory', 'read'), getItem);

/**
 * @swagger
 * /api/v1/inventory:
 *   post:
 *     tags: [Inventory]
 *     summary: Create an inventory item
 *     description: Requires `inventory:create`. A branch is required. Opening quantity is recorded as an initial stock transaction.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 120 }
 *               sku: { type: string, maxLength: 60 }
 *               category: { type: string, enum: [anesthetic, filling_material, consumable, instrument, medication, hygiene, other] }
 *               unit: { type: string, enum: [unit, box, pack, bottle, tube, set, ml, g] }
 *               quantity: { type: number, minimum: 0 }
 *               reorderPoint: { type: number, minimum: 0 }
 *               costPerUnit: { type: number, minimum: 0 }
 *               expiryDate: { type: string, format: date-time }
 *               supplier: { type: string, maxLength: 200 }
 *               notes: { type: string, maxLength: 500 }
 *               branch: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '201':
 *         description: Inventory item created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     item: { $ref: '#/components/schemas/InventoryItem' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', protect, checkPermission('inventory', 'create'), validate(createItemSchema), createItem);

/**
 * @swagger
 * /api/v1/inventory/{id}:
 *   patch:
 *     tags: [Inventory]
 *     summary: Update an inventory item
 *     description: Requires `inventory:update`. Quantity cannot be changed here — use the adjust endpoint.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 120 }
 *               sku: { type: string, maxLength: 60 }
 *               category: { type: string, enum: [anesthetic, filling_material, consumable, instrument, medication, hygiene, other] }
 *               unit: { type: string, enum: [unit, box, pack, bottle, tube, set, ml, g] }
 *               reorderPoint: { type: number, minimum: 0 }
 *               costPerUnit: { type: number, minimum: 0 }
 *               expiryDate: { type: string, format: date-time }
 *               supplier: { type: string, maxLength: 200 }
 *               notes: { type: string, maxLength: 500 }
 *               isActive: { type: boolean }
 *     responses:
 *       '200':
 *         description: Inventory item updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     item: { $ref: '#/components/schemas/InventoryItem' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id', protect, checkPermission('inventory', 'update'), validate(updateItemSchema), updateItem);

/**
 * @swagger
 * /api/v1/inventory/{id}:
 *   delete:
 *     tags: [Inventory]
 *     summary: Delete an inventory item
 *     description: Requires `inventory:delete`. Soft-deletes the item.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Inventory item deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Item deleted }
 *       '400':
 *         description: Invalid item id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', protect, checkPermission('inventory', 'delete'), deleteItem);

/**
 * @swagger
 * /api/v1/inventory/{id}/adjust:
 *   post:
 *     tags: [Inventory]
 *     summary: Adjust stock
 *     description: Requires `inventory:update`. Applies a stock transaction (stock in, out, adjustment, or expiry) and updates the item quantity.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, quantity]
 *             properties:
 *               type: { type: string, enum: [stock_in, stock_out, adjustment, expired, initial] }
 *               quantity: { type: number, minimum: 0.01 }
 *               reason: { type: string, maxLength: 200 }
 *               reference: { type: string, maxLength: 200 }
 *     responses:
 *       '200':
 *         description: Stock adjusted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     item: { $ref: '#/components/schemas/InventoryItem' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/:id/adjust', protect, checkPermission('inventory', 'update'), validate(adjustStockSchema), adjustStock);

export default router;
