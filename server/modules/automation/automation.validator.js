import { z } from 'zod';

import { ACTION_TYPES, CONDITION_OPS, TRIGGER_KEYS } from '../../constants/automations.js';

const objectId = z.string().length(24, 'Invalid id');
const dateOrEmpty = z.string().datetime({ message: 'Invalid date' }).optional().or(z.literal(''));

const conditionSchema = z.object({
  field: z.string().min(1, 'field is required').max(200),
  op: z.enum(CONDITION_OPS),
  value: z.unknown().optional(),
});

const actionSchema = z
  .object({
    type: z.enum(ACTION_TYPES),
    config: z.record(z.unknown()).default({}),
  })
  .superRefine((action, ctx) => {
    if (action.type === 'webhook') {
      const url = action.config?.url;
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['config', 'url'],
          message: 'Webhook URL must be an absolute http(s) URL',
        });
      }
    }
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  enabled: z.enum(['true', 'false']).optional(),
  trigger: z.enum(TRIGGER_KEYS).optional(),
});

export const createAutomationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  description: z.string().max(500).optional(),
  // Platform (system admin) users with no tenant context may target a clinic
  // explicitly. Clinic users are always scoped by currentTenant() and the
  // controller ignores this field for them.
  tenant: objectId.optional(),
  branch: objectId.optional(),
  enabled: z.boolean().default(true),
  trigger: z.object({
    type: z.enum(TRIGGER_KEYS),
  }),
  conditions: z.array(conditionSchema).max(20).default([]),
  actions: z.array(actionSchema).min(1, 'At least one action is required').max(10),
  cooldownMinutes: z.coerce.number().min(0).max(10080).default(0),
});

export const updateAutomationSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    branch: objectId.nullable().optional(),
    enabled: z.boolean().optional(),
    trigger: z
      .object({
        type: z.enum(TRIGGER_KEYS),
      })
      .optional(),
    conditions: z.array(conditionSchema).max(20).optional(),
    actions: z.array(actionSchema).min(1).max(10).optional(),
    cooldownMinutes: z.coerce.number().min(0).max(10080).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

/**
 * Simulated event payload for `POST /:automationId/test`.
 */
export const testAutomationSchema = z.object({
  event: z
    .object({
      tenant: objectId.optional(),
      branch: objectId.optional(),
      data: z.record(z.unknown()).default({}),
    })
    .default({}),
});

export const listRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  automation: objectId.optional(),
});

/**
 * Body for `POST /automations/install-templates`. Validated so the
 * `tenant` override a platform admin may send is never an arbitrary string.
 */
export const installTemplatesSchema = z.object({
  tenant: objectId.optional(),
}).default({});

export { listQuerySchema, dateOrEmpty };