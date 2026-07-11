import * as walletService from './wallet.service.js';
import { loadScopedPatient } from '../../utils/branchScope.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';

export const getWallet = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const wallet = await walletService.getOrCreateWallet(patient);
  return sendSuccess(res, { wallet });
});

export const addWalletTransaction = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const wallet = await walletService.addTransaction(patient, req.validatedBody, req.user._id);
  return sendSuccess(res, { wallet });
});
