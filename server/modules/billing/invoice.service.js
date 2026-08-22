import mongoose from 'mongoose';

import { round2 } from '../../constants/accounting.js';
import { withTransaction } from '../../core/transaction.js';
import ApiError from '../../utils/ApiError.js';
import { toObjectId } from '../../utils/branchScope.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import Appointment from '../appointments/appointment.model.js';
import Patient from '../patients/patient.model.js';
import { addTransaction } from '../patients/wallet.service.js';
import User from '../users/user.model.js';
import Commission from './commission.model.js';
import Invoice from './invoice.model.js';
import { postJournalEntry } from '../accounting/journal.service.js';

const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName phone' },
  { path: 'appointment', select: 'start status' },
  { path: 'payments.recordedBy', select: 'name' },
  { path: 'createdBy', select: 'name' },
];

/** Map a payment method to the asset account money moves through. */
function accountForMethod(method) {
  if (method === 'cash') return 'cash';
  if (method === 'wallet') return 'wallet_clearing';
  return 'bank'; // card / transfer
}

/**
 * Resolve the doctor eligible for commission on an invoice.
 *
 * 1. The invoice's own appointment (appointment-linked invoices).
 * 2. For plan-sourced invoices (`appointment: null`) the treatment plan whose
 *    items back-link to this invoice — prefer a doctor referenced by any plan
 *    item's appointment, then fall back to the plan's creator. This makes
 *    plan-generated revenue accrue commission like appointment revenue does.
 */
async function resolveCommissionDoctor(invoice, session) {
  if (invoice.appointment) {
    const appt = await Appointment.findById(invoice.appointment)
      .select('doctor')
      .session(session)
      .lean();
    if (appt?.doctor) return appt.doctor;
  }

  const { default: TreatmentPlan } = await import('../emr/treatmentPlan.model.js');
  const plan = await TreatmentPlan.findOne({ 'items.invoice': invoice._id })
    .select('createdBy items.appointment')
    .session(session)
    .lean();
  if (!plan) return null;

  const itemAppointmentIds = (plan.items || [])
    .map((item) => item.appointment)
    .filter(Boolean);
  if (itemAppointmentIds.length > 0) {
    const appt = await Appointment.findOne({ _id: { $in: itemAppointmentIds } })
      .select('doctor')
      .session(session)
      .lean();
    if (appt?.doctor) return appt.doctor;
  }
  return plan.createdBy || null;
}

/**
 * Accrue (or grow) the doctor commission when an invoice is fully paid.
 *
 * BR-BL-02: commission is computed PER TREATMENT ITEM and never applies to
 * discounts or taxes — each line's base is qty×price minus its own discount
 * minus its proportional share of any invoice-level discount. Invoices
 * without usable line items (legacy data) fall back to one record on the
 * full total so partial instalments never over/under-accrue.
 */
async function accrueCommissionForInvoice(invoice, session, userId) {
  const doctorId = await resolveCommissionDoctor(invoice, session);
  if (!doctorId) return;

  const doctor = await User.findById(doctorId)
    .select('commissionRate name branch')
    .session(session)
    .lean();
  if (!doctor || (doctor.commissionRate || 0) <= 0) return;

  const lines = (Array.isArray(invoice.items) && invoice.items.length > 0 ? invoice.items : [])
    .map((item) => {
      const gross = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
      const net = Math.max(0, gross - (Number(item.discount) || 0));
      return { name: String(item.description || '').trim(), net };
    })
    .filter((line) => line.name && line.net > 0);

  let desired;
  if (lines.length > 0) {
    const pool = round2(lines.reduce((sum, line) => sum + line.net, 0));
    if (pool <= 0) return;
    // Spread the invoice-level discount across items by their share of the
    // commissionable pool, so discounts never inflate the commission base.
    const invoiceDiscount = round2(Math.min(Math.max(Number(invoice.discount) || 0, 0), pool));
    const factor = (pool - invoiceDiscount) / pool;
    desired = lines
      .map((line) => ({
        procedureName: line.name.slice(0, 120),
        baseAmount: round2(line.net * factor),
      }))
      .filter((entry) => entry.baseAmount > 0);
  } else {
    const baseAmount = round2(invoice.total || 0);
    if (baseAmount <= 0) return;
    desired = [
      { procedureName: `Invoice payment — ${invoice.invoiceNo}`, baseAmount },
    ];
  }
  if (desired.length === 0) return;

  const existing =
    (await Commission.find({ invoice: invoice._id, doctor: doctor._id }).session(session)) || [];
  const unmatched = new Map(existing.map((c) => [c.procedureName, c]));

  for (const entry of desired) {
    const match = unmatched.get(entry.procedureName);
    if (match) {
      match.baseAmount = entry.baseAmount;
      match.amount = round2((entry.baseAmount * (match.rate || doctor.commissionRate)) / 100);
      // A fully refunded invoice voids its commissions; if it is paid in full
      // again, they are earned again.
      if (match.status === 'void') {
        match.status = 'pending';
        match.paidDate = null;
      }
      await match.save({ session });
      unmatched.delete(entry.procedureName);
    } else {
      try {
        await Commission.create(
          [
            {
              tenant: invoice.tenant,
              branch: invoice.branch,
              doctor: doctor._id,
              patient: invoice.patient,
              invoice: invoice._id,
              procedureName: entry.procedureName,
              baseAmount: entry.baseAmount,
              rate: doctor.commissionRate,
              createdBy: userId,
            },
          ],
          { session },
        );
      } catch (err) {
        // ignore duplicate key errors (race condition)
      }
    }
  }

  // Items removed from the invoice since the last accrual lose their record.
  for (const stale of unmatched.values()) {
    await stale.deleteOne({ session });
  }
}

async function resolveSearchFilter(search, patientId, branchFilter) {
  const filter = {};
  if (patientId) filter.patient = toObjectId(patientId);
  if (!search?.trim()) return filter;

  const term = escapeRegex(search.trim());
  const regex = new RegExp(term, 'i');
  const matchedPatients = await Patient.find({
    ...branchFilter,
    $or: [{ firstName: regex }, { lastName: regex }, { patientId: regex }, { phone: regex }],
  })
    .select('_id')
    .lean();

  filter.$or = [
    { invoiceNo: regex },
    { patient: { $in: matchedPatients.map((p) => p._id) } },
  ];
  return filter;
}

export async function listInvoices(branchFilter, { search, status, patient, appointment, page, limit }) {
  const filter = { ...branchFilter };
  Object.assign(filter, await resolveSearchFilter(search, patient, branchFilter));
  if (status) filter.status = status;
  if (appointment) filter.appointment = toObjectId(appointment);

  const skip = (page - 1) * limit;
  const [invoices, total] = await Promise.all([
    Invoice.find(filter).populate(POPULATE).sort('-createdAt').skip(skip).limit(limit),
    Invoice.countDocuments(filter),
  ]);

  return {
    invoices,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getBillingSummary(branchFilter) {
  const baseFilter = { ...branchFilter, status: { $ne: 'void' } };

  const [totalsAgg, byStatusAgg] = await Promise.all([
    Invoice.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalBilled: { $sum: '$total' },
          totalPaid: { $sum: '$paidAmount' },
        },
      },
    ]),
    Invoice.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$total' },
        },
      },
    ]),
  ]);

  const row = totalsAgg[0];
  const totalBilled = round2(row?.totalBilled || 0);
  const totalPaid = round2(row?.totalPaid || 0);

  return {
    summary: {
      count: row?.count || 0,
      totalBilled,
      totalPaid,
      outstanding: round2(totalBilled - totalPaid),
    },
    byStatus: byStatusAgg.map((s) => ({
      status: s._id,
      count: s.count,
      amount: round2(s.amount),
    })),
  };
}

export async function getInvoice(id, branchFilter) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }
  const invoice = await Invoice.findOne({ _id: id, ...branchFilter }).populate(POPULATE);
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }
  return invoice;
}

export async function createInvoice({ data, branch, tenant, userId }) {
  // Pre-validate patient and appointment before starting transaction
  const patient = await Patient.findOne({ _id: toObjectId(data.patient), branch });
  if (!patient) {
    throw ApiError.badRequest('Referenced patient does not exist in this branch', {
      patient: 'not found',
    });
  }

  let appointment = null;
  if (data.appointment) {
    // The appointment must exist in this branch AND belong to this patient;
    // otherwise an invoice can be linked to another patient's visit.
    appointment = await Appointment.findOne({
      _id: toObjectId(data.appointment),
      branch,
      patient: toObjectId(data.patient),
    })
      .select('_id')
      .lean();
    if (!appointment) {
      throw ApiError.badRequest('Appointment does not belong to this patient or branch', {
        appointment: 'not found',
      });
    }
  }

  // Create invoice within a transaction to ensure counter and invoice are atomic
  // This prevents invoice number gaps if creation fails after counter increment
  const result = await withTransaction(async (session) => {
    // Get the next invoice number within the transaction. The counter is
    // scoped to the fiscal year (PRD §6.6) so numbering restarts annually.
    const Counter = (await import('../../core/counters.js')).default;
    const year = new Date().getFullYear();
    const nextSeq = await Counter.next('invoice', tenant, session, year);
    const invoiceNo = `INV-${year}-${String(nextSeq).padStart(5, '0')}`;

    // Create the invoice with the pre-generated invoice number
    const [invoice] = await Invoice.create(
      [
        {
          patient: toObjectId(data.patient),
          branch,
          tenant,
          appointment: appointment ? appointment._id : null,
          items: data.items,
          discount: data.discount || 0,
          discountType: data.discountType || 'fixed',
          discountRate: data.discountRate || 0,
          tax: data.tax || 0,
          taxRate: data.taxRate || 0,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          notes: data.notes || '',
          createdBy: userId,
          invoiceNo, // Pre-assigned invoice number
        },
      ],
      { session }
    );

    return invoice;
  });

  await result.populate(POPULATE);
  return result;
}

const FINANCIAL_FIELDS = ['items', 'discount', 'discountType', 'discountRate', 'tax', 'taxRate'];

/**
 * Update an invoice inside a transaction.
 *
 * Re-reads the invoice inside the session (optimistic concurrency) so a
 * concurrent payment cannot be silently overwritten by a recompute of the
 * totals (TOCTOU). Financial fields (items/discount/tax) are locked once the
 * invoice is paid — refund or void it first.
 */
export async function updateInvoice(id, branchFilter, data, userId) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const result = await withTransaction(async (session) => {
    const invoice = await Invoice.findOne({ _id: id, ...branchFilter }).session(session);
    if (!invoice) {
      throw ApiError.notFound('Invoice not found');
    }
    if (invoice.status === 'void') {
      throw ApiError.conflict('Cannot edit a void invoice');
    }

    if (invoice.status === 'paid' && FINANCIAL_FIELDS.some((f) => data[f] !== undefined)) {
      throw ApiError.conflict(
        'Cannot modify items, discount, or tax on a paid invoice; refund or void it first',
      );
    }

    const changelog = [];

    if (data.items !== undefined) {
      changelog.push({ field: 'items', oldValue: invoice.items.length + ' items', newValue: data.items.length + ' items', changedBy: userId });
      invoice.items = data.items;
    }
    if (data.discountType !== undefined) {
      changelog.push({ field: 'discountType', oldValue: invoice.discountType, newValue: data.discountType, changedBy: userId });
      invoice.discountType = data.discountType;
    }
    if (data.discountRate !== undefined) {
      changelog.push({ field: 'discountRate', oldValue: invoice.discountRate, newValue: data.discountRate, changedBy: userId });
      invoice.discountRate = data.discountRate;
    }
    if (data.discount !== undefined) {
      changelog.push({ field: 'discount', oldValue: invoice.discount, newValue: data.discount, changedBy: userId });
      invoice.discount = data.discount;
    }
    if (data.tax !== undefined) {
      changelog.push({ field: 'tax', oldValue: invoice.tax, newValue: data.tax, changedBy: userId });
      invoice.tax = data.tax;
    }
    if (data.taxRate !== undefined) {
      changelog.push({ field: 'taxRate', oldValue: invoice.taxRate, newValue: data.taxRate, changedBy: userId });
      invoice.taxRate = data.taxRate;
    }
    if (data.dueDate !== undefined) {
      changelog.push({ field: 'dueDate', oldValue: invoice.dueDate, newValue: data.dueDate, changedBy: userId });
      invoice.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }
    if (data.notes !== undefined) {
      changelog.push({ field: 'notes', oldValue: invoice.notes, newValue: data.notes, changedBy: userId });
      invoice.notes = data.notes;
    }

    if (changelog.length > 0) {
      invoice.changelog.push(...changelog);
    }

    await invoice.save({ session });

    // Money invariant: a partial/unpaid invoice must never end up overpaid
    // after a total reduction.
    if (invoice.paidAmount > round2(invoice.total) + 0.01) {
      throw ApiError.badRequest(
        `Total (${invoice.total.toFixed(2)}) cannot be less than the amount already paid (${invoice.paidAmount.toFixed(2)})`,
      );
    }

    return invoice;
  });

  await result.populate(POPULATE);
  return result;
}

/**
 * Apply a payment to an invoice inside an already-open transaction session.
 *
 * Shared by `addPayment` (REST) and `payInstallment` (installment plan pay),
 * which both run inside a `withTransaction` block, so the invoice ledger and
 * the plan ledger stay consistent. Handles the idempotency check, balance
 * guards, payment push, status-transition changelog, optional wallet debit,
 * and commission accrual on full payment.
 *
 * Race-condition guard: the invoice is ALWAYS re-read inside the session
 * (optimistic read) so two concurrent requests cannot both pass the balance
 * check. An idempotency key is checked atomically inside the same transaction
 * to prevent duplicate charges.
 */
export async function applyInvoicePayment(
  {
    invoiceId,
    branchFilter,
    amount,
    method,
    reference,
    date,
    notes,
    idempotencyKey,
    userId,
    skipWalletDebit = false,
  },
  session,
) {
  if (!mongoose.isValidObjectId(invoiceId)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  // ALWAYS read inside the transaction — this is the race-condition fix.
  const fresh = await Invoice.findOne({ _id: invoiceId, ...branchFilter }).session(session);
  if (!fresh) {
    throw ApiError.notFound('Invoice not found');
  }
  if (fresh.status === 'void') {
    throw ApiError.conflict('Cannot record a payment on a void invoice');
  }

  // Idempotency: check INSIDE the transaction and BEFORE the balance guard so
  // replaying the idempotency key of the completing payment returns the
  // idempotent result instead of a confusing "already fully paid" 409.
  if (idempotencyKey) {
    const exists = (fresh.payments || []).some(
      (p) => p.idempotencyKey && p.idempotencyKey === idempotencyKey,
    );
    if (exists) {
      await fresh.populate(POPULATE);
      return { invoice: fresh, idempotent: true };
    }
  }

  const balance = round2(fresh.total - fresh.paidAmount);
  if (balance <= 0) {
    throw ApiError.conflict('This invoice is already fully paid');
  }

  // BR-BL-03: a payment larger than the outstanding balance is not rejected.
  // The balance-clearing portion is applied to the invoice and the excess is
  // automatically credited to the patient's wallet.
  const applied = Math.min(amount, balance);
  const excess = round2(amount - applied);

  const statusBefore = fresh.status;

  // Push payment
  fresh.payments.push({
    amount: applied,
    method,
    reference: reference || '',
    idempotencyKey: idempotencyKey || undefined,
    date: date ? new Date(date) : new Date(),
    notes: notes || '',
    recordedBy: userId,
  });

  // save() will recompute totals via pre-validate hook.
  // __v increment provides optimistic concurrency.
  await fresh.save({ session });

  if (fresh.status !== statusBefore) {
    fresh.changelog.push({
      field: 'status',
      oldValue: statusBefore,
      newValue: fresh.status,
      changedBy: userId,
    });
    await fresh.save({ session });
  }

  // Wallet debit — atomic within the same transaction. The installment flow
  // already debits the wallet itself, so it passes skipWalletDebit: true.
  // BR-BL-03: any overpayment excess is auto-credited to the wallet.
  if ((method === 'wallet' && !skipWalletDebit) || excess >= 0.01) {
    const patient = await Patient.findOne({ _id: fresh.patient }).session(session);
    if (!patient) throw ApiError.badRequest('Patient not found for wallet payment');
    if (method === 'wallet' && !skipWalletDebit) {
      await addTransaction(patient, {
        type: 'debit',
        amount: applied,
        reference: reference || fresh.invoiceNo,
        description: notes || `Payment for invoice ${fresh.invoiceNo}`,
        invoice: fresh._id,
      }, userId, session);
    }
    if (excess >= 0.01) {
      await addTransaction(patient, {
        type: 'credit',
        amount: excess,
        reference: reference || fresh.invoiceNo,
        description: notes
          ? `${notes} — overpayment credited to wallet`
          : `Overpayment auto-credit for invoice ${fresh.invoiceNo}`,
        invoice: fresh._id,
      }, userId, session);
    }
  }

  // Commission — accrue ONCE, when the invoice is FULLY paid, based on the
  // full invoice total. Partial payments never create or grow a commission,
  // so totals can't over/under-accrue across instalments (ISSUE-014).
  if (fresh.status === 'paid') {
    await accrueCommissionForInvoice(fresh, session, userId);
  }

  // BR-BL-05: double-entry record of the collected money. The applied portion
  // is revenue; an overpayment excess sits in the patient's wallet (liability)
  // rather than revenue until it is spent.
  const paymentLines = [
    { account: accountForMethod(method), debit: applied, memo: method },
    { account: 'revenue', credit: applied, memo: fresh.invoiceNo },
  ];
  // Overpaid cash/card sits as a wallet liability until spent (a wallet-method
  // payment never leaves the wallet, so nothing moves).
  if (excess >= 0.01 && method !== 'wallet') {
    paymentLines.push({ account: accountForMethod(method), debit: excess });
    paymentLines.push({ account: 'wallet_clearing', credit: excess, memo: 'overpayment' });
  }
  await postJournalEntry(
    {
      tenant: fresh.tenant,
      branch: fresh.branch,
      date: date ? new Date(date) : new Date(),
      sourceType: 'payment',
      sourceId: fresh._id,
      sourceModel: 'Invoice',
      description: `Invoice ${fresh.invoiceNo} payment (${method})`,
      lines: paymentLines,
      userId,
    },
    session,
  );

  return fresh;
}

/**
 * Add a payment to an invoice inside a transaction.
 */
export async function addPayment(id, branchFilter, { amount, method, reference, date, notes, idempotencyKey, userId }) {
  const result = await withTransaction(async (session) =>
    applyInvoicePayment(
      {
        invoiceId: id,
        branchFilter,
        amount,
        method,
        reference,
        date,
        notes,
        idempotencyKey,
        userId,
      },
      session,
    ),
  );

  if (result.idempotent) {
    await result.invoice.populate(POPULATE);
    return result.invoice;
  }

  await result.populate(POPULATE);
  return result;
}

/**
 * Compute the net wallet amount to reverse when an invoice is voided.
 *
 * Wallet refunds were already credited back to the wallet when they were
 * recorded, so they are subtracted from the original wallet payments to
 * avoid double-crediting the wallet balance (refund-then-void).
 */
export function netWalletReversal(payments) {
  const walletReceived = (payments || [])
    .filter((p) => p.method === 'wallet' && !p.isRefund)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const walletRefunded = (payments || [])
    .filter((p) => p.method === 'wallet' && p.isRefund)
    .reduce((sum, p) => sum + Math.abs(Number(p.amount) || 0), 0);
  return round2(Math.max(0, walletReceived - walletRefunded));
}

/**
 * Void an invoice inside a transaction.
 * Reverses wallet debits and voids commission records atomically.
 */
export async function voidInvoice(id, branchFilter, { reason, userId } = {}) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const result = await withTransaction(async (session) => {
    const invoice = await Invoice.findOne({ _id: id, ...branchFilter }).session(session);
    if (!invoice) {
      throw ApiError.notFound('Invoice not found');
    }

    if (invoice.status === 'void') {
      await invoice.populate(POPULATE);
      return invoice;
    }

    const previousStatus = invoice.status;

    // Calculate the net wallet-paid amount to reverse. Wallet refunds were
    // already credited back to the wallet when they were recorded, so subtract
    // them here to avoid double-crediting the balance on void.
    const walletPaid = netWalletReversal(invoice.payments);

    // Record the non-wallet collected amount (cash/card/bank/check) that was
    // actually received before voiding. Wallet debits are reversed back to the
    // wallet, but these were real external payments — this entry preserves the
    // figure in the audit trail so accounting can see what was collected from
    // the voided sale instead of silently erasing it.
    const nonWalletCollected = round2(
      (invoice.payments || [])
        .filter((p) => p.method !== 'wallet' && !p.isRefund)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    );

    invoice.status = 'void';
    invoice.changelog.push({
      field: 'status',
      oldValue: previousStatus,
      newValue: 'void',
      reason: reason || '',
      changedBy: userId || null,
    });
    if (nonWalletCollected > 0) {
      invoice.changelog.push({
        field: 'collectedAmount',
        oldValue: nonWalletCollected,
        newValue: 0,
        reason: `Voided invoice ${invoice.invoiceNo}`,
        changedBy: userId || null,
      });
    }
    await invoice.save({ session });

    // Reverse wallet debits
    if (walletPaid > 0) {
      const patient = await Patient.findOne({ _id: invoice.patient }).session(session);
      if (patient) {
        await addTransaction(patient, {
          type: 'credit',
          amount: walletPaid,
          reference: invoice.invoiceNo,
          description: `Reversal for voided invoice ${invoice.invoiceNo}`,
          invoice: invoice._id,
        }, userId || null, session);
      }
    }

    // Void associated commission records
    await Commission.updateMany(
      { invoice: invoice._id, status: { $ne: 'void' } },
      { $set: { status: 'void' } },
      { session },
    );

    return invoice;
  });

  await result.populate(POPULATE);
  return result;
}

/**
 * Refund a payment on an invoice inside a transaction.
 *
 * Idempotency check is performed INSIDE the transaction to prevent
 * duplicate refunds from concurrent requests.
 */
export async function refundPayment(id, branchFilter, { amount, method, reference, date, notes, idempotencyKey, userId }) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const result = await withTransaction(async (session) => {
    const invoice = await Invoice.findOne({ _id: id, ...branchFilter }).session(session);
    if (!invoice) {
      throw ApiError.notFound('Invoice not found');
    }
    if (invoice.status === 'void') {
      throw ApiError.conflict('Cannot refund a void invoice');
    }

    // Idempotency: check INSIDE the transaction
    if (idempotencyKey) {
      const exists = invoice.payments.some(
        (p) => p.idempotencyKey && p.idempotencyKey === idempotencyKey && p.isRefund,
      );
      if (exists) {
        await invoice.populate(POPULATE);
        return { invoice, idempotent: true };
      }
    }

    const refundAmount = round2(Math.abs(amount));
    if (refundAmount <= 0) {
      throw ApiError.badRequest('Refund amount must be greater than 0');
    }
    // Strict comparison (both sides already rounded to cents): refunding more
    // than paidAmount would push paidAmount negative and fail the model's
    // min: 0 guard with a 500. Reject it cleanly instead.
    if (refundAmount > round2(invoice.paidAmount)) {
      throw ApiError.badRequest(
        `Refund cannot exceed total paid amount (${invoice.paidAmount.toFixed(2)})`,
        { amount: 'exceeds paid amount' },
      );
    }

    // Determine refund method
    const nonRefundPayments = (invoice.payments || []).filter((p) => !p.isRefund && p.amount > 0);
    let refundMethod = method;
    if (!refundMethod) {
      refundMethod = nonRefundPayments.length > 0
        ? nonRefundPayments[nonRefundPayments.length - 1].method
        : 'cash';
    }

    let hasWalletPayment = false;
    if (refundMethod === 'wallet') {
      hasWalletPayment = nonRefundPayments.some((p) => p.method === 'wallet');
      if (!hasWalletPayment) {
        refundMethod = 'cash';
      }
    }

    const shouldCreditWallet = refundMethod === 'wallet' && hasWalletPayment;

    invoice.payments.push({
      amount: -refundAmount,
      method: refundMethod,
      reference: reference || '',
      idempotencyKey: idempotencyKey || undefined,
      date: date ? new Date(date) : new Date(),
      notes: notes || 'Refund',
      recordedBy: userId,
      isRefund: true,
    });

    invoice.changelog.push({
      field: 'refund',
      oldValue: null,
      newValue: { amount: refundAmount, method: refundMethod, reason: notes || 'Refund' },
      changedBy: userId,
    });

    await invoice.save({ session });

    // Credit wallet
    if (shouldCreditWallet) {
      const patient = await Patient.findOne({ _id: invoice.patient }).session(session);
      if (patient) {
        await addTransaction(patient, {
          type: 'credit',
          amount: refundAmount,
          reference: reference || invoice.invoiceNo,
          description: notes || `Refund for invoice ${invoice.invoiceNo}`,
          invoice: invoice._id,
        }, userId, session);
      }
    }

    // BR-BL-05: reverse the money movement — refunds hit the dedicated
    // 'refunds' account, not revenue.
    await postJournalEntry(
      {
        tenant: invoice.tenant,
        branch: invoice.branch,
        date: date ? new Date(date) : new Date(),
        sourceType: 'refund',
        sourceId: invoice._id,
        sourceModel: 'Invoice',
        description: `Refund for invoice ${invoice.invoiceNo} (${refundMethod})`,
        lines: [
          { account: 'refunds', debit: refundAmount, memo: invoice.invoiceNo },
          {
            account: shouldCreditWallet ? 'wallet_clearing' : accountForMethod(refundMethod),
            credit: refundAmount,
            memo: refundMethod,
          },
        ],
        userId,
      },
      session,
    );

    // Adjust commissions (BR-BL-02: one record per invoice line item).
    const totalPaidBeforeRefund = round2(
      (invoice.payments || [])
        .filter((p) => !p.isRefund)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    );
    if (totalPaidBeforeRefund > 0) {
      const commissions = await Commission.find({ invoice: invoice._id }).session(session);
      for (const commission of commissions) {
        const refundRatio = refundAmount / totalPaidBeforeRefund;
        if (refundRatio >= 0.999) {
          commission.status = 'void';
          await commission.save({ session });
        } else {
          commission.baseAmount = round2(commission.baseAmount * (1 - refundRatio));
          await commission.save({ session });
        }
      }
    }

    return invoice;
  });

  if (result.idempotent) {
    await result.invoice.populate(POPULATE);
    return result.invoice;
  }

  await result.populate(POPULATE);
  return result;
}

export async function getInvoiceAging(branchFilter) {
  const baseFilter = { ...branchFilter, status: { $in: ['unpaid', 'partial'] } };
  const now = new Date();

  const [agingAgg, invoices] = await Promise.all([
    Invoice.aggregate([
      { $match: baseFilter },
      {
        $project: {
          balance: { $subtract: ['$total', '$paidAmount'] },
          dueDate: 1,
        },
      },
      {
        $addFields: {
          bucket: {
            $cond: [
              { $or: [{ $not: '$dueDate' }, { $gte: ['$dueDate', now] }] },
              'current',
              {
                $cond: [
                  { $lte: [{ $divide: [{ $subtract: [now, '$dueDate'] }, 86400000] }, 30] },
                  'overdue1to30',
                  {
                    $cond: [
                      { $lte: [{ $divide: [{ $subtract: [now, '$dueDate'] }, 86400000] }, 60] },
                      'overdue31to60',
                      'overdue61Plus',
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$bucket',
          count: { $sum: 1 },
          amount: { $sum: '$balance' },
        },
      },
    ]),
    Invoice.find({ ...baseFilter, dueDate: { $lt: now } })
      .select('invoiceNo patient total paidAmount dueDate status')
      .populate('patient', 'firstName lastName phone')
      .sort('dueDate')
      .lean(),
  ]);

  const aging = {
    current: { count: 0, amount: 0 },
    overdue1to30: { count: 0, amount: 0 },
    overdue31to60: { count: 0, amount: 0 },
    overdue61Plus: { count: 0, amount: 0 },
    total: { count: 0, amount: 0 },
  };

  for (const row of agingAgg) {
    if (aging[row._id]) {
      aging[row._id] = { count: row.count, amount: round2(row.amount) };
      aging.total.count += row.count;
      aging.total.amount = round2(aging.total.amount + row.amount);
    }
  }

  return { aging, invoices };
}
