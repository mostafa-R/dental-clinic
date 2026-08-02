import mongoose from "mongoose";

import { round2 } from "../../constants/accounting.js";
import Commission from "../billing/commission.model.js";
import Expense from "./expense.model.js";
import Invoice from "../billing/invoice.model.js";
import OwnerDrawing from "./ownerDrawing.model.js";
import Patient from "../patients/patient.model.js";
import User from "../users/user.model.js";
import { addTransaction } from "../patients/wallet.service.js";
import ApiError from "../../utils/ApiError.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { currentTenant, filterByBranch, resolveBranchForCreate, toObjectId } from "../../utils/branchScope.js";
import { sendSuccess } from "../../utils/sendSuccess.js";
import { withTransaction } from "../../core/transaction.js";
import { emitToBranch } from '../../socket/index.js';

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

  const expense = await Expense.create({
    branch,
    tenant: currentTenant(req),
    category: data.category,
    description: data.description,
    amount: data.amount,
    date: data.date ? new Date(data.date) : new Date(),
    paymentMethod: data.paymentMethod || "cash",
    recordedBy: req.user._id,
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
    { new: true },
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
      const patient = await Patient.findOne({ _id: data.patient, ...(tenant ? { tenant } : {}) }).session(session);
      if (!patient) {
        throw ApiError.badRequest("Referenced patient does not exist", { patient: 'not found' });
      }

      await addTransaction(patient, {
        type: 'debit',
        amount: data.amount,
        reference: drawing.drawingNo,
        description: data.description || `Owner drawing ${drawing.drawingNo}`,
      }, req.user._id, session);
    }

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
      const patient = await Patient.findOne({ _id: drawing.patient }).session(session);
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
    commissions,
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
  return sendSuccess(res, { commission });
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
