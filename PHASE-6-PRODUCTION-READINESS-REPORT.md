# PHASE-6-PRODUCTION-READINESS-REPORT

**Date:** 2026-11-13
**Scope:** Phase 6 — End-to-End Integration & Production Readiness Audit (after Phases 0–5). Assessment only: **no Phase 7, no deploy, no commit/push, no dependency or lockfile changes, no frozen-contract changes.**
**Evidence principle:** every claim below is labelled **EXECUTED** (real command/browser run with observed result), **STATIC** (code/config inspection only), or **NOT RUN** (with the reason). Unit tests and builds are not treated as proof of runtime correctness.

---

## A. Executive Summary

**Overall verdict: NOT READY FOR STAGING.**

Unlike the previous pass of this report (which could not launch a browser), this audit ran the real stack: the API against an **isolated local database** (`dental_phase6_e2e` — never the developer's data, never production), the real Redis on 127.0.0.1:6379, and both SPAs in a **real Chromium** session.

What that proved:

- Real browser sign-in to the Site Dashboard **including the TOTP 2FA challenge**, and real sign-in to the Clinic app; session cookies survive an API restart.
- Tenant and branch isolation is **enforced server-side and visible in the browser**: a cross-tenant patient URL renders "Patient not found" and leaks nothing; a branch-scoped doctor gets `404` for another branch's patient.
- Security headers, `Cache-Control: no-store`, gzip, CSRF rejection and cookie flags behave as designed on live responses.

What blocks staging:

1. **P1 — The documented container stack cannot provision tenants or create patients.** `server/docker-compose.server.yml` runs a standalone `mongo:7`, but 56 call sites across patients, appointments, billing, wallet, installments, accounting, tenant provisioning, branches, users and roles use `withTransaction`. A standalone mongod answers *"This MongoDB deployment does not support retryable writes"*, so provisioning and every transactional write returns **500**. Observed live, twice.
2. **P1 — `server/Dockerfile` is still missing** although compose references it; Client and Admin have no container/production server story either.
3. **P1 — Backup restore has never been executed.** Backup code exists (encrypted `mongodump`), but no isolated restore drill, and `mongodump` is not even present on this machine.
4. **P2 — `/api/health` reported 503 "Service unavailable" while the authoritative detailed health endpoint reported `status: ok` with Mongo and Redis connected.** The public probe is driven by error-rate telemetry, so a handful of ordinary 401/403 responses (exactly what an unauthenticated visitor generates) can mark a healthy instance unavailable to a load balancer.
5. **P1 (validation gap) — Real multi-client Socket.IO delivery, complete business workflows (appointment → note → consent → attachment → payment), and admin console pages beyond Tenants/Plans/Dashboard are still unverified**, because their write paths are the same transaction-blocked ones.

---

## B. Repository Protection

**Baseline (start):** `git status --short` → 63 porcelain entries; 41 modified tracked files; **0 staged**; untracked Phase 0–5 artifacts (`PHASE-5-VERIFICATION-REPORT.md`, `scripts/*.cjs`, phase test files, `PHASE-6-PRODUCTION-READINESS-REPORT.md`). Pre-existing diff at baseline: `41 files changed, 1472 insertions(+), 737 deletions(-)`. Branch `main`, latest commit `3f45e26`.

**Final:** 64 porcelain entries — the only difference is this report's rewrite. **0 staged.** All pre-existing modifications and Phase 0–5 artifacts are intact; nothing was discarded, stashed, reset or rebased.

**Safety confirmation:** no commits, no pushes, no deploys, no dependency/manifest/lockfile changes, no migrations against any non-test database, no destructive database operations. Temporary audit scripts created for seeding/probing were deleted (`server/scripts/tmp-p6-seed-tenants.mjs`, `Client/tmp-p6-socket-test.mjs`).

**Test data created (isolated DB only):** database `dental_phase6_e2e` on the local mongod — one site admin, one plan, two tenants, three branches, three users, four patients. Synthetic names/phones only. Left in place (dropping it would be a destructive DB operation).

---

## C. Environment & Infrastructure

| Area | Finding | Level |
|---|---|---|
| Runtime | Node v24.22.1, Express API on :7000, MongoDB 127.0.0.1:27017, Redis 127.0.0.1:6379 (both reachable, `connected: true`) | EXECUTED |
| `server/Dockerfile` | **MISSING**, while `server/docker-compose.server.yml` builds `dockerfile: Dockerfile` → the documented container deployment cannot build | STATIC |
| `Client/Dockerfile`, `AdminDashboard/Dockerfile` | **MISSING**; no reverse-proxy/TLS config in repo; frontends are Vercel-targeted (`vercel.json` + edge middleware) | STATIC |
| Compose topology | `mongo:7` (standalone), `redis:7-alpine`, server depends on both being healthy, named volumes for db/redis, **no volume for uploads or backups** | STATIC |
| Transactions | 56 `withTransaction` sites in `modules/`, `services/`, `utils/`; standalone MongoDB cannot serve them → live 500s | EXECUTED |
| CI | `.github/workflows/ci.yml`: server (check, vitest, `audit:prod`) + Admin (lint, test, build, Playwright e2e on Chromium). **No Client job, no deployment job** | STATIC |
| Migrations | Runner applied all 7 migrations automatically on first boot of the isolated DB | EXECUTED |
| Health | `GET /api/health` (public, sanitized) and `GET /api/v1/site/health` (super-admin, detailed) **disagree** — see J2 | EXECUTED |
| Env docs | `server/.env.example` documents required secrets, origins, proxy hops, backup keys; Client/Admin examples document their API bases and the edge proxy | STATIC |

**How the runtime was stood up (EXECUTED):** API started with explicit env overrides (`NODE_ENV=development`, isolated `MONGO_URI`, synthetic JWT/consent/audit keys, `CLIENT_URL` covering both SPAs, local `REDIS_URL`); Admin on :5174 and Client on :5173 via their own Vite dev servers, each proxying `/api` and `/socket.io` to :7000.

---

## D. Browser E2E Results

Driver: the packaged Chromium controlled through the preview tools (real browser on this machine, not jsdom). AdminDashboard's own Playwright suite was **not** run (browser binaries for Playwright remain absent; installs are out of scope).

| # | Scenario | Expected | Actual | Result | Level |
|---|---|---|---|---|---|
| D1 | Unauthenticated `/` on Admin | Redirect to `/login` | Landed on `/login`, form rendered, title `Dental OS - Site Dashboard` | PASS | EXECUTED |
| D2 | Admin sign-in with valid credentials | 2FA challenge shown | "Two-Factor Verification" step rendered after submit | PASS | EXECUTED |
| D3 | Admin TOTP verify | Session established, dashboard loads | Navigated to `/`, dashboard rendered with live counters, alert banner, empty states | PASS | EXECUTED |
| D4 | Enumerate API without session | 401 | `GET /api/v1/site/tenants` → **401**; `/auth/me` → **401** | PASS | EXECUTED |
| D5 | Wrong password | Generic rejection | **400 "Validation failed"** with password-policy details (uppercase/digit rules) instead of 401 — see J4 | PARTIAL | EXECUTED |
| D6 | Clinic app public page | Pricing renders published plan | Pricing rendered the API-created plan (modules, limits, price), title `Dental OS — Pricing` | PASS | EXECUTED |
| D7 | Clinic sign-in | Land on dashboard | Redirected to `/dashboard`; title on login page `Sign in — Dental OS` | PASS | EXECUTED |
| D8 | Clinic patients list | Tenant-scoped rows | 3 tenant-A rows rendered with branch column, actions; tenant-B patient absent | PASS | EXECUTED |
| D9 | Session survival across API restart | Still authenticated | Detailed health 200 with the pre-restart cookie jar | PASS | EXECUTED |
| D10 | Logout, token expiry, permission-denied UI | — | Not exercised in the browser | NOT RUN | — |
| D11 | Admin pages: Branches, Billing, Analytics, Admins, Feature Flags, Quarantine, Health, Performance, Audit Logs, Error Logs, Backups, Settings | Render + actions | Only Dashboard, Tenants, Plans (and their empty states / filters) were opened | NOT RUN | — |

**Admin plan creation via UI:** the Add-Plan dialog accepted input, but no `POST /site/plans` was observed in this run even via a form `requestSubmit()`; the plan was then created through the documented API (201). The same dialog's inputs also failed to retain values when driven by stale snapshot handles, which is a test-driver artefact — the submit silence is **unresolved**: reported here as an observation needing a maintainer repro, not as a confirmed product bug.

---

## E. Tenant & Branch Isolation

Setup: Tenant A (`aurora-qa`) with Branch A1 "Aurora Main" and A2 "Aurora North"; Tenant B (`borealis-qa`) with B1. Users: `owner.a` (clinic_manager, A1), `doctor.a` (doctor, A2), `owner.b` (clinic_manager, B1). Patients seeded directly (provisioning API blocked — see C).

| Scenario | Identity | Expected | Actual | Result |
|---|---|---|---|---|
| List own tenant | owner.a | Only A patients | `total=3` (`P6-A-001/002/003`), B patient absent | PASS |
| List own tenant | owner.b | Only B patients | `total=1` (`P6-B-001`) | PASS |
| Branch scoping | doctor.a (A2) | Only A2 | `total=1` (`P6-A-003`) | PASS |
| Cross-tenant read by id | owner.b → A patient | Deny | **404** | PASS |
| Cross-tenant read by id | owner.a → B patient | Deny | **404** | PASS |
| Own read | owner.a → A patient | Allow | **200** | PASS |
| Cross-branch read | doctor.a → A1 patient | Deny | **404** | PASS |
| Cross-branch own | doctor.a → A2 patient | Allow | **200** | PASS |
| Search scoping | owner.a search "Bassem" (tenant B) | No results | `total=0` | PASS |
| Direct URL navigation | owner.a → `/patients/<B patient id>` | Deny, no leakage | UI rendered "Not found / Patient not found"; page text contained **no** B patient name/id | PASS |
| Branch switch in UI | owner.a | Data reloads scoped | Not exercised (no switcher click-through) | NOT RUN |
| Cached cross-context data after switch | — | No stale data | Not exercised | NOT RUN |
| Impersonation boundaries | super_admin | Read-only, scoped | Not exercised | NOT RUN |
| Exports preserve scoping | — | Scoped CSV | Not exercised | NOT RUN |

**Conclusion:** tenant and branch isolation holds on every path actually exercised, at API and browser level. Socket-level isolation is covered in F.

---

## F. Realtime Verification

| Item | Result | Level |
|---|---|---|
| Anonymous socket connection | Rejected with `Unauthorized` (real Socket.IO handshake against :7000) | EXECUTED (network) |
| Authenticated Node socket clients (A and B) | Handshake failed with `xhr poll error` even with the session cookie; browser sockets connect fine (`[socket] connected` in page console), so this is a Node-client/env issue that was not resolved inside the audit | BLOCKED |
| Cross-tenant `subscribe:branch` (B → A's branch, A → B's branch) | Server code rejects branch-scoped users, and re-checks tenant ownership in Mongo for tenant-wide users (`socket/index.js` 388–425) | STATIC |
| Queue room subscription | Tenant-scoped rooms; module and permission gated | STATIC |
| Event delivery isolation (`appointment.lateArrival`, `payment.recorded`, `patient:merged`, `consent:*`, `stock.*`, `installment.overdue`, `automation:notify`) | **Not triggered end-to-end** — every producer is a transaction-backed write, which 500s on this MongoDB | NOT RUN |
| Reconnect / duplicate-listener / logout-while-connected | Not exercised live | NOT RUN |
| Existing socket security suites | `socketSecurityClosure`, `socketPermissionHardening`, `socketQueueBranchScope`, `emrAttachments.authz`, `csrfAuthRoutes.integration` → **35/35 passed** | EXECUTED (mocked) |

**Do not claim realtime readiness:** the authorization surface is well tested statically and by unit tests, but multi-client delivery and reconnection were not observed over a live network with data flowing.

---

## G. Business Workflow Results

| Workflow | Result | Reason |
|---|---|---|
| 1. Patient → appointment → status → realtime | **BLOCKED** | Patient create via UI returned **500** (transaction on standalone Mongo); appointment writes are transactional too |
| 2. Appointment → clinical note → consent → attachment upload/download/delete | **BLOCKED** | Same transaction dependency; attachment listing remains `BLOCKED_BACKEND` from Phase 4/5 (unchanged) |
| 3. Billing → payment → wallet/installments | **BLOCKED** | `invoice.service`, `wallet.service`, `installmentPlan` all transactional |
| 4. Inventory stock operation | **BLOCKED** | UI page not exercised; write path expected transactional |
| 5. Automation create / dry-run / history | **BLOCKED** | Page not opened; engine only reacts to events produced by blocked writes |
| Read paths that *did* work | Patient list, patient detail denial, pricing page, admin dashboards | — |

Every one of these 500s is the same server-side error, captured in the server log:
`MongoServerError: This MongoDB deployment does not support retryable writes.`

---

## H. Resilience & Recovery

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| API unavailable while browsing | Clear outage message, no false success | Navigating to `/patients` **silently redirected to `/login`** with no "service unavailable" notice — an outage looks like a signed-out session (J5) | OBSERVED |
| API restart with live session | Session continues | Pre-restart cookies authenticated against the restarted API (detailed health 200) | PASS |
| Redis unavailable | Degrade to in-memory | Not induced (shared Redis belongs to the developer's environment) | NOT RUN |
| MongoDB unavailable | Clean errors, no corruption | Not induced | NOT RUN |
| Failed upload / failed payment / duplicate submit / browser refresh mid-operation | No duplicates, honest errors | Not exercised | NOT RUN |
| Public health after restart | 200 | **503 "Service unavailable"** while detailed health said `ok` → J2 | FAIL (finding) |

---

## I. Backup & Recovery

| Aspect | Finding | Level |
|---|---|---|
| Implementation | `services/backup.js` runs `mongodump --gzip`, **requires `BACKUP_ENCRYPTION_KEY`**, encrypts, writes `BackupLog`, enforces retention (`BACKUP_RETENTION_DAYS`), single-run interlock; `services/backupCron.js` schedules it | STATIC |
| Startup behaviour | With no `BACKUP_ENCRYPTION_KEY` the server logs a warning and **backs up nothing** (by design) | EXECUTED (observed at boot) |
| Storage | Filesystem `BACKUP_DIR` (default inside the repo); **compose defines no volume for it** — container recreation loses backups | STATIC |
| Restore | No restore script/runbook; never executed; `mongodump`/`mongorestore` absent from this machine | NOT RUN |
| RPO/RTO, PITR | Undefined; single-node dumps, no oplog | STATIC |

**Classification:** backup.py exists but recoverability is unproven → **P1** production blocker (I1).

---

## J. Security & Performance Findings

| ID | Sev | Finding | Evidence | Recommended action |
|---|---|---|---|---|
| J1 | P1 | 56 transactional write paths vs standalone MongoDB in the documented compose file | Live 500s on tenant provisioning and patient creation; `grep withTransaction` | Run MongoDB as a replica set (`--replSet` + `rs.initiate()`) in compose/staging; document the requirement |
| J2 | P2 | `/api/health` 503 while `/api/v1/site/health` says `ok`; public probe is driven by error-rate telemetry | Reproduced after restart: 5 client errors vs 50 successes flipped the probe | Base liveness on process/DB/Redis only; expose error-rate as readiness/degradation detail, and ignore expected 401/403 |
| J3 | P3 | Disallowed CORS origin returns **500** with a stack trace in the body (dev) | `OPTIONS` with `Origin: http://evil.example` → 500 `Not allowed by CORS` + stack | Reject with 403 and no stack; also removes error-monitor noise |
| J4 | P3 | Login validates the *password policy* on the login form: wrong password yields 400 + rules instead of 401 | `POST /auth/login` with weak wrong password → 400 details | Apply policy to registration/change only; login returns a generic 401 |
| J5 | P3 | API outage redirects to `/login` without explanation | Server stopped, `/patients` → `/login` | Distinguish network/5xx from 401 in the session check; show a retry banner |
| J6 | P3 | Error responses include `stack` in development (production-gated) | CORS 500 body; tenant 500 body | Confirm `NODE_ENV=production` hides it (code does), and keep seeds/dev servers off shared hosts |
| S1 | PASS | CSP (nonce), HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, no `X-Powered-By`, `Cache-Control: no-store` on API, gzip with `Vary` | Live header capture | — |
| S2 | PASS | Cookies: `access_token`/`refresh_token` HttpOnly + `SameSite=Lax`; `_csrf` SameSite=Strict; `Secure` is applied only in production (verified in `utils/jwt.js`) | Live `Set-Cookie` | Ensure TLS termination in staging so `Secure` engages |
| S3 | PASS | CSRF: cookie-issuing POST without `Origin`/`Referer` → **403**; allowed origin → 200; integration suite 11/11 | curl + tests | — |
| S4 | PASS | Cross-tenant/branch reads denied with 404 (no existence leak) | Section E | — |
| P1 | INFO | No load/performance testing performed; bundles from Phase 5 remain (Admin entry 160 kB, Client vendor 179 kB gzip 56 kB) | — | Load-test on staging with a replica set |

---

## K. Production Blockers

| ID | Sev | File/config | Impact | Fix | Approval |
|---|---|---|---|---|---|
| K1 | **P1** | `server/docker-compose.server.yml` (`mongo:7` standalone) + transactional code | Tenants cannot be provisioned; patients/appointments/payments 500 — the product's core writes | Convert compose Mongo to a single-node replica set and document it; add a startup check that fails fast on a standalone deployment | infra change — needs approval |
| K2 | **P1** | missing `server/Dockerfile` (compose references it); no Client/Admin images | Documented deployment cannot build | Author Dockerfiles (non-root, healthcheck, volumes for uploads + backups) or switch docs to a managed runtime | approval |
| K3 | **P1** | `services/backup.js`, compose volumes | Backups may not exist (no key → disabled) and are lost on container recreation; restore never tested | Persist `BACKUP_DIR`, require the key in staging/prod, run an isolated restore drill, document RPO/RTO | ops + approval |
| K4 | **P1** | `.github/workflows/ci.yml` | No Client CI job, no e2e against a real API/replica set; Playwright suites cannot run without browsers | Add a Client job and a service-backed e2e job (mongo replica set + redis) | approval |
| K5 | **P2** | `utils/healthMonitor.js` probe wiring | Healthy instances removed from rotation on ordinary 401 traffic | Split liveness from error-rate telemetry (J2) | code change, no contract change |
| K6 | **P1 (validation)** | E2E coverage gap | Realtime delivery, billing/inventory/automation workflows, admin ops pages, logout/expiry unverified | Re-run Sections D–G on staging with a replica set | — |
| K7 | **P2 (known)** | EMR attachment listing | No patient-scoped list endpoint (Phase 4/5 finding, unchanged) | Needs an approved backend capability | contract change |

---

## L. Final Verdict

**NOT READY FOR STAGING.**

The system is not "broken" — authentication, 2FA, session handling, tenant/branch isolation, security headers, CSRF and the read-side of both SPAs were verified working in a real browser against a real API. But three things prevent a staging sign-off being honest:

1. Core write workflows **cannot run** on the deployment topology the repo documents (standalone MongoDB vs 56 transactional paths) — observed, not inferred.
2. The deployment artefact referenced by compose (`server/Dockerfile`) does not exist.
3. Backup restore, live multi-client realtime delivery, and most admin/clinic write screens remain unexecuted.

Fix K1/K2/K3, then re-run Sections D–G on that environment. Nothing in this phase required or produced a change to the frozen API, socket contract, or security posture.

### Restrictions acknowledged
No Phase 7 started · no deployment · no commits/pushes/resets/stashes/rebases · no dependency or lockfile edits · no frozen-contract changes · no production data or secrets touched · synthetic test data confined to the isolated `dental_phase6_e2e` database.
