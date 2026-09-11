# API Audit Report — Dental Clinic Server

**Date:** 2026-09-11  
**Auditor:** Automated code-level audit (source parsing + OpenAPI spec generation)

---

## Executive Summary

| Metric | Count |
|---|---|
| **Registered Express route layers** | 438 |
| **Unique canonical HTTP operations** | 220 |
| **Reachable URL variants** (with `/api` alias) | 438 |
| **OpenAPI spec operations** | 220 |
| **OpenAPI spec paths** | 165 |
| **Code paths (canonical)** | 165 |

> The v1 router is mounted at **both** `/v1` and `/` under `/api`, so each v1 operation is reachable via two prefixes: `/api/v1/...` (canonical) and `/api/...` (backward-compatible alias). Health and metrics are mounted directly on the apiRouter, reachable only at `/api/health` and `/api/metrics`.

---

## Method Breakdown

| Method | Code ops | Spec ops | Delta |
|--------|----------|----------|-------|
| GET | 101 | 101 | 0 |
| POST | 61 | 61 | 0 |
| PATCH | 23 | 23 | 0 |
| PUT | 16 | 16 | 0 |
| DELETE | 19 | 19 | 0 |
| **Total** | **220** | **220** | **0** |

---

## Realm Split

| Realm | Operations | Mount prefix |
|-------|-----------|--------------|
| Clinic | 138 | `/api/v1/*` (non-site) |
| Site (admin) | 80 | `/api/v1/site/*` |
| Root (unversioned) | 2 | `/api/health`, `/api/metrics` |

---

## Authentication & Authorization

| Category | Count | Description |
|----------|-------|-------------|
| **Public** | 10 | No auth required: clinic auth/login, auth/logout, auth/refresh, auth/verify-impersonation (4); site auth/login, site auth/refresh, site auth/recover/initiate, site auth/recover/verify (4); site 2fa/verify-login challenge (1); /api/health (1) |
| **Clinic auth** | 134 | `protect` middleware (JWT tenant session), of which 131 also carry RBAC (`checkPermission`×125, `checkAnyPermission`×6) |
| **Site auth** | 75 | `protectSite` middleware — 4 inline in route stack + 71 behind module-level `router.use(protectSite)` across the site sub-routers; includes `/api/metrics` |
| **RBAC-protected** | clinic 131 + site 68 | Clinic: `permissionMiddleware` 125 + `anyPermissionMiddleware` 6. Site: `authorizeSiteMiddleware` 57 + `requireSitePermissionMiddleware` 12 (+ overlapping) |

### RBAC Verification Note

Every RBAC claim in this report was **verified against the actual route source files**, not inferred from endpoint paths or a single gate-matching pass. Notable verifications:

- **wallet / installments / refund** — all carry `checkAnyPermission([[billing,…],[installments,…]])` or `checkAnyPermission([[billing,delete],[accounting,update]])` (see `wallet.routes.js`, `installmentPlan.routes.js`, `invoice.routes.js:444`). Earlier "no checkPermission" flags were false positives from a detector that only recognized inline `checkPermission('m','a')`.
- **platform analytics** — protected by router-level `protectSite` + `authorizeSite('super_admin','admin','support')` plus per-route `requireSitePermission` (`platformAnalytics.routes.js:24-25`).
- **site 2FA management** — `site2fa.routes.js:91` applies module-level `protectSite`; only `/verify-login` is public (challenge-token).
- **Intentionally gate-less** — only `auth/me`, `auth/my-permissions`, `auth/preferences` (self-scoped) and the 10 public auth/health endpoints.

### RBAC Granularity

- **53 unique permission strings** used across clinic endpoints (e.g. `patients.read`, `billing.create`, `emr.delete`, `roles.update`)
- **authorizeSite roles**: `super_admin`, `admin`, `support` (various combos per endpoint)
- **No doctor-level permission strings** — doctor scoping is handled in handler logic via `req.user.roleId`
- **Tenant isolation**: enforced by `protect` middleware (JWT tenant claim), not per-route
- **Branch isolation**: enforced in controller logic (branch-scoped queries)

---

## Swagger Coverage

| Status | Count | Percentage |
|--------|-------|-----------|
| Documented & implemented | 220 | 100% |
| **Undocumented** (implemented, missing swagger) | 0 | 0% |
| **Ghost** (documented, not implemented) | 0 | 0% |

**Coverage status:** **100% parity** — `GET /api/v1/site/analytics/platform/roles` received its missing `@swagger` block on 2026-09-11. Parity check (spec ↔ runtime router introspection): MISSING = 0, SPEC-ONLY = 0.

---

## Special Endpoint Categories

| Category | Count | Endpoints |
|----------|-------|-----------|
| **Upload** | 1 | `POST /api/v1/emr/attachments/upload` (multer single file) |
| **Webhook (inbound)** | 0 | No inbound webhook routes registered |
| **Webhook (action type)** | — | `webhook` exists as an automation action type, not a route |
| **Socket.IO events** | 37 unique | Real-time: `user:created`, `patient:created`, `queue.status.changed`, `chat:read`, etc. |
| **EventBus publish types** | 7 unique | `appointment.no_show`, `consent.expired`, `consent.signed`, `installment.overdue`, `inventory.low_stock`, `invoice.paid`, `patient.created` |

### Socket.IO Events (37)

Events emitted via `emitToBranch`, `emitToTenantQueue`, `emitToChat`:
`appointment:statusChanged`, `automation:notify`, `branch:created/updated/deleted`, `chart:updated`, `chat:read`, `commission:updated`, `dayclose:closed`, `drawing:created/deleted`, `expense:created/deleted`, `installment.overdue/created/paid/updated`, `inventory:created/updated/deleted`, `patient:archived/created/merged/updated`, `payment.recorded`, `queue.status.changed`, `role:created/updated/deleted`, `stock.expired/expiring/low`, `user:created/updated/deleted/toggled`, `wallet:updated`

### EventBus Publish Types (7)

Published via `publishEvent()`:
`appointment.no_show`, `consent.expired`, `consent.signed`, `installment.overdue`, `inventory.low_stock`, `invoice.paid`, `patient.created`

---

## Mount Topology

```
app.js
  └── /api  →  routes/routes.js (apiRouter)
                  ├── /health        → publicHealthResponse
                  ├── /metrics       → protectSite + authorizeSite('super_admin') → metricsResponse
                  ├── /v1  →  v1 router (41 sub-routers, 218 operations)
                  └── /   →  same v1 router (backward-compatible alias)
```

### Canonical vs Alias

Every v1 endpoint has **two reachable prefixes**:
- **Canonical**: `/api/v1/{path}` — use this in all new frontend code
- **Alias**: `/api/{path}` — backward-compatible, do not use in new code

This is counted as **1 operation** throughout the audit (not 2).

---

## Module Route Counts

| Module | File | Operations |
|--------|------|-----------|
| auth | auth.routes.js | 7 |
| users | user.routes.js | 7 |
| branches | branch.routes.js | 4 |
| dashboard | dashboard.routes.js | 1 |
| patients | patient.routes.js | 7 |
| appointments | appointment.routes.js | 8 |
| billing | invoice.routes.js | 9 |
| dental chart | dentalChart.routes.js | 3 |
| treatment plans | treatmentPlan.routes.js | 9 |
| prescriptions | prescription.routes.js | 6 |
| clinical notes | clinicalNote.routes.js | 5 |
| consents | consent.routes.js | 9 |
| attachments (EMR) | attachment.routes.js | 3 |
| accounting | accounting.routes.js | 13 |
| inventory | inventory.routes.js | 6 |
| automations | automation.routes.js | 10 |
| roles | role.routes.js | 11 |
| chat | chat.routes.js | 6 |
| search | search.routes.js | 1 |
| wallet | wallet.routes.js | 2 |
| installment plans | installmentPlan.routes.js | 4 |
| whatsapp | whatsapp.routes.js | 7 |
| site auth | siteAuth.routes.js | 7 |
| site branches | siteBranch.routes.js | 5 |
| site users | siteUser.routes.js | 1 |
| site tenants | site.routes.js | 9 |
| site admins | siteAdmin.routes.js | 6 |
| platform plans | plan.routes.js | 5 |
| platform settings | platformSetting.routes.js | 2 |
| site analytics | siteAnalytics.routes.js | 3 |
| site 2FA | site2fa.routes.js | 5 |
| site feature flags | siteFeatureFlag.routes.js | 3 |
| site health | siteHealth.routes.js | 1 |
| site impersonation | siteImpersonation.routes.js | 2 |
| site quarantine | siteQuarantine.routes.js | 3 |
| site error logs | siteErrorLog.routes.js | 3 |
| site subscriptions | siteSubscription.routes.js | 4 |
| site backups | siteBackup.routes.js | 3 |
| site perf | sitePerf.routes.js | 2 |
| site audit logs | siteAudit.routes.js | 3 |
| platform analytics | platformAnalytics.routes.js | 13 |
| Root (health/metrics) | routes.js | 2 |
