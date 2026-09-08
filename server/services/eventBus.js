import EventLog from '../modules/automation/eventLog.model.js';
import { stripPHI } from '../middleware/phiRestrict.js';
import { logError, logInfo } from '../utils/logger.js';

/**
 * In-process Event Bus (PRD §12.1 / ADR-4).
 *
 * Business flows `publishEvent({ type, tenant, branch, data })`. The event is:
 *   1. persisted to the `events` collection (best-effort, never throws), and
 *   2. delivered synchronously to all in-process subscribers (the Automation
 *      engine; the AI layer will subscribe the same way).
 *
 * Feeds:
 *   appointment.created/completed/no_show/cancelled/confirmed
 *   patient.created · consent.signed · invoice.paid
 *   installment.overdue · inventory.low_stock
 */
const subscribers = new Map(); // type → Set<handler>
const wildcardSubscribers = new Set(); // handlers invoked for every event

let started = false;

/**
 * Subscribe to a single event type. Returns an unsubscribe function.
 */
export function subscribeEvent(type, handler) {
  if (!type || typeof handler !== 'function') return () => {};
  if (!subscribers.has(type)) subscribers.set(type, new Set());
  subscribers.get(type).add(handler);
  return () => subscribers.get(type)?.delete(handler);
}

/**
 * Subscribe to ALL events (used by the Automation engine). Returns an
 * unsubscribe function.
 */
export function subscribeToAll(handler) {
  if (typeof handler !== 'function') return () => {};
  wildcardSubscribers.add(handler);
  return () => wildcardSubscribers.delete(handler);
}

/**
 * Persist a single event to the Event Log. Never throws — failures are logged
 * so a broken Mongo write cannot break the originating business flow.
 */
async function persistEvent({ type, tenant, branch, data, occurredAt }) {
  try {
    // M5: PHI (phone, email, etc.) is stripped from the persisted copy so the
    // audit log is safe at rest. In-memory handlers still receive the full
    // data object (automation engine needs {{patient.phone}} for WhatsApp).
    await EventLog.create({
      type,
      tenant: tenant || null,
      branch: branch || null,
      data: stripPHI(data || {}),
      occurredAt,
    });
  } catch (err) {
    logError(err, { context: 'EventLog.persist', type, tenant });
  }
}

/**
 * Publish a business event. Persistence is fire-and-forget; subscriber
 * handlers run sequentially (so shared state like rule cooldowns is safe).
 */
export async function publishEvent({ type, tenant, branch, data }) {
  if (!type) return;
  const occurredAt = new Date();
  const event = { type, tenant: tenant || null, branch: branch || null, data: data || {}, occurredAt };

  await persistEvent(event);

  const handlers = [...(subscribers.get(type) || []), ...wildcardSubscribers];
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (err) {
      logError(err, { context: 'EventBus.handler', type });
    }
  }
}

/**
 * Idempotent lifecycle hook — the automation engine registers itself here
 * when the server boots (server.js). Kept for explicit control and tests.
 */
export function startEventBus() {
  if (started) return;
  started = true;
  logInfo('EventBus started');
}

export function isEventBusStarted() {
  return started;
}