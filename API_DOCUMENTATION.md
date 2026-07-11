# Dental OS — Complete API Reference

> Target: React Frontend & Admin Dashboard developers.
> Every endpoint, request shape, response shape, validation rule, auth requirement, and Socket.IO event documented here matches the server exactly.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Response Format & Errors](#3-response-format--errors)
4. [Pagination](#4-pagination)
5. [Multi-Tenancy & Branch Scoping](#5-multi-tenancy--branch-scoping)
6. [RBAC & Permissions](#6-rbac--permissions)
7. [Socket.IO](#7-socketio)
8. [Endpoints — Clinic Frontend](#8-endpoints--clinic-frontend)
   - [8.1 Health](#81-health)
   - [8.2 Auth (Clinic)](#82-auth-clinic)
   - [8.3 Users](#83-users)
   - [8.4 Patients](#84-patients)
   - [8.5 Appointments](#85-appointments)
   - [8.6 Branches](#86-branches)
   - [8.7 Billing / Invoices](#87-billing--invoices)
   - [8.8 Accounting](#88-accounting)
   - [8.9 EMR: Dental Chart](#89-emr-dental-chart)
   - [8.10 EMR: Treatment Plans](#810-emr-treatment-plans)
   - [8.11 EMR: Prescriptions](#811-emr-prescriptions)
   - [8.12 EMR: Clinical Notes](#812-emr-clinical-notes)
   - [8.13 Inventory](#813-inventory)
   - [8.14 Roles](#814-roles)
   - [8.15 Chat](#815-chat)
   - [8.16 Dashboard](#816-dashboard)
   - [8.17 Search](#817-search)
   - [8.18 WhatsApp](#818-whatsapp)
   - [8.19 Wallet & Installments](#819-wallet--installments)
9. [Endpoints — Admin Dashboard](#9-endpoints--admin-dashboard)
   - [9.1 Site Auth](#91-site-auth)
   - [9.2 Site 2FA](#92-site-2fa)
   - [9.3 Tenants](#93-tenants)
   - [9.4 Site Admins](#94-site-admins)
   - [9.5 Plans](#95-plans)
   - [9.6 Platform Settings](#96-platform-settings)
   - [9.7 Site Branches](#97-site-branches)
   - [9.8 Site Users](#98-site-users)
   - [9.9 Subscriptions](#99-subscriptions)
   - [9.10 Analytics](#910-analytics)
   - [9.11 Audit Logs](#911-audit-logs)
   - [9.12 Feature Flags](#912-feature-flags)
   - [9.13 Error Logs](#913-error-logs)
   - [9.14 Impersonation](#914-impersonation)
   - [9.15 Quarantine](#915-quarantine)
   - [9.16 Backups](#916-backups)
   - [9.17 Performance](#917-performance)
   - [9.18 Site Health](#918-site-health)
10. [Background Jobs (Cron)](#10-background-jobs-cron)

---

## 1. Overview

### Base URL

```
Development: http://localhost:5000/api
Production:  https://<your-domain>/api
```

### Architecture

This is a **multi-tenant SaaS dental clinic management platform** with:
- **Clinic Frontend** (`dental os/`) — React SPA for clinic staff (doctors, receptionists, admins)
- **Admin Dashboard** (`dashboard/`) — React SPA for platform administrators (manages tenants, plans, billing)
- **API Server** (`server/`) — Express.js REST API with Socket.IO real-time events

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 (ES Modules) |
| Framework | Express 5.x |
| Database | MongoDB + Mongoose |
| Cache | Redis (ioredis) — optional, graceful fallback |
| Auth | JWT (httpOnly cookies) |
| Real-time | Socket.IO 4.x |
| Validation | Zod |
| Rate-limit | express-rate-limit (in-memory, upgrades to Redis) |

### Server Architecture (Modular Monolith)

```
server/
  app.js                    Express app setup (middleware, CORS, routes)
  server.js                 HTTP server + Socket.IO + cron jobs
  core/                     Shared primitives (transaction.js, counters.js)
  middleware/                Auth, validation, audit, error handling
  config/                   Database (MongoDB), Redis, env vars
  socket/                   Socket.IO connection + room management
  utils/                    ApiError, asyncHandler, JWT helpers, branch scoping
  constants/                Permission definitions, role defaults
  services/                 Cron jobs (suspension, backups, WhatsApp reminders)
  modules/                  14 domain modules — each self-contained:
    auth/                     Clinic login, token refresh, preferences
    users/                    User, Role, Branch models + controllers
    patients/                 Patient, Wallet, InstallmentPlan
    appointments/             Appointment scheduling
    billing/                  Invoice, Commission
    emr/                      DentalChart, TreatmentPlan, Prescription, ClinicalNote
    inventory/                InventoryItem + stock management
    accounting/               Expense, OwnerDrawing
    chat/                     Internal messaging (DM + channels)
    dashboard/                Stats aggregation
    search/                   Global search
    platform/                 Plan, PlatformSetting (SaaS config)
    whatsapp/                 WhatsApp integration
    site/                     Admin dashboard domain:
      tenant/                   Tenant CRUD, provisioning, stats
      auth/                     Site admin auth, 2FA, impersonation
      subscription/             Billing, revenue stats, payment processing
      analytics/                Platform-wide analytics & growth
      audit/                    Audit log queries
      backup/                   Backup management
      errorLog/                 Error log queries
      featureFlag/              Module toggling with Redis caching
      quarantine/               Abuse detection & quarantine
```

Each module follows the pattern: **Model** → **Service** (business logic) → **Controller** (HTTP adapter) → **Routes** (middleware + wiring) → **Validator** (Zod schemas).

### Two separate auth domains

| Domain | Cookie prefix | User model | Frontend |
|--------|--------------|------------|----------|
| Clinic (`/api/*`) | `access_token` / `refresh_token` | `User` (staff) | Clinic SPA |
| Site Admin (`/api/site/*`) | `site_access` / `site_refresh` | `SiteAdmin` | Admin Dashboard SPA |

---

## 2. Authentication

### 2.1 Clinic Auth Flow

```
1. POST /api/auth/login  ──→ Server sets access_token (15min) + refresh_token (7d) cookies
2. Every request automatically sends cookies
3. If 401 → POST /api/auth/refresh (reads refresh_token cookie)
4. POST /api/auth/logout → clears cookies
```

**Cookie details:**

| Cookie | Type | MaxAge | Path | HttpOnly | SameSite |
|--------|------|--------|------|----------|----------|
| `access_token` | JWT | 15 min | `/api` | true | Lax |
| `refresh_token` | JWT | 7 days | `/api/auth/refresh` | true | Lax |

**Token rotation:** Every refresh increments `tokenVersion` on the User document. Old JWTs with stale `tokenVersion` are rejected. This invalidates all previous sessions.

**Tenant suspension gate:** Every protected request checks `req.user.tenant.status`. If `suspended` or `cancelled`, the request is rejected with 403 before any controller logic runs.

### 2.2 Site Admin Auth Flow

Same pattern but with separate cookies (`site_access`, `site_refresh`) and `SiteAdmin` model. Optional 2FA:

```
1. POST /api/site/auth/login
   → If 2FA enabled: { requires2fa: true, challengeToken, adminId }
   → If 2FA disabled: sets site cookies directly
2. If 2FA required: POST /api/site/2fa/verify-login { adminId, challengeToken, token }
3. GET /api/site/auth/me → verify cookies work
```

### 2.3 Impersonation

Site admins can impersonate a clinic user:

```
POST /api/site/impersonation/start { userId, tenantId }
  → Returns an impersonation token
  → Client uses this token as the access_token cookie
  → req.user._impersonating flag is set (visible in audit logs)
POST /api/site/impersonation/end → clears impersonation
```

---

## 3. Response Format & Errors

### Success

```json
{
  "success": true,
  "data": { /* resource payload */ }
}
```

Paginated responses:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

### Error

```json
{
  "success": false,
  "message": "Human-readable error description",
  "details": { "fieldName": ["error message"] }
}
```

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET, PATCH, PUT |
| 201 | Created | Successful POST |
| 400 | Bad Request | Validation failed (Zod), invalid JSON body, CastError |
| 401 | Unauthorized | Missing/expired/invalid token |
| 403 | Forbidden | Insufficient role, plan doesn't include module, tenant suspended |
| 404 | Not Found | Resource doesn't exist, wrong ID |
| 409 | Conflict | Duplicate email/name (MongoDB 11000) |
| 429 | Too Many Requests | Rate-limited |
| 500 | Internal Server Error | Unhandled server error |

### Frontend error handling pattern

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  details?: Record<string, string[]>;
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  const body: ApiResponse<T> = await res.json();
  if (!body.success) {
    if (res.status === 401) {
      // Try refresh
      const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (refreshRes.ok) return api<T>(url, options);
      // Redirect to login
    }
    throw new ApiError(body.message, res.status, body.details);
  }
  return body.data;
}
```

---

## 4. Pagination

Every list endpoint accepts these query params:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer ≥1 | 1 | Page number |
| `limit` | integer 1–100 | 20 | Items per page |

Response always includes:

```json
{
  "success": true,
  "data": {
    "...": [ /* items */ ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

---

## 5. Multi-Tenancy & Branch Scoping

### Data ownership chain

```
Platform ── owns ──> Tenants (clinics)
                       │
                       └── owns ──> Branches (physical locations)
                                      │
                                      └── owns ──> Users, Patients, Appointments,
                                                    Invoices, Inventory, EMR, etc.
```

### How scoping works from the frontend

1. **Logged-in user** always has `user.branch` (ObjectId) and `user.tenant` (ObjectId).
2. **Clinic routes** automatically scope to the user's branch/tenant via `filterByBranch(req)`.
3. **Frontend never sends `branch` or `tenant` in request bodies** for read operations — the server infers from the JWT.
4. **For create operations** (patients, appointments, invoices, etc.), the server uses `resolveBranchForCreate(req)` which validates that the branch belongs to the user's tenant.
5. **EMR sub-routes** (`/patients/:patientId/clinical-notes`, `treatment-plans`, `prescriptions`) scope through the patient — first loads the patient via `loadScopedPatient(req, patientId)`, then operates on child resources under that patient.
6. **Admin routes** scope via `:tenantId` in the URL path.

### PHI restriction (phiRestrict)

When a site admin impersonates a clinic user, GET endpoints for patient-sensitive resources automatically strip Protected Health Information (PHI) from responses. This is handled by the `phiRestrict` middleware:

**Affected endpoints:** All GET operations on:
- `/api/patients` and `/api/patients/:id`
- `/api/patients/:patientId/dental-chart`
- `/api/patients/:patientId/treatment-plans` and `/:planId`
- `/api/patients/:patientId/prescriptions` and `/:rxId`
- `/api/patients/:patientId/clinical-notes` and `/:noteId`

**Behavior:** When `req.isImpersonation === true`, the response data is passed through `stripPHI()` which redacts sensitive fields. The frontend should handle this gracefully — the data shape is the same, but certain fields may be masked.

### Frontend guidelines

- **DO** let the server determine branch/tenant scope automatically.
- **DON'T** send `branch` or `tenant` in request bodies unless the endpoint explicitly requires it (e.g., creating a branch, which needs `tenant`).
- **DO** use `GET /api/branches` to populate branch dropdowns — it returns only branches the user has access to.
- **DO** check `user.role` and `user.tenant.planModules` on the frontend for UI conditional rendering (hide inventory tab if plan doesn't include 'inventory').

---

## 6. RBAC & Permissions

### Module list (from `constants/permissions.js`)

```
dashboard, patients, appointments, billing, accounting, inventory,
users, branches, roles, settings, chat, emr, prescriptions, whatsapp
```

Each module supports actions: `create`, `read`, `update`, `delete`.

### Permission resolution order (clinic routes)

1. **Plan gate**: If the tenant's plan doesn't include this module → 403.
2. **Role resolution**: Look up `Role` document (by `roleId` or `role` key + tenant), fallback to built-in defaults.
3. **System admin bypass**: `clinic_admin`, `site_admin`, `super_admin` (without tenant) pass all checks.
4. **Action check**: Does the role grant the requested `action` on the `module`?

### Frontend permission checking

```typescript
// GET /api/auth/my-permissions
{
  "permissions": {
    "patients": ["create", "read", "update", "delete"],
    "appointments": ["read", "update"],
    "billing": ["read"]
  }
}
```

Use this response to conditionally show/hide UI elements. Cache it on login and refresh after role changes.

### Plan module checking

```typescript
// From user.tenant.planModules (populated on /api/auth/me)
const planModules: string[] = user.tenant?.planModules || [];
const hasModule = (mod: string) => planModules.includes(mod);
```

---

## 7. Socket.IO

### Connection

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: 'access_token_jwt' },
  withCredentials: true,
});
```

The server extracts the JWT from `socket.handshake.auth.token` or the `access_token` cookie. If invalid, the connection is rejected with `Unauthorized`.

### Rooms the client automatically joins

| Room | Member | Purpose |
|------|--------|---------|
| `branch:{branchId}` | Any user in that branch | Receive branch-scoped real-time events |
| `user:{userId}` | That user only | Receive DMs and personal notifications |
| `chat:{tenantId}:{channel}` | Users in tenant subscribed to channel | Chat messages in channels |
| `admin` | Site admins only | Platform-wide notifications |

### Client → Server events

| Event | Payload | Who sends | Description |
|-------|---------|-----------|-------------|
| `subscribe:branch` | `branchId: string` | Site admin | Start observing another branch's events (validates tenant ownership) |
| `unsubscribe:branch` | `branchId: string` | Site admin | Stop observing a branch |

### Server → Client events (branch-scoped)

Emitted by `emitToBranch(branchId, event, payload)`.

| Event | Payload | Triggered by |
|-------|---------|-------------|
| `appointment:created` | `{ appointment }` | `POST /api/appointments` |
| `appointment:updated` | `{ appointment }` | `PATCH /api/appointments/:id` |
| `appointment:statusChanged` | `{ appointment }` | `PATCH /api/appointments/:id/status`, `DELETE /api/appointments/:id` (cancel) |
| `invoice:created` | `{ invoice }` | `POST /api/billing` |
| `invoice:updated` | `{ invoice }` | `PATCH /api/billing/:id` or `POST /api/billing/:id/payments` |
| `clinical-note:created` | `{ note }` | `POST /patients/:pid/clinical-notes` |
| `clinical-note:updated` | `{ note }` | `PATCH /patients/:pid/clinical-notes/:nid` |
| `clinical-note:deleted` | `{ _id }` | `DELETE /patients/:pid/clinical-notes/:nid` |
| `treatment-plan:created` | `{ plan }` | `POST /patients/:pid/treatment-plans` |
| `treatment-plan:updated` | `{ plan }` | PATCH / DELETE / POST invoice on treatment plan |
| `chart:updated` | `{ dentalChart }` | `PATCH /patients/:pid/dental-chart` or `/teeth/:number` |
| `prescription:created` | `{ prescription }` | `POST /patients/:pid/prescriptions` |
| `prescription:updated` | `{ prescription }` | `PATCH /patients/:pid/prescriptions/:rxId` |
| `prescription:deleted` | `{ _id }` | `DELETE /patients/:pid/prescriptions/:rxId` |
| `chat:message` | `{ message }` | New chat message (to recipient room or channel room) |
| `chat:read` | `{ messageIds, readerId }` | `PATCH /api/chat/read` (emitted to message senders) |

### Chat event flow

```typescript
// Direct message — emitted to BOTH sender and recipient user rooms
socket.on('chat:message', (msg) => {
  if (msg.sender._id === currentUserId || msg.recipient._id === currentUserId) {
    // show message
  }
});

// Channel message — emitted to the channel room (tenant-scoped)
socket.on('chat:message', (msg) => {
  if (msg.channel) {
    // show in channel UI
  }
});
```

---

## 8. Endpoints — Clinic Frontend

### 8.1 Health

```
GET /api/health
Auth: None
Response: "Dental OS API is running" (text/plain)
```

---

### 8.2 Auth (Clinic)

```
POST /api/auth/login
Auth: None
Rate-limit: 20/15min
Body: {
  "email": string (valid email),
  "password": string (min 8 chars)
}
Success: 201
Response: { "success": true, "data": { "user": UserObject } }
Cookies set: access_token (15min), refresh_token (7d)
Errors: 401 wrong credentials, 429 rate limit
```

```
POST /api/auth/logout
Auth: None
Success: 200
Cookies cleared: access_token, refresh_token
```

```
POST /api/auth/refresh
Auth: None (reads refresh_token cookie)
Rate-limit: 20/15min
Success: 200
Cookies rotated: new access_token, new refresh_token
Errors: 401 (refresh_token expired/missing → redirect to login)
```

```
GET /api/auth/me
Auth: protect
Response: { "user": {
  "_id": "ObjectId",
  "name": "string",
  "email": "string",
  "role": "receptionist|doctor|clinic_admin|accountant|site_admin",
  "roleId": "ObjectId|null",
  "phone": "string",
  "commissionRate": number,
  "branch": { "_id": "ObjectId", "name": "string", "address": "string", "phone": "string", "isActive": boolean },
  "tenant": { "_id": "ObjectId", "plan": "string", "planModules": ["string"], "planId": "ObjectId", "status": "active|trial|suspended|cancelled|archived", "name": "string", "isActive": boolean },
  "isActive": boolean,
  "isDoctor": boolean,
  "preferences": { "language": "en|ar", "theme": "light|dark" }
}}
```

```
GET /api/auth/my-permissions
Auth: protect
Response: { "isSystemAdmin": boolean, "permissions": { "moduleName": ["action", ...], ... } }
```

```
PATCH /api/auth/preferences
Auth: protect
Body: {
  "language": "en" | "ar",
  "theme": "light" | "dark"
}
Success: 200
Response: { "user": UserObject }
```

---

### 8.3 Users

```
GET /api/users
Auth: protect, checkPermission('users', 'read')
Query: ?page=1&limit=20
Response: { "users": [UserObject], "pagination": {...} }
```

```
GET /api/users/doctors
Auth: protect (no specific permission — any logged-in user can list doctors)
Response: { "doctors": [UserObject] }  — filtered to users with isDoctor=true or role='doctor'
```

```
GET /api/users/:id
Auth: protect, checkPermission('users', 'read')
Response: { "user": UserObject }
```

```
POST /api/users
Auth: protect, checkPermission('users', 'create')
Body: {
  "name": string (required, min 2),
  "email": string (required, valid email — unique across ALL tenants),
  "password": string (required, min 8),
  "role": "receptionist" | "doctor" | "clinic_admin" | "accountant" | "site_admin",
  "roleId": ObjectId (optional — references a Role document; validated to belong to same tenant),
  "phone": string (optional),
  "branch": ObjectId (required unless role is site_admin/clinic_admin),
  "isDoctor": boolean (optional),
  "commissionRate": number 0-100 (optional, for doctors)
}
Success: 201
Response: { "user": UserObject }
```

```
PATCH /api/users/:id
Auth: protect, checkPermission('users', 'update')
Body: { "name"?, "email"?, "password"?, "role"?, "roleId"?, "phone"?, "branch"?, "isDoctor"?, "commissionRate"? }
Response: { "user": UserObject }
```

```
DELETE /api/users/:id
Auth: protect, checkPermission('users', 'delete')
Success: 200 (soft delete — sets isActive=false)
```

```
PATCH /api/users/:id/toggle-active
Auth: protect, checkPermission('users', 'update')
Body: none
Success: 200
Response: { "user": UserObject } (isActive toggled)
```

---

### 8.4 Patients

```
GET /api/patients
Auth: protect, checkPermission('patients', 'read')
Query: {
  "page": 1,
  "limit": 20,
  "search": "string" (searches firstName, lastName, phone, patientId),
  "isActive": "true" | "false" (filter by active status, default shows active only)
}
Response: { "patients": [PatientObject], "pagination": {...} }
```

```
GET /api/patients/:id
Auth: protect, checkPermission('patients', 'read')
Response: { "patient": PatientObject }
```

```
POST /api/patients
Auth: protect, checkPermission('patients', 'create')
Body: {
  "firstName": string (required),
  "lastName": string (required),
  "phone": string (required),
  "email": string (optional, valid email),
  "dateOfBirth": string (ISO date, optional),
  "gender": "male" | "female" | "other" | "unknown" (optional),
  "address": string (optional),
  "medicalHistory": {
    "chronicConditions": [{ "name": string, "notes": string }],
    "allergies": [{ "name": string, "notes": string }],
    "notes": "string"
  } (optional),
  "branch": ObjectId (optional — defaults to user's branch)
}
Success: 201
Response: { "patient": PatientObject }
patientId auto-generated: PT-XXXXX
```

```
PATCH /api/patients/:id
Auth: protect, checkPermission('patients', 'update')
Body: any of the create fields
Response: { "patient": PatientObject }
```

```
DELETE /api/patients/:id
Auth: protect, checkPermission('patients', 'delete')
Success: 200 (sets isActive=false — archive)
```

**PatientObject shape:**

```typescript
{
  "_id": "ObjectId",
  "patientId": "PT-00001",
  "firstName": "string",
  "lastName": "string",
  "phone": "string",
  "email": "string | null",
  "dateOfBirth": "ISO date | null",
  "gender": "male" | "female" | "other" | "unknown",
  "address": "string",
  "medicalHistory": {
    "chronicConditions": [{ "name": "string", "notes": "string" }],
    "allergies": [{ "name": "string", "notes": "string" }],
    "notes": "string"
  },
  "branch": "ObjectId",
  "tenant": "ObjectId",
  "isActive": true,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

---

### 8.5 Appointments

```
GET /api/appointments
Auth: protect, checkPermission('appointments', 'read')
Query: {
  "page": 1,
  "limit": 20,
  "from", "to": ISO dates (date range filter, optional),
  "date": ISO date (filter to a single day, optional),
  "doctor": ObjectId (optional),
  "status": "scheduled|confirmed|checked_in|in_progress|completed|cancelled|no_show" (optional),
  "patient": ObjectId (optional),
  "branch": ObjectId (optional)
}
Response: { "appointments": [AppointmentObject], "pagination": {...} }
```

```
GET /api/appointments/:id
Auth: protect, checkPermission('appointments', 'read')
Response: { "appointment": AppointmentObject }
```

```
POST /api/appointments
Auth: protect, checkPermission('appointments', 'create')
Body: {
  "patient": ObjectId (required),
  "doctor": ObjectId (required),
  "branch": ObjectId (optional — defaults to user's branch),
  "start": ISO date (required),
  "end": ISO date (required — must be after start),
  "reason": string (optional, max 500),
  "notes": string (optional),
  "chair": string (optional)
}
Success: 201
Response: { "appointment": AppointmentObject }
```

```
PATCH /api/appointments/:id
Auth: protect, checkPermission('appointments', 'update')
Body: any of the create fields
Response: { "appointment": AppointmentObject }
```

```
PATCH /api/appointments/:id/status
Auth: protect, checkPermission('appointments', 'update')
Body: { "status": "scheduled|confirmed|checked_in|in_progress|completed|cancelled|no_show" }
Response: { "appointment": AppointmentObject }
```

```
DELETE /api/appointments/:id
Auth: protect, checkPermission('appointments', 'delete')
Success: 200 (sets status='cancelled')
Note: Returns 409 if status transition is invalid (e.g., can't cancel an in_progress appointment).
```

**AppointmentObject shape:**

```typescript
{
  "_id": "ObjectId",
  "patient": { "_id": "ObjectId", "patientId": "string", "firstName": "string", "lastName": "string", "phone": "string" },
  "doctor": { "_id": "ObjectId", "name": "string" },
  "branch": "ObjectId",
  "tenant": "ObjectId",
  "start": "ISO date",
  "end": "ISO date",
  "status": "scheduled|confirmed|checked_in|in_progress|completed|cancelled|no_show",
  "reason": "string",
  "notes": "string",
  "chair": "string",
  "reminderSentAt": "ISO date | null",
  "confirmSentAt": "ISO date | null",
  "createdBy": "ObjectId",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

---

### 8.6 Branches

```
GET /api/branches
Auth: protect, checkPermission('branches', 'read')
Response: { "branches": [BranchObject] }
```

```
POST /api/branches
Auth: protect, checkPermission('branches', 'create')
Body: { "name": string (required), "address": string, "phone": string }
Success: 201
Response: { "branch": BranchObject }
```

```
PATCH /api/branches/:id
Auth: protect, checkPermission('branches', 'update')
Body: { "name"?, "address"?, "phone"? }
Response: { "branch": BranchObject }
```

```
DELETE /api/branches/:id
Auth: protect, checkPermission('branches', 'delete')
Success: 200
```

**BranchObject:**

```typescript
{
  "_id": "ObjectId",
  "tenant": "ObjectId",
  "name": "string",
  "address": "string",
  "phone": "string",
  "isActive": boolean
}
```

---

### 8.7 Billing / Invoices

```
GET /api/billing
Auth: protect, checkPermission('billing', 'read')
Query: {
  "page": 1, "limit": 20,
  "search": "string" (searches invoiceNo, patient name),
  "status": "unpaid|partial|paid|void",
  "patient": ObjectId,
  "appointment": ObjectId
}
Response: { "invoices": [InvoiceObject], "pagination": {...} }
```

```
GET /api/billing/summary
Auth: protect, checkPermission('billing', 'read')
Response: {
  "totalOutstanding": number,
  "totalOverdue": number,
  "invoiceCounts": { "unpaid": number, "partial": number, "paid": number, "void": number },
  "periodRevenue": number,
  "periodStart": "ISO date",
  "periodEnd": "ISO date"
}
```

```
GET /api/billing/aging
Auth: protect, checkPermission('billing', 'read')
Response: {
  "aging": {
    "current": number (0-30 days),
    "31-60": number,
    "61-90": number,
    "90+": number
  }
}
```

```
GET /api/billing/:id
Auth: protect, checkPermission('billing', 'read')
Response: { "invoice": InvoiceObject }
```

```
POST /api/billing
Auth: protect, checkPermission('billing', 'create')
Body: {
  "patient": ObjectId (required),
  "branch": ObjectId (optional),
  "appointment": ObjectId (optional),
  "items": [{ "description": string, "quantity": number≥1, "unitPrice": number≥0 }] (required, min 1),
  "discount": number≥0 (optional),
  "discountType": "fixed" | "percentage" (optional),
  "discountRate": number 0-100 (optional, used with percentage),
  "tax": number≥0 (optional),
  "dueDate": ISO date (optional),
  "notes": string (optional, max 1000)
}
Success: 201
Response: { "invoice": InvoiceObject }
invoiceNo auto-generated: INV-XXXXX
```

```
PATCH /api/billing/:id
Auth: protect, checkPermission('billing', 'update')
Body: { "items"?, "discount"?, "discountType"?, "discountRate"?, "tax"?, "dueDate"?, "notes"? }
Response: { "invoice": InvoiceObject }
```

```
POST /api/billing/:id/payments
Auth: protect, checkPermission('billing', 'update')
Body: {
  "amount": number ≥0.01 (required),
    "method": "cash|card|transfer|wallet" (required),
  "reference": string (optional, max 200),
  "date": ISO date (optional),
  "notes": string (optional, max 300)
}
Success: 200
Response: { "invoice": InvoiceObject }
Behavior: Auto-creates Commission if invoice has appointment with doctor who has commissionRate > 0.
Uses MongoDB transaction: payment + wallet debit (if method=wallet) + commission creation are atomic.
```

```
POST /api/billing/:id/refund
Auth: protect, checkPermission('billing', 'update')
Body: {
  "amount": number ≥0.01 (required),
  "method": "cash|card|transfer|cheque|other" (optional),
  "reference": string (optional),
  "date": ISO date (optional),
  "notes": string (optional)
}
Success: 200
Response: { "invoice": InvoiceObject }
Note: Does NOT reverse commissions. Commission reversal must be handled manually.
```

```
POST /api/billing/:id/void
Auth: protect, checkPermission('billing', 'update')
Body: { "reason": string (required, max 500) }
Response: { "invoice": InvoiceObject } (status → 'void')
```

**InvoiceObject shape:**

```typescript
{
  "_id": "ObjectId",
  "invoiceNo": "INV-00001",
  "tenant": "ObjectId",
  "branch": "ObjectId",
  "patient": { "_id": "ObjectId", "patientId": "string", "firstName": "string", "lastName": "string", "phone": "string" },
  "appointment": "ObjectId | null",
  "items": [{
    "description": "string",
    "quantity": number,
    "unitPrice": number,
    "total": number,
    "paidAmount": number  // ← proportionally allocated from total payments
  }],
  "subtotal": number,
  "discountType": "fixed" | "percentage" | null,
  "discountRate": number | null,
  "discount": number,
  "tax": number,
  "total": number,
  "paidAmount": number,
  "dueDate": "ISO date | null",
  "status": "unpaid" | "partial" | "paid" | "void",
  "payments": [{
    "amount": number,
    "method": "cash|card|transfer|wallet",
    "reference": "string",
    "date": "ISO date",
    "notes": "string",
    "recordedBy": { "_id": "ObjectId", "name": "string" },
    "isRefund": boolean,
    "idempotencyKey": "string"
  }],
  "notes": "string",
  "changelog": [{ "field": "string", "oldValue": "any", "newValue": "any", "changedBy": "ObjectId", "changedAt": "ISO date" }],
  "createdBy": { "_id": "ObjectId", "name": "string" },
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

**Virtual fields (computed, not stored):** `balance` (= total - paidAmount), `itemCount`, `isOverdue`, `daysOverdue`.

---

### 8.8 Accounting

```
GET /api/accounting/expenses
Auth: protect, checkPermission('accounting', 'read')
Query: { "page"?, "limit"?, "category"?, "startDate"?, "endDate"? }
Response: { "expenses": [ExpenseObject], "pagination": {...} }
```

```
POST /api/accounting/expenses
Auth: protect, checkPermission('accounting', 'create')
Body: {
  "category": "salary|rent|utilities|supplies|maintenance|marketing|other",
  "description": string (required),
  "amount": number ≥0.01 (required),
  "date": ISO date (optional — defaults to now),
  "paymentMethod": "cash|bank|card" (optional)
}
Success: 201
Response: { "expense": ExpenseObject }
expenseNo auto-generated: EXP-XXXXX
```

```
DELETE /api/accounting/expenses/:id
Auth: protect, checkPermission('accounting', 'delete')
Success: 200
```

**ExpenseObject shape:**

```typescript
{
  "_id": "ObjectId",
  "expenseNo": "EXP-00001",
  "tenant": "ObjectId",
  "branch": "ObjectId",
  "category": "salary|rent|utilities|supplies|maintenance|marketing|other",
  "description": "string",
  "amount": number,
  "date": "ISO date",
  "paymentMethod": "cash|bank|card",
  "recordedBy": { "_id": "ObjectId", "name": "string" },
  "isActive": boolean,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

**DrawingObject shape:**

```typescript
{
  "_id": "ObjectId",
  "drawingNo": "DRW-00001",
  "tenant": "ObjectId",
  "branch": "ObjectId",
  "owner": { "_id": "ObjectId", "name": "string" },
  "amount": number,
  "description": "string",
  "date": "ISO date",
  "recordedBy": { "_id": "ObjectId", "name": "string" },
  "isActive": boolean,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

```
GET /api/accounting/drawings
Auth: protect, checkPermission('accounting', 'read')
Query: { "page"?, "limit"?, "startDate"?, "endDate"? }
Response: { "drawings": [DrawingObject], "pagination": {...} }
```

```
POST /api/accounting/drawings
Auth: protect, checkPermission('accounting', 'create')
Body: {
  "owner": ObjectId (User — required),
  "amount": number ≥0.01 (required),
  "description": string (required),
  "date": ISO date (optional)
}
Success: 201
Response: { "drawing": DrawingObject }
drawingNo auto-generated: DRW-XXXXX
```

```
DELETE /api/accounting/drawings/:id
Auth: protect, checkPermission('accounting', 'delete')
Success: 200
```

```
GET /api/accounting/commissions
Auth: protect, checkPermission('accounting', 'read')
Query: { "page"?, "limit"?, "doctor"?, "status"? }
Response: { "commissions": [CommissionObject], "pagination": {...} }
```

```
PATCH /api/accounting/commissions/:id
Auth: protect, checkPermission('accounting', 'update')
Body: { "status": "paid" | "cancelled" }
Response: { "commission": CommissionObject }
```

```
GET /api/accounting/summary
Auth: protect, checkPermission('accounting', 'read')
Query: { "startDate"?, "endDate"? }
Response: {
  "summary": {
    "totalBilled": number,
    "totalCollected": number,
    "totalExpenses": number,
    "totalDrawings": number,
    "pendingCommissions": number,
    "paidCommissions": number,
    "netProfit": number
  },
  "expenseByCategory": [{ "category": "string", "total": number }],
  "revenueByMethod": [{ "method": "string", "total": number }],
  "monthlyRevenue": [{ "month": "YYYY-MM", "revenue": number }],
  "commissions": [{ "status": "string", "count": number, "total": number }]
}
```

**CommissionObject shape:**

```typescript
{
  "_id": "ObjectId",
  "commissionNo": "COM-XXXXX",
  "tenant": "ObjectId",
  "branch": "ObjectId",
  "doctor": { "_id": "ObjectId", "name": "string" },
  "patient": { "_id": "ObjectId", "firstName": "string", "lastName": "string" },
  "invoice": "ObjectId",
  "treatmentItem": "string",
  "procedureName": "string",
  "baseAmount": number,
  "rate": number,
  "amount": number,  // = baseAmount * rate / 100
  "status": "pending" | "paid",
  "paidDate": "ISO date | null",
  "createdBy": "ObjectId",
  "createdAt": "ISO date"
}
```

---

### 8.9 EMR: Dental Chart

All mounted under `/api/patients/:patientId/dental-chart`

```
GET /api/patients/:patientId/dental-chart
Auth: protect, checkPermission('emr', 'read')
Response: { "dentalChart": DentalChartObject }
```

```
PATCH /api/patients/:patientId/dental-chart
Auth: protect, checkPermission('emr', 'update')
Body: any subset of dental chart fields (teeth array, notes, dentitionType)
Response: { "dentalChart": DentalChartObject }
```

```
PATCH /api/patients/:patientId/dental-chart/teeth/:number
Auth: protect, checkPermission('emr', 'update')
Body: { "state": string, "surfaces"?: { "mesial"?: "sound|caries|restored", "distal"?: "sound|caries|restored", "occlusal"?: "sound|caries|restored", "buccal"?: "sound|caries|restored", "lingual"?: "sound|caries|restored" }, "notes"?: string }
Response: { "dentalChart": DentalChartObject }
```

**DentalChartObject shape:**

```typescript
{
  "_id": "ObjectId",
  "tenant": "ObjectId",
  "branch": "ObjectId",
  "patient": "ObjectId",
  "dentitionType": "primary" | "permanent" | "mixed",
  "teeth": [{
    "number": 1-32,
    "state": "sound|caries|filled|crown|root_canal|implant|missing|bridge|extraction_scheduled|fractured",
    "surfaces": { "mesial"?: "sound|caries|restored", "distal"?: "sound|caries|restored", "occlusal"?: "sound|caries|restored", "buccal"?: "sound|caries|restored", "lingual"?: "sound|caries|restored" },
    "notes": "string",
    "updatedAt": "ISO date",
    "updatedBy": "ObjectId"
  }],
  "notes": "string",
  "updatedBy": "ObjectId",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

All 32 teeth are pre-populated with `state: "sound"`. This is enforced on every save.

---

### 8.10 EMR: Treatment Plans

All mounted under `/api/patients/:patientId/treatment-plans`

```
GET /api/patients/:patientId/treatment-plans
Auth: protect, checkPermission('emr', 'read')
Query: { "page"?, "limit"?, "status"? }
Response: { "plans": [TreatmentPlanObject], "pagination": {...} }
```

```
POST /api/patients/:patientId/treatment-plans
Auth: protect, checkPermission('emr', 'create')
Body: {
  "title": string (required),
  "diagnosis": string (optional),
  "status": "active" | "completed" | "archived" (optional, default "active"),
  "items": [{
    "tooth": number 1-32 | null,
    "surfaces": ["mesial"|"distal"|"buccal"|"lingual"|"occlusal"],
    "procedureCode": "string",
    "procedureName": "string",
    "description": "string",
    "estimatedCost": number≥0,
    "status": "pending" | "in_progress" | "completed" | "cancelled",
    "notes": "string"
  }],
  "nextAppointment": ISO date (optional — auto-creates an Appointment),
  "nextAppointmentNotes": string (optional)
}
Success: 201
Response: { "plan": TreatmentPlanObject }
planNo auto-generated: TP-XXXXX
```

`nextAppointment` behavior: If a future date is provided, the server auto-creates an Appointment with status "scheduled", 30-min duration, linked to the same patient/branch/tenant/doctor. The appointment's `_id` is stored in `nextAppointmentCreated` on the plan. Past dates are silently ignored.

```
GET /api/patients/:patientId/treatment-plans/:planId
Auth: protect, checkPermission('emr', 'read')
Response: { "plan": TreatmentPlanObject }
```

```
PATCH /api/patients/:patientId/treatment-plans/:planId
Auth: protect, checkPermission('emr', 'update')
Body: { "title"?, "diagnosis"?, "status"?, "nextAppointment"?, "nextAppointmentNotes"? }
Note: nextAppointment only creates a NEW appointment once (guarded by nextAppointmentCreated).
Changing the date after initial creation does NOT create a second appointment.
Response: { "plan": TreatmentPlanObject }
```

```
DELETE /api/patients/:patientId/treatment-plans/:planId
Auth: protect, checkPermission('emr', 'delete')
Success: 200 (sets status='archived')
```

```
POST /api/patients/:patientId/treatment-plans/:planId/items
Auth: protect, checkPermission('emr', 'create')
Body: { "tooth"?, "surfaces"?, "procedureCode"?, "procedureName"?, "description"?, "estimatedCost"?, "status"?, "notes"? }
Success: 201
Response: { "plan": TreatmentPlanObject }
```

```
PATCH /api/patients/:patientId/treatment-plans/:planId/items/:itemId
Auth: protect, checkPermission('emr', 'update')
Body: any item field
Response: { "plan": TreatmentPlanObject }
```

```
DELETE /api/patients/:patientId/treatment-plans/:planId/items/:itemId
Auth: protect, checkPermission('emr', 'delete')
Response: { "plan": TreatmentPlanObject }
Note: Plan must keep at least 1 item. Delete last item is blocked with 409.
```

```
POST /api/patients/:patientId/treatment-plans/:planId/invoice
Auth: protect, checkPermission('emr', 'update')
Body: {
  "itemIds": ["ObjectId", ...] (required — IDs of treatment items to bill),
  "discount": number≥0,
  "tax": number≥0,
  "notes": string (optional)
}
Success: 201
Response: {
  "invoice": InvoiceObject,
  "plan": TreatmentPlanObject,
  "deductions": [{ "item": "procedureName", "deductions": [...] }]
}
Behavior:
- Creates Invoice with selected items (1 qty each, price = estimatedCost).
- Marks selected items as 'completed' (if pending).
- Auto-deducts inventory based on tooth state from DentalChart.
- The invoice's `patient` and `branch` come from the treatment plan.
```

**TreatmentPlanObject shape:**

```typescript
{
  "_id": "ObjectId",
  "planNo": "TP-00001",
  "tenant": "ObjectId",
  "branch": "ObjectId",
  "patient": { "_id": "ObjectId", "patientId": "string", "firstName": "string", "lastName": "string" },
  "title": "string",
  "diagnosis": "string",
  "status": "active|completed|archived",
  "items": [{
    "_id": "ObjectId",
    "tooth": number | null,
    "surfaces": ["mesial"|"distal"|"buccal"|"lingual"|"occlusal"],
    "procedureCode": "string",
    "procedureName": "string",
    "description": "string",
    "estimatedCost": number,
    "status": "pending|in_progress|completed|cancelled",
    "completedDate": "ISO date | null",
    "appointment": "ObjectId | null",
    "invoice": "ObjectId | null",  // ← set when invoice is generated from plan
    "notes": "string"
  }],
  "nextAppointment": "ISO date | null",
  "nextAppointmentNotes": "string",
  "nextAppointmentCreated": "ObjectId | null",  // ← ref to auto-created Appointment
  "createdBy": { "_id": "ObjectId", "name": "string" },
  "updatedBy": { "_id": "ObjectId", "name": "string" },
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

**Virtual fields:** `totalEstimated`, `totalCompleted`, `completedCount`, `progress`.

---

### 8.11 EMR: Prescriptions

All mounted under `/api/patients/:patientId/prescriptions`

```
GET /api/patients/:patientId/prescriptions
Auth: protect, checkPermission('prescriptions', 'read')
Query: { "page"?, "limit"? }
Response: { "prescriptions": [PrescriptionObject], "pagination": {...} }
```

```
POST /api/patients/:patientId/prescriptions
Auth: protect, checkPermission('prescriptions', 'create')
Body: {
  "doctor": ObjectId (required — must belong to same branch),
  "diagnosis": string (optional),
  "medications": [{
    "name": string (required),
    "dosage": string (optional),
    "frequency": string (optional),
    "duration": string (optional),
    "instructions": string (optional)
  }],
  "notes": string (optional),
  "appointment": ObjectId (optional),
  "issuedAt": ISO date (optional — defaults to now)
}
Success: 201
Response: { "prescription": PrescriptionObject }
rxNo auto-generated: RX-XXXXX
```

```
GET /api/patients/:patientId/prescriptions/:rxId
Auth: protect, checkPermission('prescriptions', 'read')
Response: { "prescription": PrescriptionObject }
```

```
PATCH /api/patients/:patientId/prescriptions/:rxId
Auth: protect, checkPermission('prescriptions', 'update')
Body: any create field
Response: { "prescription": PrescriptionObject }
```

```
DELETE /api/patients/:patientId/prescriptions/:rxId
Auth: protect, checkPermission('prescriptions', 'delete')
Success: 200
```

**PrescriptionObject shape:**

```typescript
{
  "_id": "ObjectId",
  "rxNo": "RX-00001",
  "tenant": "ObjectId | null",
  "branch": "ObjectId",
  "patient": "ObjectId",
  "doctor": { "_id": "ObjectId", "name": "string" },
  "appointment": "ObjectId | null",
  "diagnosis": "string",
  "medications": [{
    "_id": "ObjectId",
    "name": "string",
    "dosage": "string",
    "frequency": "string",
    "duration": "string",
    "instructions": "string"
  }],
  "notes": "string",
  "issuedAt": "ISO date",
  "createdBy": "ObjectId | null",
  "isActive": boolean,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

**Virtual fields:** `medicationCount`

---

### 8.12 EMR: Clinical Notes

All mounted under `/api/patients/:patientId/clinical-notes`

```
GET /api/patients/:patientId/clinical-notes
Auth: protect, checkPermission('emr', 'read')
Query: { "page"?, "limit"?, "appointment"? (ObjectId filter) }
Response: { "notes": [ClinicalNoteObject], "pagination": {...} }
```

```
POST /api/patients/:patientId/clinical-notes
Auth: protect, checkPermission('emr', 'create')
Body: {
  "doctor": ObjectId (required — must belong to same branch),
  "appointment": ObjectId (optional),
  "visitDate": ISO date (optional — defaults to now),
  "chiefComplaint": string,
  "examination": string,
  "diagnosis": string,
  "plan": string,
  "attachments": [{ "type": "xray"|"photo"|"document"|"other", "url": string, "caption": string }],
  "nextAppointment": ISO date (optional — auto-creates Appointment),
  "nextAppointmentNotes": string (optional)
}
Success: 201
Response: { "note": ClinicalNoteObject }
noteNo auto-generated: CN-XXXXX
```

Same `nextAppointment` behavior as treatment plans: auto-creates a 30-min scheduled Appointment if date is in the future. Past dates silently ignored. One-time creation guard.

```
GET /api/patients/:patientId/clinical-notes/:noteId
Auth: protect, checkPermission('emr', 'read')
Response: { "note": ClinicalNoteObject }
```

```
PATCH /api/patients/:patientId/clinical-notes/:noteId
Auth: protect, checkPermission('emr', 'update')
Body: any create field
Response: { "note": ClinicalNoteObject }
```

```
DELETE /api/patients/:patientId/clinical-notes/:noteId
Auth: protect, checkPermission('emr', 'delete')
Success: 200
Note: Does NOT cascade-delete auto-created appointment (orphaned appointment remains).
```

**ClinicalNoteObject shape:**

```typescript
{
  "_id": "ObjectId",
  "noteNo": "CN-00001",
  "tenant": "ObjectId",
  "branch": "ObjectId",
  "patient": { "_id": "ObjectId", "patientId": "string", "firstName": "string", "lastName": "string" },
  "doctor": { "_id": "ObjectId", "name": "string" },
  "appointment": "ObjectId | null",
  "visitDate": "ISO date",
  "chiefComplaint": "string",
  "examination": "string",
  "diagnosis": "string",
  "plan": "string",
  "attachments": [{ "type": "xray|photo|document|other", "url": "string", "caption": "string", "uploadedBy": "ObjectId", "uploadedAt": "ISO date" }],
  "nextAppointment": "ISO date | null",
  "nextAppointmentNotes": "string",
  "nextAppointmentCreated": "ObjectId | null",  // ← ref to auto-created Appointment
  "createdBy": { "_id": "ObjectId", "name": "string" },
  "updatedBy": { "_id": "ObjectId", "name": "string" },
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

---

### 8.13 Inventory

```
GET /api/inventory
Auth: protect, checkPermission('inventory', 'read')
Query: {
  "page"?, "limit"?,
  "search"? (searches name, sku, supplier),
  "category"?: "anesthetic|filling_material|consumable|instrument|medication|hygiene|other",
  "lowStock"? "true" (filters items where quantity ≤ reorderPoint)
}
Response: { "items": [InventoryItemObject], "pagination": {...}, "stats": { "lowStockCount": number } }
```

```
GET /api/inventory/:id
Auth: protect, checkPermission('inventory', 'read')
Response: { "item": InventoryItemObject }
```

```
POST /api/inventory
Auth: protect, checkPermission('inventory', 'create')
Body: {
  "name": string (required),
  "sku": string,
  "category": "anesthetic|filling_material|consumable|instrument|medication|hygiene|other",
  "unit": "unit|box|pack|bottle|tube|set|ml|g",
  "quantity": number≥0,
  "reorderPoint": number (default 5),
  "costPerUnit": number≥0,
  "expiryDate": ISO date,
  "supplier": string,
  "notes": string,
  "branch": ObjectId (optional — defaults to user's branch if not set)
}
Success: 201
Response: { "item": InventoryItemObject }
Behavior: If quantity > 0, an "initial" stock transaction is recorded.
```

```
PATCH /api/inventory/:id
Auth: protect, checkPermission('inventory', 'update')
Body: any create field
Response: { "item": InventoryItemObject }
```

```
DELETE /api/inventory/:id
Auth: protect, checkPermission('inventory', 'delete')
Success: 200
```

```
POST /api/inventory/:id/adjust
Auth: protect, checkPermission('inventory', 'update')
Body: {
  "type": "stock_in" | "stock_out" | "adjustment",
  "quantity": number>0,
  "reason": string (optional),
  "reference": string (optional)
}
Response: { "item": InventoryItemObject }
Notes: stock_out and expired use negative delta. Adjustment can be positive or negative.
Rejects if resulting quantity < 0.
```

**InventoryItemObject shape:**

```typescript
{
  "_id": "ObjectId",
  "tenant": "ObjectId",
  "branch": "ObjectId",
  "name": "string",
  "sku": "string",
  "category": "anesthetic|filling_material|consumable|instrument|medication|hygiene|other",
  "unit": "unit|box|pack|bottle|tube|set|ml|g",
  "quantity": number,
  "reorderPoint": number,
  "costPerUnit": number,
  "expiryDate": "ISO date | null",
  "supplier": "string",
  "notes": "string",
  "isActive": boolean,
  "transactions": [{
    "type": "stock_in|stock_out|adjustment|expired|initial",
    "quantity": number,
    "reason": "string",
    "reference": "string",
    "date": "ISO date",
    "recordedBy": "ObjectId"
  }],
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

---

### 8.14 Roles

```
GET /api/roles/modules/list
Auth: protect, checkPermission('roles', 'read')
Response: { "modules": ["dashboard", "patients", "appointments", "billing", ...], "actions": ["create", "read", "update", "delete"] }
```

```
GET /api/roles
Auth: protect, checkPermission('roles', 'read')
Response: { "roles": [RoleObject], "modules": ["dashboard", ...], "actions": ["create", "read", "update", "delete"] }
(Includes both tenant-specific and built-in roles with tenant=null; NOT paginated)
```

```
GET /api/roles/:id
Auth: protect, checkPermission('roles', 'read')
Response: { "role": RoleObject }
```

```
POST /api/roles
Auth: protect, checkPermission('roles', 'create')
Body: {
  "name": string (required — unique within tenant),
  "description": string,
  "permissions": [{ "module": string, "actions": ["create","read","update","delete"] }],
  "isSystemAdmin": boolean
}
Success: 201
Response: { "role": RoleObject }
```

```
PATCH /api/roles/:id
Auth: protect, checkPermission('roles', 'update')
Body: any create field
Response: { "role": RoleObject }
```

```
DELETE /api/roles/:id
Auth: protect, checkPermission('roles', 'delete')
Response: { "message": "Role deleted" }
```

**RoleObject shape:**

```typescript
{
  "_id": "ObjectId",
  "tenant": "ObjectId | null",
  "branch": "ObjectId | null",
  "name": "string",
  "description": "string",
  "key": "string",
  "isSystemAdmin": boolean,
  "isBuiltIn": boolean,
  "permissions": [{ "module": "string", "actions": ["create","read","update","delete"] }],
  "isActive": boolean,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

---

### 8.15 Chat

```
POST /api/chat
Auth: protect
Body: {
  "recipient": ObjectId (optional — for DMs),
  "channel": string (optional — for channel messages),
  "content": string (required, max 2000)
}
Success: 201
Response: { "message": MessageObject }
```

```
GET /api/chat
Auth: protect
Query: {
  "page"?, "limit"?,
  "channel"?: string (channel name),
  "recipient"?: ObjectId (for DMs)
}
Response: { "messages": [MessageObject], "pagination": {...} }
```

```
PATCH /api/chat/read
Auth: protect
Body: { "messageIds": ["ObjectId", ...] }
Response: { "updated": <count> }
```

```
GET /api/chat/staff
Auth: protect
Response: { "staff": [UserObject] }  // users in same branch available for DM
```

```
GET /api/chat/unread
Auth: protect
Response: { "unread": { "total": number, "byChannel": { "doctors": number, "accounting": number, "general": number }, "byUser": { "userId": number } } }
```

**MessageObject shape:**

```typescript
{
  "_id": "ObjectId",
  "branch": "ObjectId",
  "tenant": "ObjectId",
  "sender": { "_id": "ObjectId", "name": "string" },
  "recipient": "ObjectId | null",
  "channel": "string | null",
  "content": "string",
  "isRead": boolean,
  "readAt": "ISO date | null",
  "createdAt": "ISO date"
}
```

---

### 8.16 Dashboard

```
GET /api/dashboard/stats
Auth: protect, checkPermission('dashboard', 'read')
Response: {
  "summary": {
    "totalStaff": number,
    "activeStaff": number,
    "inactiveStaff": number,
    "doctors": number,
    "branches": number,  // branches the user can see
    "totalPatients": number,
    "todaysAppointments": number,
    "todaysInvoices": number,
    "outstanding": number  // total unpaid invoice balance
  },
  "queueByStatus": { "scheduled": number, "checked_in": number, "in_progress": number, ... },
  "staffByRole": [{ "role": "string", "count": number }],
  "recentStaff": [UserObject],
  "branches": [{ "_id": "ObjectId", "name": "string", "isActive": boolean, "staffCount": number }],
  "modules": [{ "key": "string", "label": "string", "enabled": boolean }]
}
```

---

### 8.17 Search

```
GET /api/search
Auth: protect, checkPermission('patients', 'read')
Query: {
  "q": string (search term — required),
  "type": "patients" (optional — currently only patients supported)
}
Response: {
  "results": {
    "patients": [PatientObject],
    "appointments": [AppointmentObject],
    "invoices": [InvoiceObject]
  },
  "total": number
}
```

---

### 8.18 WhatsApp

```
GET /api/whatsapp/settings
Auth: protect, checkPermission('settings', 'read')
Response: { "settings": WhatsAppSettingsObject }
```

```
PUT /api/whatsapp/settings
Auth: protect, checkPermission('settings', 'update')
Body: {
  "enabled": boolean,
  "provider": "whatsapp_web" | "twilio" | "cloud_api",
  "config": { ... } (provider-specific configuration, optional),
  "settings": {
    "appointmentReminder": boolean,
    "appointmentConfirm": boolean,
    "reminderHours": number (hours before appointment to send reminder)
  }
}
Response: { "settings": WhatsAppSettingsObject }
```

```
POST /api/whatsapp/connect
Auth: protect, checkPermission('settings', 'update')
Response: { "message": "Connecting..." } or { "qrCode": "data:image/png;base64,..." }
Behavior: Initiates WhatsApp Web connection. QR code available via GET /api/whatsapp/qr.
```

```
GET /api/whatsapp/qr
Auth: protect, checkPermission('settings', 'read')
Response: QR code image (PNG) — render as <img src="data:image/png;base64,...">
```

```
POST /api/whatsapp/disconnect
Auth: protect, checkPermission('settings', 'update')
Response: { "message": "Disconnected" }
```

```
GET /api/whatsapp/status
Auth: protect, checkPermission('settings', 'read')
Response: { "status": "disconnected|connecting|connected|error" }
```

```
POST /api/whatsapp/test
Auth: protect, checkPermission('settings', 'update')
Body: { "to": string (phone number), "message": string }
Response: { "sent": true, "to": "string", "message": "string" }
```

**WhatsAppSettingsObject shape:**

```typescript
{
  "_id": "ObjectId",
  "tenant": "ObjectId",
  "enabled": boolean,
  "provider": "whatsapp_web" | "twilio" | "cloud_api",
  "config": { "phoneNumber": "string" },  // sensitive fields excluded
  "settings": {
    "appointmentReminder": boolean,
    "appointmentConfirm": boolean,
    "reminderHours": number
  },
  "status": "disconnected|connecting|connected|error",
  "lastError": "string | null",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

---

### 8.19 Wallet

All mounted under `/api/patients/:patientId/wallet`

```
GET /api/patients/:patientId/wallet
Auth: protect, checkPermission('billing', 'read')
Response: { "wallet": WalletObject }
```

```
POST /api/patients/:patientId/wallet/transactions
Auth: protect, checkPermission('billing', 'update')
Body: {
  "type": "credit" | "debit",
  "amount": number >0 (required),
  "description": string (optional),
  "reference": string (optional),
  "invoice": ObjectId (optional — reference only, no auto-sync)
}
Response: { "wallet": WalletObject }
Note: Debit is rejected if balance < amount. This is a standalone wallet — does NOT auto-update invoice status.
```

### 8.20 Installment Plans

All mounted under `/api/patients/:patientId/installments`

```
GET /api/patients/:patientId/installments
Auth: protect, checkPermission('billing', 'read')
Query: { "page"?, "limit"?, "status"? }
Response: { "installmentPlans": [InstallmentPlanObject], "pagination": {...} }
```

```
POST /api/patients/:patientId/installments
Auth: protect, checkPermission('billing', 'create')
Body: {
  "title": string (required),
  "totalAmount": number>0 (required),
  "frequency": "weekly" | "biweekly" | "monthly" | "custom",
  "installments": [{
    "dueDate": ISO date (required),
    "amount": number>0 (required)
  }] (required, min 1),
  "invoice": ObjectId (optional),
  "notes": string (optional)
}
Success: 201
Response: { "installmentPlan": InstallmentPlanObject }
```

```
PATCH /api/patients/:patientId/installments/:planId
Auth: protect, checkPermission('billing', 'update')
Body: { "title"?, "notes"? }
Response: { "installmentPlan": InstallmentPlanObject }
```

```
POST /api/patients/:patientId/installments/:planId/pay
Auth: protect, checkPermission('billing', 'update')
Body: {
  "amount": number>0 (required),
  "paymentMethod": "cash|card|transfer|wallet" (optional),
  "paymentRef": string (optional),
  "notes": string (optional)
}
Response: { "installmentPlan": InstallmentPlanObject, "installment": InstallmentItemObject }
Note: Uses MongoDB transaction. Auto-marks installment paid when fully paid. Auto-marks plan completed when all installments paid. If paying via wallet, debits wallet atomically.
```

**WalletObject:**

```typescript
{
  "_id": "ObjectId",
  "tenant": "ObjectId",
  "branch": "ObjectId",
  "patient": "ObjectId",
  "balance": number,
  "transactions": [{
    "type": "credit|debit|refund|payment",
    "amount": number,
    "balanceBefore": number,
    "balanceAfter": number,
    "reference": "string",
    "description": "string",
    "invoice": "ObjectId | null",
    "installment": "ObjectId | null",
    "createdBy": "ObjectId",
    "createdAt": "ISO date"
  }],
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

**InstallmentPlanObject:**

```typescript
{
  "_id": "ObjectId",
  "tenant": "ObjectId",
  "branch": "ObjectId",
  "patient": "ObjectId",
  "invoice": "ObjectId | null",
  "title": "string",
  "totalAmount": number,
  "paidAmount": number,
  "installments": [{
    "_id": "ObjectId",
    "number": number,
    "dueDate": "ISO date",
    "amount": number,
    "paidAmount": number,
    "paidDate": "ISO date | null",
    "status": "pending|paid|overdue",
    "paymentMethod": "string|null",
    "paymentRef": "string",
    "notes": "string"
  }],
  "frequency": "weekly|biweekly|monthly|custom",
  "status": "active|completed|defaulted",
  "notes": "string",
  "createdBy": "ObjectId",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

---

## 9. Endpoints — Admin Dashboard

### 9.1 Site Auth

```http
POST /api/site/auth/login
Body: { "email": string, "password": string }
→ If 2FA disabled: 200, sets site_access + site_refresh cookies
→ If 2FA enabled: 200, { "requires2fa": true, "challengeToken": string, "adminId": string }

POST /api/site/auth/refresh
→ Reads site_refresh cookie, rotates tokens

GET /api/site/auth/me
Auth: protectSite
Response: { "admin": SiteAdminObject }

POST /api/site/auth/logout
Auth: protectSite

POST /api/site/auth/create
Auth: protectSite, authorizeSite('super_admin')
Body: { "name": string, "email": string, "password": string, "role": "super_admin|admin|support" }
Response: { "admin": SiteAdminObject }
```

**SiteAdminObject shape:**

```typescript
{
  "_id": "ObjectId",
  "name": "string",
  "email": "string",
  "role": "super_admin|site_admin|admin|support",
  "permissions": ["string"],
  "isActive": boolean,
  "lastLogin": "ISO date | null",
  "twoFactorEnabled": boolean,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
// Note: password, twoFactorSecret, twoFactorBackupCodes are never returned
```

### 9.2 Site 2FA

```http
POST /api/site/2fa/verify-login
Auth: None (uses challengeToken)
Body: {
  "adminId": string,
  "challengeToken": string (from login response),
  "token": string (6-digit TOTP),
  "backupCode": string (optional, for recovery)
}
→ Success: sets site_access + site_refresh cookies

GET /api/site/2fa/status
Auth: protectSite
Response: { "enabled": boolean, "method": "totp" | null }

POST /api/site/2fa/setup
Auth: protectSite
Response: { "secret": string, "qrCode": string (data:image/png;base64), "backupCodes": ["string"] }

POST /api/site/2fa/verify
Auth: protectSite
Body: { "token": string (6-digit TOTP) }
→ Enables 2FA

POST /api/site/2fa/disable
Auth: protectSite
Body: { "token": string (6-digit TOTP) }
→ Disables 2FA
```

### 9.3 Tenants

```http
GET /api/site/tenants
Auth: protectSite, authorizeSite('super_admin', 'admin', 'support')
Response: { "tenants": [TenantObject] }

GET /api/site/tenants/:id
Auth: same
Response: { "tenant": TenantObject }

GET /api/site/tenants/:id/stats
Auth: same
Response: { "stats": { "branchesCount": n, "usersCount": n, "doctorsCount": n, "patientsCount": n, "appointmentsCount": n, "totalRevenue": n, "planLimits": {...} } }

POST /api/site/tenants
Auth: authorizeSite('super_admin', 'admin')
Body: {
  "name": string (required),
  "email": string (required),
  "phone": string,
  "plan": string (any plan key — looked up in Plan collection),
  "address": string,
  "city": string,
  "country": string,
  "adminPassword": string (optional — auto-generated if not provided)
}
Audit: ✅
Success: 201
Response: { ...TenantObject, "adminCredentials": { "email", "password", "loginUrl" }, "encryptionKey": string }
Note: Creates Tenant + default Branch + clinic_admin User + Subscription in one request.
Returns encryptionKey and adminPassword ONCE — never retrievable again.

PUT /api/site/tenants/:id
Auth: authorizeSite('super_admin', 'admin')
Body: { "name"?, "email"?, "phone"?, "plan"?, "address"?, "city"?, "country"? }
Audit: ✅
Note: changing plan auto-syncs planModules + limits via updatePlanSettings.

PUT /api/site/tenants/:id/suspend
Auth: authorizeSite('super_admin', 'admin')
Audit: ✅
Response: { "tenant": TenantObject } (isActive=false, status='suspended')

PUT /api/site/tenants/:id/activate
Auth: authorizeSite('super_admin', 'admin')
Audit: ✅
Response: { "tenant": TenantObject } (isActive=true, status='active')

PUT /api/site/tenants/:id/archive
Auth: authorizeSite('super_admin')
Audit: ✅
Response: { "tenant": TenantObject }

DELETE /api/site/tenants/:id
Auth: authorizeSite('super_admin')
Audit: ✅
Response: { "message": "Tenant permanently deleted" }
Note: Cascade-deletes all Users, Branches, Patients, Appointments, Invoices, Subscriptions.
```

**TenantObject shape:**

```typescript
{
  "_id": "ObjectId",
  "name": "string",
  "slug": "string",
  "email": "string",
  "phone": "string",
  "plan": "string",            // e.g. "starter", "professional", "enterprise"
  "planId": "ObjectId | null",
  "planModules": ["string"],   // e.g. ["dashboard","patients","appointments","billing"]
  "status": "active|trial|suspended|cancelled|archived",
  "trialEndsAt": "ISO date | null",
  "subscriptionEndsAt": "ISO date | null",
  "address": "string",
  "city": "string",
  "country": "string",
  "settings": {
    "maxBranches": number,     // default 1
    "maxDoctors": number,      // default 3
    "maxPatients": number,     // default 500
    "storageLimit": number     // default 5120 (MB)
  },
  "isActive": boolean,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### 9.4 Site Admins

```http
GET /api/site/admins
Auth: protectSite, authorizeSite('super_admin', 'admin')
Response: { "admins": [SiteAdminObject], "pagination": {...} }

GET /api/site/admins/:id
Auth: same
Response: { "admin": SiteAdminObject }

POST /api/site/admins
Auth: authorizeSite('super_admin')
Body: { "name": string, "email": string, "password": string, "role": "super_admin|admin|support", "permissions": ["string"] }
Response: { "admin": SiteAdminObject }

PUT /api/site/admins/:id
Auth: authorizeSite('super_admin')
Body: { "name"?, "email"?, "password"?, "role"? }

DELETE /api/site/admins/:id
Auth: authorizeSite('super_admin')

PUT /api/site/admins/:id/permissions
Auth: authorizeSite('super_admin')
Body: { "permissions": ["string", ...] }
```

### 9.5 Plans

```http
GET /api/site/plans
Auth: protectSite, authorizeSite('super_admin', 'admin', 'support')
Response: { "plans": [PlanObject] }

GET /api/site/plans/:id
Auth: same
Response: { "plan": PlanObject }

POST /api/site/plans
Auth: authorizeSite('super_admin')
Body: {
  "name": string (required — key auto-generated from name),
  "price": number (required),
  "interval": "month" | "year",
  "modules": ["dashboard","patients","appointments","billing","accounting","emr","prescriptions","users","branches","inventory","roles","settings","chat","whatsapp"],
  "limits": { "maxBranches": number, "maxDoctors": number, "maxPatients": number, "storage": string },
  "features": ["string"],
  "isActive": boolean
}
Success: 201
Response: { "plan": PlanObject }

PUT /api/site/plans/:id
Auth: authorizeSite('super_admin')
Body: any create field
Response: { "plan": PlanObject }
Auto-syncs: if modules/limits/price changed, ALL tenants with this planId are updated.

DELETE /api/site/plans/:id
Auth: authorizeSite('super_admin')
Response: { "message": "Plan deleted" }
Blocked if: tenants are still assigned to this plan (409).
```

**PlanObject:**

```typescript
{
  "_id": "ObjectId",
  "name": "string",
  "key": "string",  // auto-generated from name
  "price": number,
  "interval": "month" | "year",
  "modules": ["string"],
  "limits": { "maxBranches": number, "maxDoctors": number, "maxPatients": number, "storage": "string" },
  "support": "string",
  "features": ["string"],
  "isActive": boolean,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### 9.6 Platform Settings

```http
GET /api/site/platform
Auth: protectSite, authorizeSite('super_admin', 'admin', 'support')
Response: { "settings": PlatformSettingsObject }

PUT /api/site/platform
Auth: authorizeSite('super_admin')
Body: {
  "siteName": "string",
  "supportEmail": "string",
  "autoSuspendDays": number,
  "maintenanceMode": boolean,
  "maxTenants": number,
  "backupEnabled": boolean,
  "backupRetentionDays": number,
  "backupTime": "string" (HH:MM format)
}
```

### 9.7 Site Branches

```http
GET /api/site/branches
Auth: protectSite, authorizeSite('super_admin', 'admin', 'support')
Query: { "tenant"?: ObjectId }
Response: { "branches": [BranchObject] }

GET /api/site/branches/:id
Auth: same

POST /api/site/branches
Auth: authorizeSite('super_admin', 'admin')
Body: { "tenant": ObjectId, "name": string, "address"?: string, "phone"?: string }

PUT /api/site/branches/:id
Auth: authorizeSite('super_admin', 'admin')
Body: { "name"?, "address"?, "phone"? }

DELETE /api/site/branches/:id
Auth: authorizeSite('super_admin')
```

### 9.8 Site Users

```http
GET /api/site/users/by-tenant/:tenantId
Auth: protectSite, authorizeSite('super_admin', 'admin')
Response: { "users": [UserObject] }
```

### 9.9 Subscriptions

```http
GET /api/site/subscriptions
Auth: protectSite, authorizeSite('super_admin', 'admin', 'support')
Response: { "subscriptions": [SubscriptionObject] }

GET /api/site/subscriptions/revenue
Auth: same
Response: {
  "totalRevenue": number,
  "monthlyRecurring": number,
  "yearlyRecurring": number,
  "pendingPayments": [{ "tenantId", "tenantName", "amount", "dueDate", "status" }],
  "revenueByPlan": [{ "plan": "string", "revenue": number, "count": number }],
  "revenueByMonth": [{ "month": "YYYY-MM", "total": number }]
}

PUT /api/site/subscriptions/:id
Auth: authorizeSite('super_admin', 'admin')
Body: { "plan"?: string, "billingCycle"?: "monthly"|"yearly", "status"?: "active"|"pending"|"past_due"|"cancelled" }
Response: { "subscription": SubscriptionObject }
Note: Changing plan auto-syncs tenant's planModules + settings. Yearly price = monthly × 10 (unless plan.interval === 'year').

POST /api/site/subscriptions/:tenantId/payment
Auth: authorizeSite('super_admin', 'admin')
Body: { "amount": number, "paymentMethod": "cash|card|transfer|other" }
Response: { "message": "Payment processed successfully", "subscription": SubscriptionObject }
```

**SubscriptionObject shape:**

```typescript
{
  "_id": "ObjectId",
  "tenant": "ObjectId",
  "plan": "string",
  "status": "active|pending|past_due|cancelled",
  "billingCycle": "monthly|yearly",
  "amount": number,
  "currency": "string",         // default "USD"
  "currentPeriodStart": "ISO date | null",
  "currentPeriodEnd": "ISO date | null",
  "cancelAtPeriodEnd": boolean,
  "lastPaymentAt": "ISO date | null",
  "nextPaymentAt": "ISO date | null",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### 9.10 Analytics

```http
GET /api/site/analytics/stats
Auth: protectSite, authorizeSite('super_admin', 'admin', 'support')
Response: {
  "totalTenants": number,
  "activeTenants": number,
  "suspendedTenants": number,
  "totalUsers": number,
  "totalPatients": number,
  "totalRevenue": number,
  "totalAppointments": number
}

GET /api/site/analytics/growth
Auth: same
Response: { "tenants": [{ "month": "YYYY-MM", "count": number }], "revenue": [{ "month": "YYYY-MM", "amount": number }] }

GET /api/site/analytics/usage/:tenantId
Auth: same
Response: { "users": number, "patients": number, "appointments": number, "invoices": number, "storage": number }
```

### 9.11 Audit Logs

```http
GET /api/site/audit-logs
Auth: protectSite, authorizeSite('super_admin', 'admin', 'support')
Query: { "page"?, "limit"?, "action"?, "targetType"?, "adminId"?, "startDate"?, "endDate"? }
Response: { "logs": [AuditLogObject], "pagination": {...} }

GET /api/site/audit-logs/actions
Auth: same
Response: { "actions": ["tenant.create", "tenant.update", "plan.update", "2fa.enable", ...] }
```

**AuditLogObject shape:**

```typescript
{
  "_id": "ObjectId",
  "admin": "ObjectId",
  "adminEmail": "string",
  "adminRole": "string",
  "action": "string",           // e.g. "tenant.create", "tenant.update", "tenant.suspend", "tenant.activate", "tenant.archive", "tenant.delete", "branch.create", "admin.create", "admin.update", "admin.delete", "admin.update_permissions", "subscription.update", "plan.create", "plan.update", "plan.delete", "platform.update", "feature.toggle", "2fa.enable", "2fa.disable", "quarantine.set", "quarantine.remove", "impersonation.start", "impersonation.end"
  "target": {
    "type": "string",           // "tenant" | "branch" | "admin" | "plan" | "platform"
    "id": "ObjectId",
    "name": "string"
  },
  "details": { ... },           // action-specific metadata
  "requestId": "string | null",
  "ip": "string",
  "userAgent": "string",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### 9.12 Feature Flags

```http
GET /api/site/feature-flags/:tenantId
Auth: protectSite, authorizeSite('super_admin', 'admin')
Response: { "modules": ["string"] }

PUT /api/site/feature-flags/:tenantId/toggle
Auth: authorizeSite('super_admin')
Body: { "module": string, "enabled": boolean }
Audit: ✅

PUT /api/site/feature-flags/:tenantId/modules
Auth: authorizeSite('super_admin')
Body: { "modules": ["string"] }
Audit: ✅
```

### 9.13 Error Logs

```http
GET /api/site/error-logs
Auth: protectSite, authorizeSite('super_admin', 'admin')
Query: { "page"?, "limit"?, "tenantId"?, "statusCode"?, "startDate"?, "endDate"? }
Response: { "logs": [ErrorLogObject], "pagination": {...} }

GET /api/site/error-logs/stats
Auth: same
Response: { "totalErrors": number, "byStatusCode": { "400": n, "500": n, ... }, "byTenant": { "tenantId": n } }
```

**ErrorLogObject shape:**

```typescript
{
  "_id": "ObjectId",
  "tenant": "ObjectId | null",
  "method": "string",           // "GET", "POST", etc.
  "url": "string",
  "statusCode": number,         // 400, 401, 404, 500, etc.
  "message": "string",
  "stack": "string",
  "requestId": "string | null",
  "ip": "string",
  "userAgent": "string",
  "resolved": boolean,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### 9.14 Impersonation

```http
POST /api/site/impersonation/start
Auth: protectSite, authorizeSite('super_admin', 'admin')
Body: { "userId": ObjectId, "tenantId": ObjectId }
Audit: ✅
Response: { "impersonationToken": "jwt-string", "expiresIn": "30m", "user": { "_id", "name", "email", "role", "branch", "tenant" }, "warning": "string" }
→ Client sets impersonationToken as the access_token cookie

POST /api/site/impersonation/end
Auth: protectSite, authorizeSite('super_admin', 'admin')
Response: { "message": "Impersonation ended" }
```

### 9.15 Quarantine

```http
PUT /api/site/quarantine/:tenantId
Auth: protectSite, authorizeSite('super_admin')
Body: { "reason": string (optional) }
Audit: ✅
→ Sets tenant isActive=false

PUT /api/site/quarantine/:tenantId/remove
Auth: protectSite, authorizeSite('super_admin')
Audit: ✅
→ Sets tenant isActive=true

GET /api/site/quarantine/checks
Auth: authorizeSite('super_admin', 'admin')
Response: { "checks": [{ "tenantId", "name", "plan", "isActive", "currentRate", "currentErrors", "flagged", "level", "reason" }] }
```

### 9.16 Backups

```http
GET /api/site/backups
Auth: protectSite, authorizeSite('super_admin', 'admin')
Query: { "page"?, "limit"? }
Response: { "backups": [BackupLogObject], "pagination": {...} }

GET /api/site/backups/:id
Auth: same
Response: { "backup": BackupLogObject }

POST /api/site/backups
Auth: authorizeSite('super_admin')
Response: { "backup": BackupLogObject, "message": "Backup started" }
```

**BackupLogObject:** `{ _id, filename, sizeBytes, status: "running|completed|failed", error, type: "scheduled|manual", triggeredBy, dbSizeBytes, durationMs, createdAt }`

### 9.17 Performance

```http
GET /api/site/perf
Auth: protectSite, authorizeSite('super_admin', 'admin')
Response: {
  "routes": [{ "method", "route", "count", "avgMs", "minMs", "maxMs", "errors", "errorRate", "lastHit" }],
  "summary": { "totalRequests": number, "totalErrors": number, "globalAvgMs": number }
}

POST /api/site/perf/reset
Auth: authorizeSite('super_admin')
Response: { "message": "Performance stats reset" }
```

### 9.18 Site Health

```http
GET /api/site/health
Auth: protectSite
Response: {
  "status": "healthy",
  "timestamp": "ISO date",
  "uptime": number (seconds),
  "mongodb": "connected" | "disconnected",
  "redis": "connected" | "disconnected",
  "node": "string",
  "platform": "string",
  "memory": { "rss": number, "heapTotal": number, "heapUsed": number },
  "telemetry": { ... }
}
```

---

## 10. Background Jobs (Cron)

These run automatically on the server. No frontend interaction needed, but good to know:

| Job | Schedule | Source file |
|-----|----------|-------------|
| **Tenant suspension** | Daily 00:00 | `services/suspensionCron.js` |
| **Abuse detection** | Every 60s | `services/abuseDetection.js` |
| **WhatsApp reminders** | Every 30min | `services/whatsappReminderCron.js` |
| **Database backup** | Daily 02:00 | `services/backup.js` + `services/backupCron.js` |
| **Installment reminders** | Daily 09:00 | `services/installmentCron.js` |
| **Abuse flush** | Every 60s | `services/abuseDetection.js` |
