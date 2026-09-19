# Invalid-Input Campaign Report

**Scope:** test-only hardening proof — no production code was changed.
**Suite:** `server/__tests__/invalidInput.test.js` — **38 tests, all passing** (pure-logic / no DB).
**Regression:** full server suite **90 files / 1066 tests, all passing** (previous: 89 / 1028).
**Follow-up fix:** the P1 upload bug surfaced here was fixed separately and its tests flipped to clean-400 expectations — see the "Fix" section below.

---

## Per-category test counts

| # | Category | Tests added | Pass | What is proven |
|---|----------|-------------|------|----------------|
| 1 | Invalid FDI codes | 4 | 4/4 | `isValidFdi` boundaries (11–48 permanent only, decimals rejected), dental-chart `fdi` out-of-range/primary-dentition rejected with the `Invalid FDI tooth code` issue, treatment-plan item FDI validated |
| 2 | Past dates / outside-hours fields | 5 | 5/5 | Non-parseable datetimes rejected (`Invalid date/time`), `end` before/equal `start` rejected on `['end']`, slots must be int 1–3, `recallAfterDays` 0/731 + junk `recallType` rejected, empty query params coerce while bad page/limit bounds rejected |
| 3 | Negative/zero amounts & overpayment fields | 8 | 8/8 | `paymentSchema`/`refundSchema` reject 0/negative/non-numeric amounts and bad method/date/oversized reference, invoice item quantity 0 / negative unitPrice / negative discount, invoice over the item cap (`MAX_INVOICE_ITEMS`) and empty item array, discount cross-field rules (percentage without `discountRate`, both set, fixed with `discountRate`), empty update rejected, 1e309→Infinity rejected |
| 4 | Refund > paid | 0 (schema already prevents amounts ≤ 0; the service guarantee `refund cannot exceed paidAmount` is exercised end-to-end in `billingWorkflow.integration.test.js:318`) | — | covered by existing integration coverage, referenced not duplicated |
| 5 | Unbalanced journal | 5 | 5/5 | `postJournalEntry` rejects debit≠credit, <2 lines, zero totals, two-sided lines, unknown accounts, >0.01 drift — always 400, **before** any `JournalEntry.create`; every rejection is logged to `ErrorLog`; balanced entry persists with equal rounded totals and 200-char memo truncation |
| 6 | Fake files / magic bytes | 7 | 7/7 | Genuine PNG/JPEG/PDF/GIF(87+89)/WebP/DICOM headers pass; impostors renamed to `.png`, PDF/GIF/WebP/DICOM impostors, truncated byte- and match-form signatures, and unverifiable mimetypes are all rejected with clean 400s; oversized uploads rejected by the request-size limiter |
| 7 | XSS / HTML / very long input | 5 | 5/5 | L6 attachment URL rules: `javascript:`, `data:`, plain `http:` rejected; only `https://` or local `/api/` accepted; upsert without URL rejected; SOAP free-text capped at maxima; plain HTML is **accepted** at the API layer by design (neutralized downstream by React escaping) — documented posture |
| 8 | Duplicate events | 3 | 3/3 | Same event re-published within TTL → `{status:'duplicate'}`; at-least-once retry of the same object dedups on the stamped `eventId`; invalid events are rejected without throwing and the error message never echoes the PHI payload |
| 9 | Rate limit / 429 | 1 | 1/1 | The **general** `/api` limiter (not just the auth limiters already covered by `appRateLimit.test.js`) trips at 200 req/min on a fixed IP from a non-auth endpoint — 429, `success:false`, `RateLimit-Policy: 200` |
| 10 | 500 without secret leaks | 1 | 1/1 | Production opaque 500 response is exactly `{success, message}` — no `stack`, no `details`, no request headers |

**Total:** 38 new tests across 10 campaign categories (category 4 documented as already covered by integration tests, not duplicated).

---

## Fix applied after the campaign

### P1 upload bug — FIXED
`server/middleware/upload.js` **`assertFileSignature` crashed with a raw `TypeError` on match-form signatures** (`application/pdf`, `image/gif`, `image/webp`, `application/dicom`).

- Root cause: line 55 computed the probe length as `...signatures.map((s) => s.offset + s.bytes.length)`, but PDF/GIF/WebP/DICOM entries are `{ offset, match: '...' }` and have **no `.bytes`**, so `.bytes.length` threw before any sniffing — turning every such upload into a 500 instead of a clean 400.
- Fix: `s.offset + (s.bytes ? s.bytes.length : s.match.length)` — probe length now handles both signature forms.
- Verification (commit `fix: safely validate match-based upload signatures`):
  - all 4 match-form types (PDF/GIF/WebP/DICOM) now accept **valid** headers and reject **impostors/truncated** bytes with `400 ApiError` (`File content does not match type …`) — never a TypeError;
  - PNG/JPEG byte-form behavior unchanged;
  - no database `MedicalAttachment` row is created before the signature check passes, and the uploaded file is unlinked on failure (`attachment.routes.js:131-135`);
  - targeted runs green: attachment + PHI + queuePhiLeak + invalid-input (67 tests), full backend suite **90 files / 1066 tests**, security scan **100/100** (16 passed / 0 warnings / 0 failures).

## Findings

### Observation (low priority — deferred)
`server/modules/site/alert/siteAlert.routes.js` OpenAPI docblock uses compact YAML mappings the parser rejects (`YAMLSemanticError: Nested mappings are not allowed in compact mappings`), printed as stderr noise when `app.js` loads. Cosmetic (spec parser) — the generated route docs for the alert endpoints may be incomplete. Pre-existing from the Monitoring phase; deferred per triage.

### Verification notes (no action needed)
- `postJournalEntry` rejects with a 400 **before** creating the journal row and writes a `JOURNAL` `ErrorLog` row on every rejection — books cannot drift silently (BR-BL-05).
- Duplicate-event rejection is PHI-free: the returned error text is a fixed reason string and never echoes metadata like `patientPhone`/`patientName`.
- Very large numeric input (`1e309`) is rejected by the Zod number gates — no Infinity can reach persistence.
- Free-text HTML (e.g. `<script>` in diagnosis) is intentionally accepted by the API; storage/plumbing is safe, and escaping is the presentation layer's job (React auto-escapes). This matches the existing controller/UI contract.

---

## How to run

```bash
cd server
npx vitest run __tests__/invalidInput.test.js   # 38 tests
npm test                                        # full suite (90 files / 1066)
```