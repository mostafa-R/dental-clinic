import * as walletService from './wallet.service.js';
import { round2 } from '../../constants/accounting.js';
import { loadScopedPatient } from '../../utils/branchScope.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { withTransaction } from '../../core/transaction.js';
import { stripPHI } from '../../middleware/phiRestrict.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { emitToBranch } from '../../socket/index.js';
import { accountForMethod } from '../billing/invoice.service.js';
import { postJournalEntry } from '../accounting/journal.service.js';
import Invoice from '../billing/invoice.model.js';
import InstallmentPlan from './installment.model.js';

export const getWallet = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const wallet = await walletService.getOrCreateWallet(patient);
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const total = wallet.transactions.length;
  // L2: clamp start so an out-of-range page yields an empty slice, not a
  // negative index that incorrectly includes tail entries.
  const start = Math.max(0, Math.min(total, total - page * limit));
  const end = Math.max(0, Math.min(total, start + limit));
  const slicedTransactions = wallet.transactions.slice(start, end);
  const data = { ...wallet.toJSON(), transactions: slicedTransactions };
  return sendSuccess(res, {
    wallet: req.isImpersonation ? stripPHI(data) : data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const addWalletTransaction = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;

  if (data.invoice) {
    const invoice = await Invoice.findOne({
      _id: data.invoice,
      patient: patient._id,
      branch: patient.branch,
    }).select('_id').lean();
    if (!invoice) throw ApiError.badRequest('Invoice not found for this patient');
  }
  if (data.installment) {
    const plan = await InstallmentPlan.findOne({
      _id: data.installment,
      patient: patient._id,
      branch: patient.branch,
    }).select('_id').lean();
    if (!plan) throw ApiError.badRequest('Installment plan not found for this patient');
  }

  let wallet;
  await withTransaction(async (session) => {
    wallet = await walletService.addTransaction(patient, data, req.user._id, session);

    // M1(b): manual wallet entries must hit the double-entry ledger so
    // day-close's computeExpectedTakings sees cash inflows and the wallet
    // clearing account reconciles against the sum of patient balances.
    const amount = round2(Math.abs(Number(data.amount)));
    if (data.type === 'credit') {
      await postJournalEntry({
        tenant: patient.tenant ?? null,
        branch: patient.branch,
        date: new Date(),
        sourceType: 'wallet',
        sourceId: wallet._id,
        sourceModel: 'Wallet',
        description: data.reference || 'Wallet top-up',
        lines: [
          { account: 'cash', debit: amount, memo: 'cash' },
          { account: 'wallet_clearing', credit: amount, memo: 'wallet' },
        ],
        userId: req.user._id,
      }, session);
    } else {
      await postJournalEntry({
        tenant: patient.tenant ?? null,
        branch: patient.branch,
        date: new Date(),
        sourceType: 'wallet',
        sourceId: wallet._id,
        sourceModel: 'Wallet',
        description: data.description || data.reference || 'Wallet spend',
        lines: [
          { account: 'wallet_clearing', debit: amount, memo: 'wallet' },
          { account: 'revenue', credit: amount, memo: 'wallet spend' },
        ],
        userId: req.user._id,
      }, session);
    }
  });

  emitToBranch(String(patient.branch), 'wallet:updated', { wallet });
  const result = wallet.toJSON ? wallet.toJSON() : wallet;
  return sendSuccess(res, { wallet: req.isImpersonation ? stripPHI(result) : result });
});
