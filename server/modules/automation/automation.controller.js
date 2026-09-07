import mongoose from 'mongoose';

import Automation from './automation.model.js';
import AutomationRun from './automationRun.model.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { currentTenant, toObjectId } from '../../utils/branchScope.js';
import { applyRule } from '../../services/automationEngine.js';
import {
  ACTION_TYPES,
  CONDITION_OPS,
  DEFAULT_TEMPLATES,
  TRIGGER_TYPES,
} from '../../constants/automations.js';

function requireTenant(req) {
  const tenant = currentTenant(req) || toObjectId(req.body?.tenant);
  if (!tenant) {
    throw ApiError.badRequest('Automation rules require a tenant');
  }
  return tenant;
}

export const listTriggers = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    triggers: TRIGGER_TYPES,
    conditionOps: CONDITION_OPS,
    actionTypes: ACTION_TYPES,
  }),
);

export const listAutomations = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const { page, limit, enabled, trigger } = req.validatedQuery;

  const filter = tenant ? { tenant } : { tenant: null };
  filter.isActive = true;
  if (enabled !== undefined) filter.enabled = enabled === 'true';
  if (trigger) filter['trigger.type'] = trigger;

  const skip = (page - 1) * limit;
  const [automations, total] = await Promise.all([
    Automation.find(filter).sort('-createdAt').skip(skip).limit(limit),
    Automation.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    automations,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getAutomation = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid automation id');
  }
  const automation = await Automation.findOne({ _id: id, tenant });
  if (!automation || automation.isActive !== true) {
    throw ApiError.notFound('Automation not found');
  }
  return sendSuccess(res, { automation });
});

export const createAutomation = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const data = req.validatedBody;

  const existing = await Automation.findOne({ tenant, name: data.name, isActive: true });
  if (existing) {
    throw ApiError.conflict('An automation with this name already exists');
  }

  const automation = await Automation.create({
    tenant,
    branch: data.branch ? toObjectId(data.branch) : null,
    name: data.name,
    description: data.description || '',
    enabled: data.enabled,
    trigger: data.trigger,
    conditions: data.conditions || [],
    actions: data.actions,
    cooldownMinutes: data.cooldownMinutes || 0,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  return sendSuccess(res, { automation }, 201);
});

export const updateAutomation = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid automation id');
  }
  const data = req.validatedBody;

  const automation = await Automation.findOne({ _id: id, tenant });
  if (!automation || automation.isActive !== true) {
    throw ApiError.notFound('Automation not found');
  }

  if (data.name !== undefined) automation.name = data.name;
  if (data.description !== undefined) automation.description = data.description;
  if (data.branch !== undefined) automation.branch = data.branch ? toObjectId(data.branch) : null;
  if (data.enabled !== undefined) automation.enabled = data.enabled;
  if (data.trigger !== undefined) automation.trigger = data.trigger;
  if (data.conditions !== undefined) automation.conditions = data.conditions;
  if (data.actions !== undefined) automation.actions = data.actions;
  if (data.cooldownMinutes !== undefined) automation.cooldownMinutes = data.cooldownMinutes;
  automation.updatedBy = req.user._id;

  await automation.save();
  return sendSuccess(res, { automation });
});

export const deleteAutomation = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid automation id');
  }
  const automation = await Automation.findOne({ _id: id, tenant });
  if (!automation || automation.isActive !== true) {
    throw ApiError.notFound('Automation not found');
  }
  automation.isActive = false;
  automation.enabled = false;
  automation.updatedBy = req.user._id;
  await automation.save();
  return sendSuccess(res, { message: 'Automation deleted' });
});

/**
 * Install the built-in templates for this clinic (idempotent — matched by
 * `key`, falling back to `name` for pre-key templates).
 */
export const installTemplates = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);

  let installed = 0;
  let existing = 0;
  for (const template of DEFAULT_TEMPLATES) {
    const already = await Automation.findOne({
      tenant,
      isActive: true,
      $or: [{ key: template.key }, { name: template.name }],
    });
    if (already) {
      existing++;
      continue;
    }
    await Automation.create({
      tenant,
      branch: null,
      key: template.key,
      isTemplate: true,
      name: template.name,
      description: template.description,
      enabled: false,
      trigger: template.trigger,
      conditions: template.conditions || [],
      actions: template.actions,
      cooldownMinutes: template.cooldownMinutes || 0,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    installed++;
  }

  return sendSuccess(res, { installed, existing, total: DEFAULT_TEMPLATES.length });
});

/**
 * Dry-run a rule against a simulated event payload — renders the actions but
 * never executes side effects (no WhatsApp, no webhook).
 */
export const testAutomation = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid automation id');
  }
  const automation = await Automation.findOne({ _id: id, tenant });
  if (!automation || automation.isActive !== true) {
    throw ApiError.notFound('Automation not found');
  }

  const { event } = req.validatedBody;
  const rule = automation.toObject();
  const fakeEvent = {
    type: rule.trigger.type,
    tenant: toObjectId(event?.tenant) || tenant,
    branch: toObjectId(event?.branch) || rule.branch,
    data: event?.data || {},
    occurredAt: new Date(),
  };

  const outcome = await applyRule(rule, fakeEvent, { dryRun: true });
  return sendSuccess(res, {
    status: outcome.status,
    reason: outcome.reason || '',
    matched: outcome.status === 'success',
    plannedActions: outcome.actionResults || [],
  });
});

export const listRuns = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const { page, limit, automation } = req.validatedQuery;

  const filter = { tenant };
  if (automation) {
    if (!mongoose.isValidObjectId(automation)) {
      throw ApiError.badRequest('Invalid automation id');
    }
    filter.automation = toObjectId(automation);
  }

  const skip = (page - 1) * limit;
  const [runs, total] = await Promise.all([
    AutomationRun.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('automation', 'name trigger'),
    AutomationRun.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    runs,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getRun = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const { runId } = req.params;
  if (!mongoose.isValidObjectId(runId)) {
    throw ApiError.badRequest('Invalid run id');
  }
  const run = await AutomationRun.findOne({ _id: runId, tenant }).populate('automation', 'name trigger');
  if (!run) {
    throw ApiError.notFound('Run not found');
  }
  return sendSuccess(res, { run });
});