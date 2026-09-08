import mongoose from 'mongoose';

import Counter from '../../core/counters.js';
import { round2 } from '../../constants/accounting.js';

/**
 * Chart of accounts (PRD §7.5 / BR-BL-05). Kept intentionally small — these
 * are the ledgers the clinic actually reports on.
 *
 * Usage conventions (accrual-based reconciliation):
 *  - `accounts_receivable` is debited when an invoice is issued (and revenue
 *    credited), then credited as collections arrive — so its balance equals
 *    outstanding receivables and revenue is recognized at sale time, not on
 *    cash timing.
 *  - `wallet_clearing` is the patient-prepaid-wallet liability. It is credited
 *    when money is added to a patient's wallet and debited when spent, so the
 *    account reconciles against the sum of patient wallet balances.
 *  - `commissions_payable` is credited when a doctor commission is earned
 *    (accrued) and debited when it is paid out.
 */
export const ACCOUNTS = [
  'cash',
  'bank',
  'wallet_clearing', // money patients hold in their prepaid wallet
  'accounts_receivable',
  'revenue',
  'refunds',
  'expenses',
  'owner_drawing',
  'commissions_payable',
];

export const JOURNAL_SOURCE_TYPES = [
  'payment',
  'refund',
  'expense',
  'drawing',
  'commission',
  'invoice',
  'adjustment',
  'wallet',
  'installment_payment',
];

export const JOURNAL_SOURCE_MODELS = ['Invoice', 'Expense', 'OwnerDrawing', 'Commission', 'Wallet', 'InstallmentPlan'];

const journalLineSchema = new mongoose.Schema(
  {
    account: { type: String, enum: ACCOUNTS, required: true },
    debit: { type: Number, default: 0, min: 0, set: (v) => round2(v) },
    credit: { type: Number, default: 0, min: 0, set: (v) => round2(v) },
    memo: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false },
);

const journalEntrySchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
      default: null,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    entryNo: {
      type: String,
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    sourceType: { type: String, enum: JOURNAL_SOURCE_TYPES, required: true },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'sourceModel',
      default: null,
    },
    sourceModel: {
      type: String,
      enum: JOURNAL_SOURCE_MODELS,
      default: null,
    },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    lines: {
      type: [journalLineSchema],
      validate: [
        (v) => Array.isArray(v) && v.length >= 2,
        'A journal entry needs at least two lines',
      ],
    },
    totalDebit: { type: Number, default: 0, set: (v) => round2(v) },
    totalCredit: { type: Number, default: 0, set: (v) => round2(v) },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

journalEntrySchema.pre('validate', async function assignEntryNo() {
  if (!this.entryNo) {
    const nextSeq = await Counter.next('journal', this.tenant, this.$session?.());
    this.entryNo = `JE-${String(nextSeq).padStart(6, '0')}`;
  }
});

journalEntrySchema.set('toJSON', { virtuals: true });
journalEntrySchema.set('toObject', { virtuals: true });

journalEntrySchema.index({ tenant: 1, entryNo: 1 }, { unique: true });
journalEntrySchema.index({ branch: 1, date: -1 });
journalEntrySchema.index({ sourceType: 1, sourceId: 1 });

const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);

export default JournalEntry;
