# Frontend API Guide — Dental Clinic

**Purpose:** Quick reference for the frontend (clinic app + site admin) to know which API to call, what auth it needs, and common patterns.

---

## Base URL

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:3000/api` |
| Production | `https://{domain}/api` |

> **Always use `/api/v1/...` prefix** (canonical). The `/api/...` alias exists for backward compatibility only.

---

## Authentication

### Clinic Staff (protect)
```
POST /api/v1/auth/login          { email, password }
POST /api/v1/auth/refresh        { refreshToken }
POST /api/v1/auth/logout
```
- Response includes `accessToken` and `refreshToken`
- Send `Authorization: Bearer {accessToken}` on all subsequent requests
- Token contains tenant claim — all clinic endpoints are tenant-isolated automatically

### Site Admin (protectSite)
```
POST /api/v1/site/auth/login     { email, password }
POST /api/v1/site/auth/refresh   { refreshToken }
POST /api/v1/site/auth/logout
```
- Separate login for super_admin / admin / support roles
- 2FA may be required: check `GET /api/v1/site/2fa/status`
  - If 2FA active: `POST /api/v1/site/2fa/verify-login` → then `/site/auth/login`

---

## Common Patterns

### Pagination
```
GET /api/v1/patients?page=1&limit=20&search=ahmed&sort=-createdAt
```
Response:
```json
{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 20, "total": 150 } }
```

### Error Response
```json
{ "success": false, "message": "Validation failed", "errors": [...] }
```

### File Upload
```
POST /api/v1/emr/attachments/upload
Content-Type: multipart/form-data
Body: file (single file field)
```

---

## Clinic App — Endpoint Reference

### Patient Management
| Action | Method + Path | RBAC |
|--------|--------------|------|
| List patients | `GET /api/v1/patients?search=&page=&limit=` | patients.read |
| Create patient | `POST /api/v1/patients` | patients.create |
| View patient | `GET /api/v1/patients/{id}` | patients.read |
| Update patient | `PATCH /api/v1/patients/{id}` | patients.update |
| Delete patient | `DELETE /api/v1/patients/{id}` | patients.delete |
| Find duplicates | `GET /api/v1/patients/duplicates` | patients.read |
| Merge patients | `POST /api/v1/patients/{id}/merge` | patients.update |

### Dental Chart
| Action | Method + Path | RBAC |
|--------|--------------|------|
| Get chart | `GET /api/v1/patients/{patientId}/dental-chart` | emr.read |
| Update chart | `PATCH /api/v1/patients/{patientId}/dental-chart` | emr.update |
| Update tooth | `PATCH /api/v1/patients/{patientId}/dental-chart/teeth/{number}` | emr.update |

### Treatment Plans
| Action | Method + Path | RBAC |
|--------|--------------|------|
| List plans | `GET /api/v1/patients/{patientId}/treatment-plans` | emr.read |
| Create plan | `POST /api/v1/patients/{patientId}/treatment-plans` | emr.create |
| Update plan | `PATCH /api/v1/patients/{patientId}/treatment-plans/{planId}` | emr.update |
| Delete plan | `DELETE /api/v1/patients/{patientId}/treatment-plans/{planId}` | emr.delete |
| Add item | `POST .../treatment-plans/{planId}/items` | emr.create |
| Update item | `PATCH .../treatment-plans/{planId}/items/{itemId}` | emr.update |
| Delete item | `DELETE .../treatment-plans/{planId}/items/{itemId}` | emr.delete |
| Generate invoice | `POST .../treatment-plans/{planId}/invoice` | billing.create |

### Prescriptions
| Action | Method + Path | RBAC |
|--------|--------------|------|
| List | `GET /api/v1/patients/{patientId}/prescriptions` | emr.read |
| Create | `POST /api/v1/patients/{patientId}/prescriptions` | emr.create |
| View | `GET .../prescriptions/{rxId}` | emr.read |
| Print | `GET .../prescriptions/{rxId}/print` | emr.read |
| Update | `PATCH .../prescriptions/{rxId}` | emr.update |
| Delete | `DELETE .../prescriptions/{rxId}` | emr.delete |

### Appointments & Queue
| Action | Method + Path | RBAC |
|--------|--------------|------|
| List appointments | `GET /api/v1/appointments?date=&doctorId=&status=` | appointments.read |
| Create appointment | `POST /api/v1/appointments` | appointments.create |
| Update appointment | `PATCH /api/v1/appointments/{id}` | appointments.update |
| Change status | `PATCH /api/v1/appointments/{id}/status` | appointments.update |
| Cancel | `DELETE /api/v1/appointments/{id}` | appointments.delete |
| Get queue | `GET /api/v1/appointments/queue` | appointments.read |
| Call next | `POST /api/v1/appointments/queue/call-next` | appointments.update |

### Billing
| Action | Method + Path | RBAC |
|--------|--------------|------|
| List invoices | `GET /api/v1/billing?page=&limit=` | billing.read |
| Summary | `GET /api/v1/billing/summary` | billing.read |
| Aging report | `GET /api/v1/billing/aging` | billing.read |
| Create invoice | `POST /api/v1/billing` | billing.create |
| Update invoice | `PATCH /api/v1/billing/{id}` | billing.update |
| Record payment | `POST /api/v1/billing/{id}/payments` | billing.update |
| Void invoice | `POST /api/v1/billing/{id}/void` | billing.update |
| Refund | `POST /api/v1/billing/{id}/refund` | — |

### Accounting
| Action | Method + Path | RBAC |
|--------|--------------|------|
| Expenses CRUD | `GET/POST/DELETE /api/v1/accounting/expenses[/{id}]` | accounting.* |
| Drawings CRUD | `GET/POST/DELETE /api/v1/accounting/drawings[/{id}]` | accounting.* |
| Commissions | `GET/PATCH /api/v1/accounting/commissions[/{id}]` | accounting.* |
| Summary | `GET /api/v1/accounting/summary` | accounting.read |
| Day close | `GET /api/v1/accounting/day-close` | accounting.read |
| Close day | `POST /api/v1/accounting/day-close/close` | accounting.update |
| Day close list | `GET /api/v1/accounting/day-close/list` | accounting.read |
| Journal | `GET /api/v1/accounting/journal` | accounting.read |

### Inventory
| Action | Method + Path | RBAC |
|--------|--------------|------|
| List items | `GET /api/v1/inventory` | inventory.read |
| Create item | `POST /api/v1/inventory` | inventory.create |
| Update item | `PATCH /api/v1/inventory/{id}` | inventory.update |
| Delete item | `DELETE /api/v1/inventory/{id}` | inventory.delete |
| Adjust stock | `POST /api/v1/inventory/{id}/adjust` | inventory.update |

### Real-Time (Socket.IO)
Connect with `socket.handshake.auth.token` (same JWT as HTTP).
```
socket.emit('subscribe:branch', branchId)
socket.emit('subscribe:queue')
```
Events received:
- `user:created`, `user:updated`, `user:deleted`, `user:toggled`
- `patient:created`, `patient:updated`, `patient:merged`, `patient:archived`
- `appointment:statusChanged`
- `queue.status.changed`
- `inventory:created`, `inventory:updated`, `inventory:deleted`
- `expense:created`, `expense:deleted`
- `drawing:created`, `drawing:deleted`
- `chart:updated`
- `chat:read`
- `role:created`, `role:updated`, `role:deleted`
- `branch:created`, `branch:updated`, `branch:deleted`
- `wallet:updated`
- `stock.low`, `stock.expiring`, `stock.expired`
- `installment.overdue`, `installment.created`, `installment.paid`, `installment.updated`
- `payment.recorded`
- `commission:updated`
- `dayclose:closed`
- `automation:notify`

---

## Site Admin — Endpoint Reference

### Auth
| Action | Method + Path | Auth |
|--------|--------------|------|
| Login | `POST /api/v1/site/auth/login` | Public |
| Me | `GET /api/v1/site/auth/me` | Site |
| Refresh | `POST /api/v1/site/auth/refresh` | Public |
| Logout | `POST /api/v1/site/auth/logout` | Site |
| Create admin | `POST /api/v1/site/auth/create` | super_admin |
| Forgot password | `POST /api/v1/site/auth/recover/initiate` | Public |
| Reset password | `POST /api/v1/site/auth/recover/verify` | Public |

### Tenant Management
| Action | Method + Path | RBAC |
|--------|--------------|------|
| List tenants | `GET /api/v1/site/tenants` | super_admin\|admin\|support |
| View tenant | `GET /api/v1/site/tenants/{id}` | super_admin\|admin\|support |
| Tenant stats | `GET /api/v1/site/tenants/{id}/stats` | super_admin\|admin\|support |
| Create tenant | `POST /api/v1/site/tenants` | super_admin\|admin |
| Update tenant | `PUT /api/v1/site/tenants/{id}` | super_admin\|admin |
| Suspend | `PUT /api/v1/site/tenants/{id}/suspend` | super_admin\|admin |
| Activate | `PUT /api/v1/site/tenants/{id}/activate` | super_admin\|admin |
| Archive | `PUT /api/v1/site/tenants/{id}/archive` | super_admin |
| Delete | `DELETE /api/v1/site/tenants/{id}` | super_admin |

### Admin Management
| Action | Method + Path | RBAC |
|--------|--------------|------|
| List admins | `GET /api/v1/site/admins` | super_admin\|admin |
| View admin | `GET /api/v1/site/admins/{id}` | super_admin\|admin |
| Create admin | `POST /api/v1/site/admins` | super_admin |
| Update permissions | `PUT /api/v1/site/admins/{id}/permissions` | super_admin |
| Update admin | `PUT /api/v1/site/admins/{id}` | super_admin |
| Delete admin | `DELETE /api/v1/site/admins/{id}` | super_admin |

### Platform Plans
| Action | Method + Path | RBAC |
|--------|--------------|------|
| List plans | `GET /api/v1/site/plans` | super_admin\|admin\|support |
| View plan | `GET /api/v1/site/plans/{id}` | super_admin\|admin\|support |
| Create plan | `POST /api/v1/site/plans` | super_admin |
| Update plan | `PUT /api/v1/site/plans/{id}` | super_admin |
| Delete plan | `DELETE /api/v1/site/plans/{id}` | super_admin |

### Platform Analytics
| Action | Method + Path |
|--------|--------------|
| Overview | `GET /api/v1/site/analytics/platform/overview` |
| Financial | `GET /api/v1/site/analytics/platform/financial` |
| Inventory | `GET /api/v1/site/analytics/platform/inventory` |
| Patients | `GET /api/v1/site/analytics/platform/patients` |
| Appointments | `GET /api/v1/site/analytics/platform/appointments` |
| Doctors | `GET /api/v1/site/analytics/platform/doctors` |
| Treatments | `GET /api/v1/site/analytics/platform/treatments` |
| SaaS billing | `GET /api/v1/site/analytics/platform/saas-billing` |
| Security | `GET /api/v1/site/analytics/platform/security` |
| Activity | `GET /api/v1/site/analytics/platform/activity` |
| Usage | `GET /api/v1/site/analytics/platform/usage` |
| Jobs | `GET /api/v1/site/analytics/platform/jobs` |
| Roles | `GET /api/v1/site/analytics/platform/roles` | super_admin\|admin\|support |

### Site Operations
| Action | Method + Path | RBAC |
|--------|--------------|------|
| Site settings | `GET/PUT /api/v1/site/platform` | super_admin\|admin\|support / super_admin |
| Feature flags | `GET /api/v1/site/feature-flags/{tenantId}` | super_admin\|admin |
| Toggle flag | `PUT /api/v1/site/feature-flags/{tenantId}/toggle` | super_admin |
| Impersonate | `POST /api/v1/site/impersonation/start` | super_admin\|admin |
| Stop impersonation | `POST /api/v1/site/impersonation/end` | super_admin\|admin |
| Subscriptions | `GET /api/v1/site/subscriptions` | super_admin\|admin\|support |
| Backups | `GET /api/v1/site/backups` | super_admin\|admin |
| Create backup | `POST /api/v1/site/backups` | super_admin |
| Error logs | `GET /api/v1/site/error-logs` | super_admin\|admin |
| Performance | `GET /api/v1/site/perf` | super_admin\|admin |
| Reset perf | `POST /api/v1/site/perf/reset` | super_admin |
| Audit logs | `GET /api/v1/site/audit-logs` | super_admin\|admin\|support |
| Health (internal) | `GET /api/v1/site/health` | Site |

---

## ⚠️ Verified Findings (2026-09-11)

> Supersedes an earlier draft that listed 5 "gaps". Every claim was re-verified against the actual route files and runtime router introspection — **all five were false positives** (a detector that only matched inline `checkPermission('m','a')` missed `checkAnyPermission([[...]])` and router-level `router.use(gate)`). See `API_GAPS_REPORT.md` §2. No frontend blocking changes are required.

1. **`GET /api/v1/site/analytics/platform/roles`** — ✅ Fixed: `@swagger` block added (2026-09-11). 220/220 code ops documented, spec↔code parity 100%.
2. **`POST /api/v1/billing/{id}/refund`** — ✅ No change needed: protected by `checkAnyPermission([[billing,delete],[accounting,update]])` (`invoice.routes.js:444`).
3. **Wallet (2) & Installments (4)** — ✅ No change needed: protected by `checkAnyPermission([[billing,…],[installments,…]])`.
4. **`GET /api/v1/search`** — ✅ No change needed: protected by `checkPermission('patients.read')` or equivalent in route source.
5. **Platform analytics (12/13)** — ✅ No change needed: router-level `protectSite` + `authorizeSite('super_admin','admin','support')` + per-route `requireSitePermission` (`platformAnalytics.routes.js:24-25`).
