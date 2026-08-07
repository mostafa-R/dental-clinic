import mongoose from 'mongoose';

import InventoryItem from './inventory.model.js';
import { toObjectId } from '../../utils/branchScope.js';
import ApiError from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';

export async function listItems(branchFilter, { search, category, lowStock, page, limit }) {
  const filter = { ...branchFilter, isActive: true };

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
    ...branchFilter,
    isActive: true,
    $expr: { $lte: ['$quantity', '$reorderPoint'] },
  });

  const stockValueResult = await InventoryItem.aggregate([
    { $match: { ...branchFilter, isActive: true } },
    { $group: { _id: null, total: { $sum: { $multiply: ['$quantity', '$costPerUnit'] } } } },
  ]);
  const totalStockValue = stockValueResult[0]?.total || 0;

  return {
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: { lowStockCount, totalStockValue },
  };
}

export async function getItem(id, branchFilter) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid item id');
  }
  const item = await InventoryItem.findOne({ _id: id, ...branchFilter });
  if (!item) {
    throw ApiError.notFound('Inventory item not found');
  }
  return item;
}

export async function createItem({ tenant, branch, data, userId }) {
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

  if (item.quantity > 0) {
    item.transactions.push({
      type: 'initial',
      quantity: item.quantity,
      reason: 'Initial stock',
      recordedBy: userId,
    });
    await item.save();
  }

  return item;
}

export async function updateItem(id, branchFilter, data) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid item id');
  }

  // Whitelist allowed fields — never allow direct quantity mutation.
  const { name, sku, category, unit, reorderPoint, costPerUnit, expiryDate, supplier, notes, isActive } = data;
  const update = { name, sku, category, unit, reorderPoint, costPerUnit, supplier, notes, isActive };
  // Handle empty string for expiryDate (cast to null).
  update.expiryDate = expiryDate === '' ? null : (expiryDate ? new Date(expiryDate) : undefined);

  // Remove undefined keys so $set doesn't overwrite with null.
  for (const key of Object.keys(update)) {
    if (update[key] === undefined) delete update[key];
  }

  const item = await InventoryItem.findOneAndUpdate(
    { _id: id, ...branchFilter },
    { $set: update },
    { new: true, runValidators: true },
  );
  if (!item) {
    throw ApiError.notFound('Inventory item not found');
  }
  return item;
}

export async function deleteItem(id, branchFilter) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid item id');
  }
  const item = await InventoryItem.findOneAndUpdate(
    { _id: id, ...branchFilter },
    { $set: { isActive: false } },
    { new: true },
  );
  if (!item) {
    throw ApiError.notFound('Inventory item not found');
  }
  return item;
}

export async function adjustStock(id, branchFilter, { type, quantity, reason, reference, userId }) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid item id');
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
      delta = quantity;
      break;
    default:
      delta = 0;
  }

  // Atomic decrement with guard: only succeeds if stock >= removal amount.
  if (delta < 0) {
    const item = await InventoryItem.findOneAndUpdate(
      { _id: id, ...branchFilter, quantity: { $gte: Math.abs(delta) } },
      {
        $inc: { quantity: delta },
        $push: {
          transactions: {
            type,
            quantity: delta,
            reason: reason || '',
            reference: reference || '',
            recordedBy: userId,
          },
        },
      },
      { new: true, runValidators: true },
    );
    if (!item) {
      throw ApiError.conflict('Insufficient stock for this operation');
    }
    return item;
  }

  // For increments (stock_in, initial, positive adjustment) no guard needed.
  const item = await InventoryItem.findOneAndUpdate(
    { _id: id, ...branchFilter },
    {
      $inc: { quantity: delta },
      $push: {
        transactions: {
          type,
          quantity: delta,
          reason: reason || '',
          reference: reference || '',
          recordedBy: userId,
        },
      },
    },
    { new: true, runValidators: true },
  );
  if (!item) {
    throw ApiError.notFound('Inventory item not found');
  }
  return item;
}

/**
 * Internal helper: when a treatment item is marked completed, auto-deduct
 * stock from the matching inventory category. Called by the treatment-plan
 * service's generateInvoice flow.
 */
export async function deductForProcedure(branchId, tenantId, toothState, procedureName, userId, session) {
  const { PROCEDURE_DEDUCTION_MAP } = await import('../../constants/inventory.js');
  const ApiError = (await import('../../utils/ApiError.js')).default;

  const category = PROCEDURE_DEDUCTION_MAP[toothState];
  if (!category) return [];

  const query = {
    branch: toObjectId(branchId),
    tenant: tenantId ? toObjectId(tenantId) : null,
    category,
    quantity: { $gt: 0 },
  };
  const items = session
    ? await InventoryItem.find(query).sort('expiryDate').session(session)
    : await InventoryItem.find(query).sort('expiryDate');

  const deductions = [];
  let toDeduct = 1;

  for (const item of items) {
    if (toDeduct <= 0) break;
    const take = Math.min(item.quantity, toDeduct);

    const opts = { new: true };
    if (session) opts.session = session;

    // Atomic decrement with guard.
    const updated = await InventoryItem.findOneAndUpdate(
      { _id: item._id, quantity: { $gte: take } },
      {
        $inc: { quantity: -take },
        $push: {
          transactions: {
            type: 'stock_out',
            quantity: -take,
            reason: `Auto-deduction: ${procedureName}`,
            reference: `procedure:${toothState}`,
            recordedBy: userId,
          },
        },
      },
      opts,
    );
    if (updated) {
      deductions.push({ item: item.name, deducted: take });
      toDeduct -= take;
    }
  }

  if (toDeduct > 0) {
    console.warn(`[Inventory] Insufficient stock for procedure ${procedureName}: ${toDeduct} units short`);
    throw ApiError.conflict(`Insufficient inventory to complete procedure: ${procedureName}`);
  }

  return deductions;
}
