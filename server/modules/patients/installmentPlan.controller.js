import { round2 } from '../../constants/accounting.js';
import { withTransaction } from '../../core/transaction.js';
import { emitToBranch } from '../../socket/index.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { loadScopedPatient } from '../../utils/branchScope.js';
import { stripPHI } from '../../middleware/phiRestrict.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { postJournalEntry } from '../accounting/journal.service.js';
import Invoice from '../billing/invoice.model.js';
import { applyInvoicePayment, accountForMethod } from '../billing/invoice.service.js';
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

  // L7: installment schedules must be strictly chronological so the reminder
  // cron and the frontend timeline never see a jumbled order.
  for (let i = 1; i < data.installments.length; i++) {
    const prev = new Date(data.installments[i - 1].dueDate).getTime();
    const cur = new Date(data.installments[i].dueDate).getTime();
    if (cur < prev) {
      throw ApiError.badRequest('Installment due dates must be in ascending order');
    }
  }

  if (data.invoice) {
    const invoice = await Invoice.findOne({ _id: data.invoice, branch: patient.branch, tenant: patient.tenant });
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (String(invoice.patient) !== String(patient._id)) {
      throw ApiError.badRequest('Invoice does not belong to this patient');
    }

    // M3: a plan can never promise to collect more than the invoice still
    // owes — otherwise the plan and invoice ledgers diverge permanently.
    const outstanding = round2(invoice.total - invoice.paidAmount);
    if (outstanding > 0 && round2(data.totalAmount) > outstanding + 0.01) {
      throw ApiError.badRequest(
        `Plan total (${data.totalAmount}) exceeds the invoice's outstanding balance (${outstanding})`,
      );
    }

    const existingPlan = await InstallmentPlan.findOne({
      invoice: data.invoice,
      branch: patient.branch,
      tenant: patient.tenant,
      status: 'active',
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
    totalAmount: round2(data.totalAmount),
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
  return sendSuccess(res, { installmentPlan: serializePlan(plan, req) }, 201);
});

/**
 * PATCH /patients/:patientId/installments/:planId
 */
export const updateInstallmentPlan = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const plan = await InstallmentPlan.findOne({ _id: req.params.planId, patient: patient._id, branch: patient.branch });
  if (!plan) throw ApiError.notFound('Installment plan not found');

  const data = req.validatedBody;

  // L8: every mutation is audited on the plan document itself.
  const pushChange = (field, oldValue, newValue) => {
    plan.changelog.push({
      field,
      oldValue,
      newValue,
      changedBy: req.user._id,
    });
  };

  if (data.title !== undefined && data.title !== plan.title) {
    pushChange('title', plan.title, data.title);
    plan.title = data.title;
  }
  if (data.notes !== undefined && data.notes !== plan.notes) {
    pushChange('notes', plan.notes, data.notes);
    plan.notes = data.notes;
  }
  if (data.status !== undefined && data.status !== plan.status) {
    // A completed plan is a terminal state — money already flowed.
    if (plan.status === 'completed') {
      throw ApiError.conflict('Cannot change the status of a completed installment plan');
    }
    if (data.status === 'completed') {
      const allPaid = plan.installments.every((inst) => inst.status === 'paid');
      if (!allPaid) throw ApiError.badRequest('Cannot mark plan as completed — not all installments are paid');
    }
    if (data.status === 'defaulted') {
      const hasOverdue = plan.installments.some((inst) => inst.status === 'overdue');
      if (!hasOverdue) throw ApiError.badRequest('Cannot mark plan as defaulted — no overdue installments');
    }
    // High #2: a defaulted plan is NOT a dead end — the patient can be
    // reopened when they resume paying (also done automatically on payment).
    if (plan.status === 'defaulted' && data.status === 'active') {
      // Reopen is allowed.
    }
    pushChange('status', plan.status, data.status);
    plan.status = data.status;
  }

  await plan.save();
  emitToBranch(String(patient.branch), 'installment:updated', { installmentPlan: plan });
  return sendSuccess(res, { installmentPlan: serializePlan(plan, req) });
});

/**
 * POST /patients/:patientId/installments/:planId/pay
 * Pay an installment within a MongoDB session to prevent double-payment races.
 *
 * The client can pass `x-idempotency-key` to dedupe a network retry on the
 * linked invoice ledger. A hardcoded deterministic key is deliberately NOT
 * used here — it made every later partial payment of the same installment
 * replay the invoice booking for the full amount (High #1).
 */
export const payInstallment = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;
  const idempotencyKey = req.headers['x-idempotency-key'] || undefined;

  const result = await withTransaction(async (session) => {
    const plan = await InstallmentPlan.findOne({ _id: req.params.planId, patient: patient._id, branch: patient.branch, tenant: patient.tenant })
      .session(session);
    if (!plan) throw ApiError.notFound('Installment plan not found');
    if (plan.status === 'completed') throw ApiError.badRequest('Plan is already completed');

    // Require explicit installment ID to prevent race conditions.
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

    const baseDue = round2(installment.amount);
    const lateFee = installment.lateFee || 0;
    const dueTotal = round2(baseDue + lateFee);
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

    const planStatusBefore = plan.status;
    const installmentStatusBefore = installment.status;

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

    // High #2: defaulted plans are not a dead end. A payment either settles
    // the plan (all paid → completed) or resumes an active schedule
    // (defaulted → active) so the reminder cron keeps tracking it.
    const allPaid = plan.installments.every((inst) => inst.status === 'paid');
    if (allPaid) {
      plan.status = 'completed';
    } else if (planStatusBefore === 'defaulted') {
      plan.status = 'active';
    }

    // L8: audit every state transition this payment caused.
    if (plan.status !== planStatusBefore) {
      plan.changelog.push({
        field: 'status',
        oldValue: planStatusBefore,
        newValue: plan.status,
        changedBy: req.user._id,
      });
    }
    if (installment.status !== installmentStatusBefore) {
      plan.changelog.push({
        field: `installments.${installment.number}.status`,
        oldValue: installmentStatusBefore,
        newValue: installment.status,
        changedBy: req.user._id,
      });
    }

    await plan.save({ session });

    // Apply the invoice ledger but ONLY for the balance the invoice still
    // owes (High #3 / M2): a fully-paid (or void) invoice no longer makes the
    // transaction fail with a 409 — and the over-invoice portion is booked as
    // plan revenue below instead of being auto-credited into the wallet.
    let invoice = null;
    let invoicePortion = 0;
    if (plan.invoice) {
      const openInvoice = await Invoice.findOne({
        _id: plan.invoice,
        branch: patient.branch,
        tenant: patient.tenant,
      }).session(session);
      if (openInvoice && openInvoice.status !== 'void') {
        const invoiceBalance = round2(openInvoice.total - openInvoice.paidAmount);
        if (invoiceBalance > 0) {
          invoicePortion = round2(Math.min(data.amount, invoiceBalance));
          const applied = await applyInvoicePayment(
            {
              invoiceId: String(openInvoice._id),
              branchFilter: { branch: patient.branch, tenant: patient.tenant },
              amount: invoicePortion,
              method: installment.paymentMethod,
              reference: installment.paymentRef || `Installment #${installment.number}`,
              notes: `Installment plan payment — ${plan.title}`,
              idempotencyKey,
              // The wallet debit above already covers wallet-funded
              // installments, so the invoice ledger must not debit the wallet
              // a second time.
              skipWalletDebit: true,
              userId: req.user._id,
            },
            session,
          );
          invoice = applied && applied.idempotent ? applied.invoice : applied;
        }
      }
    }

    // Double-entry for the money the invoice did not absorb (M1):
    //  - no linked invoice (or void / fully paid) → the full payment is plan
    //    revenue,
    //  - invoice balance smaller than the payment → the excess is the payable
    //    fee / plan revenue, never a silent ledger gap.
    const unbilled = round2(data.amount - invoicePortion);
    if (unbilled >= 0.01) {
      await postJournalEntry(
        {
          tenant: plan.tenant ?? patient.tenant,
          branch: plan.branch ?? patient.branch,
          date: new Date(),
          sourceType: 'installment_payment',
          sourceId: plan._id,
          sourceModel: 'InstallmentPlan',
          description: `Installment plan payment (not tied to invoice) — ${plan.title} (#${installment.number})`,
          lines: [
            { account: accountForMethod(installment.paymentMethod), debit: unbilled, memo: installment.paymentMethod },
            { account: 'revenue', credit: unbilled, memo: 'installment revenue' },
          ],
          userId: req.user._id,
        },
        session,
      );
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