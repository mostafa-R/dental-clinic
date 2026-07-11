import mongoose from 'mongoose';

import {
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
} from '../../constants/inventory.js';

export { INVENTORY_CATEGORIES, INVENTORY_UNITS };

/**
 * StockTransaction — an immutable ledger entry for every quantity change.
 * This gives full auditability: every stock-in, stock-out, adjustment, and
 * expiry is recorded with who/when/why.
 */
const stockTransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['stock_in', 'stock_out', 'adjustment', 'expired', 'initial'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      // Positive for stock_in/initial, negative for stock_out/expired,
      // can be either for adjustment.
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    reference: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: Date,
      default: () => new Date(),
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { _id: true, timestamps: true },
);

/**
 * InventoryItem — the master catalog of materials, one per tenant+branch.
 * Stores the current quantity and reorder threshold, plus an embedded
 * transaction ledger for full history.
 */
const inventoryItemSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
      default: null,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    sku: {
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
    category: {
      type: String,
      enum: INVENTORY_CATEGORIES,
      default: 'other',
      index: true,
    },
    unit: {
      type: String,
      enum: INVENTORY_UNITS,
      default: 'unit',
    },
    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    reorderPoint: {
      type: Number,
      default: 5,
      min: 0,
    },
    costPerUnit: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    supplier: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    transactions: {
      type: [stockTransactionSchema],
      default: [],
    },
  },
  { timestamps: true },
);

/**
 * Virtual: true when current quantity is at or below the reorder point.
 */
inventoryItemSchema.virtual('needsReorder').get(function needsReorder() {
  return this.quantity <= this.reorderPoint;
});

/**
 * Virtual: true when the item is expired (expiryDate in the past).
 */
inventoryItemSchema.virtual('isExpired').get(function isExpired() {
  if (!this.expiryDate) return false;
  return this.expiryDate.getTime() < Date.now();
});

inventoryItemSchema.set('toJSON', { virtuals: true });
inventoryItemSchema.set('toObject', { virtuals: true });

inventoryItemSchema.index({ branch: 1, name: 1 });
inventoryItemSchema.index({ branch: 1, category: 1 });
inventoryItemSchema.index({ branch: 1, isActive: 1 });

const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);

export default InventoryItem;
