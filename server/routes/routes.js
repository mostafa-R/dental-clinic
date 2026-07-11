import { Router } from "express";

import accountingRoutes from "../modules/accounting/accounting.routes.js";
import appointmentRoutes from "../modules/appointments/appointment.routes.js";
import authRoutes from "../modules/auth/auth.routes.js";
import branchRoutes from "../modules/users/branch.routes.js";
import chatRoutes from "../modules/chat/chat.routes.js";
import clinicalNoteRoutes from "../modules/emr/clinicalNote.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import dentalChartRoutes from "../modules/emr/dentalChart.routes.js";
import inventoryRoutes from "../modules/inventory/inventory.routes.js";
import installmentPlanRoutes from "../modules/patients/installmentPlan.routes.js";
import billingRoutes from "../modules/billing/invoice.routes.js";
import patientRoutes from "../modules/patients/patient.routes.js";
import planRoutes from "../modules/platform/plan.routes.js";
import platformSettingRoutes from "../modules/platform/platformSetting.routes.js";
import prescriptionRoutes from "../modules/emr/prescription.routes.js";
import roleRoutes from "../modules/users/role.routes.js";
import searchRoutes from "../modules/search/search.routes.js";
import siteBranchRoutes from "../modules/site/tenant/siteBranch.routes.js";
import siteRoutes from "../modules/site/tenant/site.routes.js";
import siteAdminRoutes from "../modules/site/tenant/siteAdmin.routes.js";
import siteAnalyticsRoutes from "../modules/site/analytics/siteAnalytics.routes.js";
import siteAuthRoutes from "../modules/site/auth/siteAuth.routes.js";
import siteAuditRoutes from "../modules/site/audit/siteAudit.routes.js";
import site2faRoutes from "../modules/site/auth/site2fa.routes.js";
import siteFeatureFlagRoutes from "../modules/site/featureFlag/siteFeatureFlag.routes.js";
import siteHealthRoutes from "../modules/site/siteHealth.routes.js";
import siteImpersonationRoutes from "../modules/site/auth/siteImpersonation.routes.js";
import siteQuarantineRoutes from "../modules/site/quarantine/siteQuarantine.routes.js";
import siteErrorLogRoutes from "../modules/site/errorLog/siteErrorLog.routes.js";
import siteSubscriptionRoutes from "../modules/site/subscription/siteSubscription.routes.js";
import siteBackupRoutes from "../modules/site/backup/siteBackup.routes.js";
import sitePerfRoutes from "./sitePerf.routes.js";
import siteUserRoutes from "../modules/site/tenant/siteUser.routes.js";
import treatmentPlanRoutes from "../modules/emr/treatmentPlan.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import walletRoutes from "../modules/patients/wallet.routes.js";
import whatsappRoutes from "../modules/whatsapp/whatsapp.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.type("text/plain").send("Dental OS API is running");
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/branches", branchRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/patients", patientRoutes);
router.use("/appointments", appointmentRoutes);
router.use("/billing", billingRoutes);

router.use("/patients/:patientId/dental-chart", dentalChartRoutes);
router.use("/patients/:patientId/treatment-plans", treatmentPlanRoutes);
router.use("/patients/:patientId/prescriptions", prescriptionRoutes);
router.use("/patients/:patientId/clinical-notes", clinicalNoteRoutes);

router.use("/accounting", accountingRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/roles", roleRoutes);
router.use("/chat", chatRoutes);
router.use("/search", searchRoutes);
router.use("/patients/:patientId/wallet", walletRoutes);
router.use("/patients/:patientId/installments", installmentPlanRoutes);
router.use("/whatsapp", whatsappRoutes);

router.use("/site/auth", siteAuthRoutes);
router.use("/site/branches", siteBranchRoutes);
router.use("/site/tenants", siteRoutes);
router.use("/site/admins", siteAdminRoutes);
router.use("/site/plans", planRoutes);
router.use("/site/platform", platformSettingRoutes);
router.use("/site/analytics", siteAnalyticsRoutes);
router.use("/site/audit-logs", siteAuditRoutes);
router.use("/site/2fa", site2faRoutes);
router.use("/site/feature-flags", siteFeatureFlagRoutes);
router.use("/site/health", siteHealthRoutes);
router.use("/site/impersonation", siteImpersonationRoutes);
router.use("/site/quarantine", siteQuarantineRoutes);
router.use("/site/error-logs", siteErrorLogRoutes);
router.use("/site/subscriptions", siteSubscriptionRoutes);
router.use("/site/backups", siteBackupRoutes);
router.use("/site/perf", sitePerfRoutes);
router.use("/site/users", siteUserRoutes);

export default router;
