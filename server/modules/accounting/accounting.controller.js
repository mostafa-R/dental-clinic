import mongoose from "mongoose";

import { round2 } from "../../constants/accounting.js";
import Commission from "../billing/commission.model.js";
import Expense from "./expense.model.js";
import Invoice from "../billing/invoice.model.js";
import OwnerDrawing from "./ownerDrawing.model.js";
import DayClose from "./dayClose.model.js";
import JournalEntry from "./journalEntry.model.js";
import Patient from "../patients/patient.model.js";
import User from "../users/user.model.js";
import { addTransaction } from "../patients/wallet.service.js";
import ApiError from "../../utils/ApiError.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { currentTenant, filterByBranch, resolveBranchForCreate, toObjectId } from "../../utils/branchScope.js";
import { sendSuccess } from "../../utils/sendSuccess.js";
import { withTransaction } from "../../core/transaction.js";
import { emitToBranch } from '../../socket/index.js';
import { stripPHI } from '../../middleware/phiRestrict.js';
import { postJournalEntry } from './journal.service.js';

function serializePHI(value, req) {
  if (!req.isImpersonation) return value;
  return value && typeof value.toJSON === 'function' ? stripPHI(value.toJSON()) : stripPHI(value);
}

/* ----------------------------------------------------------------- Expenses */

export const listExpenses = asyncHandler(async (req, res) => {
  const { page, limit, category, from, to } = req.validatedQuery;
  const filter = { ...filterByBranch(req), isActive: true };

  if (category) filter.category = category;
  const dateRange = {};
  if (from) dateRange.$gte = new Date(from);
  if (to) dateRange.$lte = new Date(to);
  if (Object.keys(dateRange).length) filter.date = dateRange;

  const skip = (page - 1) * limit;
  const [expenses, total] = await Promise.all([
    Expense.find(filter)
      .populate("recordedBy", "name")
      .sort("-date")
      .skip(skip)
      .limit(limit),
    Expense.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    expenses,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const createExpense = asyncHandler(async (req, res) => {
  const data = req.validatedBody;
  const branch = await resolveBranchForCreate(req, data.branch);
  const tenant = currentTenant(req);

  const expense = await withTransaction(async (session) => {
    const [expenseDoc] = await Expense.create([
      {
        branch,
        tenant,
        category: data.category,
        description: data.description,
        amount: data.amount,
        date: data.date ? new Date(data.date) : new Date(),
        paymentMethod: data.paymentMethod || "cash",
        recordedBy: req.user._id,
      },
    ], { session });

    // BR-BL-05: expenses leave cash/bank — debit the expense account.
    await postJournalEntry({
      tenant,
      branch,
      date: expenseDoc.date,
      sourceType: 'expense',
      sourceId: expenseDoc._id,
      sourceModel: 'Expense',
      description: `Expense ${expenseDoc.expenseNo || expenseDoc._id} — ${data.category}`,
      lines: [
        { account: 'expenses', debit: data.amount, memo: data.category },
        {
          account: (data.paymentMethod || 'cash') === 'cash' ? 'cash' : 'bank',
          credit: data.amount,
          memo: data.paymentMethod || 'cash',
        },
      ],
      userId: req.user._id,
    }, session);

    return expenseDoc;
  });

  await expense.populate("recordedBy", "name");

  emitToBranch(String(branch), 'expense:created', { expense });
  return sendSuccess(res, { expense }, 201);
});

export const deleteExpense = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest("Invalid expense id");
  }
  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id, ...filterByBranch(req), isActive: true },
    { $set: { isActive: false } },
    { returnDocument: "after" },
  );
  if (!expense) {
    throw ApiError.notFound("Expense not found");
  }
  emitToBranch(String(expense.branch), 'expense:deleted', { _id: expense._id });
  return sendSuccess(res, { message: "Expense deleted" });
});

/* ----------------------------------------------------------- Owner drawings */

export const listDrawings = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = req.validatedQuery;
  const filter = { ...filterByBranch(req), isActive: true };

  const dateRange = {};
  if (from) dateRange.$gte = new Date(from);
  if (to) dateRange.$lte = new Date(to);
  if (Object.keys(dateRange).length) filter.date = dateRange;

  const skip = (page - 1) * limit;
  const [drawings, total] = await Promise.all([
    OwnerDrawing.find(filter)
      .populate("owner", "name")
      .populate("recordedBy", "name")
      .sort("-date")
      .skip(skip)
      .limit(limit),
    OwnerDrawing.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    drawings,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const createDrawing = asyncHandler(async (req, res) => {
  const data = req.validatedBody;
  const tenant = currentTenant(req);

  const branch = await resolveBranchForCreate(req, data.branch);

  const owner = await User.findOne({ _id: data.owner, ...(tenant ? { tenant } : {}), ...(branch ? { branch } : {}) });
  if (!owner) {
    throw ApiError.badRequest("Referenced owner does not exist in this branch/tenant", {
      owner: "not found",
    });
  }

  // The referenced user must have an active role document with isSystemAdmin flag,
  // or be a clinic-level admin. This avoids hardcoded role string checks.
  if (owner.roleId) {
    const { default: Role } = await import('../users/role.model.js');
    const roleDoc = await Role.findById(owner.roleId).lean();
    if (!roleDoc || (!roleDoc.isSystemAdmin && !roleDoc.isBuiltIn)) {
      throw ApiError.badRequest("Referenced user must have an admin or system role");
    }
  } else if (!owner.isDoctor) {
    throw ApiError.badRequest("Referenced user must be a clinic admin or doctor");
  }

  const drawing = await withTransaction(async (session) => {
    const drawingDoc = await OwnerDrawing.create([{
      branch,
      tenant: currentTenant(req),
      owner: toObjectId(data.owner),
      patient: data.patient ? toObjectId(data.patient) : null,
      amount: data.amount,
      paymentMethod: data.paymentMethod || 'cash',
      description: data.description || "",
      date: data.date ? new Date(data.date) : new Date(),
      recordedBy: req.user._id,
    }], { session });

    const drawing = drawingDoc[0];

    // If drawing is from a patient's wallet, debit atomically
    if (data.paymentMethod === 'wallet' && data.patient) {
      const patient = await Patient.findOne({
        _id: data.patient,
        ...(tenant ? { tenant } : {}),
        ...(branch ? { branch } : {}),
      }).session(session);
      if (!patient) {
        throw ApiError.badRequest("Referenced patient does not exist in this branch/tenant", { patient: 'not found' });
      }

      await addTransaction(patient, {
        type: 'debit',
        amount: data.amount,
        reference: drawing.drawingNo,
        description: data.description || `Owner drawing ${drawing.drawingNo}`,
      }, req.user._id, session);
    }

    // BR-BL-05: owner drawings leave cash/bank (or a patient wallet).
    await postJournalEntry({
      tenant,
      branch,
      date: drawing.date,
      sourceType: 'drawing',
      sourceId: drawing._id,
      sourceModel: 'OwnerDrawing',
      description: `Owner drawing ${drawing.drawingNo} — ${owner.name}`,
      lines: [
        { account: 'owner_drawing', debit: data.amount, memo: data.paymentMethod || 'cash' },
        {
          account:
            (data.paymentMethod || 'cash') === 'wallet'
              ? 'wallet_clearing'
              : (data.paymentMethod || 'cash') === 'cash'
                ? 'cash'
                : 'bank',
          credit: data.amount,
          memo: data.paymentMethod || 'cash',
        },
      ],
      userId: req.user._id,
    }, session);

    await drawing.populate("owner", "name");
    return drawing;
  });

  emitToBranch(String(branch), 'drawing:created', { drawing });
  return sendSuccess(res, { drawing }, 201);
});

export const deleteDrawing = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest("Invalid drawing id");
  }

  const result = await withTransaction(async (session) => {
    const drawing = await OwnerDrawing.findOne({
      _id: req.params.id,
      ...filterByBranch(req),
      isActive: true,
    }).session(session);

    if (!drawing) {
      throw ApiError.notFound("Drawing not found");
    }

    drawing.isActive = false;
    await drawing.save({ session });

    // If the drawing was from a patient's wallet, credit the wallet back
    if (drawing.paymentMethod === 'wallet' && drawing.patient) {
      const patient = await Patient.findOne({
        _id: drawing.patient,
        ...(drawing.tenant ? { tenant: drawing.tenant } : {}),
        ...(drawing.branch ? { branch: drawing.branch } : {}),
      }).session(session);
      if (patient) {
        await addTransaction(patient, {
          type: 'credit',
          amount: drawing.amount,
          reference: drawing.drawingNo,
          description: `Reversal for voided drawing ${drawing.drawingNo}`,
        }, req.user._id, session);
      }
    }

    return drawing;
  });

  emitToBranch(String(result.branch || ''), 'drawing:deleted', { _id: req.params.id });
  return sendSuccess(res, { message: "Drawing deleted" });
});

/* --------------------------------------------------------------- Commission */

export const listCommissions = asyncHandler(async (req, res) => {
  const { page, limit, doctor, status } = req.validatedQuery;
  const filter = { ...filterByBranch(req) };

  if (doctor) filter.doctor = toObjectId(doctor);
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [commissions, total] = await Promise.all([
    Commission.find(filter)
      .populate("doctor", "name commissionRate")
      .populate("patient", "patientId firstName lastName")
      .populate("invoice", "invoiceNo")
      .sort("-createdAt")
      .skip(skip)
      .limit(limit),
    Commission.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    commissions: req.isImpersonation ? commissions.map((c) => serializePHI(c, req)) : commissions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const updateCommissionStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest("Invalid commission id");
  }
  const { status } = req.validatedBody;

  const commission = await Commission.findOne({
    _id: req.params.id,
    ...filterByBranch(req),
  });
  if (!commission) {
    throw ApiError.notFound("Commission not found");
  }

  commission.status = status;
  if (status === "paid") commission.paidDate = new Date();

  await commission.save();
  await commission.populate("doctor", "name commissionRate");

  emitToBranch(String(commission.branch || ''), 'commission:updated', { commission });
  return sendSuccess(res, { commission: serializePHI(commission, req) });
});

/**
 * GET /accounting/summary
 * Profit & loss summary: revenue, expenses, drawings, commissions.
 */
export const getAccountingSummary = asyncHandler(async (req, res) => {
  const baseFilter = { ...filterByBranch(req) };
  const { from, to } = req.validatedQuery || {};

  const dateRange = {};
  if (from) dateRange.$gte = new Date(from);
  if (to) dateRange.$lte = new Date(to);

  const invoiceFilter = { ...baseFilter, status: { $ne: "void" } };
  const expenseFilter = { ...baseFilter, isActive: true };
  const drawingFilter = { ...baseFilter, isActive: true };
  const commissionFilter = { ...baseFilter };

  if (Object.keys(dateRange).length) {
    invoiceFilter.createdAt = dateRange;
    expenseFilter.date = dateRange;
    drawingFilter.date = dateRange;
    commissionFilter.createdAt = dateRange;
  }

  const [revenueAgg, expenseAgg, drawingAgg, commissionAgg, expenseByCategory, paymentStats] =
    await Promise.all([
      Invoice.aggregate([
        { $match: invoiceFilter },
        {
          $group: {
            _id: null,
            totalBilled: { $sum: "$total" },
            totalPaid: { $sum: "$paidAmount" },
          },
        },
      ]),
      Expense.aggregate([
        { $match: expenseFilter },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      OwnerDrawing.aggregate([
        { $match: drawingFilter },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Commission.aggregate([
        { $match: commissionFilter },
        {
          $group: {
            _id: "$status",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Expense.aggregate([
        { $match: expenseFilter },
        {
          $group: {
            _id: "$category",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
      Invoice.aggregate([
        { $match: { ...invoiceFilter, payments: { $exists: true, $ne: [] } } },
        { $unwind: "$payments" },
        // Only count payments that actually fell inside the window. Without
        // this, payments made before/after the range leak into the by-method
        // and monthly revenue figures (invoice createdAt ≠ payment date).
        ...(Object.keys(dateRange).length
          ? [{ $match: { "payments.date": dateRange } }]
          : []),
        {
          $facet: {
            byMethod: [
              {
                $group: {
                  _id: "$payments.method",
                  total: { $sum: "$payments.amount" },
                  count: { $sum: 1 },
                },
              },
            ],
            monthly: [
              {
                $group: {
                  _id: {
                    year: { $year: "$payments.date" },
                    month: { $month: "$payments.date" },
                  },
                  revenue: { $sum: "$payments.amount" },
                  count: { $sum: 1 },
                },
              },
              { $sort: { "_id.year": 1, "_id.month": 1 } },
            ],
          },
        },
      ]),
    ]);

  const revenueByMethod = paymentStats[0]?.byMethod || [];
  const monthlyRevenue = paymentStats[0]?.monthly || [];

  const revenue = revenueAgg[0] || { totalBilled: 0, totalPaid: 0 };
  const expenses = expenseAgg[0]?.total || 0;
  const drawings = drawingAgg[0]?.total || 0;

  const commissions = commissionAgg.reduce(
    (acc, c) => {
      acc[c._id] = { total: round2(c.total), count: c.count };
      return acc;
    },
    { pending: { total: 0, count: 0 }, paid: { total: 0, count: 0 } },
  );

  const totalRevenue = round2(revenue.totalPaid || 0);
  const totalExpenses = round2(expenses);
  const totalDrawings = round2(drawings);
  const pendingCommissions = round2(commissions.pending?.total || 0);
  const paidCommissions = round2(commissions.paid?.total || 0);
  // Paid commissions are money already paid out to doctors — they must reduce
  // net profit too, otherwise profit is overstated once a commission is marked paid.
  const netProfit = round2(totalRevenue - totalExpenses - totalDrawings - pendingCommissions - paidCommissions);

  return sendSuccess(res, {
    summary: {
      totalBilled: round2(revenue.totalBilled || 0),
      totalCollected: totalRevenue,
      totalExpenses,
      totalDrawings,
      pendingCommissions,
      paidCommissions,
      netProfit,
    },
    expenseByCategory: expenseByCategory.map((c) => ({
      category: c._id,
      total: round2(c.total),
      count: c.count,
    })),
    revenueByMethod: revenueByMethod.map((r) => ({
      method: r._id,
      total: round2(r.total),
      count: r.count,
    })),
    monthlyRevenue: monthlyRevenue.map((r) => ({
      year: r._id.year,
      month: r._id.month,
      revenue: round2(r.revenue),
      count: r.count,
    })),
    commissions,
  });
});

/* -------------------------------------------------------------- Day Close */

function startOfDay(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(d) {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
}

/** Normalize any payment-method label onto the four Day Close buckets. */
function dayCloseBucket(method) {
  if (method === 'cash') return 'cash';
  if (method === 'wallet') return 'wallet';
  if (method === 'card') return 'card';
  return 'transfer'; // transfer + bank
}

/**
 * Snapshot the expected takings of a branch for one day, from the ledgers:
 * invoice payments in (net of refunds) minus cash expenses and owner drawings.
 */
async function computeExpectedTakings(branchFilter, start, end) {
  const paymentMatch = { ...branchFilter };
  const [paymentAgg, expenseAgg, drawingAgg] = await Promise.all([
    Invoice.aggregate([
      { $match: { ...paymentMatch, payments: { $exists: true, $ne: [] } } },
      { $unwind: '$payments' },
      { $match: { 'payments.date': { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$payments.method',
          total: { $sum: '$payments.amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    Expense.aggregate([
      {
        $match: {
          ...branchFilter,
          isActive: { $ne: false },
          date: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    OwnerDrawing.aggregate([
      {
        $match: {
          ...branchFilter,
          isActive: { $ne: false },
          date: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  const expected = { cash: 0, card: 0, transfer: 0, wallet: 0 };
  for (const row of paymentAgg) {
    expected[dayCloseBucket(row._id)] += row.total;
  }
  // Money that left the drawer during the day reduces the expected float.
  for (const row of [...expenseAgg, ...drawingAgg]) {
    expected[dayCloseBucket(row._id)] -= row.total;
  }
  for (const key of Object.keys(expected)) {
    expected[key] = round2(expected[key]);
  }
  return expected;
}

/**
 * GET /accounting/day-close?date=YYYY-MM-DD
 * PRD §7.5: preview the day's expected takings per method before closing.
 */
export const getDayClosePreview = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const date = req.validatedQuery?.date ? new Date(req.validatedQuery.date) : new Date();
  const start = startOfDay(date);
  const end = endOfDay(date);

  const expected = await computeExpectedTakings(branchFilter, start, end);

  const existing = await DayClose.findOne({ ...branchFilter, date: start }).populate(
    'closedBy',
    'name',
  );

  return sendSuccess(res, {
    dayClose: {
      date: start,
      expected,
      countedCash: existing?.countedCash ?? null,
      difference: existing?.difference ?? null,
      closedBy: existing?.closedBy ?? null,
      closedAt: existing?.closedAt ?? null,
      isClosed: !!existing,
    },
  });
});

/**
 * POST /accounting/day-close/close
 * BR-BL-04: lock the day with a cash count. Only users holding
 * `accounting:update` (clinic managers/accountants by role config) may close.
 * The snapshot is immutable — re-closing returns 409.
 */
export const closeDay = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const tenant = currentTenant(req);
  const { date: dateStr, branch: branchId, countedCash, notes } = req.validatedBody;

  // Day close is always scoped to ONE branch — system admins must pass one.
  const resolvedBranch =
    branchFilter.branch ?? (branchId ? toObjectId(branchId) : null) ?? (req.query.branch ? toObjectId(req.query.branch) : null);
  if (!resolvedBranch) {
    throw ApiError.badRequest('A branch is required to close the day', {
      branch: 'required',
    });
  }

  const start = startOfDay(dateStr ? new Date(dateStr) : new Date());
  const end = endOfDay(start);

  const alreadyClosed = await DayClose.findOne({
    branch: resolvedBranch,
    date: start,
  }).select('_id');
  if (alreadyClosed) {
    throw ApiError.conflict('This day has already been closed', { date: 'already closed' });
  }

  const expected = await computeExpectedTakings(
    { ...(tenant ? { tenant } : {}), branch: resolvedBranch },
    start,
    end,
  );
  const difference = round2(Number(countedCash) - expected.cash);

  const [dayClose] = await DayClose.create([
    {
      tenant,
      branch: resolvedBranch,
      date: start,
      expected,
      countedCash,
      difference,
      notes: notes || '',
      closedBy: req.user._id,
    },
  ]);
  await dayClose.populate('closedBy', 'name');

  emitToBranch(String(resolvedBranch), 'dayclose:closed', { dayClose });

  return sendSuccess(res, { dayClose }, 201);
});

/**
 * GET /accounting/day-close/list?from&to
 * History of closed days for reconciliation review.
 */
export const listDayCloses = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const { from, to, page, limit } = req.validatedQuery;

  const filter = { ...branchFilter };
  const range = {};
  if (from) range.$gte = startOfDay(new Date(from));
  if (to) range.$lte = endOfDay(new Date(to));
  if (Object.keys(range).length) filter.date = range;

  const skip = (page - 1) * limit;
  const [dayCloses, total] = await Promise.all([
    DayClose.find(filter)
      .populate('closedBy', 'name')
      .sort('-date')
      .skip(skip)
      .limit(limit),
    DayClose.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    dayCloses,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/**
 * GET /accounting/journal
 * BR-BL-05: double-entry ledger listing for verification/reporting.
 */
export const listJournalEntries = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const { from, to, page, limit } = req.validatedQuery;

  const filter = { ...branchFilter };
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  if (Object.keys(range).length) filter.date = range;

  const skip = (page - 1) * limit;
  const [entries, total, totals] = await Promise.all([
    JournalEntry.find(filter).sort('-date').skip(skip).limit(limit),
    JournalEntry.countDocuments(filter),
    JournalEntry.aggregate([
      { $match: filter },
      { $group: { _id: null, debit: { $sum: '$totalDebit' }, credit: { $sum: '$totalCredit' } } },
    ]),
  ]);

  return sendSuccess(res, {
    entries,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    balances: {
      totalDebit: round2(totals[0]?.debit ?? 0),
      totalCredit: round2(totals[0]?.credit ?? 0),
    },
  });
});
