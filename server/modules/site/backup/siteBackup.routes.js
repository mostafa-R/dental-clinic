import { Router } from "express";
import { require2faSuperAdmin } from "../../../middleware/require2fa.js";
import { authorizeSite, protectSite } from "../../../middleware/siteAuth.js";
import { getBackup, getBackups, triggerManualBackup } from "./siteBackup.controller.js";

const router = Router();

router.use(protectSite);

// Read operations - no 2FA required
router.get("/", authorizeSite("super_admin", "admin"), getBackups);
router.get("/:id", authorizeSite("super_admin", "admin"), getBackup);

// Write operations - require 2FA
router.post("/", authorizeSite("super_admin"), require2faSuperAdmin, triggerManualBackup);

export default router;
