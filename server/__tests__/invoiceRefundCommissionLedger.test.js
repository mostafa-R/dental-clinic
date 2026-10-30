import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for the commission ledger on refunds.
 *
 * Refunding an invoice reverses the collection (Dr accounts_receivable / Cr the
 * asset account the money left through) but the invoice total is deliberately
 * NOT reduced — that is what voiding is for. The doctor commission, however, is
 * earned on what was actually collected, so a refund must shrink it. That
 * adjustment is only half the work: the `commissions_payable` liability booked
 * while the invoice was paid also has to move, otherwise the journal keeps
 * carrying an obligation the doctor no longer has.
 *
 * The C3 fix replaced the old "diff one prior accrual entry" arithmetic with a
 * net reconcile: desired = sum of `pending` commission amounts, current = net
 * (credits − debits) of `commissions_payable` lines across every journal entry
 * attributable to the invoice or its commissions — accruals, prior refund/void
 * adjustments AND the commission-scoped payout entries. The properties pinned
 * below:
 *
 *   1. the entry posted for a refund moves the liability from its NET current
 *      value to the new owed value — never a second full reversal of the
 *      original accrual;
 *   2. the entry balances and uses the reversal direction (Dr the liability,
 *      Cr the expense) so it cannot drift the P&L the wrong way;
 *   3. a refund on an invoice with no accrued commission posts nothing, rather
 *      than inventing a liability out of a zero balance;
 *   4. an already-paid commission whose payout is on the books is left alone —
 *      the two entries net to zero, so no adjustment can run cash out twice.
 *
 * `postJournalEntry` is mocked so the assertions are about the *intent* the
 * refund path expresses. Its own balance validation is already covered by the
 * accounting suite; re-deriving it here would only duplicate that test.
 */

const BRANCH = 'branch-1';
const TENANT = 'tenant-1';
const INVOICE_ID = 'invoice-1';

const INVOICE_NO = 'INV-00001';

/**
 * A minimal query stub. `session()` is chained onto every builder in this
 * codebase, and the net reconcile additionally chains `.select()`, so both
 * exist here. The awaited value is the document/array itself, so every
 * chainable method returns `then`-able `this`.
 */
const query = (value) => {
  const q = {
    session: () => q,
    select: () => q,
    sort: () => q,
    limit: () => q,
    lean: () => q,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return q;
};

const postJournalEntry = vi.fn().mockResolvedValue({});
const journalFind = vi.fn();
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
  default: { find: (...a) => journalFind(...a) },
}));

vi.mock('../modules/accounting/journal.service.js', () => ({
  postJournalEntry: (...a) => postJournalEntry(...a),
}));

const { refundPayment } = await import('../modules/billing/invoice.service.js');

/** The journal side of a commission accrual that booked `amount` of liability. */
const accrualEntry = (amount) => ({
  lines: [{ account: 'commissions_payable', debit: 0, credit: amount }],
});

/** The journal side of a commission payout: pays the doctor in cash. */
const payoutEntry = (amount) => ({
  lines: [{ account: 'commissions_payable', debit: amount, credit: 0 }],
});

/**
 * A commission document as Mongoose would hand it back. `save()` recomputes
 * `amount` from `baseAmount`, which is how scaling the base shrinks the money
 * actually owed.
 */
function commissionDoc({ _id = 'comm-1', baseAmount, rate = 10, status = 'pending' } = {}) {
  const doc = {
    _id,
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
  doc.amount = Number(((doc.baseAmount * rate) / 100).toFixed(2));
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
 * Drives `refundPayment` with the given commission state and the commission
 * journal history already on the books.
 *
 * @param {object} opts
 * @param {number} opts.paidAmount        collected before the refund
 * @param {number} opts.refundAmount      the refund being issued
 * @param {Array}  opts.commissions       commission documents for the invoice
 * @param {number|Array} opts.ledger      net credit shorthand (number) or a
 *                                        raw entry list, e.g. accrual + payout
 */
async function refund({ paidAmount, refundAmount, commissions, ledger }) {
  // Honour the `status` filter so a `paid` document is genuinely excluded
  // rather than being handed back by an over-permissive stub. The unfiltered
  // call (used to collect commission ids for the payout entry union) returns
  // everything.
  commissionFind.mockImplementation((filter) =>
    query(
      track(
        filter?.status
          ? commissions.filter((c) => c.status === filter.status)
          : commissions,
      ),
    ),
  );

  const entries = Array.isArray(ledger) ? ledger : ledger === null ? [] : [accrualEntry(ledger)];
  journalFind.mockImplementation(() => query(entries));

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

/** The liability-moving entries this refund posted. */
const commissionAdjustments = () =>
  postJournalEntry.mock.calls
    .map(([entry]) => entry)
    .filter((entry) => entry.sourceType === 'commission' && entry.sourceModel === 'Invoice');

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
    // 1000 collected at 10% commission -> 100 accrued and nothing else on the
    // books. Refunding it all leaves nothing owed, so the liability must go
    // from its net value (100) to zero.
    await refund({
      paidAmount: 1000,
      refundAmount: 1000,
      commissions: [commissionDoc({ baseAmount: 1000 })],
      ledger: 100,
    });

    expect(payableMovement()).toBe(100);
  });

  it('voids the commission records when the invoice is fully refunded', async () => {
    const doc = commissionDoc({ baseAmount: 1000 });
    await refund({
      paidAmount: 1000,
      refundAmount: 1000,
      commissions: [doc],
      ledger: 100,
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
      ledger: 100,
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
      ledger: 100,
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
      ledger: 100,
    });

    expect(payableMovement()).toBe(50);

    vi.clearAllMocks();
    postJournalEntry.mockResolvedValue({});

    const stillPending = commissionDoc({ baseAmount: 500 });
    await refund({
      paidAmount: 500,
      refundAmount: 500,
      commissions: [stillPending],
      ledger: 50,
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
      ledger: null,
    });

    expect(commissionAdjustments()).toHaveLength(0);
  });

  it('still posts the refund collection entry even with no commission', async () => {
    await refund({
      paidAmount: 400,
      refundAmount: 400,
      commissions: [],
      ledger: null,
    });

    const collection = postJournalEntry.mock.calls
      .map(([entry]) => entry)
      .filter((entry) => entry.sourceType === 'refund');

    expect(collection).toHaveLength(1);
  });

  it('does not double-reverse an already-paid commission', async () => {
    // Cash has already left the business for the doctor (the payout entry is
    // commission-scoped, so it precisely cancels the accrual in the net
    // balance). Voiding the record would hide a real payout, and the old
    // non-net arithmetic posted a bogus second reversal against an
    // already-zero liability — clawing it back is a separate payout flow.
    const paid = commissionDoc({ _id: 'comm-9', baseAmount: 1000, status: 'paid' });
    await refund({
      paidAmount: 1000,
      refundAmount: 1000,
      commissions: [paid],
      ledger: [accrualEntry(100), payoutEntry(100)],
    });

    expect(paid.status).toBe('paid');
    expect(commissionAdjustments()).toHaveLength(0);
  });
});
