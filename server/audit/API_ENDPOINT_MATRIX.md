# Dental OS — API Endpoint Matrix (code-derived)

Generated from runtime router introspection of `server/routes/routes.js` + per-module route files. 
Every operation is listed ONCE with its canonical `/api/v1/...` path; the unversioned `/api/...` path is the same route (same v1 router is mounted twice).

**Totals:** 220 canonical operations = 101 GET + 61 POST + 23 PATCH + 19 DELETE + 16 PUT. Reachable URLs = 438 (218 ops × 2 mounts + `GET /api/health` + `GET /api/metrics`). Partition: Clinic 138, Site/Admin 80, Infra 2.

| Method | Canonical path (`/api/v1/...`) | Alias (`/api/...`) | Realm / Module | Access |
|---|---|---|---|---|
| GET | `/api/v1/accounting/commissions` | `/api/accounting/commissions` | Accounting | Staff + RBAC |
| PATCH | `/api/v1/accounting/commissions/:id` | `/api/accounting/commissions/:id` | Accounting | Staff + RBAC |
| GET | `/api/v1/accounting/day-close` | `/api/accounting/day-close` | Accounting | Staff + RBAC |
| POST | `/api/v1/accounting/day-close/close` | `/api/accounting/day-close/close` | Accounting | Staff + RBAC |
| GET | `/api/v1/accounting/day-close/list` | `/api/accounting/day-close/list` | Accounting | Staff + RBAC |
| GET | `/api/v1/accounting/drawings` | `/api/accounting/drawings` | Accounting | Staff + RBAC |
| POST | `/api/v1/accounting/drawings` | `/api/accounting/drawings` | Accounting | Staff + RBAC |
| DELETE | `/api/v1/accounting/drawings/:id` | `/api/accounting/drawings/:id` | Accounting | Staff + RBAC |
| GET | `/api/v1/accounting/expenses` | `/api/accounting/expenses` | Accounting | Staff + RBAC |
| POST | `/api/v1/accounting/expenses` | `/api/accounting/expenses` | Accounting | Staff + RBAC |
| DELETE | `/api/v1/accounting/expenses/:id` | `/api/accounting/expenses/:id` | Accounting | Staff + RBAC |
| GET | `/api/v1/accounting/journal` | `/api/accounting/journal` | Accounting | Staff + RBAC |
| GET | `/api/v1/accounting/summary` | `/api/accounting/summary` | Accounting | Staff + RBAC |
| GET | `/api/v1/appointments` | `/api/appointments` | Appointments | Staff + RBAC |
| POST | `/api/v1/appointments` | `/api/appointments` | Appointments | Staff + RBAC |
| DELETE | `/api/v1/appointments/:id` | `/api/appointments/:id` | Appointments | Staff + RBAC |
| GET | `/api/v1/appointments/:id` | `/api/appointments/:id` | Appointments | Staff + RBAC |
| PATCH | `/api/v1/appointments/:id` | `/api/appointments/:id` | Appointments | Staff + RBAC |
| PATCH | `/api/v1/appointments/:id/status` | `/api/appointments/:id/status` | Appointments | Staff + RBAC |
| GET | `/api/v1/appointments/queue` | `/api/appointments/queue` | Appointments | Staff + RBAC |
| POST | `/api/v1/appointments/queue/call-next` | `/api/appointments/queue/call-next` | Appointments | Staff + RBAC |
| POST | `/api/v1/auth/login` | `/api/auth/login` | Clinic Auth | Public (rate-limited) |
| POST | `/api/v1/auth/logout` | `/api/auth/logout` | Clinic Auth | Public (rate-limited) |
| GET | `/api/v1/auth/me` | `/api/auth/me` | Clinic Auth | Staff (JWT cookie) |
| GET | `/api/v1/auth/my-permissions` | `/api/auth/my-permissions` | Clinic Auth | Staff (JWT cookie) |
| PATCH | `/api/v1/auth/preferences` | `/api/auth/preferences` | Clinic Auth | Staff (JWT cookie) |
| POST | `/api/v1/auth/refresh` | `/api/auth/refresh` | Clinic Auth | Public (rate-limited) |
| POST | `/api/v1/auth/verify-impersonation` | `/api/auth/verify-impersonation` | Clinic Auth | Public (rate-limited) |
| GET | `/api/v1/automations` | `/api/automations` | Automations | Staff + RBAC |
| POST | `/api/v1/automations` | `/api/automations` | Automations | Staff + RBAC |
| DELETE | `/api/v1/automations/:id` | `/api/automations/:id` | Automations | Staff + RBAC |
| GET | `/api/v1/automations/:id` | `/api/automations/:id` | Automations | Staff + RBAC |
| PATCH | `/api/v1/automations/:id` | `/api/automations/:id` | Automations | Staff + RBAC |
| POST | `/api/v1/automations/:id/test` | `/api/automations/:id/test` | Automations | Staff + RBAC |
| POST | `/api/v1/automations/install-templates` | `/api/automations/install-templates` | Automations | Staff + RBAC |
| GET | `/api/v1/automations/runs` | `/api/automations/runs` | Automations | Staff + RBAC |
| GET | `/api/v1/automations/runs/:runId` | `/api/automations/runs/:runId` | Automations | Staff + RBAC |
| GET | `/api/v1/automations/triggers` | `/api/automations/triggers` | Automations | Staff + RBAC |
| GET | `/api/v1/billing` | `/api/billing` | Billing / Invoices | Staff + RBAC |
| POST | `/api/v1/billing` | `/api/billing` | Billing / Invoices | Staff + RBAC |
| GET | `/api/v1/billing/:id` | `/api/billing/:id` | Billing / Invoices | Staff + RBAC |
| PATCH | `/api/v1/billing/:id` | `/api/billing/:id` | Billing / Invoices | Staff + RBAC |
| POST | `/api/v1/billing/:id/payments` | `/api/billing/:id/payments` | Billing / Invoices | Staff + RBAC |
| POST | `/api/v1/billing/:id/refund` | `/api/billing/:id/refund` | Billing / Invoices | Staff + RBAC (any) |
| POST | `/api/v1/billing/:id/void` | `/api/billing/:id/void` | Billing / Invoices | Staff + RBAC |
| GET | `/api/v1/billing/aging` | `/api/billing/aging` | Billing / Invoices | Staff + RBAC |
| GET | `/api/v1/billing/summary` | `/api/billing/summary` | Billing / Invoices | Staff + RBAC |
| GET | `/api/v1/branches` | `/api/branches` | Branches | Staff + RBAC |
| POST | `/api/v1/branches` | `/api/branches` | Branches | Staff + RBAC |
| DELETE | `/api/v1/branches/:id` | `/api/branches/:id` | Branches | Staff + RBAC |
| PATCH | `/api/v1/branches/:id` | `/api/branches/:id` | Branches | Staff + RBAC |
| GET | `/api/v1/chat` | `/api/chat` | Chat | Staff + RBAC |
| POST | `/api/v1/chat` | `/api/chat` | Chat | Staff + RBAC |
| POST | `/api/v1/chat/channel-read` | `/api/chat/channel-read` | Chat | Staff + RBAC |
| PATCH | `/api/v1/chat/read` | `/api/chat/read` | Chat | Staff + RBAC |
| GET | `/api/v1/chat/staff` | `/api/chat/staff` | Chat | Staff + RBAC |
| GET | `/api/v1/chat/unread` | `/api/chat/unread` | Chat | Staff + RBAC |
| GET | `/api/v1/dashboard/stats` | `/api/dashboard/stats` | Dashboard | Staff + RBAC |
| DELETE | `/api/v1/emr/attachments/:filename` | `/api/emr/attachments/:filename` | EMR Attachments | Staff + RBAC |
| GET | `/api/v1/emr/attachments/:filename/download` | `/api/emr/attachments/:filename/download` | EMR Attachments | Staff + RBAC |
| POST | `/api/v1/emr/attachments/upload` | `/api/emr/attachments/upload` | EMR Attachments | Staff + RBAC |
| GET | `/api/v1/health` | `/api/health` | Infra | Public |
| GET | `/api/v1/inventory` | `/api/inventory` | Inventory | Staff + RBAC |
| POST | `/api/v1/inventory` | `/api/inventory` | Inventory | Staff + RBAC |
| DELETE | `/api/v1/inventory/:id` | `/api/inventory/:id` | Inventory | Staff + RBAC |
| GET | `/api/v1/inventory/:id` | `/api/inventory/:id` | Inventory | Staff + RBAC |
| PATCH | `/api/v1/inventory/:id` | `/api/inventory/:id` | Inventory | Staff + RBAC |
| POST | `/api/v1/inventory/:id/adjust` | `/api/inventory/:id/adjust` | Inventory | Staff + RBAC |
| GET | `/api/v1/metrics` | `/api/metrics` | Infra | Site super_admin only |
| GET | `/api/v1/patients` | `/api/patients` | Patients | Staff + RBAC |
| POST | `/api/v1/patients` | `/api/patients` | Patients | Staff + RBAC |
| DELETE | `/api/v1/patients/:id` | `/api/patients/:id` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:id` | `/api/patients/:id` | Patients | Staff + RBAC |
| PATCH | `/api/v1/patients/:id` | `/api/patients/:id` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:id/merge` | `/api/patients/:id/merge` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/clinical-notes` | `/api/patients/:patientId/clinical-notes` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:patientId/clinical-notes` | `/api/patients/:patientId/clinical-notes` | Patients | Staff + RBAC |
| DELETE | `/api/v1/patients/:patientId/clinical-notes/:noteId` | `/api/patients/:patientId/clinical-notes/:noteId` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/clinical-notes/:noteId` | `/api/patients/:patientId/clinical-notes/:noteId` | Patients | Staff + RBAC |
| PATCH | `/api/v1/patients/:patientId/clinical-notes/:noteId` | `/api/patients/:patientId/clinical-notes/:noteId` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/consents` | `/api/patients/:patientId/consents` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:patientId/consents` | `/api/patients/:patientId/consents` | Patients | Staff + RBAC |
| DELETE | `/api/v1/patients/:patientId/consents/:consentId` | `/api/patients/:patientId/consents/:consentId` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/consents/:consentId` | `/api/patients/:patientId/consents/:consentId` | Patients | Staff + RBAC |
| PATCH | `/api/v1/patients/:patientId/consents/:consentId` | `/api/patients/:patientId/consents/:consentId` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:patientId/consents/:consentId/decline` | `/api/patients/:patientId/consents/:consentId/decline` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:patientId/consents/:consentId/sign` | `/api/patients/:patientId/consents/:consentId/sign` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/consents/:consentId/verify` | `/api/patients/:patientId/consents/:consentId/verify` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:patientId/consents/:consentId/withdraw` | `/api/patients/:patientId/consents/:consentId/withdraw` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/dental-chart` | `/api/patients/:patientId/dental-chart` | Patients | Staff + RBAC |
| PATCH | `/api/v1/patients/:patientId/dental-chart` | `/api/patients/:patientId/dental-chart` | Patients | Staff + RBAC |
| PATCH | `/api/v1/patients/:patientId/dental-chart/teeth/:number` | `/api/patients/:patientId/dental-chart/teeth/:number` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/installments` | `/api/patients/:patientId/installments` | Patients | Staff + RBAC (any) |
| POST | `/api/v1/patients/:patientId/installments` | `/api/patients/:patientId/installments` | Patients | Staff + RBAC (any) |
| PATCH | `/api/v1/patients/:patientId/installments/:planId` | `/api/patients/:patientId/installments/:planId` | Patients | Staff + RBAC (any) |
| POST | `/api/v1/patients/:patientId/installments/:planId/pay` | `/api/patients/:patientId/installments/:planId/pay` | Patients | Staff + RBAC (any) |
| GET | `/api/v1/patients/:patientId/prescriptions` | `/api/patients/:patientId/prescriptions` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:patientId/prescriptions` | `/api/patients/:patientId/prescriptions` | Patients | Staff + RBAC |
| DELETE | `/api/v1/patients/:patientId/prescriptions/:rxId` | `/api/patients/:patientId/prescriptions/:rxId` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/prescriptions/:rxId` | `/api/patients/:patientId/prescriptions/:rxId` | Patients | Staff + RBAC |
| PATCH | `/api/v1/patients/:patientId/prescriptions/:rxId` | `/api/patients/:patientId/prescriptions/:rxId` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/prescriptions/:rxId/print` | `/api/patients/:patientId/prescriptions/:rxId/print` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/treatment-plans` | `/api/patients/:patientId/treatment-plans` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:patientId/treatment-plans` | `/api/patients/:patientId/treatment-plans` | Patients | Staff + RBAC |
| DELETE | `/api/v1/patients/:patientId/treatment-plans/:planId` | `/api/patients/:patientId/treatment-plans/:planId` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/treatment-plans/:planId` | `/api/patients/:patientId/treatment-plans/:planId` | Patients | Staff + RBAC |
| PATCH | `/api/v1/patients/:patientId/treatment-plans/:planId` | `/api/patients/:patientId/treatment-plans/:planId` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:patientId/treatment-plans/:planId/invoice` | `/api/patients/:patientId/treatment-plans/:planId/invoice` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:patientId/treatment-plans/:planId/items` | `/api/patients/:patientId/treatment-plans/:planId/items` | Patients | Staff + RBAC |
| DELETE | `/api/v1/patients/:patientId/treatment-plans/:planId/items/:itemId` | `/api/patients/:patientId/treatment-plans/:planId/items/:itemId` | Patients | Staff + RBAC |
| PATCH | `/api/v1/patients/:patientId/treatment-plans/:planId/items/:itemId` | `/api/patients/:patientId/treatment-plans/:planId/items/:itemId` | Patients | Staff + RBAC |
| GET | `/api/v1/patients/:patientId/wallet` | `/api/patients/:patientId/wallet` | Patients | Staff + RBAC |
| POST | `/api/v1/patients/:patientId/wallet/transactions` | `/api/patients/:patientId/wallet/transactions` | Patients | Staff + RBAC (any) |
| GET | `/api/v1/patients/duplicates` | `/api/patients/duplicates` | Patients | Staff + RBAC |
| GET | `/api/v1/roles` | `/api/roles` | Roles | Staff + RBAC |
| POST | `/api/v1/roles` | `/api/roles` | Roles | Staff + RBAC |
| DELETE | `/api/v1/roles/:id` | `/api/roles/:id` | Roles | Staff + RBAC |
| GET | `/api/v1/roles/:id` | `/api/roles/:id` | Roles | Staff + RBAC |
| PATCH | `/api/v1/roles/:id` | `/api/roles/:id` | Roles | Staff + RBAC |
| PUT | `/api/v1/roles/:id/permissions` | `/api/roles/:id/permissions` | Roles | Staff + RBAC |
| PATCH | `/api/v1/roles/:id/toggle-status` | `/api/roles/:id/toggle-status` | Roles | Staff + RBAC |
| POST | `/api/v1/roles/create-from-template` | `/api/roles/create-from-template` | Roles | Staff + RBAC |
| GET | `/api/v1/roles/matrix` | `/api/roles/matrix` | Roles | Staff + RBAC |
| GET | `/api/v1/roles/modules/list` | `/api/roles/modules/list` | Roles | Staff + RBAC |
| GET | `/api/v1/roles/templates` | `/api/roles/templates` | Roles | Staff + RBAC |
| GET | `/api/v1/search` | `/api/search` | Global Search | Staff + RBAC |
| POST | `/api/v1/site/2fa/disable` | `/api/site/2fa/disable` | Site 2FA | Site auth (module-level) |
| POST | `/api/v1/site/2fa/setup` | `/api/site/2fa/setup` | Site 2FA | Site auth (module-level) |
| GET | `/api/v1/site/2fa/status` | `/api/site/2fa/status` | Site 2FA | Site auth (module-level) |
| POST | `/api/v1/site/2fa/verify` | `/api/site/2fa/verify` | Site 2FA | Site auth (module-level) |
| POST | `/api/v1/site/2fa/verify-login` | `/api/site/2fa/verify-login` | Site 2FA | Public (rate-limited) |
| GET | `/api/v1/site/admins` | `/api/site/admins` | Site Admins | Site auth + Site role |
| POST | `/api/v1/site/admins` | `/api/site/admins` | Site Admins | Site auth + Site role + 2FA |
| DELETE | `/api/v1/site/admins/:id` | `/api/site/admins/:id` | Site Admins | Site auth + Site role + 2FA |
| GET | `/api/v1/site/admins/:id` | `/api/site/admins/:id` | Site Admins | Site auth + Site role |
| PUT | `/api/v1/site/admins/:id` | `/api/site/admins/:id` | Site Admins | Site auth + Site role + 2FA |
| PUT | `/api/v1/site/admins/:id/permissions` | `/api/site/admins/:id/permissions` | Site Admins | Site auth + Site role + 2FA |
| GET | `/api/v1/site/analytics/growth` | `/api/site/analytics/growth` | Site Analytics | Site auth + Site role |
| GET | `/api/v1/site/analytics/platform/activity` | `/api/site/analytics/platform/activity` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/appointments` | `/api/site/analytics/platform/appointments` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/doctors` | `/api/site/analytics/platform/doctors` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/financial` | `/api/site/analytics/platform/financial` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/inventory` | `/api/site/analytics/platform/inventory` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/jobs` | `/api/site/analytics/platform/jobs` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/overview` | `/api/site/analytics/platform/overview` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/patients` | `/api/site/analytics/platform/patients` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/roles` | `/api/site/analytics/platform/roles` | Site Analytics | Site auth (module-level) |
| GET | `/api/v1/site/analytics/platform/saas-billing` | `/api/site/analytics/platform/saas-billing` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/security` | `/api/site/analytics/platform/security` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/treatments` | `/api/site/analytics/platform/treatments` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/platform/usage` | `/api/site/analytics/platform/usage` | Site Analytics | Site auth + Site permission |
| GET | `/api/v1/site/analytics/stats` | `/api/site/analytics/stats` | Site Analytics | Site auth + Site role |
| GET | `/api/v1/site/analytics/usage/:tenantId` | `/api/site/analytics/usage/:tenantId` | Site Analytics | Site auth + Site role |
| GET | `/api/v1/site/audit-logs` | `/api/site/audit-logs` | Site Audit | Site auth + Site role |
| GET | `/api/v1/site/audit-logs/actions` | `/api/site/audit-logs/actions` | Site Audit | Site auth + Site role |
| GET | `/api/v1/site/audit-logs/verify` | `/api/site/audit-logs/verify` | Site Audit | Site auth + Site role |
| POST | `/api/v1/site/auth/create` | `/api/site/auth/create` | Site Auth | Site auth + Site role |
| POST | `/api/v1/site/auth/login` | `/api/site/auth/login` | Site Auth | Public (rate-limited) |
| POST | `/api/v1/site/auth/logout` | `/api/site/auth/logout` | Site Auth | Site auth (module-level) |
| GET | `/api/v1/site/auth/me` | `/api/site/auth/me` | Site Auth | Site auth (module-level) |
| POST | `/api/v1/site/auth/recover/initiate` | `/api/site/auth/recover/initiate` | Site Auth | Public (rate-limited) |
| POST | `/api/v1/site/auth/recover/verify` | `/api/site/auth/recover/verify` | Site Auth | Public (rate-limited) |
| POST | `/api/v1/site/auth/refresh` | `/api/site/auth/refresh` | Site Auth | Public (rate-limited) |
| GET | `/api/v1/site/backups` | `/api/site/backups` | Site Backups | Site auth + Site role |
| POST | `/api/v1/site/backups` | `/api/site/backups` | Site Backups | Site auth + Site role + 2FA |
| GET | `/api/v1/site/backups/:id` | `/api/site/backups/:id` | Site Backups | Site auth + Site role |
| GET | `/api/v1/site/branches` | `/api/site/branches` | Site Branches | Site auth + Site role |
| POST | `/api/v1/site/branches` | `/api/site/branches` | Site Branches | Site auth + Site role + 2FA |
| DELETE | `/api/v1/site/branches/:id` | `/api/site/branches/:id` | Site Branches | Site auth + Site role + 2FA |
| GET | `/api/v1/site/branches/:id` | `/api/site/branches/:id` | Site Branches | Site auth + Site role |
| PUT | `/api/v1/site/branches/:id` | `/api/site/branches/:id` | Site Branches | Site auth + Site role + 2FA |
| GET | `/api/v1/site/error-logs` | `/api/site/error-logs` | Site Error Logs | Site auth + Site role |
| PATCH | `/api/v1/site/error-logs/:id/resolve` | `/api/site/error-logs/:id/resolve` | Site Error Logs | Site auth + Site role |
| GET | `/api/v1/site/error-logs/stats` | `/api/site/error-logs/stats` | Site Error Logs | Site auth + Site role |
| GET | `/api/v1/site/feature-flags/:tenantId` | `/api/site/feature-flags/:tenantId` | Site Feature Flags | Site auth + Site role |
| PUT | `/api/v1/site/feature-flags/:tenantId/modules` | `/api/site/feature-flags/:tenantId/modules` | Site Feature Flags | Site auth + Site role + 2FA |
| PUT | `/api/v1/site/feature-flags/:tenantId/toggle` | `/api/site/feature-flags/:tenantId/toggle` | Site Feature Flags | Site auth + Site role + 2FA |
| GET | `/api/v1/site/health` | `/api/site/health` | Site Health | Site auth + Site role |
| POST | `/api/v1/site/impersonation/end` | `/api/site/impersonation/end` | Site Impersonation | Site auth + Site role + 2FA |
| POST | `/api/v1/site/impersonation/start` | `/api/site/impersonation/start` | Site Impersonation | Site auth + Site role + 2FA |
| GET | `/api/v1/site/perf` | `/api/site/perf` | Platform Performance | Site auth + Site role |
| POST | `/api/v1/site/perf/reset` | `/api/site/perf/reset` | Platform Performance | Site auth + Site role |
| GET | `/api/v1/site/plans` | `/api/site/plans` | Platform Plans | Site auth + Site role |
| POST | `/api/v1/site/plans` | `/api/site/plans` | Platform Plans | Site auth + Site role + 2FA |
| DELETE | `/api/v1/site/plans/:id` | `/api/site/plans/:id` | Platform Plans | Site auth + Site role + 2FA |
| GET | `/api/v1/site/plans/:id` | `/api/site/plans/:id` | Platform Plans | Site auth + Site role |
| PUT | `/api/v1/site/plans/:id` | `/api/site/plans/:id` | Platform Plans | Site auth + Site role + 2FA |
| GET | `/api/v1/site/platform` | `/api/site/platform` | Platform Settings | Site auth + Site role |
| PUT | `/api/v1/site/platform` | `/api/site/platform` | Platform Settings | Site auth + Site role + 2FA |
| PUT | `/api/v1/site/quarantine/:tenantId` | `/api/site/quarantine/:tenantId` | Site Quarantine | Site auth + Site role + 2FA |
| PUT | `/api/v1/site/quarantine/:tenantId/remove` | `/api/site/quarantine/:tenantId/remove` | Site Quarantine | Site auth + Site role + 2FA |
| GET | `/api/v1/site/quarantine/checks` | `/api/site/quarantine/checks` | Site Quarantine | Site auth + Site role |
| GET | `/api/v1/site/subscriptions` | `/api/site/subscriptions` | Site Subscriptions | Site auth + Site role |
| PUT | `/api/v1/site/subscriptions/:id` | `/api/site/subscriptions/:id` | Site Subscriptions | Site auth + Site role + 2FA |
| POST | `/api/v1/site/subscriptions/:tenantId/payment` | `/api/site/subscriptions/:tenantId/payment` | Site Subscriptions | Site auth + Site role + 2FA |
| GET | `/api/v1/site/subscriptions/revenue` | `/api/site/subscriptions/revenue` | Site Subscriptions | Site auth + Site role |
| GET | `/api/v1/site/tenants` | `/api/site/tenants` | Site Tenants | Site auth + Site role |
| POST | `/api/v1/site/tenants` | `/api/site/tenants` | Site Tenants | Site auth + Site role + 2FA |
| DELETE | `/api/v1/site/tenants/:id` | `/api/site/tenants/:id` | Site Tenants | Site auth + Site role + 2FA |
| GET | `/api/v1/site/tenants/:id` | `/api/site/tenants/:id` | Site Tenants | Site auth + Site role |
| PUT | `/api/v1/site/tenants/:id` | `/api/site/tenants/:id` | Site Tenants | Site auth + Site role + 2FA |
| PUT | `/api/v1/site/tenants/:id/activate` | `/api/site/tenants/:id/activate` | Site Tenants | Site auth + Site role + 2FA |
| PUT | `/api/v1/site/tenants/:id/archive` | `/api/site/tenants/:id/archive` | Site Tenants | Site auth + Site role + 2FA |
| GET | `/api/v1/site/tenants/:id/stats` | `/api/site/tenants/:id/stats` | Site Tenants | Site auth + Site role |
| PUT | `/api/v1/site/tenants/:id/suspend` | `/api/site/tenants/:id/suspend` | Site Tenants | Site auth + Site role + 2FA |
| GET | `/api/v1/site/users/by-tenant/:tenantId` | `/api/site/users/by-tenant/:tenantId` | Site Users | Site auth + Site role |
| GET | `/api/v1/users` | `/api/users` | Users | Staff + RBAC |
| POST | `/api/v1/users` | `/api/users` | Users | Staff + RBAC |
| DELETE | `/api/v1/users/:id` | `/api/users/:id` | Users | Staff + RBAC |
| GET | `/api/v1/users/:id` | `/api/users/:id` | Users | Staff + RBAC |
| PATCH | `/api/v1/users/:id` | `/api/users/:id` | Users | Staff + RBAC |
| PATCH | `/api/v1/users/:id/toggle-active` | `/api/users/:id/toggle-active` | Users | Staff + RBAC |
| GET | `/api/v1/users/doctors` | `/api/users/doctors` | Users | Staff + RBAC |
| POST | `/api/v1/whatsapp/connect` | `/api/whatsapp/connect` | WhatsApp | Staff + RBAC |
| POST | `/api/v1/whatsapp/disconnect` | `/api/whatsapp/disconnect` | WhatsApp | Staff + RBAC |
| GET | `/api/v1/whatsapp/qr` | `/api/whatsapp/qr` | WhatsApp | Staff + RBAC |
| GET | `/api/v1/whatsapp/settings` | `/api/whatsapp/settings` | WhatsApp | Staff + RBAC |
| PUT | `/api/v1/whatsapp/settings` | `/api/whatsapp/settings` | WhatsApp | Staff + RBAC |
| GET | `/api/v1/whatsapp/status` | `/api/whatsapp/status` | WhatsApp | Staff + RBAC |
| POST | `/api/v1/whatsapp/test` | `/api/whatsapp/test` | WhatsApp | Staff + RBAC |

## Per-module operation counts

- **Patients**: 45
- **Site Analytics**: 16
- **Accounting**: 13
- **Roles**: 11
- **Automations**: 10
- **Billing / Invoices**: 9
- **Site Tenants**: 9
- **Appointments**: 8
- **Clinic Auth**: 7
- **Site Auth**: 7
- **Users**: 7
- **WhatsApp**: 7
- **Chat**: 6
- **Inventory**: 6
- **Site Admins**: 6
- **Site 2FA**: 5
- **Site Branches**: 5
- **Platform Plans**: 5
- **Branches**: 4
- **Site Subscriptions**: 4
- **EMR Attachments**: 3
- **Site Audit**: 3
- **Site Backups**: 3
- **Site Error Logs**: 3
- **Site Feature Flags**: 3
- **Site Quarantine**: 3
- **Infra**: 2
- **Site Impersonation**: 2
- **Platform Performance**: 2
- **Platform Settings**: 2
- **Dashboard**: 1
- **Global Search**: 1
- **Site Health**: 1
- **Site Users**: 1
