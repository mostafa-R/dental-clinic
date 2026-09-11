import Automation from '../modules/automation/automation.model.js';
import AutomationRun from '../modules/automation/automationRun.model.js';
import { stripPHI } from '../middleware/phiRestrict.js';
import { emitToBranch } from '../socket/index.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { subscribeToAll } from './eventBus.js';
import { assertSafeWebhookUrl } from '../utils/webhookGuard.js';

const WEBHOOK_TIMEOUT_MS = 10000;

// Rules are cached per (tenant, trigger) for AUTOMATION_CACHE_TTL_MS so a
// burst of the same event type does not re-scan the collection per event.
// Any rule mutation invalidates the tenant's buckets (see the controller).
const RULE_CACHE_TTL_MS = Number(process.env.AUTOMATION_CACHE_TTL_MS) || 5000;
const ruleCache = new Map();

function ruleCacheKey(tenant, type) {
  return `${String(tenant ?? '')}:${type}`;
}

export function invalidateAutomationCache(tenant) {
  if (tenant) {
    const prefix = `${String(tenant)}:`;
    for (const key of ruleCache.keys()) {
      if (key.startsWith(prefix)) ruleCache.delete(key);
    }
    return;
  }
  ruleCache.clear();
}

async function loadRules(event) {
  const key = ruleCacheKey(event.tenant, event.type);
  const hit = ruleCache.get(key);
  if (hit && Date.now() - hit.at < RULE_CACHE_TTL_MS) return hit.rules;
  const rules = await Automation.find({
    tenant: event.tenant,
    enabled: true,
    isActive: true,
    'trigger.type': event.type,
  }).lean();
  ruleCache.set(key, { at: Date.now(), rules });
  return rules;
}

/**
 * True when a built-in template with `key` is enabled for the tenant. Crons
 * use this to avoid duplicating a message the Automation engine already sends
 * (e.g. no-show reschedule / installment reminder).
 */
export async function isAutomationTemplateEnabled(tenantId, key) {
  if (!tenantId || !key) return false;
  return !!(await Automation.exists({ tenant: tenantId, key, enabled: true, isActive: true }));
}

/**
 * Resolve a dot-path inside an object ("patient.phone"). Returns undefined
 * when any segment is missing.
 */
export function getPath(obj, path) {
  if (!obj || typeof path !== 'string') return undefined;
  return path.split('.').reduce(
    (acc, key) => (acc !== undefined && acc !== null && typeof acc === 'object' && key in acc ? acc[key] : undefined),
    obj,
  );
}

/**
 * Resolve a placeholder path against a context that carries an event `data`
 * sub-object — checks `data.<path>` first, then the root (type/tenant/branch).
 */
export function resolvePath(ctx, path) {
  if (!ctx) return undefined;
  return getPath(ctx.data, path) ?? getPath(ctx, path);
}

/**
 * Render `{{dot.path}}` placeholders from a context. Resolution prefers the
 * event `data` sub-object, then the event root. Missing placeholders render
 * as an empty string.
 */
export function renderTemplate(template, ctx) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (raw, path) => {
    const value = resolvePath(ctx, path);
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
    return String(value);
  });
}

/**
 * Mask a contact value so only the edges remain ("01012345678" → "01****78").
 * Used before persisting action output so PHI is never stored/returned in the
 * audit trail.
 */
export function maskContact(value) {
  if (typeof value !== 'string') return value;
  const at = value.indexOf('@');
  const local = at === -1 ? value : value.slice(0, at);
  if (local.length <= 6) return value;
  const masked = `${local.slice(0, 2)}****${local.slice(-2)}`;
  return at === -1 ? masked : `${masked}${value.slice(at)}`;
}

/**
 * Mask phone-like digit sequences ("01012345678" → "01****78") in a rendered
 * free-text message so PHI embedded in branch notifications never leaves with
 * the full number.
 */
export function maskPhones(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/(?<!\d)(?:\+?\d[\s()./-]*){6,}\d(?!\d)/g, (m) => {
    if (m.length <= 6) return m;
    return `${m.slice(0, 2)}****${m.slice(-2)}`;
  });
}

/**
 * Evaluate one condition against the event. Field resolution checks the
 * event `data` sub-object first, then the event root (type/tenant/branch…).
 */
export function evaluateCondition(condition, event) {
  const { field, op, value } = condition;
  const actual = resolvePath(event, field);

  switch (op) {
    case 'eq':
      return actual === value;
    case 'neq':
      return actual !== value;
    case 'gt':
      return Number(actual) > Number(value);
    case 'gte':
      return Number(actual) >= Number(value);
    case 'lt':
      return Number(actual) < Number(value);
    case 'lte':
      return Number(actual) <= Number(value);
    case 'exists':
      return value ? actual !== undefined && actual !== null : actual === undefined || actual === null;
    case 'contains': {
      if (actual === undefined || actual === null) return false;
      if (Array.isArray(actual)) return actual.includes(value);
      return String(actual).includes(String(value));
    }
    case 'in':
      return Array.isArray(value) && value.includes(actual);
    case 'nin':
      return Array.isArray(value) && !value.includes(actual);
    case 'startsWith':
      return String(actual ?? '').startsWith(String(value ?? ''));
    default:
      return false;
  }
}

/**
 * Execute a single action. Errors are caught and returned as a failed result
 * so one failing action never aborts the rest of the rule.
 */
export async function executeAction(action, event) {
  const ctx = { ...event, data: event.data || {} };
  const base = { type: action.type };

  try {
    switch (action.type) {
      case 'send_whatsapp': {
        const to = renderTemplate(action.config?.to, ctx);
        const message = renderTemplate(action.config?.message, ctx);
        if (!to || !message) {
          return { ...base, status: 'skipped', error: 'Missing recipient or message' };
        }
        await sendWhatsAppMessage(event.tenant, to, message);
        return { ...base, status: 'success', output: { to: maskContact(to) } };
      }

      case 'notify_branch': {
        const message = maskPhones(renderTemplate(action.config?.message, ctx));
        if (!message) return { ...base, status: 'skipped', error: 'Missing message' };
        emitToBranch(event.branch, 'automation:notify', {
          automationId: String(action._id || event.data?.automationId || ''),
          message,
          eventType: event.type,
        });
        return { ...base, status: 'success' };
      }

      case 'webhook': {
        const url = renderTemplate(action.config?.url, ctx);
        if (!url) return { ...base, status: 'skipped', error: 'Missing webhook URL' };
        await assertSafeWebhookUrl(url);
        const headers = action.config?.headers || {};
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({
            type: event.type,
            tenant: event.tenant,
            branch: event.branch,
            occurredAt: event.occurredAt,
            data: stripPHI(event.data || {}),
          }),
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
          redirect: 'manual',
        });
        if (response.type === 'opaqueredirect') {
          return { ...base, status: 'error', error: 'Webhook redirects are not allowed' };
        }
        if (!response.ok) {
          return {
            ...base,
            status: 'error',
            error: `Webhook responded ${response.status}`,
            output: { status: response.status },
          };
        }
        return { ...base, status: 'success', output: { status: response.status } };
      }

      default:
        return { ...base, status: 'skipped', error: `Unknown action type "${action.type}"` };
    }
  } catch (err) {
    return { ...base, status: 'error', error: err.message || String(err) };
  }
}

/**
 * Apply a single enabled rule to an event. Returns a "run" summary without
 * persisting it (testAutomation uses this with dryRun=true).
 */
export async function applyRule(rule, event, { dryRun = false } = {}) {
  const now = new Date();

  // Branch scope: a rule restricted to a branch only runs for that branch.
  if (rule.branch && String(rule.branch) !== String(event.branch)) {
    return { status: 'skipped', reason: 'branch scope mismatch', rule };
  }

  // Cooldown fast path (read-only): prevent re-execution within cooldownMinutes.
  if (!dryRun && rule.cooldownMinutes > 0 && rule.lastTriggeredAt) {
    const elapsedMin = (now.getTime() - new Date(rule.lastTriggeredAt).getTime()) / 60000;
    if (elapsedMin < rule.cooldownMinutes) {
      return {
        status: 'skipped',
        reason: `cooldown active (${Math.ceil(rule.cooldownMinutes - elapsedMin)}m remaining)`,
        rule,
      };
    }
  }

  // Conditions: every condition must match.
  const conditionPassed = (rule.conditions || []).every((c) => evaluateCondition(c, event));
  if (!conditionPassed) {
    return { status: 'skipped', reason: 'condition not matched', rule };
  }

  // Atomic claim (non-dry runs only): reserve the execution against the DB so
  // two interleaved event handlers can never both pass a cooldown before
  // either persists lastTriggeredAt. Also re-verifies enabled/isActive, so a
  // cached rule that was just disabled cannot fire.
  if (!dryRun) {
    const filter = { _id: rule._id, enabled: true, isActive: true };
    if (rule.cooldownMinutes > 0) {
      filter.$or = [
        { lastTriggeredAt: { $lt: new Date(now.getTime() - rule.cooldownMinutes * 60000) } },
        { lastTriggeredAt: null },
      ];
    }
    const claimed = await Automation.findOneAndUpdate(filter, { $set: { lastTriggeredAt: now } });
    if (!claimed) {
      return {
        status: 'skipped',
        reason: rule.cooldownMinutes > 0 ? 'cooldown active' : 'rule no longer active',
        rule,
      };
    }
  }

  const actionResults = [];
  for (const action of rule.actions || []) {
    if (dryRun) {
      if (action.type === 'webhook') {
        const ctx = { ...event, data: event.data || {} };
        const url = renderTemplate(action.config?.url, ctx);
        if (!url) {
          actionResults.push({ type: action.type, status: 'skipped', error: 'Missing webhook URL' });
          continue;
        }
        try {
          await assertSafeWebhookUrl(url);
          actionResults.push({ type: action.type, status: 'success', output: 'dry-run' });
        } catch (err) {
          actionResults.push({ type: action.type, status: 'error', error: err.message });
        }
        continue;
      }
      actionResults.push({ type: action.type, status: 'success', output: 'dry-run' });
      continue;
    }
    const result = await executeAction(action, event);
    actionResults.push(result);
  }

  const failed = actionResults.some((r) => r.status === 'error');
  return { status: failed ? 'failed' : 'success', rule, actionResults };
}

/**
 * Record an audit row and mutate the rule counters. Only called for real
 * (non dry-run) executions — skipped matches still get a run row so the
 * behavior is observable.
 */
async function persistRun(tenantId, outcome, event) {
  try {
    // M5: strip PHI from the persisted copy of event data; in-memory
    // handlers still receive the full data for template rendering.
    await AutomationRun.create({
      automation: outcome.rule._id,
      tenant: tenantId,
      branch: outcome.rule.branch,
      triggerType: outcome.rule.trigger.type,
      event: {
        type: event?.type,
        occurredAt: event?.occurredAt,
        data: stripPHI(event?.data || {}),
      },
      status: outcome.status,
      reason: outcome.reason || '',
      actionResults: outcome.actionResults || [],
      startedAt: new Date(),
      finishedAt: new Date(),
    });

    const update = {
      $set: {
        lastTriggeredAt: new Date(),
        lastRunStatus: outcome.status,
        lastError: outcome.reason || (outcome.actionResults?.find((r) => r.status === 'error')?.error || ''),
      },
      $inc: { runCount: outcome.status === 'skipped' ? 0 : 1 },
    };
    await Automation.updateOne({ _id: outcome.rule._id }, update);
  } catch (err) {
    // Persisting the audit row must never break the event flow.
    console.error(`[Automation] Failed to persist run: ${err.message}`);
  }
}

/**
 * Main engine entry: find all enabled rules of the event's tenant matching
 * the trigger type and apply them sequentially.
 */
export async function handleEvent(event) {
  if (!event || !event.type) return;
  const tenant = event.tenant;

  const rules = await loadRules(event);

  for (const rule of rules) {
    const outcome = await applyRule(rule, event);
    await persistRun(tenant, outcome, event);
  }
}

let unsubscribe = null;

/**
 * Register the engine with the Event Bus. Idempotent. Returns a stop function.
 */
export function startAutomationEngine() {
  if (unsubscribe) return stopAutomationEngine;
  unsubscribe = subscribeToAll(handleEvent);
  console.log('[Automation] Engine subscribed to Event Bus');
  return stopAutomationEngine;
}

export function stopAutomationEngine() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

export default {
  getPath,
  resolvePath,
  renderTemplate,
  maskContact,
  maskPhones,
  evaluateCondition,
  executeAction,
  applyRule,
  handleEvent,
  startAutomationEngine,
  stopAutomationEngine,
  invalidateAutomationCache,
  isAutomationTemplateEnabled,
};