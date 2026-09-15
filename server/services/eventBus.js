import crypto from 'node:crypto';

import EventLog from '../modules/automation/eventLog.model.js';
import { stripPHI } from '../middleware/phiRestrict.js';
import { logError, logInfo } from '../utils/logger.js';
import { EVENT_SCHEMA_VERSION } from '../constants/automations.js';

/**
 * In-process Event Bus (PRD §12.1 / ADR-4) — Phase 1 hardened contract.
 *
 * Every event is normalized centrally into the stable contract:
 *   { eventId, eventType, tenantId, branchId, actorId,
 *     aggregateType, aggregateId, occurredAt, schemaVersion, metadata }
 * plus legacy aliases (`type`, `tenant`, `branch`, `data`) so existing
 * producers and the Automation engine keep working byte-for-byte.
 *
 * Compatibility: old producers publish `{ type, tenant, branch, data,
 * occurredAt }`. The adapter maps them into the contract (aggregate pair is
 * picked up from `data.aggregateType/aggregateId` when present, else null).
 *
 * Identity & idempotency: `eventId` defaults to a deterministic content hash
 * (`evt_` + sha1 over the canonical fields incl. metadata), so redelivery of
 * the same logical event — same object or reconstructed — resolves to the
 * same id and is delivered once per TTL window. Caller-supplied ids are
 * respected when they are non-empty strings. A unique sparse index on
 * `EventLog.eventId` backstops the in-memory seen-set at the DB layer.
 *
 * Invalid events are rejected safely: a structured, PHI-free rejection is
 * recorded through the error-log pipeline (deduplicated per reason+type so a
 * broken producer cannot spam the logs), the bus never throws, nothing is
 * retried, and `publishEvent` returns `{ status: 'rejected', error }`.
 *
 * DELIVERY GUARANTEES (known limitation — at-most-once):
 *   The bus is in-process and fire-and-forget (`void publishEvent(...)`). If
 *   the process dies between a business write (e.g. invoice.paid) and the
 *   synchronous handler flush, in-flight events and their pending side
 *   effects (WhatsApp/webhook) are lost. For strict at-least-once delivery,
 *   the `events` collection (EventLog) must be promoted to an outbox: a
 *   sweeper (à la the cron services) re-publishes `status: pending` rows to
 *   the engine with idempotent deduplication on the AutomationRun action
 *   (eventId + rule). Automations that trigger side effects should keep
 *   cooldowns > 0 to bound duplicate messages if that sweeper is added.
 */
const subscribers = new Map(); // type → Set<handler>
const wildcardSubscribers = new Set(); // handlers invoked for every event

let started = false;

// Recently delivered event ids → delivered-at ms. Bounded FIFO (insertion
// ordered Map) so a redelivery storm cannot grow memory without limit.
const SEEN_TTL_MS = Number(process.env.EVENT_DEDUP_TTL_MS) || 15 * 60 * 1000;
const SEEN_MAX = Number(process.env.EVENT_DEDUP_MAX) || 10000;
const seenEventIds = new Map();

// Rejection visibility without log spam: one error-log row per
// (reason, eventType) per window; repeats only bump a counter.
const REJECT_LOG_WINDOW_MS = Number(process.env.EVENT_REJECT_LOG_WINDOW_MS) || 5 * 60 * 1000;
const rejectLogTracker = new Map(); // key → { at, suppressed }

function rememberSeen(eventId) {
  seenEventIds.set(eventId, Date.now());
  if (seenEventIds.size > SEEN_MAX) {
    const oldest = seenEventIds.keys().next().value;
    seenEventIds.delete(oldest);
  }
}

function isDuplicate(eventId) {
  const at = seenEventIds.get(eventId);
  if (at === undefined) return false;
  if (Date.now() - at > SEEN_TTL_MS) {
    seenEventIds.delete(eventId);
    return false;
  }
  return true;
}

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

/** Test/ops hook: reset dedup + rejection-log state (never touches rules). */
export function resetEventBusState() {
  seenEventIds.clear();
  rejectLogTracker.clear();
}

// ---------------------------------------------------------------------------
// Contract helpers (pure, unit-tested)
// ---------------------------------------------------------------------------

function isObjectIdLike(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') {
      try {
        return /^[0-9a-fA-F]{24}$/.test(value.toHexString());
      } catch {
        return false;
      }
    }
    if (value instanceof String) return isObjectIdLike(String(value));
    return false;
  }
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
}

/** Canonical JSON with sorted keys; Dates/ObjectIds normalized to strings. */
export function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value.toHexString === 'function') {
    try {
      return JSON.stringify(value.toHexString());
    } catch {
      return 'null';
    }
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Deterministic content-hash id: same logical event → same id. */
export function buildEventId({ eventType, tenantId, branchId, actorId, aggregateType, aggregateId, occurredAt, metadata }) {
  const canonical = [
    EVENT_SCHEMA_VERSION,
    String(eventType),
    String(tenantId ?? ''),
    String(branchId ?? ''),
    String(actorId ?? ''),
    String(aggregateType ?? ''),
    String(aggregateId ?? ''),
    new Date(occurredAt).getTime(),
    stableStringify(metadata ?? {}),
  ].join('|');
  return `evt_${crypto.createHash('sha1').update(canonical).digest('hex').slice(0, 24)}`;
}

function asDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Normalize any producer input (new contract or legacy shape) into the
 * stable contract. Returns `{ ok: true, event }` or
 * `{ ok: false, error, reason }` — never throws for malformed input.
 */
export function normalizeEvent(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, reason: 'not-an-object', error: 'Event must be an object' };
  }

  const isNewShape = input.eventType !== undefined || input.eventId !== undefined
    || input.schemaVersion !== undefined || input.metadata !== undefined
    || input.tenantId !== undefined;

  let draft;
  if (isNewShape) {
    draft = {
      eventType: input.eventType,
      tenantId: input.tenantId ?? null,
      branchId: input.branchId ?? null,
      actorId: input.actorId ?? null,
      aggregateType: input.aggregateType ?? null,
      aggregateId: input.aggregateId ?? null,
      occurredAt: input.occurredAt,
      schemaVersion: input.schemaVersion ?? EVENT_SCHEMA_VERSION,
      metadata: input.metadata ?? {},
      eventId: input.eventId,
    };
  } else {
    // Legacy adapter: { type, tenant, branch, data, occurredAt }.
    const data = (input.data !== null && typeof input.data === 'object' && !Array.isArray(input.data))
      ? input.data
      : {};
    draft = {
      eventType: input.type,
      tenantId: input.tenant ?? null,
      branchId: input.branch ?? null,
      actorId: null,
      aggregateType: data.aggregateType ?? null,
      aggregateId: data.aggregateId ?? null,
      occurredAt: input.occurredAt,
      schemaVersion: EVENT_SCHEMA_VERSION,
      metadata: data,
      eventId: undefined,
    };
  }

  if (typeof draft.eventType !== 'string' || draft.eventType.trim() === '') {
    return { ok: false, reason: 'missing-event-type', error: 'eventType is required' };
  }
  draft.eventType = draft.eventType.trim();

  if (draft.schemaVersion !== EVENT_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'unsupported-schema-version',
      error: `Unsupported event schemaVersion ${String(draft.schemaVersion)} (expected ${EVENT_SCHEMA_VERSION})`,
    };
  }

  // Tenant-owned events require a well-formed tenant id. Platform-wide
  // events (no tenant scope) are not produced yet but stay expressible.
  if (draft.tenantId === null || draft.tenantId === undefined) {
    return { ok: false, reason: 'missing-tenant', error: 'tenantId is required for tenant-owned events' };
  }
  if (!isObjectIdLike(draft.tenantId)) {
    return { ok: false, reason: 'malformed-tenant-id', error: 'tenantId must be a valid ObjectId' };
  }

  for (const [field, value] of [['branchId', draft.branchId], ['actorId', draft.actorId], ['aggregateId', draft.aggregateId]]) {
    if (value !== null && value !== undefined && !isObjectIdLike(value)) {
      return { ok: false, reason: `malformed-${field}`, error: `${field} must be a valid ObjectId when present` };
    }
  }

  // Aggregate pair completeness: half an aggregate reference is a bug.
  const hasAggType = draft.aggregateType !== null && draft.aggregateType !== undefined && String(draft.aggregateType) !== '';
  const hasAggId = draft.aggregateId !== null && draft.aggregateId !== undefined;
  if (hasAggType !== hasAggId) {
    return {
      ok: false,
      reason: 'incomplete-aggregate-ref',
      error: 'aggregateType and aggregateId must be provided together',
    };
  }
  if (hasAggType && typeof draft.aggregateType !== 'string') {
    return { ok: false, reason: 'invalid-aggregate-type', error: 'aggregateType must be a string' };
  }

  const occurredAt = asDate(draft.occurredAt) || new Date();

  if (draft.metadata === null || typeof draft.metadata !== 'object' || Array.isArray(draft.metadata)) {
    return { ok: false, reason: 'invalid-metadata', error: 'metadata must be a plain object' };
  }

  let eventId = draft.eventId;
  if (eventId !== undefined && eventId !== null) {
    if (typeof eventId !== 'string' || eventId.trim() === '' || eventId.length > 128) {
      return { ok: false, reason: 'invalid-event-id', error: 'eventId must be a non-empty string (max 128 chars)' };
    }
    eventId = eventId.trim();
  } else {
    eventId = buildEventId({
      eventType: draft.eventType,
      tenantId: draft.tenantId,
      branchId: draft.branchId,
      actorId: draft.actorId,
      aggregateType: draft.aggregateType,
      aggregateId: draft.aggregateId,
      occurredAt,
      metadata: draft.metadata,
    });
  }

  const event = {
    eventId,
    eventType: draft.eventType,
    tenantId: draft.tenantId,
    branchId: draft.branchId ?? null,
    actorId: draft.actorId ?? null,
    aggregateType: hasAggType ? String(draft.aggregateType) : null,
    aggregateId: hasAggId ? draft.aggregateId : null,
    occurredAt,
    schemaVersion: EVENT_SCHEMA_VERSION,
    metadata: draft.metadata,
    // Legacy aliases — existing consumers (Automation engine, crons/tests)
    // keep working without modification.
    type: draft.eventType,
    tenant: draft.tenantId,
    branch: draft.branchId ?? null,
    data: draft.metadata,
  };
  return { ok: true, event };
}

// ---------------------------------------------------------------------------
// Persistence + delivery
// ---------------------------------------------------------------------------

/**
 * Record a structured, PHI-free rejection through the error-log pipeline.
 * Deduplicated per (reason, eventType) per window so a broken producer loops
 * loudly once, then stays quiet while remaining countable.
 */
function recordRejection(reason, error, input) {
  const eventType = input && typeof input === 'object'
    ? (input.eventType ?? input.type ?? 'unknown')
    : 'unknown';
  const key = `${reason}:${String(eventType)}`;
  const now = Date.now();
  const tracked = rejectLogTracker.get(key);
  if (tracked && now - tracked.at < REJECT_LOG_WINDOW_MS) {
    tracked.suppressed += 1;
    return { logged: false, suppressed: tracked.suppressed };
  }
  rejectLogTracker.set(key, { at: now, suppressed: 0 });
  logError(new Error(`[EventBus] rejected event: ${error}`), {
    context: 'EventBus.reject',
    reason,
    eventType: String(eventType),
    schemaVersion: input?.schemaVersion ?? null,
  });
  return { logged: true, suppressed: 0 };
}

/**
 * Persist a single event to the Event Log. Never throws — failures are logged
 * so a broken Mongo write cannot break the originating business flow.
 * A duplicate-key hit on the eventId unique index means a redelivery that
 * slipped past the in-memory seen-set: swallowed quietly as a duplicate.
 */
async function persistEvent(event) {
  try {
    // M5: PHI is stripped from the persisted copy so the audit log is safe at
    // rest. In-memory handlers still receive the full metadata object
    // (automation engine needs {{patient.phone}} for WhatsApp).
    await EventLog.create({
      eventId: event.eventId,
      schemaVersion: event.schemaVersion,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      actorId: event.actorId,
      type: event.eventType,
      tenant: event.tenantId,
      branch: event.branchId,
      data: stripPHI(event.metadata || {}),
      occurredAt: event.occurredAt,
    });
    return { persisted: true, duplicate: false };
  } catch (err) {
    if (err && (err.code === 11000 || /duplicate key/i.test(err.message || ''))) {
      return { persisted: false, duplicate: true };
    }
    logError(err, { context: 'EventLog.persist', type: event.eventType, eventId: event.eventId });
    return { persisted: false, duplicate: false };
  }
}

/**
 * Publish a business event. Accepts the stable contract or the legacy shape
 * (normalized centrally). Never throws. Returns a result object:
 *   { status: 'delivered'|'rejected'|'duplicate', eventId?, error? }
 * Handlers (incl. the Automation engine) receive the normalized event with
 * legacy aliases, and run sequentially as before.
 */
export async function publishEvent(input) {
  const normalized = normalizeEvent(input);
  if (!normalized.ok) {
    recordRejection(normalized.reason, normalized.error, input);
    return { status: 'rejected', error: normalized.error, reason: normalized.reason };
  }
  const event = normalized.event;

  // Stamp the resolved identity back onto the caller's object (when
  // mutable) so redelivering the SAME object — the classic at-least-once
  // retry — carries the same eventId and deduplicates instead of hashing a
  // fresh occurredAt into a brand-new identity.
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    try {
      if (input.eventId === undefined || input.eventId === null) input.eventId = event.eventId;
    } catch {
      /* frozen/sealed input — redelivery then needs the explicit id */
    }
  }

  if (isDuplicate(event.eventId)) {
    return { status: 'duplicate', eventId: event.eventId };
  }
  rememberSeen(event.eventId);

  const stored = await persistEvent(event);
  if (stored.duplicate) {
    return { status: 'duplicate', eventId: event.eventId };
  }

  const handlers = [...(subscribers.get(event.eventType) || []), ...wildcardSubscribers];
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (err) {
      logError(err, { context: 'EventBus.handler', type: event.eventType, eventId: event.eventId });
    }
  }
  return { status: 'delivered', eventId: event.eventId };
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
