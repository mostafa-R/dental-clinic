import * as planService from './plan.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';

export const getPlans = asyncHandler(async (_req, res) => {
  const plans = await planService.getPlans();
  return sendSuccess(res, plans);
});

export const getPlan = asyncHandler(async (req, res) => {
  const plan = await planService.getPlan(req.params.id);
  return sendSuccess(res, plan);
});

export const createPlan = asyncHandler(async (req, res) => {
  const plan = await planService.createPlan(req.validatedBody);
  return sendSuccess(res, plan.toObject(), 201);
});

export const updatePlan = asyncHandler(async (req, res) => {
  const plan = await planService.updatePlan(req.params.id, req.validatedBody);
  return sendSuccess(res, plan.toObject());
});

export const deletePlan = asyncHandler(async (req, res) => {
  await planService.deletePlan(req.params.id);
  return sendSuccess(res, { message: 'Plan deleted' });
});
