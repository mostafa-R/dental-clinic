# Concurrency & Race-Condition Code Review Checklist

A reviewer or CI agent can mechanically run this checklist against any PR in this
repo. Each item is **yes/no per file/PR**. Severity badges match this project's
audit convention: 🔴 High / 🟠 Medium / 🟡 Low.

---

## 1. Read-then-write instead of atomic update

**Failure mode:** Two concurrent requests both read the same document, mutate it in
memory, and call `.save()`. The second write silently overwrites the first — the
"lost update" problem. Fatal when the field participates in an authorization
decision, a one-time-use guarantee, or a quota/limit.

**How to detect while reading a diff:**
Any `Model.findById()` (or `.findOne()`) followed later (even several lines later)
by mutating a field and calling `.save()`, where the mutated field is security-
or quota-sensitive. Look for patterns like:
```js
const doc = await Model.findById(id);
doc.field = newValue;
await doc.save();
```

**Worked example (prior bug — JWT refresh rotation):**
The site-admin refresh used to do:
```js
admin.tokenVersion += 1;
await admin.save();           // ← BUG: two concurrent refreshes both succeed
```
Fixed to atomic compare-and-swap (`siteAuth.service.js:69-80`):
```js
const updated = await SiteAdmin.findOneAndUpdate(
  { _id: admin._id, tokenVersion: expectedVersion },
  { $inc: { tokenVersion: 1 } },
  { returnDocument: 'after' },
);
// updated === null → someone else already rotated → 401
```

**Correct pattern to require:**
```js
const result = await Model.findOneAndUpdate(
  { _id: id, versionField: expectedValue },
  { $inc: { versionField: 1 } },
  { returnDocument: 'after' },
);
if (!result) {
  // Someone else already won this race.
  throw ApiError.conflict('...');
}
```
Treat a `null` result as "someone else already won" → 409/401, never silent fallthrough.

**PR checkbox:**
- [ ] Every read-then-write on a security/quota/one-time-use field has been
      converted to an atomic `findOneAndUpdate` (or equivalent) **OR** is wrapped
      in a transaction with the read re-done inside the session.

---

## 2. Check-then-act outside a transaction boundary

**Failure mode:** A guard clause reads from an in-memory document *before*
`withTransaction()` starts, then mutates and saves *inside* the transaction. The
gap between the check and the transaction start is exploitable by a concurrent
request.

**How to detect while reading a diff:**
Look for `if (...) throw ...` guard clauses that reference a document loaded
*outside* a `withTransaction` callback, where the corresponding state mutation
happens *inside* the callback.

**Worked example (prior bug — treatment-plan double-invoice):**
```js
// BEFORE fix: plan loaded outside transaction, check stale
const plan = await TreatmentPlan.findById(planId);
const alreadyInvoiced = plan.items.find(i => i.invoice);  // ← stale read
if (alreadyInvoiced) throw ApiError.conflict('...');

await withTransaction(async (session) => {
  // ... create invoice and link items ...
});
```
Fixed in `treatmentPlan.service.js:54-80`: the plan is re-read *inside* the
transaction with `.session(session)`, giving snapshot isolation that makes the
race impossible.

**Correct pattern to require:**
The guard and the mutation must be the *same* atomic operation — typically
`findOneAndUpdate` with an `$elemMatch` filter encoding the precondition, executed
inside the transaction's session, with a `null` result treated as a conflict.

**PR checkbox:**
- [ ] No guard clause operates on a document loaded before `withTransaction()`
      where the mutation happens inside the transaction. If the guard must be
      pre-transaction, the transaction re-reads and re-checks inside the session.

---

## 3. Asymmetric counters / slots

**Failure mode:** A counter or slot is incremented on creation but never
decremented on retirement (archive, delete, merge, cancel, expire, reject). The
counter permanently drifts from the real count, eventually locking tenants out of
their own quota.

**How to detect while reading a diff:**
For every `Counter.findOneAndUpdate(..., { $inc: { seq: 1 } })` (or `$inc` on any
counter/quota field), grep the entire codebase for the corresponding
`$inc: { seq: -1 }` (or equivalent release) on *every* code path that logically
retires the entity being counted.

**Worked example (prior bug — patient-slot counter):**
`createPatient` claimed a slot via `$inc: { seq: 1 }` but `archivePatient` and
`mergePatients` never released it, permanently locking tenants at their plan cap.
Fixed in `patient.controller.js:87-94` (`releasePatientSlot`) and called inside
both `archivePatient` (line 295) and `mergePatients` (line 508) within the same
transaction.

**Correct pattern to require:**
For every "claim a slot" call site, confirm:
1. Every lifecycle-ending state transition (archive, delete, merge, cancel, expire,
   reject) releases the slot **in the same transaction** as the state change.
2. No crash between increment and decrement can leak/double-free a slot.
3. Dashboard/analytics "used / limit" reports compute from the live entity count
   (source of truth) or are provably in sync with the counter.

**PR checkbox:**
- [ ] For every `$inc: { seq: 1 }` (slot/quota claim), there is a matching
      `$inc: { seq: -1 }` on every retirement path, in the same transaction.
- [ ] Usage reporting reads live counts (not a drift-prone separate counter),
      OR the counter and live count are provably always in sync.

---

## 4. Unique-constraint races surfaced as raw 500s

**Failure mode:** A "compute next version as max+1, then insert" pattern relies on
an application-level max query instead of the DB enforcing sequencing. Concurrent
creates both compute the same "next version," and the loser gets a raw `E11000`
duplicate-key error bubbling up as 500.

**How to detect while reading a diff:**
Look for: `const max = await Model.findOne(...).sort({ version: -1 })` followed by
`Model.create({ version: max + 1 })`, especially when the schema has a unique or
partial index on `(field, version)` or similar.

**Worked example (prior bug — consent versioning):**
```js
const latest = await Consent.findOne({ patient, type }).sort({ version: -1 });
const nextVersion = (latest?.version || 0) + 1;
await Consent.create({ ..., version: nextVersion }); // ← E11000 race
```
Fixed in `consent.controller.js:92-126` with a retry-on-E11000 loop that catches
the duplicate key, re-reads the max, and retries — ultimately returning 409 if
contention persists.

**Correct pattern to require:**
Either:
- Use an atomic `Counter.next()` sequence (like `patient_seq`, `invoice`, etc.),
- Or catch `E11000` explicitly and map it to 409 with a clear "retry" message.

Never let `E11000` surface as an unhandled 500.

**PR checkbox:**
- [ ] Any application-level `max + 1` sequence generation either uses atomic
      `Counter.next()` with session, OR has explicit E11000 handling mapped to
      409. No raw E11000 can reach the client as 500.

---

## 5. Idempotency / valid state-machine transitions under concurrency

**Failure mode:** A status-update endpoint doesn't check whether the current
record state still permits the transition. Two requests race to change dependent
state, or a stale read allows an invalid transition.

**How to detect while reading a diff:**
Any `doc.status = 'newStatus'; await doc.save()` where the guard checks only
permission (role), not domain state (the current `doc.status` value at the time
of the write).

**Worked example (prior bug — treatment item cancellation):**
`updateTreatmentItem` allowed `status: 'cancelled'` on an already-invoiced item,
because the check was on the in-memory `plan` loaded before the transaction. The
fix re-reads inside the transaction (snapshot isolation), making the stale read
impossible.

**Correct pattern to require:**
Guard clauses must check domain-state (current status), and that check should live
inside the same atomic operation as the transition where possible. For
`findOneAndUpdate`:
```js
const result = await Model.findOneAndUpdate(
  { _id: id, status: { $in: ['draft', 'sent'] } },  // precondition in filter
  { $set: { status: 'signed' } },
  { returnDocument: 'after' },
);
if (!result) throw ApiError.conflict('Transition no longer valid');
```

**PR checkbox:**
- [ ] Every status-transition endpoint encodes the precondition either in the
      `findOneAndUpdate` filter or in a transactional re-read — never relying
      solely on a pre-transaction in-memory check.

---

## 6. Async errors escaping unhandled in Express route handlers

**Failure mode:** `router.<verb>(path, async (req, res) => { throw ... })` mounted
without `asyncHandler` wrapping. Express 4 does not catch rejected promises — the
request hangs/leaks a socket instead of returning an error. (Express 5 handles
this natively.)

**How to detect while reading a diff:**
Any route registration where the handler is `async` but is NOT wrapped in
`asyncHandler` (or the project's equivalent). Quick check:
```bash
rg "router\.(get|post|put|patch|delete)\([^,]+,\s*async\s" --no-filename
```
Then verify each match is wrapped.

**Worked example (prior bug — enhanced RBAC controllers):**
Some `role.enhanced.controller.js` route handlers were mounted unwrapped,
causing unhandled promise rejections on permission-check failures.

**Correct pattern to require:**
Every async route handler is wrapped:
```js
router.get('/path', asyncHandler(async (req, res) => { ... }));
```
Or the project has migrated to Express 5 (confirm which, and flag non-conforming).

**PR checkbox:**
- [ ] Every `async` route handler in the changed files is wrapped in
      `asyncHandler` (or the project's convention). No unhandled promise
      rejections can escape.

---

## 7. Route-order shadowing hiding endpoints

**Failure mode:** A static path (`/matrix`, `/templates`) registered *after* a
dynamic path (`/:id`) on the same router. Express matches top-down, so `/:id`
captures the literal segment first.

**How to detect while reading a diff:**
On any router file that adds routes, verify that static/literal paths appear
before parametric `/:param` paths *on the same HTTP method*.

**Worked example (found alongside prior bugs):**
In `role.routes.js`, `/matrix` and `/templates` must precede `/:id` — confirmed
correct after audit.

**Correct pattern to require:**
```js
router.get('/static-path', handler);    // ← first
router.get('/:id', handler);            // ← after statics
```
Or constrain the dynamic segment with regex: `/:id([0-9a-fA-F]{24})`.

**PR checkbox:**
- [ ] No static route is shadowed by a `/:param` route on the same HTTP method
      and router.

---

## 8. Nested/serialized payloads bypassing sanitization

**Failure mode:** An emit/response helper sanitizes only the top-level object
(`payload.toJSON()`), while a nested field is a raw ODM document that the
sanitizer's recursion doesn't reach, leaking PHI.

**How to detect while reading a diff:**
Any `emitToBranch(channel, event, { nested: rawDoc })` or
`res.json({ data: rawDoc })` where the nested object is a Mongoose document
(not `.toJSON()` / `.toObject()`), especially when impersonation or PHI
restrictions are active.

**Worked example (prior bug — Socket.IO PHI leak):**
Emitting `{ patient }` (raw Mongoose doc) instead of `{ patient: patient.toJSON() }`
leaked PHI to impersonated sessions because `stripPHI` didn't recurse into raw
subdocs.

**Correct pattern to require:**
Call `.toJSON()` or `.toObject()` on every object before passing to a sanitizer or
emitter. Centralize sanitization as middleware so it can't be forgotten per-
controller.

**PR checkbox:**
- [ ] No Socket.IO emission or response body contains a raw Mongoose document
      that bypasses the project's recursive sanitizer (`stripPHI` or equivalent).

---

## Grep-Assisted Triage

Use these `ripgrep` patterns to shortlist suspicious code for each category above.

### Category 1 — Read-then-write
```bash
rg "\.save\(\)" -B5 -n modules/ services/ | rg -A5 "findById|findOne|\.find\("
```

### Category 2 — Check outside transaction
```bash
rg "withTransaction" -B10 -n modules/ | rg -B3 "if.*throw|\.invoice\b|\.status"
```

### Category 3 — Asymmetric counters
```bash
rg "\$inc.*seq.*1[^-]" --no-filename -n modules/ services/ core/
# Then grep for the matching -1 decrement per module:
rg "release.*Slot|\$inc.*-1|counter.*dec" -n modules/ services/
```

### Category 4 — max+1 sequencing
```bash
rg "sort.*-1.*version|version.*-1|\.sort\(\{.*:-1" -B3 -A3 -n modules/
rg "max\s*\+\s*1|latest.*version" -n modules/
```

### Category 5 — Status transitions without guard
```bash
rg "\.status\s*=" -B5 -n modules/ | rg -B3 "\.save\(\)"
# Cross-reference with the model's enum/transitions to find unguarded paths.
```

### Category 6 — Unwrapped async handlers
```bash
rg "router\.(get|post|put|patch|delete)\([^,]+,\s*async\s" -n routes/ modules/
# Verify each match is wrapped in asyncHandler.
```

### Category 7 — Route order
```bash
rg "router\.(get|post|put|patch|delete)\('/:" -n routes/
rg "router\.(get|post|put|patch|delete)\('/[^:]" -n routes/
# Confirm statics precede params per HTTP method per file.
```

### Category 8 — Raw docs in emit/response
```bash
rg "emitToBranch.*\{|emitToTenant.*\{" -A3 -n modules/ socket/
rg "sendSuccess\(res.*\{.*:\s*(?!.*toJSON|.*toObject|.*stripPHI|.*lean)" -n modules/
```
