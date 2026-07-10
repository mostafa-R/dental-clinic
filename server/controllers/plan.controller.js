import Plan from "../models/Plan.js";
import Tenant from "../models/Tenant.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/sendSuccess.js";

export const getPlans = asyncHandler(async (req, res) => {
  const plans = await Plan.find().sort({ price: 1 }).lean();
  return sendSuccess(res, plans);
});

export const getPlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id).lean();
  if (!plan) throw ApiError.notFound("Plan not found");
  return sendSuccess(res, plan);
});

export const createPlan = asyncHandler(async (req, res) => {
  const data = req.validatedBody;
  const plan = await Plan.create(data);
  return sendSuccess(res, plan.toObject(), 201);
});

export const updatePlan = asyncHandler(async (req, res) => {
  const data = req.validatedBody;
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw ApiError.notFound("Plan not found");
  Object.assign(plan, data);
  await plan.save();

  // Sync plan changes to all tenants currently assigned this plan
  if (data.modules || data.limits || data.price !== undefined) {
    const tenants = await Tenant.find({ planId: plan._id });
    for (const tenant of tenants) {
      tenant.updatePlanSettings(plan);
      await tenant.save();
    }
    if (tenants.length > 0) {
      console.log(`[Plan] Synced ${tenants.length} tenant(s) to plan "${plan.key}"`);
    }
  }

  return sendSuccess(res, plan.toObject());
});

export const deletePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw ApiError.notFound("Plan not found");
  const assigned = await Tenant.countDocuments({ planId: plan._id });
  if (assigned > 0) {
    throw ApiError.conflict(
      `${assigned} tenant(s) are still assigned to this plan. Reassign them first.`,
    );
  }
  await plan.deleteOne();
  return sendSuccess(res, { message: "Plan deleted" });
});