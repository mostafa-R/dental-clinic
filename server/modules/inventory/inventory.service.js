import mongoose from 'mongoose';

import { emitItemAlerts } from '../../services/inventoryCron.js';
import ApiError from '../../utils/ApiError.js';
import { toObjectId } from '../../utils/branchScope.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import InventoryItem, { INVENTORY_TRANSACTIONS_CAP } from './inventory.model.js';

/**
 * Wrap one ledger entry in the `$push` form that keeps the embedded
 * transaction list bounded (audit H6). Mongo's `$push` with `$each` + a
 * negative `$slice` keeps only the last N entries after the append — the
 * database enforces the cap atomically, on every write, without a separate
 * read. (The `pre('validate')` hook in the model never runs for
 * `findOneAndUpdate` writes, so this is the only reliable enforcement.)
 */
function pushTransaction(entry) {
  return {
    transactions: {
      $each: [entry],
      $slice: -INVENTORY_TRANSACTIONS_CAP,
    },
  };
}

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
  //
  // The branch is taken from the item being edited, not from `branchFilter`: a
  // system admin's filter legitimately carries no branch (they may pass
  // `?branch=`), so `toObjectId(undefined)` produced `branch: null`, the lookup
  // matched nothing and a duplicate SKU fell through to the unique index as an
  // opaque 500 instead of a clean 409.
  let target = null;
  if (update.sku) {
    target = await InventoryItem.findOne({ _id: id, ...branchFilter })
      .select('branch')
      .lean();
    if (!target) {
      throw ApiError.notFound('Inventory item not found');
    }
    const existing = await InventoryItem.findOne({
      branch: target.branch,
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
        $push: pushTransaction({
          type,
          quantity: delta,
          reason: reason || '',
          reference: reference || '',
          recordedBy: userId,
        }),
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
      $push: pushTransaction({
        type,
        quantity: delta,
        reason: reason || '',
        reference: reference || '',
        recordedBy: userId,
      }),
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
        $push: pushTransaction({
          type: 'stock_out',
          quantity: -take,
          reason: `Auto-deduction: ${procedureName || 'procedure'}`,
          reference: `${referenceBase}:${procedureName || 'unknown'}`,
          recordedBy: userId,
        }),
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
          $push: pushTransaction({
            type: 'stock_out',
            quantity: -take,
            reason: `Auto-deduction (fallback): ${procedureName || 'procedure'}`,
            reference: `${referenceBase}:${procedureName || 'unknown'}`,
            recordedBy: userId,
          }),
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
 *
 * Audit H5: the old implementation had two defects that made stock drift:
 *   1. when `procedureName` was given, the DB query searched for references
 *      shaped `invoice:<id>:<procedureName>:` (trailing colon) while
 *      `deductForProcedure` writes `invoice:<id>:<procedureName>` (no trailing
 *      segment) — so a scoped restock found nothing; the caller iterating one
 *      call per procedure instead restocked the whole invoice once per call;
 *   2. there was no reversal marker check, so repeated calls (void retries,
 *      refund followed by void) kept re-adding stock.
 *
 * This rewrite makes reversal NET, the same reconciliation philosophy the
 * commission ledger uses: for every item document,
 *
 *   net = Σ|quantity| of target stock_out entries − Σ quantity of target
 *                                                          reversal entries
 *
 * and only a net > 0 is re-added. Reversal entries are written with a stable
 * reference (`…:reversal` / `…:<procedure>:reversal`), so the second call nets
 * to zero — idempotent under retries and repeated failures. `procedureName`
 * scopes the net to that procedure's entries (matched exactly, mirroring what
 * `deductForProcedure` writes); `voidInvoice` calls without one and nets the
 * whole invoice. Callers should use one consistent scope — a scoped call after
 * a whole-invoice reversal cannot attribute the earlier marker, so it may add
 * stock for a procedure that was already covered. The only current caller is
 * `voidInvoice` (whole scope).
 */
export async function restockForInvoice({ branchId, tenantId, invoiceId, userId, session, procedureName }) {
  const refPrefix = `invoice:${String(invoiceId)}`;
  // deductForProcedure tags deduction entries `invoice:<id>:<procedure>`.
  const scopeTerm = procedureName ? `${refPrefix}:${procedureName}` : refPrefix;
  const scopeReversalTerm = `${scopeTerm}:reversal`;

  // Whole-invoice scope: deduction refs (`invoice:<id>:<proc>`) AND both
  // reversal markers (`invoice:<id>:reversal`, `invoice:<id>:<proc>:reversal`)
  // all share the `invoice:<id>:` prefix, so one regex covers them.
  const wholeScope = new RegExp(`^${escapeRegex(refPrefix)}:`);

  const isTargetOut = (t) => {
    if (t.type !== 'stock_out' || !t.reference) return false;
    return procedureName ? t.reference === scopeTerm : wholeScope.test(t.reference);
  };
  const isTargetReversal = (t) => {
    if (t.type !== 'stock_in' || !t.reference) return false;
    return procedureName ? t.reference === scopeReversalTerm : wholeScope.test(t.reference);
  };

  const dbRefFilter = procedureName ? scopeTerm : wholeScope;
  const findOpts = session ? { session } : {};
  const items = await InventoryItem.find({
    branch: toObjectId(branchId),
    tenant: tenantId ? toObjectId(tenantId) : null,
    'transactions.type': 'stock_out',
    'transactions.reference': dbRefFilter,
  }, null, findOpts);

  let reversals = 0;
  for (const item of items) {
    const txs = item.transactions || [];
    const deducted = txs
      .filter(isTargetOut)
      .reduce((sum, t) => sum + Math.abs(Number(t.quantity) || 0), 0);
    const alreadyReversed = txs
      .filter(isTargetReversal)
      .reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);

    const net = roundQty(deducted - alreadyReversed);
    if (net <= 0) continue; // reversal already applied (or nothing to undo)

    const opts = { returnDocument: "after" };
    if (session) opts.session = session;
    await InventoryItem.findOneAndUpdate(
      { _id: item._id },
      {
        $inc: { quantity: net },
        $push: pushTransaction({
          type: 'stock_in',
          quantity: net,
          reason: `Reversal of voided/refunded invoice ${invoiceId}`,
          reference: scopeReversalTerm,
          recordedBy: userId,
        }),
      },
      opts,
    );
    reversals += 1;
  }
  return reversals;
}

/** Round to 2dp defensively; stock quantities are whole units in practice. */
function roundQty(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
