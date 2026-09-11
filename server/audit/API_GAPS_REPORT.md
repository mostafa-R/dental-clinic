# API Gaps Report

**Date:** 2026-09-11 (regenerated after RBAC verification)
**Scope:** Swagger documentation gaps, RBAC findings (verified against source), monitoring instrumentation issues, and architecture notes.
**Method:** Every RBAC claim below was re-verified against the actual route files + runtime router introspection (`gated-routes.json`). No gaps are assumed from endpoint naming.

---

## 1. Swagger Documentation Gaps

### 1.1 Undocumented Endpoint — RESOLVED

| Method | Path | Module | Status |
|--------|------|--------|--------|
| GET | `/api/v1/site/analytics/platform/roles` | platformAnalyticsRoutes | **Fixed on 2026-09-11** — `@swagger` block added in `modules/site/platformAnalytics/platformAnalytics.routes.js` |

After the fix: **220 / 220** code operations are documented. Parity check (spec ↔ runtime router): `MISSING = 0`, `SPEC-ONLY = 0`.

### 1.2 Ghost Paths (0)

All 220 documented operations map to real code endpoints. No phantom documentation exists.

### 1.3 Double-Prefix Artifact (historical)

An earlier analysis flagged `GET /api/v1/api/health` and `GET /api/v1/api/metrics` as "ghost" paths. This was a canonicalization artifact — the actual swagger blocks correctly document `/api/health` and `/api/metrics` (unversioned). No fix needed.

---

## 2. RBAC / Authorization — Verified Findings

### 2.0 Verification outcome (IMPORTANT)

A previous draft of this report listed 12 "unauthorized" routes (refund, wallet ×2, installments ×4, platform analytics ×12, search). **Every one of those was re-checked against the actual route files and is protected.** The draft relied on a gate-detector that only matched inline `checkPermission('m','a')` and missed `checkAnyPermission([[...]])` and router-level `router.use(gate)`. Those findings are **withdrawn** — no code changes were made for them.

### 2.1 Clinic Endpoints Without `checkPermission` (verified: nothing to fix)

All 134 `protect`-gated clinic routes, minus 4 intentional public auth endpoints, carry an RBAC gate:

- 125× `checkPermission(module, action)` (`permissionMiddleware`)
- 6× `checkAnyPermission([[m,a],...])` (`anyPermissionMiddleware`): wallet/transactions (accounting:update OR billing:delete), installments ×4 (billing OR installments read/create/update), refund (billing:delete OR accounting:update)
- 3× "protect only" — `auth/me`, `auth/my-permissions`, `auth/preferences` — all self-scoped reads/updates of the caller's own record. **Intentionally no RBAC.**

### 2.2 Platform Analytics (verified: fully gated)

`modules/site/platformAnalytics/platformAnalytics.routes.js`:
- Router level: `router.use(protectSite)` + `router.use(authorizeSite('super_admin', 'admin', 'support'))` (lines 24–25)
- Per-route: `requireSitePermission(SITE_PERMISSIONS.…)` on all 12 aggregate dashboards
- `GET /roles`: protected by the router-level gates; returns the static `SITE_ROLES` constant (3 string values), no tenant/patient data. A per-route `requireSitePermission` is **not** needed here; role metadata is not an analytics dashboard. (Noted in docs as "Site auth (module-level)".)

### 2.3 Site 2FA management (verified: protected)

`site2fa.routes.js:91` applies `router.use(protectSite)` before `/status`, `/setup`, `/verify`, `/disable`. Only `/verify-login` is public (challenge-token flow). Runtime introspection lists these as gate-less only because it does not descend into `router.use()`; source is authoritative and confirms the mounts.

### 2.4 Verdict

**No confirmed authorization gap exists in the current backend.** No `checkPermission`/`authorizeSite` code changes are required. The remaining to-dos are documentation-only.

---

## 3. Monitoring Instrumentation Issues

### 3.1 Memory Check (96% → Unhealthy)

`healthMonitor.js:162-187` computes `heapUsedPercent = (heapUsed / heapTotal) * 100`. Thresholds: `> 90%` unhealthy, `> 70%` degraded. This reflects genuine heap pressure in the running node, not a code bug.

### 3.2 Error Rate (48.78%) vs totalErrors (0) — two different systems

- `perfMonitor.totals.totalErrors` counts HTTP responses with `statusCode >= 400` (includes 401/403/404/422 client errors).
- `errorMonitor` counts only unhandled exceptions reaching the Express error handler.
High 4xx rate with zero thrown exceptions is expected (auth/validation failures), not an anomaly.

### 3.3 Cache Hit Rate (0%) — no Redis traffic

`healthMonitor.js:140` falls back to 0% when Redis has no hit/miss counters. Correct with no connected instance.

### 3.4 DB totalQueries (0) — **implemented 2026-09-11**

The `mongoose.set('debug')` hook has been **replaced** with MongoDB driver command-monitoring events (`commandStarted`/`commandSucceeded`/`commandFailed`) attached to `mongoose.connection.getClient()` in `utils/dbMonitor.js`. Query counting, durations, slow-query detection and failure counts now work in production without requiring validate/debug mode. `getDbStats()` also reports `summary.source = 'driver-command-monitoring'` and per-query `errors`.

### 3.5 Disk Space (**implemented 2026-09-11**)

`healthMonitor.js` now performs a **real** disk check via Node's built-in `fs.promises.statfs` on `process.env.MONITOR_DISK_PATH || process.cwd()` and reports `free`/`total`/`used`/`usedPercent`. Status thresholds: `> 85%` used → degraded, `> 95%` → unhealthy. The previous `Simulated - 50GB` placeholder is removed.

---

## 4. Architectural Concerns

### 4.1 Dual-Mount Router

The v1 router is mounted at both `/v1` and `/` (`routes.js`), doubling reachable URLs from 220 to 438. Backward-compat only; new clients should use `/api/v1`. **Deprecation applied 2026-09-11**: alias traffic now receives an RFC 5789 `Deprecation: true` header and a one-time startup warning, and contract rule §4.3 forbids new endpoints on the alias.

### 4.2 In-Memory Monitoring Only — **addressed 2026-09-11**

perfMonitor/errorMonitor/dbMonitor still use in-process maps for the *live* per-process view, but a new `utils/redisMetrics.js` exporter now flushes metric deltas into Redis (additive counters, 7-day TTL) on a 30s interval (`startMetricsExport()`, started from `server.js`). `/api/metrics` now includes a `cluster` section (`getClusterMetrics()`) aggregating across all publishing workers, so stats are shared across workers and survive a worker restart. No-op (reports `shared:false`) when Redis is down.

### 4.3 No Inbound Webhook Routes

No external-service webhook endpoints. WhatsApp uses client-side QR pairing; automation `webhook` is an outbound SSRF-guarded action type, not a route.

---

## 5. Summary of Required Fixes

| Priority | Item | Effort | Status |
|----------|------|--------|--------|
| High | Add `@swagger` block for `GET /api/v1/site/analytics/platform/roles` | 5 min | ✅ Done |
| — | `checkPermission` on refund/wallet/installments (claimed gap) | — | ❌ Not needed (verified gated) |
| — | `authorizeSite` on platform analytics (claimed gap) | — | ❌ Not needed (verified gated) |
| Medium | Replace simulated disk check with real implementation (`fs.statfs`) | 30 min | ✅ Done |
| Medium | Replace `mongoose.set('debug')` with production DB monitoring (driver events) | 1 hr | ✅ Done |
| Low | Deprecate `/api` alias in favor of single `/api/v1` | Design | ✅ Done (`routes.js` — `Deprecation` header + one-time log; new endpoints still must be `/api/v1` only) |
| Low | Redis-backed metrics for multi-worker deployments | 2 hr | ✅ Done (`utils/redisMetrics.js` — 30s delta exporter + `cluster` block in `/api/metrics`) |
| Low | Align swagger `security` scheme refs (`siteAuth` → `siteCookieAuth`) | 30 min | ✅ Done (all 74 refs → `bearerAuth` + `siteCookieAuth`; `openapi.yaml` regenerated) |