import { z } from 'zod';

import {
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  STOCK_TX_TYPES,
} from '../constants/inventory.js';

/* -------------------------------------------------------- Inventory items */

export const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  sku: z.string().max(60).optional(),
  category: z.enum(INVENTORY_CATEGORIES).optional(),
  unit: z.enum(INVENTORY_UNITS).optional(),
  quantity: z.number().min(0).optional(),
  reorderPoint: z.number().min(0).optional(),
  costPerUnit: z.number().min(0).optional(),
  expiryDate: z.string().datetime({ message: 'Invalid date' }).optional().or(z.literal('')),
  supplier: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  branch: z.string().length(24, 'Invalid branch id').optional(),
});

export const updateItemSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    sku: z.string().max(60).optional(),
  category: z.enum(INVENTORY_CATEGORIES).optional().or(z.literal('')),
    unit: z.enum(INVENTORY_UNITS).optional(),
    reorderPoint: z.number().min(0).optional(),
    costPerUnit: z.number().min(0).optional(),
    expiryDate: z.string().datetime({ message: 'Invalid date' }).optional().or(z.literal('')),
    supplier: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

export const listItemsQuerySchema = z.object({
  search: z.string().max(100).optional(),
  category: z.enum(INVENTORY_CATEGORIES).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/* ------------------------------------------------------ Stock adjustment */

export const adjustStockSchema = z.object({
  type: z.enum(STOCK_TX_TYPES),
  quantity: z.number().min(0.01, 'Quantity must be positive'),
  reason: z.string().max(200).optional(),
  reference: z.string().max(200).optional(),
});
