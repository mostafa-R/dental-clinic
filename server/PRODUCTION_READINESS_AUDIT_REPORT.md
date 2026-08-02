# Dental OS — Backend Production-Readiness Audit Report

**Target:** `D:\Programing\dental clinic\server` (Node.js 22 / Express 5 / Mongoose 9 / ioredis / Socket.IO)
**Date:** 2026-08-02
**Method:** Full source inspection of every file in `server/` (all modules, middleware, utils, services, configs, routes, tests, deploy assets) plus the `dashboard/` frontend integration contract and repo/CI state. Nothing was modified. `PRODUCTION_READINESS_AUDIT.md` in the repo was treated as a prior draft and independently re-verified; several claims were corrected in this report.
**Repo state:** working tree is dirty relative to `HEAD` (40+ modified files, ~25 untracked files). All findings below refer to the **current working tree**, which is the audit target.

---

## 0. Executive Summary & Scorecard

The backend is a well-structured, defense-in-depth multi-tenant dental clinic SaaS ("Dental OS") with a parallel **platform administration** surface (tenants, subscriptions, plans, feature flags, backups, audit logs, 2FA, impersonation) and a **clinic** surface (patients, appointments, billing, accounting, EMR, inventory, chat, search, WhatsApp). Overall quality is high: consistent module layout, centralized auth/RBAC/CSRF/PHI middleware, zod validation on every mutation, transactional multi-document writes, human-readable counters, soft deletes, audit logging, and a green unit test suite (141 tests).

However, **two confirmed defects** block production confidence:

1. **Rate-limit path is broken** — `utils/ApiError.js` has no `tooManyRequests` static, and `middleware/userRateLimit.js:40` calls `ApiError.tooManyRequests(message)`. This middleware is mounted globally on every `/api` request (`app.js:118`, max 200 req/60 s per user). When a user crosses the threshold they receive a **500** (`TypeError`) instead of a **429**, and the error handler is spammed. The limiter misbehaves at exactly the moment it is most needed.
2. **CI gate is red** — `npm run audit:prod` exits non-zero (1 high-severity `brace-expansion` DoS advisory, transitive via `glob`/`readdir-glob`). `.github/workflows/ci.yml` runs it as its last step, so every PR fails the audit gate today.

Several production-configuration hazards were also found (`.env` runs `NODE_ENV=production` over plain HTTP → Secure/SameSite=None cookies; root `docker-compose.yml` mongo/redis auth does not match `server/.env`). See Sections 10 and 13.

### Scorecard

| # | Dimension | Score /10 | Key driver |
|---|---|---|---|
| 1 | Architecture | 8.5 | Clean module separation, single source of truth per concern |
| 2 | Module Design | 8.5 | Model→service→controller→routes→validator, consistent everywhere |
| 3 | API Design | 9.0 | RESTful, validated, permissioned, paginated, consistent envelopes |
| 4 | Security | 7.5 | Strong posture; rate-limiter 500-bug, un-audited site writes, public health telemetry |
| 5 | Performance | 8.0 | Indexed queries, aggregates, Redis caches; some N+1/aggregate risk and 20 MB in-memory encrypt |
| 6 | Maintainability | 8.5 | ESM, zod, eslint-consistent style, good comments, zero dead routes |
| 7 | Scalability | 7.5 | Multi-tenant isolated, Redis-backed; in-memory maps + single-node WhatsApp/impersonation |
| 8 | Database | 8.5 | Sensible schemas, compound indexes, embedded ledgers, counters, `withTransaction` |
| 9 | Business Logic | 8.5 | Appointment/invoice/commission/wallet/installment/treatment-plan chains coherent |
| 10 | Production Readiness | 6.5 | CI gate red; env/compose mismatch; HTTPS/cookie foot-gun; backups not exercised |
| 11 | Frontend Readiness | 7.5 | Full platform UI exists & contract matches; stale axios default + cookie/HTTPS caveats |
| 12 | Test & Quality | 7.5 | 141 green contract tests; no DB-backed integration or EMR/inventory/dashboard coverage |
| 13 | Docs & Observability | 7.5 | Good code comments + audit/error/perf/health logging; no runbooks/incident docs |
| | **Overall** | **~80 /100** | Strong platform; blocked by 2 confirmed defects + deployment config gaps |

---

## 1. Project Overview & Architecture

**Stack:** Node.js ≥22 (ESM), Express 5.2.1, Mongoose 9.7.3, ioredis, Socket.IO, multer, node-cron, otplib (TOTP 2FA), pino/pino-http logging, zod validation, helmet, swagger (declarative but not served — no live Swagger UI mount found).

**Process topology:**
```
server.js ─► validateEnv() ─► connectDB() ─► runMigrations() ─► connectRedis() ─► initSocket() ─► start crons
app.js   ─► helmet → CORS → cookieParser → JSON → nonce → csrf → requestId → generalLimiter → perfMonitor
            → abuseMonitor → userRateLimit → maintenance → ipAllowlist → /api (v1 + legacy /) 
routes.js ─► 37 module routers mounted once on /api/v1 and again on /api (backward-compatible)
```

**Key architectural decisions (all verified):**
- **Dual surfaces on one app:** `/api/site/*` (platform admin, `SiteAdmin` auth + `authorizeSite` RBAC + audit) and `/api/*` (clinic, `User` auth + `checkPermission` RBAC + `phiRestrict` + tenant/branch scoping).
- **Per-tenant isolation:** `currentTenant(req)`/`filterByBranch(req)`/`resolveBranchForCreate` (`utils/branchScope.js`) applied in every clinic controller; platform users (no tenant) operate across tenants explicitly.
- **RBAC with plan gating:** `checkPermission(module, action)` enforces `planIncludesModule` (tenant's `planModules` stamped on Tenant doc, `constants/plans.js` fallback) **before** role resolution; system admins bypass; roles carry a flat permission map.
- **Impersonation flow:** platform admin (with 2FA) issues a 30-min `type:'impersonation'` JWT (`/api/site/impersonation/start`, audited); `protect` marks `req.user._impersonating`; `phiRestrict` lifts to `req.isImpersonation` and `stripPHI` removes 17 PHI fields from all patient/EMR payloads. Impersonation requires the target tenant to be active and non-suspended.
- **Token versioning:** password change, logout, and site-admin ops bump `tokenVersion`, invalidating access/refresh/socket tokens.
- **Cron jobs** (single-node, `node-cron`): tenant suspension, installment due-date sweep, encrypted backups + retention, WhatsApp reminders.
- **Counters** (`core/counters.js`, transactional): human-readable patient numbers (`PT-…`), invoice numbers, prescription/note numbers, with `counter.invoice` tests.

---

## 2. Module-by-Module Analysis

### 2.1 Clinic modules

| Module | Models | Routes | Permission modules used | Verified highlights |
|---|---|---|---|---|
| auth | — | 7 | — (login/refresh public; `protect` on me/my-permissions/preferences) | Cookie auth (access+refresh), refresh rotation, `verify-impersonation` establishes impersonated session, preferences endpoint |
| users | `User`, `Branch`, `Role` | 7 | users, appointments(create for `/doctors`) | Tenant+role+active-branch validation on create; maxDoctors plan limit; self-deactivate guard; `tokenVersion++` on password change; permission cache invalidated on role change |
| patients | `Patient` | 5 | patients (+ phiRestrict) | PHI-stripped on every response during impersonation; list with search/filter/pagination |
| appointments | `Appointment` | 6 | appointments | Status machine (transitionSchema), doctor availability, conflict checks, soft-cancel |
| billing | `Invoice`, `Commission` | 10 | billing | Payments/refunds/void in-transaction; commissions auto-generated; summary + aging endpoints |
| accounting | `Expense`, `OwnerDrawing` | 9 | accounting | Cash-basis P&L summary, commission payment lifecycle |
| emr | `TreatmentPlan`, `DentalChart`, `ClinicalNote`, `Prescription` (+ disk attachments) | 24 | emr, prescriptions | Dental chart auto-created on first read; treatment plan → invoice → **inventory deduction** (`deductForProcedure`); AES-256-GCM file encryption at rest; PHI-restricted |
| inventory | `InventoryItem` (+ embedded `StockTransaction` ledger) | 6 | inventory | Low-stock `$expr`, stock-value aggregate, capped ledger (1000), socket events |
| chat | `Message`, `ChannelRead` | 6 | chat | DM + channel chat (doctors/accounting/general), cursor pagination, unread counts, socket delivery |
| dashboard | — | 1 | dashboard | Facet aggregate (staff/patients/appointments/billing/today) |
| search | — | 1 | patients(read) | Global search over 14 collections, Redis-cached, 2-char minimum |
| wallet / installments | `Wallet`, `InstallmentPlan` | 6 | billing | Atomic `$inc` wallet, plan+installment lifecycle, due-date cron |
| whatsapp | `WhatsAppSetting` | 7 | settings | Provider config (web/cloud_api/twilio), secrets `select:false` + stripped in responses, per-tenant client Map, reminders cron |

### 2.2 Platform modules (`/api/site/*`)

| Module | Models | Routes | Auth/Roles | Verified highlights |
|---|---|---|---|---|
| site/auth | `SiteAdmin` | 6 | protectSite; super_admin for `/create`; **`POST /refresh` unguarded (verified safe — self-verifying refresh cookie)** | super_admin **must** enable 2FA before login (login returns `challengeToken`, 5-min `2fa_challenge` JWT) |
| site/2fa | — | 5 | protectSite only (no authorizeSite — **verified safe**: all ops self-scoped to `req.siteAdmin._id`) | TOTP setup/verify/disable, bcrypt-hashed backup codes, `/verify-login` challenge-gated |
| site/tenants | `Tenant`, `Subscription` | 10 | protectSite + authorizeSite(roles), audit on mutations | Full tenant CRUD, quarantine, `withTransaction` create w/ generated password, cache invalidation on every status change |
| site/branches | `Branch` | 5 | authorizeSite | userCounts aggregate, maxBranches gate |
| site/users | `User` | 1 | authorizeSite(super_admin,admin) | `GET /by-tenant/:tenantId` — **hardcodes `isActive:true`**, no pagination |
| site/admins | `SiteAdmin` | 6 | super_admin writes | SAFE_ADMIN_FIELDS (excludes password/2FA), audit on all mutations |
| site/plans | `Plan` | 5 | super_admin writes (no audit) | Field-preserving merge; syncs tenant settings |
| site/platform | `PlatformSetting` | 2 | super_admin writes (no audit) | maintenance/ipAllowlist/trial/suspend config; cache clear on toggle |
| site/subscriptions | `Subscription` | 4 | authorizeSite | MRR/revenue analytics, plan-limit propagation, processPayment |
| site/feature-flags | — | 3 | super_admin mutations, audit | per-tenant module toggling, 300s cache |
| site/quarantine | — | 3 | super_admin mutations, audit | suspends tenant, preserves/restores previous status, resets stats |
| site/impersonation | — | 2 | super_admin,admin; audit on `/start` only | 30-min impersonation tokens, requires active tenant + 2FA admin |
| site/audit-logs | `AuditLog` | 2 | authorizeSite | filterable, action enum from schema |
| site/backups | `BackupLog` | 3 | super_admin trigger | mongodump archive → AES-GCM encrypt → retention purge |
| site/error-logs | `ErrorLog` | 3 | authorizeSite | filters + stats + resolve |
| site/analytics | — | 3 | authorizeSite | global stats, growth, tenant usage |
| site/health | — | 1 | **none (public)** | mongo/redis/memory/telemetry — intentional but discloses telemetry |
| site/perf | — | 2 | super_admin/admin | in-memory route perf stats + reset |

---

## 3. API Surface & Design

**~170 REST endpoints** (105 clinic + 66 platform) + 2 health endpoints, all mounted under both `/api/v1` and `/api` (legacy). Contract is consistent: `sendSuccess` → `{ success: true, data, ... }`, errors → `{ success: false, message, details? }`; mutation routes always carry a zod `validate(...)` schema; reads carry query schemas where filtering exists.

### 3.1 Unguarded endpoints (verified complete list)

| Route | Protection | Assessment |
|---|---|---|
| `GET /api/health` (routes/routes.js) | none | Intentional readiness |
| `POST /api/auth/login`, `/logout`, `/refresh`, `/verify-impersonation` | none | Intentional / token-or-cookie self-verifying |
| `POST /api/site/auth/login`, `/recover` | none | Intentional public |
| `POST /api/site/auth/refresh` | none | **Verified safe**: `siteRefresh` self-verifies `site_refresh` cookie signature + admin `tokenVersion` before issuing new cookies (siteAuth.controller.js:25-52) |
| `POST /api/site/2fa/verify-login` | `require2faChallenge` only | Challenge-token gated (by design) |
| `GET /api/site/health` | none | Public telemetry (mongo/redis/memory) — low info-disclosure |

### 3.2 Dead / unused code found

| Location | Issue |
|---|---|
| `modules/users/role.routes.js` | `listRolesQuerySchema` imported but never used (no `validate` on `GET /` or `GET /modules/list`) |
| `modules/site/auth/site2fa.routes.js` | `authorizeSite` imported but never used (routes rely on `protectSite` only — safe because handlers are self-scoped) |
| `utils/cache.js` (permission namespace) | Permission cache is written (`cachePermission`/`invalidatePermission` on role change in user.controller.js:257) but **never read** — `resolveRole` in `middleware/checkPermission.js` only consults the role cache; permission entries are dead data |

### 3.3 Notable permission mappings (by design, but document them)

- `GET /api/users/doctors` → requires `appointments:create` (so reception can book without `users:read`).
- `GET /api/search` → `patients:read` (no dedicated `search` permission exists).
- Wallet/installments → `billing` module; WhatsApp → `settings`; prescriptions → dedicated `prescriptions` module while other EMR routes use `emr`.
- `authorizeSite('site_admin')` is normalized to `super_admin` in `siteAuth.js` — the role literally never maps to its own distinct gate.

---

## 4. Security

### 4.1 Strong points (verified)

- **Cookies:** `httpOnly`, `sameSite: Lax` (dev) / `None` (prod), `secure` in prod (`utils/jwt.js:25-30`).
- **CSRF:** `middleware/csrf.js` — Origin/Referer must match `allowedOrigins` (from `CLIENT_URL`) or self-origin for unsafe methods carrying a session cookie.
- **Auth:** `protect` verifies signature, `tokenVersion`, tenant subscription status; refresh rotation; site admins enforce 2FA for super_admin and impersonation.
- **Tenant isolation:** tenant + branch scoping on every clinic controller; user-create/update validate that role & branch belong to the same tenant (`user.controller.js:37-43, 219-235`); `resolveRole` verifies the cached role's tenant matches.
- **PHI:** 17-field `stripPHI` applied to every patient/EMR response under impersonation; uploads encrypted AES-256-GCM; backups encrypted when `BACKUP_ENCRYPT=true`.
- **Validation:** zod on every mutation; `error.js` maps `ValidationError`→400, duplicate-key→409, `CastError`→400, JWT/JSON/Multer→4xx, others→500 with structured logging.
- **Uploads:** single multer instance, 20 MB limit, strict mime allowlist, `path.basename` normalization on download, no path traversal.

### 4.2 Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| S1 | **High** | `ApiError.tooManyRequests` does not exist; `userRateLimit.js` calls it → crossing 200 req/min yields **500 TypeError** instead of **429**, plus error-log flooding. Mounted globally on `/api` (`app.js:118`). | `middleware/userRateLimit.js:40`, `utils/ApiError.js` (statics: badRequest, unauthorized, forbidden, notFound, conflict, serviceUnavailable, internal) |
| S2 | **High** | `npm run audit:prod` fails (1 high: `brace-expansion` DoS, transitive via `glob`/`readdir-glob`). CI runs it last → gate always red; also blocks npm audit sign-off on installs. | `.github/workflows/ci.yml`, `package.json` (`audit:prod`) |
| S3 | **High** | `server/.env` sets `NODE_ENV=production` while service runs over plain HTTP (local/LAN). `cookieOptions` then force `secure:true` + `sameSite:None` → browsers drop auth cookies on non-HTTPS/non-localhost origins (e.g., LAN IP or Vercel-preflight). Local testing must set `NODE_ENV=development` (or serve HTTPS). | `utils/jwt.js:25-30`, `server/.env` |
| S4 | **High** | Root `docker-compose.yml` bootstraps mongo with root auth and redis with `requirepass`, but `server/.env` `MONGO_URI`/`REDIS_URL` carry **no credentials** → compose deployment fails auth at startup. Env and compose must be reconciled before any containerized rollout. | `docker-compose.yml` (root), `server/.env` |
| S5 | Medium | Secrets in `server/.env` (JWT keys, seed admin password, backup key) plus a **commented-out Atlas URI containing DB credentials**. `.env` is gitignored (confirmed), but the seed password + keys are plaintext and the commented URI should be removed. | `server/.env:2-3,23-24` |
| S6 | Medium | `decryptFile` never settles for inputs shorter than the 52-byte header (`ENC1`+salt+iv+tag): neither `resolve` nor `reject` fires (`utils/encryption.js:68-116`). Currently guarded downstream by `isEncrypted` (requires ≥52 bytes) so only reachable via TOCTOU or direct util use — a latent hang. Also `encryptFile` buffers the **entire file in memory** (`Buffer.concat`) despite being labeled streaming → ~20 MB spike per upload. | `utils/encryption.js:28-62,68-116` |
| S7 | Medium | Audit coverage is inconsistent on platform writes: `site/subscriptions` PUT/POST, `site/plans` PUT/DELETE, `site/platform` PUT, and `impersonation /end` are **not** audited, while tenants/admins/feature-flags/quarantine/2FA are. | `siteSubscription.routes.js`, `plan.routes.js`, `platformSetting.routes.js`, `siteImpersonation.routes.js` |
| S8 | Medium | `GET /api/site/health` (public) discloses mongo/redis connectivity + memory/telemetry to anonymous callers. Low sensitivity but unnecessary exposure. | `siteHealth.controller.js` |
| S9 | Low | `GET /api/site/users/by-tenant/:tenantId` hardcodes `isActive:true` and lacks pagination → inactive staff invisible; list unbounded. | `siteUser.controller.js` |
| S10 | Low | Role listing mixes tenant roles with `tenant:null` shared roles while get/update/delete are tenant-filtered — list results can reference roles the caller cannot act on. | `role.controller.js` |

---

## 5. Performance

- **Verified good:** compound indexes on chat (`{branch,channel,createdAt:-1}`), `channelRead` unique `{tenant,branch,channel,user}`, appointment/patient tenant+branch scoped queries, `Promise.all` for list+count, Redis-cached roles (5 min), cached tenant modules (300 s), global search Redis cache keyed on `branchFilter+query`.
- **Dashboard:** single facet aggregate + targeted `today` range + outstanding/revenue sums — efficient.
- **Concerns:**
  - `search.service.js` fan-outs across 14 collections on every keystroke (≥2 chars) — acceptable with cache, but no result-limit guard noted beyond collection limits; validate with load tests.
  - `attachment.routes.js:87-94` `readFile()` of the **entire file** to check the `ENC1` magic on every download (20 MB read before streaming) — unnecessary full buffering.
  - `decryptFile` writes a temp file then streams it; temp files are cleaned on end/error — good.
  - Perf monitor (`utils/perfMonitor.js`) is in-memory → stats lost on restart; no sampling budget or slow-query logging observed.
  - N+1 risk is low because controllers use `populate`/aggregates, but `user.controller.js` does sequential `Tenant.findById` + `countDocuments` on doctor creation (acceptable, rare).

---

## 6. Maintainability

- Consistent 4-layer module pattern (model → service → controller → routes → validator) across all 23 module dirs — new features follow an obvious template.
- ESM throughout, named exports, centralized constants (plan modules, statuses, permission keys), `filterByBranch` guard reused everywhere.
- Well-commented (intent-level comments on security-sensitive code), eslint-consistent formatting.
- Single minor smell: **nested `Router({mergeParams:true})` sub-routers** for EMR/wallet/installments require remembering the parent `:patientId` — documented in code, but `patientId` is never validated as belonging to a branch before the nested controller uses it (controllers do enforce tenant via `filterByBranch`, so isolation holds).

---

## 7. Scalability

- **Good:** stateless-ish Express (auth in cookies/JWT), Redis for caches + distributed rate limiting (`rate-limit-redis`), tenant/branch scoping keeps collections partitionable.
- **Limits to document before scaling out:**
  - **Single-node dependencies:** cron jobs (suspension/installment/backup/reminders) run in-process — a second instance would duplicate them; no leader-election/lock observed.
  - **In-memory state:** WhatsApp `clients` Map, `userRateLimit` Map, perf stats, abuse-monitor state — per-instance; consistent-hashing/sticky sessions required.
  - **Socket.IO:** no adapter — scaling horizontally requires `@socket.io/redis-adapter`.
  - Impersonation tokens are stateless JWTs (good), but `tokenVersion` revocation checks hit DB per request — fine at this scale.

---

## 8. Database & Data Modeling

27 top-level collections identified. Verified design highlights:

| Collection | Notable fields / indexes |
|---|---|
| `User` | tokenVersion, roleId+branch refs, commissionRate, isDoctor; tenant+branch scoped |
| `Role` | flat permissions map, isSystemAdmin/isBuiltIn, optional tenant (null = shared) |
| `Patient` | PHI fields (17 stripped on impersonation), tenant+branch |
| `Appointment` | status machine, doctor ref, start/end; tenant+branch indexes |
| `Invoice` | embedded payments, commission linkage, totals, void/refund flags |
| `Commission` | linked to invoice/payment; status lifecycle |
| `Expense` / `OwnerDrawing` | tenant+branch scoped accounting entries |
| `InventoryItem` | embedded `StockTransaction` ledger capped at 1000 via shift, reorderPoint, lowStock `$expr` |
| `Message` / `ChannelRead` | compound chat indexes; channel enum |
| `TreatmentPlan` / `DentalChart` / `ClinicalNote` / `Prescription` | tooth/surfaces schema, per-surface conditions, counters, doctor refs, soft delete |
| `Wallet` / `InstallmentPlan` | atomic `$inc`, installment due dates, linked invoice |
| `Tenant` | TENANT_STATUS enum, slug, plan/planModules, quarantine fields, limits |
| `Subscription` | status + billing cycle, unique tenant |
| `SiteAdmin` | SITE_ROLES, tokenVersion, 2FA fields `select:false` |
| `Plan` | modules enum, limits; seeded defaults |
| `PlatformSetting` | maintenance/ipAllowlist/trial config |
| `AuditLog` / `ErrorLog` / `BackupLog` | indexed by tenant/action/date, resolve flag |

**Caveats:** no mongoose `unique` on some tenant+field combinations verified at the model layer is acceptable since controllers enforce uniqueness (e.g., user email) — but consider compound unique indexes for `User {tenant,email}` and `Branch {tenant,name}` at scale. No TTL indexes observed (e.g., tokens); no migration framework beyond `runMigrations()` (seen as seed/idempotent scripts).

---

## 9. Business Logic & Workflows (verified end-to-end)

1. **Booking → treatment:** Appointment created (conflict-checked) → visit → treatment plan created (tooth/surfaces) → `generateInvoiceFromPlan` (plan.service) creates invoice AND calls `deductForProcedure` in inventory within `withTransaction` → payment recorded on invoice → commission auto-generated → wallet credit for overpayment → installment plan if partial.
2. **Accounting:** payments drive commissions (linked, payable); expenses + drawings + commissions feed the cash-basis `getAccountingSummary`; invoice aging + billing summary for receivables.
3. **Patient financials:** wallet ledger (atomic `$inc`), installment plans with due-date cron sweep, invoice payments/refunds/voids — all tenant+branch scoped.
4. **Tenant lifecycle:** create (with generated admin password, transactional) → activate/suspend/archive/delete with **cache invalidation** of roles/tenants/modules on every status change; quarantine preserves previous status and resets abuse stats; suspension cron auto-suspends non-paying tenants; subscription updates propagate plan limits to tenant settings.
5. **Impersonation & audit:** start requires 2FA-enabled site admin + active/non-suspended tenant + active user → 30-min token → PHI stripped on clinic responses → audited `impersonation.start` (+ end un-audited, see S7).
6. **WhatsApp reminders:** config via provider abstraction; per-tenant client; reminder cron sends scheduled messages. Single-node only.

All flows are coherent, transactional where they span documents, and consistently permissioned.

---

## 10. Production Readiness

- **CI (`.github/workflows/ci.yml`):** Node 22, `npm ci` → `npm run check` → `npm test` → `npm run audit:prod`. **The audit step currently fails (S2)** → the pipeline is red today.
- **Docker/deploy:** `Dockerfile` (node:22-slim, chromium for WhatsApp web, non-root `appuser`, `HEALTHCHECK /api/health`, `CMD node server.js`); `deploy.sh`/`deploy.ps1` (compose rebuild/restart, optional `mongodump` backup, env handling). Root `docker-compose.yml` (mongo:7 auth + redis requirepass + server) is **inconsistent with `server/.env` credentials (S4)**.
- **Secrets/config:** `.env.example` mandates 3 distinct 128-hex JWT secrets + 64-hex recovery/encryption keys (good); current `.env` satisfies that (S5), but `NODE_ENV=production` over HTTP is a foot-gun (S3).
- **Observability:** pino + pino-http request logging, structured error logging to Mongo (`ErrorLog`), in-memory perf stats, `/api/health` + `/api/site/health`, audit log. Missing: metric export (Prometheus), distributed tracing, and log retention policy for `ErrorLog`/`AuditLog`.
- **Backups:** mongodump → gzip → AES-256-GCM encrypt (key required) → retention purge (30 d); `BACKUP_ENCRYPT=true` in current env. **Not exercised by any test** — recommend a scheduled restore drill.
- **Missing for go-live:** load test evidence for search/aggregates, HTTPS-termination docs, cookie `Secure` over TLS confirmation, and a runbook for tenant quarantine/impersonation incidents.

---

## 11. Frontend / Dashboard Readiness

Full platform admin SPA exists at `dashboard/` (React + Vite + Tailwind + Redux Toolkit), with pages for **all** platform modules (Tenants, Branches, Plans, Subscriptions/Billing, Admins, AuditLogs, Backups, Analytics, FeatureFlags, ErrorLogs, Quarantine, Performance, Health, Settings, 2FA, Impersonation).

- **Contract match (verified):** `src/lib/axios.js` (baseURL `/api/site`, `withCredentials`) + `authApi.js` (`/auth/login`, `/auth/me`) line up with server `/api/site/auth/*`; 401→`/auth/refresh` interceptor matches the unguarded-but-safe `POST /api/site/auth/refresh`; response unwrap of `{success, data}` matches `sendSuccess`.
- **Issues:**
  - `src/lib/axios.js:5` default baseURL is **`http://localhost:5000`** (stale; server is 7000). `.env.example` correctly uses `:7000`, but the fallback silently breaks if `VITE_API_BASE_URL` is missing.
  - Cross-origin cookie auth (Vercel frontend → backend) requires `CLIENT_URL` to include the dashboard origin **and** HTTPS (Secure cookies, S3). `CLIENT_URL` currently includes two Vercel origins + localhost — OK, but must be kept in sync.
  - Vite dev proxy targets `:7000`; axios absolute baseURL bypasses it, so CORS + `CLIENT_URL` must include `http://localhost:5174` (it does).

---

## 12. Test Coverage & Quality

- **Suite:** vitest, environment `node`, `globals:true`, `setupFiles: ['__tests__/setup.js']` (env fallbacks only, no DB). **141 tests across 19 files — all green.** `npm run check` passes.
- **Covered:** auth (13), invoice (17), csrf (8), site2fa (8), protect (7), installments (8), wallet (5), phi (9), chatGate (4), plan (4), patientLimit (4), rbac (16), tenant (4), whatsapp (8), maintenance (7), counter.invoice (6), ipAllowlist (9), user, health.
- **Gaps:** no DB-backed integration tests (all models mocked except `invoice.test.js` in-memory `validate()`); **no tests for** EMR (plans/chart/notes/rx/attachments), inventory, chat service, dashboard, global search, or platform modules (subscriptions, backups, analytics, impersonation, audit log, error logs, feature flags, quarantine). No E2E.

---

## 13. Risk Matrix & Prioritized Actions

| Priority | Action | Owner | Effort |
|---|---|---|---|
| P0 | Fix `userRateLimit` to return real 429 (add `ApiError.tooManyRequests` or inline 429). Re-test with a burst test. | Backend | S |
| P0 | Resolve `brace-expansion` advisory (`npm audit fix` / override / dependency bump) so `audit:prod` and CI pass. | Backend | S |
| P1 | Reconcile `server/.env` ↔ root `docker-compose.yml` (mongo/redis credentials); document HTTPS termination + cookie `Secure` for prod. | DevOps | S |
| P1 | Remove commented Atlas URI + rotate exposed secrets; keep `.env` out of git (confirmed ignored). | DevOps | S |
| P2 | Audit all platform write routes (subscriptions, plans, platform settings, impersonation `/end`). | Backend | S |
| P2 | Fix `decryptFile` short-file hang (reject on EOF without header); make `encryptFile` actually stream or document buffering; avoid `readFile` on download magic check. | Backend | M |
| P2 | Add integration tests for EMR/inventory/search/dashboard + one platform flow; add a restore-drill for backups. | QA | M |
| P3 | `siteUser` pagination + optional `isActive`; remove dead imports (`listRolesQuerySchema`, `authorizeSite`); either use or drop permission cache. | Backend | S |
| P3 | Document single-node cron/WhatsApp/socket constraints before scaling out (leader election or adapter). | Backend/DevOps | M |

### Final verdict
A strong, well-architected platform that is **near production-ready**. The blocker list is short and mechanical: fix the rate-limit 429 bug (S1), make the audit/CI gate green (S2), reconcile deployment env/compose + HTTPS cookie mode (S3/S4), and close the audit/test gaps. Estimated **2–3 focused days** to clear P0/P1 and materially derisk go-live.
