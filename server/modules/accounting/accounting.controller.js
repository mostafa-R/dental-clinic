import mongoose from "mongoose";

import { round2 } from "../../constants/accounting.js";
import Commission from "../billing/commission.model.js";
import Expense from "./expense.model.js";
import Invoice from "../billing/invoice.model.js";
import OwnerDrawing from "./ownerDrawing.model.js";
import User from "../users/user.model.js";
import ApiError from "../../utils/ApiError.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { currentTenant, filterByBranch, resolveBranchForCreate, toObjectId } from "../../utils/branchScope.js";
import { sendSuccess } from "../../utils/sendSuccess.js";

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

  const owner = await User.findById(data.owner);
  if (!owner) {
    throw ApiError.badRequest("Referenced owner does not exist", {
      owner: "not found",
    });
  }

  // Only clinic_admin or system admins can be listed as owners for drawings.
  if (owner.role !== 'clinic_admin') {
    throw ApiError.badRequest("Referenced user must be a clinic owner (clinic_admin)");
  }

  // Verify the owner belongs to the same tenant.
  if (tenant && String(owner.tenant || '') !== String(tenant)) {
    throw ApiError.badRequest("Referenced owner does not belong to your clinic");
  }

  const branch = await resolveBranchForCreate(req, data.branch);

  const drawing = await OwnerDrawing.create({
    branch,
    tenant: currentTenant(req),
    owner: toObjectId(data.owner),
    amount: data.amount,
    description: data.description || "",
    date: data.date ? new Date(data.date) : new Date(),
    recordedBy: req.user._id,
  });

  await drawing.populate("owner", "name");

  return sendSuccess(res, { drawing }, 201);
});

export const deleteDrawing = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest("Invalid drawing id");
  }
  const drawing = await OwnerDrawing.findOneAndUpdate(
    { _id: req.params.id, ...filterByBranch(req), isActive: true },
    { $set: { isActive: false } },
    { new: true },
  );
  if (!drawing) {
    throw ApiError.notFound("Drawing not found");
  }
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
  const netProfit = round2(totalRevenue - totalExpenses - totalDrawings - pendingCommissions);

  return sendSuccess(res, {
    summary: {
      totalBilled: round2(revenue.totalBilled || 0),
      totalCollected: totalRevenue,
      totalExpenses,
      totalDrawings,
      pendingCommissions,
      paidCommissions: round2(commissions.paid?.total || 0),
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
