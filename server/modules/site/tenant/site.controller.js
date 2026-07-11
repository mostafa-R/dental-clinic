import * as tenantService from './tenant.service.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess } from '../../../utils/sendSuccess.js';

export const getTenants = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, plan, search } = req.query;
  const result = await tenantService.listTenants({
    page: Math.max(1, parseInt(page) || 1), limit: Math.min(100, Math.max(1, parseInt(limit) || 10)), status, plan, search,
  });
  return sendSuccess(res, result);
});

export const getTenant = asyncHandler(async (req, res) => {
  const tenant = await tenantService.getTenantById(req.params.id);
  return sendSuccess(res, tenant);
});

export const createTenant = asyncHandler(async (req, res) => {
  const result = await tenantService.createTenant(req.validatedBody);
  return sendSuccess(res, result, 201);
});

export const updateTenant = asyncHandler(async (req, res) => {
  const tenant = await tenantService.updateTenant(req.params.id, req.validatedBody);
  return sendSuccess(res, tenant.toObject());
});

export const archiveTenant = asyncHandler(async (req, res) => {
  const tenant = await tenantService.archiveTenant(req.params.id);
  return sendSuccess(res, tenant.toObject());
});

export const deleteTenant = asyncHandler(async (req, res) => {
  await tenantService.deleteTenant(req.params.id);
  return sendSuccess(res, { message: 'Tenant permanently deleted' });
});

export const suspendTenant = asyncHandler(async (req, res) => {
  const tenant = await tenantService.suspendTenant(req.params.id);
  return sendSuccess(res, tenant.toObject());
});

export const activateTenant = asyncHandler(async (req, res) => {
  const tenant = await tenantService.activateTenant(req.params.id);
  return sendSuccess(res, tenant.toObject());
});

export const getTenantStats = asyncHandler(async (req, res) => {
  const stats = await tenantService.getTenantStats(req.params.id);
  return sendSuccess(res, stats);
});
