import { Router } from "express";

// Core application routes
import authRoutes from "../modules/auth/auth.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import branchRoutes from "../modules/users/branch.routes.js";
import chatRoutes from "../modules/chat/chat.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import patientRoutes from "../modules/patients/patient.routes.js";
import appointmentRoutes from "../modules/appointments/appointment.routes.js";
import billingRoutes from "../modules/billing/invoice.routes.js";
import walletRoutes from "../modules/patients/wallet.routes.js";
import accountRoutes from "../modules/accounting/accounting.routes.js";
import inventoryRoutes from "../modules/inventory/inventory.routes.js";
import roleRoutes from "../modules/users/role.routes.js";
import installmentPlanRoutes from "../modules/patients/installmentPlan.routes.js";
import prescriptionRoutes from "../modules/emr/prescription.routes.js";
import clinicalNoteRoutes from "../modules/emr/clinicalNote.routes.js";
import attachmentRoutes from "../modules/emr/attachment.routes.js";
import dentalChartRoutes from "../modules/emr/dentalChart.routes.js";
import treatmentPlanRoutes from "../modules/emr/treatmentPlan.routes.js";
import searchRoutes from "../modules/search/search.routes.js";
import whatsappRoutes from "../modules/whatsapp/whatsapp.routes.js";

// Platform routes
import platformPlanRoutes from "../modules/platform/plan.routes.js";
import platformSettingRoutes from "../modules/platform/platformSetting.routes.js";

// Site routes
import siteAuthRoutes from "../modules/site/auth/siteAuth.routes.js";
import siteBranchRoutes from "../modules/site/tenant/siteBranch.routes.js";
import siteUserRoutes from "../modules/site/tenant/siteUser.routes.js";
import siteRoutes from "../modules/site/tenant/site.routes.js";
import siteAdminRoutes from "../modules/site/tenant/siteAdmin.routes.js";
import siteAnalyticsRoutes from "../modules/site/analytics/siteAnalytics.routes.js";
import site2faRoutes from "../modules/site/auth/site2fa.routes.js";
import siteFeatureFlagRoutes from "../modules/site/featureFlag/siteFeatureFlag.routes.js";
import siteHealthRoutes from "../modules/site/siteHealth.routes.js";
import siteImpersonationRoutes from "../modules/site/auth/siteImpersonation.routes.js";
import siteQuarantineRoutes from "../modules/site/quarantine/siteQuarantine.routes.js";
import siteErrorLogRoutes from "../modules/site/errorLog/siteErrorLog.routes.js";
import siteSubscriptionRoutes from "../modules/site/subscription/siteSubscription.routes.js";
import siteBackupRoutes from "../modules/site/backup/siteBackup.routes.js";
import sitePerfRoutes from "./sitePerf.routes.js";
import siteAuditRoutes from "../modules/site/audit/siteAudit.routes.js";

const router = Router();

// --- Health check (unversioned, always at /api/health) ---
router.get("/health", async (_req, res) => {
  const checks = { status: "ok", timestamp: new Date().toISOString() };

  try {
    const mongoose = await import("mongoose");
    checks.mongodb = mongoose.default.connection.readyState === 1 ? "connected" : "disconnected";
  } catch {
    checks.mongodb = "error";
  }

  try {
    const { getRedis } = await import("../config/redis.js");
    const redis = getRedis();
    checks.redis = redis && redis.status === "ready" ? "connected" : "disconnected";
  } catch {
    checks.redis = "unavailable";
  }

  const statusCode = checks.mongodb === "connected" ? 200 : 503;
  res.status(statusCode).json(checks);
});

// --- v1 API routes ---
const v1 = Router();

// Core application routes
v1.use("/auth", authRoutes);
v1.use("/users", userRoutes);
v1.use("/branches", branchRoutes);
v1.use("/dashboard", dashboardRoutes);
v1.use("/patients", patientRoutes);
v1.use("/appointments", appointmentRoutes);
v1.use("/billing", billingRoutes);

v1.use("/patients/:patientId/dental-chart", dentalChartRoutes);
v1.use("/patients/:patientId/treatment-plans", treatmentPlanRoutes);
v1.use("/patients/:patientId/prescriptions", prescriptionRoutes);
v1.use("/patients/:patientId/clinical-notes", clinicalNoteRoutes);
v1.use("/emr/attachments", attachmentRoutes);

v1.use("/accounting", accountRoutes);
v1.use("/inventory", inventoryRoutes);
v1.use("/roles", roleRoutes);
v1.use("/chat", chatRoutes);
v1.use("/search", searchRoutes);
v1.use("/patients/:patientId/wallet", walletRoutes);
v1.use("/patients/:patientId/installments", installmentPlanRoutes);
v1.use("/whatsapp", whatsappRoutes);

// Site routes
v1.use("/site/auth", siteAuthRoutes);
v1.use("/site/branches", siteBranchRoutes);
v1.use("/site/users", siteUserRoutes);
v1.use("/site/tenants", siteRoutes);
v1.use("/site/admins", siteAdminRoutes);
v1.use("/site/plans", platformPlanRoutes);
v1.use("/site/platform", platformSettingRoutes);
v1.use("/site/analytics", siteAnalyticsRoutes);
v1.use("/site/2fa", site2faRoutes);
v1.use("/site/feature-flags", siteFeatureFlagRoutes);
v1.use("/site/health", siteHealthRoutes);
v1.use("/site/impersonation", siteImpersonationRoutes);
v1.use("/site/quarantine", siteQuarantineRoutes);
v1.use("/site/error-logs", siteErrorLogRoutes);
v1.use("/site/subscriptions", siteSubscriptionRoutes);
v1.use("/site/backups", siteBackupRoutes);
v1.use("/site/perf", sitePerfRoutes);
v1.use("/site/audit-logs", siteAuditRoutes);

// Mount versioned router
router.use("/v1", v1);

// Backward-compatible unversioned routes (redirect to v1)
router.use("/", v1);

export default router;
