import { round2 } from '../../constants/accounting.js';
import { withTransaction } from '../../core/transaction.js';
import { emitToBranch } from '../../socket/index.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { loadScopedPatient } from '../../utils/branchScope.js';
import { stripPHI } from '../../middleware/phiRestrict.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import Invoice from '../billing/invoice.model.js';
import { applyInvoicePayment } from '../billing/invoice.service.js';
import InstallmentPlan from './installment.model.js';
import { addTransaction } from './wallet.service.js';

function serializePlan(plan, req) {
  if (!req.isImpersonation) return plan;
  return plan && typeof plan.toJSON === 'function' ? stripPHI(plan.toJSON()) : stripPHI(plan);
}

function serializePHI(value, req) {
  if (!req.isImpersonation) return value;
  return value && typeof value.toJSON === 'function' ? stripPHI(value.toJSON()) : stripPHI(value);
}

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
    installmentPlans: plans.map((p) => serializePlan(p, req)),
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
    const invoice = await Invoice.findOne({ _id: data.invoice, branch: patient.branch, tenant: patient.tenant });
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (String(invoice.patient) !== String(patient._id)) {
      throw ApiError.badRequest('Invoice does not belong to this patient');
    }

    const existingPlan = await InstallmentPlan.findOne({
      invoice: data.invoice,
      branch: patient.branch,
      tenant: patient.tenant,
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

  emitToBranch(String(patient.branch), 'installment:created', { installmentPlan: plan });
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
    if (plan.status === 'completed' || plan.status === 'defaulted') {
      throw ApiError.conflict(
        `Cannot change the status of a ${plan.status} installment plan`,
      );
    }
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
  emitToBranch(String(patient.branch), 'installment:updated', { installmentPlan: plan });
  return sendSuccess(res, { installmentPlan: serializePlan(plan, req) });
});

/**
 * POST /patients/:patientId/installments/:planId/pay
 * Pay an installment within a MongoDB session to prevent double-payment races.
 */
export const payInstallment = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;

  const result = await withTransaction(async (session) => {
    const plan = await InstallmentPlan.findOne({ _id: req.params.planId, patient: patient._id, branch: patient.branch, tenant: patient.tenant })
      .session(session);
    if (!plan) throw ApiError.notFound('Installment plan not found');
    if (plan.status === 'completed') throw ApiError.badRequest('Plan is already completed');
    if (plan.status === 'defaulted') throw ApiError.badRequest('Cannot pay on a defaulted plan');

    // Require explicit installment ID to prevent race conditions
    const installmentId = data.installmentId;
    if (!installmentId) {
      throw ApiError.badRequest('Installment ID is required');
    }
    const installment = plan.installments.id(installmentId);
    if (!installment) throw ApiError.notFound('Installment not found');
    if (installment.status !== 'pending' && installment.status !== 'overdue') {
      throw ApiError.conflict('This installment has already been paid');
    }

    // PRD §6.3: a late fee can only be applied when settling an OVERDUE
    // installment, and it can only grow (never shrink) once recorded.
    if (data.lateFee != null && data.lateFee > 0) {
      if (installment.status !== 'overdue') {
        throw ApiError.badRequest('A late fee can only be applied to an overdue installment');
      }
      installment.lateFee = round2(Math.max(installment.lateFee || 0, data.lateFee));
    }

    const dueTotal = round2(installment.amount + (installment.lateFee || 0));
    const remaining = round2(dueTotal - installment.paidAmount);
    if (data.amount > remaining) {
      throw ApiError.badRequest(`Payment exceeds remaining balance of ${remaining}`);
    }

    // Overpayment guard: ensure total paid doesn't exceed plan total
    // (late fees are included in what the patient owes).
    const totalDuePlan = round2(
      plan.installments.reduce((s, inst) => s + inst.amount + (inst.lateFee || 0), 0),
    );
    const totalPaidBefore = round2(plan.installments.reduce((s, inst) => s + inst.paidAmount, 0));
    const newTotalPaid = round2(totalPaidBefore + data.amount);
    if (newTotalPaid > totalDuePlan) {
      throw ApiError.badRequest(`Payment would exceed plan total of ${totalDuePlan} (currently paid: ${totalPaidBefore})`);
    }

    installment.paidAmount = round2(installment.paidAmount + data.amount);
    installment.paymentMethod = data.paymentMethod || installment.paymentMethod || 'cash';
    if (data.paymentRef) installment.paymentRef = data.paymentRef;
    if (data.notes) installment.notes = data.notes;

    // Debit wallet when paying via wallet — inside the same transaction.
    if (installment.paymentMethod === 'wallet') {
      await addTransaction(
        patient,
        {
          type: 'debit',
          amount: data.amount,
          reference: `Installment #${installment.number} payment`,
          description: `Installment plan payment — ${plan.title}`,
          installment: plan._id,
        },
        req.user._id,
        session,
      );
    }

    if (installment.paidAmount >= dueTotal) {
      installment.status = 'paid';
      installment.paidDate = new Date();
    }

    plan.paidAmount = round2(plan.installments.reduce((s, inst) => s + inst.paidAmount, 0));

    const allPaid = plan.installments.every((inst) => inst.status === 'paid');
    if (allPaid) plan.status = 'completed';

    await plan.save({ session });

    // Keep the linked invoice ledger in sync (ISSUE-014): advance paidAmount,
    // derive unpaid → partial → paid, push a payment entry, and accrue the
    // doctor commission on full payment — all inside the same transaction.
    let invoice = null;
    if (plan.invoice) {
      invoice = await applyInvoicePayment(
        {
          invoiceId: plan.invoice,
          branchFilter: { branch: patient.branch, tenant: patient.tenant },
          amount: data.amount,
          method: installment.paymentMethod,
          reference: installment.paymentRef || `Installment #${installment.number}`,
          notes: `Installment plan payment — ${plan.title}`,
          idempotencyKey: `installment:${String(plan._id)}:${String(installment._id)}`,
          userId: req.user._id,
          // The wallet debit above already covers wallet-funded installments,
          // so the invoice ledger must not debit the wallet a second time.
          skipWalletDebit: true,
        },
        session,
      );
      if (invoice && invoice.idempotent) invoice = invoice.invoice;
    }

    return { installmentPlan: plan, installment, invoice };
  });

  emitToBranch(String(patient.branch), 'installment:paid', result);
  return sendSuccess(res, {
    installmentPlan: serializePlan(result.installmentPlan, req),
    installment: serializePHI(result.installment, req),
    invoice: result.invoice ? serializePHI(result.invoice, req) : undefined,
  });
});
