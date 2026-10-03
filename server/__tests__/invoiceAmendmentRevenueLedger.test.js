import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for revenue recognition when an invoice is amended.
 *
 * `createInvoice` books Dr accounts_receivable / Cr revenue for the total at
 * issue time. Editing items, discount or tax on an unpaid invoice changes that
 * total, so revenue already on the books no longer matches the document. The
 * edit path used to mutate the invoice and post nothing, which left the ledger
 * permanently stale — and a reduction looked like a discount the clinic never
 * granted.
 *
 * The properties pinned below:
 *
 *   1. an amendment posts an entry equal to the CHANGE in total, never the new
 *      total — otherwise a second, identical edit double-counts;
 *   2. the direction follows the sign of the change (raise the receivable when
 *      the total grows, release it when it shrinks);
 *   3. a no-op edit posts nothing;
 *   4. the collected portion is left alone, so an already-partially-paid invoice
 *      cannot have its settled cash retroactively reclassified.
 */

const BRANCH = 'branch-1';
const TENANT = 'tenant-1';
const INVOICE_ID = 'invoice-1';
const INVOICE_NO = 'INV-2026-00001';

const query = (value) => {
  const q = {
    session: () => q,
    sort: () => q,
    limit: () => q,
    lean: () => q,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return q;
};

const postJournalEntry = vi.fn().mockResolvedValue({});
const InvoiceFindOne = vi.fn();

vi.mock('mongoose', () => ({
  default: { isValidObjectId: () => true },
  isValidObjectId: () => true,
}));

vi.mock('../core/transaction.js', () => ({
  withTransaction: (fn) => fn({ id: 'session' }),
}));

vi.mock('../services/eventBus.js', () => ({ publishEvent: vi.fn() }));
vi.mock('../utils/branchScope.js', () => ({ toObjectId: (v) => v, filterByBranch: () => ({}) }));
vi.mock('../utils/escapeRegex.js', () => ({ escapeRegex: (v) => v }));
vi.mock('../modules/inventory/inventory.service.js', () => ({
  restockForInvoice: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../modules/appointments/appointment.model.js', () => ({ default: { findById: () => query(null) } }));
vi.mock('../modules/patients/patient.model.js', () => ({ default: { findOne: () => query(null) } }));
vi.mock('../modules/patients/wallet.service.js', () => ({ addTransaction: vi.fn() }));
vi.mock('../modules/users/user.model.js', () => ({ default: { findById: () => query(null) } }));
vi.mock('../modules/billing/commission.model.js', () => ({ default: { find: () => query([]) } }));
vi.mock('../modules/accounting/journalEntry.model.js', () => ({
  default: { findOne: () => query(null), create: vi.fn() },
}));
vi.mock('../modules/accounting/journal.service.js', () => ({
  postJournalEntry: (...a) => postJournalEntry(...a),
}));
vi.mock('../modules/billing/invoice.model.js', () => ({
  default: { findOne: (...a) => InvoiceFindOne(...a), create: vi.fn() },
}));

const { updateInvoice } = await import('../modules/billing/invoice.service.js');

/**
 * An invoice stub whose `save()` recomputes `total` the way the model's
 * pre-validate hook does, so the amendment delta reflects real arithmetic
 * rather than a hand-written number.
 */
function invoice({ total, paidAmount = 0, items = [] } = {}) {
  const doc = {
    _id: INVOICE_ID,
    invoiceNo: INVOICE_NO,
    tenant: TENANT,
    branch: BRANCH,
    // Mirrors the model's status derivation so the "fully paid" lock can engage.
    status: paidAmount >= total && total > 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
    total,
    paidAmount,
    items,
    discount: 0,
    discountType: 'fixed',
    discountRate: 0,
    tax: 0,
    taxRate: 0,
    dueDate: null,
    notes: '',
    changelog: [],
    populate: vi.fn().mockResolvedValue(undefined),
    save: vi.fn(async function save() {
      this.total = this.computeTotal(this);
      return this;
    }),
  };

  // Receives the document explicitly so it does not depend on a `this` that is
  // unbound when the stub calls it.
  doc.computeTotal = (d) => {
    const subtotal = d.items.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
      0,
    );
    const discount =
      d.discountType === 'percent'
        ? (subtotal * (Number(d.discountRate) || 0)) / 100
        : Number(d.discount) || 0;
    const tax = Number(d.tax) || 0;
    return Number(Math.max(subtotal - discount + tax, 0).toFixed(2));
  };

  return doc;
}

const lineItem = (unitPrice, quantity = 1) => ({ description: 'item', unitPrice, quantity, discount: 0 });

async function amend(doc, data) {
  InvoiceFindOne.mockReturnValue(query(doc));
  return updateInvoice(INVOICE_ID, { branch: BRANCH }, data, 'user-1');
}

const isAmendment = (entry) => entry.sourceType === 'adjustment' && entry.sourceModel === 'Invoice';

const amendments = () =>
  postJournalEntry.mock.calls.map(([entry]) => entry).filter(isAmendment);

/** The most recent revenue/receivable amendment entry, if any. */
const amendment = () => amendments().at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  postJournalEntry.mockResolvedValue({});
});

describe('invoice amendment keeps recognized revenue in step', () => {
  it('raises the receivable and revenue when the total grows', async () => {
    const doc = invoice({ total: 100, items: [lineItem(100)] });

    await amend(doc, { items: [lineItem(100), lineItem(50)] });

    expect(amendment()).toMatchObject({
      lines: [
        { account: 'accounts_receivable', debit: 50 },
        { account: 'revenue', credit: 50 },
      ],
    });
  });

  it('releases the receivable and revenue when the total shrinks', async () => {
    const doc = invoice({ total: 150, items: [lineItem(100), lineItem(50)] });

    await amend(doc, { items: [lineItem(100)] });

    expect(amendment()).toMatchObject({
      lines: [
        { account: 'revenue', debit: 50 },
        { account: 'accounts_receivable', credit: 50 },
      ],
    });
  });

  it('posts only the delta when an invoice is amended twice', async () => {
    const doc = invoice({ total: 100, items: [lineItem(100)] });

    await amend(doc, { items: [lineItem(120)] });
    expect(amendment().lines[0]).toMatchObject({ account: 'accounts_receivable', debit: 20 });

    vi.clearAllMocks();

    // 120 -> 130. Reversing the whole 130 here would over-credit the account.
    await amend(doc, { items: [lineItem(100), lineItem(30)] });
    expect(amendment().lines[0]).toMatchObject({ account: 'accounts_receivable', debit: 10 });
  });

  it('posts nothing when the amendment does not change the total', async () => {
    const doc = invoice({ total: 100, items: [lineItem(100)] });

    await amend(doc, { items: [lineItem(100)] });

    expect(amendment()).toBeUndefined();
  });

  it('posts nothing for a non-financial edit', async () => {
    const doc = invoice({ total: 100, items: [lineItem(100)] });

    await amend(doc, { notes: 'patient called' });

    expect(postJournalEntry).not.toHaveBeenCalled();
  });

  it('adjusts only the uncollected remainder on a partially-paid invoice', async () => {
    // 40 already collected against a 100 total, so the receivable still stands
    // at 60. Removing a 30 item must release exactly 30 — the settled 40 stays
    // where the payment entry put it.
    const doc = invoice({ total: 100, paidAmount: 40, items: [lineItem(100)] });

    await amend(doc, { items: [lineItem(100), lineItem(30)] });
    expect(doc.total).toBe(130);

    await amend(doc, { items: [lineItem(100)] });

    // Locate the receivable line rather than assuming a position: the two
    // directions of the entry put the accounts in opposite order.
    expect(amendment().lines).toEqual(
      expect.arrayContaining([{ account: 'accounts_receivable', credit: 30, memo: INVOICE_NO }]),
    );
  });

  it('refuses a reduction below the amount already collected', async () => {
    const doc = invoice({ total: 100, paidAmount: 90, items: [lineItem(100)] });

    await expect(amend(doc, { items: [lineItem(50)] })).rejects.toThrow(/already paid/i);
    expect(postJournalEntry).not.toHaveBeenCalled();
  });

  it('refuses financial edits once the invoice is fully paid', async () => {
    const doc = invoice({ total: 100, paidAmount: 100, items: [lineItem(100)] });

    await expect(amend(doc, { items: [lineItem(200)] })).rejects.toThrow(/refund or void/i);
    expect(postJournalEntry).not.toHaveBeenCalled();
  });
});