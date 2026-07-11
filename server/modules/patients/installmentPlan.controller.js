import mongoose from 'mongoose';

import InstallmentPlan from './installment.model.js';
import Invoice from '../billing/invoice.model.js';
import Wallet from './wallet.model.js';
import { loadScopedPatient } from '../../utils/branchScope.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { round2 } from '../../constants/accounting.js';

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

  const sumInstallments = round2(data.installments.reduce((s, inst) => s + inst.amount, 0));
  if (Math.abs(sumInstallments - data.totalAmount) > 0.01) {
    throw ApiError.badRequest('Sum of installments must equal total amount');
  }

  if (data.invoice) {
    const invoice = await Invoice.findById(data.invoice);
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (String(invoice.patient) !== String(patient._id)) {
      throw ApiError.badRequest('Invoice does not belong to this patient');
    }

    const existingPlan = await InstallmentPlan.findOne({
      invoice: data.invoice,
      status: { $in: ['active', 'overdue'] },
    });
    if (existingPlan) {
      throw ApiError.conflict('An active installment plan already exists for this invoice');
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

  return sendSuccess(res, { installmentPlan: plan }, 201);
});

/**
 * PATCH /patients/:patientId/installments/:planId
 */
export const updateInstallmentPlan = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await InstallmentPlan.findOne({ _id: req.params.planId, patient: patient._id, branch: patient.branch });
  if (!plan) throw ApiError.notFound('Installment plan not found');

  const data = req.validatedBody;
  if (data.title !== undefined) plan.title = data.title;
  if (data.notes !== undefined) plan.notes = data.notes;
  if (data.status !== undefined) {
    if (data.status === 'completed') {
      const allPaid = plan.installments.every((inst) => inst.status === 'paid');
      if (!allPaid) throw ApiError.badRequest('Cannot mark plan as completed — not all installments are paid');
    }
    if (data.status === 'defaulted') {
      const hasOverdue = plan.installments.some((inst) => inst.status === 'overdue');
      if (!hasOverdue) throw ApiError.badRequest('Cannot mark plan as defaulted — no overdue installments');
    }
    plan.status = data.status;
  }

  await plan.save();
  return sendSuccess(res, { installmentPlan: plan });
});

/**
 * POST /patients/:patientId/installments/:planId/pay
 * Pay an installment within a MongoDB session to prevent double-payment races.
 */
export const payInstallment = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;

  const session = await mongoose.startSession();
  let result;
  try {
    session.startTransaction();

    const plan = await InstallmentPlan.findOne({ _id: req.params.planId, patient: patient._id })
      .session(session);
    if (!plan) throw ApiError.notFound('Installment plan not found');
    if (plan.status === 'completed') throw ApiError.badRequest('Plan is already completed');
    if (plan.status === 'defaulted') throw ApiError.badRequest('Cannot pay on a defaulted plan');

    const installment = plan.installments.find(
      (inst) => inst.status === 'pending' || inst.status === 'overdue',
    );
    if (!installment) throw ApiError.badRequest('No pending installments to pay');

    const remaining = round2(installment.amount - installment.paidAmount);
    if (data.amount > remaining) {
      throw ApiError.badRequest(`Payment exceeds remaining balance of ${remaining}`);
    }

    installment.paidAmount = round2(installment.paidAmount + data.amount);
    installment.paymentMethod = data.paymentMethod || installment.paymentMethod || 'cash';
    if (data.paymentRef) installment.paymentRef = data.paymentRef;
    if (data.notes) installment.notes = data.notes;

    // Debit wallet when paying via wallet — inside the same transaction.
    if (installment.paymentMethod === 'wallet') {
      const wallet = await Wallet.findOne({ patient: patient._id }).session(session);
      if (!wallet) throw ApiError.badRequest('Patient has no wallet');
      if (wallet.balance < data.amount) {
        throw ApiError.badRequest('Insufficient wallet balance');
      }
      wallet.addTransaction({
        type: 'debit',
        amount: data.amount,
        reference: `Installment #${installment.number} payment`,
        description: `Installment plan payment — ${plan.title}`,
        installment: plan._id,
        userId: req.user._id,
      });
      await wallet.save({ session });
    }

    if (installment.paidAmount >= installment.amount) {
      installment.status = 'paid';
      installment.paidDate = new Date();
    }

    plan.paidAmount = round2(plan.installments.reduce((s, inst) => s + inst.paidAmount, 0));

    const allPaid = plan.installments.every((inst) => inst.status === 'paid');
    if (allPaid) plan.status = 'completed';

    await plan.save({ session });
    await session.commitTransaction();

    result = { installmentPlan: plan, installment };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  return sendSuccess(res, result);
});
