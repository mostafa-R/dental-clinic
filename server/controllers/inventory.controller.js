import mongoose from 'mongoose';

import InventoryItem from '../models/InventoryItem.js';
import { currentTenant, filterByBranch, resolveBranchForCreate, toObjectId } from '../utils/branchScope.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/sendSuccess.js';
import { escapeRegex } from '../utils/escapeRegex.js';

/* --------------------------------------------------------- List / search */

export const listItems = asyncHandler(async (req, res) => {
  const { search, category, lowStock, page, limit } = req.validatedQuery;
  const filter = { ...filterByBranch(req) };

  if (search?.trim()) {
    const term = escapeRegex(search.trim());
    const regex = new RegExp(term, 'i');
    filter.$or = [{ name: regex }, { sku: regex }, { supplier: regex }];
  }
  if (category) filter.category = category;
  if (lowStock === 'true') {
    filter.$expr = { $lte: ['$quantity', '$reorderPoint'] };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    InventoryItem.find(filter).sort('name').skip(skip).limit(limit),
    InventoryItem.countDocuments(filter),
  ]);

  const lowStockCount = await InventoryItem.countDocuments({
    ...filterByBranch(req),
    $expr: { $lte: ['$quantity', '$reorderPoint'] },
  });

  return sendSuccess(res, {
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: { lowStockCount },
  });
});

/* --------------------------------------------------------- Single item */

export const getItem = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid item id');
  }
  const item = await InventoryItem.findOne({ _id: req.params.id, ...filterByBranch(req) });
  if (!item) {
    throw ApiError.notFound('Inventory item not found');
  }
  return sendSuccess(res, { item });
});

/* --------------------------------------------------------- Create */

export const createItem = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const data = req.validatedBody;

  const branch = await resolveBranchForCreate(req, data.branch);
  if (!branch) {
    throw ApiError.badRequest('branch is required', { branch: 'branch is required' });
  }

  const item = await InventoryItem.create({
    branch,
    tenant,
    name: data.name,
    sku: data.sku || '',
    category: data.category || 'other',
    unit: data.unit || 'unit',
    quantity: data.quantity || 0,
    reorderPoint: data.reorderPoint ?? 5,
    costPerUnit: data.costPerUnit || 0,
    expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
    supplier: data.supplier || '',
    notes: data.notes || '',
  });

  // If initial quantity > 0, record an initial stock transaction.
  if (item.quantity > 0) {
    item.transactions.push({
      type: 'initial',
      quantity: item.quantity,
      reason: 'Initial stock',
      recordedBy: req.user._id,
    });
    await item.save();
  }

  return sendSuccess(res, { item }, 201);
});

/* --------------------------------------------------------- Update */

export const updateItem = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid item id');
  }
  const data = req.validatedBody;

  const item = await InventoryItem.findOneAndUpdate(
    { _id: req.params.id, ...filterByBranch(req) },
    { $set: data },
    { new: true, runValidators: true },
  );
  if (!item) {
    throw ApiError.notFound('Inventory item not found');
  }

  return sendSuccess(res, { item });
});

/* --------------------------------------------------------- Delete */

export const deleteItem = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid item id');
  }
  const item = await InventoryItem.findOneAndDelete({
    _id: req.params.id,
    ...filterByBranch(req),
  });
  if (!item) {
    throw ApiError.notFound('Inventory item not found');
  }
  return sendSuccess(res, { message: 'Item deleted' });
});

/* --------------------------------------------------------- Adjust stock */

export const adjustStock = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid item id');
  }
  const { type, quantity, reason, reference } = req.validatedBody;

  const item = await InventoryItem.findOne({ _id: req.params.id, ...filterByBranch(req) });
  if (!item) {
    throw ApiError.notFound('Inventory item not found');
  }

  let delta;
  switch (type) {
    case 'stock_in':
    case 'initial':
      delta = Math.abs(quantity);
      break;
    case 'stock_out':
    case 'expired':
      delta = -Math.abs(quantity);
      break;
    case 'adjustment':
      delta = quantity; // can be positive or negative
      break;
    default:
      delta = 0;
  }

  const newQty = item.quantity + delta;
  if (newQty < 0) {
    throw ApiError.conflict(
      `Insufficient stock. Current: ${item.quantity}, attempted to remove ${Math.abs(delta)}`,
    );
  }

  item.quantity = newQty;
  item.transactions.push({
    type,
    quantity: delta,
    reason: reason || '',
    reference: reference || '',
    recordedBy: req.user._id,
  });
  await item.save();

  return sendSuccess(res, { item });
});

/* --------------------------------------------------------- Deduct from procedure */

/**
 * Internal helper: when a treatment item is marked completed, auto-deduct
 * stock from the matching inventory category. Called by the treatment-plan
 * controller's generateInvoice flow.
 */
export async function deductForProcedure(branchId, tenantId, toothState, procedureName, userId) {
  const { PROCEDURE_DEDUCTION_MAP } = await import('../constants/inventory.js');

  const category = PROCEDURE_DEDUCTION_MAP[toothState];
  if (!category) return [];

  // Find items in this category with stock available.
  const items = await InventoryItem.find({
    branch: toObjectId(branchId),
    tenant: tenantId ? toObjectId(tenantId) : null,
    category,
    quantity: { $gt: 0 },
  }).sort('expiryDate');

  const deductions = [];
  let toDeduct = 1; // deduct 1 unit per procedure by default

  for (const item of items) {
    if (toDeduct <= 0) break;
    const take = Math.min(item.quantity, toDeduct);
    item.quantity -= take;
    item.transactions.push({
      type: 'stock_out',
      quantity: -take,
      reason: `Auto-deduction: ${procedureName}`,
      reference: `procedure:${toothState}`,
      recordedBy: userId,
    });
    await item.save();
    deductions.push({ item: item.name, deducted: take });
    toDeduct -= take;
  }

  return deductions;
}
