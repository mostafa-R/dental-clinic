# Invalid-Input Campaign Report

**Scope:** test-only hardening proof — no production code was changed.
**Suite:** `server/__tests__/invalidInput.test.js` — **38 tests, all passing** (pure-logic / no DB).
**Regression:** full server suite **90 files / 1066 tests, all passing** (previous: 89 / 1028).

---

## Per-category test counts

| # | Category | Tests added | Pass | What is proven |
|---|----------|-------------|------|----------------|
| 1 | Invalid FDI codes | 4 | 4/4 | `isValidFdi` boundaries (11–48 permanent only, decimals rejected), dental-chart `fdi` out-of-range/primary-dentition rejected with the `Invalid FDI tooth code` issue, treatment-plan item FDI validated |
| 2 | Past dates / outside-hours fields | 5 | 5/5 | Non-parseable datetimes rejected (`Invalid date/time`), `end` before/equal `start` rejected on `['end']`, slots must be int 1–3, `recallAfterDays` 0/731 + junk `recallType` rejected, empty query params coerce while bad page/limit bounds rejected |
| 3 | Negative/zero amounts & overpayment fields | 8 | 8/8 | `paymentSchema`/`refundSchema` reject 0/negative/non-numeric amounts and bad method/date/oversized reference, invoice item quantity 0 / negative unitPrice / negative discount, invoice over the item cap (`MAX_INVOICE_ITEMS`) and empty item array, discount cross-field rules (percentage without `discountRate`, both set, fixed with `discountRate`), empty update rejected, 1e309→Infinity rejected |
| 4 | Refund > paid | 0 (schema already prevents amounts ≤ 0; the service guarantee `refund cannot exceed paidAmount` is exercised end-to-end in `billingWorkflow.integration.test.js:318`) | — | covered by existing integration coverage, referenced not duplicated |
| 5 | Unbalanced journal | 5 | 5/5 | `postJournalEntry` rejects debit≠credit, <2 lines, zero totals, two-sided lines, unknown accounts, >0.01 drift — always 400, **before** any `JournalEntry.create`; every rejection is logged to `ErrorLog`; balanced entry persists with equal rounded totals and 200-char memo truncation |
| 6 | Fake files / magic bytes | 6 | 6/6 | Genuine PNG/JPEG byte-form headers pass; impostor renamed `.png`, truncated signature, and unverifiable mimetype all rejected with clean 400s — **plus one documented production bug (see Findings)** |
| 7 | XSS / HTML / very long input | 5 | 5/5 | L6 attachment URL rules: `javascript:`, `data:`, plain `http:` rejected; only `https://` or local `/api/` accepted; upsert without URL rejected; SOAP free-text capped at maxima; plain HTML is **accepted** at the API layer by design (neutralized downstream by React escaping) — documented posture |
| 8 | Duplicate events | 3 | 3/3 | Same event re-published within TTL → `{status:'duplicate'}`; at-least-once retry of the same object dedups on the stamped `eventId`; invalid events are rejected without throwing and the error message never echoes the PHI payload |
| 9 | Rate limit / 429 | 1 | 1/1 | The **general** `/api` limiter (not just the auth limiters already covered by `appRateLimit.test.js`) trips at 200 req/min on a fixed IP from a non-auth endpoint — 429, `success:false`, `RateLimit-Policy: 200` |
| 10 | 500 without secret leaks | 1 | 1/1 | Production opaque 500 response is exactly `{success, message}` — no `stack`, no `details`, no request headers |

**Total:** 38 new tests across 10 campaign categories (category 4 documented as already covered by integration tests, not duplicated).

---

## Findings

### BUG (P1, production — surfaced by this campaign)
`server/middleware/upload.js` **`assertFileSignature` crashes with a raw `TypeError` on match-form signatures** (`application/pdf`, `image/gif`, `image/webp`, `application/dicom`).

- Cause: line 55 computes the probe length as `Math.max(132, ...signatures.map((s) => s.offset + s.bytes.length))`, but PDF/GIF/WebP/DICOM entries are `{ offset, match: '...' }` — they have **no `.bytes`**, so `.bytes.length` throws before any sniffing happens.
- Consequence: uploading any PDF/GIF/WebP/DICOM file whose mimetype is verified by `assertFileSignature` raises a 500 (TypeError propagated), not a clean 400 — i.e. the "fake file" defence **partially fails open into a server error** for 4 of the 6 allowed upload types. PNG/JPEG (byte-form) work.
- Proven by two tests in the suite (`BUG (report): ...` and the DICOM offset-128 assertion) that pin the current behavior; they are labelled so the fix can flip them to 400-expectations.
- Suggested fix (Phase 3, out of scope for this test-only campaign): compute `probeLen` from `s.offset + (s.bytes?.length ?? s.match.length)` and add a regression test for each of the four match-form types.

### Observation (low priority)
`server/modules/site/alert/siteAlert.routes.js` OpenAPI docblock uses compact YAML mappings the parser rejects (`YAMLSemanticError: Nested mappings are not allowed in compact mappings`), printed as stderr noise when `app.js` loads. Cosmetic (spec parser) — the generated route docs for the alert endpoints may be incomplete. Pre-existing from the Monitoring phase, not introduced here.

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