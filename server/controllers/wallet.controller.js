import Wallet from '../models/Wallet.js';
import InstallmentPlan from '../models/InstallmentPlan.js';
import Invoice from '../models/Invoice.js';
import { loadScopedPatient } from '../utils/branchScope.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/sendSuccess.js';
import { round2 } from '../constants/accounting.js';

/* ----------------------------------------------------------- Wallet */

/**
 * GET /patients/:patientId/wallet
 */
export const getWallet = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  let wallet = await Wallet.findOne({ patient: patient._id });
  if (!wallet) {
    wallet = await Wallet.create({
      branch: patient.branch,
      tenant: patient.tenant,
      patient: patient._id,
    });
  }
  return sendSuccess(res, { wallet });
});

/**
 * POST /patients/:patientId/wallet/transactions
 */
export const addWalletTransaction = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;

  let wallet = await Wallet.findOne({ patient: patient._id });
  if (!wallet) {
    wallet = await Wallet.create({
      branch: patient.branch,
      tenant: patient.tenant,
      patient: patient._id,
    });
  }

  if (data.type === 'debit' && wallet.balance < data.amount) {
    throw ApiError.badRequest('Insufficient wallet balance');
  }

  wallet.addTransaction({
    type: data.type,
    amount: data.amount,
    reference: data.reference,
    description: data.description,
    invoice: data.invoice,
    installment: data.installment,
    userId: req.user._id,
  });

  await wallet.save();
  return sendSuccess(res, { wallet });
});

/* ------------------------------------------------------- Installment Plans */

/**
 * GET /patients/:patientId/installments
 */
export const listInstallmentPlans = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const { page, limit, status } = req.validatedQuery;

  const filter = { patient: patient._id, branch: patient.branch };
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [plans, total] = await Promise.all([
    InstallmentPlan.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('invoice', 'invoiceNo total status'),
    InstallmentPlan.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    installmentPlans: plans,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/**
 * POST /patients/:patientId/installments
 */
export const createInstallmentPlan = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;

  // Validate total matches sum of installments
  const sumInstallments = round2(data.installments.reduce((s, inst) => s + inst.amount, 0));
  if (Math.abs(sumInstallments - data.totalAmount) > 0.01) {
    throw ApiError.badRequest('Sum of installments must equal total amount');
  }

  // If linked to an invoice, verify it exists and belongs to this patient
  if (data.invoice) {
    const invoice = await Invoice.findById(data.invoice);
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (String(invoice.patient) !== String(patient._id)) {
      throw ApiError.badRequest('Invoice does not belong to this patient');
    }
  }

  const plan = await InstallmentPlan.create({
    branch: patient.branch,
    tenant: patient.tenant,
    patient: patient._id,
    invoice: data.invoice || null,
    title: data.title,
    totalAmount: data.totalAmount,
    installments: data.installments.map((inst, i) => ({
      number: i + 1,
      dueDate: new Date(inst.dueDate),
      amount: round2(inst.amount),
    })),
    frequency: data.frequency || 'monthly',
    notes: data.notes || '',
    createdBy: req.user._id,
  });

  return sendSuccess(res, { installmentPlan: plan });
});

/**
 * PATCH /patients/:patientId/installments/:planId
 */
export const updateInstallmentPlan = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await InstallmentPlan.findOne({ _id: req.params.planId, patient: patient._id });
  if (!plan) throw ApiError.notFound('Installment plan not found');

  const data = req.validatedBody;
  if (data.title !== undefined) plan.title = data.title;
  if (data.notes !== undefined) plan.notes = data.notes;
  if (data.status !== undefined) plan.status = data.status;

  await plan.save();
  return sendSuccess(res, { installmentPlan: plan });
});

/**
 * POST /patients/:patientId/installments/:planId/pay
 * Pay one or more installments (or a partial amount on an installment).
 */
export const payInstallment = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;

  const plan = await InstallmentPlan.findOne({ _id: req.params.planId, patient: patient._id });
  if (!plan) throw ApiError.notFound('Installment plan not found');
  if (plan.status === 'completed') throw ApiError.badRequest('Plan is already completed');

  // Find the first unpaid/pending installment
  const installment = plan.installments.find((inst) => inst.status === 'pending' || inst.status === 'overdue');
  if (!installment) throw ApiError.badRequest('No pending installments to pay');

  const remaining = round2(installment.amount - installment.paidAmount);
  if (data.amount > remaining) {
    throw ApiError.badRequest(`Payment exceeds remaining balance of ${remaining}`);
  }

  installment.paidAmount = round2(installment.paidAmount + data.amount);
  installment.paymentMethod = data.paymentMethod || installment.paymentMethod || 'cash';
  if (data.paymentRef) installment.paymentRef = data.paymentRef;
  if (data.notes) installment.notes = data.notes;

  if (installment.paidAmount >= installment.amount) {
    installment.status = 'paid';
    installment.paidDate = new Date();
  }

  // Recalculate plan paid amount
  plan.paidAmount = round2(plan.installments.reduce((s, inst) => s + inst.paidAmount, 0));

  // Check if all installments are paid
  const allPaid = plan.installments.every((inst) => inst.status === 'paid');
  if (allPaid) plan.status = 'completed';

  await plan.save();
  return sendSuccess(res, { installmentPlan: plan, installment });
});
