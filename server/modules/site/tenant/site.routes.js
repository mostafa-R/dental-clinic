import { Router } from "express";
import { audit } from "../../../middleware/audit.js";
import { require2fa, require2faSuperAdmin } from "../../../middleware/require2fa.js";
import { authorizeSite, protectSite } from "../../../middleware/siteAuth.js";
import { validate } from "../../../middleware/validate.js";
import {
  activateTenant,
  archiveTenant,
  createTenant,
  deleteTenant,
  getTenant,
  getTenants,
  getTenantStats,
  suspendTenant,
  updateTenant,
} from "./site.controller.js";
import { tenantSchema, tenantUpdateSchema } from "./site.validator.js";

const router = Router();

// All routes require site admin authentication
router.use(protectSite);

// Read operations - no 2FA required
router.get("/", authorizeSite("super_admin", "admin", "support"), getTenants);

router.get(
  "/:id/stats",
  authorizeSite("super_admin", "admin", "support"),
  getTenantStats,
);

router.get("/:id", authorizeSite("super_admin", "admin", "support"), getTenant);

// Create/Update - require 2FA for admin+ roles
router.post(
  "/",
  authorizeSite("super_admin", "admin"),
  require2fa,
  validate(tenantSchema),
  audit('tenant.create', 'tenant'),
  createTenant,
);

router.put(
  "/:id",
  authorizeSite("super_admin", "admin"),
  require2fa,
  validate(tenantUpdateSchema),
  audit('tenant.update', 'tenant'),
  updateTenant,
);

// Suspend - sensitive operation, requires 2FA
router.put(
  "/:id/suspend",
  authorizeSite("super_admin", "admin"),
  require2fa,
  audit('tenant.suspend', 'tenant'),
  suspendTenant,
);

// Activate - sensitive operation, requires 2FA
router.put(
  "/:id/activate",
  authorizeSite("super_admin", "admin"),
  require2fa,
  audit('tenant.activate', 'tenant'),
  activateTenant,
);

// Archive - destructive, super_admin only, requires 2FA
router.put(
  "/:id/archive",
  authorizeSite("super_admin"),
  require2faSuperAdmin,
  audit('tenant.archive', 'tenant'),
  archiveTenant,
);

// Delete - most destructive, super_admin only, requires 2FA
router.delete(
  "/:id",
  authorizeSite("super_admin"),
  require2faSuperAdmin,
  audit('tenant.delete', 'tenant'),
  deleteTenant,
);

export default router;
