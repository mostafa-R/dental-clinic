import { Router } from "express";
import { audit } from "../../../middleware/audit.js";
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
import { tenantSchema } from "./site.validator.js";

const router = Router();

// All routes require site admin authentication
router.use(protectSite);

// Tenant routes
router.get("/", authorizeSite("super_admin", "admin", "support"), getTenants);

router.get("/:id", authorizeSite("super_admin", "admin", "support"), getTenant);

router.get(
  "/:id/stats",
  authorizeSite("super_admin", "admin", "support"),
  getTenantStats,
);

router.post(
  "/",
  authorizeSite("super_admin", "admin"),
  validate(tenantSchema),
  audit('tenant.create', 'tenant'),
  createTenant,
);

router.put(
  "/:id",
  authorizeSite("super_admin", "admin"),
  validate(tenantSchema),
  audit('tenant.update', 'tenant'),
  updateTenant,
);

router.put(
  "/:id/suspend",
  authorizeSite("super_admin", "admin"),
  audit('tenant.suspend', 'tenant'),
  suspendTenant,
);

router.put(
  "/:id/activate",
  authorizeSite("super_admin", "admin"),
  audit('tenant.activate', 'tenant'),
  activateTenant,
);

router.put(
  "/:id/archive",
  authorizeSite("super_admin"),
  audit('tenant.archive', 'tenant'),
  archiveTenant,
);

router.delete(
  "/:id",
  authorizeSite("super_admin"),
  audit('tenant.delete', 'tenant'),
  deleteTenant,
);

export default router;
