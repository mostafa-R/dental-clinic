import mongoose from 'mongoose';

import Invoice from './invoice.model.js';
import Patient from '../patients/patient.model.js';
import Wallet from '../patients/wallet.model.js';
import Commission from './commission.model.js';
import Appointment from '../appointments/appointment.model.js';
import User from '../users/user.model.js';
import ApiError from '../../utils/ApiError.js';
import { toObjectId } from '../../utils/branchScope.js';
import { round2 } from '../../constants/accounting.js';
import { escapeRegex } from '../../utils/escapeRegex.js';

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

  const invoice = await Invoice.create({
    patient: toObjectId(data.patient),
    branch,
    tenant,
    appointment: data.appointment ? toObjectId(data.appointment) : null,
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

export async function addPayment(id, branchFilter, { amount, method, reference, date, notes, idempotencyKey, userId }) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const invoice = await Invoice.findOne({ _id: id, ...branchFilter });
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }
  if (invoice.status === 'void') {
    throw ApiError.conflict('Cannot record a payment on a void invoice');
  }

  if (idempotencyKey) {
    const exists = (invoice.payments || []).some(
      (p) => p.idempotencyKey && p.idempotencyKey === idempotencyKey,
    );
    if (exists) {
      await invoice.populate(POPULATE);
      return { invoice, idempotent: true };
    }
  }

  const balance = round2(invoice.total - invoice.paidAmount);
  if (balance <= 0) {
    throw ApiError.conflict('This invoice is already fully paid');
  }
  if (amount > balance + 0.01) {
    throw ApiError.badRequest(
      `Payment exceeds the outstanding balance (${balance.toFixed(2)})`,
      { amount: 'exceeds balance' },
    );
  }

  if (method === 'wallet') {
    // Balance check is done inside the transaction (see below) to prevent TOCTOU.
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    invoice.payments.push({
      amount,
      method,
      reference: reference || '',
      idempotencyKey: idempotencyKey || undefined,
      date: date ? new Date(date) : new Date(),
      notes: notes || '',
      recordedBy: userId,
    });
    await invoice.save({ session });

    if (method === 'wallet') {
      const wallet = await Wallet.findOne({ patient: invoice.patient }).session(session);
      if (!wallet || wallet.balance < amount) {
        throw ApiError.badRequest('Insufficient wallet balance');
      }
      wallet.addTransaction({
        type: 'debit',
        amount,
        reference: reference || invoice.invoiceNo,
        description: notes || `Payment for invoice ${invoice.invoiceNo}`,
        invoice: invoice._id,
        userId,
      });
      await wallet.save({ session });
    }

    if (invoice.appointment) {
      const appt = await Appointment.findById(invoice.appointment)
        .select('doctor')
        .session(session)
        .lean();
      if (appt?.doctor) {
        const doctor = await User.findById(appt.doctor)
          .select('commissionRate name branch')
          .session(session)
          .lean();
        if (doctor && (doctor.commissionRate || 0) > 0) {
          // One commission per invoice — update if it already exists.
          const existing = await Commission.findOne({
            invoice: invoice._id,
            doctor: doctor._id,
          }).session(session);

          if (existing) {
            existing.baseAmount = round2(existing.baseAmount + amount);
            await existing.save({ session });
          } else {
            await Commission.create(
              [
                {
                  tenant: invoice.tenant,
                  branch: invoice.branch,
                  doctor: doctor._id,
                  patient: invoice.patient,
                  invoice: invoice._id,
                  procedureName: `Invoice payment — ${invoice.invoiceNo}`,
                  baseAmount: amount,
                  rate: doctor.commissionRate,
                  createdBy: userId,
                },
              ],
              { session },
            );
          }
        }
      }
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  await invoice.populate(POPULATE);
  return invoice;
}

export async function voidInvoice(id, branchFilter, { reason, userId } = {}) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const invoice = await Invoice.findOne({ _id: id, ...branchFilter });
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

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

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
      const wallet = await Wallet.findOne({ patient: invoice.patient }).session(session);
      if (wallet) {
        wallet.addTransaction({
          type: 'credit',
          amount: walletPaid,
          reference: invoice.invoiceNo,
          description: `Reversal for voided invoice ${invoice.invoiceNo}`,
          invoice: invoice._id,
        });
        await wallet.save({ session });
      }
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  await invoice.populate(POPULATE);
  return invoice;
}

export async function refundPayment(id, branchFilter, { amount, method, reference, date, notes, idempotencyKey, userId }) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const invoice = await Invoice.findOne({ _id: id, ...branchFilter });
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }
  if (invoice.status === 'void') {
    throw ApiError.conflict('Cannot refund a void invoice');
  }

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

  // Determine refund method: default to the original payment method if not specified.
  const nonRefundPayments = (invoice.payments || []).filter((p) => !p.isRefund && p.amount > 0);
  let refundMethod = method;
  if (!refundMethod) {
    // Prefer the last payment method used, falling back to cash.
    refundMethod = nonRefundPayments.length > 0
      ? nonRefundPayments[nonRefundPayments.length - 1].method
      : 'cash';
  }

  // Validate that wallet refunds only happen when there were wallet payments.
  if (refundMethod === 'wallet') {
    const hasWalletPayment = nonRefundPayments.some((p) => p.method === 'wallet');
    if (!hasWalletPayment) {
      // Fall back to cash if no wallet payment was made.
      refundMethod = 'cash';
    }
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

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

    // Credit wallet only when the refund method is wallet.
    if (refundMethod === 'wallet') {
      const wallet = await Wallet.findOne({ patient: invoice.patient }).session(session);
      if (wallet) {
        wallet.addTransaction({
          type: 'credit',
          amount: refundAmount,
          reference: reference || invoice.invoiceNo,
          description: notes || `Refund for invoice ${invoice.invoiceNo}`,
          invoice: invoice._id,
          userId,
        });
        await wallet.save({ session });
      }
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  await invoice.populate(POPULATE);
  return invoice;
}

export async function getInvoiceAging(branchFilter) {
  const baseFilter = { ...branchFilter, status: { $in: ['unpaid', 'partial'] } };

  const now = new Date();
  const invoices = await Invoice.find(baseFilter)
    .select('invoiceNo patient total paidAmount dueDate status createdAt')
    .populate('patient', 'firstName lastName phone')
    .lean();

  const aging = {
    current: { count: 0, amount: 0 },
    overdue1to30: { count: 0, amount: 0 },
    overdue31to60: { count: 0, amount: 0 },
    overdue61Plus: { count: 0, amount: 0 },
    total: { count: invoices.length, amount: 0 },
  };

  for (const inv of invoices) {
    const balance = round2(inv.total - inv.paidAmount);
    aging.total.amount = round2(aging.total.amount + balance);

    if (!inv.dueDate || new Date(inv.dueDate) >= now) {
      aging.current.count += 1;
      aging.current.amount = round2(aging.current.amount + balance);
    } else {
      const daysOverdue = Math.floor((now - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 30) {
        aging.overdue1to30.count += 1;
        aging.overdue1to30.amount = round2(aging.overdue1to30.amount + balance);
      } else if (daysOverdue <= 60) {
        aging.overdue31to60.count += 1;
        aging.overdue31to60.amount = round2(aging.overdue31to60.amount + balance);
      } else {
        aging.overdue61Plus.count += 1;
        aging.overdue61Plus.amount = round2(aging.overdue61Plus.amount + balance);
      }
    }
  }

  return { aging, invoices };
}
