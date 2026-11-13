const fs = require('fs');
const block = `
---

## Phase 4 — Feature Completeness Audit (2026-11-12, static/code + targeted automated tests)

Evidence sources: repository source inspection, backend routes/controllers/validators/models/constants, Client routes/slices/pages/components, and focused Phase 4 Client tests added in this phase. Runtime browser/manual/production verification not executed in this environment.

| Area | Backend (existing, reused) | Frontend status | Permissions / isolation | Tests | Notes / blockers |
|---|---|---|---|---|---|
| Consent Management UI (patient-scoped EMR tab) | \`GET/POST/PATCH/DELETE /api/v1/patients/:patientId/consents\`, \`/:id\`, \`/:id/sign\`, \`/:id/send-otp\`, \`/:id/decline\`, \`/:id/withdraw\`, \`/:id/verify\` (\`server/modules/emr/consent.*\`, \`consents:read/create/update/delete\`, patient/tenant/branch scoping, realtime emits \`consent:*\`) | **Implemented, not fully runtime-tested** | Client actions gated by \`consents\` read/create/update/delete permissions; patient-scoped API paths; realtime listeners reconcile by refetch (no duplicate listener registration beyond hook lifecycle); loading/empty/error/success states, details/verify views, mutation confirmation/error handling, form preserved on save failure | \`Client/src/features/emr/ConsentTab.phase4.test.jsx\` (listing/scoping, create success, create failure/no false-success/form preserved, decline action) — **PASSED (4 tests, 2026-11-12)** | No backend contract changes. \`expiresAt\` input uses local datetime converted to ISO for existing validator. Signature methods limited to backend-supported methods; advanced drawn/photo capture UX not added beyond supported payload fields. |
| Automation Management UI | \`GET/POST/PATCH/DELETE /api/v1/automations\`, \`/triggers\`, \`/install-templates\`, \`/:id/test\`, \`/runs\`, \`/runs/:runId\` (\`server/modules/automation/*\`, \`server/constants/automations.js\`, \`automations:*\` permissions) | **Implemented, not fully runtime-tested** | New Client route \`/automations\` (\`module: automations\`) behind ModuleGuard/permission model; CRUD/install/test/runs gated by automations permissions; tenant/branch scoping delegated to existing backend; states/error handling, no false-success toasts on failure, duplicate submit guarded by in-flight/busy flags, form values preserved on mutation failure, server-state reconciled via refetch; existing global \`automation:notify\` listener preserved (not duplicated) | \`Client/src/features/automations/automationSlice.phase4.test.js\` (list/create/update/delete/install/test/runs success & load-failure handling) — **PASSED (4 tests, 2026-11-12)** | Conditions/actions edited as JSON arrays to match existing backend contract without inventing fields; richer visual no-code builder remains out of scope. |
| Attachments Management UI (EMR, existing surfaces) | \`POST /api/v1/emr/attachments/upload\`, \`GET /api/v1/emr/attachments/:filename/download\`, \`DELETE /api/v1/emr/attachments/:filename\` (\`server/modules/emr/attachment.routes.js\`, encrypted storage, patient/tenant/branch ownership checks). Note attachments also embedded in clinical notes. | **Partially implemented, not fully runtime-tested** (enhanced existing flows) | Upload requires patient context in existing EMR flows; download/delete use authorized backend routes; delete confirmation added in clinical note attachment management; validation/progress already supported in \`MedicalFileUpload\`/\`emrApi\`; improved metadata/filename display and error surfacing in existing note form/timeline contexts. No storage paths/secrets exposed beyond authorized download URLs. | \`Client/src/features/emr/emrApi.phase4.test.js\` (upload with patient/progress wiring, delete encoding) — **PASSED (2 tests, 2026-11-12)**; UI behavior covered by static inspection. | **Blocker (missing backend capability, no unapproved endpoint added):** no patient-scoped \`MedicalAttachment\` listing endpoint found. Standalone patient attachment index/list across notes/records cannot be fully implemented from existing backend; current support is upload/download/delete and note-embedded attachment management/display. |

### Phase 4 distinction summary
- **Implemented and tested (targeted automated, PASS):** consent patient-scoped listing & key mutations UI logic; automation slice state/CRUD/test/runs handling; attachment API upload/delete wiring.
- **Implemented but not fully tested:** Automation Management page end-to-end UI behavior, consent realtime/manual UX, attachment enhanced UI flows.
- **Partially implemented:** Standalone patient-scoped attachment listing/management beyond existing note-embedded + upload/download/delete APIs.
- **Blocked by missing backend capability:** Global/patient attachment inventory/list endpoint for \`MedicalAttachment\`.
`;
if (!fs.readFileSync('features.txt','utf8').includes('## Phase 4 — Feature Completeness Audit')) {
  fs.appendFileSync('features.txt', block, 'utf8');
  console.log('appended');
} else {
  console.log('already present');
}
