import mongoose from 'mongoose';

import Invoice from '../models/Invoice.js';
import { round2 } from '../constants/accounting.js';
import Patient from '../models/Patient.js';
import Wallet from '../models/Wallet.js';
import Commission from '../models/Commission.js';
import Appointment from '../models/Appointment.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { currentTenant, filterByBranch, resolveBranchForCreate, toObjectId } from '../utils/branchScope.js';
import { emitToBranch } from '../socket/index.js';
import { sendSuccess } from '../utils/sendSuccess.js';
import { escapeRegex } from '../utils/escapeRegex.js';

const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName phone' },
  { path: 'appointment', select: 'start status' },
  { path: 'payments.recordedBy', select: 'name' },
  { path: 'createdBy', select: 'name' },
];

/**
 * Resolve a search term into an invoice filter. Matches the invoice number
 * directly, or any patient whose name/id/phone matches the term.
 */
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

function emitInvoice(branchId, event, invoice) {
  const payload = {
    invoice: invoice.toJSON ? invoice.toJSON() : invoice,
  };
  emitToBranch(branchId, event, payload);
}

export const listInvoices = asyncHandler(async (req, res) => {
  const { search, status, patient, appointment, page, limit } = req.validatedQuery;

  const branchFilter = filterByBranch(req);
  const filter = { ...branchFilter };
  Object.assign(filter, await resolveSearchFilter(search, patient, branchFilter));
  if (status) filter.status = status;
  if (appointment) filter.appointment = toObjectId(appointment);

  const skip = (page - 1) * limit;
  const [invoices, total] = await Promise.all([
    Invoice.find(filter).populate(POPULATE).sort('-createdAt').skip(skip).limit(limit),
    Invoice.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    invoices,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getBillingSummary = asyncHandler(async (req, res) => {
  const baseFilter = { ...filterByBranch(req), status: { $ne: 'void' } };

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

  return sendSuccess(res, {
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
  });
});

export const getInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const invoice = await Invoice.findOne({ _id: id, ...filterByBranch(req) }).populate(POPULATE);
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }

  return sendSuccess(res, { invoice });
});

export const createInvoice = asyncHandler(async (req, res) => {
  const data = req.validatedBody;

  // Derive branch from the linked appointment if not explicitly provided.
  if (!data.branch && data.appointment) {
    const Appointment = (await import('../models/Appointment.js')).default;
    const appt = await Appointment.findById(data.appointment).select('branch').lean();
    if (appt?.branch) data.branch = String(appt.branch);
  }

  const branch = await resolveBranchForCreate(req, data.branch);
  const tenant = currentTenant(req);

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
    createdBy: req.user._id,
  });

  await invoice.populate(POPULATE);
  emitInvoice(branch, 'invoice:created', invoice);

  return sendSuccess(res, { invoice }, 201);
});

export const updateInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const branchFilter = filterByBranch(req);
  const data = req.validatedBody;

  const invoice = await Invoice.findOne({ _id: id, ...branchFilter });
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }
  if (invoice.status === 'void') {
    throw ApiError.conflict('Cannot edit a void invoice');
  }

  const changelog = [];

  if (data.items !== undefined) {
    changelog.push({ field: 'items', oldValue: invoice.items.length + ' items', newValue: data.items.length + ' items', changedBy: req.user._id });
    invoice.items = data.items;
  }
  if (data.discountType !== undefined) {
    changelog.push({ field: 'discountType', oldValue: invoice.discountType, newValue: data.discountType, changedBy: req.user._id });
    invoice.discountType = data.discountType;
  }
  if (data.discountRate !== undefined) {
    changelog.push({ field: 'discountRate', oldValue: invoice.discountRate, newValue: data.discountRate, changedBy: req.user._id });
    invoice.discountRate = data.discountRate;
  }
  if (data.discount !== undefined) {
    changelog.push({ field: 'discount', oldValue: invoice.discount, newValue: data.discount, changedBy: req.user._id });
    invoice.discount = data.discount;
  }
  if (data.tax !== undefined) {
    changelog.push({ field: 'tax', oldValue: invoice.tax, newValue: data.tax, changedBy: req.user._id });
    invoice.tax = data.tax;
  }
  if (data.taxRate !== undefined) {
    changelog.push({ field: 'taxRate', oldValue: invoice.taxRate, newValue: data.taxRate, changedBy: req.user._id });
    invoice.taxRate = data.taxRate;
  }
  if (data.dueDate !== undefined) {
    changelog.push({ field: 'dueDate', oldValue: invoice.dueDate, newValue: data.dueDate, changedBy: req.user._id });
    invoice.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  }
  if (data.notes !== undefined) {
    changelog.push({ field: 'notes', oldValue: invoice.notes, newValue: data.notes, changedBy: req.user._id });
    invoice.notes = data.notes;
  }

  if (changelog.length > 0) {
    invoice.changelog.push(...changelog);
  }

  await invoice.save();
  await invoice.populate(POPULATE);

  emitInvoice(invoice.branch, 'invoice:updated', invoice);

  return sendSuccess(res, { invoice });
});

export const addPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const branchFilter = filterByBranch(req);
  const { amount, method, reference, date, notes } = req.validatedBody;
  const idempotencyKey = req.headers['x-idempotency-key'] || null;

  const invoice = await Invoice.findOne({ _id: id, ...branchFilter });
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }
  if (invoice.status === 'void') {
    throw ApiError.conflict('Cannot record a payment on a void invoice');
  }

  // Idempotency check — reject duplicate submissions
  if (idempotencyKey) {
    const exists = (invoice.payments || []).some(
      (p) => p.idempotencyKey && p.idempotencyKey === idempotencyKey,
    );
    if (exists) {
      await invoice.populate(POPULATE);
      return sendSuccess(res, { invoice, idempotent: true });
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

  // Wallet balance check before starting the transaction
  if (method === 'wallet') {
    const wallet = await Wallet.findOne({ patient: invoice.patient });
    if (!wallet || wallet.balance < amount) {
      throw ApiError.badRequest('Insufficient wallet balance');
    }
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // 1. Add payment to invoice (computeTotals in pre-validate hook
    //    recalculates paidAmount and status automatically)
    invoice.payments.push({
      amount,
      method,
      reference: reference || '',
      idempotencyKey: idempotencyKey || undefined,
      date: date ? new Date(date) : new Date(),
      notes: notes || '',
      recordedBy: req.user._id,
    });
    await invoice.save({ session });

    // 2. Wallet deduction when method is "wallet"
    if (method === 'wallet') {
      const wallet = await Wallet.findOne({ patient: invoice.patient }).session(session);
      if (wallet) {
        wallet.addTransaction({
          type: 'debit',
          amount,
          reference: reference || invoice.invoiceNo,
          description: notes || `Payment for invoice ${invoice.invoiceNo}`,
          invoice: invoice._id,
          userId: req.user._id,
        });
        await wallet.save({ session });
      }
    }

    // 3. Auto-create commission if the invoice has a doctor-linked appointment
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
                createdBy: req.user._id,
              },
            ],
            { session },
          );
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

  emitInvoice(invoice.branch, 'invoice:updated', invoice);

  return sendSuccess(res, { invoice });
});

export const voidInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const branchFilter = filterByBranch(req);
  const invoice = await Invoice.findOne({ _id: id, ...branchFilter });
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }

  if (invoice.status === 'void') {
    await invoice.populate(POPULATE);
    return sendSuccess(res, { invoice });
  }

  invoice.status = 'void';
  await invoice.save();
  await invoice.populate(POPULATE);

  emitInvoice(invoice.branch, 'invoice:updated', invoice);

  return sendSuccess(res, { invoice });
});

export const refundPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid invoice id');
  }

  const branchFilter = filterByBranch(req);
  const { amount, method, reference, date, notes } = req.validatedBody;

  const invoice = await Invoice.findOne({ _id: id, ...branchFilter });
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }
  if (invoice.status === 'void') {
    throw ApiError.conflict('Cannot refund a void invoice');
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

  invoice.payments.push({
    amount: -refundAmount,
    method: method || 'cash',
    reference: reference || '',
    date: date ? new Date(date) : new Date(),
    notes: notes || 'Refund',
    recordedBy: req.user._id,
    isRefund: true,
  });

  invoice.changelog.push({
    field: 'refund',
    oldValue: null,
    newValue: { amount: refundAmount, reason: notes || 'Refund' },
    changedBy: req.user._id,
  });

  await invoice.save();
  await invoice.populate(POPULATE);

  emitInvoice(invoice.branch, 'invoice:updated', invoice);

  return sendSuccess(res, { invoice });
});

export const getInvoiceAging = asyncHandler(async (req, res) => {
  const baseFilter = { ...filterByBranch(req), status: { $in: ['unpaid', 'partial'] } };

  const now = new Date();
  const invoices = await Invoice.find(baseFilter).select('invoiceNo patient total paidAmount dueDate status createdAt').populate('patient', 'firstName lastName phone').lean();

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

  return sendSuccess(res, { aging, invoices });
});
