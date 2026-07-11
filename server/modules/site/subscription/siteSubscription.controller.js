import * as subscriptionService from './subscription.service.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess } from '../../../utils/sendSuccess.js';

export const getSubscriptions = asyncHandler(async (_req, res) => {
  const subscriptions = await subscriptionService.listSubscriptions();
  return sendSuccess(res, subscriptions);
});

export const getRevenueStats = asyncHandler(async (_req, res) => {
  const stats = await subscriptionService.getRevenueStats();
  return sendSuccess(res, stats);
});

export const updateSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.updateSubscription(req.params.id, req.validatedBody);
  return sendSuccess(res, subscription.toObject());
});

export const processPayment = asyncHandler(async (req, res) => {
  const result = await subscriptionService.processPayment(req.params.tenantId, req.validatedBody);
  return sendSuccess(res, {
    message: 'Payment processed successfully',
    subscription: result.toObject(),
  });
});
