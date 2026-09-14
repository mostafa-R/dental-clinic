/**
 * Tests for migration 005-fdi-tooth-codes (S1 FDI unification).
 *
 * Verifies the backfill of canonical `fdi` from legacy Universal codes on
 * dentalcharts (teeth + history) and treatmentplans (items): correctness,
 * idempotency (re-run is a no-op), legacy-code preservation, and rollback
 * via down() restoring the exact pre-S1 document shape.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// Mock logger (migration runner dependency chain).
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { up, down } from '../migrations/005-fdi-tooth-codes.js';

const oid = () => new mongoose.Types.ObjectId();

function legacyChart() {
  return {
    tenant: oid(),
    branch: oid(),
    patient: oid(),
    dentitionType: 'permanent',
    teeth: [
      { number: 1, state: 'caries', surfaces: {}, notes: '' },
      { number: 16, state: 'sound', surfaces: {}, notes: '' },
    ],
    history: [{ number: 1, state: 'sound', surfaces: {}, notes: '' }],
    notes: '',
  };
}

function legacyPlan() {
  return {
    tenant: oid(),
    branch: oid(),
    patient: oid(),
    planNo: `TP-MIG-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    title: 'Legacy plan',
    items: [
      { procedureName: 'Filling', tooth: 16, surfaces: [], estimatedCost: 100 },
      { procedureName: 'Cleaning', tooth: null, surfaces: [], estimatedCost: 50 },
    ],
  };
}

describe('Migration 005-fdi-tooth-codes', () => {
  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(testDbUri);
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    const colls = mongoose.connection.collections;
    for (const name of ['dentalcharts', 'treatmentplans']) {
      if (colls[name]) await colls[name].deleteMany({});
    }
  });

  it('backfills fdi on chart teeth, history, and plan items', async () => {
    const db = mongoose.connection.db;
    const { insertedId: chartId } = await db.collection('dentalcharts').insertOne(legacyChart());
    const { insertedId: planId } = await db.collection('treatmentplans').insertOne(legacyPlan());

    const result = await up();
    expect(result.chartsPatched).toBe(1);
    expect(result.plansPatched).toBe(1);

    const chart = await db.collection('dentalcharts').findOne({ _id: chartId });
    expect(chart.teeth.find((t) => t.number === 1).fdi).toBe(18);
    expect(chart.teeth.find((t) => t.number === 16).fdi).toBe(28);
    expect(chart.history[0].fdi).toBe(18);
    // Legacy codes are never altered.
    expect(chart.teeth.find((t) => t.number === 1).state).toBe('caries');

    const plan = await db.collection('treatmentplans').findOne({ _id: planId });
    expect(plan.items[0].fdi).toBe(28);
    expect(plan.items[0].tooth).toBe(16);
    expect(plan.items[1].fdi ?? null).toBeNull();
  });

  it('is idempotent: a second run patches nothing', async () => {
    const db = mongoose.connection.db;
    await db.collection('dentalcharts').insertOne(legacyChart());
    await db.collection('treatmentplans').insertOne(legacyPlan());

    await up();
    const second = await up();
    expect(second).toEqual({ chartsPatched: 0, plansPatched: 0 });
  });

  it('down() removes the backfilled fields and keeps legacy codes', async () => {
    const db = mongoose.connection.db;
    const { insertedId: chartId } = await db.collection('dentalcharts').insertOne(legacyChart());
    const { insertedId: planId } = await db.collection('treatmentplans').insertOne(legacyPlan());
    await up();

    await down();

    const chart = await db.collection('dentalcharts').findOne({ _id: chartId });
    expect(chart.teeth.every((t) => !('fdi' in t))).toBe(true);
    expect(chart.history.every((h) => !('fdi' in h))).toBe(true);
    expect(chart.teeth.find((t) => t.number === 1).state).toBe('caries');

    const plan = await db.collection('treatmentplans').findOne({ _id: planId });
    expect(plan.items.every((i) => !('fdi' in i))).toBe(true);
    expect(plan.items[0].tooth).toBe(16);
  });
});
