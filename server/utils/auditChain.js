import crypto from 'node:crypto';
import AuditLog from '../modules/site/audit/auditLog.model.js';

/**
 * Tamper-evident audit chain (H1).
 *
 * Every audit entry carries:
 *   - `prevHash`: HMAC-SHA256 of the immediately preceding entry (empty for
 *     the first entry in the chain).
 *   - `hash`:     HMAC-SHA256 of this entry's canonical content + prevHash.
 *
 * The HMAC key is NOT stored in MongoDB, so a party with write access to the
 * database cannot silently rewrite history: any edit breaks the chain, and a
 * verification pass re-derives every hash and reports the first mismatch.
 *
 * A deterministic (canonical) serialization is used so the same document
 * always produces the same hash regardless of insertion order or non-enumerable
 * key spreads.
 */

function getChainSecret() {
  return (
    process.env.AUDIT_CHAIN_SECRET ||
    process.env.BACKUP_ENCRYPTION_KEY ||
    process.env.JWT_SECRET
  );
}

/** Stable, deterministic JSON: sorted object keys, ObjectId -> hex string, Date -> ISO. */
export function canonicalize(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString('hex'));
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectID' || (value.toString && /^[0-9a-f]{24}$/i.test(value.toString() ?? ''))) {
      return JSON.stringify(value.toString());
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function createHmac(data) {
  return crypto.createHmac('sha256', getChainSecret()).update(data).digest('hex');
}

/** HMAC-SHA256 over canonical payload + prevHash. */
export function computeAuditHash(payload, prevHash = '') {
  const canonical = canonicalize(payload);
  return createHmac(`${canonical}\nprev:${prevHash}`);
}

/**
 * Append an entry to the audit chain. Internally reads the current chain head
 * atomically-enough (retry on concurrent appends), computes the hash and
 * stores both prevHash/hash.
 *
 * @param {object} entry - AuditLog document fields (admin/tenantActor, action,
 *   target, details, ...). Added by caller.
 * @returns {Promise<import('mongoose').Document>} the created AuditLog.
 */
export async function appendAuditLog(entry) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Chain head = the newest entry. createdAt order is authoritative.
    const head = await AuditLog.findOne({})
      .sort({ createdAt: -1, _id: -1 })
      .select('hash')
      .lean();

    const prevHash = head?.hash || '';
    const payload = {
      action: entry.action,
      admin: entry.admin ? String(entry.admin) : null,
      tenantActor: entry.tenantActor ? String(entry.tenantActor) : null,
      scope: entry.scope,
      adminEmail: entry.adminEmail,
      adminRole: entry.adminRole,
      target: entry.target,
      details: entry.details,
      requestId: entry.requestId,
      ip: entry.ip,
      userAgent: entry.userAgent,
    };
    const hash = computeAuditHash(payload, prevHash);

    const doc = await AuditLog.create({ ...entry, prevHash, hash });

    // If a concurrent append slid in between our read and insert, our prevHash
    // is now stale (chain fork). Detect and repair by re-appending.
    if (attempt < MAX_RETRIES - 1) {
      const latest = await AuditLog.findOne({})
        .sort({ createdAt: -1, _id: -1 })
        .select('_id hash')
        .lean();
      if (String(latest._id) === String(doc._id)) {
        return doc; // we are still the head — no fork
      }
      // Someone else appended after us — drop ours and redo so the chain is
      // linear. Only the new head is removed; the entry is re-inserted next loop.
      if (!process.env.AUDIT_CHAIN_KEEP_FORKS) {
        await AuditLog.deleteOne({ _id: doc._id }).catch(() => {});
      } else {
        return doc;
      }
      continue;
    }

    return doc;
  }

  // Fallback: last try without chain check (should be unreachable).
  const prevHash = (await AuditLog.findOne({}).sort({ createdAt: -1, _id: -1 }).select('hash').lean())?.hash || '';
  const payload = {
    action: entry.action,
    admin: entry.admin ? String(entry.admin) : null,
    tenantActor: entry.tenantActor ? String(entry.tenantActor) : null,
    scope: entry.scope,
    adminEmail: entry.adminEmail,
    adminRole: entry.adminRole,
    target: entry.target,
    details: entry.details,
    requestId: entry.requestId,
    ip: entry.ip,
    userAgent: entry.userAgent,
  };
  return AuditLog.create({ ...entry, prevHash, hash: computeAuditHash(payload, prevHash) });
}

/**
 * Walk the full chain and verify every link. Returns the first corrupted
 * entry (or null if the entire chain is intact) plus a count.
 *
 * Runs outside the request hot path (admin analytics / integrity audit).
 */
export async function verifyAuditChain() {
  const entries = await AuditLog.find({})
    .sort({ createdAt: 1, _id: 1 })
    .select('hash prevHash action admin tenantActor scope adminEmail adminRole target details requestId ip userAgent')
    .lean();

  let prevHash = '';
  for (const e of entries) {
    const payload = {
      action: e.action,
      admin: e.admin ? String(e.admin) : null,
      tenantActor: e.tenantActor ? String(e.tenantActor) : null,
      scope: e.scope,
      adminEmail: e.adminEmail,
      adminRole: e.adminRole,
      target: e.target,
      details: e.details,
      requestId: e.requestId,
      ip: e.ip,
      userAgent: e.userAgent,
    };
    if (e.prevHash !== prevHash) {
      return {
        valid: false,
        errors: [`Chain break: entry ${e._id} expected prevHash ${prevHash}, found ${e.prevHash}`],
        checked: entries.length,
      };
    }
    const expected = computeAuditHash(payload, prevHash);
    if (e.hash !== expected) {
      return {
        valid: false,
        errors: [`Hash mismatch: entry ${e._id} (${e.action}) has been tampered with`],
        checked: entries.length,
      };
    }
    prevHash = e.hash;
  }

  return { valid: true, errors: [], checked: entries.length };
}