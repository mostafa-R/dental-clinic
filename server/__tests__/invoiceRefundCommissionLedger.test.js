import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for the commission ledger on refunds.
 *
 * Refunding an invoice reverses the collection (Dr accounts_receivable / Cr the
 * asset account the money left through) but the invoice total is deliberately
 * NOT reduced — that is what voiding is for. The doctor commission, however, is
 * earned on what was actually collected, so a refund must shrink it. That
 * adjustment is only half the work: the commission liability booked by
 * `accrueCommissionForInvoice` (Dr expenses / Cr commissions_payable) also has
 * to move, otherwise `commissions_payable` keeps carrying an obligation the
 * doctor no longer has while the commission records say otherwise.
 *
 * The old refund path updated the commission documents and stopped there, so a
 * full refund voided the commission and left the accrual booked forever. The
 * properties pinned below are:
 *
 *   1. the liability posted for a refund equals the change in what is still
 *      owed — i.e. the entry is a delta against the existing accrual, never a
 *      second full reversal;
 *   2. the entry balances and uses the reversal direction (Dr the liability,
 *      Cr the expense) so it cannot drift the P&L the wrong way;
 *   3. a refund on an invoice with no accrued commission posts nothing, rather
 *      than inventing a liability out of a zero balance.
 *
 * `postJournalEntry` is mocked so the assertions are about the *intent* the
 * refund path expresses. Its own balance validation is already covered by the
 * accounting suite; re-deriving it here would only duplicate that test.
 */

const BRANCH = 'branch-1';
const TENANT = 'tenant-1';
const INVOICE_ID = 'invoice-1';

const INVOICE_NO = 'INV-00001';

/** Accrual as booked when the invoice was fully paid. */
const ACCRUAL_TOTAL = 100;

/**
 * A minimal query stub. `session()` is chained onto every builder in this
 * codebase, so it has to exist on every one of these.
 *
 * The awaited value is the document itself, so every chainable method returns
 * `then`-able `this` rather than a nested wrapper.
 */
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
const journalFindOne = vi.fn();
const commissionFind = vi.fn();

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
const InvoiceFindOne = vi.fn();
vi.mock('../modules/billing/invoice.model.js', () => ({
  default: { findOne: (...a) => InvoiceFindOne(...a) },
}));

vi.mock('../modules/billing/commission.model.js', () => ({
  default: { find: (...a) => commissionFind(...a) },
}));

vi.mock('../modules/accounting/journalEntry.model.js', () => ({
  default: { findOne: (...a) => journalFindOne(...a), create: vi.fn() },
}));

vi.mock('../modules/accounting/journal.service.js', () => ({
  postJournalEntry: (...a) => postJournalEntry(...a),
}));

const { refundPayment } = await import('../modules/billing/invoice.service.js');

/**
 * A commission document as Mongoose would hand it back. `save()` recomputes
 * `amount` from `baseAmount`, which is how scaling the base shrinks the money
 * actually owed.
 */
function commissionDoc({ baseAmount, rate = 10, status = 'pending' } = {}) {
  const doc = {
    baseAmount,
    rate,
    status,
    saved: 0,
    save: vi.fn().mockResolvedValue(undefined),
  };
  doc.save = vi.fn(async () => {
    doc.saved += 1;
    doc.amount = Number(((doc.baseAmount * rate) / 100).toFixed(2));
    return doc;
  });
  return doc;
}

/** The state a refund mutates in place; captured after the call. */
function track(docs) {
  for (const doc of docs) {
    doc.amount = Number(((doc.baseAmount * doc.rate) / 100).toFixed(2));
  }
  return docs;
}

const invoiceDoc = (paidAmount, payments = []) => ({
  _id: INVOICE_ID,
  invoiceNo: INVOICE_NO,
  tenant: TENANT,
  branch: BRANCH,
  status: 'paid',
  paidAmount,
  payments,
  changelog: [],
  populate: vi.fn().mockResolvedValue(undefined),
  save: vi.fn(async function save() {
    // Mirrors the model's pre-validate recompute from the payments array.
    this.paidAmount = Number(
      this.payments.reduce((sum, p) => sum + (p.isRefund ? -Math.abs(p.amount) : p.amount), 0).toFixed(2),
    );
    return this;
  }),
});

/**
 * Drives `refundInvoicePayment` with the given commission state and the
 * accrual already booked for the invoice.
 *
 * @param {object} opts
 * @param {number} opts.paidAmount        collected before the refund
 * @param {number} opts.refundAmount      the refund being issued
 * @param {Array}  opts.commissions       pending commission documents
 * @param {number|null} opts.accruedTotal accrual booked, or null for none
 */
async function refund({ paidAmount, refundAmount, commissions, accruedTotal }) {
  // Honour the `status` filter so a `paid` document is genuinely excluded
  // rather than being handed back by an over-permissive stub.
  commissionFind.mockImplementation((filter) =>
    query(
      track(
        filter?.status
          ? commissions.filter((c) => c.status === filter.status)
          : commissions,
      ),
    ),
  );
  journalFindOne.mockReturnValue(
    query(
      accruedTotal === null
        ? null
        : { _id: 'entry-1', totalCredit: accruedTotal, totalDebit: accruedTotal },
    ),
  );

  // `refundPayment` takes the invoice id and re-fetches inside the transaction;
  // the stub `Invoice.findOne` hands back the fixture document.
  InvoiceFindOne.mockReturnValue(
    query(invoiceDoc(paidAmount, [{ amount: paidAmount, method: 'cash', isRefund: false }])),
  );

  const result = await refundPayment(
    INVOICE_ID,
    { branch: BRANCH },
    { amount: refundAmount, userId: 'user-1', method: 'cash' },
  );

  return result;
}

/** The entries this refund posted that reverse a commission accrual. */
const commissionAdjustments = () =>
  postJournalEntry.mock.calls
    .map(([entry]) => entry)
    .filter((entry) => entry.sourceModel === 'Commission');

/** Net movement the refund applied to `commissions_payable`. */
const payableMovement = () =>
  commissionAdjustments().reduce((sum, entry) => {
    const line = entry.lines.find((l) => l.account === 'commissions_payable');
    return sum + (line ? line.debit : 0);
  }, 0);

beforeEach(() => {
  vi.clearAllMocks();
  postJournalEntry.mockResolvedValue({});
});

describe('refund adjusts the accrued commission liability', () => {
  it('reverses the whole accrual when the refund clears the invoice', async () => {
    // 1000 collected at 10% commission -> 100 accrued. Refunding it all leaves
    // nothing owed, so the liability must go to zero.
    await refund({
      paidAmount: 1000,
      refundAmount: 1000,
      commissions: [commissionDoc({ baseAmount: 1000 })],
      accruedTotal: ACCRUAL_TOTAL,
    });

    expect(payableMovement()).toBe(ACCRUAL_TOTAL);
  });

  it('voids the commission records when the invoice is fully refunded', async () => {
    const doc = commissionDoc({ baseAmount: 1000 });
    await refund({
      paidAmount: 1000,
      refundAmount: 1000,
      commissions: [doc],
      accruedTotal: ACCRUAL_TOTAL,
    });

    expect(doc.status).toBe('void');
  });

  it('reduces the liability by the proportional share on a partial refund', async () => {
    // Half the money comes back, so half the 10% commission (50 of 100) is no
    // longer owed. Reversing the full 100 here would understate the payout.
    const doc = commissionDoc({ baseAmount: 1000 });
    await refund({
      paidAmount: 1000,
      refundAmount: 500,
      commissions: [doc],
      accruedTotal: ACCRUAL_TOTAL,
    });

    expect(doc.status).toBe('pending');
    expect(doc.baseAmount).toBe(500);
    expect(payableMovement()).toBe(50);
  });

  it('posts a balanced entry in the reversal direction', async () => {
    await refund({
      paidAmount: 1000,
      refundAmount: 250,
      commissions: [commissionDoc({ baseAmount: 1000 })],
      accruedTotal: ACCRUAL_TOTAL,
    });

    const [entry] = commissionAdjustments();
    expect(entry.lines).toEqual([
      expect.objectContaining({ account: 'commissions_payable', debit: 25 }),
      expect.objectContaining({ account: 'expenses', credit: 25 }),
    ]);
  });

  it('posts only the delta across two successive partial refunds', async () => {
    // This is the property that a naive "reverse the prior accrual" fix gets
    // wrong: the second refund must move the liability from 50 to 0, not from
    // 100 to 0 again, or the account is credited twice.
    const first = await refund({
      paidAmount: 1000,
      refundAmount: 500,
      commissions: [commissionDoc({ baseAmount: 1000 })],
      accruedTotal: ACCRUAL_TOTAL,
    });

    expect(payableMovement()).toBe(50);

    vi.clearAllMocks();

    const stillPending = commissionDoc({ baseAmount: 500 });
    await refund({
      paidAmount: 500,
      refundAmount: 500,
      commissions: [stillPending],
      accruedTotal: 50,
    });

    // Liability outstanding before the second refund was 50; it must now be 0,
    // so the final entry is worth 50 — not another 100.
    expect(payableMovement()).toBe(50);
    expect(stillPending.status).toBe('void');
    expect(first).toBeDefined();
  });

  it('posts nothing when the invoice never accrued a commission', async () => {
    await refund({
      paidAmount: 400,
      refundAmount: 400,
      commissions: [],
      accruedTotal: null,
    });

    expect(commissionAdjustments()).toHaveLength(0);
  });

  it('still posts the refund collection entry even with no commission', async () => {
    await refund({
      paidAmount: 400,
      refundAmount: 400,
      commissions: [],
      accruedTotal: null,
    });

    const collection = postJournalEntry.mock.calls
      .map(([entry]) => entry)
      .filter((entry) => entry.sourceType === 'refund');

    expect(collection).toHaveLength(1);
  });

  it('does not disturb an already-paid commission', async () => {
    // Cash has already left the business; voiding the record would hide a real
    // payout. Clawing it back is a separate flow, so the refund leaves it be.
    const paid = commissionDoc({ baseAmount: 1000, status: 'paid' });
    await refund({
      paidAmount: 1000,
      refundAmount: 1000,
      commissions: [paid],
      accruedTotal: ACCRUAL_TOTAL,
    });

    expect(paid.status).toBe('paid');
  });
});