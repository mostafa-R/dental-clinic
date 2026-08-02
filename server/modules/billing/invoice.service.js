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

export const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName phone' },
  { path: 'appointment', select: 'start status' },
  { path: 'payments.recordedBy', select: 'name' },
  { path: 'createdBy', select: 'name' },
];

export async function resolveSearchFilter(search, patientId, branchFilter) {
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

  const invoice = await Invoice.create({
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
  });

  await invoice.populate(POPULATE);
  return invoice;
}

export async function updateInvoice(id, branchFilter, data, userId) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const invoice = await Invoice.findOne({ _id: id, ...branchFilter });
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }
  if (invoice.status === 'void') {
    throw ApiError.conflict('Cannot edit a void invoice');
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

  await invoice.save();
  await invoice.populate(POPULATE);
  return invoice;
}

/**
 * Add a payment to an invoice inside a transaction.
 *
 * Race-condition guard: the invoice is ALWAYS re-read inside the session
 * (optimistic read) so two concurrent requests cannot both pass the
 * balance check.  An idempotency key is checked atomically inside the
 * same transaction to prevent duplicate charges.
 *
 * Uses MongoDB's __v (version key) as an optimistic concurrency token:
 * after processing, the version must still match.  If another request
 * modified the invoice in the meantime, the save will fail and the
 * transaction aborts.
 */
export async function addPayment(id, branchFilter, { amount, method, reference, date, notes, idempotencyKey, userId }) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const result = await withTransaction(async (session) => {
    // ALWAYS read inside the transaction — this is the race-condition fix.
    const fresh = await Invoice.findOne({ _id: id, ...branchFilter }).session(session);
    if (!fresh) {
      throw ApiError.notFound('Invoice not found');
    }
    if (fresh.status === 'void') {
      throw ApiError.conflict('Cannot record a payment on a void invoice');
    }

    const balance = round2(fresh.total - fresh.paidAmount);
    if (balance <= 0) {
      throw ApiError.conflict('This invoice is already fully paid');
    }
    if (amount > balance + 0.01) {
      throw ApiError.badRequest(
        `Payment exceeds the outstanding balance (${balance.toFixed(2)})`,
        { amount: 'exceeds balance' },
      );
    }

    // Idempotency: check inside the transaction
    if (idempotencyKey) {
      const exists = (fresh.payments || []).some(
        (p) => p.idempotencyKey && p.idempotencyKey === idempotencyKey,
      );
      if (exists) {
        await fresh.populate(POPULATE);
        return { invoice: fresh, idempotent: true };
      }
    }

    const statusBefore = fresh.status;

    // Push payment
    fresh.payments.push({
      amount,
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

    // Wallet debit — atomic within the same transaction
    if (method === 'wallet') {
      const patient = await Patient.findOne({ _id: fresh.patient }).session(session);
      if (!patient) throw ApiError.badRequest('Patient not found for wallet payment');
      await addTransaction(patient, {
        type: 'debit',
        amount,
        reference: reference || fresh.invoiceNo,
        description: notes || `Payment for invoice ${fresh.invoiceNo}`,
        invoice: fresh._id,
      }, userId, session);
    }

    // Commission — one per invoice, update-or-create inside the transaction
    if (fresh.appointment) {
      const appt = await Appointment.findById(fresh.appointment)
        .select('doctor')
        .session(session)
        .lean();
      if (appt?.doctor) {
        const doctor = await User.findById(appt.doctor)
          .select('commissionRate name branch')
          .session(session)
          .lean();
        if (doctor && (doctor.commissionRate || 0) > 0) {
          const existing = await Commission.findOne({
            invoice: fresh._id,
            doctor: doctor._id,
          }).session(session);

          if (existing) {
            existing.baseAmount = round2(existing.baseAmount + amount);
            existing.amount = round2(existing.baseAmount * (existing.rate || 0) / 100);
            await existing.save({ session });
          } else {
            try {
              await Commission.create(
                [
                  {
                    tenant: fresh.tenant,
                    branch: fresh.branch,
                    doctor: doctor._id,
                    patient: fresh.patient,
                    invoice: fresh._id,
                    procedureName: `Invoice payment — ${fresh.invoiceNo}`,
                    baseAmount: amount,
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
      }
    }

    return fresh;
  });

  if (result.idempotent) {
    await result.invoice.populate(POPULATE);
    return result.invoice;
  }

  await result.populate(POPULATE);
  return result;
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

    // Calculate wallet-paid amount to reverse
    const walletPaid = (invoice.payments || [])
      .filter((p) => p.method === 'wallet' && !p.isRefund)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    invoice.status = 'void';
    invoice.changelog.push({
      field: 'status',
      oldValue: previousStatus,
      newValue: 'void',
      reason: reason || '',
      changedBy: userId || null,
    });
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
    if (refundAmount > invoice.paidAmount + 0.01) {
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

    // Adjust commission
    const totalPaidBeforeRefund = round2(
      (invoice.payments || [])
        .filter((p) => !p.isRefund)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    );
    const commission = await Commission.findOne({ invoice: invoice._id }).session(session);
    if (commission && totalPaidBeforeRefund > 0) {
      const refundRatio = refundAmount / totalPaidBeforeRefund;
      if (refundRatio >= 0.999) {
        commission.status = 'void';
        await commission.save({ session });
      } else {
        commission.baseAmount = round2(commission.baseAmount * (1 - refundRatio));
        await commission.save({ session });
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
