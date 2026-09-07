/**
 * Integration tests for the inventoryCron expiry conversion (regression for
 * the read-then-write lost-update during the daily stock-out pass):
 *
 *   - an expired item is zeroed with exactly ONE immutable 'expired' ledger
 *     entry carrying the real pre-update quantity;
 *   - a non-expired item is untouched;
 *   - a second run does NOT double-record (idempotent — the guarded write);
 *   - two simultaneous runs convert exactly once and never go negative.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../socket/index.js', () => ({
  emitToBranch: vi.fn(() => {}), emitToTenant: vi.fn(() => {}),
}));
vi.mock('../services/eventBus.js', () => ({ publishEvent: vi.fn().mockResolvedValue(undefined) }));

import InventoryItem from '../modules/inventory/inventory.model.js';
import { runInventoryMaintenance } from '../services/inventoryCron.js';

describe('inventoryCron — atomic expiry conversion', () => {
  const DB = 'mongodb://127.0.0.1:27017/dental_os_inventory_cron_test';
  let branchId, tenantId;

  const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  const mkItem = async (overrides = {}) =>
    InventoryItem.create({
      tenant: tenantId,
      branch: branchId,
      name: 'Material',
      category: 'other',
      unit: 'unit',
      quantity: 5,
      reorderPoint: 0,
      isActive: true,
      ...overrides,
    });

  beforeAll(async () => {
    await mongoose.connect(DB);
    branchId = new mongoose.Types.ObjectId();
    tenantId = new mongoose.Types.ObjectId();
    await InventoryItem.deleteMany({});
  });

  afterAll(async () => {
    await InventoryItem.deleteMany({});
    await mongoose.disconnect();
  });

  it('zeroes an expired item with one immutable ledger entry of the real quantity', async () => {
    await InventoryItem.deleteMany({});
    const expired = await mkItem({ name: 'Anesthetic', expiryDate: past });

    await runInventoryMaintenance();

    const after = await InventoryItem.findById(expired._id).lean();
    expect(after.quantity).toBe(0);
    const expiredEntries = after.transactions.filter((t) => t.type === 'expired');
    expect(expiredEntries).toHaveLength(1);
    expect(expiredEntries[0].quantity).toBe(-5);
    expect(expiredEntries[0].reference).toMatch(/^expiry:\d{4}-\d{2}-\d{2}$/);
  });

  it('leaves non-expired stock untouched', async () => {
    await InventoryItem.deleteMany({});
    const fresh = await mkItem({ name: 'Suture', expiryDate: future, quantity: 8 });

    await runInventoryMaintenance();

    const after = await InventoryItem.findById(fresh._id).lean();
    expect(after.quantity).toBe(8);
    expect(after.transactions.filter((t) => t.type === 'expired')).toHaveLength(0);
  });

  it('is idempotent — a second run does not double-record an expired conversion', async () => {
    await InventoryItem.deleteMany({});
    const expired = await mkItem({ name: 'Glove', expiryDate: past, quantity: 3 });

    await runInventoryMaintenance();
    await runInventoryMaintenance();

    const after = await InventoryItem.findById(expired._id).lean();
    expect(after.quantity).toBe(0);
    expect(after.transactions.filter((t) => t.type === 'expired')).toHaveLength(1);
    expect(after.transactions.filter((t) => t.type === 'expired')[0].quantity).toBe(-3);
  });

  it('two concurrent runs convert exactly once — guarded write, never negative', async () => {
    await InventoryItem.deleteMany({});
    const expired = await mkItem({ name: 'Syringe', expiryDate: past, quantity: 10 });

    await Promise.all([runInventoryMaintenance(), runInventoryMaintenance()]);

    const after = await InventoryItem.findById(expired._id).lean();
    expect(after.quantity).toBe(0);
    const expiredEntries = after.transactions.filter((t) => t.type === 'expired');
    expect(expiredEntries).toHaveLength(1);
    expect(expiredEntries[0].quantity).toBe(-10);
  });
});