import mongoose from 'mongoose';

import * as inventoryService from './inventory.service.js';
import { currentTenant, filterByBranch, resolveBranchForCreate } from '../../utils/branchScope.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { emitToBranch } from '../../socket/index.js';

export const listItems = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const result = await inventoryService.listItems(branchFilter, req.validatedQuery);
  return sendSuccess(res, result);
});

export const getItem = asyncHandler(async (req, res) => {
  const item = await inventoryService.getItem(req.params.id, filterByBranch(req));
  return sendSuccess(res, { item });
});

export const createItem = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const branch = await resolveBranchForCreate(req, req.validatedBody.branch);
  if (!branch) {
    throw ApiError.badRequest('branch is required', { branch: 'branch is required' });
  }
  const item = await inventoryService.createItem({
    tenant, branch, data: req.validatedBody, userId: req.user._id,
  });
  emitToBranch(String(branch), 'inventory:created', { item });
  return sendSuccess(res, { item }, 201);
});

export const updateItem = asyncHandler(async (req, res) => {
  const item = await inventoryService.updateItem(req.params.id, filterByBranch(req), req.validatedBody);
  emitToBranch(String(item.branch), 'inventory:updated', { item });
  return sendSuccess(res, { item });
});

export const deleteItem = asyncHandler(async (req, res) => {
  const item = await inventoryService.deleteItem(req.params.id, filterByBranch(req));
  emitToBranch(String(item.branch), 'inventory:deleted', { _id: req.params.id });
  return sendSuccess(res, { message: 'Item deleted' });
});

export const adjustStock = asyncHandler(async (req, res) => {
  const item = await inventoryService.adjustStock(req.params.id, filterByBranch(req), {
    ...req.validatedBody,
    userId: req.user._id,
  });
  emitToBranch(String(item.branch), 'inventory:updated', { item });
  return sendSuccess(res, { item });
});

export { deductForProcedure } from './inventory.service.js';
