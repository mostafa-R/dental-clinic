import { Router } from "express";

import accountingRoutes from "./accounting.routes.js";
import appointmentRoutes from "./appointment.routes.js";
import authRoutes from "./auth.routes.js";
import branchRoutes from "./branch.routes.js";
import chatRoutes from "./chat.routes.js";
import clinicalNoteRoutes from "./clinicalNote.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import dentalChartRoutes from "./dentalChart.routes.js";
import inventoryRoutes from "./inventory.routes.js";
import billingRoutes from "./invoice.routes.js";
import patientRoutes from "./patient.routes.js";
import planRoutes from "./plan.routes.js";
import platformSettingRoutes from "./platformSetting.routes.js";
import prescriptionRoutes from "./prescription.routes.js";
import roleRoutes from "./role.routes.js";
import searchRoutes from "./search.routes.js";
import siteBranchRoutes from "./siteBranch.routes.js";
import siteRoutes from "./site.routes.js";
import siteAdminRoutes from "./siteAdmin.routes.js";
import siteAnalyticsRoutes from "./siteAnalytics.routes.js";
import siteAuthRoutes from "./siteAuth.routes.js";
import siteAuditRoutes from "./siteAudit.routes.js";
import site2faRoutes from "./site2fa.routes.js";
import siteFeatureFlagRoutes from "./siteFeatureFlag.routes.js";
import siteHealthRoutes from "./siteHealth.routes.js";
import siteImpersonationRoutes from "./siteImpersonation.routes.js";
import siteQuarantineRoutes from "./siteQuarantine.routes.js";
import siteErrorLogRoutes from "./siteErrorLog.routes.js";
import siteSubscriptionRoutes from "./siteSubscription.routes.js";
import siteBackupRoutes from "./siteBackup.routes.js";
import sitePerfRoutes from "./sitePerf.routes.js";
import siteUserRoutes from "./siteUser.routes.js";
import treatmentPlanRoutes from "./treatmentPlan.routes.js";
import userRoutes from "./user.routes.js";
import walletRoutes from "./wallet.routes.js";
import whatsappRoutes from "./whatsapp.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, data: { message: "Dental OS API is running" } });
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
