# Backend API Contract — Freeze Manifest

**Contract version:** `v1.0.1` (re-frozen)
**Freeze date:** 2026-09-11 (initial) / 2026-09-11 (re-freeze v1.0.1)
**Repo commit ref:** `401b553` (HEAD at re-freeze; initial freeze was at `079bfde`)
**Spec file:** `server/audit/contract/openapi.frozen.yaml` (SHA-256 `95E9C598A8520EC90EECFD50F92DF2FC3BA287B9B27440AD8DE8D7C58FFD0417`, 11,902 lines, 354,523 bytes)

---

## 1. What is frozen

The **HTTP API contract** of the Dental OS backend, expressed as the OpenAPI 3.0.3 document generated directly from the runtime swagger spec (`swagger.js`, which aggregates per-module `@swagger` blocks). The freeze covers:

- **Route surface**: method + canonical path (`/api/v1/...`) for every operation. `/api/...` is a backward-compatible alias of the same v1 router (same handler), **not** a distinct endpoint.
- **Authentication & authorization contract**: cookie-based sessions (`access_token`/`refresh_token` for clinic, `site_access`/`site_refresh` for site admins), `_csrf` double-submit cookie, per-route RBAC (`checkPermission` / `checkAnyPermission` / `authorizeSite` / `requireSitePermission` / `require2fa`).
- **Request/response envelope**: `{ success, data, meta }` success, `{ success: false, message, details }` errors, `meta.pagination = { page, limit, total, pages }`.
- **Input validation contracts** (zod schemas behind `validate`).

## 2. Contract baseline (verified 2026-09-11)

| Metric | Value |
|---|---|
| Canonical operations | **220** (GET 101, POST 61, PATCH 23, PUT 16, DELETE 19) |
| Reachable URL variants | 438 (218 ops × 2 mounts + `/api/health` + `/api/metrics`) |
| OpenAPI paths / operations | 165 / **220** |
| Spec ↔ code parity | **MISSING = 0, SPEC-ONLY = 0** (100%) |
| Swagger schemas / responses / parameters | 52 / 5 / 3 |
| Security schemes | `bearerAuth`, `cookieAuth`, `siteCookieAuth` |
| Realm split | Clinic 138, Site/Admin 80, Infra 2 (health, metrics) |
| Public endpoints | 10 (clinic auth ×4, site auth recover/login/refresh ×4, site 2FA verify-login challenge, `/api/health`) |
| RBAC on clinic routes | 131/134 `protect`-gated routes carry RBAC (`checkPermission`×125, `checkAnyPermission`×6); 3 self-scoped (`auth/me`, `my-permissions`, `preferences`) |
| RBAC on site routes | 68 (authorizeSite ×57, requireSitePermission ×12 with overlap) + module-level `protectSite` on 15 site sub-routers |

## 3. Regeneration & verification method

- `openapi.yaml` is **generated**, not hand-maintained: `node scripts/dump-swagger.mjs` loads `server/swagger.js` in-process and dumps the spec via `js-yaml` → `server/audit/openapi.yaml` (see `scripts/dump-swagger.mjs`).
- Runtime gate/route reality is captured by `audit-gates.mjs` (patches the `router` package to record mounts, walks the mounted tree, normalizes aliases) → `gated-routes.json` (220 rows).
- Parity is checked by `verify-parity.mjs`: every code route must exist in the spec and vice-versa.
  - > Note: `audit-gates.mjs` / `verify-parity.mjs` are not committed to this repo. The v1.0.1 re-freeze reproduced the same checks with an equivalent inline script (patches `router` 2.x `Router.prototype.use` to record mount paths since `Layer.path` is `undefined`, walks the mounted tree with `/v1` canonical + `/` alias dedup, normalizes `:param` → `{param}`) and compared against the regenerated spec: **MISSING=0, SPEC-ONLY=0**.
- Any edits go into the **route files' `@swagger` blocks**, then re-run the pipeline. Never edit `openapi.frozen.yaml` by hand.

## 4. Change control (post-freeze rules)

1. **Version bump required** for contract-affecting changes:
   - New, removed, or re-pathed endpoint (canonical `/api/v1/...`).
   - HTTP method change, or moving a route between auth realms (clinic ↔ site ↔ public).
   - Changing RBAC required to call an endpoint.
   - Changing response envelope shape, pagination metadata, or a required field in a documented schema.
2. **Backward-compatible additions** (new optional field in a response, new optional parameter, new endpoint) do **not** require a breaking bump, but must still be added to the spec and pass parity before merge.
3. **The `/api` alias must not carry new endpoints** — new endpoints go under `/api/v1` only. Since 2026-09-11 the alias also emits an RFC 5789 `Deprecation: true` response header (see `routes/routes.js`).
4. Any intentional deviation from this contract is a documented change (PR description must list it), followed by re-freeze:
   - regenerate `openapi.yaml`,
   - re-run `audit-gates.mjs` + `verify-parity.mjs`,
   - update `openapi.frozen.yaml` + this manifest (new version, new hash),
   - update `API_ENDPOINT_MATRIX.md`, `API_AUDIT_REPORT.md`, `API_GAPS_REPORT.md`, `FRONTEND_API_GUIDE.md` as needed.

## 5. Frozen artifacts

| File | Purpose |
|---|---|
| `openapi.frozen.yaml` | Immutable snapshot of the contract (this version) |
| `openapi.yaml` | Working copy — regenerated from `swagger.js`; the source of truth for tooling |
| `API_ENDPOINT_MATRIX.md` | Human-readable operation matrix with access tier per route |
| `API_AUDIT_REPORT.md` | Coverage, auth, security, realtime, cron baseline |
| `API_GAPS_REPORT.md` | Open (non-blocking) gaps + withdrawn false-positive findings |
| `FRONTEND_API_GUIDE.md` | Integration guide for frontend teams |

## 6. Freeze history

| Version | Date | Commit | Spec SHA-256 | Notes |
|---|---|---|---|---|
| v1.0.0 | 2026-09-11 | `079bfde` | `E8EE16A16CCB8C1C59CC15315DA04AE3A35EC22C1FC53B248C616E2475FB6304` | Initial freeze (working-tree state at `079bfde`). |
| v1.0.1 | 2026-09-11 | `401b553` | `95E9C598A8520EC90EECFD50F92DF2FC3BA287B9B27440AD8DE8D7C58FFD0417` | Re-freeze: regenerated `openapi.yaml` + `openapi.frozen.yaml` from current `swagger.js`. Runtime re-audit confirmed 220 ops with 100% spec↔code parity (MISSING=0, SPEC-ONLY=0; 218 v1 canonical + `/api/health` + `/api/metrics` = 220; 438 reachable). Frozen artifact now carries the aligned security scheme refs (`siteAuth` → `bearerAuth`/`siteCookieAuth`, 74 refs) that were already applied in the working spec but missing from the stale v1.0.0 snapshot. **Contract content is functionally unchanged — no endpoints, methods, RBAC, or schema shapes changed.** |