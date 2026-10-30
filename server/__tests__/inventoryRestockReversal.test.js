import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for `restockForInvoice` (audit H5).
 *
 * The void path calls this once per invoice. The old implementation:
 *   - over-restocked whenever void retries ran twice (no reversal-marker
 *     netting) or when a caller restocked per procedure (the in-memory filter
 *     matched every stock-out of the invoice regardless of procedureName), and
 *   - never found anything at all when `procedureName` was passed, because the
 *     DB query demanded a trailing `:` that `deductForProcedure` never writes.
 *
 * The properties pinned:
 *   1. a whole-invoice restock re-adds exactly the outstanding (unreversed)
 *      deduction per item document;
 *   2. calling it twice is a no-op the second time (net already zero);
 *   3. a procedure-scoped call only nets that procedure's entries.
 */

const findFn = vi.fn();
const updateFn = vi.fn().mockResolvedValue({});

vi.mock('mongoose', () => ({
  default: { isValidObjectId: () => true },
  isValidObjectId: () => true,
}));

vi.mock('../utils/branchScope.js', () => ({ toObjectId: (v) => v, filterByBranch: () => ({}) }));
vi.mock('../utils/escapeRegex.js', () => ({ escapeRegex: (v) => v.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') }));
vi.mock('../services/inventoryCron.js', () => ({ emitItemAlerts: vi.fn() }));
vi.mock('../services/eventBus.js', () => ({ publishEvent: vi.fn() }));

vi.mock('../modules/inventory/inventory.model.js', () => ({
  default: { find: (...a) => findFn(...a), findOneAndUpdate: (...a) => updateFn(...a) },
  INVENTORY_TRANSACTIONS_CAP: 1000,
}));

const { restockForInvoice } = await import('../modules/inventory/inventory.service.js');

const tx = (type, quantity, reference) => ({ type, quantity, reference });

const itemDoc = (id, transactions) => ({ _id: id, transactions });

const lastPush = () => {
  const call = updateFn.mock.calls.at(-1);
  return call?.[1]?.$push?.transactions?.$each?.[0];
};

beforeEach(() => {
  vi.clearAllMocks();
  updateFn.mockResolvedValue({});
});

describe('restockForInvoice nets the reversal per scope', () => {
  it('re-adds only the outstanding deduction for a whole invoice', async () => {
    findFn.mockImplementation(() => ({
      session: () => ({
        then: (resolve, reject) => {
          Promise.resolve([
            itemDoc('item-1', [
              tx('stock_out', -3, 'invoice:i1:Cleaning'),
              tx('stock_out', -2, 'invoice:i1:Cleaning'),
            ]),
          ]).then(resolve, reject);
        },
      }),
      then: (resolve, reject) => {
        Promise.resolve([
          itemDoc('item-1', [
            tx('stock_out', -3, 'invoice:i1:Cleaning'),
            tx('stock_out', -2, 'invoice:i1:Cleaning'),
          ]),
        ]).then(resolve, reject);
      },
    }));

    const reversals = await restockForInvoice({
      branchId: 'b1',
      tenantId: 't1',
      invoiceId: 'i1',
      userId: 'u1',
    });

    expect(reversals).toBe(1);
    expect(updateFn).toHaveBeenCalledTimes(1);
    const pushed = lastPush();
    expect(pushed.type).toBe('stock_in');
    expect(pushed.quantity).toBe(5);
    expect(pushed.reference).toBe('invoice:i1:reversal');
    expect(updateFn.mock.calls[0][1].$inc.quantity).toBe(5);
  });

  it('is idempotent across repeated voids', async () => {
    // After the first reversal the ledger already holds its marker, so the
    // second call nets to 0 and must not push any new stock.
    const ledger = [
      tx('stock_out', -3, 'invoice:i1:Cleaning'),
      tx('stock_in', 3, 'invoice:i1:reversal'),
    ];
    findFn.mockImplementation(() => {
      const q = {
        session: () => q,
        then: (resolve, reject) => Promise.resolve([itemDoc('item-1', ledger)]).then(resolve, reject),
      };
      return q;
    });

    const reversals = await restockForInvoice({
      branchId: 'b1',
      tenantId: 't1',
      invoiceId: 'i1',
      userId: 'u1',
    });

    expect(reversals).toBe(0);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('nets only the requested procedure when scoped', async () => {
    findFn.mockImplementation(() => {
      const q = {
        session: () => q,
        then: (resolve, reject) => {
          Promise.resolve([
            itemDoc('item-1', [
              tx('stock_out', -4, 'invoice:i1:Cleaning'),
              tx('stock_out', -7, 'invoice:i1:Gap Filling'),
            ]),
            itemDoc('item-2', [tx('stock_out', -1, 'invoice:i1:Cleaning')]),
          ]).then(resolve, reject);
        },
      };
      return q;
    });

    const reversals = await restockForInvoice({
      branchId: 'b1',
      tenantId: 't1',
      invoiceId: 'i1',
      userId: 'u1',
      procedureName: 'Cleaning',
    });

    expect(reversals).toBe(2);
    expect(updateFn).toHaveBeenCalledTimes(2);
    const first = updateFn.mock.calls[0][1];
    const second = updateFn.mock.calls[1][1];
    expect(first.$inc.quantity).toBe(4);
    expect(first.$push.transactions.$each[0].reference).toBe('invoice:i1:Cleaning:reversal');
    expect(second.$inc.quantity).toBe(1);
  });

  it('does not re-add stock a scoped reversal already covered', async () => {
    const ledger = [
      tx('stock_out', -4, 'invoice:i1:Cleaning'),
      tx('stock_in', 4, 'invoice:i1:Cleaning:reversal'),
      tx('stock_out', -7, 'invoice:i1:Gap Filling'),
    ];
    findFn.mockImplementation(() => {
      const q = {
        session: () => q,
        then: (resolve, reject) => Promise.resolve([itemDoc('item-1', ledger)]).then(resolve, reject),
      };
      return q;
    });

    const reversals = await restockForInvoice({
      branchId: 'b1',
      tenantId: 't1',
      invoiceId: 'i1',
      userId: 'u1',
      procedureName: 'Cleaning',
    });

    expect(reversals).toBe(0);
    expect(updateFn).not.toHaveBeenCalled();
  });
});
