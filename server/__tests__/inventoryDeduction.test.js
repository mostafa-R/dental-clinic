/**
 * Unit tests for the auto-deduction / reversal logic (issues #2, #3, #4 from
 * the senior review). Covers:
 *   - resolveProcedureDeduction resolves by procedure NAME, not tooth state;
 *   - deductForProcedure returns a shortfall instead of throwing on
 *     insufficient stock, and records the invoice reference for reversal;
 *   - restockForInvoice re-stocks the items deducted for an invoice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../modules/inventory/inventory.model.js', () => ({
  default: {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { resolveProcedureDeduction, PROCEDURE_DEDUCTION_MAP } from '../constants/inventory.js';
import * as inventoryService from '../modules/inventory/inventory.service.js';
import InventoryItem from '../modules/inventory/inventory.model.js';

function makeItem(overrides = {}) {
  return {
    _id: 'item1',
    branch: 'branch1',
    tenant: 'tenant1',
    name: 'Filling Compound',
    category: 'filling_material',
    quantity: 5,
    transactions: [],
    ...overrides,
  };
}

// The service chains `.sort(...)` (and optionally `.session(...)`) on find.
// Return a chainable cursor that resolves to the given rows.
function mockFindRows(rows) {
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    session: vi.fn().mockResolvedValue(rows),
    then: (resolve) => Promise.resolve(rows).then(resolve),
  };
  // Without a session the code awaits the cursor directly; make it thenable.
  return cursor;
}

describe('resolveProcedureDeduction', () => {
  it('resolves by procedure name case-insensitively', () => {
    expect(resolveProcedureDeduction('Filling', 'filled')).toEqual([
      { category: 'filling_material', quantity: 1 },
      { category: 'consumable', quantity: 1 },
    ]);
  });

  it('extracts a meaningful first word when the name is a full phrase', () => {
    expect(resolveProcedureDeduction('Root Canal Therapy', '')).toEqual([
      { category: 'medication', quantity: 1 },
      { category: 'consumable', quantity: 1 },
    ]);
  });

  it('falls back to tooth state for legacy callers with unknown names', () => {
    expect(resolveProcedureDeduction('Unknown Proc', 'crown')).toEqual([
      { category: 'consumable', quantity: 1 },
    ]);
  });

  it('defaults to the "other" entry when nothing matches', () => {
    const def = PROCEDURE_DEDUCTION_MAP.other;
    expect(resolveProcedureDeduction('Weird Thing', '')).toEqual([
      { category: def.category, quantity: def.quantity },
    ]);
  });
});

describe('deductForProcedure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a shortfall instead of throwing when stock is insufficient', async () => {
    const item = makeItem({ quantity: 1 });
    // Primary category has 1 unit; "Filling" needs 1 (primary) -> fully covered,
    // no shortfall.
    InventoryItem.find.mockReturnValueOnce(mockFindRows([item]));
    InventoryItem.findOneAndUpdate.mockResolvedValue({
      ...item,
      quantity: 0,
      name: item.name,
      _id: item._id,
    });

    const result = await inventoryService.deductForProcedure({
      branchId: 'branch1',
      tenantId: 'tenant1',
      toothState: 'filled',
      procedureName: 'Filling',
      userId: 'u1',
      invoiceId: 'inv123',
    });

    expect(result.deductions).toHaveLength(1);
    expect(result.shortfall).toBe(0);
    // The ledger entry carries the invoice reference for later reversal.
    const call = InventoryItem.findOneAndUpdate.mock.calls[0];
    expect(call[1].$push.transactions.reference).toMatch(/^invoice:inv123:/);
  });

  it('reports a positive shortfall and does not throw when nothing is in stock', async () => {
    InventoryItem.find.mockReturnValueOnce(mockFindRows([])); // primary category empty
    InventoryItem.find.mockReturnValueOnce(mockFindRows([])); // fallback category empty

    let threw = false;
    let result;
    try {
      result = await inventoryService.deductForProcedure({
        branchId: 'branch1',
        tenantId: 'tenant1',
        toothState: 'extraction_scheduled',
        procedureName: 'Extraction',
        userId: 'u1',
        invoiceId: 'inv123',
      });
    } catch (err) {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result.shortfall).toBeGreaterThan(0);
    expect(result.deductions).toHaveLength(0);
  });
});

describe('restockForInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-stocks the items deducted for an invoice', async () => {
    const item = makeItem({
      transactions: [
        {
          type: 'stock_out',
          quantity: -1,
          reference: 'invoice:inv123:Filling',
        },
      ],
    });
    InventoryItem.find.mockReturnValueOnce(mockFindRows([item]));
    InventoryItem.findOneAndUpdate.mockResolvedValue({
      ...item,
      quantity: 6,
    });

    const reversals = await inventoryService.restockForInvoice({
      branchId: 'branch1',
      tenantId: 'tenant1',
      invoiceId: 'inv123',
      userId: 'u1',
    });

    expect(reversals).toBe(1);
    expect(InventoryItem.findOneAndUpdate.mock.calls[0][1].$inc.quantity).toBe(1);
    expect(InventoryItem.findOneAndUpdate.mock.calls[0][1].$push.transactions.type).toBe('stock_in');
  });
});
