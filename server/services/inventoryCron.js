import cron from 'node-cron';

import InventoryItem from '../modules/inventory/inventory.model.js';
import { emitToBranch } from '../socket/index.js';

// PRD §6.8: expiry alerts at 30 days / 7 days / on the expiry date, and a
// daily conversion of expired stock into an "expired" ledger entry.
const EXPIRY_WINDOW_DAYS = 30;
const DAILY_SCHEDULE = '0 3 * * *';
const BATCH_SIZE = 200;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(date) {
  if (!date) return null;
  const ms = startOfDay(date).getTime() - startOfDay(new Date()).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Emit the PRD §6.8 realtime alerts for a single item:
 *   - stock.low      → quantity at/below the reorder point
 *   - stock.expiring → expiry inside the alert window
 * Exported so inventory mutations can raise the same alerts immediately.
 */
export function emitItemAlerts(item) {
  if (!item || item.isActive === false) return;

  if (item.quantity <= item.reorderPoint) {
    emitToBranch(item.branch, 'stock.low', {
      itemId: String(item._id),
      name: item.name,
      quantity: item.quantity,
      reorderPoint: item.reorderPoint,
      unit: item.unit,
    });
  }

  const daysLeft = daysUntil(item.expiryDate);
  if (daysLeft !== null && daysLeft <= EXPIRY_WINDOW_DAYS) {
    emitToBranch(item.branch, 'stock.expiring', {
      itemId: String(item._id),
      name: item.name,
      quantity: item.quantity,
      expiryDate: item.expiryDate,
      daysLeft,
    });
  }
}

/**
 * Daily job: convert expired items into an immutable 'expired' ledger entry
 * and zero out their quantity, then broadcast low-stock and expiring-stock
 * alerts per branch.
 */
export async function runInventoryMaintenance() {
  try {
    // 1. Expired stock → auto stock-out (type 'expired').
    const now = new Date();
    let expiredCount = 0;
    let skip = 0;

    for (;;) {
      const items = await InventoryItem.find({
        isActive: true,
        expiryDate: { $ne: null, $lt: now },
        quantity: { $gt: 0 },
      })
        .skip(skip)
        .limit(BATCH_SIZE);

      if (items.length === 0) break;

      for (const item of items) {
        const amount = item.quantity;
        item.quantity = 0;
        item.transactions.push({
          type: 'expired',
          quantity: -amount,
          reason: 'Expired — automatic stock-out',
          reference: `expiry:${startOfDay(item.expiryDate).toISOString().slice(0, 10)}`,
          date: now,
        });
        await item.save();
        emitToBranch(item.branch, 'stock.expired', {
          itemId: String(item._id),
          name: item.name,
          quantityRemoved: amount,
          expiryDate: item.expiryDate,
        });
        expiredCount++;
      }

      if (items.length < BATCH_SIZE) break;
      skip += BATCH_SIZE;
    }

    if (expiredCount > 0) {
      console.log(`[InventoryCron] Converted ${expiredCount} expired item(s) to stock-out`);
    }

    // 2. Alerts: low stock + items approaching expiry.
    let skipAlerts = 0;
    for (;;) {
      const items = await InventoryItem.find({
        isActive: true,
        $or: [
          { $expr: { $lte: ['$quantity', '$reorderPoint'] } },
          {
            expiryDate: {
              $ne: null,
              $lte: new Date(Date.now() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000),
            },
          },
        ],
      })
        .skip(skipAlerts)
        .limit(BATCH_SIZE)
        .lean();

      if (items.length === 0) break;

      for (const item of items) {
        emitItemAlerts(item);
      }

      if (items.length < BATCH_SIZE) break;
      skipAlerts += BATCH_SIZE;
    }
  } catch (err) {
    console.error('[InventoryCron] Error during maintenance:', err.message);
  }
}

let task = null;

export function startInventoryCron() {
  task = cron.schedule(DAILY_SCHEDULE, runInventoryMaintenance);
  console.log('[InventoryCron] Scheduled daily at 03:00');
}

export function stopInventoryCron() {
  if (task) {
    task.stop();
    task = null;
    console.log('[InventoryCron] Stopped');
  }
}
