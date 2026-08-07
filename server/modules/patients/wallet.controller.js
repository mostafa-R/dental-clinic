import * as walletService from './wallet.service.js';
import { loadScopedPatient } from '../../utils/branchScope.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { emitToBranch } from '../../socket/index.js';
import Invoice from '../billing/invoice.model.js';
import InstallmentPlan from './installment.model.js';

export const getWallet = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const wallet = await walletService.getOrCreateWallet(patient);
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const start = Math.max(0, wallet.transactions.length - page * limit);
  const end = start + limit;
  const slicedTransactions = wallet.transactions.slice(start, end);
  return sendSuccess(res, {
    wallet: { ...wallet.toJSON(), transactions: slicedTransactions },
    pagination: {
      page,
      limit,
      total: wallet.transactions.length,
      pages: Math.max(1, Math.ceil(wallet.transactions.length / limit)),
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

  const wallet = await walletService.addTransaction(patient, data, req.user._id);
  emitToBranch(String(patient.branch), 'wallet:updated', { wallet });
  return sendSuccess(res, { wallet });
});
