import mongoose from 'mongoose';

import { emitItemAlerts } from '../../services/inventoryCron.js';
import ApiError from '../../utils/ApiError.js';
import { toObjectId } from '../../utils/branchScope.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import InventoryItem from './inventory.model.js';

// Sane upper bound for a single item's quantity. Protects against an
// unbounded `adjustment` inflating stock far beyond any real physical
// quantity and against corrupted data (issue #7).
const MAX_ITEM_QUANTITY = 1_000_000;

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

  // Stats reflect the SAME filter as the list (search, category, lowStock),
  // so the numbers shown match the rows the user actually sees (issue #9).
  const lowStockMatch = lowStock === 'true'
    ? { $expr: { $lte: ['$quantity', '$reorderPoint'] } }
    : {};
  const lowStockCount = await InventoryItem.countDocuments({ ...filter, ...lowStockMatch });

  const stockValueResult = await InventoryItem.aggregate([
    { $match: filter },
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
  // Soft-deleted (inactive) items are excluded so a GET never surfaces a
  // deleted record while the list hides it (issue #10).
  const item = await InventoryItem.findOne({ _id: id, ...branchFilter, isActive: true });
  if (!item) {
    throw ApiError.notFound('Inventory item not found');
  }
  return item;
}

export async function createItem({ tenant, branch, data, userId }) {
  // Enforce SKU uniqueness within a branch (issue #6/#11) so duplicate
  // materials don't silently accumulate and confuse search/stock. The unique
  // partial index also guards against a race; this check returns a clean
  // conflict instead of a 11000 error.
  if (data.sku) {
    const existing = await InventoryItem.findOne({
      branch: toObjectId(branch),
      sku: data.sku,
    }).select('_id');
    if (existing) {
      throw ApiError.conflict(`An item with SKU "${data.sku}" already exists in this branch`);
    }
  }

  const opening = Number(data.quantity) || 0;
  if (opening > MAX_ITEM_QUANTITY) {
    throw ApiError.badRequest(
      `Quantity cannot exceed ${MAX_ITEM_QUANTITY} units`,
      { quantity: 'exceeds maximum allowed' },
    );
  }

  const item = await InventoryItem.create({
    branch,
    tenant,
    name: data.name,
    sku: data.sku || '',
    category: data.category || 'other',
    unit: data.unit || 'unit',
    quantity: opening,
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

  // Enforce SKU uniqueness on edit too (issue #11).
  if (update.sku) {
    const existing = await InventoryItem.findOne({
      branch: toObjectId(branchFilter.branch),
      sku: update.sku,
      _id: { $ne: id },
    }).select('_id');
    if (existing) {
      throw ApiError.conflict(`An item with SKU "${update.sku}" already exists in this branch`);
    }
  }

  const item = await InventoryItem.findOneAndUpdate(
    { _id: id, ...branchFilter },
    { $set: update },
    { returnDocument: "after", runValidators: true },
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
    { returnDocument: "after" },
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
  const baseFilter = { _id: id, ...branchFilter, isActive: true };

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
      { ...baseFilter, quantity: { $gte: Math.abs(delta) } },
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
      { returnDocument: "after", runValidators: true },
    );
    if (!item) {
      throw ApiError.conflict('Insufficient stock for this operation');
    }
    emitItemAlerts(item);
    return item;
  }

  // For increments (stock_in, initial, positive adjustment) no guard needed on
  // the lower bound, but cap the resulting quantity so stock can't be inflated
  // past a sane physical maximum (issue #7).
  const existing = await InventoryItem.findOne(baseFilter).select('quantity');
  if (existing && (Number(existing.quantity) || 0) + delta > MAX_ITEM_QUANTITY) {
    throw ApiError.badRequest(
      `Quantity cannot exceed ${MAX_ITEM_QUANTITY} units`,
      { quantity: 'exceeds maximum allowed' },
    );
  }

  const item = await InventoryItem.findOneAndUpdate(
    baseFilter,
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
    { returnDocument: "after", runValidators: true },
  );
  if (!item) {
    throw ApiError.notFound('Inventory item not found');
  }
  emitItemAlerts(item);
  return item;
}

/**
 * Internal helper: when a treatment item is billed, auto-deduct stock for the
 * procedure. Deduction is resolved from the PROCEDURE NAME (issue #3), not the
 * tooth state. It never throws on insufficient stock — the shortfall is
 * returned so the caller can bill anyway and surface the stock-out (issue #2).
 *
 * The `reference` on each ledger entry carries the invoice id
 * (`invoice:<invoiceId>:<procedureName>`) so a later void/refund can reverse
 * the deduction (issue #4).
 *
 * The returned `updatedItems` are the post-decrement documents, so the caller
 * can emit alerts AFTER the surrounding transaction commits (issue #1/#5).
 */
export async function deductForProcedure({
  branchId,
  tenantId,
  toothState,
  procedureName,
  userId,
  session,
  invoiceId,
}) {
  const { resolveProcedureDeduction } = await import('../../constants/inventory.js');

  const candidates = resolveProcedureDeduction(procedureName, toothState);
  const target = candidates[0];

  const query = {
    branch: toObjectId(branchId),
    tenant: tenantId ? toObjectId(tenantId) : null,
    category: target.category,
    quantity: { $gt: 0 },
  };
  const items = session
    ? await InventoryItem.find(query).sort('expiryDate').session(session)
    : await InventoryItem.find(query).sort('expiryDate');

  const deductions = [];
  const updatedItems = [];
  let toDeduct = target.quantity;
  const referenceBase = invoiceId ? `invoice:${String(invoiceId)}` : `procedure:${procedureName || 'unknown'}`;

  for (const item of items) {
    if (toDeduct <= 0) break;
    const take = Math.min(item.quantity, toDeduct);

    const opts = { returnDocument: "after" };
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
            reason: `Auto-deduction: ${procedureName || 'procedure'}`,
            reference: `${referenceBase}:${procedureName || 'unknown'}`,
            recordedBy: userId,
          },
        },
      },
      opts,
    );
    if (updated) {
      deductions.push({ item: updated.name, itemId: updated._id, deducted: take });
      updatedItems.push(updated);
      toDeduct -= take;
    }
  }

  // If the primary category had no stock, try the fallback category. Without
  // it a filling might consume nothing when only consumables are in stock.
  if (toDeduct > 0 && candidates.length > 1) {
    const fbTarget = candidates[1];
    const fbItems = session
      ? await InventoryItem.find({
        branch: toObjectId(branchId),
        tenant: tenantId ? toObjectId(tenantId) : null,
        category: fbTarget.category,
        quantity: { $gt: 0 },
      }).sort('expiryDate').session(session)
      : await InventoryItem.find({
        branch: toObjectId(branchId),
        tenant: tenantId ? toObjectId(tenantId) : null,
        category: fbTarget.category,
        quantity: { $gt: 0 },
      }).sort('expiryDate');

    for (const item of fbItems) {
      if (toDeduct <= 0) break;
      const take = Math.min(item.quantity, toDeduct);
      const opts = { returnDocument: "after" };
      if (session) opts.session = session;

      const updated = await InventoryItem.findOneAndUpdate(
        { _id: item._id, quantity: { $gte: take } },
        {
          $inc: { quantity: -take },
          $push: {
            transactions: {
              type: 'stock_out',
              quantity: -take,
              reason: `Auto-deduction (fallback): ${procedureName || 'procedure'}`,
              reference: `${referenceBase}:${procedureName || 'unknown'}`,
              recordedBy: userId,
            },
          },
        },
        opts,
      );
      if (updated) {
        deductions.push({ item: updated.name, itemId: updated._id, deducted: take });
        updatedItems.push(updated);
        toDeduct -= take;
      }
    }
  }

  return {
    deductions,
    updatedItems,
    shortfall: toDeduct > 0 ? toDeduct : 0,
  };
}

/**
 * Reverse a procedure's auto-deduction when its invoice is voided or refunded.
 * Re-stocks the items that were deducted for that invoice by looking up the
 * `reference` entries created by deductForProcedure. Returns the number of
 * ledger reversals applied (used for logging only).
 */
export async function restockForInvoice({ branchId, tenantId, invoiceId, userId, session, procedureName }) {
  const refPrefix = `invoice:${String(invoiceId)}`;
  const term = procedureName ? `${refPrefix}:${procedureName}` : refPrefix;

  const items = session
    ? await InventoryItem.find({
      branch: toObjectId(branchId),
      tenant: tenantId ? toObjectId(tenantId) : null,
      'transactions.type': 'stock_out',
      'transactions.reference': { $regex: `^${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:` },
    }).session(session)
    : await InventoryItem.find({
      branch: toObjectId(branchId),
      tenant: tenantId ? toObjectId(tenantId) : null,
      'transactions.type': 'stock_out',
      'transactions.reference': { $regex: `^${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:` },
    });

  let reversals = 0;
  for (const item of items) {
    const deducted = (item.transactions || [])
      .filter((t) => t.type === 'stock_out' && t.reference && t.reference.startsWith(`${refPrefix}:`))
      .reduce((sum, t) => sum + Math.abs(Number(t.quantity) || 0), 0);
    if (deducted <= 0) continue;

    const opts = { returnDocument: "after" };
    if (session) opts.session = session;
    await InventoryItem.findOneAndUpdate(
      { _id: item._id },
      {
        $inc: { quantity: deducted },
        $push: {
          transactions: {
            type: 'stock_in',
            quantity: deducted,
            reason: `Reversal of voided/refunded invoice ${invoiceId}`,
            reference: `${refPrefix}:reversal`,
            recordedBy: userId,
          },
        },
      },
      opts,
    );
    reversals += 1;
  }
  return reversals;
}
